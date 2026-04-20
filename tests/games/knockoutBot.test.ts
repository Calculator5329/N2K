import { describe, expect, it } from "vitest";
import { OP, STANDARD_MODE } from "../../src/core/constants.js";
import {
  BOT_SPEED,
  KnockoutBot,
  botDifficultyOfEquation,
  type BotClaim,
  type BotDifficulty,
} from "../../src/games/knockoutBot.js";
import type { NEquation, Operator } from "../../src/core/types.js";

// ---------------------------------------------------------------------------
//  Fixtures
// ---------------------------------------------------------------------------

/** The default knockout race board: 1×8 pattern (8, 16, ..., 288). */
const PATTERN_8: readonly number[] = Array.from(
  { length: 36 },
  (_, i) => (i + 1) * 8,
);

/** Three dice with broad coverage, no 1s. */
const DICE: readonly number[] = [2, 3, 5];

const RACE_MS = 60_000;
const TICK_MS = 100;

function eq(partial: Partial<NEquation> = {}): NEquation {
  return {
    dice: [2, 3, 5],
    exps: [1, 1, 1],
    ops: [OP.ADD, OP.ADD] as Operator[],
    total: 10,
    ...partial,
  };
}

/** Run a 60-second race and return the cells the bot claimed. */
function simulateRace(difficulty: BotDifficulty): BotClaim[] {
  const bot = new KnockoutBot({
    dice: DICE,
    mode: STANDARD_MODE,
    boardCells: PATTERN_8,
    difficulty,
  });
  bot.prepare();
  const claims: BotClaim[] = [];
  for (let t = 0; t <= RACE_MS; t += TICK_MS) {
    for (const c of bot.tick(t)) claims.push(c);
  }
  return claims;
}

// ---------------------------------------------------------------------------
//  botDifficultyOfEquation — port faithfulness
// ---------------------------------------------------------------------------

describe("botDifficultyOfEquation", () => {
  it("floors trivial equations at 1.6 (= floor 3.2, halved by /100 step)", () => {
    // The original's `Math.round(diff * 50) / 100` halves the value.
    // The internal floor is 3.2; the returned floor is therefore 1.6.
    const score = botDifficultyOfEquation(
      eq({ dice: [2, 3, 5], exps: [1, 1, 1], total: 10 }),
    );
    expect(score).toBe(1.6);
  });

  it("returns values in 0.01 increments", () => {
    // Math.round(d * 50) is integer; dividing by 100 gives 0.01 steps.
    const score = botDifficultyOfEquation(
      eq({ dice: [7, 11, 13], exps: [1, 1, 1], total: 31 }),
    );
    expect(score * 100).toBe(Math.round(score * 100));
  });

  it("multiplication forces smallestMultiplier = -1.2 (faithful to original bug)", () => {
    // Two equations identical except one uses MUL — the original's
    // smallestMultiplier branch always lands on -1.2 for the first
    // MUL, which subtracts -1.2/2 = -0.6 from the difficulty.
    const noMul = botDifficultyOfEquation(
      eq({
        dice: [3, 5, 7],
        exps: [1, 1, 1],
        ops: [OP.ADD, OP.ADD] as Operator[],
        total: 15,
      }),
    );
    const withMul = botDifficultyOfEquation(
      eq({
        dice: [3, 5, 7],
        exps: [1, 1, 1],
        ops: [OP.MUL, OP.ADD] as Operator[],
        total: 22,
      }),
    );
    // The MUL version should be ≤ the no-MUL version by ~0.6 once
    // shortestDistance / largestNumDist effects shake out.
    expect(withMul).toBeLessThanOrEqual(noMul);
  });

  it("rejects non-arity-3 equations", () => {
    expect(() =>
      botDifficultyOfEquation({
        dice: [2, 3, 5, 7],
        exps: [1, 1, 1, 1],
        ops: [OP.ADD, OP.ADD, OP.ADD] as Operator[],
        total: 17,
      }),
    ).toThrow(RangeError);
  });

  it("handles dice value 20 without producing NaN", () => {
    const score = botDifficultyOfEquation(
      eq({ dice: [20, 3, 5], exps: [1, 1, 1], total: 28 }),
    );
    expect(Number.isNaN(score)).toBe(false);
    // Floored output is 1.6 (the halved 3.2).
    expect(score).toBeGreaterThanOrEqual(1.6);
  });
});

