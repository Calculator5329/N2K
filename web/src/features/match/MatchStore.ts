/**
 * `MatchStore` — drives a single Competition **match**.
 *
 * Wraps the lower-level `PlayStore` (which still owns the 60-second
 * race itself) and adds the multi-bout chain, score accumulation,
 * pause/resume orchestration, and end-of-match wrap-up.
 *
 * Two play formats:
 *
 *   - `vs-bot`  — user is P1, bot is P2. Each bout is one race;
 *                  scores accumulate across bouts, the match
 *                  outcome is decided by total score.
 *   - `hot-seat` — for each bout the user races as P1 (with P1's
 *                  dice), then again as P2 (with P2's dice). Two
 *                  separate score totals are tracked. There is no
 *                  bot.
 *
 * Phase boundaries trigger an interstitial ("Begin next phase"); bout
 * boundaries trigger a quick summary card with a 5-second auto-advance.
 *
 * Persistence: the in-flight match is mirrored to
 * `match:current` on every observable change so a hard refresh
 * doesn't lose it. The mid-race timer state isn't persisted — an
 * interrupted bout restarts from 0:00 (matches the user's call-out).
 *
 * All state changes route through this store; the view (`MatchView`)
 * is pure presentation.
 */
import {
  autorun,
  makeAutoObservable,
  runInAction,
  type IReactionDisposer,
} from "mobx";
import type { BotDifficulty } from "@solver/games/knockoutBot.js";
import {
  defaultContentBackend,
  type ContentBackend,
  type ContentDoc,
} from "../../services/contentBackend";
import {
  recordMatch,
  type MatchBoutRecord,
  type MatchFormat,
  type MatchRecord,
} from "../../services/matchStats";
import { PlayStore, type BoutSummary, type RaceRules } from "../../stores/PlayStore";
import type {
  AnySharedPlan,
  PhaseConfig,
  SharedBoardV5,
  SharedPhaseV5,
  SharedPlanV5,
} from "../compose/CompositionStore";

export const MATCH_DOC_ID = "match:current";

/**
 * How long the post-bout summary card lingers before auto-advancing
 * to the next race / phase interstitial / match-end screen. The user
 * can always tap "Next bout →" to skip the wait. 3s was the original
 * v3.2 ship value; user feedback was that it didn't leave enough time
 * to read the score line, so it was bumped to 5s.
 */
export const BOUT_SUMMARY_AUTO_ADVANCE_MS = 5000;

/** Bot persona presets for vs-bot matches. */
export interface BotPersona {
  readonly difficulty: BotDifficulty;
  readonly name: string;
}

export const BOT_PERSONAS: readonly BotPersona[] = [
  { difficulty: "easy",     name: "Pascal" },
  { difficulty: "standard", name: "Euler" },
  { difficulty: "hard",     name: "Cantor" },
  { difficulty: "expert",   name: "Hypatia" },
  { difficulty: "master",   name: "Ramanujan" },
];

/** UI-side knob block for kicking off a new match. */
export interface MatchLaunchOptions {
  readonly compId: string;
  readonly format: MatchFormat;
  readonly persona?: BotPersona;
}

/** Where the user currently is in the bout chain. */
export type MatchPhase =
  | { kind: "racing"; seat: "P1" | "P2" }
  | { kind: "bout-summary"; bout: BoutSummary; seat: "P1" | "P2" }
  | { kind: "phase-summary"; finishedPhaseIndex: number }
  | { kind: "match-end" };

interface MatchSnapshot {
  readonly version: 2 | 3;
  readonly compId: string;
  readonly compName: string;
  readonly format: MatchFormat;
  readonly persona: BotPersona | null;
  readonly schedule: readonly ScheduleEntry[];
  readonly cursor: number;
  readonly bouts: readonly MatchBoutRecord[];
  readonly startedAt: string;
  /**
   * Rules the comp was generated under. Carried into PlayStore.setup
   * each bout so the bot's solver runs against the right matrix
   * (Æther bots solving against the Standard matrix find no cells).
   * v2 added; v1 snapshots default to "standard" on restore.
   */
  readonly rules: RaceRules;
  /**
   * Race length in seconds for this comp's bouts. v3 added; v1/v2
   * snapshots default to the body's `timeBudget` on restore (which
   * itself defaults to 60 if the loaded plan is also pre-timeBudget).
   */
  readonly timeBudget?: number;
}

