/**
 * Canonical-form post-processor for `allSolutions`.
 *
 * Why this exists
 * ---------------
 * `allSolutions(dice, total, mode)` enumerates every (perm, exps,
 * ops) triple that hits `total`. For arity-4/5 inputs that's
 * frequently 500–1500 entries — but the vast majority are
 * **commutatively equivalent**: swapping two operands inside a run of
 * same-precedence ops gives the same value (`2 + 3 + 5 = 5 + 3 + 2`,
 * `2 * 3 * 5 = 5 * 3 * 2`, etc.). The UI's "All equations" panel
 * floods with cosmetic duplicates and the user can't see the actually
 * distinct shapes.
 *
 * `canonicalizeSolutions` collapses each commutative equivalence
 * class into a single representative + a `multiplicity` count so the
 * UI can render a compact list with a "×N orderings" badge.
 *
 * The equivalence relation
 * ------------------------
 * N2K evaluates strictly left-to-right with no operator precedence:
 * `a + b * c` is `(a + b) * c`, not `a + (b * c)`. So the only safe
 * commutative reorderings happen **within a maximal run of
 * same-class ops** (additive class = `{+, -}`, multiplicative class =
 * `{*, /}`). Within such a run, the operands form a multiset of
 * `(weight, base, exp)` tuples (weight = sign for additive runs,
 * power-of-±1 for multiplicative runs) and we may reorder them
 * freely. Across run boundaries we may *not* reorder — the boundary
 * op is the precedence break.
 *
 * Run boundary detection
 * ----------------------
 * A boundary sits between op `i-1` and op `i` whenever those two ops
 * belong to different classes. The first run starts at operand 0 and
 * runs through operand `j` where the op between operand `j` and
 * operand `j+1` is the first class-change.
 *
 * The *first operand of a run* contributes weight `+1` regardless of
 * class (it has no incoming op). The remaining operands inside the
 * run inherit their weight from their incoming op:
 *   - `+` → +1, `-` → −1   (additive run)
 *   - `*` → +1, `/` → −1   (multiplicative run)
 *
 * Canonical reorder
 * -----------------
 * Within each run, sort the `(weight, base, exp)` tuples by:
 *   1. **base ascending** (smallest die value first — locked plan
 *      decision)
 *   2. **exp ascending** (within the same base, lower exponent first)
 *   3. **weight descending** (so `+` comes before `-`, `*` before `/`
 *      — keeps the equation readable: `2 + 3 - 7` rather than
 *      `−7 + 2 + 3`).
 *
 * After sorting, the *first* operand of the run gets weight `+1` (no
 * incoming op); subsequent operands get the op corresponding to their
 * sorted weight. If the sort ever places a `weight = -1` tuple at
 * position 0 of a run, the run starts negative — for the *first* run
 * of the whole equation that means the equation begins with a
 * negative-valued first operand (no leading op slot in
 * `NEquation.ops`), which is **not representable** in our wire
 * format. We handle that by either (a) keeping the original first
 * operand in slot 0 if the sort moves a negative there, or (b)
 * picking the highest-weight tuple at position 0. We choose (b) since
 * it preserves the canonical sort intent for the rest of the run.
 *
 * Soundness contract
 * ------------------
 * The canonical equation must:
 *   - Use the same multiset of dice as the input.
 *   - Produce a valid `NEquation` (`exps.length == dice.length`,
 *     `ops.length == dice.length - 1`).
 *   - **Evaluate to the same `total` as the input.**
 *
 * The third invariant is asserted in tests over a large sample of
 * `allSolutions` outputs. If it ever fires in production, the bug is
 * here, not in the caller.
 */
import { OP } from "../core/constants.js";
import type { NEquation, Operator } from "../core/types.js";
import { evaluateLeftToRight } from "./arithmetic.js";

/** A single canonical equivalence class. */
export interface CanonicalSolution {
  /** A canonical representative of the class. */
  readonly equation: NEquation;
  /** How many distinct (perm, exps, ops) inputs collapsed into it. */
  readonly multiplicity: number;
}

/** True iff `op` belongs to the additive precedence class (`{+, -}`). */
function isAdditive(op: Operator): boolean {
  return op === OP.ADD || op === OP.SUB;
}

/** True iff op `a` and op `b` are in the same precedence class. */
function sameClass(a: Operator, b: Operator): boolean {
  return isAdditive(a) === isAdditive(b);
}

/**
 * Map a (run-class, weight ±1) pair back to the actual operator code
 * that appears between operands. The first operand of a run has no
 * incoming op so this is never called for it.
 */
function weightToOp(additive: boolean, weight: 1 | -1): Operator {
  if (additive) return weight === 1 ? OP.ADD : OP.SUB;
  return weight === 1 ? OP.MUL : OP.DIV;
}

