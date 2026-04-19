import { makeAutoObservable, observable } from "mobx";
import { ADV_DICE_RANGE } from "@solver/core/constants.js";
import type { AetherArity, AetherTuple } from "../../core/types";

/** Maximum tuples that can be in the Æther comparison set. */
export const AETHER_COMPARE_MAX = 4;

export type AetherCompareChartMode =
  | "perTarget"
  | "avgPerBucket"
  | "countPerBucket"
  | "cumulative";

/**
 * Canonical key for a tuple: arity prefix + sorted dice.
 * Examples: `3:2,3,5`, `4:-3,5,7,11`, `5:1,2,3,4,5`.
 *
 * The arity prefix is included so the same dice slice at two different
 * arities (e.g. `[2,3,5]` vs `[2,3,5,7]`) get distinct cache entries
 * even though one is a subset of the other.
 */
function key(tuple: AetherTuple): string {
  const sorted = [...tuple].sort((a, b) => a - b);
  return `${sorted.length}:${sorted.join(",")}`;
}

function parseKey(raw: string): AetherTuple | null {
  const m = /^([345]):(.+)$/.exec(raw);
  if (m === null) return null;
  const arity = Number(m[1]);
  const parts = m[2]!.split(",").map((s) => Number(s));
  if (parts.length !== arity) return null;
  if (parts.some((d) => !Number.isFinite(d))) return null;
  if (
    parts.some(
      (d) => d < ADV_DICE_RANGE.min || d > ADV_DICE_RANGE.max,
    )
  ) {
    return null;
  }
  parts.sort((a, b) => a - b);
  return parts;
}

/**
 * Selection set for the Æther variant of Compare. Mirrors
 * `CompareStore`'s defensive shape but holds Æther tuples (variable
 * arity, wider value range) and is intentionally non-persistent —
 * Æther sessions are exploratory, and persisting selections that may
 * point to expensive sweeps would surprise the user on next page load.
 *
 * Tuples are stored as canonical sorted strings so the same multiset
 * collapses to one entry regardless of input order.
 */
export class AetherCompareStore {
  private readonly _selected = observable.array<string>([]);
  private _chartMode: AetherCompareChartMode = "avgPerBucket";

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get chartMode(): AetherCompareChartMode {
    return this._chartMode;
  }

  setChartMode(mode: AetherCompareChartMode): void {
    this._chartMode = mode;
  }

  get selected(): readonly AetherTuple[] {
    const out: AetherTuple[] = [];
    for (const k of this._selected) {
      const t = parseKey(k);
      if (t !== null) out.push(t);
    }
    return out;
  }

  get size(): number {
    return this._selected.length;
  }

  get isFull(): boolean {
    return this._selected.length >= AETHER_COMPARE_MAX;
  }

  has(tuple: AetherTuple): boolean {
    return this._selected.includes(key(tuple));
  }

  add(tuple: AetherTuple): void {
    const k = key(tuple);
    if (this._selected.includes(k)) return;
    if (this._selected.length >= AETHER_COMPARE_MAX) return;
    this._selected.push(k);
  }

  remove(tuple: AetherTuple): void {
    const k = key(tuple);
    const idx = this._selected.indexOf(k);
    if (idx < 0) return;
    this._selected.splice(idx, 1);
  }

  toggle(tuple: AetherTuple): boolean {
    if (this.has(tuple)) {
      this.remove(tuple);
      return false;
    }
    if (this.isFull) return false;
    this.add(tuple);
    return true;
  }

  clear(): void {
    if (this._selected.length === 0) return;
    this._selected.clear();
  }

  /** Return the active arity for a tuple — convenience for UI rendering. */
  static arityOf(tuple: AetherTuple): AetherArity {
    return tuple.length as AetherArity;
  }
}

export const aetherCompareKey = key;
