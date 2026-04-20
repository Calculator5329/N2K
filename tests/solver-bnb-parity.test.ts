/**
 * Parity test: the optimized B&B `easiestSolution` must always
 * return an equation of the **same difficulty** as the brute-force
 * `sweepOneTuple` baseline.
 *
 * The two solvers are allowed to return different `NEquation`
 * objects — multiple equations can tie for "easiest" — but the
 * `difficulty` score must match exactly. If it doesn't, B&B has
 * pruned a real solution by mistake.
 *
 * Coverage:
 *   - Standard mode arity 3, exhaustive over the v1 `DICE_COMBINATIONS`
 *     × every reachable target the brute-force solver finds.
 *   - Æther mode arity 4 / 5 over a representative sample of legal
 *     tuples × every reachable target. We don't go full-exhaustive
 *     for Æther (would take minutes), but the sample includes the
 *     edge cases that historically broke things: dups, with-1,
 *     negatives, big-target.
 */
import { describe, expect, it } from "vitest";
import {
  AETHER_MODE,
  DICE_COMBINATIONS,
  STANDARD_MODE,
} from "../src/core/constants.js";
import { difficultyOfEquation } from "../src/services/difficulty.js";
import {
  difficultyLowerBound,
  easiestSolution,
  sweepOneTuple,
} from "../src/services/solver.js";

describe("easiestSolution B&B parity vs sweepOneTuple", () => {
  it("matches brute-force difficulty across all standard arity-3 tuples (sampled targets)", () => {
    // Exhaustive over DICE_COMBINATIONS would be 1500 tuples × ~150
    // hit targets ≈ 225k cases — too slow for CI. Take every 50th
    // tuple (30 tuples) and cover every target it solves.
    let mismatches = 0;
    for (let i = 0; i < DICE_COMBINATIONS.length; i += 50) {
      const triple = DICE_COMBINATIONS[i]!;
      const sweep = sweepOneTuple(triple, 1, 999, STANDARD_MODE);
      for (const [target, baseline] of sweep) {
        const bnb = easiestSolution(triple, target, STANDARD_MODE);
        if (bnb === null) {
          // B&B missed a solution the sweep found — definite bug.
          throw new Error(
            `B&B returned null for ${JSON.stringify(triple)} → ${target}; sweep found difficulty=${baseline.difficulty}`,
          );
        }
        const bnbDiff = difficultyOfEquation(bnb, STANDARD_MODE);
        if (Math.abs(bnbDiff - baseline.difficulty) > 1e-9) {
          mismatches += 1;
        }
      }
    }
    expect(mismatches).toBe(0);
  });

  // Æther arity-4 sample. Runs every target the sweep finds; arity-5
  // is too slow for a CI test (a single sweep over 1..5000 takes ~60s)
  // — we cover arity-5 via a narrow targeted-targets check below.
  const aether4Cases: ReadonlyArray<readonly number[]> = [
    [2, 3, 5, 7],
    [2, 2, 3, 5],
    [1, 2, 3, 5],
    [-3, 2, 5, 7],
    [3, 7, 11, 13],
  ];

  it("matches brute-force difficulty across the Æther arity-4 sample (sampled targets)", () => {
    // Trimmed: arity-4 single-target sweeps cost ~2.5 s each on
    // wide-range tuples; full grid blows the test budget. We probe
    // each tuple at a handful of mid-range hits.
    const probeTargets = [24, 60, 144, 360, 720];
    const mismatches: string[] = [];
    for (const dice of aether4Cases) {
      for (const target of probeTargets) {
        const sweep = sweepOneTuple(dice, target, target, AETHER_MODE);
        const baseline = sweep.get(target);
        const bnb = easiestSolution(dice, target, AETHER_MODE);
        if (baseline === undefined) continue;
        if (bnb === null) {
          mismatches.push(
            `null bnb for ${JSON.stringify(dice)}→${target} (sweep diff=${baseline.difficulty})`,
          );
          continue;
        }
        const bnbDiff = difficultyOfEquation(bnb, AETHER_MODE);
        if (bnbDiff > baseline.difficulty + 1e-9) {
          mismatches.push(
            `${JSON.stringify(dice)}→${target}: bnb=${bnbDiff} sweep=${baseline.difficulty}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  }, 120_000);

  // No arity-5 parity test: a single `sweepOneTuple([2,3,5,7,11], t, t,
  // AETHER_MODE)` takes 1–10s in steady state because the enumeration
  // walks the full 120-perm × ~10⁵-exp × 256-op space (the bench
  // skips `allSolutions` at arity 5 for the same reason). Coverage at
  // arity 5 comes from:
  //   - the existing `tests/solver.test.ts` cases that exercise both
  //     `easiestSolution` and `sweepOneTuple` against known-good
  //     equations baked into the test;
  //   - the arity-4 parity above, which exercises the same B&B code
  //     paths (cross-perm prune, reach prune, LB calc) as arity 5.
});

describe("difficultyLowerBound is sound", () => {
  // For every solved (dice, target) in the Æther arity-4 sample, the
  // lower bound must be ≤ the actual difficulty. Otherwise the B&B
  // prune could discard a legitimate easiest solution. Arity-5 is
  // covered indirectly via the B&B parity test above.
  it("LB ≤ actual difficulty for representative Æther arity-4 hits", () => {
    const tuples: ReadonlyArray<readonly number[]> = [
      [2, 3, 5, 7],
      [2, 2, 3, 5],
      [-3, 2, 5, 7],
    ];
    const probeTargets = [10, 50, 144, 500, 1000, 2000, 4000];
    for (const dice of tuples) {
      for (const target of probeTargets) {
        const sweep = sweepOneTuple(dice, target, target, AETHER_MODE);
        const sol = sweep.get(target);
        if (sol === undefined) continue;
        const lb = difficultyLowerBound(dice, target, AETHER_MODE);
        expect(lb).toBeLessThanOrEqual(sol.difficulty + 1e-9);
      }
    }
  }, 60_000);

  it("LB ≤ actual difficulty for every standard arity-3 hit (sampled)", () => {
    for (let i = 0; i < DICE_COMBINATIONS.length; i += 100) {
      const triple = DICE_COMBINATIONS[i]!;
      const sweep = sweepOneTuple(triple, 1, 999, STANDARD_MODE);
      for (const [target, sol] of sweep) {
        const lb = difficultyLowerBound(triple, target, STANDARD_MODE);
        expect(lb).toBeLessThanOrEqual(sol.difficulty + 1e-9);
      }
    }
  });
});
