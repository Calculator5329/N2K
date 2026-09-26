import { describe, expect, it } from "vitest";
import { OP } from "../src/core/constants.js";
import { ParseError, parseEquation, parseTypedExpression } from "../src/services/typedEquation.js";

// The Play race lets players type just the left side; the total is what it evaluates to.
describe("parseTypedExpression", () => {
  it("parses an expression without '=' and fills in its value, accepting × ÷ −", () => {
    const eq = parseTypedExpression("2^3 × 5 − 3");
    expect(eq.dice).toEqual([2, 5, 3]);
    expect(eq.exps).toEqual([3, 1, 1]);
    expect(eq.ops).toEqual([OP.MUL, OP.SUB]);
    expect(eq.total).toBe(37);
    expect(parseTypedExpression("12 ÷ 3 + 5 = 9").total).toBe(9);
  });

  // Æther rolls negative dice; players type them without parens.
  it("reads a leading minus as a negative first die, and − in the claimed total", () => {
    const eq = parseTypedExpression("-3 + 5 + 7");
    expect(eq.dice).toEqual([-3, 5, 7]);
    expect(eq.total).toBe(9);
    expect(parseTypedExpression("−3 − 5 − 7 = −15").total).toBe(-15);
    expect(parseTypedExpression("2 − 5 − 7 = \u221210").total).toBe(-10);
  });

  it("asks for parens when a leading minus meets an exponent", () => {
    expect(() => parseTypedExpression("-3^2 + 5 + 7")).toThrow(/\(-3\)\^2/);
  });

  it("refuses an expression that does not land on a whole number", () => {
    expect(() => parseTypedExpression("7 / 2 + 3")).toThrow(ParseError);
  });

  it("names division by zero instead of printing Infinity", () => {
    expect(() => parseTypedExpression("6 / 0 + 2")).toThrow(/division by zero/);
    expect(() => parseTypedExpression("6 / 0 + 2")).not.toThrow(/Infinity/);
  });

  it("counts positions from 1 in parse errors", () => {
    // The stray "?" is the 3rd character.
    expect(() => parseTypedExpression("2 ? 3 + 5")).toThrow(/position 3\b/);
  });

  it("leaves the dice count to the rules, so a two-dice entry parses", () => {
    expect(parseTypedExpression("2 + 3").dice).toEqual([2, 3]);
  });
});

// The CLI `explain` command reads full printed equations; the total is required.
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

  it("takes a naked minus only on the first die", () => {
    expect(parseEquation("-3 + 5 + 7 = 9").dice).toEqual([-3, 5, 7]);
    // After an operator, "-3" needs parens: "2 + (-3) + 5".
    expect(() => parseEquation("2 + -3 + 5 = 4")).toThrow(ParseError);
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