/** Flat play schedule — one entry per "thing the user is about to race". */
interface ScheduleEntry {
  readonly phaseIndex: number;
  readonly boardIndex: number;
  readonly boutIndex: number;
  readonly userSeat: "P1" | "P2";
  readonly board: readonly number[];
  readonly p1Dice: readonly [number, number, number];
  readonly p2Dice: readonly [number, number, number];
  /**
   * Expected score for whichever seat the *user* occupies on this
   * entry, computed by `generateBalancedRolls` at compose time. In
   * vs-bot the user is always P1 so this is the round's
   * `p1ExpectedScore`; in hot-seat we generate two entries per bout
   * (one P1, one P2) and each gets its own seat's expected score.
   * Used by `MatchEndScreen` to surface "You scored X, expected Y"
   * so the user can gauge how well they played the matrix.
   */
  readonly userExpectedScore: number;
  /**
   * Expected score for the opposing seat on this entry. In vs-bot
   * this is the bot's expected; in hot-seat it's the *other* user's
   * expected for the same race (so the breakdown still has both
   * columns to compare).
   */
  readonly opponentExpectedScore: number;
}

/**
 * The MatchStore class.
 *
 * Construction is cheap (no I/O, no timers); call `launch()` to
 * actually wire up a match. `restoreFromSnapshot()` is used by the
 * reload-survival path.
 */
export class MatchStore {
  /** Live single-bout race. Re-used across every bout in the match. */
  readonly play: PlayStore = new PlayStore();

  /** The competition this match belongs to (saved-comp id). */
  compId: string = "";
  /** Display name for the indicator strip. */
  compName: string = "";
  format: MatchFormat = "vs-bot";
  /** Active persona for vs-bot (null for hot-seat). */
  persona: BotPersona | null = null;
  /**
   * Pre-flattened bout schedule. For vs-bot every bout produces ONE
   * schedule entry (user as P1). For hot-seat every bout produces
   * TWO entries (user as P1 then user as P2).
   */
  schedule: readonly ScheduleEntry[] = [];
  /** Index into `schedule` for the next-or-current race. */
  cursor: number = 0;
  /** Per-bout records collected as the match progresses. */
  bouts: MatchBoutRecord[] = [];
  /** ISO timestamp the match started. */
  startedAt: string = "";
  /** Rules the comp was generated under (Standard vs. Æther). */
  rules: RaceRules = "standard";

  /**
   * Race length in seconds taken from the comp's `timeBudget`
   * (30 / 60 / 120). Forwarded to `PlayStore.start({ raceDurationMs })`
   * each bout so a 30-second comp actually plays in 30 seconds.
   * Defaults to 60 so any pre-launch state matches Quick Race.
   */
  timeBudgetSec: number = 60;

  /** Where the user is in the chain right now (UI hint). */
  uiPhase: MatchPhase = { kind: "racing", seat: "P1" };

  /** Phase metadata (so the indicator strip can read names + counts). */
  phaseMeta: ReadonlyArray<{ name: string; boards: number }> = [];

  /** True iff the user explicitly hit Pause (vs auto-pause). */
  pauseSource: "explicit" | "auto" | null = null;

  /** Hot-seat only: visible whenever the user has just finished a P1 race and is about to start P2. */
  passingDevice = false;

