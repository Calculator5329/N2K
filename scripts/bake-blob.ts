/**
 * Bake a single `<mode>.n2k` blob (header + concatenated chunks) for
 * the web app to fetch on boot.
 *
 *   npm run bake -- --mode standard --out ./web/public/data
 *   npm run bake -- --mode aether   --arity 3 --out ./web/public/data
 *   npm run bake -- --mode aether   --arity 4 --legality commons
 *   npm run bake -- --mode aether   --arity 5 --legality commons
 *
 * Flags:
 *   --mode <standard|aether>           required
 *   --arity <3|4|5>                    defaults to 3 (Standard is always 3)
 *   --legality <legal|commons|extended> defaults to "legal" (full universe).
 *                                       "commons" = curated Tier-1 set
 *                                       (dice ∈ {2..12, 15, 20}, no 1s,
 *                                       ≤ 2 of any value). "extended" =
 *                                       Tier 2 (dice ∈ {2..20}).
 *   --out <dir>                        defaults to ./web/public/data
 *   --concurrency <n>                  defaults to os.cpus().length - 1
 *
 * Drives the existing `WorkerPool` + `exporter.worker.ts` pipeline,
 * collects per-tuple summaries while encoding chunks, and writes a
 * blob in the wire format described by `core/n2kBlob.ts`. The legacy
 * per-chunk JSON files and `manifest.json` are intentionally NOT
 * written here — `scripts/export.ts` still owns that mode.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cpus } from "node:os";
import { AETHER_MODE, STANDARD_MODE } from "../src/core/constants.js";
import { encodeChunk } from "../src/core/n2kBinary.js";
import { encodeBlobHeader, type BlobTupleEntry } from "../src/core/n2kBlob.js";
import { enumerateUnorderedTuples } from "../src/services/arithmetic.js";
import { canonicalizeTuple, toBinaryChunk } from "../src/services/exporter.js";
import { isLegalDiceForMode } from "../src/services/generators.js";
import {
  isCommonDiceTuple,
  isExtendedDiceTuple,
} from "../src/core/legality.js";
import type { Arity, BulkSolution, Mode } from "../src/core/types.js";
import { WorkerPool } from "../src/services/workerPool.js";
import type {
  ExportWorkerJob,
  ExportWorkerResult,
} from "../src/services/exporter.worker.js";

/**
 * Curation tier — restricts which legal dice tuples actually get baked.
 *
 *   `legal`    — every tuple `isLegalDiceForMode` accepts. The full
 *                universe; produces the "complete" blobs (today's
 *                `aether-arity3.n2k` is `legal`).
 *   `commons`  — `isCommonDiceTuple`: dice in {2..12, 15, 20}, no 1s,
 *                ≤ 2 of any value. Tier 1 from the v2++ plan; produces
 *                a much smaller blob aimed at the 80% case so the
 *                lookup feels instant for everyday rolls.
 *   `extended` — `isExtendedDiceTuple`: same shape as commons but with
 *                dice ∈ {2..20}. Tier 2; not shipped by default.
 */
type LegalityTier = "legal" | "commons" | "extended";

interface ParsedArgs {
  mode: "standard" | "aether";
  arity: Arity;
  legality: LegalityTier;
  out: string;
  concurrency: number;
  /**
   * Smoke-test cap: bake only the first N tuples (after canonicalize +
   * sort). Useful for verifying the round-trip end-to-end without
   * waiting for an hours-long full bake. Filename gets a `-smoke<N>`
   * suffix so the partial blob can't accidentally be served to users
   * thinking it's the real one.
   */
  limit: number | null;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }

  const mode = (args.mode ?? "") as string;
  if (mode !== "standard" && mode !== "aether") {
    throw new Error(`--mode must be "standard" or "aether" (got "${String(args.mode)}")`);
  }
  const arityRaw = typeof args.arity === "string" ? args.arity : "3";
  if (arityRaw !== "3" && arityRaw !== "4" && arityRaw !== "5") {
    throw new Error(`--arity must be 3, 4, or 5`);
  }
  if (mode === "standard" && arityRaw !== "3") {
    throw new Error(`--arity is locked to 3 in standard mode`);
  }
  const arity = parseInt(arityRaw, 10) as Arity;

  const legalityRaw =
    typeof args.legality === "string" ? args.legality : "legal";
  if (
    legalityRaw !== "legal" &&
    legalityRaw !== "commons" &&
    legalityRaw !== "extended"
  ) {
    throw new Error(
      `--legality must be "legal", "commons", or "extended" (got "${legalityRaw}")`,
    );
  }
  const legality = legalityRaw as LegalityTier;

  const out =
    typeof args.out === "string" ? args.out : "./web/public/data";
  const concurrency =
    typeof args.concurrency === "string"
      ? Math.max(1, parseInt(args.concurrency, 10))
      : Math.max(1, cpus().length - 1);

  const limitRaw = typeof args.limit === "string" ? args.limit : null;
  const limit = limitRaw === null ? null : Math.max(1, parseInt(limitRaw, 10));
  if (limit !== null && !Number.isFinite(limit)) {
    throw new Error(`--limit must be a positive integer, got "${limitRaw}"`);
  }

  return { mode, arity, legality, out: resolve(out), concurrency, limit };
}

