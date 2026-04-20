/**
 * Competition generator — pure algorithms for building "balanced" dice rolls
 * across N rounds for two players on a given board.
 *
 * This module is layer-pure: it imports nothing from `cli/`, performs no I/O,
 * and accepts an injectable `DifficultyResolver` so it can be driven from
 *
 *   - the Node solver (resolver = `easiestSolution(...).difficulty`), and
 *   - the static web dataset (resolver = lookup in the per-dice .n2k blob).
 *
 * Conventions:
 *   - "boardDifficulty" follows the same definition as
 *     `boardAnalysis.ts::scoreBoardForDice`: average per-cell difficulty,
 *     where each unsolvable cell contributes the maximum penalty (100).
 *   - "expectedScore" mirrors the original Python `expected_score` heuristic
 *     with a configurable per-board time budget (default 60).
 *   - Pairing strategy: stratify the candidate pool by `boardDifficulty`
 *     into N buckets (one per round), then within each bucket pick a pair
 *     whose `expectedScore` values are closest. This guarantees variety
 *     across rounds — easiest tier in round 1, hardest tier in the final
 *     round — while keeping each individual round fair. The legacy "easy
 *     half only" strategy collapsed every round to mid-tier difficulty
 *     and made cards feel monotonous; stratification is the fix.
 */
import { BOARD } from "../core/constants.js";
import type { DiceTriple } from "../core/types.js";

/**
 * Look up the difficulty of the easiest equation that uses `dice` to hit
 * `target`, or `null` if no such equation exists.
 */
export type DifficultyResolver = (
  dice: DiceTriple,
  target: number,
) => number | null;

/** Maximum penalty applied to unsolvable cells. Matches `scoreBoardForDice`. */
export const UNSOLVABLE_PENALTY = 100;

// ---------------------------------------------------------------------------
//  Per-cell scoring
// ---------------------------------------------------------------------------

/** Per-cell difficulty across a board. `null` means the cell is unsolvable. */
export type CellDifficulties = readonly (number | null)[];

/** Score every cell of `board` against `dice` using the given resolver. */
export function scoreBoardCells(
  board: readonly number[],
  dice: DiceTriple,
  resolver: DifficultyResolver,
): CellDifficulties {
  return board.map((target) => resolver(dice, target));
}

/** Aggregated board difficulty (mirror of `boardAnalysis.scoreBoardForDice`). */
export interface BoardDifficultySummary {
  /** Average difficulty across solvable cells. `null` if every cell is unsolvable. */
  readonly averagePossibleDifficulty: number | null;
  /** Composite, in `[0, UNSOLVABLE_PENALTY]`. Lower = easier. */
  readonly boardDifficulty: number;
  readonly impossibleCount: number;
}

export function summarizeBoardDifficulty(
  cells: CellDifficulties,
): BoardDifficultySummary {
  const possible: number[] = [];
  for (const c of cells) if (c !== null) possible.push(c);

  const impossibleCount = cells.length - possible.length;
  if (possible.length === 0) {
    return {
      averagePossibleDifficulty: null,
      boardDifficulty: UNSOLVABLE_PENALTY,
      impossibleCount,
    };
  }

  const avg = possible.reduce((a, b) => a + b, 0) / possible.length;
  const composite =
    cells.length === 0
      ? UNSOLVABLE_PENALTY
      : (avg * possible.length + UNSOLVABLE_PENALTY * impossibleCount) /
        cells.length;

  return {
    averagePossibleDifficulty: round2(avg),
    boardDifficulty: round2(composite),
    impossibleCount,
  };
}

// ---------------------------------------------------------------------------
//  Expected score (port of Python `expected_score`)
// ---------------------------------------------------------------------------

export interface ExpectedScoreOptions {
  readonly timeBudget?: number;
  readonly hardSkipThreshold?: number;
}

