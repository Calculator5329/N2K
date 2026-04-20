/**
 * Canonical-form post-processor tests.
 *
 * Three layers of confidence:
 *   1. Hand-crafted equations with known equivalence classes
 *      (additive run, multiplicative run, mixed).
 *   2. Property test: for every equation in a real `allSolutions`
 *      output, `canonicalizeEquation` must produce something that
 *      evaluates to the same total.
 *   3. Integration: `canonicalizeSolutions` on real solver output
 *      must reduce the count, must not introduce duplicates, and
 *      multiplicities must sum to the original count.
 */
import { describe, expect, it } from "vitest";
import { AETHER_MODE, OP, STANDARD_MODE } from "../src/core/constants.js";
import type { NEquation } from "../src/core/types.js";
import { difficultyOfEquation } from "../src/services/difficulty.js";
import {
  canonicalizeEquation,
  canonicalizeSolutions,
} from "../src/services/canonicalForm.js";
import { allSolutions } from "../src/services/solver.js";

const eq = (
  dice: readonly number[],
  exps: readonly number[],
  ops: readonly number[],
  total: number,
): NEquation => ({
  dice: [...dice],
  exps: [...exps],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ops: [...ops] as any,
  total,
});

describe("canonicalizeEquation", () => {
  it("sorts a pure additive run smallest-first", () => {
    // 5 + 3 + 2 = 10  →  2 + 3 + 5 = 10
    const input = eq([5, 3, 2], [1, 1, 1], [OP.ADD, OP.ADD], 10);
    const out = canonicalizeEquation(input);
    expect(out.dice).toEqual([2, 3, 5]);
    expect(out.ops).toEqual([OP.ADD, OP.ADD]);
    expect(out.total).toBe(10);
  });

  it("preserves total for an additive run with subtraction", () => {
    // 2 + 7 - 3 = 6 ; canonical groups by base ascending, weight desc:
    //   weights {2:+1, 7:+1, 3:-1} → sorted (2,+) (3,-) (7,+) → 2 - 3 + 7 = 6
    const input = eq([2, 7, 3], [1, 1, 1], [OP.ADD, OP.SUB], 6);
    const out = canonicalizeEquation(input);
    expect(out.dice).toEqual([2, 3, 7]);
    expect(out.ops).toEqual([OP.SUB, OP.ADD]);
    expect(out.total).toBe(6);
  });

  it("sorts a pure multiplicative run smallest-first", () => {
    // 5 * 3 * 2 = 30  →  2 * 3 * 5 = 30
    const input = eq([5, 3, 2], [1, 1, 1], [OP.MUL, OP.MUL], 30);
    const out = canonicalizeEquation(input);
    expect(out.dice).toEqual([2, 3, 5]);
    expect(out.ops).toEqual([OP.MUL, OP.MUL]);
  });

  it("respects run boundaries — does not reorder across precedence change", () => {
    // 2 + 3 * 5 = 25  (left-to-right). The "+" and "*" are different
    // classes so the run boundary sits between operands 1 and 2. The
    // first run is {2, 3} (additive); the second run is {5} (mult).
    // Sorting the first run alone gives {2, 3} → unchanged.
    const input = eq([2, 3, 5], [1, 1, 1], [OP.ADD, OP.MUL], 25);
    const out = canonicalizeEquation(input);
    expect(out.dice).toEqual([2, 3, 5]);
    expect(out.ops).toEqual([OP.ADD, OP.MUL]);

    // …but if we feed `3 + 2 * 5 = 25` it should canonicalise to the
    // same thing: first run {3, 2} → {2, 3}, second run unchanged.
    const swapped = eq([3, 2, 5], [1, 1, 1], [OP.ADD, OP.MUL], 25);
    const out2 = canonicalizeEquation(swapped);
    expect(out2.dice).toEqual([2, 3, 5]);
    expect(out2.ops).toEqual([OP.ADD, OP.MUL]);
  });

  it("does not reorder a mixed-class chain across the boundary", () => {
    // 5 * 2 + 3 = 13  ; cannot move the 3 into the multiplicative
    // run. Canonicalised first run is {2, 5} (smallest first):
    //   2 * 5 + 3 = 13.
    const input = eq([5, 2, 3], [1, 1, 1], [OP.MUL, OP.ADD], 13);
    const out = canonicalizeEquation(input);
    expect(out.dice).toEqual([2, 5, 3]);
    expect(out.ops).toEqual([OP.MUL, OP.ADD]);
  });

  it("breaks ties on (base, exp, weight, origIndex) deterministically", () => {
    // Two equations with the same dice but different exp orderings on
    // duplicate dice values must canonicalise to *different* outputs
    // when the exps differ (the multiset (base, exp) does not match).
    const a = eq([2, 2, 3], [1, 2, 1], [OP.ADD, OP.ADD], 9); // 2 + 4 + 3 = 9
    const b = eq([2, 2, 3], [2, 1, 1], [OP.ADD, OP.ADD], 9); // 4 + 2 + 3 = 9
    const ca = canonicalizeEquation(a);
    const cb = canonicalizeEquation(b);
    // Both should canonicalise to: 2^1 + 2^2 + 3^1 = 9 (sorted base
    // asc; on equal base, lower exp first).
    expect(ca.dice).toEqual([2, 2, 3]);
    expect(ca.exps).toEqual([1, 2, 1]);
    expect(cb.dice).toEqual([2, 2, 3]);
    expect(cb.exps).toEqual([1, 2, 1]);
  });

  it("handles the leading-negative-weight edge by promoting the leftmost +1 operand", () => {
    // 5 - 2 - 3 = 0 : weights {5:+1, 2:-1, 3:-1}. After base sort:
    //   (2,-) (3,-) (5,+). First operand has weight -1, which can't
    // be the equation's start. Swap with first +1 operand → (5,+)
    // (3,-) (2,-) → 5 - 3 - 2 = 0. Same total, sort intent preserved
    // for the rest.
    const input = eq([5, 2, 3], [1, 1, 1], [OP.SUB, OP.SUB], 0);
    const out = canonicalizeEquation(input);
    expect(out.total).toBe(0);
    // The leading operand must be one of the originally-positive
    // weights (5 in this case).
    expect(out.dice[0]).toBe(5);
  });
});

