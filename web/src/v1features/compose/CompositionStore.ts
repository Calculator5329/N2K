import { makeAutoObservable, runInAction } from "mobx";
import {
  generateBoard,
  type BoardSpec,
  type BoardOverride,
} from "@solver/services/generators.js";
import {
  generateBalancedRolls,
  type BalancedRollsResult,
} from "@solver/services/competition.js";
import { BOARD } from "@solver/core/constants.js";
import { DataStore } from "../../v1stores/DataStore";
import {
  ensureDifficultyMatrixLoaded,
  makeDataStoreResolver,
} from "../../v1services/competitionService";
import {
  CANDIDATE_POOLS,
  getCandidatePool,
  type CandidatePoolId,
} from "../../v1services/candidatePools";
import {
  decodeShareable,
  encodeShareable,
} from "../../v1services/compressedHashCodec";
import { writeHash, readHash } from "../../v1services/urlHashState";

/** Time-budget presets surfaced in the UI for `expectedScore`. */
export const TIME_BUDGET_PRESETS = [30, 60, 120] as const;
export type TimeBudgetPreset = (typeof TIME_BUDGET_PRESETS)[number];

/** UI-side editable board configuration; lowered to a `BoardSpec` at gen-time. */
export interface BoardConfig {
  readonly id: string;
  kind: "random" | "pattern";
  /** Random kind. */
  rangeMin: number;
  rangeMax: number;
  /** Pattern kind. */
  multiples: number[];
  patternStart: number;
  /** Number of competition rounds for this board. */
  rounds: number;
  /** Per-cell pinned values, keyed by `row * COLS + col`. */
  overrides: Map<number, number>;
  /** Last successfully generated board; rendered as a 6×6 preview. */
  preview: number[] | null;
  /** Most recent generation result for this board. */
  result: BalancedRollsResult | null;
  /** Per-board generation status (independent of the global flag). */
  status: "idle" | "running" | "ready" | "error";
  errorMessage: string | null;
}

interface NewBoardOptions {
  kind?: "random" | "pattern";
  rangeMin?: number;
  rangeMax?: number;
  multiples?: number[];
  patternStart?: number;
  rounds?: number;
}

let nextId = 1;
function makeBoardConfig(opts: NewBoardOptions = {}): BoardConfig {
  return {
    id: `board-${nextId++}`,
    kind: opts.kind ?? "random",
    rangeMin: opts.rangeMin ?? 1,
    rangeMax: opts.rangeMax ?? 999,
    multiples: opts.multiples ?? [6],
    patternStart: opts.patternStart ?? 6,
    rounds: opts.rounds ?? 4,
    overrides: new Map(),
    preview: null,
    result: null,
    status: "idle",
    errorMessage: null,
  };
}

/**
 * Top-level store for the Compose feature.
 *
 * Owns the editable board list, the global competition config (candidate
 * pool, time budget, optional seed), and the orchestration state for
 * generating balanced rolls per board.
 */
export class CompositionStore {
  boards: BoardConfig[] = [
    makeBoardConfig({ kind: "random", rangeMin: 1, rangeMax: 200 }),
    makeBoardConfig({ kind: "pattern", multiples: [6], patternStart: 6 }),
  ];
  candidatePool: CandidatePoolId = "standard";
  timeBudget: TimeBudgetPreset = 60;
  seed: string = "";

  /** Global "running" flag — true while any board is generating. */
  generating = false;
  /** Loading progress for candidate dice chunks (0..1). */
  loadProgress = 1;
  globalError: string | null = null;

  constructor(private readonly dataStore: DataStore) {
    makeAutoObservable(this, { /* dataStore has its own observability */ }, { autoBind: true });
  }

  // -------------------------------------------------------------------------
  // Board CRUD
  // -------------------------------------------------------------------------

  addBoard(opts: NewBoardOptions = {}): void {
    this.boards.push(makeBoardConfig(opts));
  }

