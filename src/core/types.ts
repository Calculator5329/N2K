/**
 * Core domain types for the N2K platform.
 *
 * An N2K equation chains 3..5 dice with arithmetic operators, evaluated
 * strictly left-to-right (no precedence). Each die may be raised to an
 * exponent capped per-die by the active {@link Mode}.
 *
 *     dice[0]^exps[0]  ops[0]  dice[1]^exps[1]  ops[1]  ...  =  total
 *
 * There is exactly one equation type. "Standard mode" (3 dice, dice in
 * 2..20, no negatives) and "Æther mode" (3..5 dice, dice in -10..32) are
 * not separate domains — they're {@link Mode} presets that constrain the
 * solver's search space.
 */

// ---------------------------------------------------------------------------
//  Operators
// ---------------------------------------------------------------------------

/** Numeric encoding of an arithmetic operator. Stable for wire formats. */
export type Operator = 1 | 2 | 3 | 4;

/** Printable form of an operator. */
export type OperatorSymbol = "+" | "-" | "*" | "/";

// ---------------------------------------------------------------------------
//  Equation
// ---------------------------------------------------------------------------

/** Supported arities. */
export type Arity = 3 | 4 | 5;

/**
 * A fully-specified N2K equation.
 *
 * Invariants (enforced by the solver, not the type system):
 *   - `dice.length === exps.length`
 *   - `ops.length === dice.length - 1`
 *   - `dice.length` is in {@link Arity}
 *   - left-to-right evaluation of `dice[i]^exps[i]` chained by `ops` equals `total`
 */
export interface NEquation {
  readonly dice: readonly number[];
  readonly exps: readonly number[];
  readonly ops:  readonly Operator[];
  readonly total: number;
}

/**
 * A solver result: an equation paired with the heuristic difficulty score
 * that earned it the "easiest known solution" slot for its target.
 */
export interface BulkSolution {
  readonly equation: NEquation;
  readonly difficulty: number;
}

// ---------------------------------------------------------------------------
//  Mode — the configuration that distinguishes "Standard" from "Æther"
// ---------------------------------------------------------------------------

/** A built-in mode id, plus an escape hatch for user-defined modes. */
export type ModeId = "standard" | "aether" | "custom";

/**
 * Difficulty heuristic weights — every per-term coefficient lives here so
 * `Mode` instances can carry their own calibration. The two built-in
 * presets ({@link import("./constants.js").STANDARD_DIFFICULTY},
 * {@link import("./constants.js").AETHER_DIFFICULTY}) match v1's two
 * separate heuristics exactly so existing rankings stay stable.
 *
 * All weights were originally calibrated by playtesting; do not change
 * them without re-validating against known difficulty rankings.
 */
export interface DifficultyWeights {
  /** Per-term contributions to the raw subtotal. */
  readonly totalSqrtWeight: number;
  readonly shortestDistanceWeight: number;
  readonly zeroExponentPenaltyPerCount: number;
  readonly oneExponentPenaltyPerCount: number;
  readonly largestNumSqrtWeight: number;
  readonly largestNumDistanceWeight: number;
  readonly smallestMultiplierExponent: number;
  readonly smallestMultiplierWeight: number;

  /** When true, second/third multiplications scale by 1/(k+1). */
  readonly multiplierChainDecay: boolean;

  /** Mode extensions; standard mode pins these to 0. */
  readonly arityPenaltyPerExtraDice: number;
  readonly negativeBasePenaltyPerCount: number;
  readonly hugeExponentThreshold: number;
  readonly hugeExponentWeightPerOver: number;

  /** Smoothing applied when one of the multiplied bases is ±10. */
  readonly tenFlagOffset: number;
  readonly tenFlagDivisor: number;

  /** Compression applied to the upper tail of the score distribution. */
  readonly upperTailThreshold: number;
  readonly upperTailFloor: number;
  readonly upperTailDivisor: number;

  /** Hard ceiling on the published difficulty score. */
  readonly maxDifficulty: number;
}

/**
 * Configuration that drives the solver, exporters, and UI input ranges.
 *
 * A `Mode` is plain data and fully serializable (the `exponentCap`
 * function is the one exception — see `serializeMode` in the future
 * content layer). Built-in presets live in `core/constants.ts`
 * ({@link import("./constants.js").STANDARD_MODE},
 * {@link import("./constants.js").AETHER_MODE}); user-defined `Mode`
 * instances are persisted as content entities in the future content layer.
 */
export interface Mode {
  readonly id: ModeId;
  /** Inclusive dice value range. Standard = 2..20, Æther = -10..32. */
  readonly diceRange: { readonly min: number; readonly max: number };
  /** Inclusive integer target range. Standard = 1..999, Æther = 1..5000. */
  readonly targetRange: { readonly min: number; readonly max: number };
  /** Allowed equation arities. Standard = [3], Æther = [3, 4, 5]. */
  readonly arities: readonly Arity[];
  /**
   * Reduce compound dice (4, 8, 16 → 2; 9 → 3) to their prime base before
   * solving. Matches the original game where players treat 8 as 2^3.
   * Standard = true, Æther = false (raw dice values are literal, including
   * negatives).
   */
  readonly depower: boolean;
  /**
   * Intermediate-result magnitude guard. Equations whose left-to-right
   * partial value exceeds this absolute value are pruned mid-evaluation.
   * Keeps the solver inside `Number.MAX_SAFE_INTEGER` headroom.
   */
  readonly safeMagnitude: number;
  /**
   * Per-dice exponent cap. Returns the inclusive maximum exponent legal
   * for a die of value `d` under this mode. The solver enumerates
   * `0 .. exponentCap(d)` for each die.
   */
  readonly exponentCap: (dice: number) => number;
  /** Difficulty heuristic calibration. */
  readonly difficulty: DifficultyWeights;
}

// ---------------------------------------------------------------------------
//  Solver inputs
// ---------------------------------------------------------------------------

export interface SolverInput {
  readonly dice: readonly number[];
  readonly total: number;
  readonly mode: Mode;
}

export interface SweepInput {
  readonly dice: readonly number[];
  readonly minTotal: number;
  readonly maxTotal: number;
  readonly mode: Mode;
}

// ---------------------------------------------------------------------------
//  Loadable<T> — uniform "lazy resource" envelope
// ---------------------------------------------------------------------------

/**
 * Tagged union for any value that can be in one of four states:
 * not requested, in flight, ready, or failed. Used everywhere a UI
 * needs to render against an async resource.
 */
export type Loadable<T> =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "error"; readonly error: string };

// ---------------------------------------------------------------------------
//  Board
// ---------------------------------------------------------------------------

/** Standard 6x6 board (36 cells) of integer targets. */
export interface Board {
  readonly rows: number;
  readonly cols: number;
  /** Row-major cell values. `cells.length === rows * cols`. */
  readonly cells: readonly number[];
}
