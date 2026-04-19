/**
 * Solver Web Worker.
 *
 * Runs `sweepOneTuple` / `allSolutions` / `easiestSolution` off the main
 * thread so the React UI stays smooth during arity-4/5 Æther sweeps
 * (which can take hundreds of ms) and during dataset-client chunk
 * computes for a fresh dice tuple.
 *
 * Wire format (request → response):
 *
 *   {  id, kind: "sweep",    mode, dice                 }
 *   {  id, kind: "all",      mode, dice, total          }
 *   {  id, kind: "easiest",  mode, dice, total          }
 *
 * Response:
 *
 *   { id, ok: true,  value }       — see per-kind shape below
 *   { id, ok: false, error: msg }
 *
 * Per-kind value:
 *   sweep   → Array<[target, BulkSolution]>  (Map serializes as entries)
 *   all     → readonly NEquation[]
 *   easiest → NEquation | null
 *
 * Bundled by Vite via the `?worker` import in
 * `services/workerSolverClient.ts`.
 */
import type { Mode, NEquation, BulkSolution } from "@platform/core/types.js";
import {
  allSolutions,
  easiestSolution,
  sweepOneTuple,
} from "@platform/services/solver.js";

type SweepRequest = {
  readonly id: number;
  readonly kind: "sweep";
  readonly mode: Mode;
  readonly dice: readonly number[];
};

type AllRequest = {
  readonly id: number;
  readonly kind: "all";
  readonly mode: Mode;
  readonly dice: readonly number[];
  readonly total: number;
};

type EasiestRequest = {
  readonly id: number;
  readonly kind: "easiest";
  readonly mode: Mode;
  readonly dice: readonly number[];
  readonly total: number;
};

export type WorkerRequest = SweepRequest | AllRequest | EasiestRequest;

export type WorkerResponse =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly error: string };

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    let value: unknown;
    switch (req.kind) {
      case "sweep": {
        const map: ReadonlyMap<number, BulkSolution> = sweepOneTuple(
          req.dice,
          req.mode.targetRange.min,
          req.mode.targetRange.max,
          req.mode,
        );
        // Map doesn't structured-clone; flatten to entries.
        value = [...map.entries()];
        break;
      }
      case "all": {
        const eqs: readonly NEquation[] = allSolutions(req.dice, req.total, req.mode);
        value = eqs;
        break;
      }
      case "easiest": {
        const eq: NEquation | null = easiestSolution(req.dice, req.total, req.mode);
        value = eq;
        break;
      }
    }
    const response: WorkerResponse = { id: req.id, ok: true, value };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: WorkerResponse = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
});
