/// <reference lib="webworker" />

/**
 * Web Worker entry for the advanced (Æther) on-demand solver.
 *
 * Supports two request kinds, both off the main thread:
 *
 *   1. `solve`  — auto-arity easiest equation for a single target.
 *                 Used by Lookup-style "give me the answer" flows and
 *                 Phase D's mode-aware `n2kLoader.getCellSolution`
 *                 fallback chain (precomputed → coverage → worker).
 *
 *   2. `sweep`  — solve every target in `[minTotal, maxTotal]` for a
 *                 single fixed-arity tuple in one enumeration of the
 *                 equation space.
 *
 * Protocol (matches `solverWorker.ts` shape):
 *   - Request:  `{ id, kind, ...args }`
 *   - Response: `{ id, kind: "ok"|"error", ...payload }`
 *
 * `id` is opaque to the worker; the service uses it to route replies
 * back to the right Promise.
 *
 * Updated for v3.1: now driven by the unified mode-aware solver in
 * `N2K-v3/src/services/solver.ts` with `AETHER_MODE`. The previous
 * `advancedSolver` / `advancedDifficulty` / `advancedParsing` modules
 * (v2's parallel pipeline) are gone — the unified solver emits the
 * same `BulkSolution` shape the wire format already speaks.
 */
import {
  easiestSolution,
  sweepOneTuple,
  type SweepProgress,
} from "@solver/services/solver.js";
import { AETHER_MODE } from "@solver/core/constants.js";
import { difficultyOfEquation } from "@solver/services/difficulty.js";
import { formatEquation } from "@solver/services/parsing.js";
import type { BulkSolution } from "@solver/core/types.js";

// ---------------------------------------------------------------------------
//  Wire types — kept identical to the pre-v3.1 protocol so the
//  `aetherSolverService.ts` main-thread caller doesn't need changes.
// ---------------------------------------------------------------------------

export interface AetherSolveRequest {
  readonly id: number;
  readonly kind: "solve";
  readonly dice: readonly number[];
  readonly total: number;
}

export interface AetherSweepRequest {
  readonly id: number;
  readonly kind: "sweep";
  readonly dice: readonly number[];
  readonly minTotal: number;
  readonly maxTotal: number;
}

export type AetherWorkerRequest = AetherSolveRequest | AetherSweepRequest;

export interface AetherWorkerSolution {
  readonly equation: string;
  readonly arity: number;
  readonly difficulty: number;
  readonly elapsedMs: number;
}

/**
 * One per-target row of a sweep response. Tuple-style array (not a
 * `{target,…}` object) keeps the wire payload compact for the common
 * case of 5,000 entries.
 */
export type AetherSweepRow = readonly [
  target: number,
  equation: string,
  difficulty: number,
];

export interface AetherSweepResult {
  readonly arity: number;
  readonly elapsedMs: number;
  readonly rows: readonly AetherSweepRow[];
}

export interface AetherSweepProgressPayload {
  readonly arity: number;
  readonly elapsedMs: number;
  readonly permsDone: number;
  readonly permsTotal: number;
  readonly rows: readonly AetherSweepRow[];
}

export type AetherWorkerResponse =
  | { readonly id: number; readonly kind: "solve-ok";       readonly solution: AetherWorkerSolution | null }
  | { readonly id: number; readonly kind: "sweep-progress"; readonly progress: AetherSweepProgressPayload }
  | { readonly id: number; readonly kind: "sweep-ok";       readonly sweep:    AetherSweepResult }
  | { readonly id: number; readonly kind: "error";          readonly message:  string };

/**
 * Minimum spacing between `sweep-progress` messages. Tuned for
 * arity 5 (~1 emit/perm without spamming).
 */
const SWEEP_PROGRESS_INTERVAL_MS = 400;

// ---------------------------------------------------------------------------
//  Worker entry
// ---------------------------------------------------------------------------

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (event: MessageEvent<AetherWorkerRequest>) => {
  const req = event.data;
  try {
    if (req.kind === "solve") {
      handleSolve(req);
    } else {
      handleSweep(req);
    }
  } catch (err) {
    const response: AetherWorkerResponse = {
      id: req.id,
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(response);
  }
});

function handleSolve(req: AetherSolveRequest): void {
  const t0 = performance.now();
  const eq = easiestSolution(req.dice, req.total, AETHER_MODE);
  const elapsedMs = performance.now() - t0;
  const solution: AetherWorkerSolution | null = eq === null ? null : {
    equation: formatEquation(eq),
    arity: eq.dice.length,
    difficulty: difficultyOfEquation(eq, AETHER_MODE),
    elapsedMs,
  };
  const response: AetherWorkerResponse = { id: req.id, kind: "solve-ok", solution };
  ctx.postMessage(response);
}

function handleSweep(req: AetherSweepRequest): void {
  const t0 = performance.now();
  let lastEmitMs = -Infinity;

  const onPerm = (progress: SweepProgress): void => {
    // Final perm is reported via `sweep-ok` below — don't double-post.
    if (progress.permsDone >= progress.permsTotal) return;
    const now = performance.now();
    if (progress.permsDone > 1 && now - lastEmitMs < SWEEP_PROGRESS_INTERVAL_MS) {
      return;
    }
    lastEmitMs = now;
    const payload: AetherWorkerResponse = {
      id: req.id,
      kind: "sweep-progress",
      progress: {
        arity: req.dice.length,
        elapsedMs: now - t0,
        permsDone: progress.permsDone,
        permsTotal: progress.permsTotal,
        rows: rowsFromBest(progress.best),
      },
    };
    ctx.postMessage(payload);
  };

  const map = sweepOneTuple(
    req.dice,
    req.minTotal,
    req.maxTotal,
    AETHER_MODE,
    {},
    onPerm,
  );

  const elapsedMs = performance.now() - t0;
  const response: AetherWorkerResponse = {
    id: req.id,
    kind: "sweep-ok",
    sweep: { arity: req.dice.length, elapsedMs, rows: rowsFromBest(map) },
  };
  ctx.postMessage(response);
}

/**
 * Materialize a `best` map (target → bulk solution) into the wire-format
 * row tuples used by the sweep response. Equations are formatted to
 * their string form here so the main thread doesn't need solver imports.
 */
function rowsFromBest(
  best: ReadonlyMap<number, BulkSolution>,
): AetherSweepRow[] {
  const targets = [...best.keys()].sort((a, b) => a - b);
  const rows: AetherSweepRow[] = new Array(targets.length);
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i]!;
    const sol = best.get(t)!;
    rows[i] = [t, formatEquation(sol.equation), sol.difficulty];
  }
  return rows;
}