  removeBoard(id: string): void {
    this.boards = this.boards.filter((b) => b.id !== id);
  }

  updateBoard(id: string, patch: Partial<Omit<BoardConfig, "id" | "overrides">>): void {
    const board = this.boards.find((b) => b.id === id);
    if (board === undefined) return;
    Object.assign(board, patch);
    // Editing parameters invalidates any prior preview/results.
    board.preview = null;
    board.result = null;
    board.status = "idle";
    board.errorMessage = null;
  }

  setOverride(id: string, slot: number, value: number | null): void {
    const board = this.boards.find((b) => b.id === id);
    if (board === undefined) return;
    if (value === null || Number.isNaN(value)) {
      board.overrides.delete(slot);
    } else {
      board.overrides.set(slot, value);
    }
    board.preview = null;
    board.result = null;
    board.status = "idle";
    board.errorMessage = null;
  }

  // -------------------------------------------------------------------------
  // Global config
  // -------------------------------------------------------------------------

  setPool(pool: CandidatePoolId): void {
    this.candidatePool = pool;
  }

  setTimeBudget(value: TimeBudgetPreset): void {
    this.timeBudget = value;
  }

  setSeed(value: string): void {
    this.seed = value;
  }

  // -------------------------------------------------------------------------
  // Preview a single board (no competition generation)
  // -------------------------------------------------------------------------

  previewBoard(id: string): void {
    const board = this.boards.find((b) => b.id === id);
    if (board === undefined) return;
    try {
      const spec = toBoardSpec(board);
      const cells = generateBoard(spec, this.makeRng(board.id, "preview"));
      runInAction(() => {
        board.preview = cells;
        board.errorMessage = null;
      });
    } catch (err) {
      runInAction(() => {
        board.preview = null;
        board.errorMessage = err instanceof Error ? err.message : String(err);
        board.status = "error";
      });
    }
  }

  // -------------------------------------------------------------------------
  // Run the competition generator for every board
  // -------------------------------------------------------------------------

  async generateAll(): Promise<void> {
    if (this.generating) return;
    runInAction(() => {
      this.generating = true;
      this.globalError = null;
      this.loadProgress = 0;
      for (const b of this.boards) {
        b.status = "idle";
        b.errorMessage = null;
        b.result = null;
      }
    });

    try {
      const candidates = getCandidatePool(this.candidatePool);
      // Phase 1 — load the bundled difficulty matrix once. Cached for
      // the page lifetime, so subsequent generations skip the wait.
      await ensureDifficultyMatrixLoaded(this.dataStore, {
        onProgress: (loaded, total) => {
          runInAction(() => {
            this.loadProgress = total === 0 ? 1 : loaded / total;
          });
        },
      });

      const resolver = makeDataStoreResolver(this.dataStore);

      // Phase 2 — generate per board. Boards are independent (per-task
      // confirmation #1: balance is per-board only) so order and isolation
      // don't matter; we just walk the list.
      for (const board of this.boards) {
        runInAction(() => {
          board.status = "running";
        });
        try {
          const spec = toBoardSpec(board);
          const cells = generateBoard(spec, this.makeRng(board.id, "board"));
          const result = generateBalancedRolls(
            cells,
            candidates,
            board.rounds,
            resolver,
            {
              scoreOptions: { timeBudget: this.timeBudget },
              rng: this.makeRng(board.id, "rolls"),
            },
          );
          runInAction(() => {
            board.preview = cells;
            board.result = result;
            board.status = "ready";
          });
        } catch (err) {
          runInAction(() => {
            board.status = "error";
            board.errorMessage = err instanceof Error ? err.message : String(err);
          });
        }
      }
    } catch (err) {
      runInAction(() => {
        this.globalError = err instanceof Error ? err.message : String(err);
      });
    } finally {
      runInAction(() => {
        this.generating = false;
      });
    }
  }

