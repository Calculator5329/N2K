/**
 * Per-tuple bulk-export pipeline.
 *
 * Given a Mode and an input dice tuple, run `solveForExport` over the
 * mode's full target range and produce the three shapes the export
 * driver needs:
 *
 *   1. An in-memory list of `BulkSolution`s (the raw solver output).
 *   2. A {@link BinaryChunk} ready for `encodeChunk`.
 *   3. A JSON projection suitable for the web-app chunk files.
 *
 * This module is pure and synchronous — the worker pool and CLI driver
 * sit above it. The only side effect is wall-clock timing (for the
 * `elapsedMs` field).
 */
import { depowerDice } from "../core/constants.js";
import {
  chunkFromBulkSolutions,
  type BinaryChunk,
} from "../core/n2kBinary.js";
import type {
  Arity,
  BulkSolution,
  Mode,
  NEquation,
  Operator,
} from "../core/types.js";
import { solveForExport } from "./solver.js";

// ---------------------------------------------------------------------------
//  Public types
// ---------------------------------------------------------------------------

export interface ExportTupleResult {
  /** The original, user-facing dice tuple (not depowered, not sorted). */
  readonly inputTuple: readonly number[];
  /**
   * The canonical sorted multiset the solver actually evaluated —
   * post-depower for standard mode, raw-sorted for Æther. Equations'
   * `equation.dice` fields are permutations of this.
   */
  readonly canonicalTuple: readonly number[];
  readonly arity: Arity;
  readonly equations: readonly BulkSolution[];
  readonly elapsedMs: number;
}

export interface ChunkJsonRecord {
  readonly target: number;
  readonly difficulty: number;
  readonly dice: readonly number[];
  readonly exps: readonly number[];
  readonly ops: readonly Operator[];
}

export interface ChunkJson {
  readonly modeId: "standard" | "aether";
  readonly arity: Arity;
  /** Input (user-facing) tuple. */
  readonly inputTuple: readonly number[];
  /** Canonical tuple the equations evaluate against. */
  readonly diceTuple: readonly number[];
  readonly targetMin: number;
  readonly targetMax: number;
  readonly count: number;
  readonly equations: readonly ChunkJsonRecord[];
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Sort ascending and (for standard mode) depower compound dice. */
export function canonicalizeTuple(
  inputTuple: readonly number[],
  mode: Mode,
): number[] {
  const processed = mode.depower
    ? inputTuple.map(depowerDice)
    : inputTuple.slice();
  processed.sort((a, b) => a - b);
  return processed;
}

// ---------------------------------------------------------------------------
//  Per-tuple export
// ---------------------------------------------------------------------------

export function exportOneTuple(
  inputTuple: readonly number[],
  mode: Mode,
): ExportTupleResult {
  const arity = inputTuple.length as Arity;
  if (!mode.arities.includes(arity)) {
    throw new RangeError(
      `exportOneTuple: arity ${arity} is not allowed by mode "${mode.id}"`,
    );
  }
  const canonical = canonicalizeTuple(inputTuple, mode);
  const { targetRange } = mode;
  const started = Date.now();
  const equations = solveForExport(
    canonical,
    arity,
    targetRange.min,
    targetRange.max,
    mode,
  );
  const elapsedMs = Date.now() - started;
  return {
    inputTuple: inputTuple.slice(),
    canonicalTuple: canonical,
    arity,
    equations,
    elapsedMs,
  };
}

// ---------------------------------------------------------------------------
//  Shape conversions
// ---------------------------------------------------------------------------

export function toBinaryChunk(
  result: ExportTupleResult,
  mode: Mode,
): BinaryChunk {
  return chunkFromBulkSolutions(
    result.canonicalTuple,
    mode,
    mode.targetRange.min,
    mode.targetRange.max,
    result.equations,
  );
}

export function toChunkJson(
  result: ExportTupleResult,
  mode: Mode,
): ChunkJson {
  if (mode.id !== "standard" && mode.id !== "aether") {
    throw new RangeError(
      `toChunkJson: only built-in modes are supported (got "${mode.id}")`,
    );
  }
  return {
    modeId: mode.id,
    arity: result.arity,
    inputTuple: result.inputTuple,
    diceTuple: result.canonicalTuple,
    targetMin: mode.targetRange.min,
    targetMax: mode.targetRange.max,
    count: result.equations.length,
    equations: result.equations.map((s) => ({
      target: s.equation.total,
      difficulty: Math.round(s.difficulty * 100) / 100,
      dice: s.equation.dice.slice(),
      exps: s.equation.exps.slice(),
      ops: s.equation.ops.slice(),
    })),
  };
}

// ---------------------------------------------------------------------------
//  Manifest / filename conventions
// ---------------------------------------------------------------------------

export interface ManifestChunkEntry {
  readonly path: string;
  readonly inputTuple: readonly number[];
  readonly arity: Arity;
  readonly equationCount: number;
}

export interface Manifest {
  readonly modeId: "standard" | "aether";
  readonly generatedAt: string;
  readonly tupleCount: number;
  readonly totalEquations: number;
  readonly targetRange: { readonly min: number; readonly max: number };
  readonly chunks: readonly ManifestChunkEntry[];
}

/**
 * Stable filename for a tuple's JSON chunk. Negative values are
 * rendered with a leading `n` so the result is safe on every filesystem.
 *
 *   (2, 3, 5)       → "tuple-2-3-5.json"
 *   (-3, 5, 7, 2)   → "tuple-n3-2-5-7.json"   (sorted ascending first)
 */
export function chunkFilename(inputTuple: readonly number[], mode: Mode): string {
  const canon = canonicalizeTuple(inputTuple, mode);
  return `tuple-${canon.map(formatDiceForFilename).join("-")}.json`;
}

/** Relative path for a tuple under its mode's output directory. */
export function chunkRelativePath(
  inputTuple: readonly number[],
  mode: Mode,
): string {
  const fn = chunkFilename(inputTuple, mode);
  if (mode.id === "aether" && mode.arities.length > 1) {
    return `chunks/arity-${inputTuple.length}/${fn}`;
  }
  return `chunks/${fn}`;
}

function formatDiceForFilename(d: number): string {
  return d < 0 ? `n${-d}` : String(d);
}

// ---------------------------------------------------------------------------
//  Equation verification (used by --validate + tests)
// ---------------------------------------------------------------------------

/**
 * Evaluate an equation left-to-right via the raw operator chain and
 * check the result is within epsilon of `equation.total`. Returns true
 * on match, false otherwise.
 */
export function verifyEquation(equation: NEquation, epsilon = 1e-9): boolean {
  const values = equation.dice.map((d, i) => Math.pow(d, equation.exps[i]!));
  let acc = values[0]!;
  for (let i = 0; i < equation.ops.length; i += 1) {
    const next = values[i + 1]!;
    const op = equation.ops[i]!;
    if (op === 1) acc = acc + next;
    else if (op === 2) acc = acc - next;
    else if (op === 3) acc = acc * next;
    else if (op === 4) acc = acc / next;
    else return false;
    if (!Number.isFinite(acc)) return false;
  }
  return Math.abs(acc - equation.total) <= epsilon;
}
