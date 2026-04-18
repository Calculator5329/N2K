import { describe, expect, it } from "vitest";
import { OP } from "../src/core/constants.js";
import {
  formatBase,
  formatEquation,
  formatExpression,
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
