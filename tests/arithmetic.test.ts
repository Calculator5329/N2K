import { describe, expect, it } from "vitest";
import { OP } from "../src/core/constants.js";
import {
  allOpTuples,
  applyOperator,
  distinctPermutations,
  enumerateUnorderedTuples,
  evaluateLeftToRight,
  permutations,
  unorderedSubsets,
} from "../src/services/arithmetic.js";

describe("applyOperator", () => {
  it("computes each operator", () => {
    expect(applyOperator(7, 3, OP.ADD)).toBe(10);
    expect(applyOperator(7, 3, OP.SUB)).toBe(4);
    expect(applyOperator(7, 3, OP.MUL)).toBe(21);
    expect(applyOperator(8, 2, OP.DIV)).toBe(4);
  });

  it("throws on unknown operator codes", () => {
    expect(() => applyOperator(1, 1, 99 as 1)).toThrow();
  });
});

describe("evaluateLeftToRight", () => {
  it("evaluates with strict left-to-right semantics (no precedence)", () => {
    // 2 + 3 * 5 = 25 left-to-right (vs 17 with precedence)
    expect(evaluateLeftToRight([2, 3, 5], [OP.ADD, OP.MUL])).toBe(25);
  });

  it("returns NaN on divide-by-zero", () => {
    expect(Number.isNaN(evaluateLeftToRight([5, 0], [OP.DIV]))).toBe(true);
  });

  it("returns NaN when an intermediate exceeds safeMagnitude", () => {
    expect(Number.isNaN(evaluateLeftToRight([1000, 1000], [OP.MUL], 100))).toBe(true);
  });

  it("rejects mismatched ops/values lengths", () => {
    expect(() => evaluateLeftToRight([1, 2, 3], [OP.ADD])).toThrow();
  });
});

describe("permutations", () => {
  it("yields n! permutations for distinct items", () => {
    const out = [...permutations([1, 2, 3])];
    expect(out).toHaveLength(6);
    const keys = new Set(out.map((p) => p.join(",")));
    expect(keys.size).toBe(6);
  });
});

describe("distinctPermutations", () => {
  it("collapses duplicates", () => {
    expect([...distinctPermutations([2, 2, 2])]).toHaveLength(1);
    expect([...distinctPermutations([2, 2, 3])]).toHaveLength(3);
    expect([...distinctPermutations([2, 3, 5])]).toHaveLength(6);
  });
});

describe("unorderedSubsets", () => {
  it("enumerates k-subsets in positional order", () => {
    const out = [...unorderedSubsets(["a", "b", "c", "d"], 2)];
    expect(out).toHaveLength(6);
    expect(out.map((s) => s.join(""))).toEqual(["ab", "ac", "ad", "bc", "bd", "cd"]);
  });

  it("yields nothing for impossible k", () => {
    expect([...unorderedSubsets([1, 2], 5)]).toEqual([]);
  });
});

describe("enumerateUnorderedTuples", () => {
  it("matches the unordered binomial count for arity 3 in [2..4]", () => {
    // Multiset selections C(n+k-1, k) with n=3 values and k=3 picks = 10.
    const out = enumerateUnorderedTuples(3, 2, 4);
    expect(out).toHaveLength(10);
  });
});

describe("allOpTuples", () => {
  it("generates 4^n entries", () => {
    expect(allOpTuples(2)).toHaveLength(16);
    expect(allOpTuples(3)).toHaveLength(64);
  });
});
