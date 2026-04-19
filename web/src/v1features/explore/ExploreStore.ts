import {
  autorun,
  makeAutoObservable,
  observable,
  runInAction,
  type IReactionDisposer,
} from "mobx";
import type { DiceSummary, DiceTriple } from "../../core/types";
import type { FavoritesStore } from "../../v1stores/FavoritesStore";
import {
  readHash,
  subscribeHash,
  writeHash,
  type HashSchema,
} from "../../v1services/urlHashState";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export type SortKey =
  | "dice"
  | "averageDifficulty"
  | "minDifficulty"
  | "maxDifficulty"
  | "solvableCount";
export type SortDir = "asc" | "desc";

export interface SortCriterion {
  readonly key: SortKey;
  readonly dir: SortDir;
}

/**
 * Snapshot of every filterable input. Drives both URL persistence and
 * saved-view recall. `query` keeps the existing free-text dice filter
 * (one or more numbers separated by spaces or commas — every row must
 * contain *all* of them).
 */
export interface ExploreFilters {
  readonly query: string;
  readonly minSolvable: number | null;
  readonly minAvgDifficulty: number | null;
  readonly maxAvgDifficulty: number | null;
  readonly favoritesOnly: boolean;
}

export const EMPTY_FILTERS: ExploreFilters = {
  query: "",
  minSolvable: null,
  minAvgDifficulty: null,
  maxAvgDifficulty: null,
  favoritesOnly: false,
};

export const DEFAULT_SORTS: SortCriterion[] = [
  { key: "averageDifficulty", dir: "asc" },
];

/** A user-saved combination of filters + sort stack. */
export interface SavedView {
  readonly id: string;
  readonly name: string;
  readonly filters: ExploreFilters;
  readonly sorts: readonly SortCriterion[];
  readonly createdAt: number;
}

// ---------------------------------------------------------------------------
//  Hash schema (compact, human-skimmable URL form)
// ---------------------------------------------------------------------------

const SORT_KEY_TO_ALIAS: Record<SortKey, string> = {
  dice: "dice",
  averageDifficulty: "avg",
  minDifficulty: "min",
  maxDifficulty: "max",
  solvableCount: "solv",
};
const ALIAS_TO_SORT_KEY: Record<string, SortKey> = {
  dice: "dice",
  avg: "averageDifficulty",
  min: "minDifficulty",
  max: "maxDifficulty",
  solv: "solvableCount",
};
const DIR_TO_ALIAS: Record<SortDir, string> = { asc: "a", desc: "d" };
const ALIAS_TO_DIR: Record<string, SortDir> = { a: "asc", d: "desc" };

interface ExploreHashState {
  readonly sorts: readonly SortCriterion[];
  readonly filters: ExploreFilters;
}

const HASH_KEY = "explore";

const HASH_SCHEMA: HashSchema<ExploreHashState> = {
  encode({ sorts, filters }): string {
    const parts: string[] = ["v1"];

    // Only emit a sort segment if it differs from the default.
    if (!sortsEqual(sorts, DEFAULT_SORTS)) {
      const encoded = sorts
        .map((s) => `${SORT_KEY_TO_ALIAS[s.key]}:${DIR_TO_ALIAS[s.dir]}`)
        .join(",");
      parts.push(`sort=${encoded}`);
    }
    if (filters.query.trim().length > 0) {
      const numbers = parseQueryNumbers(filters.query);
      if (numbers.length > 0) parts.push(`q=${numbers.join(",")}`);
    }
    if (filters.favoritesOnly) parts.push("fav=1");
    if (filters.minSolvable !== null) parts.push(`ms=${filters.minSolvable}`);
    if (filters.minAvgDifficulty !== null || filters.maxAvgDifficulty !== null) {
      const lo = filters.minAvgDifficulty ?? "";
      const hi = filters.maxAvgDifficulty ?? "";
      parts.push(`ad=${lo}-${hi}`);
    }
    // If only the version tag is left, return empty so the hash stays clean.
    return parts.length === 1 ? "" : parts.join(";");
  },
  decode(raw): ExploreHashState | null {
    if (raw.length === 0) return null;
    const segments = raw.split(";");
    if (segments[0] !== "v1") return null;
    let sorts: SortCriterion[] = DEFAULT_SORTS.map((s) => ({ ...s }));
    let filters: ExploreFilters = { ...EMPTY_FILTERS };
    for (const seg of segments.slice(1)) {
      const eq = seg.indexOf("=");
      const key = eq < 0 ? seg : seg.slice(0, eq);
      const value = eq < 0 ? "" : seg.slice(eq + 1);
      switch (key) {
        case "sort": {
          const decoded = decodeSorts(value);
          if (decoded !== null) sorts = decoded;
          break;
        }
        case "q":
          filters = { ...filters, query: value.replace(/,/g, " ") };
          break;
        case "fav":
          filters = { ...filters, favoritesOnly: value === "1" };
          break;
        case "ms": {
          const n = Number(value);
          if (Number.isFinite(n)) filters = { ...filters, minSolvable: n };
          break;
        }
        case "ad": {
          const dash = value.indexOf("-");
          if (dash < 0) break;
          const lo = value.slice(0, dash);
          const hi = value.slice(dash + 1);
          const loNum = lo.length > 0 && Number.isFinite(Number(lo)) ? Number(lo) : null;
          const hiNum = hi.length > 0 && Number.isFinite(Number(hi)) ? Number(hi) : null;
          filters = {
            ...filters,
            minAvgDifficulty: loNum,
            maxAvgDifficulty: hiNum,
          };
          break;
        }
        default:
          // Unknown key — ignore so older clients don't choke on new fields.
          break;
      }
    }
    return { sorts, filters };
  },
};

