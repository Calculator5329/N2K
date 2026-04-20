/**
 * `matchStats` — service for the Library tab's per-competition stats.
 *
 * Persists a rolling history of finished matches per competition under
 * the `stats:{compId}` namespace in the abstract `ContentBackend`.
 * Each comp's record is a small append-only log of `MatchRecord`s
 * (final score breakdowns, win/loss, timestamps); the `MatchStats`
 * roll-up (best avg, last played, totals) is computed on read.
 *
 * Why a separate doc per comp? `LocalStorage` quotas are per-key and
 * the typical user will have a handful of comps with at most a few
 * dozen matches each — well under the per-key cap (5MB on most
 * browsers). It also lets us prune one comp's history without
 * touching the others.
 *
 * `LibraryStore.refreshStats()` calls `loadAllStats()` to build a
 * `compId → MatchStats` map for the Library cards.
 */
import {
  defaultContentBackend,
  type ContentBackend,
  type ContentDoc,
} from "./contentBackend";

const STATS_PREFIX = "stats:";
const STATS_SCHEMA_VERSION = 1;

/** What format a match was played in. */
export type MatchFormat = "vs-bot" | "hot-seat";

/** Per-bout breakdown inside a `MatchRecord`. */
export interface MatchBoutRecord {
  readonly phaseIndex: number;
  readonly boardIndex: number;
  readonly boutIndex: number;
  readonly playerScore: number;
  readonly opponentScore: number;
  readonly playerCellsKnocked: number;
  readonly maxCells: number;
  readonly elapsedMs: number;
  readonly winner: "player" | "opponent" | "tie";
  /**
   * For hot-seat matches: which seat the user occupied for this race
   * (`"P1"` or `"P2"`). vs-bot matches always record `"P1"`.
   */
  readonly userSeat: "P1" | "P2";
}

/** A finished match, one record per match. Hot-seat sums into one record. */
export interface MatchRecord {
  readonly compId: string;
  readonly matchId: string;
  readonly format: MatchFormat;
  readonly finishedAt: string;
  readonly bots: readonly { readonly seat: "P1" | "P2"; readonly difficulty: string; readonly name: string }[];
  /** Bout-by-bout breakdown in chronological play order. */
  readonly bouts: readonly MatchBoutRecord[];
  /** Final aggregates (sums across every bout). */
  readonly userTotalScore: number;
  readonly opponentTotalScore: number;
  /**
   * For hot-seat: the user's score broken down by seat; both `P1`
   * and `P2` totals are populated. Null for vs-bot.
   */
  readonly userTotalsBySeat: { readonly P1: number; readonly P2: number } | null;
  readonly outcome: "win" | "loss" | "tie";
  /** Total races the user participated in (= bouts in vs-bot, 2× bouts in hot-seat). */
  readonly userRaceCount: number;
}

interface StatsDocBody {
  readonly version: 1;
  readonly compId: string;
  readonly matches: readonly MatchRecord[];
}

/**
 * Roll-up summary surfaced on the Library card + history drawer.
 * Computed from the stored `matches` array — never persisted directly.
 */
export interface MatchStats {
  readonly matches: readonly MatchRecord[];
  readonly lastPlayedAt: string | null;
  /**
   * `match.userTotalScore / match.userRaceCount`, taken across every
   * recorded match, kept as the best (highest). `null` when no
   * match has been recorded yet.
   */
  readonly bestAvgScore: number | null;
  readonly winRate: number | null;
}

/** Compute the roll-ups from a raw match log. */
export function computeMatchStats(matches: readonly MatchRecord[]): MatchStats {
  if (matches.length === 0) {
    return { matches, lastPlayedAt: null, bestAvgScore: null, winRate: null };
  }
  let lastPlayedAt: string | null = null;
  let bestAvg: number | null = null;
  let wins = 0;
  let decided = 0;
  for (const m of matches) {
    if (lastPlayedAt === null || m.finishedAt > lastPlayedAt) {
      lastPlayedAt = m.finishedAt;
    }
    if (m.userRaceCount > 0) {
      const avg = m.userTotalScore / m.userRaceCount;
      if (bestAvg === null || avg > bestAvg) bestAvg = avg;
    }
    if (m.outcome !== "tie") decided += 1;
    if (m.outcome === "win") wins += 1;
  }
  return {
    matches,
    lastPlayedAt,
    bestAvgScore: bestAvg,
    winRate: decided === 0 ? null : wins / decided,
  };
}

/** Append a new record to a comp's history. */
export async function recordMatch(
  record: MatchRecord,
  backend: ContentBackend = defaultContentBackend,
): Promise<void> {
  const id = STATS_PREFIX + record.compId;
  const existing = await backend.load<StatsDocBody>(id);
  const matches: MatchRecord[] = existing === null
    ? []
    : [...existing.body.matches];
  matches.push(record);
  const body: StatsDocBody = {
    version: 1,
    compId: record.compId,
    matches,
  };
  const doc: ContentDoc<StatsDocBody> = {
    id,
    body,
    updatedAt: new Date().toISOString(),
    schemaVersion: STATS_SCHEMA_VERSION,
  };
  await backend.save(doc);
}

/** Load history for a single comp. */
export async function loadStatsFor(
  compId: string,
  backend: ContentBackend = defaultContentBackend,
): Promise<readonly MatchRecord[]> {
  const doc = await backend.load<StatsDocBody>(STATS_PREFIX + compId);
  if (doc === null) return [];
  return doc.body.matches;
}

/** Build the roll-up map across every comp with stored stats. */
export async function loadAllStats(
  backend: ContentBackend = defaultContentBackend,
): Promise<ReadonlyMap<string, MatchStats>> {
  const ids = await backend.list();
  const out = new Map<string, MatchStats>();
  for (const id of ids) {
    if (!id.startsWith(STATS_PREFIX)) continue;
    const compId = id.slice(STATS_PREFIX.length);
    const matches = await loadStatsFor(compId, backend);
    out.set(compId, computeMatchStats(matches));
  }
  return out;
}

/** Drop a comp's entire history. Used when the comp itself is deleted. */
export async function clearStatsFor(
  compId: string,
  backend: ContentBackend = defaultContentBackend,
): Promise<void> {
  await backend.remove(STATS_PREFIX + compId);
}