  // -------------------------------------------------------------------------
  // Derived helpers
  // -------------------------------------------------------------------------

  get poolMeta() {
    return CANDIDATE_POOLS.find((p) => p.id === this.candidatePool)!;
  }

  // -------------------------------------------------------------------------
  // Shareable plan URL (#17) — CompressionStream + base64url
  // -------------------------------------------------------------------------

  /**
   * Build the share-friendly snapshot of the current plan.
   *
   * v2 (current): also embeds each board's generated `preview` (cells)
   * and `result` (BalancedRollsResult) when present. That makes a shared
   * link fully self-contained — the recipient sees the same dice rolls
   * the sender saw, without needing the dataset, a re-run, or even a
   * matching seed.
   *
   * Boards that haven't been generated yet contribute no extra bytes,
   * so an unrun plan still serializes as compactly as v1.
   */
  snapshot(): SharedPlanV2 {
    return {
      version: 2,
      pool: this.candidatePool,
      timeBudget: this.timeBudget,
      seed: this.seed,
      boards: this.boards.map((b) => {
        const board: SharedBoardV2 = {
          kind: b.kind,
          rangeMin: b.rangeMin,
          rangeMax: b.rangeMax,
          multiples: [...b.multiples],
          patternStart: b.patternStart,
          rounds: b.rounds,
          overrides: [...b.overrides.entries()].map(([slot, value]) => [slot, value]),
        };
        if (b.preview !== null) board.preview = [...b.preview];
        if (b.result !== null) board.result = cloneResult(b.result);
        return board;
      }),
    };
  }

  /**
   * Replace the in-memory plan with a decoded snapshot.
   *
   * Accepts both v1 (configs only) and v2 (configs + preview + result)
   * envelopes. v2 boards with embedded results are restored straight
   * to `status: "ready"` so `CompetitionResults` renders immediately —
   * no Generate click required.
   */
  applySnapshot(plan: SharedPlanV1 | SharedPlanV2): void {
    if (plan.version !== 1 && plan.version !== 2) return;
    this.candidatePool = plan.pool;
    this.timeBudget = plan.timeBudget;
    this.seed = plan.seed;
    this.boards = plan.boards.map((b) =>
      makeBoardConfig({
        kind: b.kind,
        rangeMin: b.rangeMin,
        rangeMax: b.rangeMax,
        multiples: b.multiples,
        patternStart: b.patternStart,
        rounds: b.rounds,
      }),
    );
    plan.boards.forEach((b, i) => {
      const board = this.boards[i];
      if (board === undefined) return;
      for (const [slot, value] of b.overrides) {
        board.overrides.set(slot, value);
      }
      // v2 only — back-compat with v1 that lacks these fields.
      if (plan.version === 2) {
        const v2 = b as SharedBoardV2;
        if (v2.preview !== undefined) board.preview = [...v2.preview];
        if (v2.result !== undefined) {
          board.result = cloneResult(v2.result);
          board.status = "ready";
        }
      }
    });
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
    const decoded = await decodeShareable<SharedPlanV1 | SharedPlanV2>(raw);
    if (decoded === null) return false;
    runInAction(() => this.applySnapshot(decoded));
    return true;
  }

  // -------------------------------------------------------------------------
  // Internal — RNG factory + spec lowering
  // -------------------------------------------------------------------------

  /**
   * Build a deterministic RNG when `seed` is set, otherwise fall back to
   * `Math.random`. The salt makes board-preview RNGs distinct from
   * roll-selection RNGs so previewing doesn't perturb the rolls.
   */
  private makeRng(boardId: string, salt: string): () => number {
    if (this.seed.trim() === "") return Math.random;
    return mulberry32(hashString(`${this.seed}::${boardId}::${salt}`));
  }
}

