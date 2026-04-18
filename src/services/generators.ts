/**
 * Board and dice generators.
 *
 * Mode-aware: defaults pull from `mode.targetRange` and `mode.diceRange`
 * when the caller doesn't override. Mode-specific legality rules
 * (e.g. standard mode rejecting all-same triples) live in
 * {@link isLegalDiceForMode} so future custom modes can register
 * their own predicate at the content layer.
 *
 * NOTE (v2 Phase 0): the rich `BoardSpec` / overrides / pin-validation
 * helpers from v1 will be ported here in Phase 4 alongside the Compose
 * feature. This file currently provides the foundational primitives
 * everything else builds on.
 */
import { BOARD } from "../core/constants.js";
import type { Mode } from "../core/types.js";

// ---------------------------------------------------------------------------
//  Random helpers
// ---------------------------------------------------------------------------

/** Inclusive integer in `[min, max]`. */
export function randomInt(
  min: number,
  max: number,
  rng: () => number = Math.random,
): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
//  Mode-aware legality
// ---------------------------------------------------------------------------

/**
 * Mode-specific legality predicate for a dice tuple.
 *
 *   - Standard: no all-same triple, no 2+ ones (matches v1).
 *   - Æther: every combination is legal — negative bases and high
 *     arities are the whole point.
 *   - Custom: defaults to "anything goes". Custom modes that need
 *     stricter rules should layer a validator at the content layer.
 */
export function isLegalDiceForMode(
  dice: readonly number[],
  mode: Mode,
): boolean {
  if (mode.id === "standard") {
    if (dice.length !== 3) return false;
    const [a, b, c] = dice as readonly [number, number, number];
    if (a === b && b === c) return false;
    const ones = (a === 1 ? 1 : 0) + (b === 1 ? 1 : 0) + (c === 1 ? 1 : 0);
    if (ones >= 2) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
//  Boards
// ---------------------------------------------------------------------------

/**
 * Generate a `BOARD.size`-cell board of unique random integers in the
 * mode's target range (or a caller-supplied sub-range), sorted
 * ascending. Throws if the range can't accommodate `BOARD.size`
 * unique values.
 */
export function generateRandomBoard(
  mode: Mode,
  options: {
    readonly range?: { readonly min: number; readonly max: number };
    readonly rng?: () => number;
  } = {},
): number[] {
  const { range = mode.targetRange, rng = Math.random } = options;
  if (range.max < range.min) {
    throw new RangeError(`max (${range.max}) must be >= min (${range.min})`);
  }
  if (range.max - range.min + 1 < BOARD.size) {
    throw new RangeError(
      `range [${range.min}, ${range.max}] has fewer than ${BOARD.size} integers; cannot fit a unique board`,
    );
  }
  const seen = new Set<number>();
  while (seen.size < BOARD.size) {
    seen.add(randomInt(range.min, range.max, rng));
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Generate a board of values following an arithmetic pattern. Mode-
 * agnostic (the resulting values are not constrained to mode bounds —
 * caller's responsibility).
 *
 *   - 1 multiple: simple arithmetic progression.
 *   - 2 multiples: alternating progression (pairs).
 *   - 3 multiples: triple-step progression (triples).
 */
export function generatePatternBoard(
  multiples: readonly number[] = [6],
  startingNumber = 6,
): number[] {
  if (multiples.length === 0 || multiples.length > 3) {
    throw new RangeError(
      `multiples must have 1, 2, or 3 elements (got ${multiples.length})`,
    );
  }

  if (multiples.length === 1) {
    const step = multiples[0]!;
    const out: number[] = new Array(BOARD.size);
    for (let i = 0; i < BOARD.size; i += 1) out[i] = startingNumber + i * step;
    return out;
  }

  if (multiples.length === 2) {
    const stepA = multiples[0]!;
    const stepB = multiples[1]!;
    const out: number[] = [];
    for (let i = 0; i < BOARD.size / 2; i += 1) {
      const base = startingNumber + i * (stepA + stepB);
      out.push(base, base + stepA);
    }
    return out;
  }

  // 3 multiples — Python parity: each round advances by a+b+c, emitting
  // base, base+a, base+a+b. Adjusts the starting number to keep all
  // values non-negative when the multiples include negatives.
  const stepA = multiples[0]!;
  const stepB = multiples[1]!;
  const stepC = multiples[2]!;
  let mostNegative = 0;
  for (const m of multiples) if (m < 0) mostNegative += m;
  const safeStart = startingNumber - mostNegative;

  const out: number[] = [];
  const groupCount = Math.floor(BOARD.size / 3);
  for (let i = 0; i < groupCount; i += 1) {
    const base = safeStart + i * (stepA + stepB + stepC);
    out.push(base, base + stepA, base + stepA + stepB);
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Dice rolls
// ---------------------------------------------------------------------------

/**
 * Roll N dice, each uniformly drawn from the mode's dice range.
 * Re-rolls until {@link isLegalDiceForMode} accepts the result.
 *
 * Standard mode: arity is forced to 3 (its only allowed arity).
 * Æther mode: arity defaults to 3 unless the caller specifies one of
 * `mode.arities`.
 */
export function generateRandomDice(
  mode: Mode,
  options: {
    readonly arity?: number;
    readonly range?: { readonly min: number; readonly max: number };
    readonly rng?: () => number;
  } = {},
): number[] {
  const { range = mode.diceRange, rng = Math.random } = options;
  const arity = options.arity ?? mode.arities[0]!;
  if (!mode.arities.includes(arity as 3 | 4 | 5)) {
    throw new RangeError(
      `generateRandomDice: arity ${arity} not allowed by mode "${mode.id}"`,
    );
  }
  const roll = (): number[] => {
    const out: number[] = new Array(arity);
    for (let i = 0; i < arity; i += 1) out[i] = randomInt(range.min, range.max, rng);
    return out;
  };
  let dice = roll();
  // Bound the retry loop so a pathological mode (e.g. one whose legality
  // predicate rejects everything) fails loudly instead of hanging.
  for (let attempts = 0; attempts < 1000 && !isLegalDiceForMode(dice, mode); attempts += 1) {
    dice = roll();
  }
  if (!isLegalDiceForMode(dice, mode)) {
    throw new Error(
      `generateRandomDice: could not find a legal roll for mode "${mode.id}" after 1000 attempts`,
    );
  }
  return dice;
}
