/**
 * Render-fanout audit — Compose keystroke.
 *
 * Renders `ComposeView` under `AppStoreProvider` and fires one
 * `composition.setName("Test")` call — representative of a single
 * keystroke committing the competition title (the UI itself calls
 * `setName` on blur/enter, but the store-level action is what
 * matters for render-fanout bookkeeping).
 *
 * Fake timers are installed because the real CompositionStore wires
 * an autosave autorun to a debounced timer via `attachAutosave`;
 * without fake timers happy-dom would race the React root teardown.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "../../../src/stores/AppStoreContext.js";
import { ComposeView } from "../../../src/features/compose/ComposeView.js";
import { buildTestAppStore } from "../harness/storeFixture.js";
import {
  CountProfiler,
  createRenderCounter,
} from "../harness/renderCounter.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("ComposeView render counts", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("setName keystroke stays within the Compose render baseline", async () => {
    const store = buildTestAppStore();
    const counter = createRenderCounter();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AppStoreProvider store={store}>
          <CountProfiler id="compose" counter={counter}>
            <ComposeView />
          </CountProfiler>
        </AppStoreProvider>,
      );
    });

    counter.reset();

    await act(async () => {
      store.composition.setName("Test");
    });

    const renders = counter.get("compose");

    // Observed baseline 2026-04-19: 1 render. The cap is pinned at
    // the observed count; any unexplained rise indicates regressing
    // reactivity in the competition editor. Recorded, not judged —
    // a single Profiler here aggregates all descendant observer
    // commits into one commit count.
    expect(renders).toBeLessThanOrEqual(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
    store.play.dispose();
  });
});
