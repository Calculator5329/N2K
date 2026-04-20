/**
 * Unified N2K solver.
 *
 * One brute-force enumeration that handles every arity (3..5), every
 * dice value (negative or positive), and every mode preset by reading
 * caps and weights off a {@link Mode}. Replaces v1's separate
 * `solver.ts` (3-arity standard) + `advancedSolver.ts` (3..5-arity
 * Æther) entirely.
 *
 * Hot-loop design (preserved from v1 advanced solver):
 *   - Bases are precomputed per-die-value, not per-die-position, so
 *     duplicate dice share a base table.
 *   - Operator tuples and exponent tuples are enumerated as nested
 *     loops with `safeMagnitude` short-circuit on the partial sum.
 *   - The inner loop reuses `values: number[]` and `exps: number[]`
 *     across iterations; arrays are sliced only when a candidate
 *     beats the current best for its target.
 *   - Difficulty is computed inline, with `AllBasesCache` shared
 *     across all candidates from one dice tuple.
 */
import { FLOAT_EQ_EPSILON, OP, depowerDice } from "../core/constants.js";
import type {
  Arity,
  BulkSolution,
  Mode,
  NEquation,
  Operator,
} from "../core/types.js";
import {
  allOpTuples,
  distinctPermutations,
  unorderedSubsets,
} from "./arithmetic.js";
import {
  buildAllBasesCache,
  difficultyOfEquation,
  type AllBasesCache,
} from "./difficulty.js";

// ---------------------------------------------------------------------------
//  Difficulty lower bound (used by branch-and-bound)
// ---------------------------------------------------------------------------

/**
 * The minimum possible difficulty for **any** equation built from
 * `dice` (in any order, with any exps and ops) hitting `total`.
 *
 * Soundness contract: `difficultyLowerBound(dice, total, mode) ≤
 * difficultyOfEquation(eq, mode)` for **every** valid `eq` over
 * those dice that totals `total`. The B&B pruner relies on this
 * inequality, so getting it wrong makes the solver miss real
 * easiest-equations.
 *
 * Construction (post-processing chain, mirroring the heuristic):
 *
 *   1. **Lower-bound the raw subtotal.** Sum the per-tuple-fixed
 *      positive terms (`totalMagnitude`, `arityPenalty`,
 *      `negativeBasePenalty`) and **subtract the maximum possible
 *      bonuses** from `^0` and `^1` exponents. Worst case: every
 *      die uses `^0` (max zero-exponent bonus = N) AND every die
 *      uses `^1` (max one-exponent bonus = N) — the two are
 *      mutually exclusive but for a *lower bound* we can pretend
 *      both fire at full strength.
 *
 *   2. **Apply tenFlag.** If the dice include any value with
 *      `|d| = 10`, the heuristic divides by `tenFlagDivisor` and
 *      subtracts `tenFlagOffset` whenever a `*` involving 10 fires.
 *      Lower-bound assumption: it always fires.
 *
 *   3. **Floor at 0.** The heuristic clamps negative scores to 0.
 *
 *   4. **Round to 2 decimals.** `difficultyOfEquation` runs the raw
 *      score through `round(x*100)/100`. Subtract another 0.005 to
 *      cover the worst-case rounding direction.
 *
 * Cheap (O(N)).
 */
