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
import { action, computed, makeObservable, observable, runInAction } from "mobx";
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
import { decodeShareable, encodeShareable } from "../services/compressedHashCodec.js";
import { readHash, writeHash, type HashSchema } from "../services/urlHashState.js";

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
      applySnapshot: action,
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

  // -----------------------------------------------------------------
  // Share-link snapshot (#17 parity)
  //
  // Plans round-trip through `window.location.hash` as
  // `#plan=v1.{deflate-base64url(JSON)}`. The snapshot embeds **every**
  // editable input plus, when present, the generated `CompetitionPlan`
  // so a recipient can open the link and see results immediately
  // without paying the generator's CPU cost.
  // -----------------------------------------------------------------

  snapshot(): SharedComposePlanV1 {
    const snap: SharedComposePlanV1 = {
      version: 1,
      modeId: this.modeId,
      pool: this.pool,
      timeBudgetMs: this.timeBudgetMs,
      seed: this.seed,
      boards: this.boards.map((b) => ({
        id: b.id,
        kind: b.kind,
        random: { min: b.random.min, max: b.random.max },
        pattern: { multiples: [...b.pattern.multiples], start: b.pattern.start },
        rounds: b.rounds,
        cells: [...b.cells],
        pinned: [...b.pinned],
      })),
    };
    if (this.plan !== null) snap.plan = clonePlan(this.plan);
    return snap;
  }

  applySnapshot(snap: SharedComposePlanV1): void {
    if (snap.version !== 1) return;
    this.modeId = snap.modeId;
    this.pool = snap.pool;
    this.timeBudgetMs = snap.timeBudgetMs;
    this.seed = snap.seed;
    this.boards = snap.boards.map((b) => ({
      id: b.id,
      kind: b.kind,
      random: { min: b.random.min, max: b.random.max },
      pattern: { multiples: [...b.pattern.multiples], start: b.pattern.start },
      rounds: b.rounds,
      cells: [...b.cells],
      pinned: new Set(b.pinned),
    }));
    this.plan = snap.plan ? clonePlan(snap.plan) : null;
    this.lastError = null;
  }

  /** Build the shareable URL (window.location based) for the current plan. */
  async buildShareUrl(): Promise<string> {
    const encoded = await encodeShareable(this.snapshot());
    if (typeof window === "undefined") return encoded;
    writeHash("plan", encoded, COMPOSE_PLAN_SCHEMA);
    return window.location.href;
  }

  /** Try to rehydrate from the URL hash. No-op when nothing is set. */
  async loadFromUrl(): Promise<boolean> {
    const raw = readHash("plan", COMPOSE_PLAN_SCHEMA);
    if (raw === null) return false;
    const decoded = await decodeShareable<SharedComposePlanV1>(raw);
    if (decoded === null) return false;
    runInAction(() => this.applySnapshot(decoded));
    return true;
  }

  async generate(): Promise<void> {
    if (this.isGenerating) return;
    runInAction(() => {
      this.isGenerating = true;
      this.lastError = null;
    });
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
    try {
      // The await crosses an action boundary — every observable write
      // inside the resolution path needs its own runInAction so MobX
      // strict-mode doesn't complain.
      const plan = await this.competition.generate(config);
      runInAction(() => {
        this.plan = plan;
      });
    } catch (err) {
      runInAction(() => {
        this.lastError = err instanceof Error ? err.message : String(err);
      });
    } finally {
      runInAction(() => {
        this.isGenerating = false;
      });
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

// ---------------------------------------------------------------------------
//  Shared-plan envelope + URL hash schema
//
//  Independently versioned so the URL format can evolve without breaking
//  older permalinks. The hash util only sees an opaque string —
//  compression and JSON parsing happen in `compressedHashCodec`.
// ---------------------------------------------------------------------------

export interface SharedBoardV1 {
  readonly id: string;
  readonly kind: BoardKind;
  readonly random: { readonly min: number; readonly max: number };
  readonly pattern: { readonly multiples: readonly number[]; readonly start: number };
  readonly rounds: number;
  readonly cells: readonly number[];
  readonly pinned: readonly number[];
}

export interface SharedComposePlanV1 {
  version: 1;
  modeId: ComposeModeId;
  pool: CandidatePool;
  timeBudgetMs: number;
  seed: number | null;
  boards: SharedBoardV1[];
  plan?: CompetitionPlan;
}

/**
 * Trivial pass-through schema. The compressed payload is already
 * URL-safe (`v1.{base64url}`), so the hash util just stores it
 * verbatim.
 */
const COMPOSE_PLAN_SCHEMA: HashSchema<string> = {
  encode(value: string): string {
    return value;
  },
  decode(raw: string): string | null {
    return raw.length === 0 ? null : raw;
  },
};

function clonePlan(plan: CompetitionPlan): CompetitionPlan {
  return {
    config: {
      modeId: plan.config.modeId,
      pool: plan.config.pool,
      timeBudgetMs: plan.config.timeBudgetMs,
      ...(plan.config.seed !== undefined ? { seed: plan.config.seed } : {}),
      boards: plan.config.boards.map((b) => ({
        id: b.id,
        cells: [...b.cells],
        rounds: b.rounds,
      })),
    },
    results: plan.results.map((r) => ({
      boardId: r.boardId,
      rounds: r.rounds.map((round) => ({
        index: round.index,
        playerA: { dice: [...round.playerA.dice], expectedScore: round.playerA.expectedScore },
        playerB: { dice: [...round.playerB.dice], expectedScore: round.playerB.expectedScore },
        delta: round.delta,
      })),
      totals: { playerA: r.totals.playerA, playerB: r.totals.playerB },
    })),
    elapsedMs: plan.elapsedMs,
  };
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
