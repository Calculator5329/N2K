/**
 * `CompositionStore` — the engine behind the Competition tab.
 *
 * Owns the editable phase tree (Phase → Board → Bout count), the
 * candidate-pool / time-budget / spice / variance settings, the rules
 * toggle (Standard vs. Æther), and the generated balanced rolls.
 * Persists to `ContentBackend` (autosave + URL-hash share links) so a
 * reload or a shared link drops the user back into the same plan.
 *
 * v3.2 reframe: a competition is a list of **phases** (e.g. "Phase 1",
 * "Phase 2", "Final"). Each phase contains its own list of boards;
 * each board has its own bout count (the number of P1/P2 dice pairs
 * the generator produces for that board). The legacy code's "round"
 * vocabulary is preserved at one place only — the solver-side
 * `BalancedRollsResult.rounds` field — because it's the algorithm's
 * native output. Everywhere user-visible we call them **bouts**.
 *
 * The view (`ComposeView.tsx`) is pure presentation — every action
 * the user can take dispatches to a method on this store. The
 * services it leans on (`competitionService`, `candidatePools`,
 * `compressedHashCodec`, `urlHashState`, the upstream
 * `competition.generateBalancedRolls` algorithm) are all stateless;
 * the store is the only thing that holds Competition state.
 */
import { autorun, makeAutoObservable, runInAction, type IReactionDisposer } from "mobx";
import {
  defaultContentBackend,
  type ContentBackend,
  type ContentDoc,
} from "../../services/contentBackend";
import {
  generateBoard,
  type BoardSpec,
  type BoardOverride,
} from "@solver/services/generators.js";
import {
  generateBalancedRolls,
  type BalancedRollsResult,
  type RoundVariance,
} from "@solver/services/competition.js";
import { BOARD } from "@solver/core/constants.js";
import { DataStore } from "../../stores/DataStore";
import {
  loadDifficultyMatrixFor,
  makeMatrixResolver,
  type ResolverModeId,
} from "../../services/competitionService";
import {
  AETHER_CANDIDATE_POOLS,
  CANDIDATE_POOLS,
  getCandidatePool,
  type CandidatePoolId,
} from "../../services/candidatePools";
import {
  decodeShareable,
  encodeShareable,
} from "../../services/compressedHashCodec";
import { writeHash, readHash } from "../../services/urlHashState";

/** Time-budget presets surfaced in the UI for `expectedScore`. */
export const TIME_BUDGET_PRESETS = [30, 60, 120] as const;
export type TimeBudgetPreset = (typeof TIME_BUDGET_PRESETS)[number];

/**
 * UI-side presets for the stratifier `spice` knob. The numeric value
 * is what gets forwarded to `generateBalancedRolls`; the labels are
 * the editorial copy the picker renders. Listed easy-to-spicy.
 */
export const SPICE_PRESETS = [
  { id: "gentle" as const, value: 0, label: "Gentle", caption: "Easy half only — every round feels similar." },
  { id: "balanced" as const, value: 0.5, label: "Balanced", caption: "Spans the easier 75% — occasional tougher rolls." },
  { id: "spicy" as const, value: 1, label: "Spicy", caption: "Full stratification — early easy, late hard." },
] as const;
export type SpicePresetId = (typeof SPICE_PRESETS)[number]["id"];

function spiceValueFor(id: SpicePresetId): number {
  return SPICE_PRESETS.find((p) => p.id === id)!.value;
}
function spiceIdFor(value: number): SpicePresetId {
  // Snap to the nearest preset; older permalinks may carry literal
  // 0 / 0.5 / 1 from the algorithm, while UI-driven values always
  // come from `spiceValueFor`.
  let best: SpicePresetId = "spicy";
  let bestDist = Infinity;
  for (const p of SPICE_PRESETS) {
    const d = Math.abs(p.value - value);
    if (d < bestDist) {
      bestDist = d;
      best = p.id;
    }
  }
  return best;
}

/**
 * UI-side presets for the per-bout variance knob. The id maps 1:1
 * to the algorithm's `RoundVariance` so the wire format stays simple.
 *
 * These control how *different* P1's and P2's rolls feel within a
 * single bout — the end-of-card balancer cancels the per-bout
 * wobbles so totals stay matched in every mode. See
 * `RoundVariance` in `src/services/competition.ts` for the gory
 * details. The solver-side type is still called `RoundVariance`
 * because the algorithm pre-dates the v3.2 vocab reframe.
 */
