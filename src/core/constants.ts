import { isLegalDiceTuple } from "./legality.js";
import type {
  DiceTriple,
  DifficultyWeights,
  Mode,
  Operator,
  OperatorSymbol,
} from "./types.js";

// ---------------------------------------------------------------------------
//  Operators
// ---------------------------------------------------------------------------

/** Operator codes used throughout the codebase. Stable for wire formats. */
export const OP = {
  ADD: 1,
  SUB: 2,
  MUL: 3,
  DIV: 4,
} as const satisfies Record<string, Operator>;

export const OPERATOR_TO_SYMBOL: Readonly<Record<Operator, OperatorSymbol>> = {
  1: "+",
  2: "-",
  3: "*",
  4: "/",
};

export const SYMBOL_TO_OPERATOR: Readonly<Record<OperatorSymbol, Operator>> = {
  "+": 1,
  "-": 2,
  "*": 3,
  "/": 4,
};

/**
 * Tolerance used when comparing floating-point equation results to an
 * integer total. Required because division and chained multiplication
 * can introduce tiny rounding errors.
 */
export const FLOAT_EQ_EPSILON = 1e-9;

// ---------------------------------------------------------------------------
//  Standard mode — exponent caps + difficulty weights + Mode preset
// ---------------------------------------------------------------------------

/**
 * Maximum exponent (inclusive) per dice value in standard mode, indexed by
 * the dice value itself. Keeps the largest single base near ~10,000 to keep
 * the brute-force solver tractable.
 *
 * Indices 0 and 1 are unused (standard dice are 2..20).
 */
export const STANDARD_MAX_EXPONENTS: readonly number[] = [
  1, 1, 13, 10, 6, 6, 10, 6, 6, 6, 10, 3, 10, 3, 3, 3, 3, 3, 10, 3, 3,
];

/**
 * Standard-mode exponent cap. Falls back to a single exponent slot for
 * dice values outside the lookup table so the function never throws.
 */
export function standardExponentCap(dice: number): number {
  return STANDARD_MAX_EXPONENTS[dice] ?? 1;
}

/**
 * Standard-mode difficulty weights. Frozen — these match v1's
 * `DIFFICULTY` exactly so existing rankings stay stable.
 */
export const STANDARD_DIFFICULTY: DifficultyWeights = {
  totalSqrtWeight: 1,
  shortestDistanceWeight: 1 / 12,
  zeroExponentPenaltyPerCount: 1 / 0.45,
  oneExponentPenaltyPerCount: 1 / 0.7,
  largestNumSqrtWeight: 1 / 16,
  largestNumDistanceWeight: 1 / 7,
  smallestMultiplierExponent: 0.75,
  smallestMultiplierWeight: 1 / 2,
  multiplierChainDecay: false,
  arityPenaltyPerExtraDice: 0,
  negativeBasePenaltyPerCount: 0,
  hugeExponentThreshold: Number.POSITIVE_INFINITY,
  hugeExponentWeightPerOver: 0,
  tenFlagOffset: 5,
  tenFlagDivisor: 1.75,
  upperTailThreshold: 90,
  upperTailFloor: 99,
  upperTailDivisor: 5000,
  maxDifficulty: 100,
} as const;

/**
 * Standard mode: 3-arity, dice 2..20, totals 1..999, depower compound
 * dice (4/8/16 → 2; 9 → 3), narrow per-die exponent caps. The original
 * game.
 */
export const STANDARD_MODE: Mode = {
  id: "standard",
  diceRange: { min: 2, max: 20 },
  targetRange: { min: 1, max: 999 },
  arities: [3],
  depower: true,
  safeMagnitude: 2 ** 45,
  exponentCap: standardExponentCap,
  difficulty: STANDARD_DIFFICULTY,
};

// ---------------------------------------------------------------------------
//  Æther mode — exponent caps + difficulty weights + Mode preset
// ---------------------------------------------------------------------------

/** Magnitude ceiling that drives the Æther exponent caps. */
export const AETHER_MAGNITUDE_CEIL = 1_000_000;

