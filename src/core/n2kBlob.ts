/**
 * `.n2k` aggregate blob — header + offset table + concatenated chunks.
 *
 * One blob carries every solvable (tuple, target) cell for one mode, in
 * a single file the web app fetches once on boot. The header section
 * (built by {@link encodeBlobHeader}) carries enough per-tuple summary
 * data that the Lookup view can render its dice-picker grid without
 * touching any chunk bytes — chunk decode is deferred until the user
 * actually picks a dice triple.
 *
 * Wire layout (LSB-first bit stream after the 8-byte magic prefix):
 *
 *   magic            4B, fixed "N2K\0" little-endian (0x004B324E)
 *   version          1B uint8
 *   modeId           1 bit   (0 = standard, 1 = aether)
 *   _reserved        7 bits  (must be 0)
 *
 *   diceMin          svarint
 *   diceMax          svarint
 *   targetMin        uvarint
 *   targetMax        uvarint
 *   totalRecords     uvarint
 *   tupleCount       uvarint
 *
 *   tupleEntries[tupleCount]:
 *     dice[arity]      svarints, sorted ascending (arity inferred per-tuple from chunk header)
 *     arity            3 bits (3..5 — repeated here so the entry decoder
 *                      knows how many dice to read)
 *     solvableCount    uvarint
 *     impossibleCount  uvarint
 *     minDiff100       uvarint
 *     maxDiff100       uvarint
 *     sumDiff100       uvarint
 *     chunkByteOffset  uvarint (offset into the chunks section)
 *     chunkByteLength  uvarint
 *
 *   <chunks>          concatenated chunks, each produced by
 *                     `encodeChunk` from `n2kBinary.ts`.
 *
 * Lookup path: the web layer's `n2kLoader` parses the header into a
 * `Map<diceKey, BlobTupleEntry>` once, then on `getDetail(dice)` slices
 * `bytes[chunksStart + chunkByteOffset .. chunksStart + chunkByteOffset
 * + chunkByteLength]` and runs `decodeChunk` on the slice.
 */
import { BitReader, BitWriter } from "./n2kBinary.js";
import type { ModeId } from "./types.js";

/** ASCII "N2K\0", read as little-endian uint32. */
export const BLOB_MAGIC = 0x004b324e;

/** Current blob wire-format version. Bumped on incompatible changes. */
export const BLOB_VERSION = 1;

const MODE_ID_CODE: Readonly<Record<"standard" | "aether", number>> = {
  standard: 0,
  aether: 1,
};

const MODE_BY_CODE: readonly ("standard" | "aether")[] = ["standard", "aether"];

export interface BlobTupleEntry {
  /** Canonical sorted dice multiset. Length is in {3, 4, 5}. */
  readonly dice: readonly number[];
  readonly solvableCount: number;
  readonly impossibleCount: number;
  /** Min/max difficulty across the tuple's solvable cells, * 100 (matches chunk wire). */
  readonly minDifficulty: number;
  readonly maxDifficulty: number;
  /** Sum of difficulties (used for `averageDifficulty = sum/solvableCount`). */
  readonly sumDifficulty: number;
  /** Byte offset into the concatenated chunks section. */
  readonly chunkOffset: number;
  /** Length of this tuple's chunk in bytes. */
  readonly chunkLength: number;
}

export interface BlobHeader {
  readonly modeId: Extract<ModeId, "standard" | "aether">;
  readonly diceMin: number;
  readonly diceMax: number;
  readonly targetMin: number;
  readonly targetMax: number;
  readonly totalRecords: number;
  readonly tuples: readonly BlobTupleEntry[];
  /** Byte offset into the blob where the first chunk starts. */
  readonly chunksStart: number;
}

/** Result of {@link encodeBlobHeader} — emit before the chunk bytes. */
export interface EncodedBlobHeader {
  readonly bytes: Uint8Array;
  /** Same value as `chunksStart` after assembly: header bytes are byte-aligned. */
  readonly headerByteLength: number;
}

/**
 * Build the header byte sequence. The caller assembles
 * `[header.bytes, ...chunks]` into the final blob; chunk byte offsets
 * inside `tuples` are relative to the start of the chunks section, not
 * the blob — the loader adds `chunksStart` after parsing.
 */
