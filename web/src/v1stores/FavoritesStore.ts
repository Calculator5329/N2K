import { makeAutoObservable, observable } from "mobx";
import type { DiceTriple } from "../core/types";

const STORAGE_KEY = "n2k.favorites.v1";

/** Canonicalize a triple to its sorted "a-b-c" string form. */
function key(dice: DiceTriple): string {
  const sorted = [dice[0], dice[1], dice[2]].sort((a, b) => a - b);
  return `${sorted[0]}-${sorted[1]}-${sorted[2]}`;
}

function parseKey(raw: string): DiceTriple | null {
  const parts = raw.split("-").map((s) => Number(s));
  if (parts.length !== 3) return null;
  if (!parts.every((n) => Number.isFinite(n) && n >= 1 && n <= 20)) return null;
  parts.sort((a, b) => a - b);
  return [parts[0]!, parts[1]!, parts[2]!];
}

function readPersisted(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const out = new Set<string>();
    for (const k of parsed) {
      if (typeof k !== "string") continue;
      // Round-trip through parseKey so corrupt entries get dropped.
      const triple = parseKey(k);
      if (triple !== null) out.add(key(triple));
    }
    return out;
  } catch {
    return new Set();
  }
}

function persist(set: ReadonlySet<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set].sort()));
  } catch {
    /* ignore quota / privacy errors */
  }
}

/**
 * Persisted set of starred dice triples. Triple-level only — cell-level
 * favorites are explicitly out of scope (see `docs/current_task.md`
 * Phase 0).
 *
 * Mirrors the defensive read/persist pattern used by `ThemeStore`:
 * corrupt storage boots empty, write failures (privacy mode, quota) are
 * swallowed so the in-memory state always stays usable.
 */
export class FavoritesStore {
  // `observable.set` is its own self-contained reactive structure;
  // tell `makeAutoObservable` not to wrap it again, otherwise observers
  // end up tracking a stale wrapper instead of the live set and the UI
  // never re-renders on `add` / `remove`.
  private readonly triples = observable.set<string>(readPersisted());

  constructor() {
    makeAutoObservable<FavoritesStore, "triples">(
      this,
      { triples: false },
      { autoBind: true },
    );
  }

  has(dice: DiceTriple): boolean {
    return this.triples.has(key(dice));
  }

  add(dice: DiceTriple): void {
    const k = key(dice);
    if (this.triples.has(k)) return;
    this.triples.add(k);
    persist(this.triples);
  }

  remove(dice: DiceTriple): void {
    const k = key(dice);
    if (!this.triples.has(k)) return;
    this.triples.delete(k);
    persist(this.triples);
  }

  toggle(dice: DiceTriple): void {
    if (this.has(dice)) this.remove(dice);
    else this.add(dice);
  }

  clear(): void {
    if (this.triples.size === 0) return;
    this.triples.clear();
    persist(this.triples);
  }

  /** Sorted snapshot of starred triples. */
  list(): DiceTriple[] {
    const out: DiceTriple[] = [];
    for (const k of this.triples) {
      const triple = parseKey(k);
      if (triple !== null) out.push(triple);
    }
    out.sort((a, b) => {
      for (let i = 0; i < 3; i += 1) {
        if (a[i] !== b[i]) return a[i]! - b[i]!;
      }
      return 0;
    });
    return out;
  }

  get size(): number {
    return this.triples.size;
  }
}
