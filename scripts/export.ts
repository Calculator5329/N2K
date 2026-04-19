/**
 * Bulk-export CLI.
 *
 *   npm run export -- --mode standard --out ./data-out/standard
 *   npm run export -- --mode aether   --arity 3 --out ./data-out/aether
 *
 * Flags:
 *   --mode <standard|aether>   required
 *   --out <dir>                defaults to ./data-out/<mode>
 *   --arity <3|4|5|all>        Æther only (standard always 3)
 *   --concurrency <n>          defaults to os.cpus().length - 1
 *   --no-binary                skip the aggregate .n2k blob
 *   --no-json                  skip the per-tuple JSON chunks
 *
 * The driver spawns a WorkerPool of `exporter.worker.ts` instances,
 * feeds every legal tuple through the pool, writes the per-tuple
 * JSON chunks and streams binary chunks into the aggregate blob,
 * and finally emits a manifest.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cpus } from "node:os";
import { AETHER_MODE, STANDARD_MODE } from "../src/core/constants.js";
import { enumerateUnorderedTuples } from "../src/services/arithmetic.js";
import {
  chunkRelativePath,
  toBinaryChunk,
  toChunkJson,
  type Manifest,
  type ManifestChunkEntry,
} from "../src/services/exporter.js";
import { encodeChunk } from "../src/core/n2kBinary.js";
import { isLegalDiceForMode } from "../src/services/generators.js";
import type { Arity, BulkSolution, Mode } from "../src/core/types.js";
import { WorkerPool } from "../src/services/workerPool.js";
import type { ExportWorkerJob, ExportWorkerResult } from "../src/services/exporter.worker.js";

// ---------------------------------------------------------------------------
//  Arg parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  mode: "standard" | "aether";
  out: string;
  arity: "3" | "4" | "5" | "all";
  concurrency: number;
  writeBinary: boolean;
  writeJson: boolean;
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
  const out = typeof args.out === "string" ? args.out : `./data-out/${mode}`;
  const arityRaw = typeof args.arity === "string" ? args.arity : mode === "standard" ? "3" : "all";
  if (!["3", "4", "5", "all"].includes(arityRaw)) {
    throw new Error(`--arity must be 3, 4, 5, or all`);
  }
  if (mode === "standard" && arityRaw !== "3") {
    throw new Error(`--arity is locked to 3 in standard mode`);
  }
  const concurrency =
    typeof args.concurrency === "string"
      ? Math.max(1, parseInt(args.concurrency, 10))
      : Math.max(1, cpus().length - 1);
  const writeBinary = args["no-binary"] !== true;
  const writeJson = args["no-json"] !== true;
  return {
    mode,
    out: resolve(out),
    arity: arityRaw as "3" | "4" | "5" | "all",
    concurrency,
    writeBinary,
    writeJson,
  };
}

// ---------------------------------------------------------------------------
//  Tuple enumeration
// ---------------------------------------------------------------------------

function enumerateTuplesForMode(
  mode: Mode,
  arity: Arity,
): number[][] {
  const { min, max } = mode.diceRange;
  const tuples = enumerateUnorderedTuples(arity, min, max);
  return tuples.filter((t) => isLegalDiceForMode(t, mode));
}

// ---------------------------------------------------------------------------
//  Progress bar (single-line redraw)
// ---------------------------------------------------------------------------

function renderProgress(done: number, total: number, startedAt: number): void {
  const pct = total === 0 ? 100 : Math.floor((done / total) * 100);
  const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
  const barWidth = 30;
  const filled = Math.floor((barWidth * done) / Math.max(1, total));
  const bar = "=".repeat(filled) + (filled < barWidth ? ">" : "") + " ".repeat(Math.max(0, barWidth - filled - 1));
  const line = `\r[${bar}] ${done}/${total} (${pct}%)  ${elapsedSec}s elapsed  `;
  if (process.stdout.isTTY) {
    process.stdout.write(line);
  } else if (done === total || done % 100 === 0 || done === 1) {
    process.stdout.write(line + "\n");
  }
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const mode: Mode = parsed.mode === "standard" ? STANDARD_MODE : AETHER_MODE;

  const arities: Arity[] =
    parsed.arity === "all"
      ? (mode.arities as readonly Arity[]).slice()
      : [parseInt(parsed.arity, 10) as Arity];

  const allTuples: { tuple: number[]; arity: Arity }[] = [];
  for (const a of arities) {
    for (const t of enumerateTuplesForMode(mode, a)) {
      allTuples.push({ tuple: t, arity: a });
    }
  }

  process.stdout.write(
    `\nn2k export — mode=${mode.id}, arities=[${arities.join(",")}], ` +
      `tuples=${allTuples.length}, concurrency=${parsed.concurrency}\n` +
      `out=${parsed.out}\n\n`,
  );

  mkdirSync(parsed.out, { recursive: true });

  // Resolve worker path relative to THIS script. We point at a small
  // `.mjs` bootstrap that registers tsx's ESM loader and then imports
  // the actual `.ts` worker — Node 22 does not reliably propagate
  // `--import tsx` through `execArgv` on Windows.
  const workerFile = new URL(
    "../src/services/exporter.worker.bootstrap.mjs",
    import.meta.url,
  );

  const pool = new WorkerPool<ExportWorkerJob, ExportWorkerResult>({
    workerFile,
    concurrency: parsed.concurrency,
  });

  const manifestChunks: ManifestChunkEntry[] = [];
  const binaryParts: Uint8Array[] = [];
  let totalEquations = 0;
  let done = 0;
  const startedAt = Date.now();

  const jobs = allTuples.map(({ tuple }) =>
    pool.run({ inputTuple: tuple, modeId: mode.id as "standard" | "aether" }),
  );

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i]!;
    const { tuple, arity } = allTuples[i]!;
    let result: ExportWorkerResult;
    try {
      result = await job;
    } catch (err) {
      await pool.terminate();
      throw new Error(
        `tuple [${tuple.join(", ")}]: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const reconstructed = reconstructExportResult(tuple, result);
    if (parsed.writeJson) {
      const json = toChunkJson(reconstructed, mode);
      const relPath = chunkRelativePath(tuple, mode);
      const absPath = resolve(parsed.out, relPath);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, JSON.stringify(json));
    }
    if (parsed.writeBinary) {
      const chunk = toBinaryChunk(reconstructed, mode);
      binaryParts.push(encodeChunk(chunk));
    }

    manifestChunks.push({
      path: chunkRelativePath(tuple, mode),
      inputTuple: tuple,
      arity,
      equationCount: result.equations.length,
    });
    totalEquations += result.equations.length;
    done += 1;
    renderProgress(done, allTuples.length, startedAt);
  }

  await pool.close();
  if (process.stdout.isTTY) process.stdout.write("\n");

  // Aggregate binary
  if (parsed.writeBinary) {
    const totalLen = binaryParts.reduce((acc, p) => acc + p.byteLength, 0);
    const agg = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of binaryParts) {
      agg.set(p, offset);
      offset += p.byteLength;
    }
    const binPath = resolve(parsed.out, `${mode.id}.n2k`);
    writeFileSync(binPath, agg);
  }

  // Manifest
  const manifest: Manifest = {
    modeId: mode.id as "standard" | "aether",
    generatedAt: new Date().toISOString(),
    tupleCount: allTuples.length,
    totalEquations,
    targetRange: { min: mode.targetRange.min, max: mode.targetRange.max },
    chunks: manifestChunks,
  };
  writeFileSync(
    resolve(parsed.out, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(2);
  process.stdout.write(
    `\nDone. ${allTuples.length} tuples, ${totalEquations} equations, ${elapsedSec}s\n`,
  );
}

/**
 * The worker returns an `ExportWorkerResult` (raw data). Rebuild an
 * `ExportTupleResult`-shaped object so we can reuse the exporter's
 * `toBinaryChunk` and `toChunkJson` helpers on the driver side.
 */
function reconstructExportResult(
  inputTuple: readonly number[],
  workerResult: ExportWorkerResult,
): {
  inputTuple: readonly number[];
  canonicalTuple: readonly number[];
  arity: Arity;
  equations: readonly BulkSolution[];
  elapsedMs: number;
} {
  return {
    inputTuple,
    canonicalTuple: workerResult.canonicalTuple,
    arity: workerResult.arity,
    equations: workerResult.equations,
    elapsedMs: workerResult.elapsedMs,
  };
}

main().catch((err) => {
  process.stderr.write(`\nexport failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
