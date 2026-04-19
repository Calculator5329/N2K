/**
 * N2K Classic — the original solo + bot board game implemented against
 * the kernel's {@link Game} contract.
 *
 * One match: a rectangular `Board` of integer targets, a fixed dice
 * pool rolled at session start, and N players taking turns. On each
 * turn the active player either *claims* an unclaimed cell by
 * supplying an equation that uses the dice pool to evaluate to that
 * cell's target, or *passes*. The game ends when the board is full,
 * an optional turn limit is reached, or every player passes their
 * full last round.
 *
 * Each player has a per-match `timeBudget` (default 60 seconds).
 * Claiming a cell costs `difficultyOfEquation(eq, mode)` seconds —
 * the heuristic doubles as a "seconds to solve" estimate. Claims
 * whose difficulty exceeds `hardSkipThreshold` (default 10) or the
 * player's remaining budget are not legal. Score per player is
 * simply `Σ board.cells[i]` over the cells they claimed — the
 * difficulty cost was already paid in time. This mirrors v1's
 * `expectedScore` heuristic but applied as live game rules.
 *
 * All transitions are pure: `applyMove(state, …)` returns a fresh
 * `N2KClassicState`. The kernel's `replay()` reconstructs any
 * intermediate state from `(config, players, log)`.
 */
import type { Board, Mode, NEquation } from "../core/types.js";
import { FLOAT_EQ_EPSILON } from "../core/constants.js";
import { applyOperator, unorderedSubsets } from "../services/arithmetic.js";
import {
  buildAllBasesCache,
  difficultyOfEquation,
} from "../services/difficulty.js";
import { allSolutions } from "../services/solver.js";
import type {
  Game,
  PlayerId,
  PlayerSlot,
} from "../services/gameKernel.js";
import {
  serializeState,
  deserializeState,
} from "./n2kClassicSerializer.js";

// ---------------------------------------------------------------------------
//  Public types
// ---------------------------------------------------------------------------

export interface N2KClassicConfig {
  readonly board: Board;
  readonly mode: Mode;
  /** Dice rolled at session start; reused every turn (single-roll variant). */
  readonly initialDicePool: readonly number[];
  /** Optional per-player turn cap. The match ends once every player has played this many turns. */
  readonly turnLimit?: number;
  /** Seed for any future per-turn dice re-rolls (multi-roll variants). */
  readonly rngSeed?: number;
  /** Per-player time budget in "difficulty seconds". Default {@link DEFAULT_TIME_BUDGET}. */
  readonly timeBudget?: number;
  /** Difficulty above which a claim is filtered out of `legalMoves`. Default {@link DEFAULT_HARD_SKIP_THRESHOLD}. */
  readonly hardSkipThreshold?: number;
}

/** Default per-player time budget, in difficulty units / seconds. */
export const DEFAULT_TIME_BUDGET = 60;

/**
 * Default cutoff above which an equation is considered "too hard to attempt"
 * within any sensible budget. Matches v1's `expectedScore` heuristic.
 */
export const DEFAULT_HARD_SKIP_THRESHOLD = 10;

export function effectiveTimeBudget(config: N2KClassicConfig): number {
  return config.timeBudget ?? DEFAULT_TIME_BUDGET;
}

export function effectiveHardSkip(config: N2KClassicConfig): number {
  return config.hardSkipThreshold ?? DEFAULT_HARD_SKIP_THRESHOLD;
}

export interface ClaimedCell {
  readonly byPlayer: PlayerId;
  readonly equation: NEquation;
  readonly difficulty: number;
}

export interface N2KClassicState {
  readonly config: N2KClassicConfig;
  readonly playerIds: readonly PlayerId[];
  readonly dicePool: readonly number[];
  readonly claimed: ReadonlyMap<number, ClaimedCell>;
  readonly currentPlayerIdx: number;
  readonly turn: number;
  /**
   * Per-player count of consecutive passes ending on their last
   * action. Resets to 0 the moment a player claims. Used by
   * {@link n2kClassicGame.isTerminal} to end the match when every
   * seat passes through a full round.
   */
  readonly consecutivePasses: ReadonlyMap<PlayerId, number>;
  /**
   * Per-player remaining time budget, in difficulty units / seconds.
   * Initialized to `effectiveTimeBudget(config)` for every player and
   * decremented by `claim.difficulty` on each successful claim.
   */
  readonly remainingBudget: ReadonlyMap<PlayerId, number>;
}

