/**
 * `KnockoutBot` — drives the bot opponent in the classic N2K knockout
 * race (a 60-second sprint where each player has their own 36-cell
 * board and tries to "knock off" as many cells as possible).
 *
 * # Faithfulness to the original (`N2K-Game/index.js`)
 *
 * The original game ran a 30 fps `setInterval` loop. Each frame it
 * looked at the *current* board cell and either claimed it, waited,
 * or skipped past it depending on the equation difficulty:
 *
 *     if (currentDiff < 12) {
 *         if (bot3Cycler * (botSpeed * 0.85 / 10) > currentDiff * 30) {
 *             // claim and advance
 *         } else {
 *             bot3Cycler += 1
 *         }
 *     } else {
 *         if (Math.round(0.5 + Math.random() * 40) == 40) {
 *             botTicker += 1   // skip past hard cell, do NOT claim
 *         }
 *     }
 *
 * Three things to notice:
 *
 *   1. Cells are processed strictly **sequentially**, high-value first
 *      (the original walked `boardNums[37 - botTicker]`).
 *   2. The pacing gate `bot3Cycler * (botSpeed * 0.85 / 10) > diff * 30`
 *      means a claimable cell takes
 *          frames = diff * 30 / (botSpeed * 0.85 / 10)
 *                 = diff * 352.94 / botSpeed
 *      → at 33.33 ms/frame, **`diff * 11_765 / botSpeed` ms** per cell.
 *   3. A cell whose easiest equation has difficulty ≥ 12 is **never
 *      claimed**. The 1-in-40-per-frame coin flip just lets the bot
 *      eventually advance past it (expected wait: 40 frames ≈ 1333 ms).
 *      Hard cells cost the bot real time but yield no points.
 *
 * # Difficulty heuristic
 *
 * The original used its own `difficultyOfEquation` (lines 1055–1173 of
 * `N2K-Game/index.js`) to score candidate equations and pick the
 * easiest per cell. v3's published `difficultyOfEquation` lives in
 * `services/difficulty.ts` and produces a different distribution
 * (different floor, different terms, can be near zero / negative for
 * trivial equations). To keep the bot's pacing identical to the
 * original we port the original formula *here* as
 * {@link botDifficultyOfEquation} and use it only for bot scoring.
 * The rest of the platform keeps the v3 heuristic.
 *
 * # Schedule construction
 *
 * `prepare()` walks the board high-to-low, scoring every reachable
 * cell with the bot's local heuristic. For each cell it accumulates a
 * `cumulativeMs` clock that mirrors what the original's frame counter
 * would have hit by the time the cell finished resolving:
 *
 *   - claimable cell (diff < 12): adds `diff * 11_765 / speed` ms and
 *     queues the claim with `readyAtMs = cumulativeMs`
 *   - hard cell (diff ≥ 12): adds the expected hard-skip wait
 *     (`FRAME_MS / (1/40)` ≈ 1333 ms) and queues nothing — the bot
 *     will never collect those points
 *
 * `tick(elapsedMs)` then just drains whatever became ready.
 */
import type { BulkSolution, Mode, NEquation, Operator } from "../core/types.js";
import { OP } from "../core/constants.js";
import { allSolutions, sweepOneTuple } from "../services/solver.js";

// ---------------------------------------------------------------------------
//  Public types
// ---------------------------------------------------------------------------

/** Bot strength — keyed to the original game's `botSpeedList`. */
export type BotDifficulty = "easy" | "standard" | "hard" | "expert" | "master";

/** Numeric speed for each difficulty (matches `N2K-Game`'s `botSpeedList`). */
export const BOT_SPEED: Readonly<Record<BotDifficulty, number>> = {
  easy: 1,
  standard: 2,
  hard: 3,
  expert: 5,
  master: 10,
};

/** Display label for the bot picker. */
export const BOT_DIFFICULTY_LABEL: Readonly<Record<BotDifficulty, string>> = {
  easy: "Easy",
  standard: "Standard",
  hard: "Hard",
  expert: "Expert",
  master: "Master",
};

/**
 * A single move the bot wants to make: claim cell at index `cellIndex`
 * (worth `cellValue` points) using `equation`.
 */
export interface BotClaim {
  readonly cellIndex: number;
  readonly cellValue: number;
  readonly equation: NEquation;
  readonly difficulty: number;
}

export interface KnockoutBotOptions {
  readonly dice: readonly number[];
  readonly mode: Mode;
  /** The cells the bot needs to score against, row-major. */
  readonly boardCells: readonly number[];
  readonly difficulty: BotDifficulty;
}

// ---------------------------------------------------------------------------
//  Tuning constants (faithful to N2K-Game)
// ---------------------------------------------------------------------------

/** Original loop ran at 30 fps → 1000/30 ms per frame. */
const FRAME_MS = 1000 / 30;

/**
 * Milliseconds per unit of equation difficulty, divided by `botSpeed`.
 * Derived from the original gate `bot3Cycler * (botSpeed * 0.85 / 10) >
 * diff * 30`. Solving for ms: `diff * 30 / (speed * 0.85 / 10) * 1000/30`
 * → `diff * 11_764.7 / speed` ms.
 */
