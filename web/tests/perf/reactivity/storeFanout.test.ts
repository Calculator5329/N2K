import { reaction } from "mobx";
import { describe, expect, it, afterEach } from "vitest";
import { buildTestAppStore } from "../harness/storeFixture.js";
import { THEME_IDS } from "../../../src/core/themes.js";

/**
 * MobX reactivity fan-out guard.
 *
 * Asserts that slices of the root store which are nominally independent
 * do not cross-trigger reactions. The concrete pair exercised here:
 *
 *   A (mutated):  theme.setTheme(otherEdition)
 *   B (observed): play.status
 *
 * A reaction on `play.status` should see zero fires when we only mutate
 * the theme. Any fire > 0 would indicate an accidental coupling (e.g.
 * an autorun that touches both slices, or a shared observable being
 * read by something that observes the race status).
 */
describe("store reactivity fanout", () => {
  let dispose: (() => void) | undefined;
  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it("theme edition changes do not fire play.status reactions", () => {
    const store = buildTestAppStore();

    let fires = 0;
    dispose = reaction(
      () => store.play.status,
      () => {
        fires += 1;
      },
    );

    // Pick a second edition that differs from the current one so
    // `setTheme` actually mutates (it short-circuits on equality).
    const current = store.theme.theme;
    const next = THEME_IDS.find((id) => id !== current);
    expect(next).toBeDefined();

    store.theme.setTheme(next!);
    expect(store.theme.theme).toBe(next);

    expect(fires).toBe(0);
  });
});