export type N2KClassicMove =
  | { readonly kind: "claim"; readonly cellIndex: number; readonly equation: NEquation }
  | { readonly kind: "pass" };

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Evaluate an equation strictly left-to-right with mode-agnostic arithmetic. */
export function evaluateEquation(eq: NEquation): number {
  const { dice, exps, ops } = eq;
  let acc = Math.pow(dice[0]!, exps[0]!);
  for (let i = 0; i < ops.length; i += 1) {
    const next = Math.pow(dice[i + 1]!, exps[i + 1]!);
    acc = applyOperator(acc, next, ops[i]!);
  }
  return acc;
}

/** True iff the equation's dice values are a multiset subset of the pool. */
function diceMultisetSubset(
  eqDice: readonly number[],
  pool: readonly number[],
): boolean {
  const remaining = new Map<number, number>();
  for (const d of pool) remaining.set(d, (remaining.get(d) ?? 0) + 1);
  for (const d of eqDice) {
    const count = remaining.get(d) ?? 0;
    if (count === 0) return false;
    remaining.set(d, count - 1);
  }
  return true;
}

/** Validate equation arity matches the mode's allowed arities and lengths align. */
function validateEquationShape(eq: NEquation, mode: Mode): void {
  if (
    eq.dice.length !== eq.exps.length ||
    eq.ops.length !== eq.dice.length - 1
  ) {
    throw new Error(
      `n2kClassic: equation shape invalid (dice=${eq.dice.length}, exps=${eq.exps.length}, ops=${eq.ops.length})`,
    );
  }
  if (!mode.arities.includes(eq.dice.length as 3 | 4 | 5)) {
    throw new Error(
      `n2kClassic: arity ${eq.dice.length} not allowed by mode "${mode.id}"`,
    );
  }
}

/**
 * Enumerate every distinct equation that uses some allowed-arity subset
 * of `dicePool` and evaluates to `target`. For standard mode (one
 * arity = 3), this is just `allSolutions(dicePool, target, mode)`. For
 * Æther mode, we sum across each arity in `mode.arities`, enumerating
 * unordered subsets of that size.
 */
export function enumerateClaimEquations(
  dicePool: readonly number[],
  target: number,
  mode: Mode,
): NEquation[] {
  const out: NEquation[] = [];
  const seen = new Set<string>();
  // Smallest arity first so the easiest-form solutions surface earliest;
  // ordering only matters for callers that scan the list.
  const sortedArities = [...mode.arities].sort((a, b) => a - b);
  for (const arity of sortedArities) {
    if (dicePool.length < arity) continue;
    if (dicePool.length === arity) {
      pushUnique(out, seen, allSolutions(dicePool, target, mode));
      continue;
    }
    for (const subset of unorderedSubsets(dicePool, arity)) {
      pushUnique(out, seen, allSolutions(subset, target, mode));
    }
  }
  return out;
}