function decodeSorts(raw: string): SortCriterion[] | null {
  if (raw.length === 0) return null;
  const out: SortCriterion[] = [];
  const seen = new Set<SortKey>();
  for (const piece of raw.split(",")) {
    const colon = piece.indexOf(":");
    if (colon < 0) return null;
    const alias = piece.slice(0, colon);
    const dirAlias = piece.slice(colon + 1);
    const key = ALIAS_TO_SORT_KEY[alias];
    const dir = ALIAS_TO_DIR[dirAlias];
    if (key === undefined || dir === undefined) return null;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, dir });
  }
  return out.length > 0 ? out : null;
}

function sortsEqual(a: readonly SortCriterion[], b: readonly SortCriterion[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.key !== b[i]!.key || a[i]!.dir !== b[i]!.dir) return false;
  }
  return true;
}

function parseQueryNumbers(raw: string): number[] {
  return raw
    .trim()
    .split(/[\s,]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

// ---------------------------------------------------------------------------
//  Saved views (localStorage)
// ---------------------------------------------------------------------------

const VIEWS_STORAGE_KEY = "n2k.explore.views.v1";

function readPersistedViews(): SavedView[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(VIEWS_STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: SavedView[] = [];
    for (const v of parsed) {
      const view = parseSavedView(v);
      if (view !== null) out.push(view);
    }
    return out;
  } catch {
    return [];
  }
}

function parseSavedView(raw: unknown): SavedView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || typeof obj.name !== "string") return null;
  if (typeof obj.filters !== "object" || obj.filters === null) return null;
  if (!Array.isArray(obj.sorts)) return null;
  const sorts: SortCriterion[] = [];
  for (const s of obj.sorts) {
    if (typeof s !== "object" || s === null) continue;
    const sObj = s as Record<string, unknown>;
    const key = sObj.key as SortKey;
    const dir = sObj.dir as SortDir;
    if (key === undefined || dir === undefined) continue;
    if (!(key in SORT_KEY_TO_ALIAS) || (dir !== "asc" && dir !== "desc")) continue;
    sorts.push({ key, dir });
  }
  const f = obj.filters as Record<string, unknown>;
  return {
    id: obj.id,
    name: obj.name,
    sorts,
    filters: {
      query: typeof f.query === "string" ? f.query : "",
      minSolvable:
        typeof f.minSolvable === "number" ? f.minSolvable : null,
      minAvgDifficulty:
        typeof f.minAvgDifficulty === "number" ? f.minAvgDifficulty : null,
      maxAvgDifficulty:
        typeof f.maxAvgDifficulty === "number" ? f.maxAvgDifficulty : null,
      favoritesOnly: f.favoritesOnly === true,
    },
    createdAt: typeof obj.createdAt === "number" ? obj.createdAt : Date.now(),
  };
}

function persistViews(views: readonly SavedView[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(views));
  } catch {
    /* ignore quota / privacy errors */
  }
}

// ---------------------------------------------------------------------------
//  Store
// ---------------------------------------------------------------------------

/**
 * Local UI state for the Explore view. Owns:
 *   - the current sort stack (multi-column),
 *   - the active filters (query, favorites, solvable count, avg range),
 *   - the user's saved views (persisted to localStorage),
 *   - the currently-selected drilldown row.
 *
 * Two persistence layers, both wired up via `startSync` so React's
 * StrictMode mount/unmount cycle behaves:
 *   - URL hash for the *active* sort + filters (so views are shareable).
 *   - localStorage for the named saved views.
 *
 * Selection is intentionally NOT persisted — it's a one-session concept
 * that would otherwise confuse a permalink visitor.
 */
