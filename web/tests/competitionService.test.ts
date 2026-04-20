/**
 * competitionService — adapter from `DifficultyMatrix` to the resolver
 * the pure `competition.ts` algorithm consumes.
 *
 * Standard-mode keys are the *depowered* sorted form (`4 → 2`,
 * `9 → 3`); Æther-mode keys preserve every face value as-is. These
 * tests pin both behaviors so future loader changes can't silently
 * shift the canonicalization.
 */
import { describe, expect, it } from "vitest";
import type { DifficultyMatrix } from "../src/core/types";
import { makeMatrixResolver } from "../src/services/competitionService";

function tinyMatrix(rows: Record<string, ReadonlyArray<number | null>>): DifficultyMatrix {
  return {
    totalMin: 1,
    totalMax: 5,
    dice: rows,
  };
}

describe("makeMatrixResolver — standard mode", () => {
  it("depowers face values before keying the matrix", () => {
    // The bake script writes `[2, 3, 4]` (standard) under the
    // depowered key `[2, 2, 3]` because 4 → 2 in standard mode.
    const matrix = tinyMatrix({ "2-2-3": [10, 20, 30, 40, 50] });
    const resolve = makeMatrixResolver(matrix, "standard");
    expect(resolve([2, 3, 4], 1)).toBe(10);
    expect(resolve([2, 3, 4], 5)).toBe(50);
  });

  it("returns null for triples missing from the matrix", () => {
    const matrix = tinyMatrix({ "2-2-3": [10, 20, 30, 40, 50] });
    const resolve = makeMatrixResolver(matrix, "standard");
    expect(resolve([5, 7, 11], 1)).toBeNull();
  });

  it("returns null for targets outside the matrix range", () => {
    const matrix = tinyMatrix({ "2-2-3": [10, 20, 30, 40, 50] });
    const resolve = makeMatrixResolver(matrix, "standard");
    expect(resolve([2, 3, 4], 0)).toBeNull();
    expect(resolve([2, 3, 4], 6)).toBeNull();
  });
});

describe("makeMatrixResolver — aether mode", () => {
  it("does NOT depower face values (4 stays 4)", () => {
    // Same dice, but Æther preserves every face.
    const matrix = tinyMatrix({ "2-3-4": [99, 99, 99, 99, 99] });
    const resolve = makeMatrixResolver(matrix, "aether");
    expect(resolve([2, 3, 4], 1)).toBe(99);
    // The standard depowered key MUST NOT be consulted.
    expect(resolve([2, 2, 3], 1)).toBeNull();
  });

  it("sorts dice before keying so input order doesn't matter", () => {
    const matrix = tinyMatrix({ "2-3-4": [11, 22, 33, 44, 55] });
    const resolve = makeMatrixResolver(matrix, "aether");
    expect(resolve([4, 2, 3], 2)).toBe(22);
    expect(resolve([3, 4, 2], 4)).toBe(44);
  });
});