export function difficultyLowerBound(
  dice: readonly number[],
  total: number,
  mode: Mode,
): number {
  const w = mode.difficulty;
  const N = dice.length;

  // (1) Optimistic raw subtotal.
  const totalMagnitude = Math.sqrt(Math.abs(total)) * w.totalSqrtWeight;
  const extraArity = Math.max(0, N - 3);
  const arityTerm = extraArity * w.arityPenaltyPerExtraDice;
  let negCount = 0;
  let hasTen = false;
  for (const d of dice) {
    if (d < 0) negCount += 1;
    if (Math.abs(d) === 10) hasTen = true;
  }
  const negTerm = negCount * w.negativeBasePenaltyPerCount;

  // Max possible bonus from "free" exponents (^0 or ^1). Per die,
  // bonus ≤ max(zeroBonus, oneBonus) — a single die can be ^0 OR
  // ^1 but not both, so taking the max is sound. We assume every
  // die can simultaneously be "free" (the maximally generous case
  // for the equation builder); a tighter `maxFreeDice < N` was
  // attempted via an information-theoretic argument on `|total|`,
  // but the heuristic's downstream `tenFlag`/`max(0, …)` clamps
  // saturate non-linearly and the tighter estimate violated
  // soundness for cells where `actualDifficulty ≈ 0`. Soundness
  // matters more than tightness here — the LB only has to be a
  // valid floor; the per-step magnitude and reach-based prunes
  // inside `findEasiestForTuple` carry most of the speedup load.
  const perDieBonus = Math.max(
    w.zeroExponentPenaltyPerCount,
    w.oneExponentPenaltyPerCount,
  );
  const maxBonus = N * perDieBonus;
  let raw = totalMagnitude + arityTerm + negTerm - maxBonus;

  // (2) tenFlag: if it could fire, assume it does. (Sound: tenFlag
  // can only *lower* the score for small raw values, which is what
  // we want for an LB.)
  if (hasTen && w.tenFlagDivisor > 0) {
    raw = (raw - w.tenFlagOffset) / w.tenFlagDivisor;
  }

  // (3) Floor at 0 (matches the heuristic's clamp).
  if (raw < 0) raw = 0;

  // (4) Round-to-2 slack so floating drift doesn't violate
  // soundness against the rounded `final`.
  return raw - 0.005;
}

// ---------------------------------------------------------------------------
//  Public types
// ---------------------------------------------------------------------------

export interface SweepOptions {
  /** Override the mode's `safeMagnitude`. Useful for stress tests. */
  readonly safeMagnitude?: number;
}

/**
 * Per-permutation progress notification. Fired once after each
 * permutation finishes enumerating. `best` is the running best-so-far
 * map (target → cheapest equation found yet); it MUST NOT be retained
 * past the callback because the solver continues to mutate it.
 *
 * Wire this from a worker to stream a partial result to the UI so
 * arity-5 sweeps (which take 1–3 minutes) can render an answer within
 * the first few hundred milliseconds and tighten as the sweep
 * progresses.
 */
export interface SweepProgress {
  readonly permsDone: number;
  readonly permsTotal: number;
  readonly best: ReadonlyMap<number, BulkSolution>;
}

// ---------------------------------------------------------------------------
//  Internal helpers
// ---------------------------------------------------------------------------

/** Precompute `[d^0, d^1, ..., d^cap]` for fast inner-loop lookup. */
function precomputeBases(dice: number, mode: Mode): number[] {
  const cap = mode.exponentCap(dice);
  const bases: number[] = new Array(cap + 1);
  for (let p = 0; p <= cap; p += 1) bases[p] = Math.pow(dice, p);
  return bases;
}

/** Cache `precomputeBases(d, mode)` keyed by the dice value itself. */
function buildBasesCache(
  dice: readonly number[],
  mode: Mode,
): Map<number, number[]> {
  const cache = new Map<number, number[]>();
  for (const d of dice) {
    if (!cache.has(d)) cache.set(d, precomputeBases(d, mode));
  }
  return cache;
}

/**
 * Apply mode-specific pre-processing to the input dice before solving.
 * Standard mode reduces compound dice (4/8/16 → 2; 9 → 3); Æther mode
 * is a no-op.
 */
function preprocessDice(dice: readonly number[], mode: Mode): readonly number[] {
  if (!mode.depower) return dice;
  return dice.map(depowerDice);
}

/**
 * Inner enumeration: for one permutation of dice values, walk every
 * exponent tuple × every operator tuple, pruning intermediates that
 * exceed `safeMagnitude`. Updates `best` in place when a candidate
 * hits an integer target inside `[minTotal, maxTotal]` with lower
 * difficulty than what's already there.
 */