/** Convert a UI-editable `BoardConfig` to the pure `BoardSpec`. */
function toBoardSpec(board: BoardConfig): BoardSpec {
  const overrides: BoardOverride[] = [...board.overrides.entries()].map(
    ([slot, value]) => ({ slot, value }),
  );
  if (board.kind === "random") {
    return {
      kind: "random",
      range: { min: board.rangeMin, max: board.rangeMax },
      overrides,
    };
  }
  return {
    kind: "pattern",
    multiples: board.multiples,
    start: board.patternStart,
    overrides,
  };
}

/** FNV-1a 32-bit hash — small + good enough for seed dispersion. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 — tiny seedable PRNG returning `[0, 1)`. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BOARD_ROWS = BOARD.rows;
export const BOARD_COLS = BOARD.cols;
export const BOARD_SIZE = BOARD.size;

// ---------------------------------------------------------------------------
//  Shared-plan schema (#17)
//
//  The plan envelope is independently versioned so we can evolve it
//  without breaking older permalinks. The hash util only sees an opaque
//  string — compression and JSON parsing happen in `compressedHashCodec`.
// ---------------------------------------------------------------------------

export interface SharedPlanV1 {
  version: 1;
  pool: CandidatePoolId;
  timeBudget: TimeBudgetPreset;
  seed: string;
  boards: Array<{
    kind: "random" | "pattern";
    rangeMin: number;
    rangeMax: number;
    multiples: number[];
    patternStart: number;
    rounds: number;
    overrides: Array<[number, number]>;
  }>;
}

/**
 * v2: same envelope as v1 plus optional generated state per board so a
 * shared link can drop the recipient straight into the results view.
 *
 * `preview` and `result` are optional — boards that haven't been
 * generated yet contribute zero extra bytes to the URL, so a "share
 * before generating" link is the same size as a v1 envelope.
 */
export interface SharedBoardV2 {
  kind: "random" | "pattern";
  rangeMin: number;
  rangeMax: number;
  multiples: number[];
  patternStart: number;
  rounds: number;
  overrides: Array<[number, number]>;
  /** Generated 36-cell board (row-major). Present iff the board was generated. */
  preview?: number[];
  /** Generated balanced rolls + per-player totals. Present iff generated. */
  result?: BalancedRollsResult;
}

export interface SharedPlanV2 {
  version: 2;
  pool: CandidatePoolId;
  timeBudget: TimeBudgetPreset;
  seed: string;
  boards: SharedBoardV2[];
}

/**
 * Defensive deep-copy of a `BalancedRollsResult` so the snapshot envelope
 * doesn't share references with the live store (and so a decoded result
 * gets a fresh, mutable-shaped object rather than `Object.freeze`-style
 * `readonly` frozen JSON).
 */
function cloneResult(result: BalancedRollsResult): BalancedRollsResult {
  return {
    rounds: result.rounds.map((r) => ({
      p1: [r.p1[0], r.p1[1], r.p1[2]] as const,
      p2: [r.p2[0], r.p2[1], r.p2[2]] as const,
      p1Difficulty: r.p1Difficulty,
      p2Difficulty: r.p2Difficulty,
      p1ExpectedScore: r.p1ExpectedScore,
      p2ExpectedScore: r.p2ExpectedScore,
    })),
    p1TotalDifficulty: result.p1TotalDifficulty,
    p2TotalDifficulty: result.p2TotalDifficulty,
    difficultyDelta: result.difficultyDelta,
    p1TotalExpectedScore: result.p1TotalExpectedScore,
    p2TotalExpectedScore: result.p2TotalExpectedScore,
    expectedScoreDelta: result.expectedScoreDelta,
  };
}

/**
 * Trivial pass-through schema. The compressed payload is already
 * URL-safe (`v1.{base64url}`), so the hash util just stores it verbatim.
 */
const COMPOSE_PLAN_SCHEMA = {
  encode(value: string): string {
    return value;
  },
  decode(raw: string): string | null {
    return raw.length === 0 ? null : raw;
  },
};