export function expectedScore(
  board: readonly number[],
  cells: CellDifficulties,
  options: ExpectedScoreOptions = {},
): number {
  if (board.length !== cells.length) {
    throw new RangeError(
      `board (${board.length}) and cells (${cells.length}) length mismatch`,
    );
  }

  const timeBudget = options.timeBudget ?? 60;
  const hardSkip = options.hardSkipThreshold ?? 10;

  let m1 = 0;
  for (let i = 0; i < board.length; i += 1) {
    const d = cells[i];
    if (d === null || d === undefined) continue;
    if (d <= 0) continue;
    m1 += board[i]! / d;
  }

  type ByValue = { value: number; difficulty: number };
  const byValueDesc: ByValue[] = [];
  for (let i = 0; i < board.length; i += 1) {
    const d = cells[i];
    if (d === null || d === undefined) continue;
    byValueDesc.push({ value: board[i]!, difficulty: d });
  }
  byValueDesc.sort((a, b) => b.value - a.value);

  let m2 = 0;
  let budget2 = timeBudget;
  for (const { value, difficulty } of byValueDesc) {
    if (difficulty > hardSkip) continue;
    if (budget2 < difficulty) continue;
    budget2 -= difficulty;
    m2 += value;
  }

  type Pair = { value: number; difficulty: number };
  const sorted: Pair[] = [];
  for (let i = 0; i < board.length; i += 1) {
    const d = cells[i];
    if (d === null || d === undefined) continue;
    sorted.push({ value: board[i]!, difficulty: d });
  }
  sorted.sort((a, b) => a.difficulty - b.difficulty);

  let m3 = 0;
  let budget3 = timeBudget;
  for (const { value, difficulty } of sorted) {
    if (difficulty > hardSkip) break;
    if (budget3 < difficulty) break;
    budget3 -= difficulty;
    m3 += value;
  }

  const blended = m1 * 0.1 + m2 * 0.7 + m3 * 0.2;
  const multiplier = 39.48 / timeBudget;
  return round2(blended * multiplier);
}

// ---------------------------------------------------------------------------
//  Candidate ranking
// ---------------------------------------------------------------------------

export interface RankedCandidate {
  readonly dice: DiceTriple;
  readonly cells: CellDifficulties;
  readonly boardDifficulty: number;
  readonly expectedScore: number;
  readonly impossibleCount: number;
}

export function rankCandidates(
  board: readonly number[],
  candidates: readonly DiceTriple[],
  resolver: DifficultyResolver,
  scoreOptions: ExpectedScoreOptions = {},
): RankedCandidate[] {
  const ranked: RankedCandidate[] = candidates.map((dice) => {
    const cells = scoreBoardCells(board, dice, resolver);
    const summary = summarizeBoardDifficulty(cells);
    return {
      dice,
      cells,
      boardDifficulty: summary.boardDifficulty,
      expectedScore: expectedScore(board, cells, scoreOptions),
      impossibleCount: summary.impossibleCount,
    };
  });
  ranked.sort(compareByExpectedScoreThenDifficulty);
  return ranked;
}

// ---------------------------------------------------------------------------
//  Balanced roll generator
// ---------------------------------------------------------------------------

/**
 * How aggressively the per-round picker should pull P1's and P2's
 * rolls *apart* from each other within a single round.
 *
 *   "tight"    — score-adjacent pairs. P1 and P2 have nearly identical
 *                expected scores within each round. Most "head-to-head
 *                fair" feel, but rolls can look similar across the
 *                table (and were the source of the equation-leak bug
 *                we patched with `MAX_SHARED_FACES_PER_ROUND`).
 *   "balanced" — pairs that span roughly a third of the bucket.
 *                Visibly different rolls, modest per-round score gap,
 *                still easy for the end-of-card balancer to even out
 *                the totals.
 *   "varied"   — pairs that span the full bucket (top quartile vs
 *                bottom quartile). Each round genuinely feels like
 *                two different puzzles; per-round wobbles are large
 *                but cancel out across the card. Also tightens the
 *                face-overlap filter to require zero shared faces.
 *
 * In every mode the totals across all rounds are still balanced by
 * `balanceExactly` / `balanceBySwapping` at the end of the pipeline.
 */
export type RoundVariance = "tight" | "balanced" | "varied";

