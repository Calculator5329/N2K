/**
 * `VisualizeStore` — aggregates the tuple index into target-space stats:
 *
 *   - `targetEasiest[t]`     — min difficulty across all tuples that hit t
 *   - `targetHardest[t]`     — max difficulty across all tuples that hit t
 *   - `targetCoverage[t]`    — number of tuples that can hit t
 *   - `tupleScatter`         — (solvableCount, avgDifficulty) per tuple
 *   - `histogram[bucket]`    — tuples whose avg difficulty lands in bucket
 *
 * Lazy: stats are derived from `ExploreStore.stats` (the tuple index)
 * reactively. As the index warms, stats grow incrementally.
 */
import { computed, makeObservable } from "mobx";
import { BUILT_IN_MODES, DIFFICULTY_BUCKETS } from "@platform/core/constants.js";
import type { Mode } from "@platform/core/types.js";
import type { TupleStat } from "../services/tupleIndexService.js";
import type { ExploreStore } from "./ExploreStore.js";

export interface TargetCell {
  readonly target: number;
  readonly easiest: number;
  readonly hardest: number;
  readonly coverage: number;
  readonly bestDice: readonly number[] | null;
}

export interface ScatterPoint {
  readonly dice: readonly number[];
  readonly solvable: number;
  readonly avgDifficulty: number;
}

export interface VisualizeStoreOptions {
  readonly explore: ExploreStore;
}

export class VisualizeStore {
  private readonly explore: ExploreStore;

  constructor(opts: VisualizeStoreOptions) {
    this.explore = opts.explore;
    makeObservable(this, {
      mode: computed,
      targetCells: computed,
      scatter: computed,
      histogram: computed,
    });
  }

  get mode(): Mode {
    return BUILT_IN_MODES[this.explore.modeId];
  }

  get targetCells(): readonly TargetCell[] {
    const stats = this.explore.stats;
    if (stats.length === 0) return [];
    // Note: full per-target cell aggregation requires re-fetching each
    // tuple's chunk. The TupleStat already records min/max/avg across the
    // tuple's solutions, so for v2 first cut we synthesize a single point
    // per tuple at the midpoint of its target range — good enough for the
    // atlas heatmap until per-target aggregates ship.
    const minTarget = this.mode.targetRange.min;
    const maxTarget = this.mode.targetRange.max;
    const cells = new Map<number, TargetCell>();
    for (let t = minTarget; t <= maxTarget; t += 1) {
      cells.set(t, {
        target: t,
        easiest: Number.POSITIVE_INFINITY,
        hardest: Number.NEGATIVE_INFINITY,
        coverage: 0,
        bestDice: null,
      });
    }
    for (const s of stats) {
      if (s.minTarget === null || s.maxTarget === null) continue;
      // We don't have the per-target detail, so apply the tuple's avg as
      // a "represents this tuple's coverage" signal across its range.
      for (let t = s.minTarget; t <= s.maxTarget; t += 1) {
        const cell = cells.get(t);
        if (cell === undefined) continue;
        const easiest = Math.min(cell.easiest, s.minDifficulty);
        const hardest = Math.max(cell.hardest, s.maxDifficulty);
        const bestDice = easiest === s.minDifficulty ? s.dice : cell.bestDice;
        cells.set(t, {
          target: t,
          easiest,
          hardest,
          coverage: cell.coverage + 1,
          bestDice,
        });
      }
    }
    return [...cells.values()].filter((c) => c.coverage > 0);
  }

  get scatter(): readonly ScatterPoint[] {
    return this.explore.stats.map((s) => ({
      dice: s.dice,
      solvable: s.solvableCount,
      avgDifficulty: s.avgDifficulty,
    }));
  }

  get histogram(): readonly { bucketIndex: number; label: string; count: number }[] {
    const buckets = new Array<number>(DIFFICULTY_BUCKETS.length).fill(0);
    for (const s of this.explore.stats) {
      let idx = DIFFICULTY_BUCKETS.findIndex(
        ([min, max]) => s.avgDifficulty >= min && s.avgDifficulty <= max,
      );
      if (idx < 0) idx = DIFFICULTY_BUCKETS.length - 1;
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
    return buckets.map((count, idx) => ({
      bucketIndex: idx,
      label: bucketLabel(idx),
      count,
    }));
  }
}

function bucketLabel(idx: number): string {
  const range = DIFFICULTY_BUCKETS[idx];
  if (range === undefined) return `≥${DIFFICULTY_BUCKETS[DIFFICULTY_BUCKETS.length - 1]?.[1] ?? 0}`;
  return `${range[0]}–${range[1]}`;
}
