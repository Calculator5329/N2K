/**
 * `competitionService` — generate balanced two-player dice rolls for one
 * or more boards.
 *
 * For each board × round, draws candidate dice from the configured pool
 * and runs a tiny Monte-Carlo loop within the time budget to find the
 * pair of rolls whose **expected scores are closest**. Expected score
 * uses the dataset client to enumerate easiest equations for each rolled
 * tuple against the board's targets.
 *
 * Pure-ish: returns a structured plan object so the UI can render results,
 * export to JSON/PDF/DOCX, and persist via `ContentBackend` later.
 */
import { BUILT_IN_MODES } from "@platform/core/constants.js";
import type { Mode } from "@platform/core/types.js";
import { isLegalDiceForMode } from "@platform/services/generators.js";
import type { DatasetClient } from "./datasetClient.js";

export type CandidatePool = "depowered" | "standard" | "extensive" | "aether-sample";

/** UI-friendly metadata for the candidate pool dropdown. */
export interface CandidatePoolMeta {
  readonly id: CandidatePool;
  readonly label: string;
  readonly description: string;
}

export const CANDIDATE_POOL_META: readonly CandidatePoolMeta[] = [
  {
    id: "depowered",
    label: "Depowered (38)",
    description: "The original 38 prime-only triples — fastest to evaluate.",
  },
  {
    id: "standard",
    label: "Standard (2..20)",
    description: "Every legal triple in the standard mode dice range.",
  },
  {
    id: "extensive",
    label: "Extensive (1..20)",
    description: "Every legal triple including the rarely-used 1-die.",
  },
  {
    id: "aether-sample",
    label: "Æther sample (-5..20)",
    description: "Wider sample for balanced rolls in Æther mode.",
  },
];

export interface CompetitionConfig {
  readonly modeId: "standard" | "aether";
  readonly boards: ReadonlyArray<{
    readonly id: string;
    readonly cells: readonly number[];
    readonly rounds: number;
  }>;
  readonly pool: CandidatePool;
  readonly timeBudgetMs: number;
  readonly seed?: number;
}

export interface CompetitionRound {
  readonly index: number;
  readonly playerA: { readonly dice: readonly number[]; readonly expectedScore: number };
  readonly playerB: { readonly dice: readonly number[]; readonly expectedScore: number };
  readonly delta: number;
}

export interface CompetitionResult {
  readonly boardId: string;
  readonly rounds: readonly CompetitionRound[];
  readonly totals: { readonly playerA: number; readonly playerB: number };
}

export interface CompetitionPlan {
  readonly config: CompetitionConfig;
  readonly results: readonly CompetitionResult[];
  readonly elapsedMs: number;
}

export interface CompetitionService {
  generate(config: CompetitionConfig): Promise<CompetitionPlan>;
}

export class LiveCompetitionService implements CompetitionService {
  constructor(private readonly dataset: DatasetClient) {}

  async generate(config: CompetitionConfig): Promise<CompetitionPlan> {
    const start = Date.now();
    const mode = BUILT_IN_MODES[config.modeId];
    const rng = mulberry32(config.seed ?? Date.now());

    const candidates = candidatePoolFor(mode, config.pool);

    const results: CompetitionResult[] = [];
    for (const board of config.boards) {
      const boardTargets = new Set(board.cells);
      const rounds: CompetitionRound[] = [];
      let totalA = 0;
      let totalB = 0;
      for (let i = 0; i < board.rounds; i += 1) {
        const round = await this.findBalancedRound(
          mode,
          candidates,
          boardTargets,
          rng,
          Math.max(50, Math.floor(config.timeBudgetMs / Math.max(1, board.rounds))),
          i,
        );
        rounds.push(round);
        totalA += round.playerA.expectedScore;
        totalB += round.playerB.expectedScore;
      }
      results.push({
        boardId: board.id,
        rounds,
        totals: { playerA: totalA, playerB: totalB },
      });
    }

    return {
      config,
      results,
      elapsedMs: Date.now() - start,
    };
  }

  private async findBalancedRound(
    mode: Mode,
    candidates: readonly (readonly number[])[],
    boardTargets: ReadonlySet<number>,
    rng: () => number,
    timeBudgetMs: number,
    roundIndex: number,
  ): Promise<CompetitionRound> {
    const deadline = Date.now() + timeBudgetMs;
    let bestPair: { a: readonly number[]; b: readonly number[]; aScore: number; bScore: number } | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    while (Date.now() < deadline) {
      const a = candidates[Math.floor(rng() * candidates.length)]!;
      const b = candidates[Math.floor(rng() * candidates.length)]!;
      const aScore = await this.expectedScore(mode, a, boardTargets);
      const bScore = await this.expectedScore(mode, b, boardTargets);
      const delta = Math.abs(aScore - bScore);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestPair = { a, b, aScore, bScore };
        if (delta < 0.5) break;
      }
    }

