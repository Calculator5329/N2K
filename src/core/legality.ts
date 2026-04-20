/**
 * Dice-roll legality predicates.
 *
 * One unified rule for arity 3, 4, and 5 across both modes:
 *
 *   1. Length matches one of `mode.arities`.
 *   2. Every die value is in `[mode.diceRange.min, mode.diceRange.max]`
 *      AND passes `mode.legalDieValue` (when defined). The latter
 *      lets a mode exclude values inside its declared range — Æther
 *      excludes `0` because `0^p` is degenerate and `÷ 0` is unsafe.
 *   3. At most one die equals `1`. Two-or-more `1`s leave the
 *      remaining dice essentially alone after multiplication or
 *      division and produce trivial equations.
 *   4. **No more than `N − 1` of the same value.** With `N` dice all
 *      equal, the player has no real choice between dice slots —
 *      every permutation produces the same expression. Mirrors the
 *      "all three equal" ban from the original `isLegalDiceTriple`
 *      and generalizes it to higher arities.
 *
 * `isLegalDiceTriple(triple)` is preserved as a 3-arity wrapper so
 * standard-mode callers (board generators, candidate pool builders)
 * keep working without touching every callsite.
 */
import type { Arity, Mode } from "./types.js";

/**
 * True iff `dice` is a legal roll under `mode` per the rules in the
 * module docblock. Order-insensitive: a sorted or shuffled array of
 * the same multiset always returns the same answer.
 */
export function isLegalDiceTuple(
  dice: readonly number[],
  mode: Mode,
): boolean {
  if (!mode.arities.includes(dice.length as Arity)) return false;
  const N = dice.length;

  let onesCount = 0;
  const counts = new Map<number, number>();
  for (const d of dice) {
    if (!Number.isInteger(d)) return false;
    if (d < mode.diceRange.min || d > mode.diceRange.max) return false;
    if (mode.legalDieValue !== undefined && !mode.legalDieValue(d)) return false;
    if (d === 1) onesCount += 1;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }

  if (onesCount > 1) return false;
  for (const c of counts.values()) {
    if (c >= N) return false;
  }
  return true;
}

/**
 * Yield every legal multiset of size `arity` under `mode` in
 * canonical sorted order (`a₁ ≤ a₂ ≤ … ≤ a_arity`). Optional
 * `predicate` further narrows the universe — used by the curator to
 * carve out "commons" (e.g. dice ∈ {2..12, 15, 20}, no 1s,
 * ≤2-of-any-value) from the broader legal set.
 *
 * Both filters are applied: a tuple must satisfy `isLegalDiceTuple`
 * **and** `predicate?(tuple)`.
 *
 * Generator-style so the bake script can stream-process millions of
 * tuples without a giant intermediate array (matters for the
 * Tier-2 extended Æther sets).
 */
export function* enumerateLegalTuples(
  arity: Arity,
  mode: Mode,
  predicate?: (tuple: readonly number[]) => boolean,
): Generator<readonly number[]> {
  if (!mode.arities.includes(arity)) {
    throw new RangeError(
      `enumerateLegalTuples: arity ${arity} not allowed by mode "${mode.id}"`,
    );
  }
  const lo = mode.diceRange.min;
  const hi = mode.diceRange.max;
  const cur: number[] = new Array(arity);

  function* recurse(level: number, start: number): Generator<readonly number[]> {
    if (level === arity) {
      const snap = cur.slice();
      if (!isLegalDiceTuple(snap, mode)) return;
      if (predicate !== undefined && !predicate(snap)) return;
      yield snap;
      return;
    }
    for (let v = start; v <= hi; v += 1) {
      if (mode.legalDieValue !== undefined && !mode.legalDieValue(v)) continue;
      cur[level] = v;
      yield* recurse(level + 1, v);
    }
  }

  yield* recurse(0, lo);
}

/** Count legal tuples; convenience for the bake script's planning pass. */
export function countLegalTuples(
  arity: Arity,
  mode: Mode,
  predicate?: (tuple: readonly number[]) => boolean,
): number {
  let n = 0;
  for (const _ of enumerateLegalTuples(arity, mode, predicate)) n += 1;
  return n;
}

/**
 * The "commons" predicate (Tier 1) used by the bake script.
 *
 * Stricter than `isLegalDiceTuple`:
 *   - Dice values restricted to {2..12, 15, 20} (13 values)
 *   - **No 1s** (legality allows up to one; commons allows zero)
 *   - **At most 2 of any value** (legality allows up to N−1)
 *
 * Coverage target: ~80% of "I just rolled five dice" cases. Edge
 * cases (3-of-a-kind, 1s, dice outside the common set, negatives)
 * fall through to the Tier-3 worker path.
 */
export const COMMONS_DICE_VALUES: ReadonlySet<number> = new Set([
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 20,
]);

export function isCommonDiceTuple(tuple: readonly number[]): boolean {
  const counts = new Map<number, number>();
  for (const d of tuple) {
    if (d === 1) return false;
    if (!COMMONS_DICE_VALUES.has(d)) return false;
    const next = (counts.get(d) ?? 0) + 1;
    if (next > 2) return false;
    counts.set(d, next);
  }
  return true;
}

/**
 * The "extended" predicate (Tier 2) — same shape as commons but
 * widens the dice set to {2..20}. Stays positive-only and ≤2-of-any
 * for v1; ready in the bake script but not shipped by default.
 */
export const EXTENDED_DICE_VALUES: ReadonlySet<number> = new Set(
  Array.from({ length: 19 }, (_, i) => i + 2),
);

export function isExtendedDiceTuple(tuple: readonly number[]): boolean {
  const counts = new Map<number, number>();
  for (const d of tuple) {
    if (d === 1) return false;
    if (!EXTENDED_DICE_VALUES.has(d)) return false;
    const next = (counts.get(d) ?? 0) + 1;
    if (next > 2) return false;
    counts.set(d, next);
  }
  return true;
}
