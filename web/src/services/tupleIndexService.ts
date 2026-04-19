/**
 * `TupleIndexService` — produces summary statistics across every legal
 * dice tuple for a mode.
 *
 * v1 shipped a precomputed `index.json` that listed every triple with its
 * solvable count, target range, average difficulty, and per-bucket
 * distribution. v2 starts without that file (the bulk-export pipeline
 * exists but has not run a publish cycle), so this service computes it on
 * demand by iterating the legal tuple space and asking the configured
 * `DatasetClient` for each chunk.
 *
 * The work is streamed: callers subscribe via the `onProgress` callback
 * and may use partial data while the index is still warming. Results are
 * cached per modeId for the lifetime of the service so repeated visits to
 * Explore/Compare/Visualize are instantaneous after the first warm-up.
 */
import type { Mode } from "@platform/core/types.js";
import { isLegalDiceForMode } from "@platform/services/generators.js";
import { DIFFICULTY_BUCKETS } from "@platform/core/constants.js";
import { tierForDifficulty } from "../features/lookup/difficultyTier.js";
import type { DatasetClient } from "./datasetClient.js";

export interface TupleStat {
  /** Sorted ascending. Multiset key for the tuple. */
  readonly dice: readonly number[];
  readonly modeId: string;
  readonly solvableCount: number;
  readonly minTarget: number | null;
  readonly maxTarget: number | null;
  readonly avgDifficulty: number;
  readonly minDifficulty: number;
  readonly maxDifficulty: number;
  /** Median difficulty across solvable targets (for explore sorting). */
  readonly medianDifficulty: number;
  /** Bucket histogram: index aligns with `DIFFICULTY_BUCKETS`. */
  readonly buckets: readonly number[];
}

export interface TupleIndexProgress {
  readonly mode: Mode;
  readonly done: number;
  readonly total: number;
  readonly stats: readonly TupleStat[];
}

export interface TupleIndexService {
  /**
   * Get (or compute) the full tuple index for a mode. Resolves once every
   * legal tuple's stats have been computed. Reports streaming progress
   * via `onProgress`.
   */
  getIndex(mode: Mode, opts?: TupleIndexOptions): Promise<readonly TupleStat[]>;
  /** Synchronously read whatever stats are currently cached for a mode. */
  cached(modeId: string): readonly TupleStat[];
  /** Drop cached results for a mode (or all modes). */
  invalidate(modeId?: string): void;
}

export interface TupleIndexOptions {
  /** Notified as each batch of tuples completes. */
  readonly onProgress?: (p: TupleIndexProgress) => void;
  /**
   * Number of tuples to compute concurrently per microtask. Higher
   * numbers compute the full index faster at the cost of UI
   * responsiveness. Defaults to 8.
   */
  readonly batchSize?: number;
  /**
   * Optional cap on total tuples processed; useful in tests to keep
   * runtimes short. When set, tuples beyond the cap are skipped.
   */
  readonly limit?: number;
}

export class LiveTupleIndexService implements TupleIndexService {
  private readonly cache = new Map<string, TupleStat[]>();
  private readonly inFlight = new Map<string, Promise<readonly TupleStat[]>>();

  constructor(private readonly dataset: DatasetClient) {}

  async getIndex(
    mode: Mode,
    opts: TupleIndexOptions = {},
  ): Promise<readonly TupleStat[]> {
    const cached = this.cache.get(mode.id);
    if (cached !== undefined && (opts.limit === undefined || cached.length >= opts.limit)) {
      opts.onProgress?.({ mode, done: cached.length, total: cached.length, stats: cached });
      return cached;
    }
    const existing = this.inFlight.get(mode.id);
    if (existing !== undefined) return existing;

    const promise = this.compute(mode, opts);
    this.inFlight.set(mode.id, promise);
    try {
      const result = await promise;
      this.cache.set(mode.id, [...result]);
      return result;
    } finally {
      this.inFlight.delete(mode.id);
    }
  }

  cached(modeId: string): readonly TupleStat[] {
    return this.cache.get(modeId) ?? [];
  }

