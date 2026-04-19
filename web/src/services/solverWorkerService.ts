/**
 * Solver service abstraction for the web layer.
 *
 * The dataset client serves the bulk-cached "easiest known solution per
 * target" answers. This service handles the *interactive* solve queries:
 * "for this dice + this exact total, what are ALL the solutions?" or
 * "find me the easiest one if the dataset has nothing".
 *
 * Two implementations:
 *
 *   - `InlineSolverService` — runs the solver on the current task. Yields
 *     to the event loop with `await Promise.resolve()` so a chain of
 *     small solves doesn't starve the renderer. Used in tests and as
 *     the universal fallback.
 *   - `WorkerSolverService` (TODO when the first heavy use case arrives)
 *     — wraps a `Worker` so big arity-5 sweeps don't block the main
 *     thread. Same interface, drop-in swap from `createDefaultAppStore`.
 *
 * Why not start with a real Worker?
 *   - The Lookup feature's queries are sub-100ms in standard mode; the
 *     UI-thread cost is invisible.
 *   - Web Worker setup needs Vite-specific config + a separate worker
 *     bundle; adding it in advance bloats the initial commit and
 *     complicates tests.
 *   - The seam is here so the swap is mechanical when warranted.
 */
import type { Mode, NEquation } from "@platform/core/types.js";
import { allSolutions, easiestSolution } from "@platform/services/solver.js";

export interface SolveRequest {
  readonly mode: Mode;
  readonly dice: readonly number[];
  readonly total: number;
}

export interface SolverWorkerService {
  /** Every distinct equation matching `(dice, total)` under `mode`. */
  allSolutions(req: SolveRequest): Promise<readonly NEquation[]>;

  /** The easiest solution under the mode's auto-arity rules, or `null`. */
  easiestSolution(req: SolveRequest): Promise<NEquation | null>;

  /** Tear down any worker resources. No-op for the inline impl. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
//  Inline implementation
// ---------------------------------------------------------------------------

export class InlineSolverService implements SolverWorkerService {
  async allSolutions(req: SolveRequest): Promise<readonly NEquation[]> {
    await Promise.resolve();
    if (!req.mode.arities.includes(req.dice.length as 3 | 4 | 5)) {
      return [];
    }
    return allSolutions(req.dice, req.total, req.mode);
  }

  async easiestSolution(req: SolveRequest): Promise<NEquation | null> {
    await Promise.resolve();
    const minArity = Math.min(...req.mode.arities);
    if (req.dice.length < minArity) return null;
    return easiestSolution(req.dice, req.total, req.mode);
  }

  dispose(): void {
    /* nothing to clean up */
  }
}