export interface BalancedRollsOptions {
  readonly scoreOptions?: ExpectedScoreOptions;
  readonly rng?: () => number;
  readonly maxBalancingPasses?: number;
  /**
   * Controls how wide a difficulty range the stratifier draws from.
   *
   *   0   — legacy "easy half only" behavior. Round 1..N all draw
   *         from the easier half of the playable pool. Cards feel
   *         consistent but monotonous.
   *   0.5 — middle of the road. Picks span roughly the easier 75% of
   *         the pool.
   *   1   — full stratification. Round 1 = easiest tier, round N =
   *         hardest, intermediates spread evenly. Maximum variety.
   *
   * Default `1` matches the v3.1 shipped behavior. Values outside
   * `[0, 1]` are clamped.
   */
  readonly spice?: number;
  /**
   * Per-round variance between P1's and P2's rolls. Default
   * `"balanced"`. See `RoundVariance` for what each level does.
   */
  readonly variance?: RoundVariance;
}

export interface RoundAssignment {
  readonly p1: DiceTriple;
  readonly p2: DiceTriple;
  readonly p1Difficulty: number;
  readonly p2Difficulty: number;
  readonly p1ExpectedScore: number;
  readonly p2ExpectedScore: number;
}

export interface BalancedRollsResult {
  readonly rounds: readonly RoundAssignment[];
  readonly p1TotalDifficulty: number;
  readonly p2TotalDifficulty: number;
  readonly difficultyDelta: number;
  readonly p1TotalExpectedScore: number;
  readonly p2TotalExpectedScore: number;
  readonly expectedScoreDelta: number;
}

