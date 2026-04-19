import { makeAutoObservable, observable } from "mobx";
import type { DiceTriple } from "../core/types";

const STORAGE_KEY = "n2k.compare.v1";
const MODE_STORAGE_KEY = "n2k.compare.mode.v1";

/** Maximum number of triples that can be in the comparison set at once. */
export const COMPARE_MAX = 4;

/**
 * Chart projections offered by the Compare view. The default is the
 * binned average — the per-target view is exact but visually noisy
 * across the full 1..999 domain, and average-per-100 reads cleaner at
 * a glance.
 */
export type CompareChartMode =
  | "perTarget"
  | "avgPerBucket"
  | "countPerBucket"
  | "cumulative";

const CHART_MODES: readonly CompareChartMode[] = [
  "perTarget",
  "avgPerBucket",
  "countPerBucket",
  "cumulative",
];

function readPersistedMode(): CompareChartMode {
  if (typeof localStorage === "undefined") return "avgPerBucket";
  try {
    const raw = localStorage.getItem(MODE_STORAGE_KEY);
    if (raw !== null && (CHART_MODES as readonly string[]).includes(raw)) {
      return raw as CompareChartMode;
    }
  } catch {
    /* ignore */
  }
  return "avgPerBucket";
}

function persistMode(mode: CompareChartMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

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

function readPersisted(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const k of parsed) {
      if (typeof k !== "string") continue;
      const triple = parseKey(k);
      if (triple !== null) out.push(key(triple));
      if (out.length >= COMPARE_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

function persist(list: readonly string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota / privacy errors */
  }
}

/**
 * Selection set for the Compare panel. Capped at `COMPARE_MAX` so the
 * overlay chart stays readable. Order is meaningful — the first triple
 * in the list is rendered on top of the chart and listed first in the
 * legend.
 *
 * Mirrors `FavoritesStore`'s defensive read/persist pattern: corrupt
 * storage boots empty, write failures are swallowed so the in-memory
 * state stays usable. Selection lives independently from favorites so
 * users can compare ad-hoc triples without first starring them.
 */
export class CompareStore {
  private readonly _selected = observable.array<string>(readPersisted());
  private _chartMode: CompareChartMode = readPersistedMode();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get chartMode(): CompareChartMode {
    return this._chartMode;
  }

  setChartMode(mode: CompareChartMode): void {
    if (this._chartMode === mode) return;
    this._chartMode = mode;
    persistMode(mode);
  }

  get selected(): readonly DiceTriple[] {
    const out: DiceTriple[] = [];
    for (const k of this._selected) {
      const triple = parseKey(k);
      if (triple !== null) out.push(triple);
    }
    return out;
  }

  get size(): number {
    return this._selected.length;
  }

  get isFull(): boolean {
    return this._selected.length >= COMPARE_MAX;
  }

  has(dice: DiceTriple): boolean {
    return this._selected.includes(key(dice));
  }

  /** Append `dice` to the comparison set. No-op if already present or full. */
  add(dice: DiceTriple): void {
    const k = key(dice);
    if (this._selected.includes(k)) return;
    if (this._selected.length >= COMPARE_MAX) return;
    this._selected.push(k);
    persist(this._selected);
  }

  remove(dice: DiceTriple): void {
    const k = key(dice);
    const idx = this._selected.indexOf(k);
    if (idx < 0) return;
    this._selected.splice(idx, 1);
    persist(this._selected);
  }

  /**
   * Toggle membership. Returns `true` if the dice ended up in the set,
   * `false` otherwise (either removed, or rejected because the set was
   * full).
   */
  toggle(dice: DiceTriple): boolean {
    if (this.has(dice)) {
      this.remove(dice);
      return false;
    }
    if (this.isFull) return false;
    this.add(dice);
    return true;
  }

  clear(): void {
    if (this._selected.length === 0) return;
    this._selected.clear();
    persist(this._selected);
  }
}
