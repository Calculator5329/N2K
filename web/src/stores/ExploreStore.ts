/**
 * `ExploreStore` — selection + filter + sort state for the Explore view.
 *
 * Lazy-loads the full tuple index from `TupleIndexService` and progresses
 * incrementally — partial data is filterable/sortable while the warmup is
 * still running.
 */
import { action, computed, makeObservable, observable, reaction } from "mobx";
import { BUILT_IN_MODES } from "@platform/core/constants.js";
import type { Mode } from "@platform/core/types.js";
import type {
  TupleIndexProgress,
  TupleIndexService,
  TupleStat,
} from "../services/tupleIndexService.js";
import { FavoritesStore } from "./FavoritesStore.js";

export type ExploreModeId = "standard" | "aether";
export type SortKey =
  | "dice"
  | "solvable"
  | "minTarget"
  | "maxTarget"
  | "avgDifficulty"
  | "minDifficulty"
  | "maxDifficulty";
export type SortDir = "asc" | "desc";

export interface ExploreFilters {
  /** Substring of the dice tuple printed `a/b/c` style, or empty for any. */
  readonly query: string;
  readonly favoritesOnly: boolean;
  readonly minSolvable: number;
  readonly avgDifficultyMin: number | null;
  readonly avgDifficultyMax: number | null;
}

export interface ExploreStoreOptions {
  readonly tupleIndex: TupleIndexService;
  readonly favorites: FavoritesStore;
  readonly initialModeId?: ExploreModeId;
  /** Cap on tuples loaded for the index — useful for Æther. */
  readonly aetherSampleLimit?: number;
}

const DEFAULT_AETHER_LIMIT = 800;

export class ExploreStore {
  modeId: ExploreModeId;
  stats: readonly TupleStat[] = [];
  loadedCount = 0;
  totalCount = 0;
  isLoading = false;
  error: string | null = null;
  selectedTupleKey: string | null = null;

  filters: ExploreFilters = {
    query: "",
    favoritesOnly: false,
    minSolvable: 0,
    avgDifficultyMin: null,
    avgDifficultyMax: null,
  };
  sortKey: SortKey = "avgDifficulty";
  sortDir: SortDir = "asc";

  private readonly tupleIndex: TupleIndexService;
  readonly favorites: FavoritesStore;
  private readonly aetherLimit: number;
  private readonly disposers: Array<() => void> = [];

  constructor(opts: ExploreStoreOptions) {
    this.tupleIndex = opts.tupleIndex;
    this.favorites = opts.favorites;
    this.aetherLimit = opts.aetherSampleLimit ?? DEFAULT_AETHER_LIMIT;
    this.modeId = opts.initialModeId ?? "standard";

    makeObservable(this, {
      modeId: observable,
      stats: observable.ref,
      loadedCount: observable,
      totalCount: observable,
      isLoading: observable,
      error: observable,
      selectedTupleKey: observable,
      filters: observable,
      sortKey: observable,
      sortDir: observable,
      mode: computed,
      filteredSorted: computed,
      selectedStat: computed,
      setMode: action,
      setQuery: action,
      setFavoritesOnly: action,
      setMinSolvable: action,
      setAvgDifficultyRange: action,
      setSort: action,
      selectTuple: action,
      clearSelection: action,
    });

    this.disposers.push(
      reaction(
        () => this.modeId,
        () => this.loadIndex(),
        { fireImmediately: true },
      ),
    );
  }

  get mode(): Mode {
    return BUILT_IN_MODES[this.modeId];
  }