/**
 * Explicit cap for `|d| = 2`. Matches the generic "first power past
 * the magnitude ceiling" rule but is pinned in case the ceiling moves.
 */
export const AETHER_BASE_TWO_CAP = 20;

/**
 * Æther-mode exponent cap. Sign-irrelevant.
 *
 *   - `|d| ≤ 1` → 1 (degenerate: 0, ±1 don't grow with exponentiation).
 *   - `|d| = 2` → {@link AETHER_BASE_TWO_CAP}.
 *   - otherwise → smallest `p` such that `|d|^p > AETHER_MAGNITUDE_CEIL`.
 */
export function aetherExponentCap(dice: number): number {
  const abs = Math.abs(dice);
  if (abs <= 1) return 1;
  if (abs === 2) return AETHER_BASE_TWO_CAP;
  let p = 1;
  let v = abs;
  while (v <= AETHER_MAGNITUDE_CEIL) {
    p += 1;
    v *= abs;
  }
  return p;
}

/**
 * Æther-mode difficulty weights. Match v1's `ADV_DIFFICULTY` exactly.
 * Adds arity / negative-base / huge-exponent terms to the standard
 * baseline; chain decay enabled for stacked multiplications.
 */
export const AETHER_DIFFICULTY: DifficultyWeights = {
  totalSqrtWeight: 1,
  shortestDistanceWeight: 1 / 12,
  zeroExponentPenaltyPerCount: 1 / 0.45,
  oneExponentPenaltyPerCount: 1 / 0.7,
  largestNumSqrtWeight: 1 / 16,
  largestNumDistanceWeight: 1 / 7,
  smallestMultiplierExponent: 0.75,
  smallestMultiplierWeight: 1 / 2,
  multiplierChainDecay: true,
  arityPenaltyPerExtraDice: 5,
  negativeBasePenaltyPerCount: 3,
  hugeExponentThreshold: 6,
  hugeExponentWeightPerOver: 0.5,
  tenFlagOffset: 5,
  tenFlagDivisor: 1.75,
  upperTailThreshold: 90,
  upperTailFloor: 99,
  upperTailDivisor: 5000,
  maxDifficulty: 100,
} as const;

/**
 * Æther mode: 3..5-arity, dice -10..32, totals 1..5000, raw dice values
 * (no depower), wide per-die exponent caps. The advanced edition.
 */
export const AETHER_MODE: Mode = {
  id: "aether",
  diceRange: { min: -10, max: 32 },
  targetRange: { min: 1, max: 5_000 },
  arities: [3, 4, 5],
  depower: false,
  safeMagnitude: 2 ** 45,
  exponentCap: aetherExponentCap,
  // Exclude `0` from inside [-10, 32]: `0^p` collapses to either 1
  // (p=0) or 0 (p≥1) and `÷ 0` blows up evaluation. Cleaner to make
  // the die illegal than to special-case it everywhere downstream.
  legalDieValue: (d) => d !== 0,
  difficulty: AETHER_DIFFICULTY,
};

// ---------------------------------------------------------------------------
//  Built-in mode registry
// ---------------------------------------------------------------------------

export const BUILT_IN_MODES: Readonly<Record<"standard" | "aether", Mode>> = {
  standard: STANDARD_MODE,
  aether: AETHER_MODE,
};

// ---------------------------------------------------------------------------
//  Board defaults
// ---------------------------------------------------------------------------

/** Standard N2K board dimensions. */
export const BOARD = {
  rows: 6,
  cols: 6,
  size: 36,
} as const;

/**
 * Returns true if a dice triple is legal under N2K's roll rules.
 *
 * Thin 3-arity wrapper around the unified `isLegalDiceTuple` so v1
 * callers (board / candidate generators, web layer) keep working
 * without needing to import the new module. The rules — at most one
 * `1`, at most `N − 1` of any value, every die in the mode's range —
 * are now defined in one place: `core/legality.ts`.
 */
export function isLegalDiceTriple(triple: readonly [number, number, number]): boolean {
  return isLegalDiceTuple(triple, STANDARD_MODE);
}

