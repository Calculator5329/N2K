/**
 * Glue layer between the pure `@solver/services/competition` algorithms
 * and the bundled difficulty matrices (`/data/standard.n2k`,
 * `/data/aether-arity3.n2k`).
 *
 * Two responsibilities:
 *   1. Make sure the appropriate difficulty matrix is loaded before
 *      generation.
 *   2. Adapt a `DifficultyMatrix` into a synchronous
 *      `DifficultyResolver`.
 *
 * Compose only ever needs `(dice, target) -> difficulty`; equation
 * strings stay in the per-dice chunks served to the Lookup view.
 *
 * Standard-mode keys are the depowered, sorted form (`4 → 2`, `9 → 3`,
 * etc. — see `bake-blob.ts`). Æther mode keeps every face value
 * distinct. The resolver depowers only when needed.
 */
import { depowerDice } from "@solver/core/constants.js";
import type { DifficultyMatrix } from "../core/types";
import type { DiceTriple } from "../core/types";
import { DataStore } from "../stores/DataStore";
import { getAetherLoader } from "./n2kLoader";
import type { DifficultyResolver } from "@solver/services/competition.js";

export type ResolverModeId = "standard" | "aether";

function canonicalKey(dice: DiceTriple, mode: ResolverModeId): string {
  const mapped =
    mode === "standard"
      ? [depowerDice(dice[0]), depowerDice(dice[1]), depowerDice(dice[2])]
      : [dice[0], dice[1], dice[2]];
  const sorted = mapped.sort((a, b) => a - b);
  return `${sorted[0]}-${sorted[1]}-${sorted[2]}`;
}

/**
 * Build a synchronous resolver backed by a loaded `DifficultyMatrix`.
 *
 * Returns `null` for any (dice, target) absent from the matrix
 * (= outside the bundled dataset OR unsolvable). Caller is responsible
 * for ensuring the matching matrix is loaded.
 */
export function makeMatrixResolver(
  matrix: DifficultyMatrix,
  mode: ResolverModeId,
): DifficultyResolver {
  return (dice, target) => {
    const row = matrix.dice[canonicalKey(dice, mode)];
    if (row === undefined) return null;
    const idx = target - matrix.totalMin;
    if (idx < 0 || idx >= row.length) return null;
    return row[idx] ?? null;
  };
}

/**
 * Ensure the bundled standard difficulty matrix is in memory. Resolves
 * once it is, or rejects with the load error.
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

// ---------------------------------------------------------------------------
//  Mode-aware matrix loading
// ---------------------------------------------------------------------------

/**
 * Lazily-loaded Æther 3-arity matrix. Distinct cache from
 * `DataStore.difficultyMatrix` so the standard surface (Lookup) doesn't
 * pay the ~31 MB download cost on boot.
 *
 * The promise is memoized so concurrent Compose generations across a
 * single page don't fire two parallel fetches.
 */
let aetherMatrixPromise: Promise<DifficultyMatrix> | null = null;

/**
 * Resolve the right `DifficultyMatrix` for a given resolver mode.
 *
 * Standard: routed through the existing `DataStore` cache (already used
 * by Lookup, so a Standard Compose run is essentially free after boot).
 *
 * Æther: pulls directly off `getAetherLoader()` and memoizes. The
 * `aether-arity3.n2k` blob is large (~31 MB) but loads exactly once
 * per session and is shared across Compose, the Æther Lookup overlay,
 * and any Play race configured with Æther rules.
 */
export async function loadDifficultyMatrixFor(
  mode: ResolverModeId,
  dataStore: DataStore,
  options: { onProgress?: (loaded: number, total: number) => void } = {},
): Promise<DifficultyMatrix> {
  options.onProgress?.(0, 1);
  if (mode === "standard") {
    await ensureDifficultyMatrixLoaded(dataStore);
    const state = dataStore.difficultyMatrix;
    if (state.status !== "ready") {
      throw new Error("Standard difficulty matrix not ready");
    }
    options.onProgress?.(1, 1);
    return state.value;
  }
  if (aetherMatrixPromise === null) {
    aetherMatrixPromise = getAetherLoader()
      .loadDifficultyMatrix()
      .catch((err) => {
        // Drop the cache so a retry isn't permanently broken by a
        // transient network failure.
        aetherMatrixPromise = null;
        throw err;
      });
  }
  const matrix = await aetherMatrixPromise;
  options.onProgress?.(1, 1);
  return matrix;
}
