/**
 * Render-count baseline for PlayView.
 *
 * Pins the current render fan-out when the player knocks a single cell
 * mid-race. The assertion is an *upper bound* captured on 2026-04-19 —
 * Task 9 will tighten it after targeted memoisation work. If the count
 * rises unexpectedly, something has regressed: investigate before
 * bumping the cap.
 *
 * Timer discipline: `play.start()` spins a 100ms `setInterval` (see
 * `PlayStore.startTimer`), so we install fake timers for the whole
 * file — otherwise background ticks would race the render-counter
 * reset and add non-deterministic counts.
 *
 * React act() discipline: happy-dom doesn't set
 * `IS_REACT_ACT_ENVIRONMENT` itself, which produces noisy warnings
 * from `createRoot().render()` under React 18. We opt in locally at
 * module load so the file stays self-contained.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
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

describe("PlayView render counts", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("knocking a single cell mid-race stays within the render-count baseline", async () => {
    const store = buildTestAppStore();
    const counter = createRenderCounter();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AppStoreProvider store={store}>
          <CountProfiler id="play-view" counter={counter}>
            <PlayView />
          </CountProfiler>
        </AppStoreProvider>,
      );
    });

    // Enter racing state. Uses real `Math.random()` for the dice roll
    // but that doesn't matter — `knockCell` is honor-system and does
    // not require the index to be reachable.
    await act(async () => {
      store.play.start();
    });

    counter.reset();

    // Knock one cell. The profiler captures every React render that
    // observes this mutation; the specific cell index is arbitrary.
    await act(async () => {
      store.play.knockCell(0);
    });

    const renders = counter.get("play-view");
    // Observed baseline 2026-04-19: 1 render. The `PlayView` observer
    // itself does not re-render on `knockCell` — the mutation fans
    // out to the BoardGrid/BoardCell/ScoreLine descendants under the
    // profiled root (which still count as renders via the Profiler's
    // commit hook). The cap is pinned at the observed value; Task 9
    // may tighten or relax after deliberate memoisation work, but
    // any unexplained rise here signals a reactivity regression.
    expect(renders).toBeLessThanOrEqual(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
    store.play.dispose();
  });
});