/** A single operand inside a run, with the weight contributed by its
 *  *incoming* op (or +1 if it's the first operand of the run). */
interface RunOperand {
  readonly base: number;
  readonly exp: number;
  readonly weight: 1 | -1;
  /** Original index in the input equation — for tie-breaking and
   *  for tracking that the multiset is preserved. */
  readonly origIndex: number;
}

/**
 * Build the canonical form of one equation. The result has the same
 * dice multiset and the same `total`, but the operands inside each
 * commutative run are sorted by `(base, exp, -weight)`.
 *
 * @throws Error if the canonical equation evaluates to a different
 *         total than the input — which means there's a bug in this
 *         module and we'd rather fail loud than ship wrong UI.
 */
export function canonicalizeEquation(eq: NEquation): NEquation {
  const N = eq.dice.length;
  if (N === 0) return eq;
  if (N === 1) return eq; // arity-1 isn't a thing, but be defensive

  // 1) Split into runs. `runs[r]` = the ordered list of operand
  // positions belonging to run r.
  const runs: number[][] = [[0]];
  let runIsAdditive = N > 1 ? isAdditive(eq.ops[0]!) : true;
  // Track each run's class for the rebuild step below.
  const runClass: boolean[] = [runIsAdditive];
  for (let i = 1; i < N; i += 1) {
    const incomingOp = eq.ops[i - 1]!;
    const incomingIsAdd = isAdditive(incomingOp);
    if (i > 1) {
      const prevOp = eq.ops[i - 2]!;
      if (!sameClass(prevOp, incomingOp)) {
        // Class changed — start a new run with this operand.
        runs.push([i]);
        runClass.push(incomingIsAdd);
        continue;
      }
    } else {
      // i === 1: the first incoming op defines whether the *first*
      // run continues or whether the second operand seeds a run of
      // its own. By convention the first run holds at least operand
      // 0 (already pushed) plus operand 1 — they're always in the
      // same run because there's no boundary "before" op[0].
    }
    runs[runs.length - 1]!.push(i);
  }

  // Defensive: at this point the first run's class equals the class
  // of `ops[0]` (or the equation has only one operand, handled above).
  if (N > 1) runClass[0] = isAdditive(eq.ops[0]!);

  // 2) For each run, build the operand list with **effective**
  // weights. Subtle point: in left-to-right N2K, the op at a run
  // boundary applies to the *first operand of the new run* — so for
  // any run beyond the first, the "incoming op" of the run-leader is
  // the boundary op itself, and that determines its weight. For the
  // very first run of the equation there is no boundary op; the
  // run-leader's weight is +1.
  //
  // Concretely, for run r, operand at position `run[k]`:
  //   k === 0 and r === 0: weight = +1 (no preceding op)
  //   k === 0 and r > 0:   weight derived from `ops[run[0] - 1]`
  //                        (the boundary op crossed from prev run)
  //   k > 0:               weight derived from `ops[run[k] - 1]`
  //                        (intra-run incoming op)
  //
  // This makes the multiset {effective weight × operand} commutative
  // within the run: any reorder is value-preserving as long as the
  // first operand of the new ordering has weight +1 (which we
  // enforce in step 4 below by promoting one if needed). The ops
  // emitted in step 5 are derived from the *new* sorted weights, so
  // the boundary op naturally tracks whichever operand ends up
  // leading the run.
  const sortedOps: Operator[] = new Array(N - 1);
  const newDice: number[] = new Array(N);
  const newExps: number[] = new Array(N);

  let writeIdx = 0;
  for (let r = 0; r < runs.length; r += 1) {
    const run = runs[r]!;
    const additive = runClass[r]!;
    const operands: RunOperand[] = run.map((idx, k) => {
      let weight: 1 | -1;
      if (k === 0 && r === 0) {
        weight = 1;
      } else {
        // For k > 0, ops[idx - 1] is the intra-run incoming op.
        // For k === 0 && r > 0, ops[idx - 1] is the boundary op
        // crossed from the previous run. Either way, its sign
        // determines this operand's effective weight in the run.
        const incoming = eq.ops[idx - 1]!;
        weight = additive
          ? incoming === OP.ADD
            ? 1
            : -1
          : incoming === OP.MUL
            ? 1
            : -1;
      }
      return { base: eq.dice[idx]!, exp: eq.exps[idx]!, weight, origIndex: idx };
    });

    // 3) Sort: (base asc, exp asc, weight desc, origIndex asc for
    // determinism on full ties).
    operands.sort((a, b) => {
      if (a.base !== b.base) return a.base - b.base;
      if (a.exp !== b.exp) return a.exp - b.exp;
      if (a.weight !== b.weight) return b.weight - a.weight;
      return a.origIndex - b.origIndex;
    });

    // 4) The first operand of the run can't carry a `-1` weight in
    // our wire format (there's no leading-minus slot for the very
    // first operand of the equation, and *within* a run the first
    // operand is implicitly positive). If the sort placed a `-1`
    // operand at position 0, swap it with the leftmost `+1` operand
    // we can find. Such a `+1` always exists for valid solutions
    // because the original equation was, by construction, evaluable
    // and started this run with a positive-weight operand.
    if (operands[0]!.weight === -1) {
      let swapIdx = -1;
      for (let k = 1; k < operands.length; k += 1) {
        if (operands[k]!.weight === 1) {
          swapIdx = k;
          break;
        }
      }
      if (swapIdx !== -1) {
        const tmp = operands[0]!;
        operands[0] = operands[swapIdx]!;
        operands[swapIdx] = tmp;
      }
      // If no `+1` exists, the run was *entirely* negative — only
      // possible for an additive run that is itself the second-or-
      // later run of the equation (its leading op gets restored
      // below). For multiplicative runs starting with `/` we just
      // accept the rare oddity; the rebuild still produces a valid
      // wire-format equation as long as r > 0.
    }

    // 5) Emit operands in canonical order. Every emitted op (both
    // intra-run AND the boundary into this run from the previous)
    // is derived from the *new* sorted weight of the operand it
    // applies to — that's how the boundary op tracks whichever
    // operand ends up leading the run after sorting.
    for (let k = 0; k < operands.length; k += 1) {
      newDice[writeIdx] = operands[k]!.base;
      newExps[writeIdx] = operands[k]!.exp;
      if (writeIdx > 0) {
        sortedOps[writeIdx - 1] = weightToOp(additive, operands[k]!.weight);
      }
      writeIdx += 1;
    }
  }

  const canonical: NEquation = {
    dice: newDice,
    exps: newExps,
    ops: sortedOps,
    total: eq.total,
  };

  // Defensive evaluation check. The cost is one O(N) walk per
  // canonicalised equation — negligible compared to the search that
  // produced it. If this ever throws, the bug is in the run / sort
  // logic above.
  //
  // `eq.dice` already holds post-depower base values (the solver
  // stores them that way), so plain `base ** exp` is exact. We only
  // call this for in-range, finite values that the solver already
  // accepted, so overflow/NaN here would itself be a bug.
  const newValues: number[] = new Array(N);
  for (let i = 0; i < N; i += 1) newValues[i] = Math.pow(newDice[i]!, newExps[i]!);
  const evaluated = evaluateLeftToRight(newValues, sortedOps);
  if (!Number.isFinite(evaluated) || Math.round(evaluated) !== eq.total) {
    throw new Error(
      `canonicalizeEquation: result ${evaluated} ≠ original total ${eq.total}; input=${JSON.stringify(eq)} canonical=${JSON.stringify(canonical)}`,
    );
  }

  return canonical;
}

