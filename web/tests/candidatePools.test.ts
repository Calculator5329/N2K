/**
 * candidatePools — Compose-side dice catalogues.
 *
 * The blob loader only carries dice in `STANDARD_MODE.diceRange`, so
 * every triple emitted by `extensive` and `standard` MUST live inside
 * those bounds; otherwise Compose would dispatch a `loadDice` against
 * a tuple the backend can't resolve.
 */
import { describe, expect, it } from "vitest";
import { AETHER_MODE, STANDARD_MODE } from "../../src/core/constants";
import {
  AETHER_CANDIDATE_POOLS,
  CANDIDATE_POOLS,
  getCandidatePool,
} from "../src/services/candidatePools";

describe("candidatePools", () => {
  const min = STANDARD_MODE.diceRange.min;
  const max = STANDARD_MODE.diceRange.max;

  it("only emits standard-range triples for the standard pool", () => {
    const triples = getCandidatePool("standard");
    for (const [a, b, c] of triples) {
      expect(a).toBeGreaterThanOrEqual(min);
      expect(c).toBeLessThanOrEqual(max);
      expect(a <= b && b <= c).toBe(true);
    }
  });

  it("only emits standard-range triples for the extensive pool", () => {
    const triples = getCandidatePool("extensive");
    expect(triples.length).toBeGreaterThan(triples.length / 2);
    for (const [a, b, c] of triples) {
      expect(a).toBeGreaterThanOrEqual(min);
      expect(c).toBeLessThanOrEqual(max);
      expect(a <= b && b <= c).toBe(true);
    }
  });

  it("publishes pool metadata sized to match the actual pool", () => {
    for (const meta of [...CANDIDATE_POOLS, ...AETHER_CANDIDATE_POOLS]) {
      const triples = getCandidatePool(meta.id);
      expect(meta.size).toBe(triples.length);
    }
  });

  it("Æther sample pool stays inside AETHER_MODE.diceRange", () => {
    const triples = getCandidatePool("aetherSample");
    expect(triples.length).toBeGreaterThan(0);
    const aMin = AETHER_MODE.diceRange.min;
    const aMax = AETHER_MODE.diceRange.max;
    for (const [a, b, c] of triples) {
      expect(a).toBeGreaterThanOrEqual(aMin);
      expect(c).toBeLessThanOrEqual(aMax);
      expect(a <= b && b <= c).toBe(true);
    }
  });

  it("Æther full 3d pool covers the entire AETHER_MODE.diceRange", () => {
    const triples = getCandidatePool("aetherFull3d");
    const aMin = AETHER_MODE.diceRange.min;
    const aMax = AETHER_MODE.diceRange.max;
    // Every triple must sit inside the Æther range and be canonical.
    for (const [a, b, c] of triples) {
      expect(a).toBeGreaterThanOrEqual(aMin);
      expect(c).toBeLessThanOrEqual(aMax);
      expect(a <= b && b <= c).toBe(true);
    }
    // Sanity: full enumeration of unordered triples = C(n+2, 3) where
    // n = aMax - aMin + 1. Catches accidental filtering / off-by-one.
    const n = aMax - aMin + 1;
    const expected = (n * (n + 1) * (n + 2)) / 6;
    expect(triples.length).toBe(expected);
    // Confirms the pool actually reaches into the negatives + the
    // upper face values that `aetherSample` never touches.
    expect(triples.some(([a]) => a < 0)).toBe(true);
    expect(triples.some(([, , c]) => c > 16)).toBe(true);
  });
});
