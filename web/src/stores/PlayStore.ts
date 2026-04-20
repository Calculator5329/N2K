/**
 * `PlayStore` — drives the classic N2K **knockout race**.
 *
 * Rules (faithful to the original tabletop game and the JS reference
 * implementation in `N2K-Game/index.js`):
 *
 *   - Two side-by-side 6×6 boards (the player's on the left, the bot's
 *     on the right). Both boards show the same numbers — the standard
 *     classic board is `1..36`, but a future option could roll random
 *     boards too.
 *   - Three shared dice (default range 2..20, no 1s — matches
 *     `enable1s = false` in the original).
 *   - A 60-second timer counts down at 100 ms granularity.
 *   - On their own board, each side knocks off cells they can reach
 *     with the dice; the player knocks by clicking, the bot knocks
 *     automatically on a difficulty-paced schedule.
 *   - Score = sum of cells knocked off. If a side clears the entire
 *     board before time runs out, their score is extrapolated to the
 *     full minute (`maxScore * 60 / timeUsed`) — exactly the original
 *     bonus formula. Whoever has the higher score when the buzzer
 *     sounds wins.
 *
 * The view layer is pure presentation — it observes the store and
 * dispatches `knockCell` / `start` / `restart`. Everything timing-
 * related lives here.
 */
import {
  action,
  computed,
  makeObservable,
  observable,
  runInAction,
} from "mobx";
import { STANDARD_MODE, AETHER_MODE } from "@platform/core/constants.js";
import {
  KnockoutBot,
  type BotClaim,
  type BotDifficulty,
} from "@platform/games/knockoutBot.js";
import { easiestSolution } from "@platform/services/solver.js";
import type { Mode, NEquation } from "@platform/core/types.js";

/**
 * The two playable rule sets for a knockout race. `"standard"` is the
 * v1 game (dice 2..20, target 1..999, plain operators); `"aether"`
 * widens dice and target ranges and unlocks negative bases / huge
 * exponents — see `AETHER_MODE` in `@platform/core/constants`.
 *
 * Setting `aetherRules` is a per-match toggle, not a global mode swap.
 * Æther unlock (Konami) gates whether the toggle is *visible* in the
 * Play setup; once gated in, each race independently picks rules.
 */
export type RaceRules = "standard" | "aether";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export type RaceStatus = "setup" | "racing" | "paused" | "finished";

export interface KnockoutSetup {
  readonly difficulty: BotDifficulty;
  /** Bot's display name in the scoreboard. */
  readonly botName: string;
  /**
   * Active rule set for the next race. Stays `"standard"` until the
   * user explicitly opts into Æther via the setup toggle (which is
   * itself only visible after Konami unlock).
   */
  readonly rules: RaceRules;
}

/**
 * Optional injection knobs used by `MatchStore` to drive the race
 * with a competition's predetermined board + dice instead of a fresh
 * roll. When omitted the store rolls dice + uses the standard
 * pattern board (the Quick Race fallback).
 */
export interface RaceOverrides {
  /** 36-cell board to race on (defaults to PATTERN_BOARD). */
  board?: readonly number[];
  /** Dice the player races with (defaults to a fresh roll). */
  playerDice?: readonly number[];
  /** Dice the bot races with (defaults to `playerDice`). */
  botDice?: readonly number[];
  /** Callback fired exactly once when the race finishes. */
  onFinished?: (summary: BoutSummary) => void;
  /** Whether to ring the end-of-race chime (off for chained bouts). */
  silent?: boolean;
  /**
   * Race length in milliseconds. Defaults to {@link DEFAULT_RACE_DURATION_MS}
   * (60s) for Quick Race and unspecified callers; MatchStore overrides
   * this with the comp's `timeBudget * 1000` so a 30-second comp
   * actually plays in 30 seconds (the score formula
   * `scoreFor(knocked, maxScore, raceDurationMs)` also rebases on
   * this value, so ratings stay comparable across budgets).
   */
  raceDurationMs?: number;
}

