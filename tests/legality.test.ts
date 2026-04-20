import { describe, expect, it } from "vitest";
import {
  AETHER_MODE,
  DICE_COMBINATIONS,
  STANDARD_MODE,
  isLegalDiceTriple,
} from "../src/core/constants.js";
import {
  COMMONS_DICE_VALUES,
  EXTENDED_DICE_VALUES,
  countLegalTuples,
  enumerateLegalTuples,
  isCommonDiceTuple,
  isExtendedDiceTuple,
  isLegalDiceTuple,
} from "../src/core/legality.js";

describe("isLegalDiceTuple — standard mode (arity 3)", () => {
  it("accepts ordinary triples", () => {
    expect(isLegalDiceTuple([2, 3, 5], STANDARD_MODE)).toBe(true);
    expect(isLegalDiceTuple([2, 2, 3], STANDARD_MODE)).toBe(true); // 2-of-a-kind ok
    expect(isLegalDiceTuple([10, 15, 20], STANDARD_MODE)).toBe(true);
  });

  it("rejects 1s in standard mode (range starts at 2)", () => {
    // Standard's dice range is [2, 20], so even a single 1 is out
    // of range. The "≤1 one" rule is what kicks in for Æther mode
    // where 1 is in range; here we get range-rejection for free.
    expect(isLegalDiceTuple([1, 5, 7], STANDARD_MODE)).toBe(false);
    expect(isLegalDiceTuple([1, 1, 5], STANDARD_MODE)).toBe(false);
  });

  it("rejects all-same triples (N-of-a-kind for N=3)", () => {
    expect(isLegalDiceTuple([5, 5, 5], STANDARD_MODE)).toBe(false);
    expect(isLegalDiceTuple([2, 2, 2], STANDARD_MODE)).toBe(false);
  });

  it("rejects out-of-range dice", () => {
    expect(isLegalDiceTuple([2, 3, 21], STANDARD_MODE)).toBe(false); // 21 > max
    expect(isLegalDiceTuple([0, 3, 5], STANDARD_MODE)).toBe(false); // 0 < min (2)
  });

  it("rejects wrong arity in standard mode", () => {
    expect(isLegalDiceTuple([2, 3, 5, 7], STANDARD_MODE)).toBe(false);
    expect(isLegalDiceTuple([2, 3], STANDARD_MODE)).toBe(false);
  });

  it("matches isLegalDiceTriple for every triple in DICE_COMBINATIONS (property test)", () => {
    // DICE_COMBINATIONS is the curated v1 universe; both predicates
    // must agree on every member after the legality unification.
    for (const triple of DICE_COMBINATIONS) {
      expect(isLegalDiceTuple(triple, STANDARD_MODE)).toBe(
        isLegalDiceTriple(triple),
      );
    }
  });

  it("matches isLegalDiceTriple across the whole 2..20³ search space", () => {
    // Stronger: agree on rejections too, not just the curated accepts.
    for (let a = 2; a <= 20; a += 1) {
      for (let b = 2; b <= 20; b += 1) {
        for (let c = 2; c <= 20; c += 1) {
          const triple: [number, number, number] = [a, b, c];
          expect(isLegalDiceTuple(triple, STANDARD_MODE)).toBe(
            isLegalDiceTriple(triple),
          );
        }
      }
    }
  });
});

describe("isLegalDiceTuple — Æther mode (arity 4 and 5)", () => {
  it("accepts diverse positive 4-tuples", () => {
    expect(isLegalDiceTuple([2, 3, 5, 7], AETHER_MODE)).toBe(true);
    expect(isLegalDiceTuple([2, 2, 3, 5], AETHER_MODE)).toBe(true); // 2-of-a-kind
    expect(isLegalDiceTuple([1, 2, 3, 5], AETHER_MODE)).toBe(true); // one 1 ok
    expect(isLegalDiceTuple([-3, 2, 5, 7], AETHER_MODE)).toBe(true); // negatives ok
  });

  it("accepts diverse 5-tuples", () => {
    expect(isLegalDiceTuple([2, 3, 5, 7, 11], AETHER_MODE)).toBe(true);
    expect(isLegalDiceTuple([2, 2, 3, 4, 5], AETHER_MODE)).toBe(true);
  });

  it("rejects rolls with two or more 1s", () => {
    expect(isLegalDiceTuple([1, 1, 5, 7], AETHER_MODE)).toBe(false);
    expect(isLegalDiceTuple([1, 1, 5, 7, 11], AETHER_MODE)).toBe(false);
  });

  it("rejects N-of-a-kind", () => {
    // arity 4: 4-of-a-kind banned; 3-of-a-kind allowed (≤ N−1).
    expect(isLegalDiceTuple([5, 5, 5, 5], AETHER_MODE)).toBe(false);
    expect(isLegalDiceTuple([5, 5, 5, 7], AETHER_MODE)).toBe(true);
    // arity 5: 5-of-a-kind banned; 4-of-a-kind allowed.
    expect(isLegalDiceTuple([5, 5, 5, 5, 5], AETHER_MODE)).toBe(false);
    expect(isLegalDiceTuple([5, 5, 5, 5, 7], AETHER_MODE)).toBe(true);
  });

  it("rejects the 0 die (legalDieValue filter)", () => {
    expect(isLegalDiceTuple([0, 2, 3, 5], AETHER_MODE)).toBe(false);
    expect(isLegalDiceTuple([0, 2, 3, 5, 7], AETHER_MODE)).toBe(false);
  });

  it("rejects out-of-range dice", () => {
    expect(isLegalDiceTuple([-11, 2, 3, 5], AETHER_MODE)).toBe(false);
    expect(isLegalDiceTuple([2, 3, 5, 33], AETHER_MODE)).toBe(false);
  });

  it("rejects unsupported arities", () => {
    expect(isLegalDiceTuple([2, 3, 5, 7, 11, 13], AETHER_MODE)).toBe(false);
    expect(isLegalDiceTuple([2, 3], AETHER_MODE)).toBe(false);
  });
});