  private autosaveDisposer: IReactionDisposer | null = null;
  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly backend: ContentBackend = defaultContentBackend,
    private readonly onComplete: ((record: MatchRecord) => void) | null = null,
  ) {
    makeAutoObservable(
      this,
      {
        play: false,
        attachAutosave: false,
      },
      { autoBind: true },
    );
  }

  // -------------------------------------------------------------------
  //  Lifecycle
  // -------------------------------------------------------------------

  /**
   * Build the match's bout schedule from the saved comp body, then
   * start the first bout.
   *
   * Returns `false` if the comp can't be played (no generated boards
   * yet); the caller should surface a toast and bail.
   */
  launch(opts: {
    compId: string;
    body: SharedPlanV5;
    format: MatchFormat;
    persona?: BotPersona;
  }): boolean {
    const { compId, body, format, persona } = opts;
    const schedule = buildSchedule(body, format);
    if (schedule.length === 0) return false;
    runInAction(() => {
      this.compId = compId;
      this.compName = body.name;
      this.format = format;
      this.persona = format === "vs-bot" ? (persona ?? BOT_PERSONAS[1]!) : null;
      this.schedule = schedule;
      this.cursor = 0;
      this.bouts = [];
      this.startedAt = new Date().toISOString();
      this.rules = body.rules;
      this.timeBudgetSec = body.timeBudget;
      this.phaseMeta = body.phases.map((p) => ({
        name: p.name,
        boards: p.boards.length,
      }));
      this.passingDevice = false;
      this.uiPhase = { kind: "racing", seat: schedule[0]!.userSeat };
    });
    this.startCurrentBout();
    return true;
  }

  /** Restore an in-flight match from `match:current`. */
  restoreFromSnapshot(snap: MatchSnapshot, body: SharedPlanV5): boolean {
    if (snap.cursor >= snap.schedule.length) return false;
    runInAction(() => {
      this.compId = snap.compId;
      this.compName = snap.compName;
      this.format = snap.format;
      this.persona = snap.persona;
      this.schedule = snap.schedule;
      this.cursor = snap.cursor;
      this.bouts = [...snap.bouts];
      this.startedAt = snap.startedAt;
      // v1 snapshots predate the `rules` field — fall back to the live
      // comp body so the bot still uses the right solver mode.
      this.rules = snap.rules ?? body.rules;
      // v1/v2 snapshots predate `timeBudget` — fall back to the live
      // comp body so a reload during a 30s match doesn't quietly
      // bump the countdown back to 60s.
      this.timeBudgetSec = snap.timeBudget ?? body.timeBudget;
      this.phaseMeta = body.phases.map((p) => ({
        name: p.name,
        boards: p.boards.length,
      }));
      this.uiPhase = { kind: "racing", seat: snap.schedule[snap.cursor]!.userSeat };
    });
    this.startCurrentBout();
    return true;
  }

  // -------------------------------------------------------------------
  //  Selectors
  // -------------------------------------------------------------------

  get currentEntry(): ScheduleEntry | null {
    return this.schedule[this.cursor] ?? null;
  }

  /** 1-based bout index across the whole comp (for the indicator strip). */
  get currentBoutGlobal(): number {
    if (this.format === "vs-bot") return this.cursor + 1;
    // Hot-seat: each "bout" is two schedule entries (P1 then P2).
    return Math.floor(this.cursor / 2) + 1;
  }

  /** Number of bouts in the current board (for "Bout 3/5" labels). */
  get currentBoardBoutCount(): number {
    const entry = this.currentEntry;
    if (entry === null) return 0;
    let count = 0;
    for (const e of this.schedule) {
      if (e.phaseIndex === entry.phaseIndex && e.boardIndex === entry.boardIndex) {
        count += 1;
      }
    }
    return this.format === "vs-bot" ? count : count / 2;
  }

  /** 1-based bout index within the current board. */
  get currentBoardBoutIndex(): number {
    const entry = this.currentEntry;
    if (entry === null) return 0;
    return entry.boutIndex + 1;
  }

  get totalBoutsInMatch(): number {
    return this.format === "vs-bot" ? this.schedule.length : this.schedule.length / 2;
  }

  /** User score totals broken down by seat (hot-seat) or just P1 (vs-bot). */
  get userTotals(): { P1: number; P2: number } {
    const totals = { P1: 0, P2: 0 };
    for (const b of this.bouts) {
      totals[b.userSeat] += b.playerScore;
    }
    return totals;
  }

  /** Opponent total — bot in vs-bot, n/a in hot-seat (always 0). */
  get opponentTotal(): number {
    if (this.format !== "vs-bot") return 0;
    return this.bouts.reduce((sum, b) => sum + b.opponentScore, 0);
  }

  /**
   * Sum of expected scores for the seat the user actually occupied
   * across every bout that's been completed. Surfaced on
   * `MatchEndScreen` so the user can read their actual total against
   * the matrix's prediction.
   *
   * Implementation: `bouts` records the played history but doesn't
   * itself store expected scores; we look them up from the matching
   * `schedule` entry by phase/board/bout/seat. (Schedule is keyed
   * the same way `bouts` is appended, so a linear walk is O(n) over
   * total played races and is fine for end-of-match render.)
   */
  get userExpectedTotal(): number {
    return this.sumExpected("user");
  }

  /** Like {@link userExpectedTotal} but for the opposing seat each bout. */
  get opponentExpectedTotal(): number {
    if (this.format !== "vs-bot") return 0;
    return this.sumExpected("opponent");
  }

  private sumExpected(side: "user" | "opponent"): number {
    let total = 0;
    for (const b of this.bouts) {
      const entry = this.schedule.find(
        (s) =>
          s.phaseIndex === b.phaseIndex &&
          s.boardIndex === b.boardIndex &&
          s.boutIndex === b.boutIndex &&
          s.userSeat === b.userSeat,
      );
      if (entry === undefined) continue;
      total +=
        side === "user" ? entry.userExpectedScore : entry.opponentExpectedScore;
    }
    return total;
  }

  /**
   * Per-bout expected score lookup keyed by phase/board/bout/seat.
   * Returns `null` when the schedule entry can't be found (defensive
   * — shouldn't happen for any record in `bouts`). Used by the
   * Bout-by-bout breakdown to annotate each row with "you scored X
   * vs expected Y".
   */
  expectedFor(
    bout: MatchBoutRecord,
  ): { user: number; opponent: number } | null {
    const entry = this.schedule.find(
      (s) =>
        s.phaseIndex === bout.phaseIndex &&
        s.boardIndex === bout.boardIndex &&
        s.boutIndex === bout.boutIndex &&
        s.userSeat === bout.userSeat,
    );
    if (entry === undefined) return null;
    return {
      user: entry.userExpectedScore,
      opponent: entry.opponentExpectedScore,
    };
  }

  get isPaused(): boolean {
    return this.play.isPaused;
  }

  get isMatchEnded(): boolean {
    return this.uiPhase.kind === "match-end";
  }

  // -------------------------------------------------------------------
  //  Pause / resume
  // -------------------------------------------------------------------

  pauseExplicit(): void {
    if (!this.play.isRacing) return;
    this.play.pause();
    this.pauseSource = "explicit";
  }

  /** Auto-pause when user navigates away from the Play tab. */
  autoPause(): void {
    if (!this.play.isRacing) return;
    this.play.pause();
    this.pauseSource = "auto";
  }

  resume(): void {
    if (!this.play.isPaused) return;
    this.play.resume();
    this.pauseSource = null;
  }

  // -------------------------------------------------------------------
  //  Advance through the schedule
  // -------------------------------------------------------------------

  /** Manually advance from the bout-summary card. */
  advanceFromBoutSummary(): void {
    this.clearAutoAdvance();
    this.advanceCursor();
  }

  /** Begin the next phase from the phase interstitial. */
  beginNextPhase(): void {
    if (this.uiPhase.kind !== "phase-summary") return;
    this.advanceCursor();
  }

  /**
   * Public hot-seat-only acknowledgement of the "Pass the device"
   * overlay. Triggers the next race start.
   */
  acknowledgePassingDevice(): void {
    if (!this.passingDevice) return;
    this.passingDevice = false;
    this.startCurrentBout();
  }

  /** Discard the in-flight match (drops persisted state). */
  async discard(): Promise<void> {
    this.detachAutosave();
    this.clearAutoAdvance();
    this.play.restart();
    await this.backend.remove(MATCH_DOC_ID);
    runInAction(() => {
      this.cursor = 0;
      this.schedule = [];
      this.bouts = [];
      this.uiPhase = { kind: "racing", seat: "P1" };
      this.passingDevice = false;
    });
  }

  // -------------------------------------------------------------------
  //  Internal — bout chain
  // -------------------------------------------------------------------

  private startCurrentBout(): void {
    const entry = this.currentEntry;
    if (entry === null) return;
    const userDice = entry.userSeat === "P1" ? entry.p1Dice : entry.p2Dice;
    // For vs-bot the bot's dice are the OTHER seat's dice. For
    // hot-seat there's no bot — we still pass the same dice so the
    // bot is "off" (we use difficulty:easy + zero its visibility);
    // the view hides the right side entirely in hot-seat.
    const botDice =
      this.format === "vs-bot"
        ? entry.userSeat === "P1"
          ? entry.p2Dice
          : entry.p1Dice
        : userDice;
    this.uiPhase = { kind: "racing", seat: entry.userSeat };
    if (this.format === "vs-bot" && this.persona !== null) {
      this.play.setSetup({
        difficulty: this.persona.difficulty,
        botName: this.persona.name,
        rules: this.rules,
      });
    } else {
      // Hot-seat: there's no visible bot, but we still update rules so
      // `play.mode` is right for any equation hints the user reveals.
      this.play.setSetup({ rules: this.rules });
    }
    this.play.start({
      board: entry.board,
      playerDice: userDice,
      botDice,
      onFinished: (summary) => this.handleBoutFinished(summary),
      // Don't ring the chime mid-chain; only on match end.
      silent: true,
      // Honor the comp's `timeBudget` instead of always using 60s.
      // The PlayStore default kicks in for callers (Quick Race) that
      // don't pass this; for matches we always pass the comp value.
      raceDurationMs: this.timeBudgetSec * 1000,
    });
  }

  private handleBoutFinished(summary: BoutSummary): void {
    const entry = this.currentEntry;
    if (entry === null) return;
    const record: MatchBoutRecord = {
      phaseIndex: entry.phaseIndex,
      boardIndex: entry.boardIndex,
      boutIndex: entry.boutIndex,
      playerScore: summary.playerScore,
      opponentScore: this.format === "vs-bot" ? summary.botScore : 0,
      playerCellsKnocked: summary.playerCellsKnocked,
      maxCells: summary.maxCells,
      elapsedMs: summary.elapsedMs,
      winner:
        this.format !== "vs-bot"
          ? "tie"
          : summary.winner === "player"
          ? "player"
          : summary.winner === "bot"
          ? "opponent"
          : "tie",
      userSeat: entry.userSeat,
    };
    runInAction(() => {
      this.bouts.push(record);
      this.uiPhase = { kind: "bout-summary", bout: summary, seat: entry.userSeat };
    });
    // Auto-advance after a beat so the user sees the bout score line
    // before the next race begins. They can always tap the explicit
    // "Next bout →" button on the summary card to skip the wait.
    this.scheduleAutoAdvance(BOUT_SUMMARY_AUTO_ADVANCE_MS);
  }

  private scheduleAutoAdvance(ms: number): void {
    this.clearAutoAdvance();
    this.autoAdvanceTimer = setTimeout(() => {
      runInAction(() => {
        this.advanceCursor();
      });
    }, ms);
  }

  private clearAutoAdvance(): void {
    if (this.autoAdvanceTimer !== null) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  /**
   * Move the cursor forward and decide what comes next: another
   * race, a phase interstitial, or the end of the match.
   */
  private advanceCursor(): void {
    this.clearAutoAdvance();
    const previousEntry = this.currentEntry;
    const nextCursor = this.cursor + 1;
    if (nextCursor >= this.schedule.length) {
      this.cursor = nextCursor;
      this.endMatch();
      return;
    }
    const nextEntry = this.schedule[nextCursor]!;
    this.cursor = nextCursor;
    // Detect phase boundary — the just-finished entry's phase
    // differs from the upcoming entry's phase.
    if (previousEntry !== null && previousEntry.phaseIndex !== nextEntry.phaseIndex) {
      this.uiPhase = {
        kind: "phase-summary",
        finishedPhaseIndex: previousEntry.phaseIndex,
      };
      return;
    }
    // Hot-seat: at the boundary between a P1 race and the matching
    // P2 race we surface the "Pass the device" overlay.
    if (
      this.format === "hot-seat" &&
      previousEntry !== null &&
      nextEntry.userSeat !== previousEntry.userSeat
    ) {
      this.passingDevice = true;
      this.uiPhase = { kind: "racing", seat: nextEntry.userSeat };
      return;
    }
    this.startCurrentBout();
  }

  private endMatch(): void {
    this.clearAutoAdvance();
    runInAction(() => {
      this.uiPhase = { kind: "match-end" };
    });
    void this.persistRecord();
  }

  private async persistRecord(): Promise<void> {
    const totals = this.userTotals;
    const userTotalScore = totals.P1 + totals.P2;
    const opponentTotal = this.opponentTotal;
    const userRaceCount = this.bouts.length;
    const outcome: "win" | "loss" | "tie" =
      this.format === "vs-bot"
        ? userTotalScore > opponentTotal
          ? "win"
          : userTotalScore < opponentTotal
          ? "loss"
          : "tie"
        : "tie";
    const record: MatchRecord = {
      compId: this.compId,
      matchId: cryptoRandomId(),
      format: this.format,
      finishedAt: new Date().toISOString(),
      bots:
        this.format === "vs-bot" && this.persona !== null
          ? [{ seat: "P2", difficulty: this.persona.difficulty, name: this.persona.name }]
          : [],
      bouts: this.bouts,
      userTotalScore,
      opponentTotalScore: opponentTotal,
      userTotalsBySeat: this.format === "hot-seat" ? totals : null,
      outcome,
      userRaceCount,
    };
    try {
      await recordMatch(record);
      // Clear the in-flight snapshot — match is done.
      await this.backend.remove(MATCH_DOC_ID);
      this.onComplete?.(record);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[MatchStore] failed to persist match record:", err);
    }
  }

  // -------------------------------------------------------------------
  //  Persistence wiring (in-flight match)
  // -------------------------------------------------------------------

  attachAutosave(): () => void {
    if (this.autosaveDisposer !== null) return () => this.autosaveDisposer?.();
    this.autosaveDisposer = autorun(() => {
      // Don't persist after the match has ended; the snapshot doc
      // is removed in `persistRecord()`.
      if (this.uiPhase.kind === "match-end" || this.schedule.length === 0) return;
      const snap: MatchSnapshot = {
        version: 3,
        compId: this.compId,
        compName: this.compName,
        format: this.format,
        persona: this.persona,
        schedule: this.schedule,
        cursor: this.cursor,
        bouts: this.bouts,
        startedAt: this.startedAt,
        rules: this.rules,
        timeBudget: this.timeBudgetSec,
      };
      const doc: ContentDoc<MatchSnapshot> = {
        id: MATCH_DOC_ID,
        body: snap,
        updatedAt: new Date().toISOString(),
        schemaVersion: 1,
      };
      void this.backend.save(doc).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[MatchStore] autosave failed:", err);
      });
    });
    return () => this.detachAutosave();
  }

  detachAutosave(): void {
    if (this.autosaveDisposer !== null) {
      this.autosaveDisposer();
      this.autosaveDisposer = null;
    }
  }

  /** Tear down timers; called by `AppStore.dispose()`. */
  dispose(): void {
    this.detachAutosave();
    this.clearAutoAdvance();
    this.play.dispose();
  }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/**
 * Snapshot loader used by the reload-survival flow. Returns `null` when
 * no in-flight match is stored.
 */
