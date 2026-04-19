import { action, makeAutoObservable, runInAction } from "mobx";
import type {
  ByTargetEntry,
  DatasetIndex,
  DiceDetail,
  DiceTriple,
  DifficultyMatrix,
  Loadable,
  TargetStatsEntry,
} from "../core/types";
import { datasetService } from "../v1services/datasetService";

function diceKey(dice: DiceTriple): string {
  return `${dice[0]}-${dice[1]}-${dice[2]}`;
}

/**
 * Holds the canonical dataset state for the app. Lazy-loads per-dice
 * detail files on demand and caches them by dice key.
 *
 * UI components observe this store; they never call the service directly.
 */
export class DataStore {
  index: Loadable<DatasetIndex> = { status: "idle" };
  byTarget: Loadable<Readonly<Record<string, ByTargetEntry | null>>> = { status: "idle" };
  targetStats: Loadable<Readonly<Record<string, TargetStatsEntry>>> = { status: "idle" };
  difficultyMatrix: Loadable<DifficultyMatrix> = { status: "idle" };

  /** Lazy cache of dice-detail files keyed by `"a-b-c"`. */
  private readonly diceCache = new Map<string, Loadable<DiceDetail>>();
  /** Track in-flight fetches to dedupe concurrent requests. */
  private readonly pendingDice = new Map<string, Promise<DiceDetail>>();

  constructor() {
    makeAutoObservable(this, {
      loadIndex: action,
      loadByTarget: action,
      loadTargetStats: action,
      loadDifficultyMatrix: action,
      ensureDice: action,
    });
  }

  loadIndex(): Promise<void> {
    if (this.index.status === "loading" || this.index.status === "ready") {
      return Promise.resolve();
    }
    this.index = { status: "loading" };
    return datasetService
      .loadIndex()
      .then((value) =>
        runInAction(() => {
          this.index = { status: "ready", value };
        }),
      )
      .catch((err: unknown) =>
        runInAction(() => {
          this.index = { status: "error", error: String(err) };
        }),
      );
  }

  loadByTarget(): Promise<void> {
    if (this.byTarget.status === "loading" || this.byTarget.status === "ready") {
      return Promise.resolve();
    }
    this.byTarget = { status: "loading" };
    return datasetService
      .loadByTarget()
      .then((value) =>
        runInAction(() => {
          this.byTarget = { status: "ready", value };
        }),
      )
      .catch((err: unknown) =>
        runInAction(() => {
          this.byTarget = { status: "error", error: String(err) };
        }),
      );
  }

  loadTargetStats(): Promise<void> {
    if (this.targetStats.status === "loading" || this.targetStats.status === "ready") {
      return Promise.resolve();
    }
    this.targetStats = { status: "loading" };
    return datasetService
      .loadTargetStats()
      .then((value) =>
        runInAction(() => {
          this.targetStats = { status: "ready", value };
        }),
      )
      .catch((err: unknown) =>
        runInAction(() => {
          this.targetStats = { status: "error", error: String(err) };
        }),
      );
  }

  /**
   * Load the equation-stripped difficulty matrix used by Compose. Cached
   * for the lifetime of the page; safe to call repeatedly. Resolves on
   * success and on error (state is mirrored on `difficultyMatrix`).
   */
  loadDifficultyMatrix(): Promise<void> {
    if (
      this.difficultyMatrix.status === "loading" ||
      this.difficultyMatrix.status === "ready"
    ) {
      return Promise.resolve();
    }
    this.difficultyMatrix = { status: "loading" };
    return datasetService
      .loadDifficultyMatrix()
      .then((value) =>
        runInAction(() => {
          this.difficultyMatrix = { status: "ready", value };
        }),
      )
      .catch((err: unknown) =>
        runInAction(() => {
          this.difficultyMatrix = { status: "error", error: String(err) };
        }),
      );
  }

  /** Synchronous accessor returning the cached dice detail. */
  diceState(dice: DiceTriple): Loadable<DiceDetail> {
    return this.diceCache.get(diceKey(dice)) ?? { status: "idle" };
  }

  /**
   * Kick off a load for a dice triple if one isn't already in flight or
   * ready. Safe to call repeatedly from `useEffect`.
   */
  ensureDice(dice: DiceTriple): void {
    const key = diceKey(dice);
    const cached = this.diceCache.get(key);
    if (cached?.status === "ready" || cached?.status === "loading") return;

    this.diceCache.set(key, { status: "loading" });
    const promise =
      this.pendingDice.get(key) ??
      datasetService.loadDice(dice).finally(() => this.pendingDice.delete(key));
    this.pendingDice.set(key, promise);

    promise
      .then((value) =>
        runInAction(() => {
          this.diceCache.set(key, { status: "ready", value });
        }),
      )
      .catch((err: unknown) =>
        runInAction(() => {
          this.diceCache.set(key, { status: "error", error: String(err) });
        }),
      );
  }
}
