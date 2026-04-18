/**
 * Unified difficulty heuristic.
 *
 * One function, one breakdown shape, parameterized by the active
 * {@link Mode}'s {@link DifficultyWeights}. Standard mode and Æther mode
 * carry their own weight presets — see `STANDARD_DIFFICULTY` and
 * `AETHER_DIFFICULTY` in `core/constants.ts`.
 *
 * Design:
 *   - The function always evaluates every term, but only emits a
 *     `DifficultyTerm` for terms whose contribution is non-zero (zero-
 *     weight terms in the active mode collapse out of the breakdown).
 *   - Adjustments (tenFlag, upper-tail compression, ceiling clamp) are
 *     emitted only when they actually fire, so consumers can render
 *     "(none)" affordances naturally.
 *   - `final = difficultyOfEquation(eq, mode) = difficultyBreakdown(eq, mode).final`
 *     by construction; the two functions share an implementation.
 */
import { OP } from "../core/constants.js";
import type { DifficultyWeights, Mode, NEquation } from "../core/types.js";

// ---------------------------------------------------------------------------
//  Breakdown shape
// ---------------------------------------------------------------------------

export type DifficultyTermId =
  | "totalMagnitude"
  | "shortestDistance"
  | "zeroExponents"
  | "oneExponents"
  | "largestSubresult"
  | "largestSubresultDistance"
  | "smallestMultiplier"
  | "arityPenalty"
  | "negativeBasePenalty"
  | "hugeExponentPenalty";

export type DifficultyAdjustmentId =
  | "tenFlag"
  | "upperTailCompression"
  | "ceilingClamp";

/** One additive term in the raw score, surfaced for explainability. */
export interface DifficultyTerm {
  readonly id: DifficultyTermId;
  readonly label: string;
  /** Plain-language description of *what was measured*. */
  readonly input: string;
  /** Signed contribution to the raw subtotal, in difficulty units. */
  readonly contribution: number;
}

/** A post-processing step applied to the running raw score. */
export interface DifficultyAdjustment {
  readonly id: DifficultyAdjustmentId;
  readonly label: string;
  readonly note: string;
  readonly before: number;
  readonly after: number;
}

/** Full structured decomposition of an equation's difficulty score. */
export interface DifficultyBreakdown {
  readonly equation: NEquation;
  readonly terms: readonly DifficultyTerm[];
  readonly rawSubtotal: number;
  readonly adjustments: readonly DifficultyAdjustment[];
  readonly final: number;
}

// ---------------------------------------------------------------------------
//  AllBasesCache — amortizes the all-bases scan across many candidates
// ---------------------------------------------------------------------------

/**
 * Bag of every reachable single-base value `d^p` for the dice in an
 * equation, used by the heuristic's "distance from a free base power"
 * term. Computed once per dice tuple and reused across every candidate
 * equation hitting that tuple.
 */
export interface AllBasesCache {
  readonly values: readonly number[];
}

