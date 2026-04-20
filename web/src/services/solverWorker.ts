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
import { canonicalizeSolutions } from "@solver/services/canonicalForm.js";
import { difficultyOfEquation } from "@solver/services/difficulty.js";
import { formatEquation } from "@solver/services/parsing.js";
import { STANDARD_MODE } from "@solver/core/constants.js";

export interface SolverWorkerRequest {
  readonly id: number;
  readonly dice: DiceTriple;
  readonly total: number;
}

export interface SolverWorkerSolution {
  readonly equation: string;
  readonly difficulty: number;
  /**
   * How many distinct (perm, exps, ops) triples in the raw solver
   * output collapse into this canonical equation. Always ≥ 1; values
   * > 1 are rendered as a "×N orderings" badge by `AllEquationsList`.
   */
  readonly multiplicity: number;
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
    // The Lookup view that drives this worker is Standard-mode only —
    // its DicePicker enforces the 2..20 range and 3-arity tuple. Æther
    // lookups go through `aetherSolverWorker` instead.
    const raw = allSolutions(dice, total, STANDARD_MODE);
    // `allSolutions` returns equations in solver enumeration order
    // and frequently includes many commutatively-equivalent
    // duplicates (e.g. `2 + 3 + 5` and `5 + 3 + 2`). Collapse them
    // into one canonical representative each so the UI shows
    // *meaningfully different* equations rather than a flood of
    // perm-equivalents. The multiplicity tells the UI how many raw
    // forms collapsed into each row, surfaced as a "×N orderings"
    // badge. `canonicalizeSolutions` returns the list already sorted
    // ascending by difficulty.
    const canonical = canonicalizeSolutions(raw, (eq) =>
      difficultyOfEquation(eq, STANDARD_MODE),
    );
    const solutions: SolverWorkerSolution[] = canonical.map((c) => ({
      equation: formatEquation(c.equation),
      difficulty: difficultyOfEquation(c.equation, STANDARD_MODE),
      multiplicity: c.multiplicity,
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
