/**
 * `.n2k` blob loader for the web app.
 *
 * Replaces the legacy `datasetService.ts` JSON-fetching layer with a
 * single binary fetch + lazy chunk decode. Same public surface — the
 * `DataStore` doesn't know whether it's reading from JSON or binary —
 * so swapping happens at this seam alone.
 *
 * Usage shape:
 *
 *   const loader = new N2kLoader(`${BASE_URL}data/standard.n2k`);
 *   await loader.ready();             // fetch + parse header
 *   const detail = await loader.loadDice([2, 3, 5]);  // lazy chunk decode
 *
 * Bulk shapes (`loadByTarget`, `loadTargetStats`,
 * `loadDifficultyMatrix`) decode every tuple's chunk on first call and
 * memoize the result. The bulk decode runs ~250ms on a modern laptop
 * for the Standard dataset (~1,200 tuples), small enough to do
 * synchronously after the blob arrives.
 */
import {
  decodeChunk,
  type BinaryChunkRecord,
} from "@solver/core/n2kBinary.js";
import {
  decodeBlobHeader,
  type BlobHeader,
  type BlobTupleEntry,
} from "@solver/core/n2kBlob.js";
import { depowerDice } from "@solver/core/constants.js";
import { formatEquation } from "@solver/services/parsing.js";
import type {
  ByTargetEntry,
  DatasetIndex,
  DiceDetail,
  DiceSummary,
  DiceTriple,
  DifficultyMatrix,
  Solution,
  TargetStatsEntry,
} from "../core/types";

function diceKey(dice: readonly number[]): string {
  return dice.join("-");
}

interface DecodedChunk {
  readonly entry: BlobTupleEntry;
  readonly records: readonly BinaryChunkRecord[];
}

/**
 * Arity-agnostic per-tuple detail. Returned by {@link N2kLoader.loadTuple}
 * for callers that don't want the dice array forced into the legacy
 * 3-tuple shape used by the Standard-mode UI types.
 *
 * `solutions` and `summary` use the same shape as `DiceDetail` so the
 * Standard-mode `loadDice` is a thin wrapper over `loadTuple`.
 */
export interface TupleDetail {
  readonly dice: readonly number[];
  readonly summary: Omit<DiceSummary, "dice">;
  readonly solutions: Readonly<Record<string, Solution>>;
}

export class N2kLoader {
  readonly url: string;
  private fetchPromise: Promise<void> | null = null;
  private blobBytes: Uint8Array | null = null;
  private header: BlobHeader | null = null;
  private tuplesByKey: Map<string, BlobTupleEntry> | null = null;
  private decodedChunks: Map<string, DecodedChunk> = new Map();

  // Memoized rollups (built once after the first call requesting them).
  private cachedByTarget: Readonly<Record<string, ByTargetEntry | null>> | null = null;
  private cachedTargetStats: Readonly<Record<string, TargetStatsEntry>> | null = null;
  private cachedDifficultyMatrix: DifficultyMatrix | null = null;

  constructor(url: string) {
    this.url = url;
  }