export const VARIANCE_PRESETS = [
  {
    id: "tight" as const,
    label: "Tight",
    caption: "Twin-like rolls — both players have very similar score ceilings each bout.",
  },
  {
    id: "balanced" as const,
    label: "Balanced",
    caption: "Visibly different rolls per bout; totals still even out across the card.",
  },
  {
    id: "varied" as const,
    label: "Varied",
    caption: "Each bout feels like two different puzzles. Big per-bout swings, balanced totals.",
  },
] as const;
export type VariancePresetId = (typeof VARIANCE_PRESETS)[number]["id"];

const DEFAULT_VARIANCE: VariancePresetId = "balanced";

function isVariancePresetId(value: unknown): value is VariancePresetId {
  return (
    typeof value === "string" &&
    VARIANCE_PRESETS.some((p) => p.id === value)
  );
}

/**
 * Rules selection — which mode the resolver runs under. Mirrors the
 * Play surface's `RaceRules` so the unlock and copy stay consistent.
 *
 * Standard: keys the difficulty matrix with depowered face values
 * (`4 → 2`, etc.), uses `standard.n2k`. Pool defaults to `standard`.
 *
 * Æther: keeps every face value distinct, loads `aether-arity3.n2k`
 * on demand, accepts the wider `AETHER_MODE.diceRange` (negatives
 * included). Pool defaults to `aetherSample`.
 */
export type ComposeRules = "standard" | "aether";

const STANDARD_DEFAULT_POOL: CandidatePoolId = "standard";
const AETHER_DEFAULT_POOL: CandidatePoolId = "aetherSample";

/**
 * Per-rules bounds for board cell values. Standard mirrors the v1
 * almanac (1..999); Æther tops out one short of `AETHER_MODE.targetRange`
 * because that range is exclusive of the cap in v1's editorial
 * convention. The lower bound stays at 1 in both modes — board cells
 * are always positive integers regardless of how far the dice roam.
 */
export const RULES_CELL_BOUNDS: Readonly<
  Record<ComposeRules, Readonly<{ min: number; max: number }>>
> = {
  standard: { min: 1, max: 999 },
  aether: { min: 1, max: 4999 },
};

function clampToRange(
  value: number,
  range: Readonly<{ min: number; max: number }>,
): number {
  return Math.max(range.min, Math.min(range.max, value));
}

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
  /**
   * Number of bouts (P1/P2 dice pairs) the generator produces for
   * this board. Renamed from `rounds` in v3.2; the
   * `BalancedRollsResult.rounds` array (one entry per bout) keeps
   * its solver-side name for now.
   */
  bouts: number;
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

/**
 * A phase groups boards into a stage of the competition (e.g. "Phase 1",
 * "Final"). Phases are pure presentational structure — the generator
 * runs per board, balance is per board, and digital play just walks
 * every bout in order. They exist so the user can organize a
 * tournament-style card and so the indicator strip can say "Phase 2 ·
 * Bout 3/5" instead of just "Bout 8".
 */
export interface PhaseConfig {
  readonly id: string;
  name: string;
  boards: BoardConfig[];
}

interface NewBoardOptions {
  kind?: "random" | "pattern";
  rangeMin?: number;
  rangeMax?: number;
  multiples?: number[];
  patternStart?: number;
  bouts?: number;
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
    bouts: opts.bouts ?? 4,
    overrides: new Map(),
    preview: null,
    result: null,
    status: "idle",
    errorMessage: null,
  };
}

interface NewPhaseOptions {
  name?: string;
  boards?: BoardConfig[];
}

function makePhaseConfig(opts: NewPhaseOptions = {}): PhaseConfig {
  return {
    id: `phase-${nextId++}`,
    name: opts.name ?? "Phase",
    boards: opts.boards ?? [],
  };
}

/**
 * Top-level store for the Compose feature.
 *
 * Owns the editable phase tree (Phase → Board → Bout count), the
 * global competition config (candidate pool, time budget, optional
 * seed), and the orchestration state for generating balanced rolls
 * per board.
 */
export class CompositionStore {
  /** Editable competition name; surfaces on the Library card. */
  name: string = "Untitled competition";

  /**
   * Phase tree. Always non-empty — the constructor seeds one phase
   * with the same default boards a fresh comp shipped with pre-v3.2.
   * UI guards against dropping the last phase.
   */
  phases: PhaseConfig[];

  /**
   * The phase the user is currently editing in the Compose tab.
   * Indexed by `phase.id` so reorder operations don't drift the
   * cursor.
   */
  currentPhaseId: string;

