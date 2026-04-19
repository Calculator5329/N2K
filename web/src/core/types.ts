/**
 * Shared types across the web app.
 *
 * These mirror the on-disk JSON shapes produced by `prepare-web-data.ts`,
 * not the internal `Equation` type used by the solver. Keeping them
 * standalone avoids any coupling to the solver source layout.
 */

export type DiceTriple = readonly [number, number, number];

/** Per-dice summary row from `index.json`. */
export interface DiceSummary {
  readonly dice: DiceTriple;
  readonly solvableCount: number;
  readonly impossibleCount: number;
  readonly minDifficulty: number | null;
  readonly maxDifficulty: number | null;
  readonly averageDifficulty: number | null;
}

/** Top-level dataset metadata (also from `index.json`). */
export interface DatasetIndex {
  readonly generatedAt: string;
  readonly diceMin: number;
  readonly diceMax: number;
  readonly totalMin: number;
  readonly totalMax: number;
  readonly depower: boolean;
  readonly recordsWritten: number;
  readonly diceTriplesTotal: number;
  readonly dice: readonly DiceSummary[];
}

/** A single (target, equation, difficulty) cell. */
export interface Solution {
  readonly difficulty: number;
  readonly equation: string;
}

/** All solutions for one dice triple, from `dice/{a}-{b}-{c}.json`. */
export interface DiceDetail {
  readonly dice: DiceTriple;
  readonly summary: Omit<DiceSummary, "dice">;
  /** Map keyed by stringified integer total. */
  readonly solutions: Readonly<Record<string, Solution>>;
}

/** Globally-easiest (dice + equation) for a single target. */
export interface ByTargetEntry {
  readonly dice: DiceTriple;
  readonly difficulty: number;
  readonly equation: string;
}

/**
 * Per-target rollup from `target-stats.json`. Carries both the easiest
 * and hardest dice/equation that reach the target, plus the number of
 * distinct dice triples that can solve it (small numbers indicate a
 * "specialized" target that only a few triples can hit).
 */
export interface TargetStatsEntry {
  readonly easiest: ByTargetEntry | null;
  readonly hardest: ByTargetEntry | null;
  readonly solverCount: number;
}

/**
 * Flat (dice -> [difficulty | null]) view of the dataset. Each row is a
 * dense array of length `totalMax - totalMin + 1`; `null` marks targets
 * with no equation. Bundled as `data/difficulty.json` and consumed by
 * the Compose feature, which only needs `(dice, target) -> difficulty`
 * and never the equation strings carried by the per-dice chunks.
 */
export interface DifficultyMatrix {
  readonly totalMin: number;
  readonly totalMax: number;
  readonly dice: Readonly<Record<string, ReadonlyArray<number | null>>>;
}

/** Async loadable wrapper used by stores to expose loading state. */
export type Loadable<T> =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "error"; readonly error: string };

export const idle: Loadable<never> = { status: "idle" };
export const loading: Loadable<never> = { status: "loading" };

// ---------------------------------------------------------------------------
//  Æther mode types — shared by every Æther-aware store/view
// ---------------------------------------------------------------------------

/** Arity of an Æther tuple. The standard mode is fixed at 3. */
export type AetherArity = 3 | 4 | 5;

/**
 * A dice tuple in Æther mode. Length is `AetherArity`, values in
 * `[ADV_DICE_RANGE.min, ADV_DICE_RANGE.max]` (currently −10 .. 32).
 *
 * Stored as a plain number array because the arity is dynamic; callers
 * that need length safety should refine via `AetherArity`.
 */
export type AetherTuple = readonly number[];

/** Equation + difficulty for a single (tuple, target) cell. */
export interface AetherCell {
  readonly equation: string;
  readonly difficulty: number;
}

/**
 * Per-tuple difficulty/coverage rollup, derived from a sweep result.
 * Mirrors the standard `DiceSummary` shape so rendering code can be
 * shared between modes.
 */
export interface AetherTupleSummary {
  readonly tuple: AetherTuple;
  readonly arity: AetherArity;
  readonly solvableCount: number;
  readonly impossibleCount: number;
  readonly minDifficulty: number | null;
  readonly maxDifficulty: number | null;
  readonly averageDifficulty: number | null;
  readonly medianDifficulty: number | null;
}
