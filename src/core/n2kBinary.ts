/**
 * `.n2k` binary container format — chunk-level encoder/decoder for
 * Phase 1 bulk export.
 *
 * One chunk represents "every solvable (tuple, target) cell for one
 * dice tuple under one {@link Mode}". Chunks are both the unit of
 * streaming (the web app lazy-loads one tuple at a time) and the
 * storage unit inside the aggregate `<mode>.n2k` blob.
 *
 * `header.diceTuple` is the canonical sorted multiset that the solver
 * actually evaluates against (post-depower in standard mode). Each
 * equation's `equation.dice` is a permutation of that multiset; the
 * wire format stores a small permutation index per record instead of
 * repeating the full dice sequence.
 *
 * Wire layout (LSB-first bit stream with byte-aligned prefix):
 *
 *   magic            4B, fixed "N2KC" little-endian (0x434B324E)
 *   version          1B uint8
 *   modeId           1 bit   (0 = standard, 1 = aether)
 *   arity            3 bits  (holds values 3..5)
 *   _reserved        4 bits  (must be 0)
 *   dice[arity]      zigzag varints; must be sorted ascending
 *   targetMin        uvarint
 *   targetMax        uvarint
 *   count            uvarint
 *   records[count] — per-equation bit packs, back to back:
 *     permIndex        bitsForRange(permCount - 1) bits; index into
 *                      distinctPermutations(diceTuple)
 *     exps[arity]      sharedExpBits each (see `sharedExpBits` below)
 *     ops[arity-1]     2 bits each (op - 1)
 *     targetDelta      uvarint (target - prevTarget; first record's
 *                      delta is target - targetMin)
 *     diff100          uvarint (round(difficulty * 100); clamped to
 *                      0..10000)
 *
 * `sharedExpBits` is `bitsForRange(max exponentCap across diceTuple)` —
 * because any permutation can place any of those dice in any slot, one
 * width across all slots is both correct and compact.
 */
import {
  AETHER_MODE,
  OP,
  STANDARD_MODE,
} from "./constants.js";
import type {
  Arity,
  BulkSolution,
  Mode,
  ModeId,
  NEquation,
  Operator,
} from "./types.js";
import { distinctPermutations } from "../services/arithmetic.js";

// ---------------------------------------------------------------------------
//  Magic / version
// ---------------------------------------------------------------------------

/** ASCII "N2KC", read as little-endian uint32. */
export const CHUNK_MAGIC = 0x434b324e;

/** Current chunk wire-format version. Bumped on incompatible changes. */
export const CHUNK_VERSION = 1;

// ---------------------------------------------------------------------------
//  Public types
// ---------------------------------------------------------------------------

export interface BinaryChunkHeader {
  readonly modeId: Extract<ModeId, "standard" | "aether">;
  readonly arity: Arity;
  /**
   * Canonical sorted multiset the solver evaluates — post-depower for
   * standard mode, raw for Æther. Permutations are represented per-
   * record via `permIndex`, not by reordering this field.
   */
  readonly diceTuple: readonly number[];
  readonly targetMin: number;
  readonly targetMax: number;
  readonly count: number;
}

export interface BinaryChunkRecord {
  readonly equation: NEquation;
  readonly difficulty: number;
}

export interface BinaryChunk {
  readonly header: BinaryChunkHeader;
  readonly equations: readonly BinaryChunkRecord[];
}

// ---------------------------------------------------------------------------
//  Bit-level I/O
// ---------------------------------------------------------------------------

/**
 * LSB-first bit writer. Flushes into a dynamically-growing byte array
 * so the caller doesn't need to pre-size anything. Byte-aligned reads
 * happen at fixed offsets (magic, version); everything else flows
 * through the bit cursor.
 */
export class BitWriter {
  private bytes: number[] = [];
  private bitCursor = 0;

  byteLength(): number {
    return Math.ceil(this.bitCursor / 8);
  }

  get bitOffset(): number {
    return this.bitCursor;
  }

  alignToByte(): void {
    const rem = this.bitCursor & 7;
    if (rem !== 0) this.bitCursor += 8 - rem;
  }

