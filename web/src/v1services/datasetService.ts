import type {
  ByTargetEntry,
  DatasetIndex,
  DiceDetail,
  DiceTriple,
  DifficultyMatrix,
  TargetStatsEntry,
} from "../core/types";

/**
 * Stateless data-loading service. Knows where the JSON files live and how
 * to fetch them. No caching here — that's the store's job.
 *
 * `import.meta.env.BASE_URL` is the deployment base path injected by Vite
 * (`/` for local dev / preview, `/N2K-Comprehensive-v2/` on GitHub Pages).
 * Always ends with a trailing slash, so we can safely concatenate.
 */

const BASE_PATH = `${import.meta.env.BASE_URL}data`;

function diceKey(dice: DiceTriple): string {
  return `${dice[0]}-${dice[1]}-${dice[2]}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/**
 * Wrap `fetchJson` with bounded retries for transient transport failures.
 * Browsers surface socket exhaustion / network blips as a bare
 * `TypeError: Failed to fetch` (no HTTP status). When the Compose
 * "Extensive" pool kicks off ~1,540 parallel fetches the connection pool
 * occasionally drops one — retrying with a short backoff is enough to
 * recover. HTTP error responses (404 etc.) are NOT retried because they
 * indicate a real missing chunk, not a transport blip.
 */
async function fetchJsonWithRetry<T>(url: string, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetchJson<T>(url);
    } catch (err) {
      lastError = err;
      if (!(err instanceof TypeError)) throw err;
      if (i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 100 * 2 ** i));
    }
  }
  throw lastError;
}

export const datasetService = {
  loadIndex(): Promise<DatasetIndex> {
    return fetchJson<DatasetIndex>(`${BASE_PATH}/index.json`);
  },

  loadDice(dice: DiceTriple): Promise<DiceDetail> {
    return fetchJsonWithRetry<DiceDetail>(`${BASE_PATH}/dice/${diceKey(dice)}.json`);
  },

  loadByTarget(): Promise<Readonly<Record<string, ByTargetEntry | null>>> {
    return fetchJson(`${BASE_PATH}/by-target.json`);
  },

  loadTargetStats(): Promise<Readonly<Record<string, TargetStatsEntry>>> {
    return fetchJson(`${BASE_PATH}/target-stats.json`);
  },

  /**
   * Single-fetch equation-stripped difficulty matrix. Used by Compose to
   * resolve `(dice, target) -> difficulty` for a whole candidate pool
   * without 1,500 lazy chunk requests.
   */
  loadDifficultyMatrix(): Promise<DifficultyMatrix> {
    return fetchJson<DifficultyMatrix>(`${BASE_PATH}/difficulty.json`);
  },
};
