/**
 * AetherLookupStore — mode-aware clamping + legality.
 *
 * The Æther Lookup picker validates typed dice entry against the *Æther*
 * ranges, not the standard ones: dice run −10..32 (negatives are literal)
 * and targets 1..5000. It also honours the one Æther-specific legality
 * rule — 0 is not a legal die (`d^p` collapses, `÷0` blows up), so the
 * steppers hop over it and typed 0s are rejected. This locks in the
 * "mode-aware DicePicker validation" behaviour so it can't regress to
 * clamping against the standard range.
 *
 * Co-located with the store (owned-path scope) rather than under
 * `web/tests`; mirrors `lookupStore.test.ts` in shape.
 */
import { describe, expect, it } from "vitest";
import { AETHER_MODE } from "@solver/core/constants.js";
import { AetherLookupStore } from "./AetherLookupStore";

const { min: DIE_MIN, max: DIE_MAX } = AETHER_MODE.diceRange;
const { min: TGT_MIN, max: TGT_MAX } = AETHER_MODE.targetRange;

describe("AetherLookupStore", () => {
  it("accepts the full Æther dice range, including literal negatives", () => {
    const s = new AetherLookupStore();
    s.setDie(0, DIE_MAX);
    expect(s.dice[0]).toBe(DIE_MAX);
    s.setDie(1, DIE_MIN);
    expect(s.dice[1]).toBe(DIE_MIN);
    s.setDie(2, -7);
    expect(s.dice[2]).toBe(-7);
  });

  it("clamps typed dice entry to the Æther range, not the standard one", () => {
    const s = new AetherLookupStore();
    // 25 is illegal in standard mode (max 20) but valid in Æther.
    s.setDie(0, 25);
    expect(s.dice[0]).toBe(25);
    // Beyond the Æther range clamps to the Æther bound.
    s.setDie(1, 999);
    expect(s.dice[1]).toBe(DIE_MAX);
    s.setDie(2, -999);
    expect(s.dice[2]).toBe(DIE_MIN);
  });

  it("hops a stepper past the illegal 0 in the direction of travel", () => {
    const s = new AetherLookupStore();
    // Decrementing 1 → 0 should skip to −1.
    s.setDie(0, 1);
    s.setDie(0, 0);
    expect(s.dice[0]).toBe(-1);
    // Incrementing −1 → 0 should skip back to 1.
    s.setDie(0, 0);
    expect(s.dice[0]).toBe(1);
  });

  it("rejects a typed jump straight onto the illegal 0", () => {
    const s = new AetherLookupStore();
    s.setDie(0, 5);
    s.setDie(0, 0);
    expect(s.dice[0]).toBe(5);
    expect(AETHER_MODE.legalDieValue?.(s.dice[0]!)).toBe(true);
  });

  it("clamps the target to the Æther target range", () => {
    const s = new AetherLookupStore();
    s.setTotal(0);
    expect(s.total).toBe(TGT_MIN);
    s.setTotal(99_999);
    expect(s.total).toBe(TGT_MAX);
  });

  it("ignores NaN inputs without corrupting state", () => {
    const s = new AetherLookupStore();
    const dieBefore = s.dice[0];
    const totalBefore = s.total;
    s.setDie(0, Number.NaN);
    s.setTotal(Number.NaN);
    expect(s.dice[0]).toBe(dieBefore);
    expect(s.total).toBe(totalBefore);
  });
});
