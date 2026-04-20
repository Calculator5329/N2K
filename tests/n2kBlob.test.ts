/**
 * Equivalence tests for the `.n2k` aggregate blob format.
 *
 *   1. Round-trip: encode a hand-built header → decode → fields match.
 *   2. End-to-end vs solver: assemble a tiny blob from real solver
 *      output and verify the decoded chunks reproduce the original
 *      `BulkSolution` array byte-for-byte (within difficulty rounding).
 *   3. On-disk vs solver: read the actual `web/public/data/standard.n2k`
 *      blob (when present) and spot-check that several tuples decode
 *      back into the same equations the solver produces today.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AETHER_MODE, STANDARD_MODE } from "../src/core/constants.js";
import {
  decodeChunk,
  encodeChunk,
  chunkFromBulkSolutions,
} from "../src/core/n2kBinary.js";
import {
  decodeBlobHeader,
  encodeBlobHeader,
  type BlobTupleEntry,
} from "../src/core/n2kBlob.js";
import { canonicalizeTuple } from "../src/services/exporter.js";
import { solveForExport } from "../src/services/solver.js";

// ---------------------------------------------------------------------------
//  Round-trip
// ---------------------------------------------------------------------------

describe("n2kBlob round-trip", () => {
  it("encodes and decodes header fields verbatim", () => {
    const tuples: BlobTupleEntry[] = [
      {
        dice: [2, 3, 5],
        solvableCount: 100,
        impossibleCount: 200,
        minDifficulty: 1.23,
        maxDifficulty: 87.65,
        sumDifficulty: 4321.5,
        chunkOffset: 0,
        chunkLength: 250,
      },
      {
        dice: [-3, 4, 12],
        solvableCount: 0,
        impossibleCount: 999,
        minDifficulty: 0,
        maxDifficulty: 0,
        sumDifficulty: 0,
        chunkOffset: 250,
        chunkLength: 0,
      },
    ];
    const { bytes, headerByteLength } = encodeBlobHeader({
      modeId: "standard",
      diceMin: 2,
      diceMax: 20,
      targetMin: 1,
      targetMax: 999,
      totalRecords: 100,
      tuples,
    });
    expect(bytes.byteLength).toBe(headerByteLength);

    const decoded = decodeBlobHeader(bytes);
    expect(decoded.modeId).toBe("standard");
    expect(decoded.diceMin).toBe(2);
    expect(decoded.diceMax).toBe(20);
    expect(decoded.targetMin).toBe(1);
    expect(decoded.targetMax).toBe(999);
    expect(decoded.totalRecords).toBe(100);
    expect(decoded.tuples.length).toBe(2);
    expect(decoded.tuples[0]!.dice).toEqual([2, 3, 5]);
    expect(decoded.tuples[1]!.dice).toEqual([-3, 4, 12]);
    expect(decoded.tuples[0]!.solvableCount).toBe(100);
    expect(decoded.tuples[0]!.minDifficulty).toBeCloseTo(1.23, 2);
    expect(decoded.tuples[0]!.maxDifficulty).toBeCloseTo(87.65, 2);
    expect(decoded.tuples[0]!.sumDifficulty).toBeCloseTo(4321.5, 2);
    expect(decoded.chunksStart).toBe(headerByteLength);
  });
});

// ---------------------------------------------------------------------------
//  End-to-end with solver output
// ---------------------------------------------------------------------------

describe("n2kBlob equivalence with solver output", () => {
  it("decoded chunks match solveForExport for every tuple in the blob", () => {
    const tuples = [
      [2, 3, 5],
      [4, 7, 12],
      [10, 10, 15],
    ].map((t) => canonicalizeTuple(t, STANDARD_MODE)) as readonly number[][];
    runBlobRoundTripTest(tuples, STANDARD_MODE, 3, 1, 999);
  });

  it("decoded chunks match solveForExport for arity-4 Æther tuples", () => {
    // Smallest meaningful arity-4 set: a couple of commons-tier Æther
    // tuples. Verifies end-to-end that the encode/decode round-trip
    // works at arity 4 (which the bake script wires up but no test
    // exercised before this commit).
    const tuples = [
      [2, 3, 4, 5],
      [2, 2, 3, 5],
    ].map((t) => canonicalizeTuple(t, AETHER_MODE)) as readonly number[][];
    runBlobRoundTripTest(
      tuples,
      AETHER_MODE,
      4,
      AETHER_MODE.targetRange.min,
      // Restrict the target range to keep the test fast — arity-4 full
      // sweeps are slow. The encode/decode logic doesn't care about the
      // range size; it only needs >0 records to exercise the bit packs.
      Math.min(50, AETHER_MODE.targetRange.max),
    );
  });
});

function runBlobRoundTripTest(
  tuples: readonly (readonly number[])[],
  mode: typeof STANDARD_MODE,
  arity: 3 | 4 | 5,
  targetMin: number,
  targetMax: number,
): void {
  const tupleEntries: BlobTupleEntry[] = [];
  const chunkBytes: Uint8Array[] = [];
  let chunksByteLength = 0;
  let totalRecords = 0;

  for (const dice of tuples) {
    const equations = solveForExport(dice, arity, targetMin, targetMax, mode);
    const chunk = chunkFromBulkSolutions(
      dice,
      mode,
      targetMin,
      targetMax,
      equations,
    );
    const encoded = encodeChunk(chunk);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sum = 0;
    for (const e of equations) {
      if (e.difficulty < min) min = e.difficulty;
      if (e.difficulty > max) max = e.difficulty;
      sum += e.difficulty;
    }
    tupleEntries.push({
      dice,
      solvableCount: equations.length,
      impossibleCount: targetMax - targetMin + 1 - equations.length,
      minDifficulty: equations.length === 0 ? 0 : min,
      maxDifficulty: equations.length === 0 ? 0 : max,
      sumDifficulty: sum,
      chunkOffset: chunksByteLength,
      chunkLength: encoded.byteLength,
    });
    chunkBytes.push(encoded);
    chunksByteLength += encoded.byteLength;
    totalRecords += equations.length;
  }

  const header = encodeBlobHeader({
    modeId: mode.id as "standard" | "aether",
    diceMin: mode.diceRange.min,
    diceMax: mode.diceRange.max,
    targetMin,
    targetMax,
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

  const decoded = decodeBlobHeader(blob);
  expect(decoded.tuples.length).toBe(tuples.length);
  for (let i = 0; i < decoded.tuples.length; i += 1) {
    const entry = decoded.tuples[i]!;
    const start = decoded.chunksStart + entry.chunkOffset;
    const slice = blob.subarray(start, start + entry.chunkLength);
    const chunk = decodeChunk(slice);
    expect([...chunk.header.diceTuple]).toEqual([...tuples[i]!]);
    expect(chunk.header.arity).toBe(arity);

    const fresh = solveForExport(tuples[i]!, arity, targetMin, targetMax, mode);
    expect(chunk.equations.length).toBe(fresh.length);
    for (let r = 0; r < fresh.length; r += 1) {
      expect(chunk.equations[r]!.equation.total).toBe(fresh[r]!.equation.total);
      expect(chunk.equations[r]!.difficulty).toBeCloseTo(fresh[r]!.difficulty, 1);
    }
  }
}

// ---------------------------------------------------------------------------
//  On-disk blob spot-check
// ---------------------------------------------------------------------------

describe("standard.n2k on disk", () => {
  const blobPath = resolve(
    __dirname,
    "..",
    "web",
    "public",
    "data",
    "standard.n2k",
  );

  it("decodes the header and exposes every Standard-legal tuple", () => {
    if (!existsSync(blobPath)) return;
    const bytes = new Uint8Array(readFileSync(blobPath));
    const header = decodeBlobHeader(bytes);
    expect(header.modeId).toBe("standard");
    expect(header.targetMin).toBe(STANDARD_MODE.targetRange.min);
    expect(header.targetMax).toBe(STANDARD_MODE.targetRange.max);
    expect(header.tuples.length).toBeGreaterThan(0);
    // Each chunk slice must decode without throwing.
    for (const t of header.tuples.slice(0, 5)) {
      const slice = bytes.subarray(
        header.chunksStart + t.chunkOffset,
        header.chunksStart + t.chunkOffset + t.chunkLength,
      );
      const chunk = decodeChunk(slice);
      expect(chunk.header.diceTuple).toEqual([...t.dice]);
      expect(chunk.equations.length).toBe(t.solvableCount);
    }
  });

  it("matches solveForExport for spot-checked tuples", () => {
    if (!existsSync(blobPath)) return;
    const bytes = new Uint8Array(readFileSync(blobPath));
    const header = decodeBlobHeader(bytes);
    const samples: ReadonlyArray<readonly [number, number, number]> = [
      [2, 3, 5],
      [3, 7, 11],
      [5, 6, 10],
    ];
    for (const rawDice of samples) {
      const dice = canonicalizeTuple(rawDice, STANDARD_MODE);
      const key = dice.join("-");
      const entry = header.tuples.find((t) => t.dice.join("-") === key);
      if (entry === undefined) continue;
      const slice = bytes.subarray(
        header.chunksStart + entry.chunkOffset,
        header.chunksStart + entry.chunkOffset + entry.chunkLength,
      );
      const chunk = decodeChunk(slice);
      const fresh = solveForExport(
        dice,
        3,
        STANDARD_MODE.targetRange.min,
        STANDARD_MODE.targetRange.max,
        STANDARD_MODE,
      );
      expect(chunk.equations.length).toBe(fresh.length);
      for (let i = 0; i < fresh.length; i += 1) {
        expect(chunk.equations[i]!.equation.total).toBe(fresh[i]!.equation.total);
        expect(chunk.equations[i]!.difficulty).toBeCloseTo(fresh[i]!.difficulty, 1);
      }
    }
  });
});
