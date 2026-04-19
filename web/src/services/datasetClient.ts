/**
 * Dataset client abstraction.
 *
 * The dataset is the precomputed answer-set: for every legal dice tuple
 * and every target in `mode.targetRange`, the easiest known solution +
 * difficulty. It's produced by the Phase 1 export pipeline and consumed
 * by the Lookup feature (and later: Compose, Compare, Visualize).
 *
 * Two impls:
 *
 *   - `LiveSolverDatasetClient` — computes chunks on demand via the
 *     core solver. This is the "no dataset shipped yet" fallback so the
 *     UI works today against a fresh repo. Slow for big sweeps; fine
 *     for the standard 3-die case.
 *   - `HttpDatasetClient` (Phase 1 follow-up) — fetches `/data/<mode>/chunks/tuple-*.json`
 *     produced by `scripts/export.ts`. Same interface, drop-in swap.
 *
 * The store layer only knows the interface, never the impl. Tests
 * inject a `LiveSolverDatasetClient` (or a fake) and never touch HTTP.
 */
import type { BulkSolution, Mode } from "@platform/core/types.js";
import { sweepOneTuple } from "@platform/services/solver.js";
import {
  getSharedSolverWorkerClient,
  type SolverWorkerClient,
} from "./workerSolverClient.js";

/**
 * Result of fetching one dice tuple. The map covers exactly the targets
 * in `[mode.targetRange.min, mode.targetRange.max]` that have at least
 * one solution; targets without any reachable equation are absent.
 */
export interface ChunkData {
  readonly mode: Mode;
  readonly dice: readonly number[];
  readonly solutions: ReadonlyMap<number, BulkSolution>;
  readonly source: "dataset" | "computed";
  /** Wall-clock ms spent producing this chunk (debug only). */
  readonly elapsedMs: number;
}

export interface DatasetClient {
  /**
   * Fetch the full target sweep for one dice tuple. Implementations may
   * cache aggressively — repeated calls with the same `(mode.id, dice)`
   * SHOULD return the same data without re-computing or re-fetching.
   */
  getChunk(mode: Mode, dice: readonly number[]): Promise<ChunkData>;

  /**
   * The dice tuples this client knows about as precomputed data. May
   * return `null` to mean "I don't have a fixed list — anything you
   * ask for I'll compute" (the live-solver client returns null).
   */
  listAvailableTuples(mode: Mode): Promise<readonly (readonly number[])[] | null>;

  /**
   * Optional best-effort prefetch hint. Implementations may use this
   * to warm caches in the background; default = no-op.
   */
  prefetch?(mode: Mode, dice: readonly number[]): void;
}

// ---------------------------------------------------------------------------
//  LiveSolverDatasetClient — computes on demand
// ---------------------------------------------------------------------------

/**
 * Computes chunks on demand using the core solver. Caches per-tuple
 * results by stringified `(modeId, sorted dice)`.
 *
 * Use this in dev / tests / before any real dataset has been exported.
 * It scales to standard-mode 3-die sweeps comfortably (sub-second per
 * tuple); for arity-5 Æther sweeps the caller should expect 1+ seconds
 * per tuple and is encouraged to push the work into a worker.
 */
export class LiveSolverDatasetClient implements DatasetClient {
  private readonly cache = new Map<string, ChunkData>();
  private readonly inflight = new Map<string, Promise<ChunkData>>();

  async getChunk(mode: Mode, dice: readonly number[]): Promise<ChunkData> {
    const key = chunkKey(mode, dice);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const pending = this.inflight.get(key);
    if (pending !== undefined) return pending;

    const job = this.compute(mode, dice).then((data) => {
      this.cache.set(key, data);
      this.inflight.delete(key);
      return data;
    });
    this.inflight.set(key, job);
    return job;
  }

  async listAvailableTuples(_mode: Mode): Promise<null> {
    return null;
  }

  /** Test hook: how many tuples have been cached. */
  cacheSize(): number {
    return this.cache.size;
  }

  /** Test hook: clear the cache. */
  reset(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  private async compute(
    mode: Mode,
    dice: readonly number[],
  ): Promise<ChunkData> {
    const start = Date.now();
    // Yield once so callers using `await` see UI updates between request
    // and result, even when the underlying compute is synchronous.
    await Promise.resolve();
    const solutions = sweepOneTuple(
      dice,
      mode.targetRange.min,
      mode.targetRange.max,
      mode,
    );
    return {
      mode,
      dice: [...dice],
      solutions,
      source: "computed",
      elapsedMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Stable cache key for a `(mode, dice)` pair. Order-insensitive on dice. */
export function chunkKey(mode: Mode, dice: readonly number[]): string {
  return `${mode.id}:${[...dice].sort((a, b) => a - b).join(",")}`;
}

// ---------------------------------------------------------------------------
//  WorkerSolverDatasetClient — same as Live, but `sweepOneTuple` runs
//  on a Web Worker so the main thread isn't blocked for hundreds of
//  ms during arity-4/5 Æther sweeps.
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for {@link LiveSolverDatasetClient} that pushes
 * the sweep onto a shared Web Worker (see `workerSolverClient.ts`).
 *
 * Same caching semantics — repeated calls with the same `(mode.id,
 * sorted dice)` reuse the cached chunk. The worker is shared with
 * `WorkerSolverService` so the page only spawns one thread total.
 */
export class WorkerSolverDatasetClient implements DatasetClient {
  private readonly cache = new Map<string, ChunkData>();
  private readonly inflight = new Map<string, Promise<ChunkData>>();
  private readonly client: SolverWorkerClient;

  constructor(client: SolverWorkerClient = getSharedSolverWorkerClient()) {
    this.client = client;
  }

  async getChunk(mode: Mode, dice: readonly number[]): Promise<ChunkData> {
    const key = chunkKey(mode, dice);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const pending = this.inflight.get(key);
    if (pending !== undefined) return pending;

    const job = this.compute(mode, dice).then((data) => {
      this.cache.set(key, data);
      this.inflight.delete(key);
      return data;
    });
    this.inflight.set(key, job);
    return job;
  }

  async listAvailableTuples(_mode: Mode): Promise<null> {
    return null;
  }

  cacheSize(): number {
    return this.cache.size;
  }

  reset(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  private async compute(
    mode: Mode,
    dice: readonly number[],
  ): Promise<ChunkData> {
    const start = Date.now();
    const solutions = await this.client.sweep(mode, dice);
    return {
      mode,
      dice: [...dice],
      solutions,
      source: "computed",
      elapsedMs: Date.now() - start,
    };
  }
}