/**
 * Stable string key for a canonical equation. Two equations with the
 * same key are guaranteed perm-equivalent. Cheap (single allocation
 * per call); used to deduplicate the output of `allSolutions`.
 */
function canonicalKey(eq: NEquation): string {
  // Pack as `d0^e0|d1^e1|…|op0,op1,…|total`. The pipe boundaries
  // disambiguate dice/op runs from each other so we never get a
  // collision across e.g. exp=10 vs exp=1 followed by op=0.
  const dice = eq.dice.join(",");
  const exps = eq.exps.join(",");
  const ops = eq.ops.join(",");
  return `${dice}|${exps}|${ops}`;
}

/**
 * Collapse perm-equivalent equations into one canonical
 * representative each, with a multiplicity count.
 *
 * The output is **sorted ascending by the difficulty of the canonical
 * representative** (lowest difficulty first). Difficulty is computed
 * via the supplied `scoreFn` — usually
 * `(eq) => difficultyOfEquation(eq, mode)`. Caller injects so this
 * module stays decoupled from the difficulty heuristic and can be
 * exercised in isolation by tests.
 *
 * Stable for repeat calls on the same input set.
 */
export function canonicalizeSolutions(
  equations: readonly NEquation[],
  scoreFn: (eq: NEquation) => number,
): CanonicalSolution[] {
  const groups = new Map<string, { equation: NEquation; multiplicity: number; difficulty: number }>();
  for (const eq of equations) {
    const canon = canonicalizeEquation(eq);
    const key = canonicalKey(canon);
    const existing = groups.get(key);
    if (existing) {
      existing.multiplicity += 1;
    } else {
      groups.set(key, {
        equation: canon,
        multiplicity: 1,
        difficulty: scoreFn(canon),
      });
    }
  }
  const out = Array.from(groups.values());
  out.sort((a, b) => {
    if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
    // Tie-break: lexicographic on canonical key — fully deterministic.
    return canonicalKey(a.equation).localeCompare(canonicalKey(b.equation));
  });
  return out.map(({ equation, multiplicity }) => ({ equation, multiplicity }));
}
