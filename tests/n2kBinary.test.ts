import { describe, expect, it } from "vitest";
import { AETHER_MODE, OP, STANDARD_MODE } from "../src/core/constants.js";
import type { Arity, BulkSolution, Mode, NEquation, Operator } from "../src/core/types.js";
import {
  BitReader,
  BitWriter,
  CHUNK_MAGIC,
  CHUNK_VERSION,
  bitsForRange,
  chunkFromBulkSolutions,
  decodeChunk,
  decodeChunks,
  encodeChunk,
  encodeChunks,
  sharedExponentBits,
  type BinaryChunk,
} from "../src/core/n2kBinary.js";
import { distinctPermutations } from "../src/services/arithmetic.js";
import { depowerDice } from "../src/core/constants.js";
import { solveForExport } from "../src/services/solver.js";

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomDiceTuple(mode: Mode, arity: Arity, rng: () => number): number[] {
  const { min, max } = mode.diceRange;
  const out: number[] = new Array(arity);
  for (let i = 0; i < arity; i += 1) {
    out[i] = Math.floor(rng() * (max - min + 1)) + min;
  }
  // Canonicalize: depower for standard mode, then sort ascending.
  const processed = mode.depower ? out.map(depowerDice) : out;
  processed.sort((a, b) => a - b);
  return processed;
}

function randomEquation(
  diceTuple: readonly number[],
  target: number,
  mode: Mode,
  rng: () => number,
): { equation: NEquation; difficulty: number } {
  const arity = diceTuple.length;
  const perms: number[][] = [];
  for (const p of distinctPermutations(diceTuple)) perms.push(p.slice());
  const permIndex = Math.floor(rng() * perms.length);
  const dice = perms[permIndex]!;
  let maxCap = 0;
  for (const d of diceTuple) maxCap = Math.max(maxCap, mode.exponentCap(d));
  const exps: number[] = new Array(arity);
  for (let i = 0; i < arity; i += 1) {
    exps[i] = Math.floor(rng() * (maxCap + 1));
  }
  const ops: Operator[] = new Array(arity - 1);
  for (let i = 0; i < arity - 1; i += 1) {
    ops[i] = (Math.floor(rng() * 4) + 1) as Operator;
  }
  const difficulty = Math.round(rng() * 10_000) / 100;
  return {
    equation: { dice, exps, ops, total: target },
    difficulty,
  };
}

function buildRandomChunk(mode: Mode, arity: Arity, rng: () => number): BinaryChunk {
  const dice = randomDiceTuple(mode, arity, rng);
  const targetMin = 1;
  const targetMax = mode.targetRange.max;
  const count = Math.floor(rng() * 25);
  const equations: { equation: NEquation; difficulty: number }[] = [];
  let cursor = targetMin;
  for (let i = 0; i < count; i += 1) {
    if (cursor > targetMax) break;
    const step = Math.floor(rng() * 10);
    cursor = Math.min(cursor + step, targetMax);
    const rec = randomEquation(dice, cursor, mode, rng);
    equations.push(rec);
  }
  return {
    header: {
      modeId: mode.id as "standard" | "aether",
      arity,
      diceTuple: dice,
      targetMin,
      targetMax,
      count: equations.length,
    },
    equations,
  };
}

// ---------------------------------------------------------------------------
//  Bit primitives
// ---------------------------------------------------------------------------

describe("BitWriter / BitReader", () => {
  it("round-trips arbitrary bit-width values", () => {
    const w = new BitWriter();
    w.writeBits(0, 1);
    w.writeBits(5, 3);
    w.writeBits(0x3ff, 10);
    w.writeBits(0, 2);
    w.writeBits(0xdeadbeef, 32);
    const bytes = w.toUint8Array();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const r = new BitReader(view);
    expect(r.readBits(1)).toBe(0);
    expect(r.readBits(3)).toBe(5);
    expect(r.readBits(10)).toBe(0x3ff);
    expect(r.readBits(2)).toBe(0);
    expect(r.readBits(32)).toBe(0xdeadbeef);
  });

  it("rejects values that don't fit in n bits", () => {
    const w = new BitWriter();
    expect(() => w.writeBits(16, 4)).toThrow();
    expect(() => w.writeBits(-1, 8)).toThrow();
  });

  it("round-trips unsigned varints across orders of magnitude", () => {
    const cases = [0, 1, 127, 128, 255, 16_383, 16_384, 1_048_575, 1_000_000];
    const w = new BitWriter();
    for (const v of cases) w.writeUVarint(v);
    const bytes = w.toUint8Array();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const r = new BitReader(view);
    for (const v of cases) expect(r.readUVarint()).toBe(v);
  });

  it("round-trips signed varints including negatives", () => {
    const cases = [0, 1, -1, 42, -42, 2047, -2047, 1_000_000, -1_000_000];
    const w = new BitWriter();
    for (const v of cases) w.writeSVarint(v);
    const bytes = w.toUint8Array();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const r = new BitReader(view);
    for (const v of cases) expect(r.readSVarint()).toBe(v);
  });

  it("mixes bit-level and varint writes on the same cursor", () => {
    const w = new BitWriter();
    w.writeBits(0b101, 3);
    w.writeUVarint(300);
    w.writeBits(1, 1);
    w.writeSVarint(-7);
    const bytes = w.toUint8Array();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const r = new BitReader(view);
    expect(r.readBits(3)).toBe(0b101);
    expect(r.readUVarint()).toBe(300);
    expect(r.readBits(1)).toBe(1);
    expect(r.readSVarint()).toBe(-7);
  });
});

