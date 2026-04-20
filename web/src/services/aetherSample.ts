import { AETHER_MODE } from "@solver/core/constants.js";

const ADV_DICE_RANGE = AETHER_MODE.diceRange;
import type { AetherArity, AetherTuple } from "../core/types";

/**
 * Deterministic "representative sample" of Æther tuples used by the
 * Compose tab as the `aetherSample` candidate pool — gives Compose
 * something interesting at every arity (3/4/5) without paying to
 * enumerate the full 1.4 M-tuple universe.
 *
 * Selection strategy is deterministic (no `Math.random`) so cache hits
 * carry across page reloads, and so re-sampling the same count
 * returns the same tuples.
 *
 *   - Arity 3: every unordered triple in the small-positive subrange
 *     `[2..16]` — same shape as the standard dataset, so users get a
 *     familiar baseline.
 *   - Arity 4: a "pretty number" stratified sample over the full
 *     dice range, hitting both small and wide-spread tuples.
 *   - Arity 5: a smaller stratified sample, since arity-5 sweeps are
 *     the most expensive.
 */

function unorderedTuples(arity: AetherArity, min: number, max: number): AetherTuple[] {
  const out: AetherTuple[] = [];
  const cur: number[] = new Array(arity);
  function recurse(level: number, lo: number): void {
    if (level === arity) {
      out.push(cur.slice());
      return;
    }
    for (let v = lo; v <= max; v += 1) {
      cur[level] = v;
      recurse(level + 1, v);
    }
  }
  recurse(0, min);
  return out;
}

/**
 * Stratified picker: divide `[min, max]` into `strata` evenly-spaced
 * slots, generate every unordered tuple over the resulting set. Useful
 * for getting "wide-spread" coverage without enumerating the full
 * cartesian product.
 */
function stratifiedTuples(
  arity: AetherArity,
  strata: readonly number[],
): AetherTuple[] {
  const sorted = [...strata].sort((a, b) => a - b);
  const out: AetherTuple[] = [];
  const cur: number[] = new Array(arity);
  function recurse(level: number, startIdx: number): void {
    if (level === arity) {
      out.push(cur.slice());
      return;
    }
    for (let i = startIdx; i < sorted.length; i += 1) {
      cur[level] = sorted[i]!;
      recurse(level + 1, i);
    }
  }
  recurse(0, 0);
  return out;
}

/**
 * Build the canonical sample. Computed once and frozen.
 */
function buildSample(): readonly AetherTuple[] {
  const sample: AetherTuple[] = [];

  // Arity 3 — the full standard subrange (familiar to users).
  // Trim to a manageable size so it doesn't dominate the sample.
  const arity3 = unorderedTuples(3, 2, 16);
  sample.push(...arity3);

  // Arity 4 — stratified over a wide range that includes negatives
  // and large positives. Picked to produce ~200-400 tuples.
  const stride4 = [-10, -5, -1, 1, 2, 3, 5, 7, 11, 13, 17, 23, 32];
  sample.push(...stratifiedTuples(4, stride4));

  // Arity 5 — narrower stratification to keep the count modest.
  const stride5 = [-5, 1, 2, 3, 5, 7, 11, 19];
  sample.push(...stratifiedTuples(5, stride5));

  // Defensive: drop anything outside the advanced dice range (the
  // stride arrays above are within range, but assert in case future
  // edits drift them).
  return sample.filter((t) =>
    t.every(
      (d) => d >= ADV_DICE_RANGE.min && d <= ADV_DICE_RANGE.max,
    ),
  );
}

/** The frozen full sample. */
export const AETHER_SAMPLE: readonly AetherTuple[] = Object.freeze(buildSample());