const BASE_MS_PER_DIFFICULTY = 11_765;

/** Difficulty above which a cell is "hard" — bot never claims it. */
const HARD_DIFFICULTY_CAP = 12;

/** Per-frame chance the bot advances past a hard cell. */
const HARD_SKIP_PROB_PER_FRAME = 1 / 40;

/** Expected wait (ms) before the bot skips past a single hard cell. */
const HARD_CELL_EXPECTED_WAIT_MS = FRAME_MS / HARD_SKIP_PROB_PER_FRAME;

// ---------------------------------------------------------------------------
//  botDifficultyOfEquation — port of `N2K-Game/index.js:1055-1173`
// ---------------------------------------------------------------------------

/**
 * Per-die exponent enumeration cap from the original game. Indexed by
 * the die's face value; entry `i` is the number of powers `0..i` the
 * original heuristic considered for that base. Values 4 / 8 / 9 / 16
 * are present even though standard mode depowers them — the original
 * shipped with this exact table.
 */
const POW_RANGE: readonly number[] = [
  20, 1, 20, 13, 10, 9, 10, 8, 7, 7, 7, 7, 6, 6, 6, 7, 6, 8, 5, 7,
];

/**
 * Faithful port of the original game's `difficultyOfEquation`. Arity-3
 * only — that's the only arity the knockout race uses.
 *
 * Output range:
 *   raw subtotal floored at 3.2, then `Math.round(d * 50) / 100`
 *   → values are in **0.01 increments** and effectively **half** the
 *     raw subtotal. Trivial equations land at 1.6 (= 3.2 / 2).
 *
 * The "halving" is from the original's `* 50) / 100` line — almost
 * certainly a typo for `* 100) / 100` (which would have produced 0.01
 * rounding without halving) or `* 50) / 50` (proper 0.02 rounding).
 * We **keep the halving** because every other constant in this file
 * (`HARD_DIFFICULTY_CAP = 12`, `BASE_MS_PER_DIFFICULTY = 11_765`) is
 * calibrated against the halved scale the original actually used.
 *
 * Also includes the original's quirky `smallestMultiplier` branch,
 * which (because the variable starts at 0) always reduces to `-1.2`
 * on the first multiplication. Replicating the buggy-but-shipped
 * behavior so difficulty values match what the original computed.
 */
export function botDifficultyOfEquation(eq: NEquation): number {
  const dice = eq.dice;
  const exps = eq.exps;
  const ops = eq.ops;
  const total = eq.total;
  if (dice.length !== 3) {
    throw new RangeError(
      `botDifficultyOfEquation: arity must be 3 (got ${dice.length})`,
    );
  }

  // Distance list: every legal `die^p` against the equation total.
  // Clamp the powRange index for dice ≥ 20 (only die 20 is at risk;
  // the original's table stops at index 19 and the live game pretty
  // much never produces powers > a couple anyway).
  const listOfDistances: number[] = [];
  for (let j = 0; j < 3; j += 1) {
    const die = dice[j]!;
    const idx = die >= 0 && die < POW_RANGE.length
      ? die
      : POW_RANGE.length - 1;
    const range = POW_RANGE[idx]!;
    for (let i = 0; i < range; i += 1) {
      listOfDistances.push(Math.abs(Math.pow(die, i) - total));
    }
  }
  listOfDistances.sort((a, b) => a - b);
  const shortestDistance = listOfDistances[0] ?? 0;

  const zeroPowers = countMatching(exps, 0);
  const onePowers = countMatching(exps, 1);

  const equationValues: readonly number[] = [
    Math.pow(dice[0]!, exps[0]!),
    Math.pow(dice[1]!, exps[1]!),
    Math.pow(dice[2]!, exps[2]!),
  ];
  const sortedValues = [...equationValues].sort((a, b) => b - a);
  const largestNum = sortedValues[0]!;
  const largestNumDist = Math.abs(largestNum - total);

  // Original's smallestMultiplier branch — see fn-level note.
  const smallestMultiplier = computeSmallestMultiplier(equationValues, ops);

  let newDifficulty =
    4 +
    Math.pow(total, 0.5) / 15 +
    shortestDistance / 12 +
    -zeroPowers / 0.75 +
    -onePowers / 1.25 +
    Math.pow(largestNum, 0.5) / 16 +
    largestNumDist / 9 +
    smallestMultiplier / 2;

  if (Number.isNaN(newDifficulty) || newDifficulty < 3.2) {
    newDifficulty = 3.2;
  }
  return Math.round(newDifficulty * 50) / 100;
}

function countMatching(xs: readonly number[], target: number): number {
  let n = 0;
  for (const x of xs) if (x === target) n += 1;
  return n;
}