  writeBits(value: number, n: number): void {
    if (n < 0 || n > 32) {
      throw new RangeError(`BitWriter.writeBits: n must be in [0, 32], got ${n}`);
    }
    if (n === 0) return;
    if (value < 0 || value >= Math.pow(2, n)) {
      throw new RangeError(
        `BitWriter.writeBits: value ${value} does not fit in ${n} bits`,
      );
    }
    let written = 0;
    while (written < n) {
      const byteIdx = this.bitCursor >>> 3;
      const bitInByte = this.bitCursor & 7;
      while (this.bytes.length <= byteIdx) this.bytes.push(0);
      const avail = 8 - bitInByte;
      const take = Math.min(avail, n - written);
      const mask = (1 << take) - 1;
      const chunk = Math.floor(value / Math.pow(2, written)) & mask;
      this.bytes[byteIdx] = (this.bytes[byteIdx] ?? 0) | (chunk << bitInByte);
      this.bitCursor += take;
      written += take;
    }
  }

  /** Unsigned LEB128-style varint (7 payload bits per byte, MSB = continuation). */
  writeUVarint(value: number): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`BitWriter.writeUVarint: non-negative integer required, got ${value}`);
    }
    let v = value;
    while (v >= 0x80) {
      this.writeBits((v & 0x7f) | 0x80, 8);
      v = Math.floor(v / 128);
    }
    this.writeBits(v & 0x7f, 8);
  }

  /** Zigzag signed varint. */
  writeSVarint(value: number): void {
    if (!Number.isInteger(value)) {
      throw new RangeError(`BitWriter.writeSVarint: integer required, got ${value}`);
    }
    const zz = value >= 0 ? value * 2 : -value * 2 - 1;
    this.writeUVarint(zz);
  }

  toUint8Array(): Uint8Array {
    const len = this.byteLength();
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) out[i] = this.bytes[i] ?? 0;
    return out;
  }
}

/** Symmetric LSB-first bit reader. */
export class BitReader {
  private bitCursor: number;

  constructor(
    private readonly view: DataView,
    startBitOffset = 0,
  ) {
    this.bitCursor = startBitOffset;
  }

  get bitOffset(): number {
    return this.bitCursor;
  }

  alignToByte(): void {
    const rem = this.bitCursor & 7;
    if (rem !== 0) this.bitCursor += 8 - rem;
  }

  readBits(n: number): number {
    if (n < 0 || n > 32) {
      throw new RangeError(`BitReader.readBits: n must be in [0, 32], got ${n}`);
    }
    if (n === 0) return 0;
    let value = 0;
    let read = 0;
    while (read < n) {
      const byteIdx = this.bitCursor >>> 3;
      const bitInByte = this.bitCursor & 7;
      const byte = this.view.getUint8(byteIdx);
      const avail = 8 - bitInByte;
      const take = Math.min(avail, n - read);
      const mask = (1 << take) - 1;
      const chunk = (byte >>> bitInByte) & mask;
      value += chunk * Math.pow(2, read);
      this.bitCursor += take;
      read += take;
    }
    return value;
  }

  readUVarint(): number {
    let v = 0;
    let shift = 0;
    for (let i = 0; i < 10; i += 1) {
      const byte = this.readBits(8);
      v += (byte & 0x7f) * Math.pow(2, shift);
      if ((byte & 0x80) === 0) return v;
      shift += 7;
    }
    throw new RangeError(`BitReader.readUVarint: varint longer than 10 bytes (corrupt stream)`);
  }

  readSVarint(): number {
    const zz = this.readUVarint();
    return (zz & 1) === 0 ? zz / 2 : -((zz + 1) / 2);
  }
}

// ---------------------------------------------------------------------------
//  Mode / bits helpers
// ---------------------------------------------------------------------------

const MODE_ID_CODE: Readonly<Record<"standard" | "aether", number>> = {
  standard: 0,
  aether: 1,
};

const MODE_BY_CODE: readonly Mode[] = [STANDARD_MODE, AETHER_MODE];

/** Minimum bits needed to represent integers in `[0, cap]` (≥ 1). */
export function bitsForRange(cap: number): number {
  if (cap <= 0) return 1;
  return Math.max(1, Math.ceil(Math.log2(cap + 1)));
}

/** Shared exponent bit width — max cap across the dice multiset. */
export function sharedExponentBits(diceTuple: readonly number[], mode: Mode): number {
  let maxCap = 0;
  for (const d of diceTuple) {
    const cap = mode.exponentCap(d);
    if (cap > maxCap) maxCap = cap;
  }
  return bitsForRange(maxCap);
}

