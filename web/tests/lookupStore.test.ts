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

  it("steps past triples the almanac has no entry for", () => {
    // Three of a kind is never a legal roll, so 5,5,5 has no chunk.
    const supported = (dice: readonly number[]) => new Set(dice).size > 1;
    const s = new LookupStore(supported);
    s.setDie(2, 4);
    s.setDie(0, 5);
    s.setDie(1, 5);
    expect(s.dice).toEqual([4, 5, 5]);
    s.setDie(2, 5); // stepping up from 4 lands on 5,5,5: keep walking to 6
    expect(s.dice).toEqual([5, 5, 6]);
    s.setDie(2, 5); // stepping down from 6 walks past 5 to 4
    expect(s.dice).toEqual([4, 5, 5]);
  });

  it("leaves the die alone when no supported value exists in that direction", () => {
    const s = new LookupStore(() => false);
    const before = s.dice;
    s.setDie(0, 9);
    expect(s.dice).toEqual(before);
  });

  it("stays permissive while the dataset is still loading", () => {
    const s = new LookupStore(() => null);
    s.setDie(0, 5);
    s.setDie(1, 5);
    s.setDie(2, 5);
    expect(s.dice).toEqual([5, 5, 5]);
  });

  it("ignores NaN inputs without corrupting state", () => {
    const s = new LookupStore();
    const before = s.dice;
    s.setDie(0, Number.NaN);
    s.setTotal(Number.NaN);
    expect(s.dice).toEqual(before);
  });
});