  /** Fetch + parse the header. Idempotent and concurrency-safe. */
  ready(): Promise<void> {
    if (this.fetchPromise !== null) return this.fetchPromise;
    this.fetchPromise = (async () => {
      const response = await fetch(this.url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${this.url}: ${response.status} ${response.statusText}`,
        );
      }
      const buf = await response.arrayBuffer();
      this.blobBytes = new Uint8Array(buf);
      this.header = decodeBlobHeader(this.blobBytes);
      const map = new Map<string, BlobTupleEntry>();
      for (const t of this.header.tuples) map.set(diceKey(t.dice), t);
      this.tuplesByKey = map;
    })();
    return this.fetchPromise;
  }

  /** Synthesize a `DatasetIndex` from the blob header's per-tuple summaries. */
  async loadIndex(): Promise<DatasetIndex> {
    await this.ready();
    const h = this.header!;
    const dice = h.tuples.map((t) => ({
      dice: tupleToDiceTriple(t.dice),
      solvableCount: t.solvableCount,
      impossibleCount: t.impossibleCount,
      minDifficulty: t.solvableCount === 0 ? null : t.minDifficulty,
      maxDifficulty: t.solvableCount === 0 ? null : t.maxDifficulty,
      averageDifficulty:
        t.solvableCount === 0
          ? null
          : roundDifficulty(t.sumDifficulty / t.solvableCount),
    }));
    return {
      generatedAt: new Date(0).toISOString(),
      diceMin: h.diceMin,
      diceMax: h.diceMax,
      totalMin: h.targetMin,
      totalMax: h.targetMax,
      depower: h.modeId === "standard",
      recordsWritten: h.totalRecords,
      diceTriplesTotal: h.tuples.length,
      dice,
    };
  }

  async loadDice(dice: DiceTriple): Promise<DiceDetail> {
    const detail = await this.loadTuple(dice);
    return {
      dice: tupleToDiceTriple(detail.dice),
      summary: detail.summary,
      solutions: detail.solutions,
    };
  }

  /**
   * Arity-agnostic counterpart to {@link loadDice}. Returns the per-tuple
   * detail without forcing the dice array into a 3-tuple shape, so the
   * arity-4 / arity-5 Æther lookups can share this loader.
   *
   * Throws — same as `loadDice` — if the tuple isn't in the blob. Callers
   * that want a "miss returns null" semantics should `.catch(() => null)`.
   */
  async loadTuple(dice: readonly number[]): Promise<TupleDetail> {
    await this.ready();
    const canonical = this.canonicalizeDiceTuple(dice);
    const decoded = this.decodeFor(canonical);
    if (decoded === null) {
      throw new Error(
        `n2kLoader: dice [${canonical.join(", ")}] is not present in the blob`,
      );
    }
    const solutions: Record<string, { difficulty: number; equation: string }> = {};
    for (const rec of decoded.records) {
      solutions[String(rec.equation.total)] = {
        difficulty: roundDifficulty(rec.difficulty),
        equation: formatEquation(rec.equation),
      };
    }
    const t = decoded.entry;
    return {
      dice: canonical,
      summary: {
        solvableCount: t.solvableCount,
        impossibleCount: t.impossibleCount,
        minDifficulty: t.solvableCount === 0 ? null : roundDifficulty(t.minDifficulty),
        maxDifficulty: t.solvableCount === 0 ? null : roundDifficulty(t.maxDifficulty),
        averageDifficulty:
          t.solvableCount === 0
            ? null
            : roundDifficulty(t.sumDifficulty / t.solvableCount),
      },
      solutions,
    };
  }

  /** True iff the tuple has a chunk in the blob (no decode triggered). */
  async hasTuple(dice: readonly number[]): Promise<boolean> {
    await this.ready();
    const canonical = this.canonicalizeDiceTuple(dice);
    return this.tuplesByKey!.has(diceKey(canonical));
  }

  async loadByTarget(): Promise<Readonly<Record<string, ByTargetEntry | null>>> {
    await this.ready();
    if (this.cachedByTarget !== null) return this.cachedByTarget;
    this.buildRollups();
    return this.cachedByTarget!;
  }

  async loadTargetStats(): Promise<Readonly<Record<string, TargetStatsEntry>>> {
    await this.ready();
    if (this.cachedTargetStats !== null) return this.cachedTargetStats;
    this.buildRollups();
    return this.cachedTargetStats!;
  }

  async loadDifficultyMatrix(): Promise<DifficultyMatrix> {
    await this.ready();
    if (this.cachedDifficultyMatrix !== null) return this.cachedDifficultyMatrix;

    const h = this.header!;
    const cellsPerRow = h.targetMax - h.targetMin + 1;
    const dice: Record<string, (number | null)[]> = {};
    for (const t of h.tuples) {
      const row: (number | null)[] = new Array(cellsPerRow).fill(null);
      const decoded = this.decodeFor(t.dice);
      if (decoded !== null) {
        for (const rec of decoded.records) {
          const idx = rec.equation.total - h.targetMin;
          if (idx >= 0 && idx < cellsPerRow) {
            row[idx] = roundDifficulty(rec.difficulty);
          }
        }
      }
      dice[diceKey(t.dice)] = row;
    }

    this.cachedDifficultyMatrix = {
      totalMin: h.targetMin,
      totalMax: h.targetMax,
      dice,
    };
    return this.cachedDifficultyMatrix;
  }

  // -------------------------------------------------------------------
  //  Internals
  // -------------------------------------------------------------------

  /**
   * Map a user-supplied dice tuple onto the canonical key that the bake
   * script wrote into the blob. Standard mode pre-processes dice via
   * `depowerDice` (4/8/16 → 2, 9 → 3) before solving, so a Lookup query
   * for `[2, 3, 4]` must depower to `[2, 2, 3]` before the chunk lookup —
   * otherwise the blob entry is "missing" and we wrongly surface a
   * "Couldn't load solutions" error to the user.
   *
   * Æther mode keeps every face value distinct (no depower), so we just
   * sort. Works for any arity — a multiset is a multiset.
   */
  private canonicalizeDiceTuple(dice: readonly number[]): readonly number[] {
    const modeId = this.header?.modeId ?? "standard";
    const mapped =
      modeId === "standard" ? dice.map((d) => depowerDice(d)) : [...dice];
    return mapped.sort((a, b) => a - b);
  }

  private decodeFor(canonicalDice: readonly number[]): DecodedChunk | null {
    const key = diceKey(canonicalDice);
    const cached = this.decodedChunks.get(key);
    if (cached !== undefined) return cached;
    const entry = this.tuplesByKey!.get(key);
    if (entry === undefined) return null;
    const start = this.header!.chunksStart + entry.chunkOffset;
    const slice = this.blobBytes!.subarray(start, start + entry.chunkLength);
    const chunk = decodeChunk(slice);
    const decoded: DecodedChunk = { entry, records: chunk.equations };
    this.decodedChunks.set(key, decoded);
    return decoded;
  }

  /**
   * Walk every tuple's chunk once and build the global `byTarget` /
   * `targetStats` maps. Cheaper to share the iteration than to do two
   * full decode passes from the consumer side.
   */
  private buildRollups(): void {
    const h = this.header!;
    type Acc = {
      easiest: ByTargetEntry | null;
      hardest: ByTargetEntry | null;
      solverCount: number;
    };
    const acc: Map<number, Acc> = new Map();
    for (let target = h.targetMin; target <= h.targetMax; target += 1) {
      acc.set(target, { easiest: null, hardest: null, solverCount: 0 });
    }

    for (const t of h.tuples) {
      const decoded = this.decodeFor(t.dice);
      if (decoded === null) continue;
      const dicePub = tupleToDiceTriple(t.dice);
      const seen = new Set<number>();
      for (const rec of decoded.records) {
        const target = rec.equation.total;
        const slot = acc.get(target);
        if (slot === undefined) continue;
        const equationStr = formatEquation(rec.equation);
        const difficulty = roundDifficulty(rec.difficulty);
        const candidate: ByTargetEntry = {
          dice: dicePub,
          difficulty,
          equation: equationStr,
        };
        if (slot.easiest === null || difficulty < slot.easiest.difficulty) {
          slot.easiest = candidate;
        }
        if (slot.hardest === null || difficulty > slot.hardest.difficulty) {
          slot.hardest = candidate;
        }
        if (!seen.has(target)) {
          slot.solverCount += 1;
          seen.add(target);
        }
      }
    }

    const byTarget: Record<string, ByTargetEntry | null> = {};
    const targetStats: Record<string, TargetStatsEntry> = {};
    for (let target = h.targetMin; target <= h.targetMax; target += 1) {
      const slot = acc.get(target)!;
      const key = String(target);
      byTarget[key] = slot.easiest;
      targetStats[key] = {
        easiest: slot.easiest,
        hardest: slot.hardest,
        solverCount: slot.solverCount,
      };
    }
    this.cachedByTarget = byTarget;
    this.cachedTargetStats = targetStats;
  }
}

function tupleToDiceTriple(t: readonly number[]): DiceTriple {
  if (t.length !== 3) {
    throw new RangeError(
      `n2kLoader: expected 3-tuple but got length ${t.length} ([${t.join(", ")}])`,
    );
  }
  return [t[0]!, t[1]!, t[2]!] as const;
}

function roundDifficulty(d: number): number {
  return Math.round(d * 100) / 100;
}

// ---------------------------------------------------------------------------
//  Singleton loaders
// ---------------------------------------------------------------------------

const STANDARD_BLOB_URL = `${import.meta.env.BASE_URL}data/standard.n2k`;
const AETHER_3ARITY_BLOB_URL = `${import.meta.env.BASE_URL}data/aether-arity3.n2k`;

/** Standard mode blob — `datasetService` is a thin facade over this loader. */
export const standardLoader = new N2kLoader(STANDARD_BLOB_URL);

/**
 * Æther arity-3 precomputed blob — the original "full legality" blob
 * shipped at the top of v3. Lazily constructed so a Standard-only page
 * never pays the fetch cost.
 */
let aetherLoaderInstance: N2kLoader | null = null;
export function getAetherLoader(): N2kLoader {
  if (aetherLoaderInstance === null) {
    aetherLoaderInstance = new N2kLoader(AETHER_3ARITY_BLOB_URL);
  }
  return aetherLoaderInstance;
}

/**
 * Per-arity Æther loader factory.
 *
 *   - arity 3 → existing `aether-arity3.n2k` (full legality, ~30 MB)
 *   - arity 4 → `aether-arity4-commons.n2k` (Tier-1 commons curation)
 *   - arity 5 → `aether-arity5-commons.n2k` (Tier-1 commons curation)
 *
 * Returns `null` for any arity that doesn't have a baked blob URL on
 * record yet — callers fall back to the live `aetherSolverWorker`. This
 * lets us ship blob support arity-by-arity (arity 4 first, arity 5
 * after the longer bake) without the loader code learning about each
 * one separately.
 *
 * Each arity gets its own cached `N2kLoader`, so the arity-3 blob is
 * never re-fetched when a user drives the arity-4 picker, and vice
 * versa. The arity-3 instance is shared with `getAetherLoader()` so
 * any pre-existing fetch state is reused.
 */
const aetherLoaderByArity = new Map<number, N2kLoader>();
export function getAetherLoaderForArity(arity: number): N2kLoader | null {
  const cached = aetherLoaderByArity.get(arity);
  if (cached !== undefined) return cached;
  const url = aetherBlobUrlForArity(arity);
  if (url === null) return null;
  const instance = arity === 3 ? getAetherLoader() : new N2kLoader(url);
  aetherLoaderByArity.set(arity, instance);
  return instance;
}

function aetherBlobUrlForArity(arity: number): string | null {
  switch (arity) {
    case 3:
      return AETHER_3ARITY_BLOB_URL;
    case 4:
      return `${import.meta.env.BASE_URL}data/aether-arity4-commons.n2k`;
    case 5:
      return `${import.meta.env.BASE_URL}data/aether-arity5-commons.n2k`;
    default:
      return null;
  }
}

