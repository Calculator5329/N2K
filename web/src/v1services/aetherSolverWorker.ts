/// <reference lib="webworker" />

/**
 * Web Worker entry for the advanced (Æther) on-demand solver.
 *
 * Supports two request kinds, both off the main thread:
 *
 *   1. `solve`  — auto-arity easiest equation for a single target.
 *                 Used by Lookup-style "give me the answer" flows.
 *
 *   2. `sweep`  — solve every target in `[minTotal, maxTotal]` for a
 *                 single fixed-arity tuple in one enumeration of the
 *                 equation space. This is the per-tuple primitive that
 *                 powers Compare's curves, Visualize's heat ribbons,
 *                 Explore's lazy summaries, etc. Far cheaper than
 *                 calling `solve` 5,000 times because operator/exponent
 *                 enumeration is amortized.
 *
 * Protocol (matches `solverWorker.ts` shape):
 *   - Request:  `{ id, kind, ...args }`
 *   - Response: `{ id, kind: "ok"|"error", ...payload }`
 *
 * `id` is opaque to the worker; the service uses it to route replies
 * back to the right Promise.
 */
import {
  easiestAdvanced,
  solveAdvancedForAllTargets,
  type AdvBulkSolution,
} from "@solver/services/advancedSolver.js";
import { advDifficultyOfEquation } from "@solver/services/advancedDifficulty.js";
import { formatNEquation } from "@solver/services/advancedParsing.js";

// ---------------------------------------------------------------------------
//  Wire types
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
 * One per-target row of a sweep response. Kept as a tuple-style array
 * (not a `{target,…}` object) so the wire payload stays compact for
 * the common case of 5,000 entries.
 */
export type AetherSweepRow = readonly [
  target: number,
  equation: string,
  difficulty: number,
];

export interface AetherSweepResult {
  readonly arity: number;
  readonly elapsedMs: number;
  /** Solvable targets only; ordered ascending by target. */
  readonly rows: readonly AetherSweepRow[];
}

/**
 * Streaming intermediate sweep result. Same shape as `AetherSweepResult`
 * plus permutation-progress metadata. Emitted by the worker after each
 * permutation finishes, throttled to {@link SWEEP_PROGRESS_INTERVAL_MS}
 * minimum spacing so postMessage doesn't drown the main thread on cheap
 * arity-3 sweeps.
 */
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
 * Minimum spacing between `sweep-progress` messages. The first
 * permutation always emits (so the UI sees an answer fast); subsequent
 * permutations skip until this much wall-clock time has elapsed since
 * the last emit. Tuned for arity 5 (perms take ~1.3 s each on a modern
 * laptop), where it yields ~1 emit/perm without spamming.
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
  const eq = easiestAdvanced({ dice: req.dice, total: req.total });
  const elapsedMs = performance.now() - t0;
  const solution: AetherWorkerSolution | null = eq === null ? null : {
    equation: formatNEquation(eq),
    arity: eq.dice.length,
    difficulty: advDifficultyOfEquation(eq),
    elapsedMs,
  };
  const response: AetherWorkerResponse = { id: req.id, kind: "solve-ok", solution };
  ctx.postMessage(response);
}

function handleSweep(req: AetherSweepRequest): void {
  const t0 = performance.now();
  let lastEmitMs = -Infinity;

  const map = solveAdvancedForAllTargets(
    req.dice,
    req.minTotal,
    req.maxTotal,
    {},
    ({ permsDone, permsTotal, best }) => {
      // Final perm is reported via `sweep-ok` below — don't double-post.
      if (permsDone >= permsTotal) return;
      const now = performance.now();
      if (permsDone > 1 && now - lastEmitMs < SWEEP_PROGRESS_INTERVAL_MS) {
        return;
      }
      lastEmitMs = now;
      const progress: AetherWorkerResponse = {
        id: req.id,
        kind: "sweep-progress",
        progress: {
          arity: req.dice.length,
          elapsedMs: now - t0,
          permsDone,
          permsTotal,
          rows: rowsFromBest(best),
        },
      };
      ctx.postMessage(progress);
    },
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
  best: ReadonlyMap<number, AdvBulkSolution>,
): AetherSweepRow[] {
  const targets = [...best.keys()].sort((a, b) => a - b);
  const rows: AetherSweepRow[] = new Array(targets.length);
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i]!;
    const sol = best.get(t)!;
    rows[i] = [t, formatNEquation(sol.equation), sol.difficulty];
  }
  return rows;
}
