/**
 * `BoardLibraryStore` — observable wrapper around {@link BoardLibraryService}.
 *
 * Loads the user's saved boards into an observable list and keeps it
 * fresh by subscribing to backend change events. Wraps every async call
 * with `runInAction` so MobX strict-mode is happy across the await
 * boundary.
 *
 * The store deliberately does NOT own ComposeStore wiring — it just
 * exposes CRUD over saved boards. ComposeStore (or any other consumer)
 * reads `entries` to populate UI and calls `save`/`remove` to mutate.
 */
import { action, makeObservable, observable, runInAction } from "mobx";
import type {
  BoardDoc,
  BoardDocBody,
  BoardLibraryService,
  SaveBoardInput,
} from "../services/boardLibrary.js";

export interface BoardLibraryStoreOptions {
  readonly service: BoardLibraryService;
  /** Resolves the current owner. Re-evaluated on every load. */
  readonly currentOwnerId: () => string;
}

export class BoardLibraryStore {
  /** Newest-first list of saved boards for the current owner. */
  entries: readonly BoardDoc[] = [];
  isLoading = false;
  lastError: string | null = null;

  private readonly service: BoardLibraryService;
  private readonly currentOwnerId: () => string;
  private unsubscribe: (() => void) | null = null;

  constructor(opts: BoardLibraryStoreOptions) {
    this.service = opts.service;
    this.currentOwnerId = opts.currentOwnerId;

    makeObservable(this, {
      entries: observable.ref,
      isLoading: observable,
      lastError: observable,
      refresh: action,
      save: action,
      remove: action,
      clearError: action,
    });

    // Subscribe once; the listener calls back into refresh() so the
    // observable list stays in sync with any insert/update/delete —
    // including ones triggered by other tabs (when the backend is
    // BroadcastChannel-aware) or background imports.
    this.unsubscribe = this.service.subscribe(() => {
      void this.refresh();
    });

    void this.refresh();
  }

  async refresh(): Promise<void> {
    runInAction(() => {
      this.isLoading = true;
      this.lastError = null;
    });
    try {
      const ownerId = this.currentOwnerId();
      const list = await this.service.list({ ownerId });
      runInAction(() => {
        this.entries = list;
      });
    } catch (err) {
      runInAction(() => {
        this.lastError = err instanceof Error ? err.message : String(err);
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  async save(title: string, body: BoardDocBody, opts?: { id?: string }): Promise<BoardDoc | null> {
    runInAction(() => {
      this.lastError = null;
    });
    try {
      const ownerId = this.currentOwnerId();
      const input: SaveBoardInput = {
        ...(opts?.id !== undefined ? { id: opts.id } : {}),
        title,
        ownerId,
        body,
      };
      const saved = await this.service.save(input);
      // refresh() will be triggered by the subscription, but call it
      // explicitly so the caller sees the new entry without waiting for
      // the listener round-trip.
      await this.refresh();
      return saved;
    } catch (err) {
      runInAction(() => {
        this.lastError = err instanceof Error ? err.message : String(err);
      });
      return null;
    }
  }

  async remove(id: string): Promise<void> {
    runInAction(() => {
      this.lastError = null;
    });
    try {
      await this.service.remove(id);
      await this.refresh();
    } catch (err) {
      runInAction(() => {
        this.lastError = err instanceof Error ? err.message : String(err);
      });
    }
  }

  clearError(): void {
    this.lastError = null;
  }

  dispose(): void {
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
