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

export type { SolverWorkerSolution };