export function generateBalancedRolls(
  board: readonly number[],
  candidates: readonly DiceTriple[],
  rounds: number,
  resolver: DifficultyResolver,
  options: BalancedRollsOptions = {},
): BalancedRollsResult {
  if (rounds < 1) {
    throw new RangeError(`rounds must be >= 1 (got ${rounds})`);
  }
  if (board.length !== BOARD.size) {
    throw new RangeError(
      `board must contain ${BOARD.size} cells (got ${board.length})`,
    );
  }
  if (candidates.length < rounds * 2) {
    throw new RangeError(
      `candidate pool too small: need >= ${rounds * 2} dice triples for ` +
        `${rounds} rounds (got ${candidates.length})`,
    );
  }

  const rng = options.rng ?? Math.random;
  const ranked = rankCandidates(board, candidates, resolver, options.scoreOptions);

  // Drop only the truly broken triples (>50% of cells unreachable). Keeping
  // the rest gives the stratifier a meaningful "hard" tier while still
  // protecting players from rolls that have ~no path to a competitive score.
  const halfBoard = BOARD.size / 2;
  const playable = ranked.filter((r) => r.impossibleCount < halfBoard);
  const pool = playable.length >= rounds * 2 ? playable : ranked;

  const byDifficulty = [...pool].sort(compareByDifficultyThenScore);

  // Stratify across the difficulty distribution. Each round draws from a
  // distinct slice of the pool so the final card has a deliberate spread:
  // round 1 = easiest tier, last round = hardest, intermediates in between.
  // The `spice` knob narrows or widens the slice the stratifier looks
  // at — `spice=0` recovers the legacy "easy half only" feel,
  // `spice=1` uses the entire playable pool.
  const spice = clamp01(options.spice ?? 1);
  const upperFraction = 0.5 + 0.5 * spice;
  const stratifiable = byDifficulty.slice(
    0,
    Math.max(rounds * 2, Math.floor(byDifficulty.length * upperFraction)),
  );

  const buckets: RankedCandidate[][] = [];
  const baseSize = Math.floor(stratifiable.length / rounds);
  let cursor = 0;
  for (let i = 0; i < rounds; i += 1) {
    const isLast = i === rounds - 1;
    const end = isLast ? stratifiable.length : cursor + baseSize;
    buckets.push(stratifiable.slice(cursor, end));
    cursor = end;
  }

  // Within each bucket, find the most balanced pair (closest expected
  // scores) and add a touch of randomness so re-rolling produces variety
  // without sacrificing fairness.
  const variance: RoundVariance = options.variance ?? "balanced";
  const usedDice = new Set<string>();
  const pairs: Array<readonly [RankedCandidate, RankedCandidate]> = [];
  for (const bucket of buckets) {
    const fresh = bucket.filter((c) => !usedDice.has(diceKey(c.dice)));
    const source = fresh.length >= 2 ? fresh : bucket;
    const pair = pickBalancedPair(source, rng, variance);
    if (pair === null) continue;
    pairs.push(pair);
    usedDice.add(diceKey(pair[0].dice));
    usedDice.add(diceKey(pair[1].dice));
  }

  if (pairs.length < rounds) {
    throw new RangeError(
      `not enough candidates for ${rounds} stratified rounds (got ` +
        `${pairs.length}); widen the candidate pool or shrink rounds`,
    );
  }

  const assignments: RoundAssignment[] = pairs.map((pair, idx) => {
    const [higherScore, lowerScore] = pair;
    const p1GetsHigherScore = idx % 2 === 0;
    const p1 = p1GetsHigherScore ? higherScore : lowerScore;
    const p2 = p1GetsHigherScore ? lowerScore : higherScore;
    return {
      p1: p1.dice,
      p2: p2.dice,
      p1Difficulty: p1.boardDifficulty,
      p2Difficulty: p2.boardDifficulty,
      p1ExpectedScore: p1.expectedScore,
      p2ExpectedScore: p2.expectedScore,
    };
  });

  const balanced = balanceBySwapping(assignments, options.maxBalancingPasses ?? 8);

  let p1Sum = 0;
  let p2Sum = 0;
  let p1Score = 0;
  let p2Score = 0;
  for (const r of balanced) {
    p1Sum += r.p1Difficulty;
    p2Sum += r.p2Difficulty;
    p1Score += r.p1ExpectedScore;
    p2Score += r.p2ExpectedScore;
  }

  return {
    rounds: balanced,
    p1TotalDifficulty: round2(p1Sum),
    p2TotalDifficulty: round2(p2Sum),
    difficultyDelta: round2(p1Sum - p2Sum),
    p1TotalExpectedScore: round2(p1Score),
    p2TotalExpectedScore: round2(p2Score),
    expectedScoreDelta: round2(p1Score - p2Score),
  };
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function compareByExpectedScoreThenDifficulty(
  a: RankedCandidate,
  b: RankedCandidate,
): number {
  return (
    b.expectedScore - a.expectedScore ||
    a.boardDifficulty - b.boardDifficulty ||
    a.impossibleCount - b.impossibleCount
  );
}

function compareByDifficultyThenScore(
  a: RankedCandidate,
  b: RankedCandidate,
): number {
  return (
    a.boardDifficulty - b.boardDifficulty ||
    b.expectedScore - a.expectedScore ||
    a.impossibleCount - b.impossibleCount
  );
}

function diceKey(dice: DiceTriple): string {
  return `${dice[0]}-${dice[1]}-${dice[2]}`;
}

/**
 * Maximum number of dice face values P1 and P2 may share in a single
 * round. When two boards share two faces (e.g. `9 17 20` vs `3 17 20`)
 * the second player can largely mirror the first player's spoken
 * equations, leaking the answers. Capping the overlap at one face
 * forces the rolls to feel meaningfully different across the table.
 */
const MAX_SHARED_FACES_PER_ROUND = 1;

/**
 * Count how many dice face values appear in both triples, treating
 * multiplicity correctly (e.g. `[8, 8, 10]` vs `[8, 9, 10]` → 2).
 */
function sharedFaceCount(a: DiceTriple, b: DiceTriple): number {
  const remaining = [b[0], b[1], b[2]];
  let shared = 0;
  for (const face of a) {
    const idx = remaining.indexOf(face);
    if (idx !== -1) {
      shared += 1;
      remaining.splice(idx, 1);
    }
  }
  return shared;
}

/**
 * Within a single difficulty bucket, build the candidate pair set
 * appropriate for the requested per-round variance level, drop pairs
 * that share too many dice faces (gameplay leak — see
 * `MAX_SHARED_FACES_PER_ROUND`), and sample one for the round.
 *
 * Pair construction by `variance`:
 *
 *   "tight"    — every adjacent pair in the score-sorted bucket.
 *                Smallest possible per-round score gap. Sampling
 *                ranks by smallest gap.
 *
 *   "balanced" — pairs that span ~33% of the bucket, drawn from the
 *                lower third × upper third by score. Visibly different
 *                rolls per round, with the end-of-card balancer
 *                cancelling the per-round wobbles in the totals.
 *                Sampling ranks by largest gap so the more "varied"
 *                pairs land first.
 *
 *   "varied"   — pairs that span the full bucket, drawn from the
 *                bottom quartile × top quartile. Each round genuinely
 *                feels like two different puzzles. Tighter face-overlap
 *                requirement (zero shared faces preferred).
 *
 * Face filter: `varied` prefers zero shared faces; `tight` and
 * `balanced` permit up to `MAX_SHARED_FACES_PER_ROUND` (=1). In both
 * cases we fall back to the looser filter if the strict one empties
 * the candidate list, so generation never fails on a narrow bucket.
 *
 * In every mode we sample uniformly from the top third of the ranked
 * candidates so re-rolling produces variety without sacrificing the
 * intended per-round behavior.
 *
 * Returns `null` only when the bucket has fewer than 2 candidates.
 */
function pickBalancedPair(
  bucket: readonly RankedCandidate[],
  rng: () => number,
  variance: RoundVariance,
): readonly [RankedCandidate, RankedCandidate] | null {
  if (bucket.length < 2) return null;
  const sorted = [...bucket].sort(compareByExpectedScoreThenDifficulty);
  // `compareByExpectedScoreThenDifficulty` sorts highest-score-first;
  // re-sort ascending here so the index math below reads naturally
  // (low = lower-scoring rolls, high = higher-scoring rolls).
  const ascending = [...sorted].reverse();

  const pairs: Array<{
    pair: readonly [RankedCandidate, RankedCandidate];
    gap: number;
  }> = [];

  if (variance === "tight") {
    for (let i = 0; i + 1 < ascending.length; i += 1) {
      const a = ascending[i]!;
      const b = ascending[i + 1]!;
      pairs.push({
        pair: [a, b] as const,
        gap: Math.abs(a.expectedScore - b.expectedScore),
      });
    }
    // Smallest gap first.
    pairs.sort((x, y) => x.gap - y.gap);
  } else {
    // Split the bucket into a low slice and a high slice and pair
    // across the divide. The slice width is wider for `varied` so
    // the per-round score spread is genuinely large.
    const sliceFraction = variance === "varied" ? 0.25 : 0.34;
    const sliceSize = Math.max(
      1,
      Math.floor(ascending.length * sliceFraction),
    );
    const low = ascending.slice(0, sliceSize);
    const high = ascending.slice(ascending.length - sliceSize);
    for (const a of low) {
      for (const b of high) {
        if (a === b) continue;
        pairs.push({
          pair: [a, b] as const,
          gap: Math.abs(a.expectedScore - b.expectedScore),
        });
      }
    }
    // Largest gap first — we *want* the spread for these modes.
    pairs.sort((x, y) => y.gap - x.gap);
  }

  // Safety net: if the bucket was so small that the slice math above
  // yielded no cross-slice pairs, fall back to adjacent pairs.
  if (pairs.length === 0) {
    for (let i = 0; i + 1 < ascending.length; i += 1) {
      const a = ascending[i]!;
      const b = ascending[i + 1]!;
      pairs.push({
        pair: [a, b] as const,
        gap: Math.abs(a.expectedScore - b.expectedScore),
      });
    }
    pairs.sort((x, y) => x.gap - y.gap);
  }

  const strictMaxFaces = variance === "varied" ? 0 : MAX_SHARED_FACES_PER_ROUND;
  const strict = pairs.filter(
    ({ pair }) => sharedFaceCount(pair[0].dice, pair[1].dice) <= strictMaxFaces,
  );
  let candidates = strict;
  if (candidates.length === 0) {
    // Loosen `varied` to the standard cap before we fall all the way
    // back to the unfiltered set — keeps the leak filter active.
    const loose = pairs.filter(
      ({ pair }) =>
        sharedFaceCount(pair[0].dice, pair[1].dice) <= MAX_SHARED_FACES_PER_ROUND,
    );
    candidates = loose.length > 0 ? loose : pairs;
  }

  // NOTE: order matters — `Math.min(candidates.length, …)` must be the
  // outer cap. Earlier versions wrote `Math.max(2, Math.min(…))`, which
  // forced sampleSize >= 2 even when only one filtered pair survived
  // in a bucket, and `pickIdx` could index past the array → throw
  // "Cannot read properties of undefined (reading 'pair')".
  const sampleSize = Math.min(
    candidates.length,
    Math.max(2, Math.ceil(candidates.length / 3)),
  );
  const pickIdx = Math.min(Math.floor(rng() * sampleSize), sampleSize - 1);
  const picked = candidates[pickIdx]!.pair;
  // Caller (`generateBalancedRolls`) expects `[higherScore, lowerScore]`
  // so its `idx % 2 === 0` alternation gives an even prior over which
  // player starts with the score advantage. Normalize here so every
  // variance branch returns the same tuple convention.
  return picked[0].expectedScore >= picked[1].expectedScore
    ? picked
    : ([picked[1], picked[0]] as const);
}

function balanceBySwapping(
  rounds: readonly RoundAssignment[],
  maxPasses: number,
): RoundAssignment[] {
  const exact = balanceExactly(rounds);
  if (exact !== null) return exact;

  const out: RoundAssignment[] = rounds.map((r) => ({ ...r }));

  const sumDeltas = (
    rs: readonly RoundAssignment[],
  ): { expectedScore: number; difficulty: number } => {
    let p1 = 0;
    let p2 = 0;
    let p1Difficulty = 0;
    let p2Difficulty = 0;
    for (const r of rs) {
      p1 += r.p1ExpectedScore;
      p2 += r.p2ExpectedScore;
      p1Difficulty += r.p1Difficulty;
      p2Difficulty += r.p2Difficulty;
    }
    return {
      expectedScore: Math.abs(p1 - p2),
      difficulty: Math.abs(p1Difficulty - p2Difficulty),
    };
  };

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let improved = false;
    let bestDelta = sumDeltas(out);
    for (let i = 0; i < out.length; i += 1) {
      const swapped = swapRound(out[i]!);
      const trial = [...out];
      trial[i] = swapped;
      const trialDelta = sumDeltas(trial);
      if (
        trialDelta.expectedScore < bestDelta.expectedScore ||
        (trialDelta.expectedScore === bestDelta.expectedScore &&
          trialDelta.difficulty < bestDelta.difficulty)
      ) {
        out[i] = swapped;
        bestDelta = trialDelta;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return out;
}

function balanceExactly(rounds: readonly RoundAssignment[]): RoundAssignment[] | null {
  const MAX_EXACT_ROUNDS = 16;
  if (rounds.length === 0 || rounds.length > MAX_EXACT_ROUNDS) {
    return null;
  }

  let bestMask = 0;
  let bestExpectedDelta = Number.POSITIVE_INFINITY;
  let bestDifficultyDelta = Number.POSITIVE_INFINITY;
  const combinations = 1 << rounds.length;

  for (let mask = 0; mask < combinations; mask += 1) {
    let p1Score = 0;
    let p2Score = 0;
    let p1Difficulty = 0;
    let p2Difficulty = 0;

    for (let i = 0; i < rounds.length; i += 1) {
      const round = rounds[i]!;
      const swapped = (mask & (1 << i)) !== 0;
      if (swapped) {
        p1Score += round.p2ExpectedScore;
        p2Score += round.p1ExpectedScore;
        p1Difficulty += round.p2Difficulty;
        p2Difficulty += round.p1Difficulty;
      } else {
        p1Score += round.p1ExpectedScore;
        p2Score += round.p2ExpectedScore;
        p1Difficulty += round.p1Difficulty;
        p2Difficulty += round.p2Difficulty;
      }
    }

    const expectedDelta = Math.abs(p1Score - p2Score);
    const difficultyDelta = Math.abs(p1Difficulty - p2Difficulty);
    if (
      expectedDelta < bestExpectedDelta ||
      (expectedDelta === bestExpectedDelta &&
        difficultyDelta < bestDifficultyDelta)
    ) {
      bestMask = mask;
      bestExpectedDelta = expectedDelta;
      bestDifficultyDelta = difficultyDelta;
    }
  }

  return rounds.map((round, i) =>
    (bestMask & (1 << i)) !== 0 ? swapRound(round) : { ...round },
  );
}

function swapRound(r: RoundAssignment): RoundAssignment {
  return {
    p1: r.p2,
    p2: r.p1,
    p1Difficulty: r.p2Difficulty,
    p2Difficulty: r.p1Difficulty,
    p1ExpectedScore: r.p2ExpectedScore,
    p2ExpectedScore: r.p1ExpectedScore,
  };
}
