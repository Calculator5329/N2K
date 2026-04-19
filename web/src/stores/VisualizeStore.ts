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
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { BUILT_IN_MODES, DIFFICULTY_BUCKETS } from "@platform/core/constants.js";
import type { Mode } from "@platform/core/types.js";
import type { DatasetClient } from "../services/datasetClient.js";
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

export interface CoverageStats {
  readonly totalTargets: number;
  readonly reachable: number;
  readonly unreachable: number;
  readonly fragile: readonly TargetCell[];
  readonly worstCovered: readonly TupleStat[];
  readonly coverageBuckets: readonly number[];
  readonly minCoverage: number;
  readonly maxCoverage: number;
}

export type TupleProfileState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly points: readonly { readonly target: number; readonly difficulty: number }[] }
  | { readonly kind: "error"; readonly error: unknown };

export interface VisualizeStoreOptions {
  readonly explore: ExploreStore;
  readonly dataset?: DatasetClient;
}

export class VisualizeStore {
  private readonly explore: ExploreStore;
  private readonly dataset: DatasetClient | undefined;
  private readonly profileCache = observable.map<string, TupleProfileState>({}, { deep: false });

  constructor(opts: VisualizeStoreOptions) {
    this.explore = opts.explore;
    this.dataset = opts.dataset;
    makeObservable<this, "setProfile">(this, {
      mode: computed,
      targetCells: computed,
      scatter: computed,
      histogram: computed,
      coverage: computed,
      setProfile: action,
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

  get coverage(): CoverageStats {
    const cells = this.targetCells;
    const stats = this.explore.stats;
    const minTarget = this.mode.targetRange.min;
    const maxTarget = this.mode.targetRange.max;
    const totalTargets = maxTarget - minTarget + 1;
    const reachable = cells.length;
    const unreachable = totalTargets - reachable;

    const fragile = [...cells]
      .sort((a, b) => a.coverage - b.coverage)
      .slice(0, 8);

    const worstCovered = [...stats]
      .filter((s) => s.solvableCount > 0)
      .sort((a, b) => {
        const missA = totalTargets - a.solvableCount;
        const missB = totalTargets - b.solvableCount;
        return missB - missA;
      })
      .slice(0, 8);

    const minCoverage = cells.reduce((m, c) => Math.min(m, c.coverage), Number.POSITIVE_INFINITY);
    const maxCoverage = cells.reduce((m, c) => Math.max(m, c.coverage), 0);
    const safeMin = Number.isFinite(minCoverage) ? minCoverage : 0;
    const range = Math.max(1, maxCoverage - safeMin);
    const bins = 20;
    const coverageBuckets = new Array<number>(bins).fill(0);
    for (const cell of cells) {
      const idx = Math.min(
        bins - 1,
        Math.max(0, Math.floor(((cell.coverage - safeMin) / range) * bins)),
      );
      coverageBuckets[idx] = (coverageBuckets[idx] ?? 0) + 1;
    }

    return {
      totalTargets,
      reachable,
      unreachable,
      fragile,
      worstCovered,
      coverageBuckets,
      minCoverage: safeMin,
      maxCoverage,
    };
  }

  /**
   * Reactive accessor for a tuple's per-target difficulty profile,
   * lazily fetched via the dataset client. Returns `idle` if no
   * dataset client is wired (e.g. headless tests).
   */
  tupleProfile(dice: readonly number[]): TupleProfileState {
    const key = dice.join(",");
    const cached = this.profileCache.get(key);
    if (cached !== undefined) return cached;
    if (this.dataset === undefined) return { kind: "idle" };
    runInAction(() => {
      this.setProfile(key, { kind: "loading" });
    });
    void this.fetchProfile(key, dice);
    return { kind: "loading" };
  }

  private async fetchProfile(key: string, dice: readonly number[]): Promise<void> {
    if (this.dataset === undefined) return;
    try {
      const chunk = await this.dataset.getChunk(this.mode, dice);
      const points: { target: number; difficulty: number }[] = [];
      for (const sol of chunk.solutions.values()) {
        points.push({ target: sol.equation.total, difficulty: sol.difficulty });
      }
      points.sort((a, b) => a.target - b.target);
      this.setProfile(key, { kind: "ready", points });
    } catch (err) {
      this.setProfile(key, { kind: "error", error: err });
    }
  }

  private setProfile(key: string, state: TupleProfileState): void {
    this.profileCache.set(key, state);
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
