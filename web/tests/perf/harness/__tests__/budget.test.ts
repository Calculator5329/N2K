import { describe, expect, it } from "vitest";
import { medianMs } from "../budget.js";

describe("medianMs", () => {
  it("returns the median wall-clock cost of the fn across N samples after warmup", () => {
    let calls = 0;
    const result = medianMs(() => { calls++; }, { warmup: 2, samples: 5 });
    expect(calls).toBe(7); // 2 warmup + 5 measured
    expect(result).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("accepts a budget assertion helper", () => {
    const fn = () => { let x = 0; for (let i = 0; i < 100; i++) x += i; return x; };
    const median = medianMs(fn, { warmup: 3, samples: 11 });
    expect(median).toBeLessThan(10);
  });
});