/**
 * Every legal Standard-mode dice triple in canonical sorted order
 * (a ≤ b ≤ c, with a, b in 2..10 and c in 2..20). Order matches v2's
 * `DICE_COMBINATIONS` so any consumer relying on iteration order
 * survives the swap.
 */
export const DICE_COMBINATIONS: readonly DiceTriple[] = (() => {
  const out: DiceTriple[] = [];
  for (let a = 2; a <= 10; a += 1) {
    for (let b = a; b <= 10; b += 1) {
      for (let c = b; c <= 20; c += 1) {
        const triple: DiceTriple = [a, b, c];
        if (isLegalDiceTriple(triple)) out.push(triple);
      }
    }
  }
  return out;
})();

// ---------------------------------------------------------------------------
//  Compound-dice depower (standard mode pre-processing)
// ---------------------------------------------------------------------------

/**
 * Reduce a "compound" dice value (4, 8, 9, 16) to its prime base. Standard
 * mode applies this before solving so an 8-die is treated as a 2-die with
 * extra exponent headroom — matching the original game.
 *
 * No-op for any other value.
 */
export function depowerDice(dice: number): number {
  switch (dice) {
    case 4:
    case 8:
    case 16:
      return 2;
    case 9:
      return 3;
    default:
      return dice;
  }
}

/**
 * Mode-aware view of a dice pool. Standard mode depowers compound
 * dice (4 / 8 / 16 → 2; 9 → 3) before solver / difficulty / subset
 * checks so equations produced by `allSolutions` (which solves on the
 * depowered values) line up with the pool the player actually rolled.
 *
 * Æther mode is a no-op.
 *
 * Lives in `core/` so every game built on the kernel inherits the same
 * depower semantics — Phase 1 surfaced this when N2K Classic was the
 * only game implementation; future games (Speed, Daily, …) get it for
 * free by routing all pool / subset comparisons through this helper.
 */
export function effectivePool(pool: readonly number[], mode: Mode): readonly number[] {
  if (!mode.depower) return pool;
  return pool.map(depowerDice);
}

/**
 * Inverse-ish of `depowerDice` for *display*: given an equation whose
 * `dice` array carries depowered values (because the solver depowers
 * before enumerating in standard mode), best-effort relabel each
 * depowered die back to one of the original "compound" dice in the
 * rolled pool so the rendered equation matches what the player sees
 * on the table.
 *
 * Strategy: walk `equationDice` in order; for each value, prefer to
 * spend a still-unused original die from `originalPool` whose
 * `depowerDice` mapping equals the equation value. Falls back to the
 * raw equation value when no remaining original matches (e.g. the die
 * is itself non-compound, or the equation uses two depowered 2s but
 * the pool only had one compound 8). Ties are broken by "highest
 * compound die first" so a `[16, 8, 12]` pool with equation `[2, 2,
 * 12]` renders as `[16, 8, 12]` rather than `[8, 16, 12]` — players
 * read left-to-right and expect the bigger compound to bind first.
 *
 * Pure: caller mutates nothing.
 */
export function relabelDepoweredDice(
  equationDice: readonly number[],
  originalPool: readonly number[],
  mode: Mode,
): readonly number[] {
  if (!mode.depower) return equationDice;

  // Group originals by the value they depower to, sorted descending so
  // the largest compound (e.g. 16 before 8 before 4) is picked first.
  const byDepowered = new Map<number, number[]>();
  for (const orig of originalPool) {
    const dep = depowerDice(orig);
    let bucket = byDepowered.get(dep);
    if (bucket === undefined) {
      bucket = [];
      byDepowered.set(dep, bucket);
    }
    bucket.push(orig);
  }
  for (const bucket of byDepowered.values()) {
    bucket.sort((a, b) => b - a);
  }

  const out: number[] = [];
  for (const d of equationDice) {
    const bucket = byDepowered.get(d);
    if (bucket !== undefined && bucket.length > 0) {
      out.push(bucket.shift()!);
    } else {
      out.push(d);
    }
  }
  return out;
}