  get filteredSorted(): readonly TupleStat[] {
    const f = this.filters;
    let rows = this.stats;
    if (f.favoritesOnly) {
      rows = rows.filter((s) => this.favorites.isFavorite(this.modeId, s.dice));
    }
    if (f.query.trim().length > 0) {
      const q = f.query.replace(/\s+/g, "");
      rows = rows.filter((s) => s.dice.join("/").includes(q));
    }
    if (f.minSolvable > 0) {
      rows = rows.filter((s) => s.solvableCount >= f.minSolvable);
    }
    if (f.avgDifficultyMin !== null) {
      rows = rows.filter((s) => s.avgDifficulty >= f.avgDifficultyMin!);
    }
    if (f.avgDifficultyMax !== null) {
      rows = rows.filter((s) => s.avgDifficulty <= f.avgDifficultyMax!);
    }
    const dir = this.sortDir === "asc" ? 1 : -1;
    const key = this.sortKey;
    return [...rows].sort((a, b) => {
      const cmp = compareStat(a, b, key);
      return cmp * dir;
    });
  }

  get selectedStat(): TupleStat | null {
    if (this.selectedTupleKey === null) return null;
    return this.stats.find((s) => tupleKeyOf(s) === this.selectedTupleKey) ?? null;
  }

  setMode(modeId: ExploreModeId): void {
    if (modeId === this.modeId) return;
    this.modeId = modeId;
    this.selectedTupleKey = null;
  }

  setQuery(query: string): void {
    this.filters = { ...this.filters, query };
  }

  setFavoritesOnly(value: boolean): void {
    this.filters = { ...this.filters, favoritesOnly: value };
  }

  setMinSolvable(value: number): void {
    this.filters = { ...this.filters, minSolvable: Math.max(0, value | 0) };
  }

  setAvgDifficultyRange(min: number | null, max: number | null): void {
    this.filters = { ...this.filters, avgDifficultyMin: min, avgDifficultyMax: max };
  }

  setSort(key: SortKey): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
    } else {
      this.sortKey = key;
      this.sortDir = key === "dice" || key === "minTarget" ? "asc" : "asc";
    }
  }

  selectTuple(stat: TupleStat | null): void {
    this.selectedTupleKey = stat === null ? null : tupleKeyOf(stat);
  }

  clearSelection(): void {
    this.selectedTupleKey = null;
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }

  private async loadIndex(): Promise<void> {
    this.stats = [];
    this.loadedCount = 0;
    this.totalCount = 0;
    this.isLoading = true;
    this.error = null;
    const limit = this.modeId === "aether" ? this.aetherLimit : undefined;
    try {
      await this.tupleIndex.getIndex(this.mode, {
        ...(limit !== undefined ? { limit } : {}),
        onProgress: (p: TupleIndexProgress) => {
          this.applyProgress(p);
        },
      });
      this.isLoading = false;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.isLoading = false;
    }
  }

  private applyProgress = action((p: TupleIndexProgress): void => {
    this.stats = [...p.stats];
    this.loadedCount = p.done;
    this.totalCount = p.total;
  });
}

function compareStat(a: TupleStat, b: TupleStat, key: SortKey): number {
  switch (key) {
    case "dice":
      return compareTuple(a.dice, b.dice);
    case "solvable":
      return a.solvableCount - b.solvableCount;
    case "minTarget":
      return (a.minTarget ?? Number.POSITIVE_INFINITY) - (b.minTarget ?? Number.POSITIVE_INFINITY);
    case "maxTarget":
      return (a.maxTarget ?? Number.NEGATIVE_INFINITY) - (b.maxTarget ?? Number.NEGATIVE_INFINITY);
    case "avgDifficulty":
      return a.avgDifficulty - b.avgDifficulty;
    case "minDifficulty":
      return a.minDifficulty - b.minDifficulty;
    case "maxDifficulty":
      return a.maxDifficulty - b.maxDifficulty;
    default:
      return 0;
  }
}

function compareTuple(a: readonly number[], b: readonly number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const cmp = (a[i] ?? 0) - (b[i] ?? 0);
    if (cmp !== 0) return cmp;
  }
  return a.length - b.length;
}

function tupleKeyOf(s: TupleStat): string {
  return `${s.modeId}|${s.dice.join(",")}`;
}
