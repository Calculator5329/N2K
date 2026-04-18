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
import { FLOAT_EQ_EPSILON, depowerDice } from "../core/constants.js";
import type {
  Arity,
  BulkSolution,
  Mode,
  NEquation,
  Operator,
} from "../core/types.js";
import {
  allOpTuples,
  applyOperator,
  distinctPermutations,
  unorderedSubsets,
} from "./arithmetic.js";
import {
  buildAllBasesCache,
  difficultyOfEquation,
  type AllBasesCache,
} from "./difficulty.js";

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
    for (const opTuple of opTuples) {
      let acc = values[0]!;
      if (Math.abs(acc) > safeMagnitude) continue;
      let overflow = false;
      for (let i = 0; i < opTuple.length; i += 1) {
        acc = applyOperator(acc, values[i + 1]!, opTuple[i]!);
        if (!Number.isFinite(acc) || Math.abs(acc) > safeMagnitude) {
          overflow = true;
          break;
        }
      }
      if (overflow) continue;
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

  for (let subsetSize = minArity; subsetSize <= cap; subsetSize += 1) {
    if (!mode.arities.includes(subsetSize as Arity)) continue;

    let bestEq: NEquation | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const subset of unorderedSubsets(dice, subsetSize)) {
      const cellMap = sweepOneTuple(subset, total, total, mode, options);
      const hit = cellMap.get(total);
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
        for (const opTuple of opTuples) {
          let acc = values[0]!;
          if (Math.abs(acc) > safeMagnitude) continue;
          let overflow = false;
          for (let i = 0; i < opTuple.length; i += 1) {
            acc = applyOperator(acc, values[i + 1]!, opTuple[i]!);
            if (!Number.isFinite(acc) || Math.abs(acc) > safeMagnitude) {
              overflow = true;
              break;
            }
          }
          if (overflow) continue;
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
