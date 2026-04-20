import { describe, expect, it } from "vitest";
import { easiestSolution } from "@platform/services/solver.js";
import { STANDARD_MODE } from "@platform/core/constants.js";
import { medianMs } from "../harness/budget.js";

// Calibrated 2026-04-19 local. Observed median ~1.4ms; budget = max(5, ceil(median*3)).
const BUDGET_MS = 5;

describe("hot-path: solver.easiestSolution", () => {
  it("solves a representative triple under budget", () => {
    const dice: readonly number[] = [2, 3, 5];
    const target = 11;
    const run = () => easiestSolution(dice, target, STANDARD_MODE);
    expect(run()).not.toBeNull(); // sanity: solvable (2*3+5 = 11)
    const median = medianMs(run, { warmup: 5, samples: 21 });
    expect(median).toBeLessThan(BUDGET_MS);
  });
});