export class ExploreStore {
  sorts: SortCriterion[] = DEFAULT_SORTS.map((s) => ({ ...s }));
  filters: ExploreFilters = { ...EMPTY_FILTERS };
  selected: DiceTriple | null = null;
  // Saved views are kept in an observable.array so MobX tracks ordering
  // changes; same trick as FavoritesStore's observable.set.
  private readonly _views = observable.array<SavedView>(readPersistedViews());

  constructor(private readonly favorites: FavoritesStore) {
    // Private fields (`_views`, `favorites`, `hydrateFromHash`) are skipped
    // by `makeAutoObservable` automatically. `_views` is already an
    // `observable.array`; we don't want MobX wrapping it again. `startSync`
    // is explicitly excluded so it stays a plain method (it returns a
    // cleanup closure, doesn't itself mutate observable state).
    makeAutoObservable<ExploreStore, "hydrateFromHash">(
      this,
      { startSync: false, hydrateFromHash: false },
      { autoBind: true },
    );
    this.hydrateFromHash();
  }

  // -------------------------------------------------------------------------
  //  Computed views
  // -------------------------------------------------------------------------

  get savedViews(): readonly SavedView[] {
    return this._views;
  }

  /** Convenience getter: top of the sort stack, or null if empty. */
  get primarySort(): SortCriterion | null {
    return this.sorts[0] ?? null;
  }

  /** Returns true when *any* filter is non-default (used to gate the reset button). */
  get hasActiveFilters(): boolean {
    return !filtersEqual(this.filters, EMPTY_FILTERS);
  }

  /** Position (1-indexed) of `key` in the sort stack, or 0 if not present. */
  sortPosition(key: SortKey): number {
    for (let i = 0; i < this.sorts.length; i += 1) {
      if (this.sorts[i]!.key === key) return i + 1;
    }
    return 0;
  }

  sortDirOf(key: SortKey): SortDir | null {
    for (const s of this.sorts) if (s.key === key) return s.dir;
    return null;
  }

  // -------------------------------------------------------------------------
  //  Mutations — sort
  // -------------------------------------------------------------------------

  /**
   * Click a column header. Single-click replaces the sort stack with this
   * column. If it was already the primary sort, flip its direction
   * instead. Default direction for new keys is `asc`, except for numeric
   * "interesting" columns where descending feels more natural.
   */
  setPrimarySort(key: SortKey): void {
    const current = this.sorts[0];
    if (current !== undefined && current.key === key) {
      this.sorts = [{ key, dir: current.dir === "asc" ? "desc" : "asc" }];
      return;
    }
    this.sorts = [{ key, dir: defaultDirFor(key) }];
  }

  /**
   * Shift-click a column header. Adds the key to the sort stack (or flips
   * its direction if already present). Order in the stack = priority,
   * with index 0 the primary tiebreaker.
   */
  toggleSecondarySort(key: SortKey): void {
    const existingIdx = this.sorts.findIndex((s) => s.key === key);
    if (existingIdx >= 0) {
      const current = this.sorts[existingIdx]!;
      const next = [...this.sorts];
      next[existingIdx] = { key, dir: current.dir === "asc" ? "desc" : "asc" };
      this.sorts = next;
      return;
    }
    this.sorts = [...this.sorts, { key, dir: defaultDirFor(key) }];
  }

  removeSort(key: SortKey): void {
    if (this.sorts.length <= 1) return; // keep at least one criterion
    this.sorts = this.sorts.filter((s) => s.key !== key);
  }

  // -------------------------------------------------------------------------
  //  Mutations — filters
  // -------------------------------------------------------------------------

  setQuery(q: string): void {
    this.filters = { ...this.filters, query: q };
  }

  setMinSolvable(n: number | null): void {
    this.filters = { ...this.filters, minSolvable: n };
  }

  setAvgDifficultyRange(min: number | null, max: number | null): void {
    this.filters = {
      ...this.filters,
      minAvgDifficulty: min,
      maxAvgDifficulty: max,
    };
  }

  setFavoritesOnly(on: boolean): void {
    this.filters = { ...this.filters, favoritesOnly: on };
  }

  resetFilters(): void {
    this.filters = { ...EMPTY_FILTERS };
  }

  // -------------------------------------------------------------------------
  //  Mutations — selection
  // -------------------------------------------------------------------------

  select(dice: DiceTriple | null): void {
    this.selected = dice;
  }

  // -------------------------------------------------------------------------
  //  Mutations — saved views
  // -------------------------------------------------------------------------