function computeSmallestMultiplier(
  equationValues: readonly number[],
  ops: readonly Operator[],
): number {
  let m = 0;
  for (let opIdx = 0; opIdx < 2; opIdx += 1) {
    if (ops[opIdx] !== OP.MUL) continue;
    const left = equationValues[opIdx]!;
    const right = equationValues[opIdx + 1]!;
    const bigger = left >= right ? left : right;
    const smaller = left >= right ? right : left;
    // Faithful to the original: the `if (m > 1)` test is never true on
    // the first MUL because m starts at 0; the else branch sets m to
    // -1.2, which itself isn't > 1, so subsequent MULs also fall into
    // the else branch. Net effect: any MUL → m = -1.2.
    if (m > 1) {
      m = smaller + Math.pow(bigger, 0.5) / 5;
    } else {
      m = -1.2;
    }
  }
  return m;
}

// ---------------------------------------------------------------------------
//  KnockoutBot
// ---------------------------------------------------------------------------

interface QueuedClaim {
  readonly cellIndex: number;
  readonly cellValue: number;
  readonly equation: NEquation;
  readonly difficulty: number;
  /** Time (ms since prepare) at which this claim becomes eligible to reveal. */
  readonly readyAtMs: number;
}

/**
 * Stateful bot that holds its precomputed claim queue and walks
 * through it on a millisecond clock. One instance per match.
 */
export class KnockoutBot {
  private readonly options: KnockoutBotOptions;
  private readonly speed: number;

  /** Targets the bot is queued to claim, ordered by `readyAtMs`. */
  private queue: QueuedClaim[] = [];

  /** Cell indices already revealed — avoids double-claiming. */
  private claimed = new Set<number>();

  /** Number of items popped from the queue. */
  private nextSlotIdx = 0;

  constructor(options: KnockoutBotOptions) {
    this.options = options;
    this.speed = BOT_SPEED[options.difficulty];
  }

  /**
   * Run the solver, score every reachable cell with the bot-local
   * heuristic, and build the reveal schedule. Pure compute — does not
   * mutate the board or start the clock. Call this exactly once
   * before the match starts.
   *
   * Returns the number of cells the bot can theoretically claim
   * (i.e. cells with at least one equation under the hard cap). The
   * UI uses this for the "Reaches X/N" label.
   */
  prepare(): number {
    const { dice, mode, boardCells } = this.options;

    // Bulk-solve the whole board once so we know which cells are
    // reachable at all and have a fast path for "no candidates".
    const min = Math.min(...boardCells);
    const max = Math.max(...boardCells);
    const reachable: ReadonlyMap<number, BulkSolution> = sweepOneTuple(
      dice,
      min,
      max,
      mode,
    );

    // Walk the board high-value first (matches the original's
    // `boardNums[37 - botTicker]` descending iteration).
    const sorted = boardCells
      .map((value, idx) => ({ value, idx }))
      .sort((a, b) => b.value - a.value);

    let cumulativeMs = 0;
    for (const { value, idx } of sorted) {
      if (!reachable.has(value)) continue;

      // Re-score every candidate equation with the bot's local
      // heuristic, since v3's `sweepOneTuple` picks the easiest by
      // v3's heuristic — not the original's.
      const candidates = allSolutions(dice, value, mode);
      let bestEq: NEquation | null = null;
      let bestDiff = Infinity;
      for (const eq of candidates) {
        const d = botDifficultyOfEquation(eq);
        if (d < bestDiff) {
          bestDiff = d;
          bestEq = eq;
        }
      }
      if (bestEq === null) continue;

      if (bestDiff >= HARD_DIFFICULTY_CAP) {
        // Hard cell: the original stalled here for ~40 frames trying
        // to skip past it, then moved on. We charge the expected
        // wait against the running clock so subsequent (easier) cells
        // arrive later, exactly mirroring the original's flow.
        cumulativeMs += HARD_CELL_EXPECTED_WAIT_MS;
        continue;
      }

      const costMs = (bestDiff * BASE_MS_PER_DIFFICULTY) / this.speed;
      cumulativeMs += costMs;
      this.queue.push({
        cellIndex: idx,
        cellValue: value,
        equation: bestEq,
        difficulty: bestDiff,
        readyAtMs: cumulativeMs,
      });
    }

    return this.queue.length;
  }

  /**
   * Advance the bot clock to `elapsedMs` since prepare. Returns every
   * new claim that became ready in this window — usually 0 or 1, but
   * can be more if the renderer skipped a frame.
   */
  tick(elapsedMs: number): BotClaim[] {
    const released: BotClaim[] = [];
    while (
      this.nextSlotIdx < this.queue.length &&
      this.queue[this.nextSlotIdx]!.readyAtMs <= elapsedMs
    ) {
      const next = this.queue[this.nextSlotIdx]!;
      this.nextSlotIdx += 1;
      if (this.claimed.has(next.cellIndex)) continue;
      this.claimed.add(next.cellIndex);
      released.push({
        cellIndex: next.cellIndex,
        cellValue: next.cellValue,
        equation: next.equation,
        difficulty: next.difficulty,
      });
    }
    return released;
  }

  /** Total claims still pending, for debug/UI. */
  remaining(): number {
    return this.queue.length - this.nextSlotIdx;
  }
}