  /**
   * Tracks whether the live document corresponds to a saved Library
   * entry. `null` while editing the working draft (`compose:current`);
   * set to a `compose:saved:{uuid}` id once the user opens / saves a
   * named comp. Drives autosave routing + which "Save" button label
   * the header shows.
   */
  openedLibraryId: string | null = null;

  candidatePool: CandidatePoolId = "standard";
  timeBudget: TimeBudgetPreset = 60;
  seed: string = "";
  /**
   * Resolver mode for this plan. Default `standard` so existing
   * permalinks behave identically; the UI exposes the toggle only when
   * the Æther unlock is active.
   */
  rules: ComposeRules = "standard";
  /** Stratifier spice — see `SPICE_PRESETS`. */
  spice: SpicePresetId = "spicy";
  /** Per-bout P1-vs-P2 variance — see `VARIANCE_PRESETS`. */
  variance: VariancePresetId = DEFAULT_VARIANCE;

  /** Global "running" flag — true while any board is generating. */
  generating = false;
  /** Loading progress for candidate dice chunks (0..1). */
  loadProgress = 1;
  globalError: string | null = null;

  /**
   * Autosave wiring — set up in `attachAutosave()`. Decoupled from the
   * constructor so test/SSR usage can opt out, and so React can clean
   * up the autorun on unmount.
   */
  private autosaveDisposer: IReactionDisposer | null = null;

  /**
   * Set to `true` the first time `ComposeView` (or any other surface)
   * runs the URL → backend hydration sequence on mount. Subsequent
   * mounts skip the auto-hydrate so we don't clobber state that was
   * deliberately set between mounts — most importantly, the Library
   * "Open" button calls `loadFromContentBackend(savedId)` and then
   * navigates to Compose; without this guard, ComposeView's mount
   * effect would immediately re-load the *draft* doc on top of the
   * saved entry, dropping `openedLibraryId` and silently breaking
   * Open.
   */
  hasHydratedFromBackend = false;

  constructor(
    private readonly dataStore: DataStore,
    private readonly content: ContentBackend = defaultContentBackend,
  ) {
    // Seed: one phase, two default boards (random + pattern). Mirrors
    // the pre-v3.2 default exactly so existing first-run UX is
    // unchanged.
    const seedBoards = [
      makeBoardConfig({ kind: "random", rangeMin: 1, rangeMax: 200 }),
      makeBoardConfig({ kind: "pattern", multiples: [6], patternStart: 6 }),
    ];
    const seedPhase = makePhaseConfig({ name: "Phase 1", boards: seedBoards });
    this.phases = [seedPhase];
    this.currentPhaseId = seedPhase.id;

    makeAutoObservable(
      this,
      {
        /* dataStore + content have their own observability stories */
        attachAutosave: false,
        loadFromContentBackend: false,
      },
      { autoBind: true },
    );
    // Seed the cell grid for the default boards so the editor renders
    // sample cells immediately (no Preview button to click).
    for (const board of seedBoards) this.previewBoard(board.id);
  }

  // -------------------------------------------------------------------------
  // ContentBackend autosave
  //
  // Autosave routes to `compose:current` for the working draft and to
  // `compose:saved:{uuid}` once the user opens a Library entry. The
  // autorun re-runs whenever `currentDocId` changes, so flipping
  // `openedLibraryId` automatically retargets the save destination.
  // -------------------------------------------------------------------------

  static readonly DRAFT_DOC_ID = "compose:current";
  static readonly SAVED_DOC_PREFIX = "compose:saved:";
  static readonly DOC_SCHEMA_VERSION = 5;

  /**
   * The doc id this store is currently autosaving to. Working drafts
   * write to `compose:current`; opened Library entries write back to
   * their `compose:saved:{uuid}` id (Word-document semantics).
   */
  get currentDocId(): string {
    return this.openedLibraryId ?? CompositionStore.DRAFT_DOC_ID;
  }

