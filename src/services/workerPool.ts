/**
 * Generic Node `worker_threads` pool.
 *
 * Queues `TInput` jobs, dispatches them to a fixed set of workers, and
 * returns each job's `TOutput` via a Promise. Workers are reused until
 * the pool is shut down. The message protocol between driver and
 * worker is a single tagged envelope — workers post back either
 * `{ ok: true, id, result }` or `{ ok: false, id, error }`.
 */
import { Worker } from "node:worker_threads";
import { cpus } from "node:os";

// ---------------------------------------------------------------------------
//  Message shapes (exported so workers can import them too)
// ---------------------------------------------------------------------------

export interface PoolJobEnvelope<TInput> {
  readonly id: number;
  readonly payload: TInput;
}

export type PoolResultEnvelope<TOutput> =
  | { readonly ok: true; readonly id: number; readonly result: TOutput }
  | { readonly ok: false; readonly id: number; readonly error: string };

// ---------------------------------------------------------------------------
//  Pool options
// ---------------------------------------------------------------------------

export interface WorkerPoolOptions {
  /** Path to the worker entry file (JS or TS with a loader). */
  readonly workerFile: string | URL;
  /** Defaults to `max(1, os.cpus().length - 1)`. */
  readonly concurrency?: number;
  /** Optional per-worker `workerData` (same value is sent to every worker). */
  readonly workerData?: unknown;
  /** Spawn args forwarded to every Worker (e.g., `execArgv`). */
  readonly execArgv?: readonly string[];
}

// ---------------------------------------------------------------------------
//  Pool
// ---------------------------------------------------------------------------

interface PendingJob<TInput, TOutput> {
  readonly id: number;
  readonly payload: TInput;
  readonly resolve: (value: TOutput) => void;
  readonly reject: (err: Error) => void;
}

interface WorkerSlot {
  readonly worker: Worker;
  busy: boolean;
  currentJobId: number | null;
}

export class WorkerPool<TInput, TOutput> {
  private readonly workers: WorkerSlot[] = [];
  private readonly queue: PendingJob<TInput, TOutput>[] = [];
  private readonly inflight = new Map<number, PendingJob<TInput, TOutput>>();
  private nextJobId = 1;
  private shuttingDown = false;
  private destroyed = false;

  constructor(private readonly options: WorkerPoolOptions) {
    const concurrency = Math.max(
      1,
      options.concurrency ?? Math.max(1, cpus().length - 1),
    );
    for (let i = 0; i < concurrency; i += 1) this.spawnWorker();
  }

  /** Submit a job; resolves with the worker's return value. */
  run(payload: TInput): Promise<TOutput> {
    if (this.destroyed) {
      return Promise.reject(new Error("WorkerPool.run: pool is destroyed"));
    }
    if (this.shuttingDown) {
      return Promise.reject(new Error("WorkerPool.run: pool is shutting down"));
    }
    return new Promise<TOutput>((resolve, reject) => {
      const job: PendingJob<TInput, TOutput> = {
        id: this.nextJobId++,
        payload,
        resolve,
        reject,
      };
      this.queue.push(job);
      this.dispatch();
    });
  }

  get size(): number {
    return this.workers.length;
  }

  get pending(): number {
    return this.queue.length + this.inflight.size;
  }

  /**
   * Wait for all pending jobs to finish, then terminate workers. After
   * `close()` resolves, `run()` rejects on every call.
   */
  async close(): Promise<void> {
    if (this.destroyed) return;
    this.shuttingDown = true;
    if (this.pending > 0) {
      await new Promise<void>((resolve) => {
        const check = (): void => {
          if (this.pending === 0) resolve();
          else setTimeout(check, 5);
        };
        check();
      });
    }
    await this.terminate();
  }

  /** Immediately terminate all workers. Pending jobs reject. */
  async terminate(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    const err = new Error("WorkerPool: terminated");
    for (const job of this.queue) job.reject(err);
    this.queue.length = 0;
    for (const [, job] of this.inflight) job.reject(err);
    this.inflight.clear();
    await Promise.all(this.workers.map((w) => w.worker.terminate()));
    this.workers.length = 0;
  }

  // -------------------------------------------------------------------------
  //  Internals
  // -------------------------------------------------------------------------

  private spawnWorker(): void {
    const worker = new Worker(this.options.workerFile, {
      workerData: this.options.workerData,
      execArgv: this.options.execArgv ? [...this.options.execArgv] : undefined,
    });
    const slot: WorkerSlot = { worker, busy: false, currentJobId: null };
    worker.on("message", (msg: PoolResultEnvelope<TOutput>) => {
      this.handleMessage(slot, msg);
    });
    worker.on("error", (err) => this.handleWorkerError(slot, err));
    worker.on("exit", (code) => {
      if (this.destroyed) return;
      if (code !== 0 && slot.currentJobId !== null) {
        const job = this.inflight.get(slot.currentJobId);
        this.inflight.delete(slot.currentJobId);
        if (job !== undefined) {
          job.reject(new Error(`WorkerPool: worker exited with code ${code} mid-job`));
        }
      }
      // Replace the dead worker so the pool keeps steady-state concurrency,
      // unless we're shutting down.
      const idx = this.workers.indexOf(slot);
      if (idx >= 0) this.workers.splice(idx, 1);
      if (!this.shuttingDown) this.spawnWorker();
      this.dispatch();
    });
    this.workers.push(slot);
  }

  private handleMessage(
    slot: WorkerSlot,
    msg: PoolResultEnvelope<TOutput>,
  ): void {
    const job = this.inflight.get(msg.id);
    if (job === undefined) return;
    this.inflight.delete(msg.id);
    slot.busy = false;
    slot.currentJobId = null;
    if (msg.ok) job.resolve(msg.result);
    else job.reject(new Error(msg.error));
    this.dispatch();
  }

  private handleWorkerError(slot: WorkerSlot, err: Error): void {
    if (slot.currentJobId !== null) {
      const job = this.inflight.get(slot.currentJobId);
      this.inflight.delete(slot.currentJobId);
      if (job !== undefined) job.reject(err);
    }
    slot.busy = false;
    slot.currentJobId = null;
  }

  private dispatch(): void {
    if (this.destroyed) return;
    for (const slot of this.workers) {
      if (slot.busy) continue;
      const job = this.queue.shift();
      if (job === undefined) return;
      slot.busy = true;
      slot.currentJobId = job.id;
      this.inflight.set(job.id, job);
      const envelope: PoolJobEnvelope<TInput> = { id: job.id, payload: job.payload };
      slot.worker.postMessage(envelope);
    }
  }
}