/** Lightweight summary handed to `onFinished` so MatchStore can record stats. */
export interface BoutSummary {
  readonly playerScore: number;
  readonly botScore: number;
  readonly playerCellsKnocked: number;
  readonly botCellsKnocked: number;
  readonly maxCells: number;
  readonly elapsedMs: number;
  readonly winner: "player" | "bot" | "tie";
}

/** A single knocked cell with the equation that justified it. */
export interface KnockedCell {
  readonly cellIndex: number;
  readonly cellValue: number;
  /** `null` for the human side until they hover the equation hint. */
  readonly equation: NEquation | null;
  readonly atMs: number;
}

// ---------------------------------------------------------------------------
//  Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SETUP: KnockoutSetup = {
  difficulty: "standard",
  botName: "Euler",
  rules: "standard",
};

/**
 * Bot personas, named for mathematicians whose flavour roughly tracks
 * each tier. Pascal eases you in; Ramanujan is the cliff. Picked
 * single-word names so they fit the scoreboard.
 */
const BOT_NAME_BY_DIFFICULTY: Readonly<Record<BotDifficulty, string>> = {
  easy: "Pascal",
  standard: "Euler",
  hard: "Cantor",
  expert: "Hypatia",
  master: "Ramanujan",
};

/**
 * The default board: a pattern board with multiplier 8 — the classic
 * "table of eights" board (8, 16, 24, …, 288). Lifted from the
 * original N2K-Game pattern formula `(i+1) * counter`, with counter=8
 * being the hardest 36-cell pattern that still fits in three-die
 * range. The trivial 1..36 board makes the race a clicking contest;
 * ×8 forces real equation-finding.
 */
const PATTERN_BOARD: readonly number[] = Array.from(
  { length: 36 },
  (_, i) => (i + 1) * 8,
);

/**
 * Default race length in ms. Quick Race uses this verbatim; matches
 * launched from a saved comp override it via
 * `RaceOverrides.raceDurationMs` based on the plan's `timeBudget`
 * (30 / 60 / 120 seconds). The default stays 60s so any caller that
 * doesn't specify keeps the original Quick Race feel.
 */
export const DEFAULT_RACE_DURATION_MS = 60_000;
const TICK_MS = 100;

// ---------------------------------------------------------------------------
//  Store
// ---------------------------------------------------------------------------

export class PlayStore {
  setup: KnockoutSetup = DEFAULT_SETUP;
  status: RaceStatus = "setup";

  /**
   * Player-side dice (arity 3). In a Quick Race the bot races with
   * the same dice; in a Match bout the bot has its own (`botDice`).
   * Kept as `dice` for back-compat with the existing UI bindings.
   */
  dice: readonly number[] = [];

  /**
   * Bot-side dice. Always equal to `dice` in a Quick Race; only
   * diverges in a Match bout where the competition's `p1Dice` and
   * `p2Dice` differ.
   */
  botDice: readonly number[] = [];

  /** Current board cells, row-major (length 36). */
  boardCells: readonly number[] = PATTERN_BOARD;

  /**
   * Optional onFinished hook supplied by `MatchStore`. Fired exactly
   * once when a race transitions to `finished`. Cleared on every
   * `restart()` so a Quick Race after a Match doesn't accidentally
   * notify the dead match.
   */
  private onFinished: ((summary: BoutSummary) => void) | null = null;
  private silentFinish = false;
  /** Wall-clock ms accumulated while the race was paused. */
  private pausedAccumMs = 0;
  /** Wall-clock ms when the most recent pause began. */
  private pausedAt = 0;

  /**
   * Mode used to solve — derived from `setup.rules`. Standard rules
   * map to `STANDARD_MODE`; Æther rules to `AETHER_MODE`. Computed
   * lazily because `setup` is observable and may change between
   * matches.
   */
  get mode(): Mode {
    return this.setup.rules === "aether" ? AETHER_MODE : STANDARD_MODE;
  }

