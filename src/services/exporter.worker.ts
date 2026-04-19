/**
 * Worker entry point for the bulk-export pipeline.
 *
 * Accepts one `ExportWorkerJob` per message, runs `exportOneTuple`,
 * and posts the result (plus a `PoolResultEnvelope`-compatible
 * wrapper) back to the driver. Workers hold no state beyond their
 * module scope, so they can be recycled across thousands of jobs.
 */
import { parentPort } from "node:worker_threads";
import { AETHER_MODE, STANDARD_MODE } from "../core/constants.js";
import type { BulkSolution, ModeId } from "../core/types.js";
import { exportOneTuple } from "./exporter.js";
import type { PoolJobEnvelope, PoolResultEnvelope } from "./workerPool.js";

export interface ExportWorkerJob {
  readonly inputTuple: readonly number[];
  readonly modeId: Extract<ModeId, "standard" | "aether">;
}

export interface ExportWorkerResult {
  readonly inputTuple: readonly number[];
  readonly canonicalTuple: readonly number[];
  readonly arity: 3 | 4 | 5;
  readonly equations: readonly BulkSolution[];
  readonly elapsedMs: number;
}

if (parentPort === null) {
  throw new Error("exporter.worker: must be run inside a worker_threads Worker");
}

const port = parentPort;

port.on("message", (envelope: PoolJobEnvelope<ExportWorkerJob>) => {
  const { id, payload } = envelope;
  try {
    const mode = payload.modeId === "standard" ? STANDARD_MODE : AETHER_MODE;
    const result = exportOneTuple(payload.inputTuple, mode);
    const out: ExportWorkerResult = {
      inputTuple: result.inputTuple,
      canonicalTuple: result.canonicalTuple,
      arity: result.arity,
      equations: result.equations,
      elapsedMs: result.elapsedMs,
    };
    const reply: PoolResultEnvelope<ExportWorkerResult> = {
      ok: true,
      id,
      result: out,
    };
    port.postMessage(reply);
  } catch (err) {
    const reply: PoolResultEnvelope<ExportWorkerResult> = {
      ok: false,
      id,
      error: err instanceof Error ? err.message : String(err),
    };
    port.postMessage(reply);
  }
});
