import { action, makeAutoObservable, runInAction } from "mobx";
import { ADV_TARGET_RANGE } from "@solver/core/constants.js";
import type {
  AetherArity,
  AetherCell,
  AetherTuple,
  AetherTupleSummary,
  Loadable,
} from "../core/types";
import {
  sweepAdvanced,
  type AetherSweepProgressPayload,
  type AetherSweepResult,
} from "../v1services/aetherSolverService";

// ---------------------------------------------------------------------------
//  Public sweep view
// ---------------------------------------------------------------------------

/**
 * Resolved per-tuple sweep, exposed to the UI as plain objects keyed by
 * target. The wire format used over `postMessage` is a packed
 * `[target, equation, difficulty]` tuple; this view exists so consumer
 * code reads as `cells[target].equation` rather than indexing into a
 * three-element array.
 */
export interface AetherTupleSweep {
  readonly tuple: AetherTuple;
  readonly arity: AetherArity;
  readonly elapsedMs: number;
  /** Sparse map: target → cell. Unsolvable targets are absent. */
  readonly cells: ReadonlyMap<number, AetherCell>;
  /** Solvable targets, ascending. Same data as `cells.keys()` but sorted. */
  readonly targetsSorted: readonly number[];
}

/**
 * Streaming intermediate sweep — what the worker has found so far for a
 * tuple whose final sweep is still running. Same shape as
 * `AetherTupleSweep` plus permutation-progress metadata. The cells/
 * targetsSorted entries are the running best-known answers; later
 * permutations may replace individual entries with easier equations.
 */
export interface AetherTuplePartialSweep extends AetherTupleSweep {
  readonly permsDone: number;
  readonly permsTotal: number;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/**
 * Canonical key for a tuple. Sorted ascending so {2,3,5} and {5,3,2}
 * collapse to the same cache entry — this matches the unordered-tuple
 * semantics used everywhere else (export, advancedSolver, etc.).
 */
export function tupleKey(tuple: AetherTuple): string {
  return [...tuple].sort((a, b) => a - b).join(",");
}

function summarize(
  tuple: AetherTuple,
  sweep: AetherTupleSweep,
): AetherTupleSummary {
  const arity = tuple.length as AetherArity;
  const totalTargets = ADV_TARGET_RANGE.max - ADV_TARGET_RANGE.min + 1;

  const diffs: number[] = [];
  for (const cell of sweep.cells.values()) diffs.push(cell.difficulty);

  if (diffs.length === 0) {
    return {
      tuple,
      arity,
      solvableCount: 0,
      impossibleCount: totalTargets,
      minDifficulty: null,
      maxDifficulty: null,
      averageDifficulty: null,
      medianDifficulty: null,
    };
  }

  diffs.sort((a, b) => a - b);
  const sum = diffs.reduce((acc, d) => acc + d, 0);
  const mid = Math.floor(diffs.length / 2);
  const median =
    diffs.length % 2 === 0 ? (diffs[mid - 1]! + diffs[mid]!) / 2 : diffs[mid]!;

  return {
    tuple,
    arity,
    solvableCount: diffs.length,
    impossibleCount: totalTargets - diffs.length,
    minDifficulty: diffs[0]!,
    maxDifficulty: diffs[diffs.length - 1]!,
    averageDifficulty: sum / diffs.length,
    medianDifficulty: median,
  };
}

function inflate(
  tuple: AetherTuple,
  raw: AetherSweepResult,
): AetherTupleSweep {
  const cells = new Map<number, AetherCell>();
  const targets: number[] = new Array(raw.rows.length);
  for (let i = 0; i < raw.rows.length; i += 1) {
    const [t, eq, diff] = raw.rows[i]!;
    cells.set(t, { equation: eq, difficulty: diff });
    targets[i] = t;
  }
  return {
    tuple,
    arity: raw.arity as AetherArity,
    elapsedMs: raw.elapsedMs,
    cells,
    targetsSorted: targets,
  };
}

function inflatePartial(
  tuple: AetherTuple,
  raw: AetherSweepProgressPayload,
): AetherTuplePartialSweep {
  return {
    ...inflate(tuple, raw),
    permsDone: raw.permsDone,
    permsTotal: raw.permsTotal,
  };
}

// ---------------------------------------------------------------------------
//  Store
// ---------------------------------------------------------------------------

/**
 * Lazy cache of per-tuple sweep results. The Æther equivalent of
 * `DataStore`'s `diceCache`, but every entry is computed on demand by
 * the worker pool — there is no on-disk Æther dataset (see
 * `docs/tech_spec.md` for why).
 *
 * UI components observe this store and call `ensureSweep` from a
 * `useEffect`; `sweepState` and `summaryFor` are synchronous accessors
 * returning the current cache state.
 *
 * Concurrency: in-flight requests are deduped per tuple key, so calling
 * `ensureSweep` from multiple components / re-renders never starts more
 * than one worker call for the same tuple.
 *
 * Cancellation: not currently supported. A worker is occupied for the
 * full sweep duration even if the caller has navigated away. This is
 * fine in practice because individual sweeps are bounded
 * (typically < 1 s for arity 3, < 10 s for arity 4, harder for 5).
 * If/when this becomes a problem, `MessageChannel`-based cancellation
 * can be retrofitted without changing the public API.
 */
export class AetherDataStore {
  /** Per-tuple sweep cache, keyed by `tupleKey(tuple)`. */
  private readonly sweepCache = new Map<string, Loadable<AetherTupleSweep>>();
  /**
   * Streaming partial sweeps, keyed by `tupleKey(tuple)`. Populated by
   * `sweep-progress` worker messages while a sweep is in flight, and
   * cleared when the final `ready` value lands. The Lookup view reads
   * this so it can render the running best equation within ~400 ms
   * instead of waiting the full 1–3 minutes that arity-5 sweeps take.
   */
  private readonly partialCache = new Map<string, AetherTuplePartialSweep>();
  /** Lazily-computed summary cache, parallel to `sweepCache`. */
  private readonly summaryCache = new Map<string, AetherTupleSummary>();
  /** In-flight promise per tuple key, used to dedupe concurrent calls. */
  private readonly pending = new Map<string, Promise<AetherTupleSweep>>();
  /** Bumped on every `ensureSweep` so MobX observers see the cache change. */
  cacheTick = 0;