  saveCurrentView(name: string): SavedView {
    const trimmed = name.trim() || "Untitled view";
    const view: SavedView = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      filters: { ...this.filters },
      sorts: this.sorts.map((s) => ({ ...s })),
      createdAt: Date.now(),
    };
    this._views.push(view);
    persistViews(this._views);
    return view;
  }

  applyView(id: string): void {
    const view = this._views.find((v) => v.id === id);
    if (view === undefined) return;
    this.filters = { ...view.filters };
    this.sorts = view.sorts.map((s) => ({ ...s }));
  }

  deleteView(id: string): void {
    const idx = this._views.findIndex((v) => v.id === id);
    if (idx < 0) return;
    this._views.splice(idx, 1);
    persistViews(this._views);
  }

  // -------------------------------------------------------------------------
  //  Pure transforms
  // -------------------------------------------------------------------------

  filter(rows: readonly DiceSummary[]): DiceSummary[] {
    const queryNumbers = parseQueryNumbers(this.filters.query);
    const { minSolvable, minAvgDifficulty, maxAvgDifficulty, favoritesOnly } =
      this.filters;
    return rows.filter((r) => {
      if (queryNumbers.length > 0) {
        for (const n of queryNumbers) {
          if (!r.dice.includes(n)) return false;
        }
      }
      if (minSolvable !== null && r.solvableCount < minSolvable) return false;
      if (minAvgDifficulty !== null) {
        if (r.averageDifficulty === null) return false;
        if (r.averageDifficulty < minAvgDifficulty) return false;
      }
      if (maxAvgDifficulty !== null) {
        if (r.averageDifficulty === null) return false;
        if (r.averageDifficulty > maxAvgDifficulty) return false;
      }
      if (favoritesOnly && !this.favorites.has(r.dice)) return false;
      return true;
    });
  }

  sort(rows: readonly DiceSummary[]): DiceSummary[] {
    const sorted = [...rows];
    const stack = this.sorts.length > 0 ? this.sorts : DEFAULT_SORTS;
    sorted.sort((a, b) => {
      for (const { key, dir } of stack) {
        const cmp = compareByKey(a, b, key);
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      }
      // Always-stable final tiebreak by dice values themselves.
      for (let i = 0; i < 3; i += 1) {
        if (a.dice[i] !== b.dice[i]) return a.dice[i]! - b.dice[i]!;
      }
      return 0;
    });
    return sorted;
  }

  // -------------------------------------------------------------------------
  //  Sync — URL hash + localStorage (saved views are persisted on each
  //  mutation; the autorun here only handles the *active* state).
  // -------------------------------------------------------------------------

  startSync(): () => void {
    const writer: IReactionDisposer = autorun(() => {
      writeHash(
        HASH_KEY,
        { sorts: this.sorts, filters: this.filters },
        HASH_SCHEMA,
      );
    });
    const unsubscribe = subscribeHash(() => this.hydrateFromHash());
    return () => {
      writer();
      unsubscribe();
    };
  }

  private hydrateFromHash(): void {
    const persisted = readHash(HASH_KEY, HASH_SCHEMA);
    if (persisted === null) return;
    runInAction(() => {
      this.sorts = persisted.sorts.length > 0
        ? persisted.sorts.map((s) => ({ ...s }))
        : DEFAULT_SORTS.map((s) => ({ ...s }));
      this.filters = { ...persisted.filters };
    });
  }
}

// ---------------------------------------------------------------------------
//  Comparators
// ---------------------------------------------------------------------------

function compareByKey(a: DiceSummary, b: DiceSummary, key: SortKey): number {
  switch (key) {
    case "dice":
      for (let i = 0; i < 3; i += 1) {
        if (a.dice[i] !== b.dice[i]) return a.dice[i]! - b.dice[i]!;
      }
      return 0;
    case "solvableCount":
      return a.solvableCount - b.solvableCount;
    case "averageDifficulty":
      return nullToInfinity(a.averageDifficulty) - nullToInfinity(b.averageDifficulty);
    case "minDifficulty":
      return nullToInfinity(a.minDifficulty) - nullToInfinity(b.minDifficulty);
    case "maxDifficulty":
      return nullToInfinity(a.maxDifficulty) - nullToInfinity(b.maxDifficulty);
  }
}

function nullToInfinity(value: number | null): number {
  return value === null ? Number.POSITIVE_INFINITY : value;
}

function defaultDirFor(key: SortKey): SortDir {
  // Difficulty columns and solvable count read more naturally with their
  // dominant end first. Dice triples stay alphabetical-ish ascending.
  switch (key) {
    case "dice":
    case "averageDifficulty":
    case "minDifficulty":
    case "maxDifficulty":
      return "asc";
    case "solvableCount":
      return "desc";
  }
}

function filtersEqual(a: ExploreFilters, b: ExploreFilters): boolean {
  return (
    a.query === b.query &&
    a.minSolvable === b.minSolvable &&
    a.minAvgDifficulty === b.minAvgDifficulty &&
    a.maxAvgDifficulty === b.maxAvgDifficulty &&
    a.favoritesOnly === b.favoritesOnly
  );
}