    if (bestPair === null) {
      // Fallback: at least one pair ran.
      const a = candidates[0]!;
      const b = candidates[Math.min(1, candidates.length - 1)]!;
      const aScore = await this.expectedScore(mode, a, boardTargets);
      const bScore = await this.expectedScore(mode, b, boardTargets);
      bestPair = { a, b, aScore, bScore };
      bestDelta = Math.abs(aScore - bScore);
    }

    return {
      index: roundIndex,
      playerA: { dice: bestPair.a, expectedScore: bestPair.aScore },
      playerB: { dice: bestPair.b, expectedScore: bestPair.bScore },
      delta: bestDelta,
    };
  }

  /**
   * Expected score = number of board cells reachable by `dice` minus a
   * difficulty penalty. Uses cached chunks so repeated tuples cost
   * nothing after the first lookup.
   */
  private async expectedScore(
    mode: Mode,
    dice: readonly number[],
    boardTargets: ReadonlySet<number>,
  ): Promise<number> {
    const chunk = await this.dataset.getChunk(mode, dice);
    let score = 0;
    for (const t of boardTargets) {
      const sol = chunk.solutions.get(t);
      if (sol === undefined) continue;
      // Reachable target awards points; harder solves pay slightly less
      // because they're less likely to be found at the table.
      const easeFactor = Math.max(0.25, 1 - sol.difficulty / 100);
      score += easeFactor;
    }
    return score;
  }
}

function candidatePoolFor(mode: Mode, pool: CandidatePool): readonly (readonly number[])[] {
  switch (pool) {
    case "depowered":
      return DEPOWERED_TRIPLES;
    case "standard":
      return enumerateStandardTriples();
    case "extensive":
      return enumerateExtensiveTriples();
    case "aether-sample":
      return enumerateAetherSample(mode);
  }
}

/**
 * The classic depowered dice list — 38 triples drawn from the original
 * tabletop game. Constant array (no enumeration) so it loads in O(1).
 */
const DEPOWERED_TRIPLES: readonly (readonly number[])[] = [
  [2, 2, 2], [2, 2, 3], [2, 2, 5], [2, 2, 6], [2, 2, 7], [2, 2, 10],
  [2, 3, 3], [2, 3, 5], [2, 3, 6], [2, 3, 7], [2, 3, 10], [2, 3, 11],
  [2, 3, 12], [2, 3, 13], [2, 3, 14], [2, 3, 15], [2, 3, 17], [2, 3, 18],
  [2, 3, 19], [2, 3, 20], [2, 5, 5], [2, 5, 6], [2, 5, 10], [2, 6, 6],
  [2, 6, 7], [2, 6, 12], [3, 3, 5], [3, 3, 6], [3, 3, 12], [3, 5, 5],
  [3, 5, 6], [3, 5, 7], [3, 5, 15], [3, 6, 6], [3, 6, 7], [3, 6, 10],
  [3, 6, 12], [3, 6, 18],
];

let standardCache: readonly (readonly number[])[] | null = null;
function enumerateStandardTriples(): readonly (readonly number[])[] {
  if (standardCache !== null) return standardCache;
  const out: number[][] = [];
  const mode = BUILT_IN_MODES.standard;
  for (let a = mode.diceRange.min; a <= mode.diceRange.max; a += 1) {
    for (let b = a; b <= mode.diceRange.max; b += 1) {
      for (let c = b; c <= mode.diceRange.max; c += 1) {
        const dice = [a, b, c];
        if (!isLegalDiceForMode(dice, mode)) continue;
        out.push(dice);
      }
    }
  }
  standardCache = out;
  return out;
}

let extensiveCache: readonly (readonly number[])[] | null = null;
function enumerateExtensiveTriples(): readonly (readonly number[])[] {
  if (extensiveCache !== null) return extensiveCache;
  const out: number[][] = [];
  const mode = BUILT_IN_MODES.standard;
  for (let a = 1; a <= 20; a += 1) {
    for (let b = a; b <= 20; b += 1) {
      for (let c = b; c <= 20; c += 1) {
        const dice = [a, b, c];
        if (!isLegalDiceForMode(dice, mode)) continue;
        out.push(dice);
      }
    }
  }
  extensiveCache = out;
  return out;
}

function enumerateAetherSample(mode: Mode): readonly (readonly number[])[] {
  const out: number[][] = [];
  for (let a = -5; a <= 20; a += 1) {
    for (let b = a; b <= 20; b += 1) {
      for (let c = b; c <= 20; c += 1) {
        const dice = [a, b, c];
        if (!isLegalDiceForMode(dice, mode)) continue;
        out.push(dice);
      }
    }
  }
  return out;
}

/** Tiny seeded RNG (Mulberry32) — deterministic, ~32-bit period plenty. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