describe("canonicalizeSolutions on real allSolutions output", () => {
  it("collapses arity-3 standard solutions and preserves multiplicity sum", () => {
    // Pick a target with many solutions to exercise the dedup.
    const dice = [2, 3, 5];
    const target = 17;
    const all = allSolutions(dice, target, STANDARD_MODE);
    const canonical = canonicalizeSolutions(all, (e) =>
      difficultyOfEquation(e, STANDARD_MODE),
    );

    // Multiplicity must sum to the original count.
    const totalMult = canonical.reduce((s, c) => s + c.multiplicity, 0);
    expect(totalMult).toBe(all.length);

    // Canonicals are unique by their key (we strip the multiplicity
    // for this assert and compare dice/exps/ops triples).
    const keys = canonical.map(
      (c) => `${c.equation.dice.join(",")}|${c.equation.exps.join(",")}|${c.equation.ops.join(",")}`,
    );
    expect(new Set(keys).size).toBe(keys.length);

    // We expect strict reduction (the input has lots of perm-equivs).
    expect(canonical.length).toBeLessThan(all.length);

    // Each canonical equation evaluates to the target (already
    // guarded inside canonicalizeEquation, but assert at the surface).
    for (const c of canonical) {
      expect(c.equation.total).toBe(target);
    }

    // Sorted ascending by difficulty.
    for (let i = 1; i < canonical.length; i += 1) {
      const prev = difficultyOfEquation(canonical[i - 1]!.equation, STANDARD_MODE);
      const cur = difficultyOfEquation(canonical[i]!.equation, STANDARD_MODE);
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
    }
  });

  it("collapses arity-4 Æther solutions meaningfully (>2× reduction)", () => {
    const dice = [2, 3, 5, 7];
    const target = 144;
    const all = allSolutions(dice, target, AETHER_MODE);
    const canonical = canonicalizeSolutions(all, (e) =>
      difficultyOfEquation(e, AETHER_MODE),
    );

    const totalMult = canonical.reduce((s, c) => s + c.multiplicity, 0);
    expect(totalMult).toBe(all.length);
    // Arity-4 with several commutative spans should reduce by at
    // least 2× — this is a soft bound that gives the test some
    // slack while still catching a regression that drops dedup.
    expect(canonical.length * 2).toBeLessThanOrEqual(all.length);
  }, 30_000);
});
