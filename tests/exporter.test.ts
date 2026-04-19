import { describe, expect, it } from "vitest";
import { AETHER_MODE, STANDARD_MODE } from "../src/core/constants.js";
import {
  canonicalizeTuple,
  chunkFilename,
  chunkRelativePath,
  exportOneTuple,
  toBinaryChunk,
  toChunkJson,
  verifyEquation,
} from "../src/services/exporter.js";
import { decodeChunk, encodeChunk } from "../src/core/n2kBinary.js";

describe("canonicalizeTuple", () => {
  it("depowers and sorts for standard mode", () => {
    expect(canonicalizeTuple([8, 3, 5], STANDARD_MODE)).toEqual([2, 3, 5]);
    expect(canonicalizeTuple([16, 9, 5], STANDARD_MODE)).toEqual([2, 3, 5]);
  });

  it("only sorts for Æther mode (no depower)", () => {
    expect(canonicalizeTuple([7, -3, 2], AETHER_MODE)).toEqual([-3, 2, 7]);
    expect(canonicalizeTuple([4, 8, 16], AETHER_MODE)).toEqual([4, 8, 16]);
  });
});

describe("exportOneTuple", () => {
  it("covers a reasonable chunk of targets for standard (2, 3, 5)", () => {
    const result = exportOneTuple([2, 3, 5], STANDARD_MODE);
    expect(result.arity).toBe(3);
    expect(result.canonicalTuple).toEqual([2, 3, 5]);
    expect(result.equations.length).toBeGreaterThan(50);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("sorts equations by target ascending", () => {
    const result = exportOneTuple([2, 3, 5], STANDARD_MODE);
    for (let i = 1; i < result.equations.length; i += 1) {
      expect(result.equations[i]!.equation.total).toBeGreaterThanOrEqual(
        result.equations[i - 1]!.equation.total,
      );
    }
  });

  it("depowers input dice before solving (standard)", () => {
    const direct = exportOneTuple([2, 3, 5], STANDARD_MODE);
    const powered = exportOneTuple([4, 3, 5], STANDARD_MODE);
    // Different canonical tuples? No — 4 depowers to 2, so canonicalTuple
    // matches (2, 3, 5) and equation sets are identical.
    expect(powered.canonicalTuple).toEqual([2, 3, 5]);
    expect(powered.equations.length).toBe(direct.equations.length);
  });

  it("rejects arities the mode doesn't allow", () => {
    expect(() => exportOneTuple([2, 3, 5, 7], STANDARD_MODE)).toThrow();
  });

  it("handles arity-3 Æther with negative dice", () => {
    const result = exportOneTuple([-3, 5, 7], AETHER_MODE);
    expect(result.canonicalTuple).toEqual([-3, 5, 7]);
    expect(result.equations.length).toBeGreaterThan(0);
    for (const sol of result.equations) {
      expect(sol.equation.total).toBeGreaterThanOrEqual(AETHER_MODE.targetRange.min);
      expect(sol.equation.total).toBeLessThanOrEqual(AETHER_MODE.targetRange.max);
    }
  });
});

describe("binary ↔ JSON parity", () => {
  it("binary round-trip preserves the equation set (standard)", () => {
    const result = exportOneTuple([2, 3, 5], STANDARD_MODE);
    const chunk = toBinaryChunk(result, STANDARD_MODE);
    const bytes = encodeChunk(chunk);
    const back = decodeChunk(bytes);
    expect(back.header.count).toBe(result.equations.length);
    expect(back.equations.length).toBe(result.equations.length);
    for (let i = 0; i < result.equations.length; i += 1) {
      expect(back.equations[i]!.equation.total).toBe(
        result.equations[i]!.equation.total,
      );
      expect(back.equations[i]!.equation.ops).toEqual(
        result.equations[i]!.equation.ops,
      );
    }
  });

  it("JSON projection matches the raw solver output cell-by-cell", () => {
    const result = exportOneTuple([2, 3, 5], STANDARD_MODE);
    const json = toChunkJson(result, STANDARD_MODE);
    expect(json.count).toBe(result.equations.length);
    expect(json.equations.length).toBe(result.equations.length);
    for (let i = 0; i < json.equations.length; i += 1) {
      const src = result.equations[i]!;
      const dst = json.equations[i]!;
      expect(dst.target).toBe(src.equation.total);
      expect(dst.dice).toEqual(src.equation.dice);
      expect(dst.exps).toEqual(src.equation.exps);
      expect(dst.ops).toEqual(src.equation.ops);
    }
  });
});

describe("verifyEquation", () => {
  it("returns true for every equation the solver produced", () => {
    const result = exportOneTuple([2, 3, 5], STANDARD_MODE);
    for (const sol of result.equations) {
      expect(verifyEquation(sol.equation)).toBe(true);
    }
  });

  it("detects a tampered total", () => {
    const result = exportOneTuple([2, 3, 5], STANDARD_MODE);
    const eq = result.equations[0]!.equation;
    const tampered = { ...eq, total: eq.total + 1 };
    expect(verifyEquation(tampered)).toBe(false);
  });
});

describe("filename / path helpers", () => {
  it("names standard chunks without the arity subdir", () => {
    expect(chunkFilename([2, 3, 5], STANDARD_MODE)).toBe("tuple-2-3-5.json");
    expect(chunkRelativePath([2, 3, 5], STANDARD_MODE)).toBe("chunks/tuple-2-3-5.json");
  });

  it("nests Æther chunks by arity", () => {
    expect(chunkRelativePath([2, 3, 5], AETHER_MODE)).toBe(
      "chunks/arity-3/tuple-2-3-5.json",
    );
    expect(chunkRelativePath([-3, 5, 7, 2], AETHER_MODE)).toBe(
      "chunks/arity-4/tuple-n3-2-5-7.json",
    );
  });

  it("renders negative dice with the n-prefix", () => {
    expect(chunkFilename([-10, -3, 5], AETHER_MODE)).toBe("tuple-n10-n3-5.json");
  });
});