/** Predicate for the chosen tier — applied to the canonical (sorted) tuple. */
function tupleAllowedForTier(
  tuple: readonly number[],
  tier: LegalityTier,
): boolean {
  switch (tier) {
    case "legal":    return true;
    case "commons":  return isCommonDiceTuple(tuple);
    case "extended": return isExtendedDiceTuple(tuple);
  }
}

function summarizeEquations(equations: readonly BulkSolution[]): {
  solvableCount: number;
  minDifficulty: number;
  maxDifficulty: number;
  sumDifficulty: number;
} {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const e of equations) {
    if (e.difficulty < min) min = e.difficulty;
    if (e.difficulty > max) max = e.difficulty;
    sum += e.difficulty;
  }
  return {
    solvableCount: equations.length,
    minDifficulty: equations.length === 0 ? 0 : min,
    maxDifficulty: equations.length === 0 ? 0 : max,
    sumDifficulty: sum,
  };
}

function renderProgress(done: number, total: number, startedAt: number): void {
  const pct = total === 0 ? 100 : Math.floor((done / total) * 100);
  const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
  const ratePerSec = elapsedSec === 0 ? 0 : done / elapsedSec;
  const remaining = Math.max(0, total - done);
  const etaSec = ratePerSec === 0 ? 0 : Math.round(remaining / ratePerSec);
  const barWidth = 30;
  const filled = Math.floor((barWidth * done) / Math.max(1, total));
  const bar =
    "=".repeat(filled) +
    (filled < barWidth ? ">" : "") +
    " ".repeat(Math.max(0, barWidth - filled - 1));
  const eta = formatEta(etaSec);
  const line =
    `[${bar}] ${done}/${total} (${pct}%)  ${formatEta(elapsedSec)} elapsed  ` +
    `eta ${eta}  ${ratePerSec.toFixed(2)} tuples/s`;

  if (process.stdout.isTTY) {
    process.stdout.write(`\r${line}  `);
    return;
  }

  // Non-TTY (backgrounded shell, log file): we want enough cadence that
  // an overnight bake's health is observable from the outside. Strategy:
  //   - first 3 tuples (proves the worker pool came up)
  //   - every 10 for the first 100 (early ramp visibility)
  //   - every 50 thereafter
  //   - the last tuple, always
  const verbose =
    done === 1 ||
    done === 2 ||
    done === 3 ||
    done === total ||
    (done <= 100 && done % 10 === 0) ||
    done % 50 === 0;
  if (verbose) {
    process.stdout.write(`${new Date().toISOString()}  ${line}\n`);
  }
}

