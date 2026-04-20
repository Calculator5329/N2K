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
//  BoardSpec — declarative board generation with per-cell overrides
//
//  Ported from N2K-v2/src/services/generators.ts so the Compose feature
//  in the web layer can keep its existing `generateBoard(spec)` call
//  shape after the @solver alias swap. v3's mode-aware
//  `generateRandomBoard(mode, options)` above remains the canonical
//  primitive — `generateBoard` is a v1-shaped wrapper around it that
//  also supports per-slot overrides.
// ---------------------------------------------------------------------------

/** A pinned board cell: at the given linear slot index, force this value. */
export interface BoardOverride {
  readonly slot: number;
  readonly value: number;
}

/** Random board spec: `BOARD.size` unique random ints in `[min, max]`. */
export interface RandomBoardSpec {
  readonly kind: "random";
  readonly range: { readonly min: number; readonly max: number };
  readonly overrides?: readonly BoardOverride[];
}

/** Pattern board spec: arithmetic progression with 1, 2, or 3 multiples. */
export interface PatternBoardSpec {
  readonly kind: "pattern";
  readonly multiples: readonly number[];
  readonly start: number;
  readonly overrides?: readonly BoardOverride[];
}

export type BoardSpec = RandomBoardSpec | PatternBoardSpec;

/**
 * Build a board from a {@link BoardSpec}, applying any per-slot overrides.
 *
 * No-overrides path returns the canonical sorted board (back-compat with
 * v2's `generateRandomBoard` / `generatePatternBoard`). With overrides,
 * the board is *positional* — pinned cells stay at the exact slot the
 * user clicked — but the remaining "fill" cells are sorted ascending
 * and dropped into the unpinned slots in row-major order. This keeps
 * the grid scannable (the user sees a near-monotonic ramp) while still
 * honoring pinned positions, which can interrupt the sequence.
 */
export function generateBoard(
  spec: BoardSpec,
  rng: () => number = Math.random,
): number[] {
  const overrides = spec.overrides ?? [];
  validateBoardOverrides(overrides);

  if (overrides.length === 0) {
    if (spec.kind === "random") {
      return generateRandomBoardLegacy(spec.range, rng);
    }
    return generatePatternBoard(spec.multiples, spec.start);
  }

  const overrideBySlot = new Map(overrides.map((o) => [o.slot, o.value] as const));
  const overrideValues = new Set(overrides.map((o) => o.value));
  const slotsToFill = BOARD.size - overrides.length;

  let fillValues: number[];
  if (spec.kind === "random") {
    fillValues = fillRandomAroundOverrides(
      spec.range.min,
      spec.range.max,
      slotsToFill,
      overrideValues,
      rng,
    );
  } else {
    const pattern = generatePatternBoard(spec.multiples, spec.start);
    fillValues = [];
    for (let slot = 0; slot < BOARD.size; slot += 1) {
      if (overrideBySlot.has(slot)) continue;
      const v = pattern[slot]!;
      if (overrideValues.has(v)) {
        throw new RangeError(
          `Override value ${v} collides with the natural pattern value at ` +
            `slot ${pattern.indexOf(v)}; pick a different override or pattern`,
        );
      }
      fillValues.push(v);
    }
  }

  // Sort the fill values ascending so the rendered grid reads
  // left-to-right, top-to-bottom in numeric order around the pins.
  // Pinned cells stay exactly where the user placed them and may
  // interrupt the monotonic ramp — that's intentional.
  const sortedFill = [...fillValues].sort((a, b) => a - b);

  const merged: number[] = new Array<number>(BOARD.size);
  let cursor = 0;
  for (let slot = 0; slot < BOARD.size; slot += 1) {
    const pinned = overrideBySlot.get(slot);
    if (pinned !== undefined) {
      merged[slot] = pinned;
    } else {
      merged[slot] = sortedFill[cursor]!;
      cursor += 1;
    }
  }

  if (new Set(merged).size !== merged.length) {
    throw new RangeError(
      `Board contains duplicate values after applying overrides; ` +
        `pick override values that don't collide with the generated cells`,
    );
  }

  return merged;
}

function generateRandomBoardLegacy(
  range: { readonly min: number; readonly max: number },
  rng: () => number,
): number[] {
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

function validateBoardOverrides(overrides: readonly BoardOverride[]): void {
  const slots = new Set<number>();
  const values = new Set<number>();
  for (const o of overrides) {
    if (!Number.isInteger(o.slot) || o.slot < 0 || o.slot >= BOARD.size) {
      throw new RangeError(
        `Override slot ${o.slot} out of range [0, ${BOARD.size})`,
      );
    }
    if (slots.has(o.slot)) {
      throw new RangeError(`Duplicate override for slot ${o.slot}`);
    }
    if (values.has(o.value)) {
      throw new RangeError(`Duplicate override value ${o.value}`);
    }
    slots.add(o.slot);
    values.add(o.value);
  }
}

function fillRandomAroundOverrides(
  min: number,
  max: number,
  count: number,
  reserved: ReadonlySet<number>,
  rng: () => number,
): number[] {
  const available = max - min + 1 - reserved.size;
  if (available < count) {
    throw new RangeError(
      `range [${min}, ${max}] (minus ${reserved.size} reserved values) ` +
        `has ${available} integers; need ${count} more cells`,
    );
  }
  const seen = new Set<number>();
  while (seen.size < count) {
    const v = randomInt(min, max, rng);
    if (reserved.has(v)) continue;
    seen.add(v);
  }
  return [...seen];
}

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