  constructor() {
    makeAutoObservable<
      this,
      "sweepCache" | "partialCache" | "summaryCache" | "pending"
    >(this, {
      sweepCache: false,
      partialCache: false,
      summaryCache: false,
      pending: false,
      ensureSweep: action,
      invalidate: action,
    });
  }

  /** Synchronous accessor: returns the current cache slot for a tuple. */
  sweepState(tuple: AetherTuple): Loadable<AetherTupleSweep> {
    // Read `cacheTick` so MobX wires up a dependency on the cache.
    void this.cacheTick;
    return this.sweepCache.get(tupleKey(tuple)) ?? { status: "idle" };
  }

  /**
   * Streaming partial result for a tuple whose sweep is still running.
   * Returns `null` if the sweep hasn't started, has already completed
   * (use `sweepState` for the final value), or hasn't reported its first
   * progress yet. Reading this wires up a MobX dep on `cacheTick` so
   * components re-render as new partials arrive.
   */
  partialFor(tuple: AetherTuple): AetherTuplePartialSweep | null {
    void this.cacheTick;
    return this.partialCache.get(tupleKey(tuple)) ?? null;
  }

  /**
   * Synchronous accessor: returns a summary for the tuple if its sweep
   * is `ready`, `null` otherwise. The summary is computed on first
   * access and memoized.
   */
  summaryFor(tuple: AetherTuple): AetherTupleSummary | null {
    void this.cacheTick;
    const key = tupleKey(tuple);
    const slot = this.sweepCache.get(key);
    if (slot?.status !== "ready") return null;
    const cached = this.summaryCache.get(key);
    if (cached !== undefined) return cached;
    const summary = summarize(tuple, slot.value);
    this.summaryCache.set(key, summary);
    return summary;
  }

  /**
   * Kick off (or no-op) a sweep for the given tuple. Returns a Promise
   * that resolves with the sweep, but most callers fire-and-forget and
   * read state via `sweepState`.
   */
  ensureSweep(tuple: AetherTuple): Promise<AetherTupleSweep> {
    const key = tupleKey(tuple);
    const cached = this.sweepCache.get(key);
    if (cached?.status === "ready") {
      return Promise.resolve(cached.value);
    }
    const inFlight = this.pending.get(key);
    if (inFlight !== undefined) return inFlight;

    this.sweepCache.set(key, { status: "loading" });
    this.cacheTick += 1;

    const promise = sweepAdvanced(
      tuple,
      ADV_TARGET_RANGE.min,
      ADV_TARGET_RANGE.max,
      (progress) =>
        runInAction(() => {
          this.partialCache.set(key, inflatePartial(tuple, progress));
          this.cacheTick += 1;
        }),
    ).then((raw) => inflate(tuple, raw));

    promise
      .then((value) =>
        runInAction(() => {
          this.sweepCache.set(key, { status: "ready", value });
          this.partialCache.delete(key);
          this.cacheTick += 1;
        }),
      )
      .catch((err: unknown) =>
        runInAction(() => {
          this.sweepCache.set(key, { status: "error", error: String(err) });
          this.partialCache.delete(key);
          this.cacheTick += 1;
        }),
      )
      .finally(() => {
        this.pending.delete(key);
      });

    this.pending.set(key, promise);
    return promise;
  }

  /** Drop everything cached for a tuple (e.g. after a re-tune of the heuristic). */
  invalidate(tuple: AetherTuple): void {
    const key = tupleKey(tuple);
    this.sweepCache.delete(key);
    this.partialCache.delete(key);
    this.summaryCache.delete(key);
    this.pending.delete(key);
    this.cacheTick += 1;
  }

  /**
   * Number of tuples currently cached (any state). Useful for
   * diagnostics and as a "live records" indicator in the page-shell
   * stats strip when Æther mode is active.
   *
   * Reads `cacheTick` so MobX wires the computed value's invalidation
   * to the same tick that mutations bump — without it, the getter has
   * no observable dependency and would never re-evaluate (the
   * underlying Map is annotated `false` in `makeAutoObservable`).
   */
  get cacheSize(): number {
    void this.cacheTick;
    return this.sweepCache.size;
  }
}
