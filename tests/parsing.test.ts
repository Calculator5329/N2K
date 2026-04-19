import { describe, expect, it } from "vitest";
import {
  AETHER_MODE,
  OP,
  STANDARD_MODE,
  effectivePool,
  relabelDepoweredDice,
} from "../src/core/constants.js";
import {
  formatBase,
  formatEquation,
  formatEquationAgainstPool,
  formatExpression,
  formatExpressionAgainstPool,
} from "../src/services/parsing.js";

describe("formatBase", () => {
  it("renders ^0 as 1", () => {
    expect(formatBase(7, 0)).toBe("1");
  });
  it("renders ^1 as the bare base", () => {
    expect(formatBase(7, 1)).toBe("7");
  });
  it("renders higher exponents with ^", () => {
    expect(formatBase(2, 5)).toBe("2^5");
  });
  it("wraps negative bases in parens", () => {
    expect(formatBase(-3, 2)).toBe("(-3)^2");
    expect(formatBase(-3, 1)).toBe("(-3)");
  });
});

describe("formatEquation", () => {
  it("renders a standard 3-arity equation", () => {
    expect(
      formatEquation({
        dice: [2, 3, 5],
        exps: [1, 1, 1],
        ops: [OP.ADD, OP.MUL],
        total: 25,
      }),
    ).toBe("2 + 3 * 5 = 25");
  });

  it("renders a 4-arity Æther equation with a negative base", () => {
    expect(
      formatEquation({
        dice: [-3, 5, 7, 2],
        exps: [2, 1, 1, 1],
        ops: [OP.ADD, OP.MUL, OP.SUB],
        total: 96,
      }),
    ).toBe("(-3)^2 + 5 * 7 - 2 = 96");
  });

  it("formatExpression strips the = total tail", () => {
    expect(
      formatExpression({
        dice: [2, 3, 5],
        exps: [1, 1, 1],
        ops: [OP.ADD, OP.MUL],
        total: 25,
      }),
    ).toBe("2 + 3 * 5");
  });

  it("rejects malformed equations", () => {
    expect(() =>
      formatEquation({
        dice: [2, 3, 5],
        exps: [1, 1],
        ops: [OP.ADD, OP.MUL],
        total: 25,
      }),
    ).toThrow();
  });
});

describe("effectivePool", () => {
  it("depowers compound dice in standard mode", () => {
    expect(effectivePool([16, 8, 12], STANDARD_MODE)).toEqual([2, 2, 12]);
    expect(effectivePool([4, 9, 3], STANDARD_MODE)).toEqual([2, 3, 3]);
  });
  it("is a no-op in Æther mode", () => {
    expect(effectivePool([16, 8, 12], AETHER_MODE)).toEqual([16, 8, 12]);
    expect(effectivePool([-3, 4, 9], AETHER_MODE)).toEqual([-3, 4, 9]);
  });
});

describe("relabelDepoweredDice", () => {
  it("re-labels depowered 2s back to the largest matching compound first", () => {
    expect(
      relabelDepoweredDice([2, 2, 12], [16, 8, 12], STANDARD_MODE),
    ).toEqual([16, 8, 12]);
  });
  it("prefers larger compounds when multiple originals depower to the same value", () => {
    // Pool has 4 (→2), 8 (→2), 16 (→2). Equation needs three 2s; the
    // largest compound binds first so the rendered order is 16, 8, 4.
    expect(
      relabelDepoweredDice([2, 2, 2], [4, 8, 16], STANDARD_MODE),
    ).toEqual([16, 8, 4]);
  });
  it("is a no-op when the dice are already the originals", () => {
    expect(
      relabelDepoweredDice([3, 5, 7], [3, 5, 7], STANDARD_MODE),
    ).toEqual([3, 5, 7]);
  });
  it("falls back to the equation value when no compound is available", () => {
    // Equation depowered to [2, 2, 12], pool only has one 8 (→2). The
    // first 2 binds to 8; the second has no match, render as 2.
    expect(
      relabelDepoweredDice([2, 2, 12], [8, 12, 5], STANDARD_MODE),
    ).toEqual([8, 2, 12]);
  });
  it("is a no-op in Æther mode", () => {
    expect(
      relabelDepoweredDice([2, 2, 12], [16, 8, 12], AETHER_MODE),
    ).toEqual([2, 2, 12]);
  });
});

describe("formatEquationAgainstPool", () => {
  it("renders depowered equation back in original-pool form", () => {
    // Equation: 2^2 + 2 / 12 = 4 + 0.166... no, use a real one:
    // (16^0) + (8^1) / (12^1) = 1 + 8/12 — keep it integer:
    // 16^1 - 8^1 + 12^1 = 20 expressed against pool [16, 8, 12].
    // Solver would have produced dice=[2,2,12]:
    expect(
      formatEquationAgainstPool(
        {
          dice: [2, 2, 12],
          exps: [1, 1, 1],
          ops: [OP.SUB, OP.ADD],
          total: 20,
        },
        [16, 8, 12],
        STANDARD_MODE,
      ),
    ).toBe("16 - 8 + 12 = 20");
  });
  it("formatExpressionAgainstPool drops the = total tail", () => {
    expect(
      formatExpressionAgainstPool(
        {
          dice: [2, 2, 12],
          exps: [1, 1, 1],
          ops: [OP.SUB, OP.ADD],
          total: 20,
        },
        [16, 8, 12],
        STANDARD_MODE,
      ),
    ).toBe("16 - 8 + 12");
  });
  it("is a passthrough in Æther mode", () => {
    expect(
      formatEquationAgainstPool(
        {
          dice: [-3, 5, 7, 2],
          exps: [2, 1, 1, 1],
          ops: [OP.ADD, OP.MUL, OP.SUB],
          total: 96,
        },
        [-3, 5, 7, 2],
        AETHER_MODE,
      ),
    ).toBe("(-3)^2 + 5 * 7 - 2 = 96");
  });
});