  /**
   * Subscribe to the store and persist a JSON snapshot every time it
   * mutates. Returns a disposer so callers (React effects in
   * `ComposeView`) can detach on unmount.
   *
   * The autorun reads `currentDocId` so that opening a Library entry
   * (which mutates `openedLibraryId`) automatically retargets future
   * writes — no resubscribe required.
   */
  attachAutosave(): () => void {
    if (this.autosaveDisposer !== null) return () => this.autosaveDisposer?.();
    this.autosaveDisposer = autorun(() => {
      const id = this.currentDocId;
      const doc: ContentDoc<SharedPlanV5> = {
        id,
        body: this.snapshot(),
        updatedAt: new Date().toISOString(),
        schemaVersion: CompositionStore.DOC_SCHEMA_VERSION,
      };
      // Fire and forget — backend errors are non-fatal (we log so a
      // future toast surface can pick them up without re-wiring).
      void this.content.save(doc).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[CompositionStore] autosave failed:", err);
      });
    });
    return () => {
      this.autosaveDisposer?.();
      this.autosaveDisposer = null;
    };
  }

  /**
   * Hydrate from the configured backend. Returns `true` when a doc
   * was loaded. Called once on mount; the URL hash takes precedence
   * for share-link rehydration so this only runs when the hash is
   * empty or invalid.
   */
  async loadFromContentBackend(
    id: string = CompositionStore.DRAFT_DOC_ID,
  ): Promise<boolean> {
    try {
      const doc = await this.content.load<AnySharedPlan>(id);
      // Mark hydration attempted regardless of whether we found a
      // doc — a fresh user with empty storage shouldn't trigger a
      // re-hydrate on every Compose remount either.
      runInAction(() => {
        this.hasHydratedFromBackend = true;
      });
      if (doc === null) return false;
      runInAction(() => {
        this.applySnapshot(doc.body);
        if (id.startsWith(CompositionStore.SAVED_DOC_PREFIX)) {
          this.openedLibraryId = id;
        } else {
          this.openedLibraryId = null;
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Phase CRUD
  // -------------------------------------------------------------------------

  /** The phase the user is currently editing. Always defined (phases is non-empty). */
  get currentPhase(): PhaseConfig {
    return (
      this.phases.find((p) => p.id === this.currentPhaseId) ??
      this.phases[0]!
    );
  }

  /**
   * Boards in the currently-active phase. Back-compat with code paths
   * that pre-date the phase reframe (per-board editor cards, board
   * actions on the current tab, the existing test suite). Use
   * `allBoards` when you need every board across every phase
   * (Generate, Export).
   */
  get boards(): BoardConfig[] {
    return this.currentPhase.boards;
  }

  /**
   * Flat enumeration of every board in the competition, tagged with
   * its phase so callers can render phase-aware labels (PDF export,
   * MatchStore, the print stats sheet).
   */
  get allBoards(): readonly { phase: PhaseConfig; board: BoardConfig; phaseIndex: number; boardIndex: number }[] {
    const out: { phase: PhaseConfig; board: BoardConfig; phaseIndex: number; boardIndex: number }[] = [];
    this.phases.forEach((phase, phaseIndex) => {
      phase.boards.forEach((board, boardIndex) => {
        out.push({ phase, board, phaseIndex, boardIndex });
      });
    });
    return out;
  }

  /** Total bouts across every board in every phase. Display helper. */
  get totalBouts(): number {
    return this.allBoards.reduce((sum, b) => sum + b.board.bouts, 0);
  }

  /** Returns true once every board has a generated result. */
  get isFullyGenerated(): boolean {
    if (this.allBoards.length === 0) return false;
    return this.allBoards.every(({ board }) => board.result !== null);
  }

  setCurrentPhase(id: string): void {
    if (this.phases.some((p) => p.id === id)) {
      this.currentPhaseId = id;
    }
  }

  addPhase(name?: string): string {
    const phase = makePhaseConfig({
      name: name ?? `Phase ${this.phases.length + 1}`,
      boards: [],
    });
    this.phases.push(phase);
    this.currentPhaseId = phase.id;
    return phase.id;
  }

  removePhase(id: string): void {
    if (this.phases.length <= 1) return; // Always keep at least one.
    const wasCurrent = this.currentPhaseId === id;
    const removedIndex = this.phases.findIndex((p) => p.id === id);
    this.phases = this.phases.filter((p) => p.id !== id);
    if (wasCurrent) {
      // Land the cursor on the neighbour to the left when possible,
      // else the (new) first phase. Mirrors how editor tabs feel
      // when you close one in the middle.
      const next = this.phases[Math.max(0, removedIndex - 1)] ?? this.phases[0]!;
      this.currentPhaseId = next.id;
    }
  }

  renamePhase(id: string, name: string): void {
    const phase = this.phases.find((p) => p.id === id);
    if (phase === undefined) return;
    phase.name = name.trim() === "" ? phase.name : name;
  }

  /** Move phase `id` to absolute index `targetIndex`. Clamped. */
  reorderPhase(id: string, targetIndex: number): void {
    const fromIndex = this.phases.findIndex((p) => p.id === id);
    if (fromIndex === -1) return;
    const clamped = Math.max(0, Math.min(this.phases.length - 1, targetIndex));
    if (clamped === fromIndex) return;
    const next = [...this.phases];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(clamped, 0, moved!);
    this.phases = next;
  }

  duplicatePhase(id: string): string | null {
    const source = this.phases.find((p) => p.id === id);
    if (source === undefined) return null;
    const copy = makePhaseConfig({
      name: `${source.name} (copy)`,
      boards: source.boards.map((b) => cloneBoardConfig(b)),
    });
    const idx = this.phases.findIndex((p) => p.id === id);
    this.phases.splice(idx + 1, 0, copy);
    this.currentPhaseId = copy.id;
    for (const board of copy.boards) this.previewBoard(board.id);
    return copy.id;
  }

  // -------------------------------------------------------------------------
  // Board CRUD (scoped to the current phase)
  // -------------------------------------------------------------------------

  addBoard(opts: NewBoardOptions = {}): void {
    const board = makeBoardConfig(opts);
    this.currentPhase.boards.push(board);
    // Cells are visible by default — no Preview button to click — so
    // generate the initial sample inline.
    this.previewBoard(board.id);
  }

  removeBoard(id: string): void {
    for (const phase of this.phases) {
      phase.boards = phase.boards.filter((b) => b.id !== id);
    }
  }

  updateBoard(id: string, patch: Partial<Omit<BoardConfig, "id" | "overrides">>): void {
    const board = this.findBoard(id);
    if (board === null) return;
    Object.assign(board, patch);
    // Editing parameters invalidates any prior result; refresh the
    // preview cells immediately so the grid stays in sync with inputs.
    board.result = null;
    board.status = "idle";
    board.errorMessage = null;
    this.previewBoard(board.id);
  }

  setOverride(id: string, slot: number, value: number | null): void {
    const board = this.findBoard(id);
    if (board === null) return;
    if (value === null || Number.isNaN(value)) {
      board.overrides.delete(slot);
    } else {
      board.overrides.set(slot, value);
    }
    board.result = null;
    board.status = "idle";
    board.errorMessage = null;
    this.previewBoard(board.id);
  }

  /** Lookup a board by id across every phase. */
  private findBoard(id: string): BoardConfig | null {
    for (const phase of this.phases) {
      const found = phase.boards.find((b) => b.id === id);
      if (found !== undefined) return found;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Global config
  // -------------------------------------------------------------------------

  setName(name: string): void {
    const trimmed = name.trim();
    if (trimmed === "") return;
    this.name = trimmed;
  }

  setPool(pool: CandidatePoolId): void {
    this.candidatePool = pool;
  }

  setTimeBudget(value: TimeBudgetPreset): void {
    this.timeBudget = value;
  }

  setSpice(value: SpicePresetId): void {
    this.spice = value;
  }

  setVariance(value: VariancePresetId): void {
    this.variance = value;
  }

  /**
   * Active cell-value bounds for the random-board editor and any
   * downstream clamping. Driven by `rules` so toggling into Æther
   * unlocks the wider 1..4999 target band and toggling back to
   * Standard re-snaps to 1..999.
   */
  get cellBounds(): Readonly<{ min: number; max: number }> {
    return RULES_CELL_BOUNDS[this.rules];
  }

  /**
   * Switch resolver mode. When the user flips into Æther we proactively
   * swap the candidate pool to the Æther sample (and back to Standard
   * on the way out) — otherwise the previously selected pool would be
   * either invalid (`aetherSample` under standard rules) or strictly
   * worse than what's available (the depowered standard pool under
   * Æther rules wastes the wider tuple range).
   *
   * Already-generated boards get reset because their results were
   * computed against the old matrix and would mislead the user.
   */
  setRules(rules: ComposeRules): void {
    if (this.rules === rules) return;
    this.rules = rules;
    if (rules === "aether") {
      const aetherIds = AETHER_CANDIDATE_POOLS.map((p) => p.id);
      if (!aetherIds.includes(this.candidatePool)) {
        this.candidatePool = AETHER_DEFAULT_POOL;
      }
    } else {
      const standardIds = CANDIDATE_POOLS.map((p) => p.id);
      if (!standardIds.includes(this.candidatePool)) {
        this.candidatePool = STANDARD_DEFAULT_POOL;
      }
    }
    // Clamp every board's random-mode range and any per-cell pins into
    // the new mode's cell window. Without this the editor would render
    // a Min/Max input pair whose value sat outside the input's `max`
    // attribute (legal but confusing) and the resolver would be asked
    // for targets outside the matrix's coverage.
    const bounds = RULES_CELL_BOUNDS[rules];
    for (const { board } of this.allBoards) {
      board.rangeMin = clampToRange(board.rangeMin, bounds);
      board.rangeMax = clampToRange(board.rangeMax, bounds);
      if (board.rangeMax < board.rangeMin) board.rangeMax = board.rangeMin;
      for (const [slot, value] of board.overrides) {
        const clamped = clampToRange(value, bounds);
        if (clamped !== value) board.overrides.set(slot, clamped);
      }
      board.result = null;
      board.status = "idle";
      board.errorMessage = null;
      this.previewBoard(board.id);
    }
  }

  // -------------------------------------------------------------------------
  // Preview a single board (no competition generation)
  // -------------------------------------------------------------------------

  previewBoard(id: string): void {
    const board = this.findBoard(id);
    if (board === null) return;
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
  // Run the competition generator for every board in every phase
  // -------------------------------------------------------------------------

  async generateAll(): Promise<void> {
    if (this.generating) return;
    runInAction(() => {
      this.generating = true;
      this.globalError = null;
      this.loadProgress = 0;
      // Roll a fresh seed on every Generate press. The seed is an
      // internal implementation detail (it lets all boards in this
      // run share a deterministic RNG stream) and is never surfaced
      // to the user — share links embed the resolved board cells
      // and rolls verbatim, so reproducibility doesn't depend on it.
      this.seed = randomSeed();
      for (const { board } of this.allBoards) {
        board.status = "idle";
        board.errorMessage = null;
        board.result = null;
      }
    });

    try {
      const candidates = getCandidatePool(this.candidatePool);
      const mode: ResolverModeId = this.rules;
      // Phase 1 — load the difficulty matrix for the selected rules.
      // Standard hits a small, already-cached matrix on the global
      // DataStore; Æther fetches `aether-arity3.n2k` (~31 MB) once and
      // memoizes so subsequent generations skip the wait.
      const matrix = await loadDifficultyMatrixFor(mode, this.dataStore, {
        onProgress: (loaded, total) => {
          runInAction(() => {
            this.loadProgress = total === 0 ? 1 : loaded / total;
          });
        },
      });

      const resolver = makeMatrixResolver(matrix, mode);

      // Phase 2 — generate per board across every phase. Boards are
      // independent (balance is per-board only) so order and isolation
      // don't matter; we just walk the flat list.
      for (const { board } of this.allBoards) {
        runInAction(() => {
          board.status = "running";
        });
        try {
          const spec = toBoardSpec(board);
          const cells = generateBoard(spec, this.makeRng(board.id, "board"));
          const result = generateBalancedRolls(
            cells,
            candidates,
            board.bouts,
            resolver,
            {
              scoreOptions: { timeBudget: this.timeBudget },
              rng: this.makeRng(board.id, "rolls"),
              spice: spiceValueFor(this.spice),
              variance: this.variance as RoundVariance,
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
  // Library hooks (Save / Save-as / new draft)
  // -------------------------------------------------------------------------

  /**
   * Untag the current Library binding without clearing the in-memory
   * plan. Future autosaves resume writing to `compose:current`. Called
   * from `Save as new` *after* the new entry has been written to its
   * own id.
   */
  detachFromLibrary(): void {
    this.openedLibraryId = null;
  }

  /**
   * Bind the current plan to a saved Library entry. Future autosaves
   * write to that id (Word-document semantics). The caller is
   * responsible for having already created the doc on disk.
   */
  attachToLibrary(savedDocId: string): void {
    this.openedLibraryId = savedDocId;
  }

  /**
   * Reset the in-memory plan to the same defaults the constructor
   * seeds. Called from "New competition" in the Library tab. Drops
   * the `openedLibraryId` so the next autosave lands on
   * `compose:current`.
   */
  resetToDefault(): void {
    const seedBoards = [
      makeBoardConfig({ kind: "random", rangeMin: 1, rangeMax: 200 }),
      makeBoardConfig({ kind: "pattern", multiples: [6], patternStart: 6 }),
    ];
    const seedPhase = makePhaseConfig({ name: "Phase 1", boards: seedBoards });
    runInAction(() => {
      this.name = "Untitled competition";
      this.phases = [seedPhase];
      this.currentPhaseId = seedPhase.id;
      this.openedLibraryId = null;
      this.candidatePool = "standard";
      this.timeBudget = 60;
      this.seed = "";
      this.rules = "standard";
      this.spice = "spicy";
      this.variance = DEFAULT_VARIANCE;
      this.globalError = null;
    });
    for (const board of seedBoards) this.previewBoard(board.id);
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
   * v5 (current): adds the phase tree and a top-level competition
   *   `name`. v1..v4 boards lived as a flat top-level array; v5 wraps
   *   them in a single-phase migration on decode.
   * v4: added the per-bout `variance` knob.
   * v3: added the resolver `rules` toggle and the stratifier `spice`.
   * v2: embedded each board's generated `preview` and `result`.
   * v1: configs only.
   */
  snapshot(): SharedPlanV5 {
    return {
      version: 5,
      name: this.name,
      pool: this.candidatePool,
      timeBudget: this.timeBudget,
      seed: this.seed,
      rules: this.rules,
      spice: spiceValueFor(this.spice),
      variance: this.variance,
      phases: this.phases.map((phase) => ({
        name: phase.name,
        boards: phase.boards.map((b) => boardToSharedV5(b)),
      })),
    };
  }

  /**
   * Replace the in-memory plan with a decoded snapshot.
   *
   * Accepts every envelope version (v1..v5). v2+ boards with embedded
   * results are restored straight to `status: "ready"` so
   * `CompetitionResults` renders immediately — no Generate click
   * required.
   *
   * Older envelopes (v1..v4) lacked the phase tree; they are migrated
   * into a single phase named "Phase 1" containing every board.
   */
  applySnapshot(plan: AnySharedPlan): void {
    if (
      plan.version !== 1 &&
      plan.version !== 2 &&
      plan.version !== 3 &&
      plan.version !== 4 &&
      plan.version !== 5
    ) {
      return;
    }
    this.candidatePool = plan.pool;
    this.timeBudget = plan.timeBudget;
    this.seed = plan.seed;
    // v3 added the `rules` toggle and the `spice` knob; older
    // permalinks pre-date both, so they default to the v3.1 shipped
    // behavior (standard rules, full stratification).
    this.rules =
      plan.version === 3 || plan.version === 4 || plan.version === 5
        ? plan.rules
        : "standard";
    this.spice =
      plan.version === 3 || plan.version === 4
        ? spiceIdFor(plan.spice)
        : plan.version === 5
        ? spiceIdFor(plan.spice)
        : "spicy";
    this.variance =
      (plan.version === 4 || plan.version === 5) && isVariancePresetId(plan.variance)
        ? plan.variance
        : DEFAULT_VARIANCE;
    this.name =
      plan.version === 5 && plan.name.trim() !== ""
        ? plan.name
        : "Untitled competition";

    // Build the phase tree. v5 has it natively; older envelopes get a
    // single "Phase 1" wrapper around their flat board list.
    const inputPhases =
      plan.version === 5
        ? plan.phases
        : [{ name: "Phase 1", boards: plan.boards.map((b) => sharedBoardFromLegacy(b)) }];

    const phases: PhaseConfig[] = inputPhases.map((p, phaseIndex) => {
      const phase = makePhaseConfig({
        name: p.name?.trim() === "" || p.name === undefined ? `Phase ${phaseIndex + 1}` : p.name,
        boards: p.boards.map((b) => makeBoardConfig({
          kind: b.kind,
          rangeMin: b.rangeMin,
          rangeMax: b.rangeMax,
          multiples: b.multiples,
          patternStart: b.patternStart,
          bouts: b.bouts,
        })),
      });
      // Apply overrides + restore previews/results for each board.
      p.boards.forEach((sb, boardIndex) => {
        const board = phase.boards[boardIndex];
        if (board === undefined) return;
        for (const [slot, value] of sb.overrides) {
          board.overrides.set(slot, value);
        }
        if (sb.preview !== undefined) board.preview = [...sb.preview];
        if (sb.result !== undefined) {
          board.result = cloneResult(sb.result);
          board.status = "ready";
        }
      });
      return phase;
    });

    this.phases = phases.length > 0 ? phases : [makePhaseConfig({ name: "Phase 1", boards: [] })];
    this.currentPhaseId = this.phases[0]!.id;

    // Backfill the preview for any restored board that doesn't carry
    // one (v1 plans, or autosaves taken before generation).
    for (const { board } of this.allBoards) {
      if (board.preview === null) this.previewBoard(board.id);
    }
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
    const decoded = await decodeShareable<AnySharedPlan>(raw);
    if (decoded === null) return false;
    runInAction(() => {
      this.applySnapshot(decoded);
      this.hasHydratedFromBackend = true;
    });
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

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

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

/** Deep-copy a `BoardConfig`, fresh ids included (used by duplicatePhase). */
function cloneBoardConfig(source: BoardConfig): BoardConfig {
  const copy = makeBoardConfig({
    kind: source.kind,
    rangeMin: source.rangeMin,
    rangeMax: source.rangeMax,
    multiples: [...source.multiples],
    patternStart: source.patternStart,
    bouts: source.bouts,
  });
  for (const [slot, value] of source.overrides) {
    copy.overrides.set(slot, value);
  }
  if (source.preview !== null) copy.preview = [...source.preview];
  if (source.result !== null) copy.result = cloneResult(source.result);
  copy.status = source.status;
  copy.errorMessage = source.errorMessage;
  return copy;
}

/**
 * Fresh 32-bit seed encoded as 8 lowercase hex characters. Short
 * enough to fit comfortably in the seed input and easy to read aloud
 * over a call (versus a long opaque base64 token).
 */
function randomSeed(): string {
  const n = Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
  return n.toString(16).padStart(8, "0");
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
 * v3: same envelope as v2 plus the resolver `rules` toggle. Older
 * (v1, v2) permalinks pre-date the Compose Æther toggle and decode as
 * `rules: "standard"` for back-compat.
 */
export interface SharedPlanV3 {
  version: 3;
  pool: CandidatePoolId;
  timeBudget: TimeBudgetPreset;
  seed: string;
  rules: ComposeRules;
  /** Numeric spice value (0..1). UI snaps to the nearest preset on load. */
  spice: number;
  boards: SharedBoardV2[];
}

/**
 * v4: same envelope as v3 plus the per-bout `variance` knob. Older
 * permalinks decode as the v4 default (`"balanced"`).
 */
export interface SharedPlanV4 {
  version: 4;
  pool: CandidatePoolId;
  timeBudget: TimeBudgetPreset;
  seed: string;
  rules: ComposeRules;
  spice: number;
  variance: VariancePresetId;
  boards: SharedBoardV2[];
}

/**
 * v5: introduces the phase tree and a top-level competition `name`.
 * The legacy `boards` array is replaced by `phases[].boards[]`. The
 * per-board count field is renamed `rounds → bouts` to match the v3.2
 * vocabulary (Competition > Phase > Board > Bout).
 *
 * `BalancedRollsResult` is unchanged at the schema layer — its
 * `rounds[]` array still names bouts internally because the solver
 * pre-dates the rename. Future cleanup may sync those names.
 */
export interface SharedBoardV5 {
  kind: "random" | "pattern";
  rangeMin: number;
  rangeMax: number;
  multiples: number[];
  patternStart: number;
  bouts: number;
  overrides: Array<[number, number]>;
  preview?: number[];
  result?: BalancedRollsResult;
}

export interface SharedPhaseV5 {
  name: string;
  boards: SharedBoardV5[];
}

export interface SharedPlanV5 {
  version: 5;
  name: string;
  pool: CandidatePoolId;
  timeBudget: TimeBudgetPreset;
  seed: string;
  rules: ComposeRules;
  spice: number;
  variance: VariancePresetId;
  phases: SharedPhaseV5[];
}

/** Discriminated union for any envelope version we still decode. */
export type AnySharedPlan =
  | SharedPlanV1
  | SharedPlanV2
  | SharedPlanV3
  | SharedPlanV4
  | SharedPlanV5;

// ---------------------------------------------------------------------------
//  Snapshot helpers
// ---------------------------------------------------------------------------

function boardToSharedV5(b: BoardConfig): SharedBoardV5 {
  const out: SharedBoardV5 = {
    kind: b.kind,
    rangeMin: b.rangeMin,
    rangeMax: b.rangeMax,
    multiples: [...b.multiples],
    patternStart: b.patternStart,
    bouts: b.bouts,
    overrides: [...b.overrides.entries()].map(([slot, value]) => [slot, value]),
  };
  if (b.preview !== null) out.preview = [...b.preview];
  if (b.result !== null) out.result = cloneResult(b.result);
  return out;
}

/**
 * Project a legacy v1..v4 board entry onto the v5 board shape used by
 * `applySnapshot`. The only structural difference is the
 * `rounds → bouts` rename; everything else is byte-identical.
 */
function sharedBoardFromLegacy(b: SharedBoardV2 | SharedPlanV1["boards"][number]): SharedBoardV5 {
  const out: SharedBoardV5 = {
    kind: b.kind,
    rangeMin: b.rangeMin,
    rangeMax: b.rangeMax,
    multiples: [...b.multiples],
    patternStart: b.patternStart,
    bouts: b.rounds,
    overrides: b.overrides.map(([slot, value]) => [slot, value] as [number, number]),
  };
  const v2 = b as SharedBoardV2;
  if (v2.preview !== undefined) out.preview = [...v2.preview];
  if (v2.result !== undefined) out.result = cloneResult(v2.result);
  return out;
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