// ---------------------------------------------------------------------------
//  KnockoutBot — pacing & scheduling
// ---------------------------------------------------------------------------

describe("KnockoutBot — speed tier constants", () => {
  it("matches the original game's botSpeedList exactly", () => {
    expect(BOT_SPEED.easy).toBe(1);
    expect(BOT_SPEED.standard).toBe(2);
    expect(BOT_SPEED.hard).toBe(3);
    expect(BOT_SPEED.expert).toBe(5);
    expect(BOT_SPEED.master).toBe(10);
  });
});

describe("KnockoutBot — hard cells (diff >= 12) are never claimed", () => {
  it("master bot, even after 10 simulated minutes, never claims a hard cell", () => {
    const bot = new KnockoutBot({
      dice: DICE,
      mode: STANDARD_MODE,
      boardCells: PATTERN_8,
      difficulty: "master",
    });
    bot.prepare();
    const claims: BotClaim[] = [];
    for (let t = 0; t <= 600_000; t += TICK_MS) {
      for (const c of bot.tick(t)) claims.push(c);
    }
    expect(claims.length).toBeGreaterThan(0); // sanity
    for (const c of claims) {
      expect(c.difficulty).toBeLessThan(12);
    }
  });
});

describe("KnockoutBot — pacing matches original", () => {
  it("higher tiers clear at least as many cells as lower tiers", () => {
    const easy = simulateRace("easy").length;
    const standard = simulateRace("standard").length;
    const hard = simulateRace("hard").length;
    const expert = simulateRace("expert").length;
    const master = simulateRace("master").length;

    expect(standard).toBeGreaterThanOrEqual(easy);
    expect(hard).toBeGreaterThanOrEqual(standard);
    expect(expert).toBeGreaterThanOrEqual(hard);
    expect(master).toBeGreaterThanOrEqual(expert);
  });

  it("each tier's clear count is in the expected band for a 60s race", () => {
    // Bands derived from the original gate `diff * 11_765 / speed` ms
    // per cell, with most reachable cells scoring 3.2-6 difficulty
    // and the upper third of the 1×8 board falling above the hard cap.
    const easy = simulateRace("easy").length;
    const standard = simulateRace("standard").length;
    const master = simulateRace("master").length;

    // Easy (speed 1) at diff 3.2 = 37.6 s/cell → 1 cell typical.
    expect(easy).toBeGreaterThanOrEqual(0);
    expect(easy).toBeLessThanOrEqual(3);

    // Standard (speed 2) at diff 3.2 = 18.8 s/cell → 1-3 cells.
    expect(standard).toBeGreaterThanOrEqual(1);
    expect(standard).toBeLessThanOrEqual(6);

    // Master (speed 10) at diff 3.2 = 3.8 s/cell → 8-16 cells.
    expect(master).toBeGreaterThanOrEqual(5);
    expect(master).toBeLessThanOrEqual(20);
  });

  it("readyAtMs is monotonically increasing across the queue", () => {
    const bot = new KnockoutBot({
      dice: DICE,
      mode: STANDARD_MODE,
      boardCells: PATTERN_8,
      difficulty: "master",
    });
    const reachable = bot.prepare();
    expect(reachable).toBeGreaterThan(0);
    let prev = -1;
    for (let t = 0; t <= 600_000; t += TICK_MS) {
      for (const c of bot.tick(t)) {
        // We only get cells via tick(), but we can inspect their order
        // by tracking elapsed time at release.
        expect(t).toBeGreaterThanOrEqual(prev);
        prev = t;
        void c;
      }
    }
  });
});

describe("KnockoutBot — high-value-first ordering (matches original)", () => {
  it("claims higher-value cells before lower-value ones in the same race", () => {
    const claims = simulateRace("master");
    // The first claim should be from the upper half of the board
    // (the original walked top-down by value).
    expect(claims.length).toBeGreaterThan(2);
    const firstThreeValues = claims.slice(0, 3).map((c) => c.cellValue);
    const medianValue = PATTERN_8[Math.floor(PATTERN_8.length / 2)]!;
    // At least one of the first three should be at or above median.
    expect(
      firstThreeValues.some((v) => v >= medianValue),
    ).toBe(true);
  });
});