  /** Cell indices the player has knocked. */
  playerKnocked: readonly KnockedCell[] = [];

  /** Cell indices the bot has knocked. */
  botKnocked: readonly KnockedCell[] = [];

  /** Milliseconds elapsed since `start()`. Drives the countdown. */
  elapsedMs = 0;

  /**
   * Race length for the current bout (set at `start()`-time). Defaults
   * to {@link DEFAULT_RACE_DURATION_MS} for Quick Race; matches launched
   * with a comp's `timeBudget` override this. Score formulas read it
   * via `this.raceDurationMs` so a 30s race rebases extrapolation
   * against 30s instead of 60s — otherwise a user who knocks the
   * whole board in 30s would be credited with `maxScore * 60 / 30`,
   * doubling their score against the matrix's prediction.
   */
  raceDurationMs: number = DEFAULT_RACE_DURATION_MS;

  /** Number of reachable cells the bot pre-computed (for transparency). */
  botReachableCount = 0;

  // -------------------------------------------------------------------
  //  Replay (post-race scrubber, see #C in v3.1+ next-features)
  // -------------------------------------------------------------------
  //
  // When `replayMs === null` the results screen shows the live/final
  // state (default behavior, what every existing call site assumed).
  // When the user enters Replay, `replayMs` becomes a number in
  // `[0, RACE_DURATION_MS]` and `currentPlayerKnocked` /
  // `currentBotKnocked` filter `playerKnocked` / `botKnocked` to only
  // include events `atMs <= replayMs`. The race itself is not
  // mutated — Replay is a derived view.
  //
  // `replayPlaying` toggles a wall-clock timer that advances
  // `replayMs` at real-time (1× speed for now; future work could add
  // playback-rate controls). Ticking stops automatically at the end of
  // the race.

  replayMs: number | null = null;
  replayPlaying = false;
  private replayTimerId: ReturnType<typeof setInterval> | null = null;

  /**
   * The set of cells the player has hinted-out — when they click the
   * "show equation" button on a knocked cell, this map fills in. We
   * compute the equation lazily because solving on every click would
   * stall the UI for hard cells.
   */
  private playerHints = new Map<number, NEquation | null>();

  private bot: KnockoutBot | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;

  constructor() {
    makeObservable<this, "playerHints">(this, {
      setup: observable,
      status: observable,
      dice: observable.ref,
      botDice: observable.ref,
      boardCells: observable.ref,
      playerKnocked: observable.ref,
      botKnocked: observable.ref,
      elapsedMs: observable,
      botReachableCount: observable,
      playerHints: observable.ref,
      replayMs: observable,
      replayPlaying: observable,
      mode: computed,
      remainingMs: computed,
      playerScore: computed,
      botScore: computed,
      maxScore: computed,
      playerKnockedSet: computed,
      botKnockedSet: computed,
      isRacing: computed,
      isPaused: computed,
      isFinished: computed,
      hasSplitDice: computed,
      winner: computed,
      currentPlayerKnocked: computed,
      currentBotKnocked: computed,
      replayActive: computed,
      replayTimeline: computed,
      setSetup: action,
      start: action,
      knockCell: action,
      restart: action,
      pause: action,
      resume: action,
      revealHint: action,
      enterReplay: action,
      exitReplay: action,
      setReplayMs: action,
      togglePlayReplay: action,
      stepReplay: action,
    });
  }

  // ---------------------------------------------------------------------
  //  Computed
  // ---------------------------------------------------------------------

  get remainingMs(): number {
    return Math.max(0, this.raceDurationMs - this.elapsedMs);
  }

  get maxScore(): number {
    return this.boardCells.reduce((s, v) => s + v, 0);
  }

  get playerKnockedSet(): ReadonlySet<number> {
    return new Set(this.playerKnocked.map((c) => c.cellIndex));
  }

