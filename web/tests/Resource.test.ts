import { describe, expect, it, vi } from "vitest";
import { autorun } from "mobx";
import { Resource } from "../src/stores/Resource.js";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Resource<T>", () => {
  it("starts idle", () => {
    const r = new Resource(async () => 1);
    expect(r.state.kind).toBe("idle");
    expect(r.data).toBeUndefined();
    expect(r.isReady).toBe(false);
    expect(r.isLoading).toBe(false);
  });

  it("transitions idle → loading → ready", async () => {
    const r = new Resource(async () => 42);
    const states: string[] = [];
    const dispose = autorun(() => states.push(r.state.kind));
    await r.refresh();
    dispose();
    expect(states).toEqual(["idle", "loading", "ready"]);
    expect(r.data).toBe(42);
  });

  it("transitions loading → error and preserves previous data", async () => {
    let i = 0;
    const r = new Resource<number>(async () => {
      i++;
      if (i === 1) return 7;
      throw new Error("boom");
    });
    await r.refresh();
    expect(r.data).toBe(7);
    await r.refresh();
    expect(r.state.kind).toBe("error");
    expect(r.data).toBe(7); // previous value preserved
    expect((r.error as Error).message).toBe("boom");
  });

  it("triggers reactivity on every transition (no cacheTick needed)", async () => {
    const r = new Resource(async () => "v");
    const observations: { kind: string; data: string | undefined }[] = [];
    const dispose = autorun(() => {
      observations.push({ kind: r.state.kind, data: r.data });
    });
    await r.refresh();
    dispose();
    // Must have observed loading + ready in addition to the initial idle.
    expect(observations.map((o) => o.kind)).toEqual(["idle", "loading", "ready"]);
    expect(observations[2]!.data).toBe("v");
  });

  it("supersedes overlapping refresh calls (only latest result commits)", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    let n = 0;
    const r = new Resource<string>(async () => {
      n++;
      return n === 1 ? first.promise : second.promise;
    });
    const p1 = r.refresh();
    const p2 = r.refresh();
    second.resolve("second");
    first.resolve("first"); // arrives later but is stale
    await Promise.all([p1, p2]);
    expect(r.data).toBe("second");
  });

  it("reset returns to idle and invalidates inflight requests", async () => {
    const d = deferred<number>();
    const r = new Resource<number>(() => d.promise);
    const p = r.refresh();
    r.reset();
    expect(r.state.kind).toBe("idle");
    d.resolve(99);
    await p;
    expect(r.state.kind).toBe("idle");
    expect(r.data).toBeUndefined();
  });

  it("setFetcher swaps the source without auto-refreshing", async () => {
    const r = new Resource<number>(async () => 1);
    await r.refresh();
    expect(r.data).toBe(1);
    r.setFetcher(async () => 2);
    expect(r.data).toBe(1); // not refreshed yet
    await r.refresh();
    expect(r.data).toBe(2);
  });

  it("debounce coalesces rapid refreshes (only one fetcher call)", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => "v");
      const r = new Resource(fetcher, { debounceMs: 50 });
      r.refresh();
      r.refresh();
      r.refresh();
      expect(fetcher).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(60);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