export function encodeBlobHeader(args: {
  readonly modeId: Extract<ModeId, "standard" | "aether">;
  readonly diceMin: number;
  readonly diceMax: number;
  readonly targetMin: number;
  readonly targetMax: number;
  readonly totalRecords: number;
  readonly tuples: readonly BlobTupleEntry[];
}): EncodedBlobHeader {
  const writer = new BitWriter();
  // Magic + version (byte-aligned).
  writer.writeBits(BLOB_MAGIC & 0xff, 8);
  writer.writeBits((BLOB_MAGIC >>> 8) & 0xff, 8);
  writer.writeBits((BLOB_MAGIC >>> 16) & 0xff, 8);
  writer.writeBits((BLOB_MAGIC >>> 24) & 0xff, 8);
  writer.writeBits(BLOB_VERSION, 8);

  writer.writeBits(MODE_ID_CODE[args.modeId], 1);
  writer.writeBits(0, 7); // reserved

  writer.writeSVarint(args.diceMin);
  writer.writeSVarint(args.diceMax);
  writer.writeUVarint(args.targetMin);
  writer.writeUVarint(args.targetMax);
  writer.writeUVarint(args.totalRecords);
  writer.writeUVarint(args.tuples.length);

  for (const t of args.tuples) {
    if (t.dice.length !== 3 && t.dice.length !== 4 && t.dice.length !== 5) {
      throw new RangeError(
        `encodeBlobHeader: tuple arity ${t.dice.length} not in {3, 4, 5}`,
      );
    }
    writer.writeBits(t.dice.length, 3);
    for (const d of t.dice) writer.writeSVarint(d);
    writer.writeUVarint(t.solvableCount);
    writer.writeUVarint(t.impossibleCount);
    writer.writeUVarint(clampDiff100(t.minDifficulty));
    writer.writeUVarint(clampDiff100(t.maxDifficulty));
    writer.writeUVarint(clampDiff100(t.sumDifficulty));
    writer.writeUVarint(t.chunkOffset);
    writer.writeUVarint(t.chunkLength);
  }

  // Pad to byte boundary so the chunk section starts byte-aligned.
  writer.alignToByte();
  const bytes = writer.toUint8Array();
  return { bytes, headerByteLength: bytes.byteLength };
}

/**
 * Parse a blob's header section. Returns the parsed metadata plus
 * `chunksStart` — the byte offset where the first chunk begins, which
 * the loader uses to slice individual chunks from the rest of the blob.
 */
export function decodeBlobHeader(bytes: Uint8Array): BlobHeader {
  if (bytes.byteLength < 5) {
    throw new RangeError(`decodeBlobHeader: buffer too small (${bytes.byteLength} bytes)`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic =
    view.getUint8(0) |
    (view.getUint8(1) << 8) |
    (view.getUint8(2) << 16) |
    (view.getUint8(3) << 24);
  if ((magic >>> 0) !== BLOB_MAGIC) {
    throw new RangeError(
      `decodeBlobHeader: bad magic 0x${(magic >>> 0).toString(16).padStart(8, "0")}, ` +
        `expected 0x${BLOB_MAGIC.toString(16).padStart(8, "0")}`,
    );
  }
  const version = view.getUint8(4);
  if (version !== BLOB_VERSION) {
    throw new RangeError(
      `decodeBlobHeader: unsupported version ${version} (this build reads v${BLOB_VERSION})`,
    );
  }

  const reader = new BitReader(view, 5 * 8);
  const modeCode = reader.readBits(1);
  const modeName = MODE_BY_CODE[modeCode];
  if (modeName === undefined) {
    throw new RangeError(`decodeBlobHeader: unknown modeId code ${modeCode}`);
  }
  const reserved = reader.readBits(7);
  if (reserved !== 0) {
    throw new RangeError(`decodeBlobHeader: non-zero reserved header bits (${reserved})`);
  }

  const diceMin = reader.readSVarint();
  const diceMax = reader.readSVarint();
  const targetMin = reader.readUVarint();
  const targetMax = reader.readUVarint();
  const totalRecords = reader.readUVarint();
  const tupleCount = reader.readUVarint();

  const tuples: BlobTupleEntry[] = new Array(tupleCount);
  for (let i = 0; i < tupleCount; i += 1) {
    const arity = reader.readBits(3);
    if (arity !== 3 && arity !== 4 && arity !== 5) {
      throw new RangeError(`decodeBlobHeader: tuple[${i}] arity ${arity} not in {3, 4, 5}`);
    }
    const dice: number[] = new Array(arity);
    for (let j = 0; j < arity; j += 1) dice[j] = reader.readSVarint();
    const solvableCount = reader.readUVarint();
    const impossibleCount = reader.readUVarint();
    const minDifficulty = reader.readUVarint() / 100;
    const maxDifficulty = reader.readUVarint() / 100;
    const sumDifficulty = reader.readUVarint() / 100;
    const chunkOffset = reader.readUVarint();
    const chunkLength = reader.readUVarint();
    tuples[i] = {
      dice,
      solvableCount,
      impossibleCount,
      minDifficulty,
      maxDifficulty,
      sumDifficulty,
      chunkOffset,
      chunkLength,
    };
  }

  reader.alignToByte();
  return {
    modeId: modeName,
    diceMin,
    diceMax,
    targetMin,
    targetMax,
    totalRecords,
    tuples,
    chunksStart: reader.bitOffset / 8,
  };
}

function clampDiff100(d: number): number {
  if (!Number.isFinite(d) || d < 0) return 0;
  const v = Math.round(d * 100);
  if (v > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  return v;
}