function formatEta(sec: number): string {
  if (sec <= 0) return "0s";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const mode: Mode = parsed.mode === "standard" ? STANDARD_MODE : AETHER_MODE;

  // Enumerate every legal dice tuple at this arity, then canonicalize
  // and de-duplicate. Standard mode's depower step collapses pools like
  // (4, 8, 16) → (2, 2, 2) so different-looking inputs share a chunk.
  const rawTuples = enumerateUnorderedTuples(
    parsed.arity,
    mode.diceRange.min,
    mode.diceRange.max,
  ).filter((t) => isLegalDiceForMode(t, mode));

  const canonicalSeen = new Set<string>();
  const tuples: number[][] = [];
  for (const t of rawTuples) {
    const canonical = canonicalizeTuple(t, mode);
    // Tier predicates run on the canonical (post-depower-and-sort)
    // multiset — that's the multiset the chunk header records and the
    // runtime will look up by, so curation must agree with that key.
    if (!tupleAllowedForTier(canonical, parsed.legality)) continue;
    const key = canonical.join(",");
    if (canonicalSeen.has(key)) continue;
    canonicalSeen.add(key);
    tuples.push(canonical);
  }
  tuples.sort((a, b) => {
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
    }
    return 0;
  });

  // Smoke-test cap: keep only the first N tuples. Applied AFTER the
  // canonical sort so smoke runs are deterministic and reproducible.
  const fullCount = tuples.length;
  const limited =
    parsed.limit !== null && parsed.limit < fullCount
      ? tuples.slice(0, parsed.limit)
      : tuples;

  process.stdout.write(
    `\nn2k bake — mode=${mode.id}, arity=${parsed.arity}, ` +
      `legality=${parsed.legality}, tuples=${limited.length}` +
      (limited.length < fullCount ? ` (of ${fullCount}, --limit applied)` : "") +
      `, concurrency=${parsed.concurrency}\n` +
      `out=${parsed.out}\n\n`,
  );

  mkdirSync(parsed.out, { recursive: true });

  const workerFile = new URL(
    "../src/services/exporter.worker.bootstrap.mjs",
    import.meta.url,
  );
  const pool = new WorkerPool<ExportWorkerJob, ExportWorkerResult>({
    workerFile,
    concurrency: parsed.concurrency,
  });

  const tupleEntries: BlobTupleEntry[] = [];
  const chunkBytes: Uint8Array[] = [];
  let totalRecords = 0;
  let chunksByteLength = 0;
  const startedAt = Date.now();

  const jobs = limited.map((tuple) =>
    pool.run({
      inputTuple: tuple,
      modeId: mode.id as "standard" | "aether",
    }),
  );

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i]!;
    const tuple = limited[i]!;
    let result: ExportWorkerResult;
    try {
      result = await job;
    } catch (err) {
      await pool.terminate();
      throw new Error(
        `tuple [${tuple.join(", ")}]: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const reconstructed = {
      inputTuple: tuple,
      canonicalTuple: result.canonicalTuple,
      arity: result.arity,
      equations: result.equations,
      elapsedMs: result.elapsedMs,
    };
    const chunk = toBinaryChunk(reconstructed, mode);
    const encoded = encodeChunk(chunk);

    const summary = summarizeEquations(result.equations);
    const totalCells = mode.targetRange.max - mode.targetRange.min + 1;
    tupleEntries.push({
      dice: result.canonicalTuple,
      solvableCount: summary.solvableCount,
      impossibleCount: totalCells - summary.solvableCount,
      minDifficulty: summary.minDifficulty,
      maxDifficulty: summary.maxDifficulty,
      sumDifficulty: summary.sumDifficulty,
      chunkOffset: chunksByteLength,
      chunkLength: encoded.byteLength,
    });
    chunkBytes.push(encoded);
    chunksByteLength += encoded.byteLength;
    totalRecords += result.equations.length;

    renderProgress(i + 1, limited.length, startedAt);
  }

  await pool.close();
  if (process.stdout.isTTY) process.stdout.write("\n");

  const header = encodeBlobHeader({
    modeId: mode.id as "standard" | "aether",
    diceMin: mode.diceRange.min,
    diceMax: mode.diceRange.max,
    targetMin: mode.targetRange.min,
    targetMax: mode.targetRange.max,
    totalRecords,
    tuples: tupleEntries,
  });

  const blob = new Uint8Array(header.headerByteLength + chunksByteLength);
  blob.set(header.bytes, 0);
  let offset = header.headerByteLength;
  for (const c of chunkBytes) {
    blob.set(c, offset);
    offset += c.byteLength;
  }

  // Filename convention:
  //   standard.n2k                      (Standard mode is always arity 3, full legality)
  //   aether-arity3.n2k                 (legacy "full" Æther arity-3 — keeps existing URL stable)
  //   aether-arity4-commons.n2k         (curated tier; runtime picks file by tier)
  //   aether-arity4-extended.n2k        (Tier 2; opt-in)
  //   aether-arity5-commons.n2k         etc.
  //
  // The legacy `aether-arity3.n2k` URL keeps working because we only
  // suffix with the tier when it isn't `legal`. New arity-4/5 blobs
  // always carry a tier in the name to make the curation explicit.
  const tierSuffix = parsed.legality === "legal" ? "" : `-${parsed.legality}`;
  // Smoke runs get a `-smoke<N>` suffix so a partial blob never gets
  // confused with the real artefact and accidentally served to users.
  const smokeSuffix = parsed.limit !== null ? `-smoke${limited.length}` : "";
  const filename =
    mode.id === "standard"
      ? `standard${smokeSuffix}.n2k`
      : `aether-arity${parsed.arity}${tierSuffix}${smokeSuffix}.n2k`;
  const blobPath = resolve(parsed.out, filename);
  writeFileSync(blobPath, blob);

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(2);
  const sizeKb = (blob.byteLength / 1024).toFixed(1);
  process.stdout.write(
    `\nBaked ${blobPath}\n  ${limited.length} tuples, ${totalRecords} equations, ${sizeKb} KB, ${elapsedSec}s\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `\nbake failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
