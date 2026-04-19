/**
 * `LookupStore` — selection state + two `Resource<T>`s that drive the
 * Lookup view.
 *
 * Selection state:
 *   - active mode (standard | aether)
 *   - active dice tuple
 *   - optional active target (when set, switch to "all solutions for
 *     this single target" view)
 *
 * Resources:
 *   - `chunk` — the easiest-known-solution map for the active dice
 *     under the active mode. Sourced from `DatasetClient`. Refreshes
 *     when mode or dice changes.
 *   - `solutionsForTarget` — every distinct equation matching the
 *     active target on the active dice. Sourced from
 *     `SolverWorkerService`. Refreshes when target / dice / mode
 *     changes; reset to idle when target clears.
 *
 * The view observes either resource directly via `Resource<T>`'s state
 * machine — no `cacheTick`, no manual invalidation.
 */
import { action, computed, makeObservable, observable, reaction } from "mobx";
import type { BulkSolution, Mode, NEquation } from "@platform/core/types.js";
import { BUILT_IN_MODES } from "@platform/core/constants.js";
import { isLegalDiceForMode, generateRandomDice } from "@platform/services/generators.js";
import type { ChunkData, DatasetClient } from "../services/datasetClient.js";
import type { SolverWorkerService } from "../services/solverWorkerService.js";
import { Resource } from "./Resource.js";

export type LookupModeId = "standard" | "aether";

export interface LookupStoreOptions {
  readonly dataset: DatasetClient;
  readonly solverWorker: SolverWorkerService;
  readonly initialModeId?: LookupModeId;
  /**
   * Initial dice. If absent, a random legal tuple for the initial mode
   * is generated. If present but illegal for the mode, ignored.
   */
  readonly initialDice?: readonly number[];
}

export class LookupStore {
  private readonly dataset: DatasetClient;
  private readonly solverWorker: SolverWorkerService;
  private readonly disposers: Array<() => void> = [];

  modeId: LookupModeId;
  dice: readonly number[];
  /** When non-null, switches the view to "all solutions for this target". */
  selectedTarget: number | null = null;

  readonly chunk: Resource<ChunkData>;
  readonly solutionsForTarget: Resource<readonly NEquation[]>;

  constructor(opts: LookupStoreOptions) {
    this.dataset = opts.dataset;
    this.solverWorker = opts.solverWorker;
    this.modeId = opts.initialModeId ?? "standard";

    const initialMode = BUILT_IN_MODES[this.modeId];
    const candidate = opts.initialDice;
    this.dice =
      candidate !== undefined && isLegalDiceForMode(candidate, initialMode)
        ? [...candidate]
        : generateRandomDice(initialMode);

    this.chunk = new Resource<ChunkData>(() =>
      this.dataset.getChunk(this.mode, this.dice),
    );

    this.solutionsForTarget = new Resource<readonly NEquation[]>(() =>
      this.solverWorker.allSolutions({
        mode: this.mode,
        dice: this.dice,
        total: this.selectedTarget ?? Number.NaN,
      }),
    );

    makeObservable(this, {
      modeId: observable,
      dice: observable.ref,
      selectedTarget: observable,
      mode: computed,
      chunkSolutions: computed,
      sortedTargetsByDifficulty: computed,
      setMode: action,
      setDice: action,
      rollDice: action,
      setTarget: action,
      clearTarget: action,
    });

    // Wire reactivity: any change to (mode, dice) reloads the chunk;
    // any change to (mode, dice, selectedTarget) reloads single-target
    // solutions when a target is set, idles otherwise.
    this.disposers.push(
      reaction(
        () => `${this.modeId}|${this.dice.join(",")}`,
        () => {
          this.chunk.setFetcher(() => this.dataset.getChunk(this.mode, this.dice));
          void this.chunk.refresh();
        },
        { fireImmediately: true },
      ),
      reaction(
        () => `${this.modeId}|${this.dice.join(",")}|${this.selectedTarget ?? "—"}`,
        () => {
          if (this.selectedTarget === null) {
            this.solutionsForTarget.reset();
            return;
          }
          const target = this.selectedTarget;
          this.solutionsForTarget.setFetcher(() =>
            this.solverWorker.allSolutions({
              mode: this.mode,
              dice: this.dice,
              total: target,
            }),
          );
          void this.solutionsForTarget.refresh();
        },
      ),
    );
  }

  get mode(): Mode {
    return BUILT_IN_MODES[this.modeId];
  }

  /** Convenience getter — the current chunk's solution map, or empty. */
  get chunkSolutions(): ReadonlyMap<number, BulkSolution> {
    return this.chunk.data?.solutions ?? new Map();
  }

  /**
   * Targets sorted ascending by difficulty (easiest first). Stable
   * secondary key: target value ascending. Empty when no chunk loaded.
   */
  get sortedTargetsByDifficulty(): readonly BulkSolution[] {
    const entries: BulkSolution[] = [];
    for (const sol of this.chunkSolutions.values()) entries.push(sol);
    entries.sort((a, b) => {
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      return a.equation.total - b.equation.total;
    });
    return entries;
  }

  setMode(modeId: LookupModeId): void {
    if (this.modeId === modeId) return;
    this.modeId = modeId;
    // Re-roll dice when the mode change makes the current dice illegal
    // (e.g. switching from Æther arity-5 to Standard arity-3).
    if (!isLegalDiceForMode(this.dice, this.mode)) {
      this.dice = generateRandomDice(this.mode);
    }
    this.selectedTarget = null;
  }

  setDice(dice: readonly number[]): void {
    if (!isLegalDiceForMode(dice, this.mode)) {
      throw new RangeError(
        `LookupStore.setDice: ${JSON.stringify(dice)} is not legal under mode "${this.modeId}"`,
      );
    }
    this.dice = [...dice];
    this.selectedTarget = null;
  }

  rollDice(): void {
    this.dice = generateRandomDice(this.mode);
    this.selectedTarget = null;
  }

  setTarget(target: number): void {
    this.selectedTarget = target;
  }

  clearTarget(): void {
    this.selectedTarget = null;
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.chunk.reset();
    this.solutionsForTarget.reset();
  }
}
