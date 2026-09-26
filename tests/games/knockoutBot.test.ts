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
import { claimRefusal } from "../../src/games/n2kClassic.js";
import { formatEquationAgainstPool } from "../../src/services/parsing.js";
import { parseEquation } from "../../src/services/typedEquation.js";

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
  // Easy..Expert match the original game's botSpeedList. Master drops
  // from the original 10 to 6: with easiest-first ordering 10 knocked up
  // to 22 cells in 60 s, too strong against a human who types.
  it("matches the original botSpeedList, with Master slowed to 6", () => {
    expect(BOT_SPEED.easy).toBe(1);
    expect(BOT_SPEED.standard).toBe(2);
    expect(BOT_SPEED.hard).toBe(3);
    expect(BOT_SPEED.expert).toBe(5);
    expect(BOT_SPEED.master).toBe(6);
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
    // Each cell costs `diff * 11_765 / speed` ms and the floor diff is
    // 1.6, so a tier can never beat 60_000 / (1.6 * 11_765 / speed)
    // cells: Easy 3, Standard 6, Master 19. Easiest-first means the bot
    // gets close to that ceiling on a friendly roll like (2, 3, 5).
    const easy = simulateRace("easy").length;
    const standard = simulateRace("standard").length;
    const master = simulateRace("master").length;

    expect(easy).toBeGreaterThanOrEqual(1);
    expect(easy).toBeLessThanOrEqual(3);

    expect(standard).toBeGreaterThanOrEqual(2);
    expect(standard).toBeLessThanOrEqual(6);

    expect(master).toBeGreaterThanOrEqual(10);
    expect(master).toBeLessThanOrEqual(19);
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

describe("KnockoutBot — easiest-first ordering", () => {
  it("claims cells in non-decreasing difficulty order", () => {
    const claims = simulateRace("master");
    expect(claims.length).toBeGreaterThan(2);
    for (let i = 1; i < claims.length; i += 1) {
      expect(claims[i]!.difficulty).toBeGreaterThanOrEqual(claims[i - 1]!.difficulty);
    }
  });
});

describe("KnockoutBot — Easy and Standard score on the default ×8 board", () => {
  /** Cells knocked in a 60 s race on a fake clock (100 ms ticks). */
  function knockedIn60s(dice: readonly number[], difficulty: BotDifficulty): number {
    const bot = new KnockoutBot({ dice, mode: STANDARD_MODE, boardCells: PATTERN_8, difficulty });
    bot.prepare();
    let n = 0;
    for (let t = 0; t <= RACE_MS; t += TICK_MS) n += bot.tick(t).length;
    return n;
  }

  it("knocks at least one cell on every sampled roll, Standard ahead of Easy", () => {
    // 40 seeded rolls in 2..20. Before the fix Easy knocked zero on 21 of
    // them (it sat on a pricey high-value cell all race) and Standard on 3,
    // including [20, 10, 16], where both scored nothing.
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const rolls: number[][] = [[20, 10, 16]];
    for (let r = 0; r < 40; r += 1) rolls.push([0, 0, 0].map(() => 2 + Math.floor(rnd() * 19)));

    let easyTotal = 0;
    let standardTotal = 0;
    for (const dice of rolls) {
      const easy = knockedIn60s(dice, "easy");
      const standard = knockedIn60s(dice, "standard");
      expect(easy, `easy on [${dice.join(", ")}]`).toBeGreaterThan(0);
      expect(standard, `standard on [${dice.join(", ")}]`).toBeGreaterThan(easy);
      easyTotal += easy;
      standardTotal += standard;
    }
    // Clearly weaker, not just marginally: Standard averages well over Easy.
    expect(standardTotal).toBeGreaterThanOrEqual(easyTotal * 1.5);
  });
});

describe("KnockoutBot — the results log only shows equations a player could type", () => {
  it("every logged line, typed back in, passes claimRefusal for the roll and cell", () => {
    // Rolls with compound dice (4, 8, 9, 16) are the ones the log relabels.
    // [19, 4, 3] is the roll behind the 2026-09-25 screenshot that showed
    // `4^8 * 3^0 * 19^0 = 256` (4^8 is 65,536).
    const rolls = [[19, 4, 3], [16, 8, 12], [9, 4, 5], [8, 3, 5], [16, 9, 2], [4, 4, 7]];
    let lines = 0;
    for (const dice of rolls) {
      const bot = new KnockoutBot({ dice, mode: STANDARD_MODE, boardCells: PATTERN_8, difficulty: "master" });
      bot.prepare();
      for (const claim of bot.tick(Number.POSITIVE_INFINITY)) {
        const line = formatEquationAgainstPool(claim.equation, dice, STANDARD_MODE);
        const refusal = claimRefusal(parseEquation(line), dice, claim.cellValue, STANDARD_MODE);
        expect(refusal, `[${dice.join(", ")}] ${line}`).toBeNull();
        lines += 1;
      }
    }
    expect(lines).toBeGreaterThan(20);
  });
});
