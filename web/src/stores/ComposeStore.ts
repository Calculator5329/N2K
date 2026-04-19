/**
 * `ComposeStore` — board editor + competition generator state.
 *
 * Owns one or more board configurations (random / pattern), each with a
 * round count and an optional "pinned" cell mask. Triggers
 * `CompetitionService.generate` and exposes the result to the view + the
 * export buttons.
 *
 * Persists nothing yet — the eventual `ContentBackend.put("competition", …)`
 * lands as part of Phase 6.
 */
import { action, computed, makeObservable, observable } from "mobx";
import { BUILT_IN_MODES, BOARD } from "@platform/core/constants.js";
import {
  generatePatternBoard,
  generateRandomBoard,
} from "@platform/services/generators.js";
import type {
  CandidatePool,
  CompetitionConfig,
  CompetitionPlan,
  CompetitionService,
} from "../services/competitionService.js";

export type BoardKind = "random" | "pattern";
export type ComposeModeId = "standard" | "aether";

export interface BoardConfig {
  readonly id: string;
  readonly kind: BoardKind;
  /** Random-mode params. */
  readonly random: { readonly min: number; readonly max: number };
  /** Pattern-mode params. */
  readonly pattern: { readonly multiples: readonly number[]; readonly start: number };
  rounds: number;
  /** Frozen cell list — regenerated via `regenerate()`. */
  cells: readonly number[];
  /** Indexes of pinned cells (kept across regeneration). */
  pinned: ReadonlySet<number>;
}

export interface ComposeStoreOptions {
  readonly competition: CompetitionService;
}

let nextBoardId = 1;

export class ComposeStore {
  modeId: ComposeModeId = "standard";
  boards: readonly BoardConfig[] = [];
  pool: CandidatePool = "standard";
  timeBudgetMs = 60_000;
  seed: number | null = null;

  isGenerating = false;
  plan: CompetitionPlan | null = null;
  lastError: string | null = null;

  private readonly competition: CompetitionService;

  constructor(opts: ComposeStoreOptions) {
    this.competition = opts.competition;
    this.boards = [makeBoard("random", BUILT_IN_MODES.standard.targetRange)];

    makeObservable(this, {
      modeId: observable,
      boards: observable.ref,
      pool: observable,
      timeBudgetMs: observable,
      seed: observable,
      isGenerating: observable,
      plan: observable.ref,
      lastError: observable,
      mode: computed,
      setMode: action,
      addBoard: action,
      removeBoard: action,
      updateBoard: action,
      regenerateBoard: action,
      togglePin: action,
      setPool: action,
      setTimeBudget: action,
      setSeed: action,
      generate: action,
      clearPlan: action,
    });
  }

  get mode() {
    return BUILT_IN_MODES[this.modeId];
  }

  setMode(modeId: ComposeModeId): void {
    this.modeId = modeId;
    this.boards = this.boards.map((b) => ({
      ...b,
      cells: regenerateCells(b),
    }));
  }

  addBoard(): void {
    this.boards = [...this.boards, makeBoard("random", this.mode.targetRange)];
  }

  removeBoard(id: string): void {
    if (this.boards.length <= 1) return;
    this.boards = this.boards.filter((b) => b.id !== id);
  }

  updateBoard(id: string, patch: Partial<Omit<BoardConfig, "id">>): void {
    this.boards = this.boards.map((b) => {
      if (b.id !== id) return b;
      const next = { ...b, ...patch };
      // Regenerate cells when params changed (kind/random/pattern). Skip
      // when only pinned/rounds/cells changed.
      const paramsChanged =
        patch.kind !== undefined || patch.random !== undefined || patch.pattern !== undefined;
      if (paramsChanged) {
        next.cells = regenerateCells(next);
      }
      return next;
    });
  }

  regenerateBoard(id: string): void {
    this.boards = this.boards.map((b) => {
      if (b.id !== id) return b;
      return { ...b, cells: regenerateCells(b) };
    });
  }

  togglePin(boardId: string, index: number): void {
    this.boards = this.boards.map((b) => {
      if (b.id !== boardId) return b;
      const next = new Set(b.pinned);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...b, pinned: next };
    });
  }

  setPool(pool: CandidatePool): void {
    this.pool = pool;
  }

  setTimeBudget(ms: number): void {
    this.timeBudgetMs = Math.max(1000, ms);
  }

  setSeed(seed: number | null): void {
    this.seed = seed;
  }

  clearPlan(): void {
    this.plan = null;
    this.lastError = null;
  }

  async generate(): Promise<void> {
    if (this.isGenerating) return;
    this.isGenerating = true;
    this.lastError = null;
    try {
      const config: CompetitionConfig = {
        modeId: this.modeId,
        boards: this.boards.map((b) => ({
          id: b.id,
          cells: b.cells,
          rounds: b.rounds,
        })),
        pool: this.pool,
        timeBudgetMs: this.timeBudgetMs,
        ...(this.seed !== null ? { seed: this.seed } : {}),
      };
      const plan = await this.competition.generate(config);
      this.plan = plan;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    } finally {
      this.isGenerating = false;
    }
  }
}

function makeBoard(kind: BoardKind, range: { min: number; max: number }): BoardConfig {
  const id = `board-${nextBoardId++}`;
  const board: BoardConfig = {
    id,
    kind,
    random: { min: range.min, max: Math.min(range.max, 99) },
    pattern: { multiples: [6], start: 6 },
    rounds: 4,
    cells: [],
    pinned: new Set<number>(),
  };
  board.cells = regenerateCells(board);
  return board;
}

function regenerateCells(cfg: BoardConfig): number[] {
  if (cfg.kind === "pattern") {
    return generatePatternBoard(cfg.pattern.multiples, cfg.pattern.start);
  }
  const range = cfg.random;
  const safeMin = Math.min(range.min, range.max);
  const safeMax = Math.max(range.min, range.max);
  const fixedMax =
    safeMax - safeMin + 1 < BOARD.size ? safeMin + BOARD.size - 1 : safeMax;
  return generateRandomBoard(BUILT_IN_MODES.standard, {
    range: { min: safeMin, max: fixedMax },
  });
}
