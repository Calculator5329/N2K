/**
 * LookupStore — clamping + canonicalisation.
 *
 * The Lookup view's dice picker must never let the user wander outside
 * `STANDARD_MODE.diceRange` (the blob has no entries for `1`s) and
 * the canonical sorted form is what `DataStore` keys on for caching.
 */
import { describe, expect, it } from "vitest";
import { LookupStore } from "../src/features/lookup/LookupStore";
import { STANDARD_MODE } from "../../src/core/constants";

describe("LookupStore", () => {
  it("clamps die values to the standard mode dice range", () => {
    const s = new LookupStore();
    s.setDie(0, 0);
    expect(s.dice[0]).toBeGreaterThanOrEqual(STANDARD_MODE.diceRange.min);
    s.setDie(0, 999);
    expect(s.dice[2]).toBeLessThanOrEqual(STANDARD_MODE.diceRange.max);
  });

  it("clamps the target to the standard mode target range", () => {
    const s = new LookupStore();
    s.setTotal(0);
    expect(s.total).toBe(STANDARD_MODE.targetRange.min);
    s.setTotal(99_999);
    expect(s.total).toBe(STANDARD_MODE.targetRange.max);
  });

  it("canonicalises dice via sort", () => {
    const s = new LookupStore();
    s.setDie(0, 11);
    s.setDie(1, 3);
    s.setDie(2, 7);
    expect(s.dice).toEqual([3, 7, 11]);
  });

  it("ignores NaN inputs without corrupting state", () => {
    const s = new LookupStore();
    const before = s.dice;
    s.setDie(0, Number.NaN);
    s.setTotal(Number.NaN);
    expect(s.dice).toEqual(before);
  });
});