/** Build the {@link AllBasesCache} for a dice tuple under a mode. */
export function buildAllBasesCache(
  dice: readonly number[],
  mode: Mode,
): AllBasesCache {
  const values: number[] = [];
  for (const d of dice) {
    const cap = mode.exponentCap(d);
    for (let p = 0; p <= cap; p += 1) values.push(Math.pow(d, p));
  }
  return { values };
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/** Compute the difficulty score (0..maxDifficulty) for an equation. */
export function difficultyOfEquation(
  eq: NEquation,
  mode: Mode,
  precomputedBases?: AllBasesCache,
): number {
  return difficultyBreakdown(eq, mode, precomputedBases).final;
}

/**
 * Same calculation as {@link difficultyOfEquation}, but returns every
 * intermediate piece (per-term contributions, post-processing
 * adjustments, final score) so UIs can explain *why* a number is what
 * it is.
 */
export function difficultyBreakdown(
  eq: NEquation,
  mode: Mode,
  precomputedBases?: AllBasesCache,
): DifficultyBreakdown {
  const w: DifficultyWeights = mode.difficulty;
  const { dice, exps, ops, total } = eq;
  const N = dice.length;

  // 1) Distance from a free base power.
  const allBases = (precomputedBases ?? buildAllBasesCache(dice, mode)).values;
  let shortestDistance = Number.POSITIVE_INFINITY;
  for (const base of allBases) {
    const d = Math.abs(base - total);
    if (d < shortestDistance) shortestDistance = d;
  }

  // 2) Exponent shape — bonus for ^0 / ^1 simplifications.
  let zeroes = 0;
  let ones = 0;
  for (const p of exps) {
    if (p === 0) zeroes += 1;
    else if (p === 1) ones += 1;
  }

  // 3) Walk left-to-right tracking max(|partial|), per-multiplication
  //    smallest-multiplicand penalty, and whether any ×10 fires.
  const baseValue = (i: number): number => Math.pow(dice[i]!, exps[i]!);
  let acc = baseValue(0);
  let maxAbs = Math.abs(acc);
  let multiplierTerm = 0;
  let mulIdx = 0;
  let tenFlag = false;
  for (let i = 0; i < ops.length; i += 1) {
    const next = baseValue(i + 1);
    const op = ops[i]!;
    if (op === OP.MUL) {
      const sm = Math.min(Math.abs(acc), Math.abs(next));
      if (sm > 1) {
        const decay = w.multiplierChainDecay ? mulIdx + 1 : 1;
        multiplierTerm +=
          (Math.pow(sm, w.smallestMultiplierExponent) *
            w.smallestMultiplierWeight) /
          decay;
      }
      if (Math.abs(dice[i]!) === 10 || Math.abs(dice[i + 1]!) === 10) {
        tenFlag = true;
      }
      mulIdx += 1;
    }
    acc = applyOp(acc, next, op);
    const absAcc = Math.abs(acc);
    if (absAcc > maxAbs) maxAbs = absAcc;
  }
  const largestNum = maxAbs;
  const largestNumDistance = Math.abs(largestNum - total);

  // 4) Huge-exponent penalty (zero-weight in standard mode).
  let hugeExpOver = 0;
  for (const p of exps) {
    if (p > w.hugeExponentThreshold) hugeExpOver += p - w.hugeExponentThreshold;
  }
  const hugeExpTerm = hugeExpOver * w.hugeExponentWeightPerOver;

  // 5) Arity / negative-base penalties (zero-weight in standard mode).
  const extraArity = Math.max(0, N - 3);
  const arityTerm = extraArity * w.arityPenaltyPerExtraDice;
  let negCount = 0;
  for (const d of dice) if (d < 0) negCount += 1;
  const negTerm = negCount * w.negativeBasePenaltyPerCount;

  // 6) Per-term contributions.
  const totalMagnitude = Math.sqrt(Math.abs(total)) * w.totalSqrtWeight;
  const shortestDistanceTerm = shortestDistance * w.shortestDistanceWeight;
  const zeroesTerm = -zeroes * w.zeroExponentPenaltyPerCount;
  const onesTerm = -ones * w.oneExponentPenaltyPerCount;
  const largestSqrtTerm = Math.sqrt(largestNum) * w.largestNumSqrtWeight;
  const largestDistanceTerm = largestNumDistance * w.largestNumDistanceWeight;

  // Each entry: { active in active mode? ; term }. Mode-irrelevant terms
  // (weight === 0) collapse out of the breakdown so standard mode emits a
  // tighter 7-term report and Æther mode emits the full 10.
  const candidates: ReadonlyArray<readonly [boolean, DifficultyTerm]> = [
    [w.totalSqrtWeight !== 0, {
      id: "totalMagnitude",
      label: "Target magnitude",
      input: `√${Math.abs(total)} = ${round2(Math.sqrt(Math.abs(total)))}`,
      contribution: totalMagnitude,
    }],
    [w.shortestDistanceWeight !== 0, {
      id: "shortestDistance",
      label: "Distance from a free base power",
      input: `nearest |base − ${total}| = ${shortestDistance}`,
      contribution: shortestDistanceTerm,
    }],
    [w.zeroExponentPenaltyPerCount !== 0, {
      id: "zeroExponents",
      label: "Zero-exponent bonus",
      input: zeroes === 0 ? "no ^0 exponents" : `${zeroes} × ^0 ⇒ ${zeroes} free 1s`,
      contribution: zeroesTerm,
    }],
    [w.oneExponentPenaltyPerCount !== 0, {
      id: "oneExponents",
      label: "One-exponent bonus",
      input: ones === 0 ? "no ^1 exponents" : `${ones} × ^1 ⇒ ${ones} bare dice`,
      contribution: onesTerm,
    }],
    [w.largestNumSqrtWeight !== 0, {
      id: "largestSubresult",
      label: "Largest sub-result magnitude",
      input: `√${largestNum} = ${round2(Math.sqrt(largestNum))}`,
      contribution: largestSqrtTerm,
    }],
    [w.largestNumDistanceWeight !== 0, {
      id: "largestSubresultDistance",
      label: "Largest sub-result distance from target",
      input: `|${largestNum} − ${total}| = ${largestNumDistance}`,
      contribution: largestDistanceTerm,
    }],
    [w.smallestMultiplierWeight !== 0, {
      id: "smallestMultiplier",
      label: "Smallest multiplicand penalty",
      input: multiplierTerm === 0
        ? "no multiplication (or ×1 / ×0)"
        : `${mulIdx} multiplication${mulIdx === 1 ? "" : "s"}`,
      contribution: multiplierTerm,
    }],
    [w.arityPenaltyPerExtraDice !== 0, {
      id: "arityPenalty",
      label: "Arity penalty",
      input: `${extraArity} dice beyond 3`,
      contribution: arityTerm,
    }],
    [w.negativeBasePenaltyPerCount !== 0, {
      id: "negativeBasePenalty",
      label: "Negative-base penalty",
      input: `${negCount} negative ${negCount === 1 ? "die" : "dice"}`,
      contribution: negTerm,
    }],
    [w.hugeExponentWeightPerOver !== 0, {
      id: "hugeExponentPenalty",
      label: "Huge-exponent penalty",
      input: hugeExpOver === 0
        ? `no exponents above ${w.hugeExponentThreshold}`
        : `total overshoot = ${hugeExpOver}`,
      contribution: hugeExpTerm,
    }],
  ];

  const terms: DifficultyTerm[] = candidates
    .filter(([active]) => active)
    .map(([, term]) => term);

  const rawSubtotal = terms.reduce((s, t) => s + t.contribution, 0);

  // 7) Adjustments.
  const adjustments: DifficultyAdjustment[] = [];
  let running = rawSubtotal;

  if (tenFlag) {
    const after = (running - w.tenFlagOffset) / w.tenFlagDivisor;
    adjustments.push({
      id: "tenFlag",
      label: "×10 simplification",
      note: `(score − ${w.tenFlagOffset}) ÷ ${w.tenFlagDivisor}`,
      before: running,
      after,
    });
    running = after;
  }

  if (running > w.upperTailThreshold) {
    const after = w.upperTailFloor + running / w.upperTailDivisor;
    adjustments.push({
      id: "upperTailCompression",
      label: "Upper-tail compression",
      note: `${w.upperTailFloor} + score ÷ ${w.upperTailDivisor} (only above ${w.upperTailThreshold})`,
      before: running,
      after,
    });
    running = after;
  }

  if (running > w.maxDifficulty) {
    adjustments.push({
      id: "ceilingClamp",
      label: "Ceiling clamp",
      note: `score capped at ${w.maxDifficulty}`,
      before: running,
      after: w.maxDifficulty,
    });
    running = w.maxDifficulty;
  }

  if (running < 0) running = 0;

  return {
    equation: eq,
    terms,
    rawSubtotal,
    adjustments,
    final: round2(running),
  };
}

// ---------------------------------------------------------------------------
//  Internals
// ---------------------------------------------------------------------------

/** Lightweight inline op apply — kept here so this module stays standalone. */
function applyOp(a: number, b: number, op: 1 | 2 | 3 | 4): number {
  switch (op) {
    case 1: return a + b;
    case 2: return a - b;
    case 3: return a * b;
    case 4: return a / b;
  }
}
