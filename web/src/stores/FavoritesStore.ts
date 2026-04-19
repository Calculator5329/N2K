/**
 * `FavoritesStore` — persistent set of "starred" dice tuples per mode.
 *
 * Tuples are persisted to `localStorage` under a single key per mode so the
 * data outlives a refresh without depending on the (eventual) cloud
 * backend. The shape is intentionally trivial (sorted-tuple → boolean) so
 * the entire payload is cheap to serialize on every mutation.
 */
import { action, makeObservable, observable } from "mobx";

const STORAGE_KEY = "n2k.favorites.v1";

interface PersistedShape {
  /** Map from `${modeId}|sortedDiceCsv` to true. */
  readonly entries: Readonly<Record<string, true>>;
}

function tupleKey(modeId: string, dice: readonly number[]): string {
  const sorted = [...dice].sort((a, b) => a - b);
  return `${modeId}|${sorted.join(",")}`;
}

function parseStored(): PersistedShape {
  if (typeof localStorage === "undefined") return { entries: {} };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return { entries: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    return { entries: parsed.entries ?? {} };
  } catch {
    return { entries: {} };
  }
}

function persist(entries: ReadonlyMap<string, true>): void {
  if (typeof localStorage === "undefined") return;
  const obj: Record<string, true> = {};
  for (const [k] of entries) obj[k] = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: obj }));
}

export class FavoritesStore {
  private readonly entries = observable.map<string, true>();

  constructor() {
    const initial = parseStored();
    for (const k of Object.keys(initial.entries)) {
      this.entries.set(k, true);
    }

    makeObservable(this, {
      isFavorite: false,
      forMode: false,
      toggle: action,
      clearAll: action,
    });
  }

  /** All starred tuples for a mode, returned as sorted tuples. */
  forMode(modeId: string): readonly (readonly number[])[] {
    const prefix = `${modeId}|`;
    const out: number[][] = [];
    for (const k of this.entries.keys()) {
      if (!k.startsWith(prefix)) continue;
      const csv = k.slice(prefix.length);
      out.push(csv.split(",").map((s) => Number.parseInt(s, 10)));
    }
    return out.sort((a, b) => {
      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; i += 1) {
        if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
      }
      return a.length - b.length;
    });
  }

  isFavorite(modeId: string, dice: readonly number[]): boolean {
    return this.entries.has(tupleKey(modeId, dice));
  }

  toggle(modeId: string, dice: readonly number[]): void {
    const key = tupleKey(modeId, dice);
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else {
      this.entries.set(key, true);
    }
    persist(this.entries);
  }

  clearAll(): void {
    this.entries.clear();
    persist(this.entries);
  }
}
