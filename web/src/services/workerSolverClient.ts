/**
 * Shared `Worker` wrapper used by both the dataset client and the
 * solver worker service.
 *
 * One worker per browser tab — instantiated lazily on the first
 * request. Provides a typed promise-based interface over the wire
 * format defined in `workers/solver.worker.ts`. Outstanding requests
 * are tracked in a Map<id, {resolve, reject}>; messages route by id.
 *
 * Disposed when the AppStore tears down.
 */
import type {
  WorkerRequest,
  WorkerResponse,
  WireModeId,
} from "../workers/solver.worker.js";
import type { Mode, NEquation, BulkSolution } from "@platform/core/types.js";

/**
 * The worker only knows about built-in modes (it rehydrates them from
 * an id). Validate at the boundary so unknown ids fail fast on the
 * main thread instead of crashing the worker.
 */
function asWireMode(mode: Mode): WireModeId {
  if (mode.id === "standard" || mode.id === "aether") return mode.id;
  throw new Error(`solver worker: unsupported mode '${mode.id}'`);
}

// Vite-specific: this import returns a Worker constructor at build time
// and ignores the file at runtime in the worker bundle.
// eslint-disable-next-line import/no-unresolved -- Vite virtual module
import SolverWorker from "../workers/solver.worker.ts?worker";

type Pending = {
  readonly resolve: (value: unknown) => void;
  readonly reject: (err: Error) => void;
};

let singleton: SolverWorkerClient | null = null;

/**
 * Returns the per-tab solver worker client. Lazy because some test
 * environments (jsdom + vitest) don't have `Worker` and we don't want
 * to break those by spinning one up at module load.
 */
export function getSharedSolverWorkerClient(): SolverWorkerClient {
  if (singleton === null) {
    singleton = new SolverWorkerClient();
  }
  return singleton;
}

/** Dispose the shared worker (call from AppStore.dispose). */
export function disposeSharedSolverWorkerClient(): void {
  if (singleton !== null) {
    singleton.dispose();
    singleton = null;
  }
}

export class SolverWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private disposed = false;

  constructor() {
    this.worker = new SolverWorker();
    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      const slot = this.pending.get(msg.id);
      if (slot === undefined) return;
      this.pending.delete(msg.id);
      if (msg.ok) {
        slot.resolve(msg.value);
      } else {
        slot.reject(new Error(msg.error));
      }
    });
    this.worker.addEventListener("error", (event: ErrorEvent) => {
      // A worker-level error means the in-flight request was lost; reject
      // every outstanding one so callers don't hang forever.
      const err = new Error(`solver worker error: ${event.message}`);
      for (const slot of this.pending.values()) slot.reject(err);
      this.pending.clear();
    });
  }

  async sweep(mode: Mode, dice: readonly number[]): Promise<ReadonlyMap<number, BulkSolution>> {
    const entries = (await this.send({
      id: this.mintId(),
      kind: "sweep",
      modeId: asWireMode(mode),
      dice,
    })) as ReadonlyArray<readonly [number, BulkSolution]>;
    return new Map(entries);
  }

  async allSolutions(
    mode: Mode,
    dice: readonly number[],
    total: number,
  ): Promise<readonly NEquation[]> {
    const value = (await this.send({
      id: this.mintId(),
      kind: "all",
      modeId: asWireMode(mode),
      dice,
      total,
    })) as readonly NEquation[];
    return value;
  }

  async easiestSolution(
    mode: Mode,
    dice: readonly number[],
    total: number,
  ): Promise<NEquation | null> {
    const value = (await this.send({
      id: this.mintId(),
      kind: "easiest",
      modeId: asWireMode(mode),
      dice,
      total,
    })) as NEquation | null;
    return value;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    const err = new Error("solver worker disposed before request completed");
    for (const slot of this.pending.values()) slot.reject(err);
    this.pending.clear();
  }

  private mintId(): number {
    const id = this.nextId;
    this.nextId = (this.nextId + 1) | 0;
    return id;
  }

  private send(req: WorkerRequest): Promise<unknown> {
    if (this.disposed) {
      return Promise.reject(new Error("solver worker is disposed"));
    }
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(req.id, { resolve, reject });
      this.worker.postMessage(req);
    });
  }
}
