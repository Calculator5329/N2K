/**
 * `CompareStore` — up to four dice tuples on the bench, overlaid on a
 * difficulty-vs-target chart.
 *
 * Resolves each tuple's solution chunk via the `DatasetClient` (cached
 * across the app). Selection persists to `localStorage` so accidental
 * navigation doesn't lose the bench.
 */
import { action, computed, makeObservable, observable, reaction } from "mobx";
import { BUILT_IN_MODES } from "@platform/core/constants.js";
import type { Mode, BulkSolution } from "@platform/core/types.js";
import type { ChunkData, DatasetClient } from "../services/datasetClient.js";

export type CompareModeId = "standard" | "aether";
export type CompareChartMode =
  | "perTarget"
  | "avgPerBucket"
  | "countPerBucket"
  | "cumulative";

const MAX_BENCH = 4;
const STORAGE_KEY = "n2k.compare.v1";

export interface CompareEntry {
  readonly modeId: CompareModeId;
  readonly dice: readonly number[];
  readonly chunk: ChunkData | null;
  readonly loading: boolean;
  readonly error: string | null;
}

interface PersistedShape {
  readonly bench: ReadonlyArray<{ modeId: CompareModeId; dice: readonly number[] }>;
  readonly chartMode: CompareChartMode;
}

export interface CompareStoreOptions {
  readonly dataset: DatasetClient;
}

export class CompareStore {
  bench: readonly CompareEntry[] = [];
  chartMode: CompareChartMode = "avgPerBucket";

  private readonly dataset: DatasetClient;
  private readonly disposers: Array<() => void> = [];

  constructor(opts: CompareStoreOptions) {
    this.dataset = opts.dataset;

    makeObservable(this, {
      bench: observable.ref,
      chartMode: observable,
      isFull: computed,
      domain: computed,
      add: action,
      remove: action,
      clear: action,
      setChartMode: action,
      replaceEntry: action,
    });

    const restored = restoreState();
    if (restored !== null) {
      this.chartMode = restored.chartMode;
      for (const e of restored.bench) {
        this.bench = [
          ...this.bench,
          { modeId: e.modeId, dice: e.dice, chunk: null, loading: false, error: null },
        ];
        void this.loadEntry(e.modeId, e.dice);
      }
    }

    this.disposers.push(reaction(() => this.serializable, persistState));
  }

  get isFull(): boolean {
    return this.bench.length >= MAX_BENCH;
  }

  /** Union of `[minTarget, maxTarget]` across loaded chunks. */
  get domain(): { min: number; max: number } | null {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const e of this.bench) {
      const sols = e.chunk?.solutions;
      if (sols === undefined || sols.size === 0) continue;
      for (const s of sols.values()) {
        const t = s.equation.total;
        if (t < lo) lo = t;
        if (t > hi) hi = t;
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    return { min: lo, max: hi };
  }

  modeOf(modeId: CompareModeId): Mode {
    return BUILT_IN_MODES[modeId];
  }

  add(modeId: CompareModeId, dice: readonly number[]): { ok: true } | { ok: false; reason: string } {
    if (this.isFull) return { ok: false, reason: `Bench is full (max ${MAX_BENCH}).` };
    const sorted = [...dice].sort((a, b) => a - b);
    const exists = this.bench.some(
      (e) => e.modeId === modeId && e.dice.length === sorted.length && e.dice.every((d, i) => d === sorted[i]),
    );
    if (exists) return { ok: false, reason: "Already on the bench." };
    this.bench = [
      ...this.bench,
      { modeId, dice: sorted, chunk: null, loading: true, error: null },
    ];
    void this.loadEntry(modeId, sorted);
    return { ok: true };
  }

  remove(index: number): void {
    this.bench = this.bench.filter((_, i) => i !== index);
  }

  clear(): void {
    this.bench = [];
  }

  setChartMode(mode: CompareChartMode): void {
    this.chartMode = mode;
  }

  replaceEntry(index: number, next: CompareEntry): void {
    this.bench = this.bench.map((e, i) => (i === index ? next : e));
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }

  /** Distinct (modeId, dice) currently on the bench. */
  get serializable(): PersistedShape {
    return {
      chartMode: this.chartMode,
      bench: this.bench.map((e) => ({ modeId: e.modeId, dice: e.dice })),
    };
  }

  private async loadEntry(modeId: CompareModeId, dice: readonly number[]): Promise<void> {
    try {
      const chunk = await this.dataset.getChunk(this.modeOf(modeId), dice);
      const idx = this.bench.findIndex(
        (e) => e.modeId === modeId && e.dice.length === dice.length && e.dice.every((d, i) => d === dice[i]),
      );
      if (idx === -1) return;
      this.replaceEntry(idx, { modeId, dice, chunk, loading: false, error: null });
    } catch (err) {
      const idx = this.bench.findIndex(
        (e) => e.modeId === modeId && e.dice.length === dice.length && e.dice.every((d, i) => d === dice[i]),
      );
      if (idx === -1) return;
      const message = err instanceof Error ? err.message : String(err);
      this.replaceEntry(idx, { modeId, dice, chunk: null, loading: false, error: message });
    }
  }
}

/**
 * Build a difficulty-vs-target series for one entry, projected through
 * the chosen chart mode.
 */
export function projectSeries(
  entry: CompareEntry,
  chartMode: CompareChartMode,
  domain: { min: number; max: number },
  bucketSize: number = 25,
): ReadonlyArray<{ x: number; y: number }> {
  const sols = entry.chunk?.solutions;
  if (sols === undefined || sols.size === 0) return [];
  switch (chartMode) {
    case "perTarget":
      return [...sols.values()]
        .sort((a, b) => a.equation.total - b.equation.total)
        .map((s) => ({ x: s.equation.total, y: s.difficulty }));
    case "avgPerBucket":
      return bucketAggregate(sols, domain, bucketSize, (vals) => avg(vals));
    case "countPerBucket":
      return bucketAggregate(sols, domain, bucketSize, (vals) => vals.length);
    case "cumulative":
      return cumulativeReachable(sols, domain);
    default:
      return [];
  }
}

function bucketAggregate(
  sols: ReadonlyMap<number, BulkSolution>,
  domain: { min: number; max: number },
  bucketSize: number,
  fn: (vals: number[]) => number,
): ReadonlyArray<{ x: number; y: number }> {
  const buckets = new Map<number, number[]>();
  for (const s of sols.values()) {
    const t = s.equation.total;
    if (t < domain.min || t > domain.max) continue;
    const key = Math.floor(t / bucketSize) * bucketSize;
    let arr = buckets.get(key);
    if (arr === undefined) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(s.difficulty);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([x, vals]) => ({ x: x + bucketSize / 2, y: fn(vals) }));
}

function cumulativeReachable(
  sols: ReadonlyMap<number, BulkSolution>,
  domain: { min: number; max: number },
): ReadonlyArray<{ x: number; y: number }> {
  const totals = [...sols.values()]
    .map((s) => s.equation.total)
    .filter((t) => t >= domain.min && t <= domain.max)
    .sort((a, b) => a - b);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < totals.length; i += 1) {
    out.push({ x: totals[i]!, y: i + 1 });
  }
  return out;
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

function restoreState(): PersistedShape | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    if (!parsed.bench || !parsed.chartMode) return null;
    return { bench: parsed.bench, chartMode: parsed.chartMode };
  } catch {
    return null;
  }
}

function persistState(state: PersistedShape): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