  get botKnockedSet(): ReadonlySet<number> {
    return new Set(this.botKnocked.map((c) => c.cellIndex));
  }

  get playerScore(): number {
    return scoreFor(this.playerKnocked, this.maxScore, this.raceDurationMs);
  }

  get botScore(): number {
    return scoreFor(this.botKnocked, this.maxScore, this.raceDurationMs);
  }

  get isRacing(): boolean {
    return this.status === "racing";
  }

  get isPaused(): boolean {
    return this.status === "paused";
  }

  get isFinished(): boolean {
    return this.status === "finished";
  }

  /** True iff player and bot dice differ (Match-bout shape, not Quick Race). */
  get hasSplitDice(): boolean {
    if (this.dice.length !== this.botDice.length) return true;
    for (let i = 0; i < this.dice.length; i += 1) {
      if (this.dice[i] !== this.botDice[i]) return true;
    }
    return false;
  }

  /** `"player" | "bot" | "tie"` once the race ends; `null` while racing. */
  get winner(): "player" | "bot" | "tie" | null {
    if (!this.isFinished) return null;
    if (this.playerScore > this.botScore) return "player";
    if (this.botScore > this.playerScore) return "bot";
    return "tie";
  }

  // ---------------------------------------------------------------------
  //  Replay-aware accessors
  // ---------------------------------------------------------------------

  get replayActive(): boolean {
    return this.replayMs !== null;
  }

  /**
   * Knocks visible at the current view time. Falls back to the full
   * race log when the user isn't scrubbing, so the existing results
   * board renders identically when Replay is closed.
   */
  get currentPlayerKnocked(): readonly KnockedCell[] {
    if (this.replayMs === null) return this.playerKnocked;
    const cutoff = this.replayMs;
    return this.playerKnocked.filter((c) => c.atMs <= cutoff);
  }

  get currentBotKnocked(): readonly KnockedCell[] {
    if (this.replayMs === null) return this.botKnocked;
    const cutoff = this.replayMs;
    return this.botKnocked.filter((c) => c.atMs <= cutoff);
  }

  /**
   * Merged, ascending-by-time event log used by the scrubber to step
   * one knock at a time (←/→). `side` differentiates the two players
   * for tooltips.
   */
  get replayTimeline(): readonly { atMs: number; side: "player" | "bot" }[] {
    const events: { atMs: number; side: "player" | "bot" }[] = [];
    for (const c of this.playerKnocked) events.push({ atMs: c.atMs, side: "player" });
    for (const c of this.botKnocked) events.push({ atMs: c.atMs, side: "bot" });
    events.sort((a, b) => a.atMs - b.atMs);
    return events;
  }

  // ---------------------------------------------------------------------
  //  Setup
  // ---------------------------------------------------------------------

  setSetup(patch: Partial<KnockoutSetup>): void {
    this.setup = { ...this.setup, ...patch };
    if (patch.difficulty !== undefined) {
      this.setup = {
        ...this.setup,
        botName: BOT_NAME_BY_DIFFICULTY[patch.difficulty],
      };
    }
  }

  // ---------------------------------------------------------------------
  //  Race lifecycle
  // ---------------------------------------------------------------------

