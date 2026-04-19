import { describe, expect, it } from "vitest";
import { OP } from "../../src/core/constants.js";
import { ParseError, parseEquation } from "../../src/cli/parseEquation.js";

describe("parseEquation", () => {
  it("parses a simple 3-arity equation (left-to-right semantics: 2+3=5, 5*5=25)", () => {
    const eq = parseEquation("2 + 3 * 5 = 25");
    expect(eq.dice).toEqual([2, 3, 5]);
    expect(eq.exps).toEqual([1, 1, 1]);
    expect(eq.ops).toEqual([OP.ADD, OP.MUL]);
    expect(eq.total).toBe(25);
  });

  it("parses exponents", () => {
    const eq = parseEquation("2 * 3 ^ 2 * 5 = 90");
    expect(eq.exps).toEqual([1, 2, 1]);
    expect(eq.ops).toEqual([OP.MUL, OP.MUL]);
    expect(eq.total).toBe(90);
  });

  it("parses negative bases wrapped in parens", () => {
    const eq = parseEquation("(-3)^2 + 5 * 7 - 2 = 96");
    expect(eq.dice).toEqual([-3, 5, 7, 2]);
    expect(eq.exps).toEqual([2, 1, 1, 1]);
    expect(eq.total).toBe(96);
  });

  it("is whitespace-flexible", () => {
    const eq = parseEquation("2*3^2*5=90");
    expect(eq.dice).toEqual([2, 3, 5]);
    expect(eq.exps).toEqual([1, 2, 1]);
    expect(eq.total).toBe(90);
  });

  it("parses negative totals", () => {
    const eq = parseEquation("2 - 5 - 3 = -6");
    expect(eq.total).toBe(-6);
  });

  it("rejects an equation whose evaluation does not match the claimed total", () => {
    expect(() => parseEquation("2 + 3 + 5 = 999")).toThrow(ParseError);
    expect(() => parseEquation("2 + 3 + 5 = 999")).toThrow(/evaluates to 10/);
  });

  it("rejects naked negatives without parens", () => {
    // "- 3" is treated as a subtraction operator + a base, so this shouldn't
    // parse as a starting negative die.
    expect(() => parseEquation("-3 + 5 + 7 = 9")).toThrow(ParseError);
  });

  it("rejects too few terms (needs 3..5 dice)", () => {
    expect(() => parseEquation("2 + 3 = 5")).toThrow(/3..5/);
  });

  it("rejects trailing junk", () => {
    expect(() => parseEquation("2 + 3 + 5 = 10 oops")).toThrow(/trailing/);
  });

  it("rejects missing =", () => {
    expect(() => parseEquation("2 + 3 + 5 10")).toThrow();
  });

  it("rejects invalid operator", () => {
    expect(() => parseEquation("2 ? 3 + 5 = 10")).toThrow();
  });

  it("rejects malformed parens", () => {
    expect(() => parseEquation("(3) + 5 + 2 = 10")).toThrow(/negative/);
    expect(() => parseEquation("(-3 + 5 + 2 = 10")).toThrow(/\)/);
  });

  it("validates total match for division", () => {
    const eq = parseEquation("12 / 3 + 4 = 8");
    expect(eq.total).toBe(8);
    expect(() => parseEquation("12 / 3 + 4 = 7")).toThrow();
  });
});
