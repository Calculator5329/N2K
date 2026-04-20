/**
 * Targeted coverage for the v3.1+ stratifier and its `spice` knob.
 *
 * The full algorithm is exercised end-to-end by `tests/exporter.test.ts`
 * and the web-side `tests/CompositionStore.test.ts` integration; this
 * file focuses on the structural guarantees we rely on in the UI:
 *
 *   1. Spice 0 (legacy) keeps every round in the easier half.
 *   2. Spice 1 (default) actually spreads rounds across the difficulty
 *      distribution — round N is harder than round 1.
 *   3. The output never duplicates dice across rounds, regardless of
 *      spice value.
 *   4. Within any round, P1 and P2 never share more than one dice face
 *      value (gameplay leak — equations spoken aloud would carry over).
 *   5. The `variance` knob controls per-round score spread:
 *      - "tight" gives small per-round gaps,
 *      - "varied" gives noticeably larger per-round gaps,
 *      and in both cases the whole-card totals stay close (the
 *      end-of-card balancer cancels per-round wobbles).
 */
import { describe, expect, it } from "vitest";
import {
  generateBalancedRolls,
  type DifficultyResolver,
} from "../src/services/competition.js";
import type { DiceTriple } from "../src/core/types.js";

/**
 * Synthetic resolver: every dice triple has a deterministic
 * "difficulty" derived from its sum, mapped onto `[0, 100]`. Higher
 * dice = harder cells. Targets don't matter here — we only need a
 * stable, monotonic difficulty signal so we can measure stratification.
 */
function syntheticResolver(): DifficultyResolver {
  return (dice) => {
    const sum = dice[0] + dice[1] + dice[2];
    // Rescale 6..60 → 0..100.
    return Math.max(0, Math.min(100, ((sum - 6) / (60 - 6)) * 100));
  };
}

/** Generate every legal `(a, b, c)` in `[2..20]` (no all-same triples). */
function bigCandidatePool(): readonly DiceTriple[] {
  const out: DiceTriple[] = [];
  for (let a = 2; a <= 20; a += 1) {
    for (let b = a; b <= 20; b += 1) {
      for (let c = b; c <= 20; c += 1) {
        if (a === b && b === c) continue;
        out.push([a, b, c]);
      }
    }
  }
  return out;
}

const board: readonly number[] = Array.from({ length: 36 }, (_, i) => i + 1);