  invalidate(modeId?: string): void {
    if (modeId === undefined) {
      this.cache.clear();
    } else {
      this.cache.delete(modeId);
    }
  }

  private async compute(
    mode: Mode,
    opts: TupleIndexOptions,
  ): Promise<readonly TupleStat[]> {
    const tuples = enumerateLegalTuples(mode, opts.limit);
    const out: TupleStat[] = [];
    const batchSize = Math.max(1, opts.batchSize ?? 8);

    for (let i = 0; i < tuples.length; i += batchSize) {
      const batch = tuples.slice(i, i + batchSize);
      const batchStats = await Promise.all(
        batch.map(async (dice) => this.computeOne(mode, dice)),
      );
      for (const s of batchStats) out.push(s);
      opts.onProgress?.({ mode, done: out.length, total: tuples.length, stats: out });
      // Yield so the UI can paint between batches.
      await Promise.resolve();
    }
    return out;
  }

  private async computeOne(mode: Mode, dice: readonly number[]): Promise<TupleStat> {
    const chunk = await this.dataset.getChunk(mode, dice);
    const sols = chunk.solutions;
    if (sols.size === 0) {
      return {
        dice,
        modeId: mode.id,
        solvableCount: 0,
        minTarget: null,
        maxTarget: null,
        avgDifficulty: 0,
        minDifficulty: 0,
        maxDifficulty: 0,
        medianDifficulty: 0,
        buckets: new Array(DIFFICULTY_BUCKETS.length + 1).fill(0),
      };
    }
    let minTarget = Number.POSITIVE_INFINITY;
    let maxTarget = Number.NEGATIVE_INFINITY;
    let sumDiff = 0;
    let minDiff = Number.POSITIVE_INFINITY;
    let maxDiff = Number.NEGATIVE_INFINITY;
    const diffs: number[] = [];
    const buckets = new Array<number>(DIFFICULTY_BUCKETS.length + 1).fill(0);
    for (const sol of sols.values()) {
      const t = sol.equation.total;
      const d = sol.difficulty;
      if (t < minTarget) minTarget = t;
      if (t > maxTarget) maxTarget = t;
      if (d < minDiff) minDiff = d;
      if (d > maxDiff) maxDiff = d;
      sumDiff += d;
      diffs.push(d);
      const tier = tierForDifficulty(d);
      const slot = Math.min(tier.index, buckets.length - 1);
      buckets[slot] = (buckets[slot] ?? 0) + 1;
    }
    diffs.sort((a, b) => a - b);
    const median = diffs.length % 2 === 1
      ? diffs[(diffs.length - 1) >> 1]!
      : (diffs[(diffs.length >> 1) - 1]! + diffs[diffs.length >> 1]!) / 2;
    return {
      dice,
      modeId: mode.id,
      solvableCount: sols.size,
      minTarget,
      maxTarget,
      avgDifficulty: sumDiff / sols.size,
      minDifficulty: minDiff,
      maxDifficulty: maxDiff,
      medianDifficulty: median,
      buckets,
    };
  }
}

/**
 * Enumerate every legal dice tuple under `mode`. Sorted ascending so
 * canonical (multiset) order is preserved.
 *
 * Standard mode: every triple over [1..20] minus all-same and 2+ ones.
 * Æther mode: every triple over [-10..32] (4-/5-tuples are far too
 * many for a live index — those modes are deferred to the cloud index).
 */
export function enumerateLegalTuples(mode: Mode, limit?: number): number[][] {
  const min = mode.diceRange.min;
  const max = mode.diceRange.max;
  const out: number[][] = [];
  const arity = 3;
  if (!mode.arities.includes(arity)) return out;
  for (let a = min; a <= max; a += 1) {
    for (let b = a; b <= max; b += 1) {
      for (let c = b; c <= max; c += 1) {
        const dice = [a, b, c];
        if (!isLegalDiceForMode(dice, mode)) continue;
        out.push(dice);
        if (limit !== undefined && out.length >= limit) return out;
      }
    }
  }
  return out;
}
