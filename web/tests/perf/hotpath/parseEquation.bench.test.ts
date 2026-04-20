import { describe, expect, it } from "vitest";
import { parseEquation } from "@platform/services/parsing.js";
import { medianMs } from "../harness/budget.js";

// Calibrated 2026-04-19 local. Observed median ~0.002ms; budget = max(5, ceil(median*3)).
const BUDGET_MS = 5;

describe("hot-path: parseEquation", () => {
  it("parses a representative equation under budget", () => {
    // Canonical format: `base op base op base = total` with single spaces.
    const input = "2^3 + 3 * 5 = 23";
    const run = () => parseEquation(input);
    expect(run()).toBeTruthy(); // sanity: parses without throwing
    const median = medianMs(run, { warmup: 5, samples: 21 });
    expect(median).toBeLessThan(BUDGET_MS);
  });
});