  start(overrides: RaceOverrides = {}): void {
    const playerDice = overrides.playerDice ?? rollDice(this.mode);
    const botDice = overrides.botDice ?? playerDice;
    this.dice = playerDice;
    this.botDice = botDice;
    this.boardCells = overrides.board ?? PATTERN_BOARD;
    this.playerKnocked = [];
    this.botKnocked = [];
    this.playerHints = new Map();
    this.elapsedMs = 0;
    this.pausedAccumMs = 0;
    this.pausedAt = 0;
    this.onFinished = overrides.onFinished ?? null;
    this.silentFinish = overrides.silent === true;
    // Race length is per-bout: Quick Race always uses the default 60s;
    // matches launched from a saved comp pass the comp's `timeBudget`
    // (30 / 60 / 120s) here so the countdown — and the score formula
    // that extrapolates `maxScore * raceDurationMs / lastClickMs` —
    // both rebase against the user's chosen budget.
    this.raceDurationMs =
      overrides.raceDurationMs !== undefined && overrides.raceDurationMs > 0
        ? overrides.raceDurationMs
        : DEFAULT_RACE_DURATION_MS;
    this.bot = new KnockoutBot({
      dice: this.botDice,
      mode: this.mode,
      boardCells: this.boardCells,
      difficulty: this.setup.difficulty,
    });
    this.botReachableCount = this.bot.prepare();
    this.status = "racing";
    this.startedAt = Date.now();
    this.startTimer();
  }

  restart(): void {
    this.stopTimer();
    this.stopReplayTimer();
    this.status = "setup";
    this.dice = [];
    this.botDice = [];
    this.boardCells = PATTERN_BOARD;
    this.playerKnocked = [];
    this.botKnocked = [];
    this.playerHints = new Map();
    this.elapsedMs = 0;
    this.raceDurationMs = DEFAULT_RACE_DURATION_MS;
    this.bot = null;
    this.botReachableCount = 0;
    this.replayMs = null;
    this.replayPlaying = false;
    this.onFinished = null;
    this.silentFinish = false;
    this.pausedAccumMs = 0;
    this.pausedAt = 0;
  }

  /**
   * Freeze the race clock + bot ticks. The view treats `paused` as a
   * blurred overlay so the user can't strategize during the freeze.
   * MatchStore drives this both for the explicit Pause button and for
   * the auto-pause-on-tab-switch policy.
   */
  pause(): void {
    if (this.status !== "racing") return;
    this.stopTimer();
    this.pausedAt = Date.now();
    this.status = "paused";
  }

  /**
   * Resume after a `pause()`. The accumulated paused time is added to
   * `startedAt` so `elapsedMs` continues from where it left off
   * instead of jumping forward.
   */
  resume(): void {
    if (this.status !== "paused") return;
    const pausedFor = Date.now() - this.pausedAt;
    this.pausedAccumMs += pausedFor;
    this.startedAt += pausedFor;
    this.pausedAt = 0;
    this.status = "racing";
    this.startTimer();
  }

  /**
   * Player attempts to knock cell `cellIndex`. Honor system — we don't
   * verify the player can actually solve it (matches the original
   * click-mode rules). We *do* refuse if the cell is already knocked
   * or out of range.
   */
  knockCell(cellIndex: number): void {
    if (!this.isRacing) return;
    if (cellIndex < 0 || cellIndex >= this.boardCells.length) return;
    if (this.playerKnockedSet.has(cellIndex)) {
      // Toggle off (matches original `numbersCompleted *= -1`).
      this.playerKnocked = this.playerKnocked.filter(
        (c) => c.cellIndex !== cellIndex,
      );
      return;
    }
    const claim: KnockedCell = {
      cellIndex,
      cellValue: this.boardCells[cellIndex]!,
      equation: null,
      atMs: this.elapsedMs,
    };
    this.playerKnocked = [...this.playerKnocked, claim];

    // Auto-end if the player cleared the whole board.
    if (this.playerKnocked.length === this.boardCells.length) {
      this.finishRace();
    }
  }

  /**
   * Lazily compute the easiest equation that hits the cell at
   * `cellIndex` so the player can verify a knock. Cached.
   */
  revealHint(cellIndex: number): NEquation | null {
    if (this.playerHints.has(cellIndex)) {
      return this.playerHints.get(cellIndex) ?? null;
    }
    const target = this.boardCells[cellIndex];
    if (target === undefined) return null;
    const eq = easiestSolution(this.dice, target, this.mode);
    // Cache the result; clone the map so MobX picks up the change.
    const next = new Map(this.playerHints);
    next.set(cellIndex, eq);
    this.playerHints = next;
    return eq;
  }

