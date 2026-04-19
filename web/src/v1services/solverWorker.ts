/// <reference lib="webworker" />

/**
 * Web Worker entry for the on-demand "all equations" solver mode.
 *
 * Imports the same pure TypeScript solver the CLI / bulk export uses
 * (`@solver/services/solver`) and runs it off the main thread, so even a
 * worst-case enumeration (~10⁵–10⁶ candidates for high-cap dice) cannot
 * stall the UI. The dataset already ships the *easiest* equation for every
 * cell — this worker is the only path that surfaces every other valid one.
 *
 * Protocol: caller sends `{ id, dice, total }`, worker replies with
 * `{ id, kind: "ok", solutions }` or `{ id, kind: "error", message }`.
 * The `id` lets a single worker serve concurrent requests; the parent
 * service maps replies back to the originating Promise.
 */
import type { DiceTriple } from "../core/types";
import { allSolutions } from "@solver/services/solver.js";
import { formatEquation } from "@solver/services/parsing.js";

export interface SolverWorkerRequest {
  readonly id: number;
  readonly dice: DiceTriple;
  readonly total: number;
}

export interface SolverWorkerSolution {
  readonly equation: string;
  readonly difficulty: number;
}

export type SolverWorkerResponse =
  | {
      readonly id: number;
      readonly kind: "ok";
      readonly solutions: readonly SolverWorkerSolution[];
    }
  | {
      readonly id: number;
      readonly kind: "error";
      readonly message: string;
    };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (event: MessageEvent<SolverWorkerRequest>) => {
  const { id, dice, total } = event.data;
  try {
    const raw = allSolutions({ dice, total });
    const solutions: SolverWorkerSolution[] = raw.map((s) => ({
      equation: formatEquation(s.equation),
      difficulty: s.difficulty,
    }));
    const response: SolverWorkerResponse = { id, kind: "ok", solutions };
    ctx.postMessage(response);
  } catch (err) {
    const response: SolverWorkerResponse = {
      id,
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(response);
  }
});