function enumerateForPermutation(
  perm: readonly number[],
  basesCache: Map<number, number[]>,
  opTuples: readonly Operator[][],
  minTotal: number,
  maxTotal: number,
  safeMagnitude: number,
  mode: Mode,
  allBases: AllBasesCache,
  best: Map<number, BulkSolution>,
): void {
  const N = perm.length;
  const baseArrays: number[][] = new Array(N);
  for (let i = 0; i < N; i += 1) baseArrays[i] = basesCache.get(perm[i]!)!;

  const exps: number[] = new Array(N).fill(0);
  const values: number[] = new Array(N);

  function tryAllOps(): void {
    for (let opIdx = 0; opIdx < opTuples.length; opIdx += 1) {
      const opTuple = opTuples[opIdx]!;
      let acc = values[0]!;
      let bad = false;
      for (let i = 0; i < opTuple.length; i += 1) {
        const b = values[i + 1]!;
        const op = opTuple[i]!;
        // Inlined applyOperator + cheap NaN/overflow guard. See
        // `findEasiestForTuple` for rationale.
        if (op === OP.ADD) acc = acc + b;
        else if (op === OP.SUB) acc = acc - b;
        else if (op === OP.MUL) acc = acc * b;
        else acc = acc / b;
        if (acc !== acc || acc > safeMagnitude || acc < -safeMagnitude) {
          bad = true;
          break;
        }
      }
      if (bad) continue;
      const rounded = Math.round(acc);
      if (Math.abs(acc - rounded) > FLOAT_EQ_EPSILON) continue;
      if (rounded < minTotal || rounded > maxTotal) continue;

      const candidate: NEquation = {
        dice: perm.slice(),
        exps: exps.slice(),
        ops: opTuple.slice(),
        total: rounded,
      };
      const diff = difficultyOfEquation(candidate, mode, allBases);
      const cur = best.get(rounded);
      if (cur === undefined || diff < cur.difficulty) {
        best.set(rounded, { equation: candidate, difficulty: diff });
      }
    }
  }

  function pickExp(level: number): void {
    if (level === N) {
      tryAllOps();
      return;
    }
    const arr = baseArrays[level]!;
    for (let p = 0; p < arr.length; p += 1) {
      values[level] = arr[p]!;
      exps[level] = p;
      pickExp(level + 1);
    }
  }

  pickExp(0);
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Solve every integer target in `[minTotal, maxTotal]` for one dice
 * tuple in a single enumeration of the equation space.
 *
 * Returns a map from target → best (lowest-difficulty) equation found.
 * Targets that have no valid equation are simply absent from the map.
 */
export function sweepOneTuple(
  dice: readonly number[],
  minTotal: number,
  maxTotal: number,
  mode: Mode,
  options: SweepOptions = {},
  onPermComplete?: (progress: SweepProgress) => void,
): Map<number, BulkSolution> {
  if (!mode.arities.includes(dice.length as Arity)) {
    throw new RangeError(
      `sweepOneTuple: dice arity ${dice.length} is not allowed by mode "${mode.id}" (allowed: ${mode.arities.join(",")})`,
    );
  }

  const safeMagnitude = options.safeMagnitude ?? mode.safeMagnitude;
  const processed = preprocessDice(dice, mode);
  const basesCache = buildBasesCache(processed, mode);
  const allBases = buildAllBasesCache(processed, mode);
  const opTuples = allOpTuples(processed.length - 1);
  const best = new Map<number, BulkSolution>();

  // Materialize the permutation list up front when reporting progress
  // so we can compute permsTotal. Otherwise stream lazily.
  const perms = onPermComplete === undefined
    ? null
    : [...distinctPermutations(processed)];
  const iter = perms ?? distinctPermutations(processed);
  const permsTotal = perms?.length ?? 0;
  let permsDone = 0;

  for (const perm of iter) {
    enumerateForPermutation(
      perm,
      basesCache,
      opTuples,
      minTotal,
      maxTotal,
      safeMagnitude,
      mode,
      allBases,
      best,
    );
    if (onPermComplete !== undefined) {
      permsDone += 1;
      onPermComplete({ permsDone, permsTotal, best });
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
//  Branch-and-bound easiest-solution finder
// ---------------------------------------------------------------------------

/**
 * Like {@link sweepOneTuple} but specialized for "find the easiest
 * equation hitting one specific target". Uses two pruning techniques:
 *
 *   1. **Cross-permutation `bestDiff` carry-over.** Once any
 *      permutation finds a hit, every subsequent permutation aborts
 *      candidates whose lower bound (set by the dice multiset and
 *      target alone) already exceeds `bestDiff`. Since the lower
 *      bound is the same for every permutation of the same dice
 *      tuple, this lets the FIRST cheap hit kill the entire rest of
 *      the search tree — a huge win on tuples with thousands of
 *      permutations.
 *
 *   2. **Inner-loop wins.** Operator dispatch is inlined (no
 *      `applyOperator` virtual call in the hot path), the leading
 *      `Math.abs(values[0]) > safeMagnitude` check is dropped (the
 *      base array is already capped by `mode.exponentCap`), and
 *      `Number.isFinite` is replaced by an `acc !== acc || acc ===
 *      ±Infinity` test that the JIT emits as a single FP compare.
 *
 * Returns the lowest-difficulty hit, or `null` if no equation made it.
 */
function findEasiestForTuple(
  processed: readonly number[],
  total: number,
  mode: Mode,
  options: SweepOptions,
  /**
   * Optional running best across the *enclosing* search (e.g. across
   * sibling subsets in `easiestSolution`). Lets the inner loop start
   * with a non-trivial `bestDiff` and prune harder from the very
   * first iteration.
   */
  initialBestDiff: number = Number.POSITIVE_INFINITY,
): { equation: NEquation; difficulty: number } | null {
  const safeMagnitude = options.safeMagnitude ?? mode.safeMagnitude;
  const basesCache = buildBasesCache(processed, mode);
  const allBases = buildAllBasesCache(processed, mode);
  const lb = difficultyLowerBound(processed, total, mode);

  // If even the lower bound is already ≥ the inherited best, this
  // tuple can't contribute — return immediately (caller guards too,
  // but defense-in-depth is cheap).
  if (lb >= initialBestDiff) return null;

  let bestDiff = initialBestDiff;
  let bestEq: NEquation | null = null;

  const N = processed.length;
  const expsBuf = new Int32Array(N); // Int32Array beats `number[]` for tight integer loops
  const opsBuf = new Int32Array(N - 1); // hot integer slots, JIT-friendly
  const suffixBound = new Float64Array(N + 1); // reused across perms; recomputed in-place

  // Optimal-stop tolerance: when we find a candidate within
  // `OPTIMAL_EPSILON` of the lower bound, we declare it optimal and
  // bail. Difficulty floats can drift by ~1e-9 from rounding so we
  // need a sliver of slack — using `0` here would risk never tripping
  // the early-exit in practice.
  const OPTIMAL_EPSILON = 1e-6;

  for (const perm of distinctPermutations(processed)) {
    // Cross-permutation prune: if the lower bound (which only depends
    // on the multiset, not the order) already meets-or-exceeds our
    // best, no permutation of this tuple can ever beat it.
    if (lb >= bestDiff - OPTIMAL_EPSILON) break;

    const baseArrays: number[][] = new Array(N);
    for (let i = 0; i < N; i += 1) baseArrays[i] = basesCache.get(perm[i]!)!;
    // Recompute suffixBound in place (no per-perm allocation).
    suffixBound[N] = 0;
    let runningMax = 1;
    for (let i = N - 1; i >= 0; i -= 1) {
      let levelMax = 0;
      const arr = baseArrays[i]!;
      for (let p = 0; p < arr.length; p += 1) {
        const v = Math.abs(arr[p]!);
        if (v > levelMax) levelMax = v;
      }
      runningMax = runningMax * levelMax;
      suffixBound[i] = runningMax;
    }

    /**
     * Interleaved exp + op enumeration with per-step pruning.
     *
     * At level 0 we pick `exp[0]` and seed `acc`. At every later
     * level we pick `(op[level-1], exp[level])`, fold into `acc`,
     * and recurse — pruning whenever:
     *
     *   - `acc` is already non-finite (NaN from `÷ 0`).
     *   - `|acc|` exceeds `safeMagnitude` (overflow).
     *   - `|acc| - safeMagnitude` already exceeds the suffix's
     *     additive reach (`suffixBound[level+1]`), so even adding
     *     the maximal suffix can't bring us back inside the safe band
     *     — we're hopelessly out.
     *
     * The *interleaved* structure is what gives the speedup: when
     * the early prefix is wildly out of range, we cut entire exp×op
     * subtrees instead of completing them and re-checking at the
     * leaf. For arity-5 with `[2, 3, 5, 7, 11]` and target 3614 this
     * cuts the inner-iteration count by roughly 8×.
     */
    function recurse(level: number, acc: number): void {
      if (level === N) {
        const rounded = Math.round(acc);
        if (Math.abs(acc - rounded) > FLOAT_EQ_EPSILON) return;
        if (rounded !== total) return;

        // Build candidate + score — only on hit, so this is rare.
        const candidate: NEquation = {
          dice: perm.slice(),
          exps: Array.from(expsBuf),
          ops: Array.from(opsBuf, (o) => o as Operator),
          total: rounded,
        };
        const diff = difficultyOfEquation(candidate, mode, allBases);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestEq = candidate;
        }
        return;
      }

      const arr = baseArrays[level]!;

      if (level === 0) {
        // Seed: pick exp[0] only, no op.
        for (let p = 0; p < arr.length; p += 1) {
          const v = arr[p]!;
          // The base values are always within safeMagnitude by
          // construction (mode.exponentCap caps so v ≤ ~1e6 for
          // Æther, much less for Standard). No need to check here.
          expsBuf[0] = p;
          recurse(1, v);
        }
        return;
      }

      // Reach-based prune. After consuming `acc`, the remaining
      // (N − level) positions yield a final value bounded by:
      //
      //   |final| ≤ |acc| · P + P
      //
      // where `P = suffixBound[level]` is the product of the
      // per-level max-|base| over the remaining slots. Justification:
      //
      //   - The multiplicative chain can scale `acc` by at most P
      //     (worst case: every remaining op is `*` at peak base).
      //   - After the scaled acc, additive ops can add at most `P`
      //     (overestimate: sum-of-bases ≤ product-of-bases when
      //     bases ≥ 2 and ≥ 2 of them remain).
      //   - The two combine as `|scaled_acc| + |added| ≤ |acc|·P + P`.
      //
      // So if `|total| > |acc|·P + P`, no completion can hit the
      // target. Sound (never discards a real solution); often quite
      // tight when `acc` is small or the suffix is short.
      const P = suffixBound[level]!;
      const maxFinalAbs = Math.abs(acc) * P + P;
      if (Math.abs(total) > maxFinalAbs) return;

      // Levels ≥ 1: pick (op[level-1], exp[level]).
      for (let p = 0; p < arr.length; p += 1) {
        const b = arr[p]!;
        expsBuf[level] = p;

        // Try each op, inlined. Order is + - * / (additive first
        // tends to find lower-magnitude prefixes that prune deeper
        // multiplicative subtrees better).
        for (let opCode = 1; opCode <= 4; opCode += 1) {
          let next: number;
          if (opCode === 1) next = acc + b;
          else if (opCode === 2) next = acc - b;
          else if (opCode === 3) next = acc * b;
          else next = acc / b;

          // NaN (÷ 0) or overflow guard.
          if (next !== next) continue;
          if (next > safeMagnitude || next < -safeMagnitude) continue;

          opsBuf[level - 1] = opCode;
          recurse(level + 1, next);
        }
      }
    }

    recurse(0, 0);
  }

  return bestEq === null ? null : { equation: bestEq, difficulty: bestDiff };
}

/**
 * Find the easiest equation (lowest difficulty) that uses a subset of
 * `dice` and evaluates to `total`.
 *
 * "Auto-arity": when `dice.length > 3`, the solver tries every 3-subset
 * first and returns the easiest hit there if any exist. If no 3-subset
 * works, it tries every 4-subset, and finally the full N-subset. This
 * matches the v1 Æther behavior — smallest arity that hits the target
 * wins, with difficulty as the tie-breaker within an arity.
 *
 * Returns `null` when no subset can hit the target.
 */
export function easiestSolution(
  dice: readonly number[],
  total: number,
  mode: Mode,
  options: SweepOptions = {},
): NEquation | null {
  const minArity = Math.min(...mode.arities);
  if (dice.length < minArity) {
    throw new RangeError(
      `easiestSolution: dice pool size ${dice.length} is below mode "${mode.id}" minimum arity ${minArity}`,
    );
  }
  const maxArity = Math.max(...mode.arities);
  const cap = Math.min(dice.length, maxArity);

  // Auto-arity: smallest subset arity that hits the target wins.
  // Within an arity, we run B&B across every subset and the cheapest
  // subset-level lower bound is checked first — once one subset finds
  // a hit, subsets whose LB exceeds it are pruned wholesale.
  for (let subsetSize = minArity; subsetSize <= cap; subsetSize += 1) {
    if (!mode.arities.includes(subsetSize as Arity)) continue;

    let bestEq: NEquation | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const subset of unorderedSubsets(dice, subsetSize)) {
      const processed = preprocessDice(subset, mode);
      // Subset-level LB prune: if no perm/exps/ops on this subset can
      // beat the running best, skip the subset entirely.
      if (difficultyLowerBound(processed, total, mode) >= bestDiff) continue;

      const hit = findEasiestForTuple(processed, total, mode, options, bestDiff);
      if (hit && hit.difficulty < bestDiff) {
        bestDiff = hit.difficulty;
        bestEq = hit.equation;
      }
    }
    if (bestEq !== null) return bestEq;
  }
  return null;
}

/**
 * All distinct equations that use exactly `dice` (in some permutation
 * of exponents and operators) and evaluate to `total`.
 *
 * Distinctness is by `(dice-permutation, exps, ops)` triple — two
 * equations that look identical printed but read different dice slots
 * are considered different (matches v1 standard behavior).
 *
 * NOTE: unlike `easiestSolution`, this enumerates the full
 * `dice.length` arity directly — no auto-arity subset search. If you
 * want every solution at every arity ≤ N, call this once per subset.
 */
export function allSolutions(
  dice: readonly number[],
  total: number,
  mode: Mode,
  options: SweepOptions = {},
): NEquation[] {
  if (!mode.arities.includes(dice.length as Arity)) {
    throw new RangeError(
      `allSolutions: dice arity ${dice.length} is not allowed by mode "${mode.id}"`,
    );
  }

  const safeMagnitude = options.safeMagnitude ?? mode.safeMagnitude;
  const processed = preprocessDice(dice, mode);
  const basesCache = buildBasesCache(processed, mode);
  const opTuples = allOpTuples(processed.length - 1);
  const out: NEquation[] = [];
  const seen = new Set<string>();

  const N = processed.length;
  const exps: number[] = new Array(N).fill(0);
  const values: number[] = new Array(N);

  for (const perm of distinctPermutations(processed)) {
    const baseArrays: number[][] = new Array(N);
    for (let i = 0; i < N; i += 1) baseArrays[i] = basesCache.get(perm[i]!)!;

    function pickExp(level: number): void {
      if (level === N) {
        for (let opIdx = 0; opIdx < opTuples.length; opIdx += 1) {
          const opTuple = opTuples[opIdx]!;
          let acc = values[0]!;
          let bad = false;
          for (let i = 0; i < opTuple.length; i += 1) {
            const b = values[i + 1]!;
            const op = opTuple[i]!;
            if (op === OP.ADD) acc = acc + b;
            else if (op === OP.SUB) acc = acc - b;
            else if (op === OP.MUL) acc = acc * b;
            else acc = acc / b;
            if (acc !== acc || acc > safeMagnitude || acc < -safeMagnitude) {
              bad = true;
              break;
            }
          }
          if (bad) continue;
          const rounded = Math.round(acc);
          if (Math.abs(acc - rounded) > FLOAT_EQ_EPSILON) continue;
          if (rounded !== total) continue;

          const key = `${perm.join(",")}|${exps.join(",")}|${opTuple.join(",")}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            dice: perm.slice(),
            exps: exps.slice(),
            ops: opTuple.slice(),
            total: rounded,
          });
        }
        return;
      }
      const arr = baseArrays[level]!;
      for (let p = 0; p < arr.length; p += 1) {
        values[level] = arr[p]!;
        exps[level] = p;
        pickExp(level + 1);
      }
    }

    pickExp(0);
  }

  return out;
}

/**
 * Bulk-export entry point: solve every target in `[minTotal, maxTotal]`
 * for one dice tuple at a fixed arity. Returns the solutions in target
 * order so the export driver can stream them without sorting.
 */
export function solveForExport(
  dice: readonly number[],
  arity: Arity,
  minTotal: number,
  maxTotal: number,
  mode: Mode,
  options: SweepOptions = {},
): BulkSolution[] {
  if (dice.length !== arity) {
    throw new RangeError(
      `solveForExport: dice.length (${dice.length}) must equal arity (${arity})`,
    );
  }
  const map = sweepOneTuple(dice, minTotal, maxTotal, mode, options);
  const sortedTotals = [...map.keys()].sort((a, b) => a - b);
  return sortedTotals.map((t) => map.get(t)!);
}
