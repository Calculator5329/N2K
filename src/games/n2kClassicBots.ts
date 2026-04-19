/**
 * Bot {@link Player} implementations for N2K Classic.
 *
 * `LocalBot` reads a {@link Persona} and chooses moves that fit the
 * persona's difficulty target. Picks are deterministic given a seeded
 * RNG so multiplayer replays of bot-vs-bot sessions are reproducible.
 *
 * `RandomLegalPlayer` (stretch goal) picks uniformly at random from
 * `legal`. Useful for fuzz-testing the game rules.
 */
import {
  buildAllBasesCache,
  difficultyOfEquation,
} from "../services/difficulty.js";
import type { Mode } from "../core/types.js";
import type { Player, PlayerId } from "../services/gameKernel.js";
import type {
  N2KClassicMove,
  N2KClassicState,
} from "./n2kClassic.js";
import type { Persona } from "./personas.js";

// ---------------------------------------------------------------------------
//  RNG helper — small mulberry32 so seeded runs are reproducible
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
//  Move scoring
// ---------------------------------------------------------------------------

interface ScoredClaim {
  readonly move: Extract<N2KClassicMove, { kind: "claim" }>;
  readonly difficulty: number;
}

function scoreClaims(
  legal: readonly N2KClassicMove[],
  mode: Mode,
): ScoredClaim[] {
  const out: ScoredClaim[] = [];
  for (const m of legal) {
    if (m.kind !== "claim") continue;
    const cache = buildAllBasesCache(m.equation.dice, mode);
    out.push({ move: m, difficulty: difficultyOfEquation(m.equation, mode, cache) });
  }
  return out;
}

// ---------------------------------------------------------------------------
//  LocalBot
// ---------------------------------------------------------------------------

export interface LocalBotOptions {
  readonly persona: Persona;
  readonly id: PlayerId;
  /** Override displayName; defaults to `persona.displayName`. */
  readonly displayName?: string;
  /** Optional RNG seed for deterministic mistake/jitter behavior. */
  readonly rngSeed?: number;
  /**
   * Override `setTimeout` for tests that don't want to wait for
   * `persona.thinkMs`. Defaults to the global `setTimeout`.
   */
  readonly delay?: (ms: number) => Promise<void>;
}

export class LocalBot implements Player {
  readonly id: PlayerId;
  readonly displayName: string;
  readonly persona: Persona;
  private readonly rng: () => number;
  private readonly delay: (ms: number) => Promise<void>;

  constructor(opts: LocalBotOptions) {
    this.id = opts.id;
    this.displayName = opts.displayName ?? opts.persona.displayName;
    this.persona = opts.persona;
    this.rng = opts.rngSeed === undefined ? Math.random : mulberry32(opts.rngSeed);
    this.delay =
      opts.delay ??
      ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  }

  async pickMove(
    rawState: unknown,
    rawLegal: readonly unknown[],
  ): Promise<N2KClassicMove> {
    const state = rawState as N2KClassicState;
    const legal = rawLegal as readonly N2KClassicMove[];
    if (legal.length === 0) {
      throw new Error(`LocalBot(${this.id}): no legal moves available`);
    }

    const move = this.selectMove(state, legal);

    // Synthetic think latency + tiny jitter so two same-persona bots
    // don't fire at the exact same moment.
    const jitter = Math.floor(this.rng() * 80);
    await this.delay(this.persona.thinkMs + jitter);
    return move;
  }

  /** Pure pick — exposed for unit tests so they can avoid the timer. */
  selectMove(
    state: N2KClassicState,
    legal: readonly N2KClassicMove[],
  ): N2KClassicMove {
    const passMove: N2KClassicMove = { kind: "pass" };
    const claims = scoreClaims(legal, state.config.mode);

    // No claims at all → must pass.
    if (claims.length === 0) return passMove;

    // Filter to moves within the persona's difficulty target.
    const inBand = claims.filter(
      (c) =>
        c.difficulty >= this.persona.difficultyTarget.min &&
        c.difficulty <= this.persona.difficultyTarget.max,
    );

    // Below the pass threshold? Keep them. Above? Drop them.
    const playable = inBand.filter((c) => c.difficulty <= this.persona.passThreshold);

    if (playable.length === 0) {
      // Nothing inside the comfort zone — pass rather than gamble.
      return passMove;
    }

    // Sort easiest → hardest so the persona's preference stays stable.
    const sorted = playable.slice().sort((a, b) => a.difficulty - b.difficulty);

    // Mistake: occasionally pick a sub-optimal (random) playable move
    // instead of the easiest. The mistake is bounded to playable moves
    // so a "mistake" still respects the pass threshold.
    if (sorted.length > 1 && this.rng() < this.persona.mistakeRate) {
      const idx = 1 + Math.floor(this.rng() * (sorted.length - 1));
      return sorted[idx]!.move;
    }

    return sorted[0]!.move;
  }
}

// ---------------------------------------------------------------------------
//  RandomLegalPlayer (stretch — useful for fuzz testing)
// ---------------------------------------------------------------------------

export class RandomLegalPlayer implements Player {
  readonly id: PlayerId;
  readonly displayName: string;
  private readonly rng: () => number;

  constructor(id: PlayerId, opts: { displayName?: string; rngSeed?: number } = {}) {
    this.id = id;
    this.displayName = opts.displayName ?? `Random ${id}`;
    this.rng = opts.rngSeed === undefined ? Math.random : mulberry32(opts.rngSeed);
  }

  async pickMove(
    _state: unknown,
    rawLegal: readonly unknown[],
  ): Promise<N2KClassicMove> {
    const legal = rawLegal as readonly N2KClassicMove[];
    if (legal.length === 0) {
      throw new Error(`RandomLegalPlayer(${this.id}): no legal moves available`);
    }
    const idx = Math.floor(this.rng() * legal.length);
    return legal[idx]!;
  }
}
