import { autorun, makeAutoObservable, runInAction, type IReactionDisposer } from "mobx";
import type { DiceTriple } from "../../core/types";
import { readHash, subscribeHash, writeHash, type HashSchema } from "../../v1services/urlHashState";

interface LookupState {
  readonly dice: DiceTriple;
  readonly total: number;
}

/**
 * Hash schema for the Lookup view. Format: `1:d1,d2,d3/total` — small,
 * legible to a human reading the URL bar, and easy to evolve via the
 * leading version tag.
 */
const LOOKUP_HASH_KEY = "lookup";
const LOOKUP_HASH_SCHEMA: HashSchema<LookupState> = {
  encode({ dice, total }): string {
    return `1:${dice[0]},${dice[1]},${dice[2]}/${total}`;
  },
  decode(raw): LookupState | null {
    const versioned = /^1:(\d+),(\d+),(\d+)\/(\d+)$/.exec(raw);
    if (versioned === null) return null;
    const d1 = clampDie(Number(versioned[1]));
    const d2 = clampDie(Number(versioned[2]));
    const d3 = clampDie(Number(versioned[3]));
    const total = clampTotal(Number(versioned[4]));
    if (d1 === null || d2 === null || d3 === null || total === null) return null;
    return { dice: [d1, d2, d3], total };
  },
};

function clampDie(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(1, Math.min(20, Math.round(value)));
}

function clampTotal(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(1, Math.min(999, Math.round(value)));
}

/** Local UI state for the Lookup view. Owned by the LookupView lifetime. */
export class LookupStore {
  d1 = 2;
  d2 = 3;
  d3 = 5;
  total = 40;

  constructor() {
    makeAutoObservable<LookupStore, "hydrateFromHash">(this, {
      startSync: false,
      hydrateFromHash: false,
    });
    this.hydrateFromHash();
  }

  get dice(): DiceTriple {
    // Always emit the canonical sorted form so we hit the cache key.
    const sorted = [this.d1, this.d2, this.d3].sort((a, b) => a - b);
    return [sorted[0]!, sorted[1]!, sorted[2]!];
  }

  setDie(index: 0 | 1 | 2, value: number): void {
    const clamped = clampDie(value);
    if (clamped === null) return;
    if (index === 0) this.d1 = clamped;
    if (index === 1) this.d2 = clamped;
    if (index === 2) this.d3 = clamped;
  }

  setTotal(value: number): void {
    const clamped = clampTotal(value);
    if (clamped === null) return;
    this.total = clamped;
  }

  /**
   * Register the URL-hash autorun + the `hashchange` listener and return
   * a cleanup function. Called from a `useEffect` in `LookupView` so that
   * React StrictMode's mount/unmount/remount cycle in dev correctly tears
   * down and re-registers both — keeping `dispose()`-style state out of
   * the store itself.
   */
  startSync(): () => void {
    const writer: IReactionDisposer = autorun(() => {
      writeHash(
        LOOKUP_HASH_KEY,
        { dice: this.dice, total: this.total },
        LOOKUP_HASH_SCHEMA,
      );
    });
    const unsubscribe = subscribeHash(() => this.hydrateFromHash());
    return () => {
      writer();
      unsubscribe();
    };
  }

  private hydrateFromHash(): void {
    const persisted = readHash(LOOKUP_HASH_KEY, LOOKUP_HASH_SCHEMA);
    if (persisted === null) return;
    runInAction(() => {
      this.d1 = persisted.dice[0];
      this.d2 = persisted.dice[1];
      this.d3 = persisted.dice[2];
      this.total = persisted.total;
    });
  }
}