function pushUnique(
  out: NEquation[],
  seen: Set<string>,
  candidates: readonly NEquation[],
): void {
  for (const eq of candidates) {
    const key = `${eq.dice.join(",")}|${eq.exps.join(",")}|${eq.ops.join(",")}|${eq.total}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(eq);
  }
}

function advanceTurn(
  state: N2KClassicState,
  nextClaimed: ReadonlyMap<number, ClaimedCell>,
  nextPasses: ReadonlyMap<PlayerId, number>,
  nextBudget: ReadonlyMap<PlayerId, number>,
): N2KClassicState {
  const nextIdx = (state.currentPlayerIdx + 1) % state.playerIds.length;
  return {
    config: state.config,
    playerIds: state.playerIds,
    dicePool: state.dicePool,
    claimed: nextClaimed,
    currentPlayerIdx: nextIdx,
    turn: state.turn + 1,
    consecutivePasses: nextPasses,
    remainingBudget: nextBudget,
  };
}

// ---------------------------------------------------------------------------
//  Internal initial-state factory shared with the serializer
// ---------------------------------------------------------------------------

export function buildInitialState(
  config: N2KClassicConfig,
  players: readonly PlayerSlot[],
): N2KClassicState {
  if (players.length < n2kClassicGame.minPlayers || players.length > n2kClassicGame.maxPlayers) {
    throw new RangeError(
      `n2kClassic.init: ${players.length} players is outside [${n2kClassicGame.minPlayers}, ${n2kClassicGame.maxPlayers}]`,
    );
  }
  if (config.board.cells.length !== config.board.rows * config.board.cols) {
    throw new RangeError(
      `n2kClassic.init: board cells (${config.board.cells.length}) != rows*cols (${config.board.rows * config.board.cols})`,
    );
  }
  if (config.initialDicePool.length === 0) {
    throw new RangeError("n2kClassic.init: initialDicePool must not be empty");
  }
  const playerIds = players.map((p) => p.id);
  const consecutivePasses = new Map<PlayerId, number>();
  const remainingBudget = new Map<PlayerId, number>();
  const budget = effectiveTimeBudget(config);
  for (const id of playerIds) {
    consecutivePasses.set(id, 0);
    remainingBudget.set(id, budget);
  }
  return {
    config,
    playerIds,
    dicePool: config.initialDicePool,
    claimed: new Map(),
    currentPlayerIdx: 0,
    turn: 0,
    consecutivePasses,
    remainingBudget,
  };
}

// ---------------------------------------------------------------------------
//  Game implementation
// ---------------------------------------------------------------------------

export const n2kClassicGame: Game<
  N2KClassicConfig,
  N2KClassicState,
  N2KClassicMove
> = {
  id: "n2k-classic",
  label: "N2K Classic",
  description:
    "Claim cells on a 6×6 board by combining the rolled dice pool into equations that hit each target.",
  minPlayers: 1,
  maxPlayers: 8,

  init(config, players) {
    return buildInitialState(config, players);
  },

  legalMoves(state, player) {
    if (n2kClassicGame.isTerminal(state)) return [];
    const current = n2kClassicGame.currentPlayer(state);
    if (current !== player) return [];

    const turnLimitReached =
      state.config.turnLimit !== undefined &&
      Math.floor(state.turn / state.playerIds.length) >= state.config.turnLimit;
    if (turnLimitReached) return [];

    const moves: N2KClassicMove[] = [{ kind: "pass" }];
    const { board, mode } = state.config;
    const hardSkip = effectiveHardSkip(state.config);
    const remaining = state.remainingBudget.get(player) ?? 0;
    const ceiling = Math.min(hardSkip, remaining);
    // Memoize enumeration per-target — duplicate target values on the
    // board would otherwise re-run the solver for each cell. The inner
    // arrays carry pre-computed difficulty so the budget filter is O(1).
    const cache = new Map<
      number,
      ReadonlyArray<{ readonly equation: NEquation; readonly difficulty: number }>
    >();
    for (let i = 0; i < board.cells.length; i += 1) {
      if (state.claimed.has(i)) continue;
      const target = board.cells[i]!;
      let entries = cache.get(target);
      if (entries === undefined) {
        const eqs = enumerateClaimEquations(state.dicePool, target, mode);
        const scored: Array<{ readonly equation: NEquation; readonly difficulty: number }> = [];
        for (const eq of eqs) {
          const basesCache = buildAllBasesCache(eq.dice, mode);
          const d = difficultyOfEquation(eq, mode, basesCache);
          scored.push({ equation: eq, difficulty: d });
        }
        entries = scored;
        cache.set(target, entries);
      }
      for (const entry of entries) {
        if (entry.difficulty > ceiling) continue;
        moves.push({ kind: "claim", cellIndex: i, equation: entry.equation });
      }
    }
    return moves;
  },

  applyMove(state, move, byPlayer) {
    const current = n2kClassicGame.currentPlayer(state);
    if (current !== byPlayer) {
      throw new Error(
        `n2kClassic.applyMove: it is ${current ?? "no one"}'s turn, not ${byPlayer}'s`,
      );
    }

    const nextPasses = new Map(state.consecutivePasses);

    if (move.kind === "pass") {
      nextPasses.set(byPlayer, (nextPasses.get(byPlayer) ?? 0) + 1);
      return advanceTurn(state, state.claimed, nextPasses, state.remainingBudget);
    }

    if (move.cellIndex < 0 || move.cellIndex >= state.config.board.cells.length) {
      throw new Error(
        `n2kClassic.applyMove: cellIndex ${move.cellIndex} out of bounds`,
      );
    }
    if (state.claimed.has(move.cellIndex)) {
      throw new Error(
        `n2kClassic.applyMove: cell ${move.cellIndex} already claimed`,
      );
    }

    const { board, mode } = state.config;
    const target = board.cells[move.cellIndex]!;
    const eq = move.equation;
    validateEquationShape(eq, mode);

    if (!diceMultisetSubset(eq.dice, state.dicePool)) {
      throw new Error(
        `n2kClassic.applyMove: equation dice ${JSON.stringify(eq.dice)} not a subset of pool ${JSON.stringify(state.dicePool)}`,
      );
    }
    if (eq.total !== target) {
      throw new Error(
        `n2kClassic.applyMove: equation total (${eq.total}) does not match cell target (${target})`,
      );
    }
    const evaluated = evaluateEquation(eq);
    if (Math.abs(evaluated - target) > FLOAT_EQ_EPSILON) {
      throw new Error(
        `n2kClassic.applyMove: equation evaluates to ${evaluated}, not ${target}`,
      );
    }

    const cache = buildAllBasesCache(eq.dice, mode);
    const difficulty = difficultyOfEquation(eq, mode, cache);

    const remaining = state.remainingBudget.get(byPlayer) ?? 0;
    if (difficulty > remaining + FLOAT_EQ_EPSILON) {
      throw new Error(
        `n2kClassic.applyMove: claim costs ${difficulty.toFixed(2)}s but ${byPlayer} has only ${remaining.toFixed(2)}s remaining`,
      );
    }

    const nextClaimed = new Map(state.claimed);
    nextClaimed.set(move.cellIndex, {
      byPlayer,
      equation: eq,
      difficulty,
    });
    nextPasses.set(byPlayer, 0);
    const nextBudget = new Map(state.remainingBudget);
    nextBudget.set(byPlayer, Math.max(0, remaining - difficulty));
    return advanceTurn(state, nextClaimed, nextPasses, nextBudget);
  },

  currentPlayer(state) {
    if (n2kClassicGame.isTerminal(state)) return null;
    return state.playerIds[state.currentPlayerIdx] ?? null;
  },

  isTerminal(state) {
    if (state.claimed.size === state.config.board.cells.length) return true;
    if (state.config.turnLimit !== undefined) {
      const fullRoundsPlayed = Math.floor(state.turn / state.playerIds.length);
      if (fullRoundsPlayed >= state.config.turnLimit) return true;
    }
    if (state.turn >= state.playerIds.length) {
      let allPassed = true;
      for (const id of state.playerIds) {
        if ((state.consecutivePasses.get(id) ?? 0) === 0) {
          allPassed = false;
          break;
        }
      }
      if (allPassed) return true;
    }
    return false;
  },

  score(state) {
    const out: Record<PlayerId, number> = {};
    for (const id of state.playerIds) out[id] = 0;
    for (const [cellIndex, claim] of state.claimed) {
      const target = state.config.board.cells[cellIndex]!;
      out[claim.byPlayer] = (out[claim.byPlayer] ?? 0) + target;
    }
    return out;
  },

  serialize(state) {
    return serializeState(state);
  },

  deserialize(raw) {
    return deserializeState(raw);
  },
};