/** Tiny seeded RNG so the leak test is deterministic across CI runs. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function avgDifficulty(round: {
  readonly p1Difficulty: number;
  readonly p2Difficulty: number;
}): number {
  return (round.p1Difficulty + round.p2Difficulty) / 2;
}

describe("generateBalancedRolls — spice", () => {
  it("spice=0 keeps every round in the easier half of the distribution", () => {
    const result = generateBalancedRolls(
      board,
      bigCandidatePool(),
      4,
      syntheticResolver(),
      { spice: 0, rng: () => 0.5 },
    );
    // With spice=0 the stratifier looks at the easier half, so the
    // hardest round should still sit comfortably below the mid-point
    // of the full [0, 100] difficulty range.
    const hardest = Math.max(...result.rounds.map(avgDifficulty));
    expect(hardest).toBeLessThan(50);
  });

  it("spice=1 spreads rounds across the full distribution", () => {
    const result = generateBalancedRolls(
      board,
      bigCandidatePool(),
      4,
      syntheticResolver(),
      { spice: 1, rng: () => 0.5 },
    );
    const sortedAvgs = result.rounds
      .map(avgDifficulty)
      .sort((a, b) => a - b);
    // Round 1 to round 4 should span a noticeable difficulty range.
    // Tight bound: at least 25 difficulty points between easiest and
    // hardest pair (well under what we observed with spice=1, but
    // wide enough to fail any regression that re-collapses the pool).
    const spread = sortedAvgs[sortedAvgs.length - 1]! - sortedAvgs[0]!;
    expect(spread).toBeGreaterThan(25);
  });

  it("P1 and P2 share at most one dice face per round", () => {
    function sharedFaces(
      a: readonly [number, number, number],
      b: readonly [number, number, number],
    ): number {
      const remaining = [b[0], b[1], b[2]];
      let shared = 0;
      for (const face of a) {
        const idx = remaining.indexOf(face);
        if (idx !== -1) {
          shared += 1;
          remaining.splice(idx, 1);
        }
      }
      return shared;
    }

    for (const spice of [0, 0.5, 1]) {
      for (let seed = 0; seed < 10; seed += 1) {
        const rng = mulberry32(seed);
        const result = generateBalancedRolls(
          board,
          bigCandidatePool(),
          4,
          syntheticResolver(),
          { spice, rng },
        );
        for (const r of result.rounds) {
          expect(sharedFaces(r.p1, r.p2)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("never reuses a dice triple across rounds, regardless of spice", () => {
    for (const spice of [0, 0.5, 1]) {
      const result = generateBalancedRolls(
        board,
        bigCandidatePool(),
        4,
        syntheticResolver(),
        { spice, rng: () => 0.5 },
      );
      const seen = new Set<string>();
      for (const r of result.rounds) {
        for (const d of [r.p1, r.p2] as const) {
          const key = `${d[0]}-${d[1]}-${d[2]}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    }
  });

  it("variance=tight produces smaller per-round score gaps than variance=varied", () => {
    function avgPerRoundGap(variance: "tight" | "balanced" | "varied"): number {
      let total = 0;
      let count = 0;
      for (let seed = 0; seed < 12; seed += 1) {
        const rng = mulberry32(seed);
        const result = generateBalancedRolls(
          board,
          bigCandidatePool(),
          4,
          syntheticResolver(),
          { spice: 1, variance, rng },
        );
        for (const r of result.rounds) {
          total += Math.abs(r.p1ExpectedScore - r.p2ExpectedScore);
          count += 1;
        }
      }
      return total / count;
    }

    const tight = avgPerRoundGap("tight");
    const balanced = avgPerRoundGap("balanced");
    const varied = avgPerRoundGap("varied");

    // Strict ordering: more variance = bigger per-round wobble.
    expect(tight).toBeLessThan(balanced);
    expect(balanced).toBeLessThan(varied);
    // And the spread should be meaningful, not just numerical noise.
    expect(varied - tight).toBeGreaterThan(1);
  });

  it("does not throw when a stratified bucket yields exactly one valid pair", () => {
    // Regression: `pickBalancedPair` previously computed
    //   sampleSize = max(2, min(candidates.length, ceil(candidates.length / 3)))
    // which forced sampleSize >= 2 even when only one filtered pair
    // survived in a bucket. `pickIdx` could then be 1 and
    // `candidates[1].pair` threw "Cannot read properties of undefined
    // (reading 'pair')". With a tiny pool sized to exactly rounds*2,
    // every bucket has size 2 -> exactly one pair, so the bug fired
    // ~50% of the time per round (RNG-dependent).
    const tinyPool: readonly DiceTriple[] = [
      [2, 3, 4],
      [3, 4, 5],
      [4, 5, 6],
      [5, 6, 7],
      [6, 7, 8],
      [7, 8, 9],
      [8, 9, 10],
      [9, 10, 11],
    ];
    for (const variance of ["tight", "balanced", "varied"] as const) {
      for (let seed = 0; seed < 50; seed += 1) {
        const rng = mulberry32(seed);
        expect(() =>
          generateBalancedRolls(board, tinyPool, 4, syntheticResolver(), {
            spice: 1,
            variance,
            rng,
          }),
        ).not.toThrow();
      }
    }
  });

  it("whole-card totals are bounded by the worst per-round gap, in every variance mode", () => {
    // Subset-sum lower bound: with N rounds and signed per-round gaps,
    // the optimal balancer can always flip the single worst-offender
    // round by itself, so the residual total-delta never exceeds the
    // largest single per-round gap (within rounding noise). This is
    // the structural guarantee `balanceExactly` provides, regardless
    // of how lopsided individual rounds get.
    for (const variance of ["tight", "balanced", "varied"] as const) {
      for (let seed = 0; seed < 8; seed += 1) {
        const rng = mulberry32(seed);
        const result = generateBalancedRolls(
          board,
          bigCandidatePool(),
          4,
          syntheticResolver(),
          { spice: 1, variance, rng },
        );
        const gaps = result.rounds.map((r) =>
          Math.abs(r.p1ExpectedScore - r.p2ExpectedScore),
        );
        const maxGap = Math.max(...gaps);
        const residual = Math.abs(result.expectedScoreDelta);
        // `+ 1` covers float-rounding noise from `round2`.
        expect(residual).toBeLessThanOrEqual(maxGap + 1);
      }
    }
  });
});
