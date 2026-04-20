/**
 * Render-fanout audit — RaceTopBar timer-tick.
 *
 * PlayStore.startTimer installs a 100ms interval that calls `tick()`,
 * which mutates `elapsedMs` every tick (and may append to `botKnocked`
 * if the bot has ready claims). We want to know how many React
 * renders fan out of PlayView per tick.
 *
 * Caveat: RaceTopBar is an internal component of PlayView. We can't
 * wrap it from outside without editing `web/src/`, so this test
 * measures the PlayView subtree as a whole and separately counts how
 * many times a MobX `reaction` on `elapsedMs` fires as a sanity
 * check that fake timers truly advance the race clock.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { reaction } from "mobx";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "../../../src/stores/AppStoreContext.js";
import { PlayView } from "../../../src/features/play/PlayView.js";
import { buildTestAppStore } from "../harness/storeFixture.js";
import {
  CountProfiler,
  createRenderCounter,
} from "../harness/renderCounter.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("RaceTopBar timer-tick render fanout", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("advancing the race clock by 10 ticks (1s) stays within the baseline", async () => {
    const store = buildTestAppStore();
    const counter = createRenderCounter();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AppStoreProvider store={store}>
          <CountProfiler id="play-view-subtree" counter={counter}>
            <PlayView />
          </CountProfiler>
        </AppStoreProvider>,
      );
    });

    // Count reaction fires on `elapsedMs` — this is the non-React
    // sanity check that the timer actually advanced 10 times.
    let reactionFires = 0;
    const dispose = reaction(
      () => store.play.elapsedMs,
      () => {
        reactionFires += 1;
      },
    );

    await act(async () => {
      store.play.start();
    });

    counter.reset();

    // 10 ticks at TICK_MS = 100ms. Use act() so React flushes commits
    // between ticks; otherwise vi.advanceTimersByTime would batch them
    // and we'd get one coarse render instead of the real fanout.
    for (let i = 0; i < 10; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
    }

    const renders = counter.get("play-view-subtree");

    // Observed baseline 2026-04-19: 10 renders across 10 ticks
    // (one PlayView-subtree commit per elapsedMs mutation). The
    // subtree profiler counts a single commit regardless of how many
    // internal observers re-render within that commit; per-component
    // fanout would need inline Profilers inside BoardGrid/RaceTopBar
    // which we can't add without modifying source. This cap is an
    // upper bound on PlayView-level commits per second of racing.
    expect(renders).toBeLessThanOrEqual(10);

    // Sanity: elapsedMs changed exactly 10 times (one per tick).
    // Observed: 10.
    expect(reactionFires).toBe(10);

    dispose();
    await act(async () => {
      root.unmount();
    });
    container.remove();
    store.play.dispose();
  });
});
