import { describe, expect, it } from "vitest";
import { AETHER_MODE, OP, STANDARD_MODE } from "../src/core/constants.js";
import {
  difficultyBreakdown,
  difficultyOfEquation,
} from "../src/services/difficulty.js";
import type { NEquation, Operator } from "../src/core/types.js";

function eq(partial: Partial<NEquation> = {}): NEquation {
  return {
    dice: [2, 2, 2],
    exps: [0, 0, 0],
    ops: [OP.ADD, OP.ADD] as Operator[],
    total: 0,
    ...partial,
  };
}

describe("difficultyOfEquation (standard mode)", () => {
  it("rounds to two decimal places", () => {
    const score = difficultyOfEquation(eq({ total: 50 }), STANDARD_MODE);
    expect(Math.round(score * 100) / 100).toBe(score);
  });

  it("clamps absurdly hard equations to <= 100", () => {
    const score = difficultyOfEquation(
      eq({ dice: [6, 6, 6], exps: [7, 7, 7], total: 999_999 }),
      STANDARD_MODE,
    );
    expect(score).toBeLessThanOrEqual(100);
  });

  it("distinguishes ^0 from ^1 exponents (regression: Python `ones` bug)", () => {
    const a = difficultyOfEquation(
      eq({ dice: [5, 5, 5], exps: [0, 0, 0], total: 3 }),
      STANDARD_MODE,
    );
    const b = difficultyOfEquation(
      eq({ dice: [5, 5, 5], exps: [1, 1, 1], total: 15 }),
      STANDARD_MODE,
    );
    expect(a).not.toBe(b);
  });

  it("applies the x10 smoothing when a multiplied base is 10", () => {
    const withTen = difficultyOfEquation(
      eq({
        dice: [10, 5, 2],
        exps: [1, 1, 1],
        ops: [OP.MUL, OP.ADD],
        total: 52,
      }),
      STANDARD_MODE,
    );
    const withoutTen = difficultyOfEquation(
      eq({
        dice: [9, 5, 2],
        exps: [1, 1, 1],
        ops: [OP.MUL, OP.ADD],
        total: 47,
      }),
      STANDARD_MODE,
    );
    expect(withTen).toBeLessThan(withoutTen);
  });
});

describe("difficultyBreakdown (standard mode)", () => {
  it("agrees with difficultyOfEquation across a sweep", () => {
    const samples: NEquation[] = [
      eq({ total: 1 }),
      eq({ dice: [5, 5, 5], exps: [0, 0, 0], total: 3 }),
      eq({
        dice: [2, 3, 5],
        exps: [5, 0, 0],
        ops: [OP.ADD, OP.SUB],
        total: 27,
      }),
      eq({
        dice: [10, 5, 2],
        exps: [1, 1, 1],
        ops: [OP.MUL, OP.ADD],
        total: 52,
      }),
      eq({ dice: [6, 6, 6], exps: [7, 7, 7], total: 999_999 }),
    ];
    for (const sample of samples) {
      const breakdown = difficultyBreakdown(sample, STANDARD_MODE);
      expect(breakdown.final).toBe(difficultyOfEquation(sample, STANDARD_MODE));
    }
  });

  it("emits exactly 7 active terms in standard mode (no arity/negative/hugeExp)", () => {
    const breakdown = difficultyBreakdown(
      eq({
        dice: [2, 3, 5],
        exps: [5, 0, 0],
        ops: [OP.ADD, OP.SUB],
        total: 27,
      }),
      STANDARD_MODE,
    );
    expect(breakdown.terms).toHaveLength(7);
    const sum = breakdown.terms.reduce((acc, t) => acc + t.contribution, 0);
    expect(sum).toBeCloseTo(breakdown.rawSubtotal, 10);
  });

  it("records the ten-flag adjustment when a multiplied base is 10", () => {
    const withTen = difficultyBreakdown(
      eq({
        dice: [10, 5, 2],
        exps: [1, 1, 1],
        ops: [OP.MUL, OP.ADD],
        total: 52,
      }),
      STANDARD_MODE,
    );
    expect(withTen.adjustments.some((a) => a.id === "tenFlag")).toBe(true);

    const withoutTen = difficultyBreakdown(
      eq({
        dice: [9, 5, 2],
        exps: [1, 1, 1],
        ops: [OP.MUL, OP.ADD],
        total: 47,
      }),
      STANDARD_MODE,
    );
    expect(withoutTen.adjustments.some((a) => a.id === "tenFlag")).toBe(false);
  });

  it("records the upper-tail compression on absurdly hard equations", () => {
    const breakdown = difficultyBreakdown(
      eq({ dice: [6, 6, 6], exps: [7, 7, 7], total: 999_999 }),
      STANDARD_MODE,
    );
    expect(breakdown.final).toBeLessThanOrEqual(100);
    const ids = breakdown.adjustments.map((a) => a.id);
    expect(ids).toContain("upperTailCompression");
  });
});

describe("difficultyBreakdown (Æther mode)", () => {
  it("emits 10 terms when arity / negatives / huge exps are involved", () => {
    const breakdown = difficultyBreakdown(
      {
        dice: [-3, 5, 7, 11],
        exps: [2, 1, 1, 8],
        ops: [OP.ADD, OP.MUL, OP.SUB] as Operator[],
        total: 100,
      },
      AETHER_MODE,
    );
    // All 10 candidate terms have non-zero weight in Æther mode → all 10 fire.
    expect(breakdown.terms).toHaveLength(10);
    expect(breakdown.terms.find((t) => t.id === "arityPenalty")).toBeDefined();
    expect(breakdown.terms.find((t) => t.id === "negativeBasePenalty")).toBeDefined();
    expect(breakdown.terms.find((t) => t.id === "hugeExponentPenalty")).toBeDefined();
  });

  it("scores arity-3 Æther similarly to standard for shared inputs (within ±10pp on a sane equation)", () => {
    const equation: NEquation = {
      dice: [2, 3, 5],
      exps: [1, 1, 1],
      ops: [OP.ADD, OP.MUL] as Operator[],
      total: 25,
    };
    const std = difficultyOfEquation(equation, STANDARD_MODE);
    const aet = difficultyOfEquation(equation, AETHER_MODE);
    expect(Math.abs(std - aet)).toBeLessThan(10);
  });
});