function modeFromId(id: "standard" | "aether"): Mode {
  return id === "standard" ? STANDARD_MODE : AETHER_MODE;
}

function clampDiff100(d: number): number {
  if (!Number.isFinite(d) || d < 0) return 0;
  const v = Math.round(d * 100);
  return v > 10_000 ? 10_000 : v;
}

function isSortedAscending(xs: readonly number[]): boolean {
  for (let i = 1; i < xs.length; i += 1) {
    if (xs[i]! < xs[i - 1]!) return false;
  }
  return true;
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Build a lookup from permutation → its index in
 * `distinctPermutations(diceTuple)`. Used by the encoder to translate
 * `equation.dice` into a compact integer.
 */
function buildPermutationIndex(
  diceTuple: readonly number[],
): { perms: number[][]; findIndex: (perm: readonly number[]) => number } {
  const perms: number[][] = [];
  for (const p of distinctPermutations(diceTuple)) {
    perms.push(p.slice());
  }
  return {
    perms,
    findIndex(perm) {
      for (let i = 0; i < perms.length; i += 1) {
        if (arraysEqual(perms[i]!, perm)) return i;
      }
      return -1;
    },
  };
}

// ---------------------------------------------------------------------------
//  Encode / decode
// ---------------------------------------------------------------------------

export function encodeChunk(chunk: BinaryChunk): Uint8Array {
  const { header, equations } = chunk;
  if (header.diceTuple.length !== header.arity) {
    throw new RangeError(
      `encodeChunk: diceTuple.length (${header.diceTuple.length}) !== arity (${header.arity})`,
    );
  }
  if (!isSortedAscending(header.diceTuple)) {
    throw new RangeError(
      `encodeChunk: header.diceTuple must be sorted ascending, got [${header.diceTuple.join(", ")}]`,
    );
  }
  if (header.count !== equations.length) {
    throw new RangeError(
      `encodeChunk: header.count (${header.count}) !== equations.length (${equations.length})`,
    );
  }
  if (header.arity !== 3 && header.arity !== 4 && header.arity !== 5) {
    throw new RangeError(`encodeChunk: unsupported arity ${header.arity}`);
  }
  if (header.targetMax < header.targetMin) {
    throw new RangeError(
      `encodeChunk: targetMax (${header.targetMax}) < targetMin (${header.targetMin})`,
    );
  }

  const mode = modeFromId(header.modeId);
  const expBits = sharedExponentBits(header.diceTuple, mode);
  const { perms, findIndex } = buildPermutationIndex(header.diceTuple);
  const permIdxBits = bitsForRange(perms.length - 1);

  const writer = new BitWriter();
  writer.writeBits(CHUNK_MAGIC & 0xff, 8);
  writer.writeBits((CHUNK_MAGIC >>> 8) & 0xff, 8);
  writer.writeBits((CHUNK_MAGIC >>> 16) & 0xff, 8);
  writer.writeBits((CHUNK_MAGIC >>> 24) & 0xff, 8);
  writer.writeBits(CHUNK_VERSION, 8);

  writer.writeBits(MODE_ID_CODE[header.modeId], 1);
  writer.writeBits(header.arity, 3);
  writer.writeBits(0, 4); // reserved

  for (const d of header.diceTuple) writer.writeSVarint(d);
  writer.writeUVarint(header.targetMin);
  writer.writeUVarint(header.targetMax);
  writer.writeUVarint(header.count);

  let prevTarget = header.targetMin;
  for (let r = 0; r < equations.length; r += 1) {
    const rec = equations[r]!;
    const eq = rec.equation;
    if (eq.dice.length !== header.arity) {
      throw new RangeError(
        `encodeChunk: equation[${r}].dice.length (${eq.dice.length}) !== arity (${header.arity})`,
      );
    }
    if (eq.exps.length !== header.arity || eq.ops.length !== header.arity - 1) {
      throw new RangeError(
        `encodeChunk: equation[${r}] arity mismatch (exps=${eq.exps.length}, ops=${eq.ops.length})`,
      );
    }
    if (eq.total < header.targetMin || eq.total > header.targetMax) {
      throw new RangeError(
        `encodeChunk: equation[${r}].total (${eq.total}) outside [${header.targetMin}, ${header.targetMax}]`,
      );
    }
    const permIndex = findIndex(eq.dice);
    if (permIndex < 0) {
      throw new RangeError(
        `encodeChunk: equation[${r}].dice [${eq.dice.join(", ")}] is not a permutation of header.diceTuple [${header.diceTuple.join(", ")}]`,
      );
    }
    if (permIdxBits > 0) writer.writeBits(permIndex, permIdxBits);

    for (let i = 0; i < header.arity; i += 1) {
      const p = eq.exps[i]!;
      if (!Number.isInteger(p) || p < 0 || p >= Math.pow(2, expBits)) {
        throw new RangeError(
          `encodeChunk: equation[${r}].exps[${i}] (${p}) does not fit in ${expBits} bits`,
        );
      }
      writer.writeBits(p, expBits);
    }
    for (let i = 0; i < header.arity - 1; i += 1) {
      const op = eq.ops[i]!;
      if (op !== OP.ADD && op !== OP.SUB && op !== OP.MUL && op !== OP.DIV) {
        throw new RangeError(`encodeChunk: equation[${r}].ops[${i}] (${op}) not in 1..4`);
      }
      writer.writeBits(op - 1, 2);
    }
    const delta = eq.total - prevTarget;
    if (delta < 0) {
      throw new RangeError(
        `encodeChunk: equations must be sorted by total ascending (equation[${r}].total=${eq.total} < prev=${prevTarget})`,
      );
    }
    writer.writeUVarint(delta);
    writer.writeUVarint(clampDiff100(rec.difficulty));
    prevTarget = eq.total;
  }

  return writer.toUint8Array();
}

export function decodeChunk(bytes: Uint8Array): BinaryChunk {
  if (bytes.byteLength < 5) {
    throw new RangeError(`decodeChunk: buffer too small (${bytes.byteLength} bytes)`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic =
    view.getUint8(0) |
    (view.getUint8(1) << 8) |
    (view.getUint8(2) << 16) |
    (view.getUint8(3) << 24);
  if ((magic >>> 0) !== CHUNK_MAGIC) {
    throw new RangeError(
      `decodeChunk: bad magic 0x${(magic >>> 0).toString(16).padStart(8, "0")}, ` +
        `expected 0x${CHUNK_MAGIC.toString(16).padStart(8, "0")}`,
    );
  }
  const version = view.getUint8(4);
  if (version !== CHUNK_VERSION) {
    throw new RangeError(
      `decodeChunk: unsupported version ${version} (this build reads v${CHUNK_VERSION})`,
    );
  }

  const reader = new BitReader(view, 5 * 8);
  const modeCode = reader.readBits(1);
  const mode = MODE_BY_CODE[modeCode];
  if (mode === undefined) {
    throw new RangeError(`decodeChunk: unknown modeId code ${modeCode}`);
  }
  const modeId = mode.id as "standard" | "aether";
  const arityBits = reader.readBits(3);
  if (arityBits !== 3 && arityBits !== 4 && arityBits !== 5) {
    throw new RangeError(`decodeChunk: unsupported arity ${arityBits}`);
  }
  const arity: Arity = arityBits;
  const reserved = reader.readBits(4);
  if (reserved !== 0) {
    throw new RangeError(`decodeChunk: non-zero reserved header bits (${reserved})`);
  }

  const diceTuple: number[] = new Array(arity);
  for (let i = 0; i < arity; i += 1) diceTuple[i] = reader.readSVarint();
  const targetMin = reader.readUVarint();
  const targetMax = reader.readUVarint();
  const count = reader.readUVarint();
  if (targetMax < targetMin) {
    throw new RangeError(
      `decodeChunk: targetMax (${targetMax}) < targetMin (${targetMin})`,
    );
  }

  const expBits = sharedExponentBits(diceTuple, mode);
  const { perms } = buildPermutationIndex(diceTuple);
  const permIdxBits = bitsForRange(perms.length - 1);

  const equations: BinaryChunkRecord[] = new Array(count);
  let prevTarget = targetMin;
  for (let r = 0; r < count; r += 1) {
    const permIndex = permIdxBits > 0 ? reader.readBits(permIdxBits) : 0;
    if (permIndex >= perms.length) {
      throw new RangeError(
        `decodeChunk: equation[${r}] permIndex ${permIndex} out of range (have ${perms.length})`,
      );
    }
    const permDice = perms[permIndex]!;
    const exps: number[] = new Array(arity);
    for (let i = 0; i < arity; i += 1) exps[i] = reader.readBits(expBits);
    const ops: Operator[] = new Array(arity - 1);
    for (let i = 0; i < arity - 1; i += 1) ops[i] = (reader.readBits(2) + 1) as Operator;
    const delta = reader.readUVarint();
    const total = prevTarget + delta;
    if (total < targetMin || total > targetMax) {
      throw new RangeError(
        `decodeChunk: equation[${r}] total ${total} outside [${targetMin}, ${targetMax}]`,
      );
    }
    const difficulty = reader.readUVarint() / 100;
    equations[r] = {
      equation: { dice: permDice.slice(), exps, ops, total },
      difficulty,
    };
    prevTarget = total;
  }

  return {
    header: { modeId, arity, diceTuple, targetMin, targetMax, count },
    equations,
  };
}

// ---------------------------------------------------------------------------
//  Aggregate blob (a flat concatenation of chunks)
// ---------------------------------------------------------------------------

export function encodeChunks(chunks: readonly BinaryChunk[]): Uint8Array {
  const parts = chunks.map((c) => encodeChunk(c));
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

/** Parse every chunk in a concatenated aggregate blob. */
export function decodeChunks(bytes: Uint8Array): BinaryChunk[] {
  const out: BinaryChunk[] = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    const slice = bytes.subarray(offset);
    const chunk = decodeChunk(slice);
    out.push(chunk);
    offset += byteLengthOfChunk(slice);
  }
  return out;
}

function byteLengthOfChunk(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const reader = new BitReader(view, 5 * 8);
  const modeCode = reader.readBits(1);
  const mode = MODE_BY_CODE[modeCode];
  if (mode === undefined) {
    throw new RangeError(`byteLengthOfChunk: unknown modeId code ${modeCode}`);
  }
  const arity = reader.readBits(3);
  reader.readBits(4); // reserved

  const diceTuple: number[] = new Array(arity);
  for (let i = 0; i < arity; i += 1) diceTuple[i] = reader.readSVarint();
  const targetMin = reader.readUVarint();
  reader.readUVarint(); // targetMax
  const count = reader.readUVarint();

  const expBits = sharedExponentBits(diceTuple, mode);
  const { perms } = buildPermutationIndex(diceTuple);
  const permIdxBits = bitsForRange(perms.length - 1);

  let prevTarget = targetMin;
  for (let r = 0; r < count; r += 1) {
    if (permIdxBits > 0) reader.readBits(permIdxBits);
    for (let i = 0; i < arity; i += 1) reader.readBits(expBits);
    for (let i = 0; i < arity - 1; i += 1) reader.readBits(2);
    prevTarget += reader.readUVarint();
    reader.readUVarint(); // difficulty
  }
  return Math.ceil(reader.bitOffset / 8);
}

// ---------------------------------------------------------------------------
//  Convenience builders
// ---------------------------------------------------------------------------

/**
 * Build a {@link BinaryChunk} from raw solver output. `diceTuple` MUST
 * be the canonical (sorted, post-depower-for-standard) multiset the
 * equations were solved against — i.e., `preprocessDice(input, mode)`
 * sorted ascending.
 */
export function chunkFromBulkSolutions(
  diceTuple: readonly number[],
  mode: Mode,
  targetMin: number,
  targetMax: number,
  solutions: readonly BulkSolution[],
): BinaryChunk {
  if (mode.id !== "standard" && mode.id !== "aether") {
    throw new RangeError(
      `chunkFromBulkSolutions: only built-in modes can be serialized (got "${mode.id}")`,
    );
  }
  const arity = diceTuple.length as Arity;
  const sorted = solutions.slice().sort((a, b) => a.equation.total - b.equation.total);
  return {
    header: {
      modeId: mode.id,
      arity,
      diceTuple,
      targetMin,
      targetMax,
      count: sorted.length,
    },
    equations: sorted.map((s) => ({ equation: s.equation, difficulty: s.difficulty })),
  };
}
