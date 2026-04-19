import { describe, it, expect, beforeEach } from "vitest";
import { autorun, runInAction } from "mobx";
import { LookupStore } from "../src/stores/LookupStore.js";
import { LiveSolverDatasetClient } from "../src/services/datasetClient.js";
import { InlineSolverService } from "../src/services/solverWorkerService.js";

function settle(): Promise<void> {
  // The store fires a fetcher synchronously inside `reaction`, which
  // resolves via two awaited microtasks (Resource debounce + compute).
  // Three queueMicrotask cycles is enough for the chain to settle.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeStore(): LookupStore {
  return new LookupStore({
    dataset: new LiveSolverDatasetClient(),
    solverWorker: new InlineSolverService(),
    initialDice: [3, 4, 5],
  });
}

describe("LookupStore", () => {
  let store: LookupStore;
  beforeEach(() => {
    store = makeStore();
  });

  it("initializes with the provided dice and standard mode", () => {
    expect(store.modeId).toBe("standard");
    expect(store.dice).toEqual([3, 4, 5]);
    expect(store.selectedTarget).toBeNull();
  });

  it("loads the chunk on construction", async () => {
    await settle();
    await settle();
    expect(store.chunk.state.kind).toBe("ready");
    expect(store.chunkSolutions.size).toBeGreaterThan(0);
  });

  it("rolls a new legal dice tuple", () => {
    const before = store.dice;
    store.rollDice();
    expect(store.dice.length).toBe(3);
    for (const d of store.dice) {
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThanOrEqual(20);
    }
    expect(store.dice).not.toBe(before);
  });

  it("setDice rejects illegal tuples", () => {
    expect(() => store.setDice([1, 1, 5])).toThrow(/not legal/);
  });

  it("setMode replaces dice when the current tuple is illegal for the new mode", () => {
    const aetherStore = new LookupStore({
      dataset: new LiveSolverDatasetClient(),
      solverWorker: new InlineSolverService(),
      initialDice: [3, 4, 5, 6, 7],
    });
    expect(aetherStore.dice).toEqual([3, 4, 5, 6, 7]);
    runInAction(() => aetherStore.setMode("aether"));
    expect(aetherStore.modeId).toBe("aether");
    runInAction(() => aetherStore.setMode("standard"));
    expect(aetherStore.modeId).toBe("standard");
    expect(aetherStore.dice.length).toBe(3);
  });

  it("solutionsForTarget is idle until a target is set", async () => {
    await settle();
    expect(store.solutionsForTarget.state.kind).toBe("idle");
    store.setTarget(10);
    await settle();
    await settle();
    expect(store.solutionsForTarget.state.kind).toBe("ready");
  });

  it("clearTarget resets solutionsForTarget to idle", async () => {
    store.setTarget(10);
    await settle();
    await settle();
    expect(store.solutionsForTarget.state.kind).toBe("ready");
    store.clearTarget();
    await settle();
    expect(store.solutionsForTarget.state.kind).toBe("idle");
  });

  it("changing dice triggers a chunk refresh and clears the target", async () => {
    store.setTarget(10);
    await settle();
    await settle();
    let chunkRefreshes = 0;
    const dispose = autorun(() => {
      void store.chunk.state;
      chunkRefreshes += 1;
    });
    runInAction(() => store.setDice([2, 6, 7]));
    expect(store.selectedTarget).toBeNull();
    await settle();
    await settle();
    dispose();
    expect(chunkRefreshes).toBeGreaterThan(1);
    expect(store.dice).toEqual([2, 6, 7]);
  });

  it("sortedTargetsByDifficulty is monotonically non-decreasing in difficulty", async () => {
    await settle();
    await settle();
    const sorted = store.sortedTargetsByDifficulty;
    expect(sorted.length).toBeGreaterThan(0);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!.difficulty).toBeGreaterThanOrEqual(sorted[i - 1]!.difficulty);
    }
  });

  it("dispose stops further reactions from firing", async () => {
    await settle();
    await settle();
    store.dispose();
    runInAction(() => store.setDice([2, 6, 7]));
    await settle();
    expect(store.chunk.state.kind).toBe("idle");
  });
});
