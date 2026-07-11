/**
 * Local daily-challenge primitives.
 *
 * This module deliberately has no browser or network dependency.  The web
 * layer can pass `globalThis.localStorage`; tests and other clients can pass a
 * small Storage-shaped object.  A challenge is wholly identified by the
 * player's local calendar date, so loading it never needs an account or a
 * remote clock.
 */
import { BOARD, STANDARD_MODE } from "../core/constants.js";
import type { Board } from "../core/types.js";
import { generateRandomBoard, generateRandomDice } from "./generators.js";

export const DAILY_RESULT_STORAGE_PREFIX = "n2k:daily:";

export interface DailyChallenge {
  readonly dateKey: string;
  readonly seed: number;
  readonly board: Board;
  readonly dice: readonly number[];
}

export interface DailyResult {
  readonly dateKey: string;
  readonly score: number;
  readonly cellsCleared: number;
  readonly elapsedMs: number;
  readonly completedAt: string;
}

export interface DailyCompletion {
  readonly result: DailyResult;
  readonly best: DailyResult;
  readonly isNewBest: boolean;
  readonly comeBackTomorrow: true;
}

/** The subset of the Web Storage API needed by daily persistence. */
export interface DailyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Format a Date as a local (not UTC) ISO-like calendar key. */
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Stable 32-bit seed for a validated YYYY-MM-DD date key. */
export function dailySeed(dateKey: string): number {
  assertDateKey(dateKey);
  // FNV-1a with Math.imul keeps the result identical in Node and browsers.
  let hash = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i += 1) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Small deterministic RNG suitable for feeding the canonical generators. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Build the one canonical Standard challenge for a local calendar date. */
export function dailyChallengeForDate(dateKey: string): DailyChallenge {
  const seed = dailySeed(dateKey);
  const rng = seededRandom(seed);
  return {
    dateKey,
    seed,
    board: {
      rows: BOARD.rows,
      cols: BOARD.cols,
      cells: generateRandomBoard(STANDARD_MODE, { rng }),
    },
    // Use the same RNG stream so the whole challenge, not only its board, is
    // reproducible. The generator retains Standard's legality guarantees.
    dice: generateRandomDice(STANDARD_MODE, { rng }),
  };
}

export function todaysDailyChallenge(now: Date = new Date()): DailyChallenge {
  return dailyChallengeForDate(localDateKey(now));
}

export function loadDailyBest(
  storage: DailyStorage,
  dateKey: string,
): DailyResult | null {
  assertDateKey(dateKey);
  const raw = storage.getItem(DAILY_RESULT_STORAGE_PREFIX + dateKey);
  if (raw === null) return null;
  try {
    const candidate = JSON.parse(raw) as Partial<DailyResult>;
    return isDailyResult(candidate, dateKey) ? candidate as DailyResult : null;
  } catch {
    return null;
  }
}

/**
 * Persist a completed attempt and return the post-race presentation state.
 * More score wins; ties prefer more cells and then less elapsed time.
 */
export function completeDailyChallenge(
  storage: DailyStorage,
  result: DailyResult,
): DailyCompletion {
  if (!isDailyResult(result, result.dateKey)) {
    throw new RangeError("Invalid daily challenge result");
  }
  const previous = loadDailyBest(storage, result.dateKey);
  const isNewBest = previous === null || compareResults(result, previous) > 0;
  const best = isNewBest ? result : previous;
  if (isNewBest) {
    storage.setItem(
      DAILY_RESULT_STORAGE_PREFIX + result.dateKey,
      JSON.stringify(result),
    );
  }
  return { result, best, isNewBest, comeBackTomorrow: true };
}

function compareResults(a: DailyResult, b: DailyResult): number {
  return a.score - b.score ||
    a.cellsCleared - b.cellsCleared ||
    b.elapsedMs - a.elapsedMs;
}

function assertDateKey(dateKey: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new RangeError(`Invalid daily date key "${dateKey}"; expected YYYY-MM-DD`);
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  const probe = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month! - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid daily calendar date "${dateKey}"`);
  }
}

function isDailyResult(
  value: Partial<DailyResult>,
  expectedDate: string,
): value is DailyResult {
  try {
    assertDateKey(expectedDate);
  } catch {
    return false;
  }
  return value.dateKey === expectedDate &&
    Number.isFinite(value.score) && value.score! >= 0 &&
    Number.isInteger(value.cellsCleared) && value.cellsCleared! >= 0 &&
    value.cellsCleared! <= BOARD.size &&
    Number.isFinite(value.elapsedMs) && value.elapsedMs! >= 0 &&
    typeof value.completedAt === "string" &&
    !Number.isNaN(Date.parse(value.completedAt));
}
