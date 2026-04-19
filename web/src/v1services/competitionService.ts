/**
 * Glue layer between the pure `@solver/services/competition` algorithms and
 * the web app's bundled difficulty matrix (`/data/difficulty.json`).
 *
 * Two responsibilities:
 *   1. Make sure the (single) difficulty matrix is loaded before generation.
 *   2. Adapt `DataStore.difficultyMatrix` into a synchronous
 *      `DifficultyResolver`.
 *
 * Compose only ever needs `(dice, target) -> difficulty`; equation strings
 * stay in the per-dice JSON chunks served to the Lookup view. Loading the
 * matrix is one HTTP request (~880 KB gzip / 540 KB brotli) regardless of
 * pool size, replacing the previous chunk-fan-out which fired ~1,500
 * requests for the "Extensive" pool.
 */
import type { DiceTriple } from "../core/types";
import { DataStore } from "../v1stores/DataStore";
import type { DifficultyResolver } from "@solver/services/competition.js";

function diceKey(dice: DiceTriple): string {
  return `${dice[0]}-${dice[1]}-${dice[2]}`;
}

/**
 * Build a synchronous resolver backed by the loaded difficulty matrix.
 *
 * Returns `null` for any (dice, target) absent from the matrix (== outside
 * the bundled dataset OR unsolvable). Callers must `await
 * ensureDifficultyMatrixLoaded(dataStore)` first; if the matrix isn't
 * ready the resolver falls back to `null` for every cell.
 */
export function makeDataStoreResolver(dataStore: DataStore): DifficultyResolver {
  return (dice, target) => {
    const state = dataStore.difficultyMatrix;
    if (state.status !== "ready") return null;
    const row = state.value.dice[diceKey(dice)];
    if (row === undefined) return null;
    const idx = target - state.value.totalMin;
    if (idx < 0 || idx >= row.length) return null;
    return row[idx] ?? null;
  };
}

/**
 * Ensure the bundled difficulty matrix is in memory. Resolves once it is,
 * or rejects with the load error.
 *
 * `onProgress` fires twice — `(0, 1)` immediately and `(1, 1)` on
 * resolution. The matrix is a single JSON fetch served gzip/brotli, so
 * fine-grained progress would require a streaming JSON parser; the
 * coarse signal is enough to keep the existing UI affordances working.
 */
export async function ensureDifficultyMatrixLoaded(
  dataStore: DataStore,
  options: { onProgress?: (loaded: number, total: number) => void } = {},
): Promise<void> {
  options.onProgress?.(0, 1);
  await dataStore.loadDifficultyMatrix();
  const state = dataStore.difficultyMatrix;
  if (state.status === "error") {
    throw new Error(`Failed to load difficulty matrix: ${state.error}`);
  }
  if (state.status !== "ready") {
    throw new Error("Difficulty matrix did not reach ready state");
  }
  options.onProgress?.(1, 1);
}