describe("enumerateLegalTuples", () => {
  it("yields tuples in canonical sorted order", () => {
    const seen: ReadonlyArray<readonly number[]>[] = [];
    let prev: readonly number[] | null = null;
    for (const t of enumerateLegalTuples(3, STANDARD_MODE)) {
      // a ≤ b ≤ c invariant
      expect(t[0]).toBeLessThanOrEqual(t[1]);
      expect(t[1]).toBeLessThanOrEqual(t[2]);
      if (prev !== null) {
        // strictly increasing under lex order
        const lex = (x: readonly number[], y: readonly number[]) => {
          for (let i = 0; i < x.length; i += 1) {
            if (x[i] !== y[i]) return x[i] - y[i];
          }
          return 0;
        };
        expect(lex(prev, t)).toBeLessThan(0);
      }
      prev = t;
    }
  });

  it("matches DICE_COMBINATIONS for arity-3 standard mode (modulo c ≤ 20)", () => {
    // DICE_COMBINATIONS bounds a in [2..10] and b in [2..10] for
    // historical reasons, while enumerateLegalTuples enumerates the
    // full mode range. Filter to compare.
    const enumerated = Array.from(
      enumerateLegalTuples(3, STANDARD_MODE, (t) => t[0] <= 10 && t[1] <= 10),
    );
    expect(enumerated.length).toBe(DICE_COMBINATIONS.length);
    for (let i = 0; i < enumerated.length; i += 1) {
      expect(enumerated[i]).toEqual(DICE_COMBINATIONS[i]);
    }
  });

  it("respects the predicate filter", () => {
    const noPrimes = (t: readonly number[]) =>
      t.every((d) => d === 4 || d === 6 || d === 8);
    for (const t of enumerateLegalTuples(3, STANDARD_MODE, noPrimes)) {
      for (const d of t) {
        expect([4, 6, 8]).toContain(d);
      }
    }
  });

  it("throws on unsupported arity", () => {
    expect(() => enumerateLegalTuples(4 as 3, STANDARD_MODE).next()).toThrow();
  });

  it("excludes the 0 die in Æther mode", () => {
    let saw0 = false;
    for (const t of enumerateLegalTuples(4, AETHER_MODE, (x) => x[0] === 0)) {
      saw0 = true;
      void t;
    }
    expect(saw0).toBe(false);
  });
});

describe("countLegalTuples", () => {
  it("matches the array length of enumerateLegalTuples", () => {
    const arr = Array.from(enumerateLegalTuples(3, STANDARD_MODE));
    expect(countLegalTuples(3, STANDARD_MODE)).toBe(arr.length);
  });
});

describe("commons / extended predicates (curator filters)", () => {
  it("isCommonDiceTuple rejects 1s", () => {
    expect(isCommonDiceTuple([1, 2, 3, 5])).toBe(false);
  });

  it("isCommonDiceTuple rejects values outside the commons set", () => {
    expect(isCommonDiceTuple([2, 3, 5, 13])).toBe(false); // 13 not in commons
    expect(isCommonDiceTuple([2, 3, 5, 30])).toBe(false);
  });

  it("isCommonDiceTuple rejects 3+ of a kind", () => {
    expect(isCommonDiceTuple([5, 5, 5, 7])).toBe(false);
    expect(isCommonDiceTuple([5, 5, 7, 7])).toBe(true); // 2-of-a-kind ok
  });

  it("isCommonDiceTuple accepts representative samples", () => {
    expect(isCommonDiceTuple([2, 3, 4, 5])).toBe(true);
    expect(isCommonDiceTuple([2, 3, 5, 6, 7])).toBe(true);
    expect(isCommonDiceTuple([3, 5, 7, 11, 12])).toBe(true);
  });

  it("commons set is a strict subset of extended set", () => {
    for (const d of COMMONS_DICE_VALUES) {
      expect(EXTENDED_DICE_VALUES.has(d)).toBe(true);
    }
    expect(EXTENDED_DICE_VALUES.size).toBeGreaterThan(COMMONS_DICE_VALUES.size);
  });

  it("isExtendedDiceTuple accepts dice up to 20", () => {
    expect(isExtendedDiceTuple([2, 3, 13, 17])).toBe(true);
    expect(isExtendedDiceTuple([2, 3, 13, 21])).toBe(false); // 21 out
  });
});
