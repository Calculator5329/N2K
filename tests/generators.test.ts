import { describe, expect, it } from "vitest";
import { AETHER_MODE, BOARD, STANDARD_MODE } from "../src/core/constants.js";
import {
  generatePatternBoard,
  generateRandomBoard,
  generateRandomDice,
  isLegalDiceForMode,
} from "../src/services/generators.js";

/** A deterministic LCG so test outputs are reproducible. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("isLegalDiceForMode", () => {
  it("standard mode rejects all-same triples and 2+ ones", () => {
    expect(isLegalDiceForMode([5, 5, 5], STANDARD_MODE)).toBe(false);
    expect(isLegalDiceForMode([1, 1, 4], STANDARD_MODE)).toBe(false);
    expect(isLegalDiceForMode([1, 1, 1], STANDARD_MODE)).toBe(false);
    expect(isLegalDiceForMode([3, 3, 1], STANDARD_MODE)).toBe(true);
    expect(isLegalDiceForMode([2, 3, 5], STANDARD_MODE)).toBe(true);
  });

  it("Æther mode accepts everything legal in standard plus arity 4-5 and negatives", () => {
    expect(isLegalDiceForMode([5, 5, 5], AETHER_MODE)).toBe(true);
    expect(isLegalDiceForMode([-3, 5, 7, 2], AETHER_MODE)).toBe(true);
  });
});

describe("generateRandomBoard", () => {
  it("yields BOARD.size unique sorted ints in the requested range", () => {
    const board = generateRandomBoard(STANDARD_MODE, {
      range: { min: 1, max: 100 },
      rng: seededRng(42),
    });
    expect(board).toHaveLength(BOARD.size);
    expect(new Set(board).size).toBe(BOARD.size);
    for (let i = 1; i < board.length; i += 1) {
      expect(board[i]).toBeGreaterThan(board[i - 1]!);
    }
    for (const v of board) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("throws when the range is too small", () => {
    expect(() =>
      generateRandomBoard(STANDARD_MODE, {
        range: { min: 1, max: 10 },
      }),
    ).toThrow();
  });
});

describe("generatePatternBoard", () => {
  it("single-multiple yields a simple AP of length BOARD.size", () => {
    const board = generatePatternBoard([3], 0);
    expect(board).toHaveLength(BOARD.size);
    expect(board[0]).toBe(0);
    expect(board[1]).toBe(3);
    expect(board[2]).toBe(6);
  });

  it("rejects empty / overlong multiples", () => {
    expect(() => generatePatternBoard([], 0)).toThrow();
    expect(() => generatePatternBoard([1, 2, 3, 4], 0)).toThrow();
  });
});

describe("generateRandomDice", () => {
  it("respects standard-mode legality across many rolls", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 50; i += 1) {
      const dice = generateRandomDice(STANDARD_MODE, {
        range: { min: 1, max: 6 },
        rng,
      });
      expect(dice).toHaveLength(3);
      expect(isLegalDiceForMode(dice, STANDARD_MODE)).toBe(true);
    }
  });

  it("Æther mode supports arity 4 and 5", () => {
    const arity4 = generateRandomDice(AETHER_MODE, { arity: 4, rng: seededRng(1) });
    expect(arity4).toHaveLength(4);
    const arity5 = generateRandomDice(AETHER_MODE, { arity: 5, rng: seededRng(2) });
    expect(arity5).toHaveLength(5);
  });
});