  hintFor(cellIndex: number): NEquation | null | undefined {
    return this.playerHints.get(cellIndex);
  }

  // ---------------------------------------------------------------------
  //  Timer plumbing
  // ---------------------------------------------------------------------

  private startTimer(): void {
    this.stopTimer();
    this.timerId = setInterval(() => {
      this.tick();
    }, TICK_MS);
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * One tick of the race clock. Wrapped in a MobX action so observers
   * batch their re-renders. Runs every {@link TICK_MS}.
   */
  private tick(): void {
    runInAction(() => {
      const elapsed = Date.now() - this.startedAt;
      this.elapsedMs = elapsed;

      // Bot's turn — drain whatever became ready.
      if (this.bot !== null) {
        const released = this.bot.tick(elapsed);
        if (released.length > 0) {
          const next = [...this.botKnocked];
          for (const claim of released) {
            // Race condition with player? Not possible in this model:
            // each side has their own board. We still skip dupes
            // defensively (KnockoutBot also tracks them).
            if (this.botKnockedSet.has(claim.cellIndex)) continue;
            next.push(claimToKnocked(claim, elapsed));
          }
          this.botKnocked = next;
        }
      }

      if (this.elapsedMs >= this.raceDurationMs) {
        this.finishRace();
      }
    });
  }

  private finishRace(): void {
    this.stopTimer();
    this.status = "finished";
    if (!this.silentFinish) playEndOfRaceDing();
    if (this.onFinished !== null) {
      const summary: BoutSummary = {
        playerScore: this.playerScore,
        botScore: this.botScore,
        playerCellsKnocked: this.playerKnocked.length,
        botCellsKnocked: this.botKnocked.length,
        maxCells: this.boardCells.length,
        elapsedMs: this.elapsedMs,
        winner: this.winner ?? "tie",
      };
      const cb = this.onFinished;
      this.onFinished = null;
      try {
        cb(summary);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[PlayStore] onFinished threw:", err);
      }
    }
  }

  /** Stop background work; called by the React tear-down hook. */
  dispose(): void {
    this.stopTimer();
    this.stopReplayTimer();
  }

  // ---------------------------------------------------------------------
  //  Replay actions
  // ---------------------------------------------------------------------

  /**
   * Drop into Replay at t=0. No-op outside the results screen — there's
   * nothing meaningful to scrub through mid-race or pre-race.
   */
  enterReplay(): void {
    if (!this.isFinished) return;
    this.replayMs = 0;
    this.replayPlaying = false;
  }

  exitReplay(): void {
    this.stopReplayTimer();
    this.replayMs = null;
    this.replayPlaying = false;
  }

  /** Move the cursor to an absolute timestamp. Clamped to [0, race]. */
  setReplayMs(ms: number): void {
    if (this.replayMs === null) this.enterReplay();
    if (this.replayMs === null) return; // enterReplay no-op'd
    const clamped = Math.max(0, Math.min(this.raceDurationMs, Math.round(ms)));
    this.replayMs = clamped;
    if (clamped >= this.raceDurationMs) {
      this.stopReplayTimer();
      this.replayPlaying = false;
    }
  }

  togglePlayReplay(): void {
    if (this.replayMs === null) {
      this.enterReplay();
    }
    if (this.replayPlaying) {
      this.replayPlaying = false;
      this.stopReplayTimer();
      return;
    }
    // Wrap around if we're sitting at the end.
    if ((this.replayMs ?? 0) >= this.raceDurationMs) {
      this.replayMs = 0;
    }
    this.replayPlaying = true;
    this.startReplayTimer();
  }

  /**
   * Step to the previous / next event in the merged timeline so
   * arrow keys land on something meaningful (skip the long stretches
   * where nothing happens).
   */
  stepReplay(direction: -1 | 1): void {
    if (this.replayMs === null) this.enterReplay();
    if (this.replayMs === null) return;
    const timeline = this.replayTimeline;
    if (timeline.length === 0) return;
    const cursor = this.replayMs;
    if (direction === 1) {
      const next = timeline.find((e) => e.atMs > cursor);
      this.setReplayMs(next?.atMs ?? this.raceDurationMs);
    } else {
      // Find the last event strictly before the cursor; if we're sitting
      // exactly on an event, step past it.
      let prevMs = 0;
      for (const e of timeline) {
        if (e.atMs < cursor) prevMs = e.atMs;
        else break;
      }
      this.setReplayMs(prevMs);
    }
  }

  private startReplayTimer(): void {
    this.stopReplayTimer();
    let last = Date.now();
    this.replayTimerId = setInterval(() => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      runInAction(() => {
        if (this.replayMs === null || !this.replayPlaying) {
          this.stopReplayTimer();
          return;
        }
        this.setReplayMs(this.replayMs + dt);
      });
    }, TICK_MS);
  }