export async function loadMatchSnapshot(
  backend: ContentBackend = defaultContentBackend,
): Promise<MatchSnapshot | null> {
  const doc = await backend.load<MatchSnapshot>(MATCH_DOC_ID);
  return doc?.body ?? null;
}

export async function clearMatchSnapshot(
  backend: ContentBackend = defaultContentBackend,
): Promise<void> {
  await backend.remove(MATCH_DOC_ID);
}

/**
 * Translate a saved competition body into a flat play schedule. Each
 * board contributes one entry per bout (vs-bot) or two (hot-seat,
 * P1 then P2). Boards that haven't been generated are skipped — a
 * caller filters those out before entering this function (`launch()`
 * returns false if the schedule ends up empty).
 */
function buildSchedule(
  body: SharedPlanV5,
  format: MatchFormat,
): readonly ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  body.phases.forEach((phase: SharedPhaseV5, phaseIndex) => {
    phase.boards.forEach((board: SharedBoardV5, boardIndex) => {
      if (board.result === undefined) return;
      const cells = board.preview ?? [];
      if (cells.length !== 36) return;
      board.result.rounds.forEach((bout, boutIndex) => {
        const p1: [number, number, number] = [bout.p1[0], bout.p1[1], bout.p1[2]];
        const p2: [number, number, number] = [bout.p2[0], bout.p2[1], bout.p2[2]];
        const p1Exp = bout.p1ExpectedScore;
        const p2Exp = bout.p2ExpectedScore;
        entries.push({
          phaseIndex,
          boardIndex,
          boutIndex,
          userSeat: "P1",
          board: cells,
          p1Dice: p1,
          p2Dice: p2,
          userExpectedScore: p1Exp,
          opponentExpectedScore: p2Exp,
        });
        if (format === "hot-seat") {
          entries.push({
            phaseIndex,
            boardIndex,
            boutIndex,
            userSeat: "P2",
            board: cells,
            p1Dice: p1,
            p2Dice: p2,
            userExpectedScore: p2Exp,
            opponentExpectedScore: p1Exp,
          });
        }
      });
    });
  });
  return entries;
}

/** Re-export a dummy reference so eslint doesn't trim the imported type. */
export type { PhaseConfig };
export type { AnySharedPlan };

function cryptoRandomId(): string {
  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = "";
  for (const byte of bytes) out += byte.toString(36).padStart(2, "0");
  return out.slice(0, 12);
}