describe("bitsForRange / sharedExponentBits", () => {
  it("uses one bit for trivial caps", () => {
    expect(bitsForRange(0)).toBe(1);
    expect(bitsForRange(1)).toBe(1);
  });

  it("scales logarithmically", () => {
    expect(bitsForRange(2)).toBe(2);
    expect(bitsForRange(3)).toBe(2);
    expect(bitsForRange(4)).toBe(3);
    expect(bitsForRange(13)).toBe(4);
    expect(bitsForRange(20)).toBe(5);
  });

  it("picks the largest cap across a tuple", () => {
    // Standard (2, 3, 5): caps 13, 10, 6 → max 13 → 4 bits.
    expect(sharedExponentBits([2, 3, 5], STANDARD_MODE)).toBe(4);
    // Æther (2, 2, 2): cap 20 → 5 bits.
    expect(sharedExponentBits([2, 2, 2], AETHER_MODE)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
//  Chunk encode / decode
// ---------------------------------------------------------------------------

describe("encodeChunk / decodeChunk — header invariants", () => {
  it("writes the magic bytes and version at a fixed offset", () => {
    const chunk: BinaryChunk = {
      header: {
        modeId: "standard",
        arity: 3,
        diceTuple: [2, 3, 5],
        targetMin: 1,
        targetMax: 10,
        count: 0,
      },
      equations: [],
    };
    const bytes = encodeChunk(chunk);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic =
      (view.getUint8(0) |
        (view.getUint8(1) << 8) |
        (view.getUint8(2) << 16) |
        (view.getUint8(3) << 24)) >>>
      0;
    expect(magic).toBe(CHUNK_MAGIC);
    expect(view.getUint8(4)).toBe(CHUNK_VERSION);
  });

  it("rejects bad magic", () => {
    const chunk: BinaryChunk = {
      header: {
        modeId: "standard",
        arity: 3,
        diceTuple: [2, 3, 5],
        targetMin: 1,
        targetMax: 10,
        count: 0,
      },
      equations: [],
    };
    const bytes = encodeChunk(chunk);
    bytes[0] = 0x00;
    expect(() => decodeChunk(bytes)).toThrow(/magic/);
  });

  it("rejects unsupported version", () => {
    const chunk: BinaryChunk = {
      header: {
        modeId: "standard",
        arity: 3,
        diceTuple: [2, 3, 5],
        targetMin: 1,
        targetMax: 10,
        count: 0,
      },
      equations: [],
    };
    const bytes = encodeChunk(chunk);
    bytes[4] = 0xff;
    expect(() => decodeChunk(bytes)).toThrow(/version/);
  });

  it("enforces header.count === equations.length", () => {
    const eq: NEquation = {
      dice: [2, 3, 5],
      exps: [0, 0, 0],
      ops: [OP.ADD, OP.ADD],
      total: 10,
    };
    const chunk: BinaryChunk = {
      header: {
        modeId: "standard",
        arity: 3,
        diceTuple: [2, 3, 5],
        targetMin: 1,
        targetMax: 10,
        count: 2,
      },
      equations: [{ equation: eq, difficulty: 1 }],
    };
    expect(() => encodeChunk(chunk)).toThrow(/count/);
  });
});

describe("encodeChunk / decodeChunk — handcrafted round-trip", () => {
  it("round-trips a tiny standard-mode chunk exactly", () => {
    const eq: NEquation = {
      dice: [2, 3, 5],
      exps: [1, 0, 1],
      ops: [OP.ADD, OP.MUL],
      total: 25,
    };
    const chunk: BinaryChunk = {
      header: {
        modeId: "standard",
        arity: 3,
        diceTuple: [2, 3, 5],
        targetMin: 1,
        targetMax: 100,
        count: 1,
      },
      equations: [{ equation: eq, difficulty: 17.5 }],
    };
    const bytes = encodeChunk(chunk);
    const back = decodeChunk(bytes);
    expect(back).toEqual(chunk);
  });

  it("round-trips an arity-5 Æther chunk with negative dice", () => {
    // Canonical sorted tuple [-10, -3, 2, 5, 7]; equation dice is a
    // permutation of that.
    const eq: NEquation = {
      dice: [-3, 7, 2, 5, -10],
      exps: [1, 1, 4, 1, 0],
      ops: [OP.MUL, OP.ADD, OP.SUB, OP.DIV],
      total: 42,
    };
    const chunk: BinaryChunk = {
      header: {
        modeId: "aether",
        arity: 5,
        diceTuple: [-10, -3, 2, 5, 7],
        targetMin: 1,
        targetMax: 5000,
        count: 1,
      },
      equations: [{ equation: eq, difficulty: 63.21 }],
    };
    const bytes = encodeChunk(chunk);
    expect(decodeChunk(bytes)).toEqual(chunk);
  });

  it("rejects an unsorted header diceTuple", () => {
    const chunk: BinaryChunk = {
      header: {
        modeId: "aether",
        arity: 3,
        diceTuple: [5, 3, 2],
        targetMin: 1,
        targetMax: 100,
        count: 0,
      },
      equations: [],
    };
    expect(() => encodeChunk(chunk)).toThrow(/sorted/);
  });

  it("rejects equation.dice that isn't a permutation of diceTuple", () => {
    const eq: NEquation = {
      dice: [2, 3, 7],
      exps: [0, 0, 0],
      ops: [OP.ADD, OP.ADD],
      total: 12,
    };
    const chunk: BinaryChunk = {
      header: {
        modeId: "standard",
        arity: 3,
        diceTuple: [2, 3, 5],
        targetMin: 1,
        targetMax: 100,
        count: 1,
      },
      equations: [{ equation: eq, difficulty: 1 }],
    };
    expect(() => encodeChunk(chunk)).toThrow(/permutation/);
  });
});

describe("encodeChunk / decodeChunk — randomized round-trips", () => {
  it("round-trips ≥ 100 random chunks across both modes (standard)", () => {
    const rng = mulberry32(0xc0de);
    for (let i = 0; i < 60; i += 1) {
      const chunk = buildRandomChunk(STANDARD_MODE, 3, rng);
      const bytes = encodeChunk(chunk);
      expect(decodeChunk(bytes)).toEqual(chunk);
    }
  });

  it("round-trips ≥ 100 random chunks across both modes (aether, mixed arity)", () => {
    const rng = mulberry32(0x1337);
    const arities: Arity[] = [3, 4, 5];
    for (let i = 0; i < 60; i += 1) {
      const arity = arities[i % arities.length]!;
      const chunk = buildRandomChunk(AETHER_MODE, arity, rng);
      const bytes = encodeChunk(chunk);
      expect(decodeChunk(bytes)).toEqual(chunk);
    }
  });
});

describe("encodeChunk / decodeChunk — real solver output", () => {
  it("round-trips a real standard-mode solve for (2, 3, 5)", () => {
    const sols = solveForExport([2, 3, 5], 3, 1, 999, STANDARD_MODE);
    expect(sols.length).toBeGreaterThan(50);
    const chunk = chunkFromBulkSolutions([2, 3, 5], STANDARD_MODE, 1, 999, sols);
    const bytes = encodeChunk(chunk);
    const back = decodeChunk(bytes);
    expect(back.header.count).toBe(sols.length);
    expect(back.equations.length).toBe(sols.length);
    for (let i = 0; i < sols.length; i += 1) {
      expect(back.equations[i]!.equation.total).toBe(sols[i]!.equation.total);
      expect(back.equations[i]!.difficulty).toBeCloseTo(sols[i]!.difficulty, 2);
    }
  });
});

describe("encodeChunks / decodeChunks — aggregate blob", () => {
  it("round-trips multiple chunks concatenated", () => {
    const rng = mulberry32(0x5eed);
    const chunks: BinaryChunk[] = [];
    for (let i = 0; i < 5; i += 1) {
      chunks.push(buildRandomChunk(STANDARD_MODE, 3, rng));
    }
    for (let i = 0; i < 5; i += 1) {
      const arity: Arity = i % 2 === 0 ? 4 : 5;
      chunks.push(buildRandomChunk(AETHER_MODE, arity, rng));
    }
    const blob = encodeChunks(chunks);
    const back = decodeChunks(blob);
    expect(back).toEqual(chunks);
  });

  it("handles an empty chunk list", () => {
    expect(decodeChunks(encodeChunks([]))).toEqual([]);
  });
});

describe("BulkSolution helper", () => {
  it("sorts solutions by total before packing", () => {
    const base = (total: number): BulkSolution => ({
      equation: {
        dice: [2, 3, 5],
        exps: [0, 0, 0],
        ops: [OP.ADD, OP.ADD],
        total,
      },
      difficulty: total,
    });
    const unsorted = [base(25), base(10), base(50)];
    const chunk = chunkFromBulkSolutions([2, 3, 5], STANDARD_MODE, 1, 999, unsorted);
    expect(chunk.equations.map((e) => e.equation.total)).toEqual([10, 25, 50]);
  });
});