  private stopReplayTimer(): void {
    if (this.replayTimerId !== null) {
      clearInterval(this.replayTimerId);
      this.replayTimerId = null;
    }
  }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/**
 * Roll three dice in `[2..20]`, with at most one `1` allowed (matches
 * the original `enable1s = false` default).
 *
 * STANDARD_MODE has `diceRange = { min: 2, max: 20 }`, so this
 * naturally avoids 1s. We don't bother retrying.
 */
function rollDice(mode: Mode): readonly number[] {
  const { min, max } = mode.diceRange;
  const out: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    out.push(min + Math.floor(Math.random() * (max - min + 1)));
  }
  return out;
}

/**
 * End-of-race chime. We synthesise a short two-tone bell with the
 * WebAudio API so we don't need to ship a sound asset (and so a
 * missing file can never silently break the cue). Safe in SSR /
 * non-browser environments — we just no-op if AudioContext is missing.
 */
function playEndOfRaceDing(): void {
  if (typeof window === "undefined") return;
  // Some browsers gate audio behind a user gesture; the user clicked
  // "Start race" to get here, so we're allowed to make noise.
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (Ctor === undefined) return;
  try {
    const ctx = new Ctor();
    const now = ctx.currentTime;

    // Two-tone bell: a C6 followed by a G6, each ~0.45s with a
    // gentle exponential decay so it lands like a chime, not a beep.
    const tones: ReadonlyArray<{ freq: number; start: number }> = [
      { freq: 1046.5, start: 0 }, // C6
      { freq: 1568.0, start: 0.18 }, // G6
    ];
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = tone.freq;
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(0.4, now + tone.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + tone.start + 0.45,
      );
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + tone.start);
      osc.stop(now + tone.start + 0.5);
    }
    // Tear the context down once the whole chime has played.
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 900);
  } catch {
    // Ignore — audio is a "nice to have", not a correctness concern.
  }
}

function claimToKnocked(claim: BotClaim, atMs: number): KnockedCell {
  return {
    cellIndex: claim.cellIndex,
    cellValue: claim.cellValue,
    equation: claim.equation,
    atMs,
  };
}

/**
 * Score for one side of the race. Mirrors the original formula:
 *   - If they knocked the entire board, extrapolate: maxScore * 60s / timeUsed.
 *   - Otherwise, sum of knocked cell values.
 */
function scoreFor(
  knocked: readonly KnockedCell[],
  maxScore: number,
  raceDurationMs: number,
): number {
  if (knocked.length === 0) return 0;
  const raw = knocked.reduce((s, c) => s + c.cellValue, 0);
  const totalCells = 36; // PATTERN_BOARD is a fixed 36 cells.
  if (raw >= maxScore && knocked.length === totalCells) {
    const lastMs = knocked[knocked.length - 1]!.atMs || raceDurationMs;
    return Math.round(maxScore * (raceDurationMs / Math.max(1, lastMs)));
  }
  return raw;
}
