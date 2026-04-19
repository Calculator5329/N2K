import { describe, it, expect } from "vitest";
import { LiveSolverDatasetClient, chunkKey } from "../src/services/datasetClient.js";
import { BUILT_IN_MODES } from "@platform/core/constants.js";

const standard = BUILT_IN_MODES.standard;
const aether = BUILT_IN_MODES.aether;

describe("LiveSolverDatasetClient", () => {
  it("returns a non-empty solution map for a standard 3-tuple", async () => {
    const c = new LiveSolverDatasetClient();
    const data = await c.getChunk(standard, [3, 4, 5]);
    expect(data.solutions.size).toBeGreaterThan(10);
    expect(data.source).toBe("computed");
    expect(data.dice).toEqual([3, 4, 5]);
    for (const [target, sol] of data.solutions) {
      expect(target).toBe(sol.equation.total);
      expect(sol.difficulty).toBeGreaterThanOrEqual(0);
    }
  });

  it("caches chunks by sorted dice tuple", async () => {
    const c = new LiveSolverDatasetClient();
    const a = await c.getChunk(standard, [3, 4, 5]);
    const b = await c.getChunk(standard, [5, 4, 3]);
    expect(c.cacheSize()).toBe(1);
    expect(a).toBe(b);
  });

  it("dedupes concurrent requests for the same chunk", async () => {
    const c = new LiveSolverDatasetClient();
    const [a, b] = await Promise.all([
      c.getChunk(standard, [3, 4, 5]),
      c.getChunk(standard, [3, 4, 5]),
    ]);
    expect(a).toBe(b);
    expect(c.cacheSize()).toBe(1);
  });

  it("treats mode id as part of the cache key", async () => {
    const c = new LiveSolverDatasetClient();
    await c.getChunk(standard, [3, 4, 5]);
    await c.getChunk(aether, [3, 4, 5]);
    expect(c.cacheSize()).toBe(2);
  });

  it("listAvailableTuples returns null (live client computes anything)", async () => {
    const c = new LiveSolverDatasetClient();
    expect(await c.listAvailableTuples(standard)).toBeNull();
  });

  it("reset clears the cache", async () => {
    const c = new LiveSolverDatasetClient();
    await c.getChunk(standard, [3, 4, 5]);
    expect(c.cacheSize()).toBe(1);
    c.reset();
    expect(c.cacheSize()).toBe(0);
  });

  it("chunkKey is order-insensitive on dice", () => {
    expect(chunkKey(standard, [3, 4, 5])).toBe(chunkKey(standard, [5, 3, 4]));
    expect(chunkKey(standard, [3, 4, 5])).not.toBe(chunkKey(aether, [3, 4, 5]));
  });
});
