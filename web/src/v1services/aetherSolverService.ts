/**
 * Main-thread façade for the Æther solver Web Worker pool.
 *
 * Owns a worker pool sized to `navigator.hardwareConcurrency - 1`
 * (min 1). Both `solveAdvanced` (single target, auto-arity) and
 * `sweepAdvanced` (full target sweep, fixed arity) are dispatched
 * across the pool with least-busy assignment so concurrent UI flows
 * (e.g. Compare loading 4 tuple sweeps in parallel) actually use
 * multiple cores.
 *
 * Both APIs return Promises that resolve once the worker reply lands.
 * The pool routes by an internal monotonically-increasing `id`, so
 * callers don't see one another.
 */
import AetherWorker from "./aetherSolverWorker?worker";
import type {
  AetherSolveRequest,
  AetherSweepProgressPayload,
  AetherSweepRequest,
  AetherSweepResult,
  AetherWorkerResponse,
  AetherWorkerSolution,
} from "./aetherSolverWorker";

interface PendingSolve {
  readonly kind: "solve";
  readonly resolve: (value: AetherWorkerSolution | null) => void;
  readonly reject: (error: Error) => void;
}

interface PendingSweep {
  readonly kind: "sweep";
  readonly resolve: (value: AetherSweepResult) => void;
  readonly reject: (error: Error) => void;
  readonly onProgress?: (progress: AetherSweepProgressPayload) => void;
}

type PendingRequest = PendingSolve | PendingSweep;

interface WorkerSlot {
  readonly worker: Worker;
  inFlight: number;
}

const MAX_WORKERS = Math.max(
  1,
  (typeof navigator !== "undefined" && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency - 1
    : 2),
);

const pool: WorkerSlot[] = [];
const pending = new Map<number, PendingRequest>();
let nextId = 1;

function ensureWorker(): WorkerSlot {
  if (pool.length < MAX_WORKERS) {
    const worker = new AetherWorker();
    worker.addEventListener("message", (event: MessageEvent<AetherWorkerResponse>) => {
      const r = event.data;
      const handlers = pending.get(r.id);
      if (handlers === undefined) return;
      // `sweep-progress` is a streaming notification, not a terminal
      // reply — keep the request pending and just forward to the
      // caller's progress callback (if any).
      if (r.kind === "sweep-progress") {
        if (handlers.kind === "sweep" && handlers.onProgress !== undefined) {
          handlers.onProgress(r.progress);
        }
        return;
      }
      pending.delete(r.id);
      const slot = pool.find((s) => s.worker === worker);
      if (slot) slot.inFlight = Math.max(0, slot.inFlight - 1);
      if (r.kind === "error") {
        handlers.reject(new Error(r.message));
        return;
      }
      // Type-narrow on the request kind we registered for, defensively.
      if (r.kind === "solve-ok" && handlers.kind === "solve") {
        handlers.resolve(r.solution);
      } else if (r.kind === "sweep-ok" && handlers.kind === "sweep") {
        handlers.resolve(r.sweep);
      } else {
        handlers.reject(
          new Error(`Æther worker: response kind ${r.kind} did not match request kind ${handlers.kind}`),
        );
      }
    });
    worker.addEventListener("error", (event: ErrorEvent) => {
      // Reject every pending request on the failing worker. A new worker
      // will be lazily created on the next call.
      const err = new Error(event.message || "Æther solver worker crashed");
      for (const [, handlers] of pending) handlers.reject(err);
      pending.clear();
      worker.terminate();
      const idx = pool.findIndex((s) => s.worker === worker);
      if (idx >= 0) pool.splice(idx, 1);
    });
    const slot: WorkerSlot = { worker, inFlight: 0 };
    pool.push(slot);
    return slot;
  }
  return pool.reduce((best, s) => (s.inFlight < best.inFlight ? s : best), pool[0]!);
}

/**
 * Solve `(dice, total)` using auto-arity advanced search. Resolves with
 * the easiest equation across every 3..N subset, or `null` when the
 * pool can't reach the target.
 */
export function solveAdvanced(
  dice: readonly number[],
  total: number,
): Promise<AetherWorkerSolution | null> {
  const slot = ensureWorker();
  slot.inFlight += 1;
  const id = nextId++;
  const request: AetherSolveRequest = { id, kind: "solve", dice, total };
  return new Promise<AetherWorkerSolution | null>((resolve, reject) => {
    pending.set(id, { kind: "solve", resolve, reject });
    slot.worker.postMessage(request);
  });
}

/**
 * Solve every target in `[minTotal, maxTotal]` for one fixed-arity
 * tuple in a single brute-force pass. The cost is roughly the same as
 * one `solveAdvanced` call (operator/exponent enumeration is amortized
 * across all targets), so this is dramatically cheaper than
 * `solveAdvanced × 5,000`.
 *
 * Note that, unlike `solveAdvanced`, this does *not* try smaller
 * subsets — `dice` defines both the tuple identity and the arity. If
 * the caller wants auto-arity behaviour they should call this for
 * every relevant subset themselves and reduce.
 */
export function sweepAdvanced(
  dice: readonly number[],
  minTotal: number,
  maxTotal: number,
  onProgress?: (progress: AetherSweepProgressPayload) => void,
): Promise<AetherSweepResult> {
  const slot = ensureWorker();
  slot.inFlight += 1;
  const id = nextId++;
  const request: AetherSweepRequest = { id, kind: "sweep", dice, minTotal, maxTotal };
  return new Promise<AetherSweepResult>((resolve, reject) => {
    // Spread `onProgress` only when defined — `exactOptionalPropertyTypes`
    // forbids `{ onProgress: undefined }` against an `onProgress?:` field.
    pending.set(id, {
      kind: "sweep",
      resolve,
      reject,
      ...(onProgress !== undefined ? { onProgress } : {}),
    });
    slot.worker.postMessage(request);
  });
}

export type { AetherWorkerSolution, AetherSweepResult, AetherSweepProgressPayload };
export type { AetherSweepRow } from "./aetherSolverWorker";
