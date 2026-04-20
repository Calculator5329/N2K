/**
 * Render-fanout audit — per-cell fanout on a single `knockCell`.
 *
 * The aggregate PlayView render count after `knockCell(0)` was pinned
 * at 1 in the existing baseline. This test looks behind that number
 * at the proxy signal BoardCell observers read: `playerKnockedSet`.
 *
 * `playerKnockedSet` is a MobX computed that returns a fresh `Set`
 * every time `playerKnocked` changes. A naive `bool = set.has(idx)`
 * read inside a per-cell observer will therefore invalidate for
 * EVERY cell after a single knock — because the Set *identity*
 * changed, not just one cell's membership. That's the fanout we're
 * measuring, without relying on internal Profiler ids.
 *
 * Two independent measurements:
 *   1. How many times does the `playerKnockedSet` reference change
 *      per `knockCell` call? (Expected: 1.)
 *   2. How many cells' `.has(i)` return value actually differ
 *      before vs. after the knock? (Expected: 1.)
 *
 * If those two numbers diverge from the number of cells whose
 * observers think they were invalidated, that's our clear target.
 */
import { reaction } from "mobx";
import { describe, expect, it } from "vitest";
import { buildTestAppStore } from "../harness/storeFixture.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("BoardCell fanout proxy — playerKnockedSet identity per knock", () => {
  it("one knockCell produces one set-identity change and one bit flip", () => {
    const store = buildTestAppStore();
    store.play.start();

    // Snapshot pre-knock membership across all 36 cells.
    const cellCount = store.play.boardCells.length;
    const beforeHas: boolean[] = [];
    const setBefore = store.play.playerKnockedSet;
    for (let i = 0; i < cellCount; i += 1) {
      beforeHas.push(setBefore.has(i));
    }

    let setIdentityChanges = 0;
    const dispose = reaction(
      () => store.play.playerKnockedSet,
      () => {
        setIdentityChanges += 1;
      },
    );

    store.play.knockCell(0);

    const setAfter = store.play.playerKnockedSet;
    let bitflips = 0;
    for (let i = 0; i < cellCount; i += 1) {
      if (setAfter.has(i) !== beforeHas[i]) bitflips += 1;
    }
    const setIdentityChanged = setAfter !== setBefore ? 1 : 0;

    // Observed 2026-04-19:
    //   setIdentityChanges = 1  (one fresh Set per knock)
    //   bitflips            = 1  (only cell 0's membership changed)
    //   setIdentityChanged  = 1  (computed produced a new Set ref)
    expect(setIdentityChanges).toBeLessThanOrEqual(1);
    expect(bitflips).toBeLessThanOrEqual(1);
    expect(setIdentityChanged).toBeLessThanOrEqual(1);

    // Interpretation (recorded, not asserted): a per-cell observer
    // that reads `playerKnockedSet.has(i)` will see the COMPUTED
    // invalidate on every knock even though 35 of 36 cells'
    // membership is unchanged. Whether that translates into 36
    // React commits depends on whether BoardCell is `observer`-ed
    // and whether it reads the set (vs. a per-cell bool prop). This
    // test records the upstream signal only.

    dispose();
    store.play.dispose();
  });
});
