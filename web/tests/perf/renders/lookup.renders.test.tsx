/**
 * Render-fanout audit — Lookup query.
 *
 * Renders `LookupView` under `AppStoreProvider` and fires one
 * `setTotal` — representative of the user nudging the target by one
 * via the ←/→ keys or a quick-action button.
 *
 * DataStore note: `LookupView` calls `data.ensureDice(dice)` on mount,
 * which fires a `fetch` against the bundled dataset. In happy-dom
 * there is no network, so the promise rejects and the panel renders
 * the error/skeleton branch. That is fine for this measurement —
 * we're counting observer commits under the Profiler, not asserting
 * on solution rendering.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "../../../src/stores/AppStoreContext.js";
import { LookupView } from "../../../src/features/lookup/LookupView.js";
import { buildTestAppStore } from "../harness/storeFixture.js";
import {
  CountProfiler,
  createRenderCounter,
} from "../harness/renderCounter.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("LookupView render counts", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("stepping the target by one stays within the Lookup render baseline", async () => {
    const store = buildTestAppStore();
    const counter = createRenderCounter();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AppStoreProvider store={store}>
          <CountProfiler id="lookup" counter={counter}>
            <LookupView />
          </CountProfiler>
        </AppStoreProvider>,
      );
    });

    // Allow any synchronous observer follow-ups from mount (e.g.
    // data.diceState transitioning to 'loading') to commit before
    // we start counting. The `ensureDice` fetch itself will never
    // resolve under happy-dom, so no further commits arrive.
    counter.reset();

    // We can't call lookup.setTotal directly — the store instance is
    // scoped to the view via useMemo. The Standard variant observes
    // the same hash key; the simplest way to fire a representative
    // mutation is to walk the target via the view's own public
    // surface. Instead, we dispatch a document keydown — the view's
    // window listener steps the target exactly like a user would.
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight" }),
      );
    });

    const renders = counter.get("lookup");

    // Observed baseline 2026-04-19: 1 render. If this rises,
    // something in the Lookup observer tree started over-reacting
    // to target changes.
    expect(renders).toBeLessThanOrEqual(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
    store.play.dispose();
  });
});
