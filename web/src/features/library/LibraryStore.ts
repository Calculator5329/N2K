/**
 * `LibraryStore` — drives the Library tab.
 *
 * Owns the in-memory list of saved competitions plus the local UI
 * sort + selection state. All persistence goes through the
 * `CompetitionLibrary` service, which fronts the abstract
 * `ContentBackend` (LocalStorage today). The store is intentionally
 * thin — it owns *display order*, not storage details.
 *
 * Three dialogs hang off the store (open via `mode`):
 *   - `"play-picker"` — pick vs-bot vs hot-seat, pick persona
 *   - `"save-as"`     — name a new entry (forked from current draft)
 *   - `"rename"`      — rename an existing saved entry
 *
 * The dialogs render in `LibraryView`; the store just tracks intent.
 */
import { makeAutoObservable, runInAction } from "mobx";
import {
  CompetitionLibrary,
  defaultCompetitionLibrary,
  newSavedId,
  type LibraryEntry,
} from "../../services/competitionLibrary";
import {
  computeMatchStats,
  loadAllStats,
  type MatchStats,
} from "../../services/matchStats";
import type { SharedPlanV5 } from "../compose/CompositionStore";

export type LibrarySort = "last-played" | "updated" | "name";

export type LibraryDialog =
  | { kind: "none" }
  | { kind: "play-picker"; entryId: string }
  | { kind: "save-as"; suggestedName: string }
  | { kind: "rename"; entryId: string; currentName: string }
  | { kind: "history"; entryId: string };

export class LibraryStore {
  /** All known saved entries; refreshed on `refresh()`. */
  entries: readonly LibraryEntry[] = [];
  /** Per-entry roll-up stats (last-played / best avg score / play count). */
  statsByCompId: ReadonlyMap<string, MatchStats> = new Map();
  loadingState: "idle" | "loading" | "ready" | "error" = "idle";
  errorMessage: string | null = null;
  sort: LibrarySort = "last-played";
  dialog: LibraryDialog = { kind: "none" };

  constructor(
    private readonly service: CompetitionLibrary = defaultCompetitionLibrary,
  ) {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // -------------------------------------------------------------------
  //  Selectors
  // -------------------------------------------------------------------

  /**
   * The visible list, sorted by the active sort mode. `last-played`
   * falls back to `updatedAt` for entries without recorded matches.
   */
  get sortedEntries(): readonly LibraryEntry[] {
    const list = [...this.entries];
    switch (this.sort) {
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "updated":
        list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
        break;
      case "last-played":
      default:
        list.sort((a, b) => {
          const ap = this.lastPlayedAt(a.id) ?? a.updatedAt;
          const bp = this.lastPlayedAt(b.id) ?? b.updatedAt;
          return ap < bp ? 1 : -1;
        });
    }
    return list;
  }

  lastPlayedAt(compId: string): string | null {
    return this.statsByCompId.get(compId)?.lastPlayedAt ?? null;
  }

  bestAvgScore(compId: string): number | null {
    return this.statsByCompId.get(compId)?.bestAvgScore ?? null;
  }

  playCount(compId: string): number {
    return this.statsByCompId.get(compId)?.matches.length ?? 0;
  }

  setSort(sort: LibrarySort): void {
    this.sort = sort;
  }

  // -------------------------------------------------------------------
  //  Dialogs
  // -------------------------------------------------------------------

  openPlayPicker(entryId: string): void {
    this.dialog = { kind: "play-picker", entryId };
  }

  openSaveAs(suggestedName: string): void {
    this.dialog = { kind: "save-as", suggestedName };
  }

  openRename(entry: LibraryEntry): void {
    this.dialog = { kind: "rename", entryId: entry.id, currentName: entry.name };
  }

  openHistory(entryId: string): void {
    this.dialog = { kind: "history", entryId };
  }

  closeDialog(): void {
    this.dialog = { kind: "none" };
  }

  // -------------------------------------------------------------------
  //  CRUD
  // -------------------------------------------------------------------

  async refresh(): Promise<void> {
    this.loadingState = "loading";
    try {
      const [entries, stats] = await Promise.all([
        this.service.list(),
        loadAllStats(),
      ]);
      runInAction(() => {
        this.entries = entries;
        this.statsByCompId = stats;
        this.loadingState = "ready";
        this.errorMessage = null;
      });
    } catch (err) {
      runInAction(() => {
        this.loadingState = "error";
        this.errorMessage = err instanceof Error ? err.message : String(err);
      });
    }
  }

  /**
   * Persist a snapshot under a freshly-minted Library id. Returns the
   * id so the caller can re-bind the live `CompositionStore` to it.
   */
  async createFromSnapshot(name: string, snapshot: SharedPlanV5): Promise<string> {
    const id = newSavedId();
    const body: SharedPlanV5 = { ...snapshot, name };
    await this.service.save(id, body);
    await this.refresh();
    return id;
  }

  async rename(id: string, name: string): Promise<boolean> {
    const ok = await this.service.rename(id, name);
    if (ok) await this.refresh();
    return ok;
  }

  async remove(id: string): Promise<void> {
    await this.service.remove(id);
    await this.refresh();
  }

  async duplicate(id: string): Promise<string | null> {
    const newId = await this.service.duplicate(id);
    if (newId !== null) await this.refresh();
    return newId;
  }

  /**
   * Re-roll the per-comp stats roll-ups from the `matchStats` store.
   * Called after `MatchStore.recordMatch()` so the Library card on
   * the next visit reflects the just-finished match.
   */
  async refreshStats(): Promise<void> {
    const stats = await loadAllStats();
    runInAction(() => {
      this.statsByCompId = stats;
    });
  }

  /**
   * Compute roll-up stats for one comp from its raw match log. Useful
   * for the history drawer + immediately after a match without
   * waiting for a full reload.
   */
  rollupFor(compId: string): MatchStats {
    return computeMatchStats(this.statsByCompId.get(compId)?.matches ?? []);
  }
}
