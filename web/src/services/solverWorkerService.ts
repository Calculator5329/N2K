/**
 * Main-thread façade over the solver Web Worker.
 *
 * Owns a single long-lived `Worker` instance and turns the postMessage
 * dance into a typed Promise API. A monotonic request id keeps concurrent
 * requests disambiguated; an internal `Map<id, {resolve, reject}>` routes
 * each reply back to the originating caller.
 *
 * Module-level singleton: only one worker per page, lazily created on
 * first use, never torn down (kept warm for repeat lookups).
 */
import type { DiceTriple } from "../core/types";
import SolverWorker from "./solverWorker?worker";
import type {
  SolverWorkerRequest,
  SolverWorkerResponse,
  SolverWorkerSolution,
} from "./solverWorker";

interface PendingRequest {
  resolve: (value: readonly SolverWorkerSolution[]) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PendingRequest>();

function ensureWorker(): Worker {
  if (worker !== null) return worker;
  const created = new SolverWorker();
  created.addEventListener("message", (event: MessageEvent<SolverWorkerResponse>) => {
    const response = event.data;
    const handlers = pending.get(response.id);
    if (handlers === undefined) return;
    pending.delete(response.id);
    if (response.kind === "ok") {
      handlers.resolve(response.solutions);
    } else {
      handlers.reject(new Error(response.message));
    }
  });
  created.addEventListener("error", (event: ErrorEvent) => {
    // Worker-level fatal — reject every in-flight request and reset so the
    // next call spins a fresh worker. Avoids permanently broken state.
    const err = new Error(event.message || "Solver worker crashed");
    for (const handlers of pending.values()) {
      handlers.reject(err);
    }
    pending.clear();
    created.terminate();
    if (worker === created) worker = null;
  });
  worker = created;
  return created;
}

/**
 * Compute every valid equation for `(dice, total)`, sorted by difficulty
 * ascending. Resolves with an empty array for unsolvable cells.
 *
 * Safe to call concurrently — each request gets a unique id so replies
 * can't cross wires.
 */
export function solveAllEquations(
  dice: DiceTriple,
  total: number,
): Promise<readonly SolverWorkerSolution[]> {
  const w = ensureWorker();
  const id = nextId++;
  const request: SolverWorkerRequest = { id, dice, total };
  return new Promise<readonly SolverWorkerSolution[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(request);
  });
}

/**
 * Spin up the worker (and parse its bundle) without sending any work.
 * No-op if the worker is already alive.
 *
 * Why: the first `solveAllEquations` call pays a one-time cost
 * (~30–80 ms on a cold tab) for Vite to fetch the worker bundle,
 * spawn the thread, and JIT the solver. That cost lands at the
 * worst possible moment — right when the user clicks "All
 * equations" — and shows up as a visible delay before the panel
 * starts rendering. Calling this from `LookupView`'s mount effect
 * inside `requestIdleCallback` shifts the cost to *before* the user
 * needs the result, so opening the panel feels instant on warm
 * cells (where the solver itself runs in a few ms).
 *
 * Safe to call multiple times; calls after the first are free.
 */
export function prewarmSolverWorker(): void {
  ensureWorker();
}

export type { SolverWorkerSolution };
