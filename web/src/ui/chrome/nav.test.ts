/**
 * nav.ts — folio numerals are single-sourced.
 *
 * `nav.ts` owns the I/II/III/IV numbering; `LibraryView` and `PlayView`
 * resolve their page-header folio through `folioFor` rather than
 * hardcoding a numeral (which previously drifted: Library rendered "IV"
 * and Play "III", swapped vs the nav order). These guard the mapping.
 *
 * Co-located with `nav.ts` to stay within the owned-path scope.
 */
import { describe, expect, it } from "vitest";
import { NAV_ITEMS, folioFor } from "./nav";

describe("nav folios", () => {
  it("numbers the four surfaces I..IV in order", () => {
    expect(NAV_ITEMS.map((n) => n.folio)).toEqual(["I", "II", "III", "IV"]);
    expect(NAV_ITEMS.map((n) => n.id)).toEqual([
      "lookup",
      "compose",
      "library",
      "play",
    ]);
  });

  it("resolves each view's folio from the nav table", () => {
    expect(folioFor("lookup")).toBe("I");
    expect(folioFor("compose")).toBe("II");
    expect(folioFor("library")).toBe("III");
    expect(folioFor("play")).toBe("IV");
  });

  it("agrees with NAV_ITEMS for every entry", () => {
    for (const item of NAV_ITEMS) {
      expect(folioFor(item.id)).toBe(item.folio);
    }
  });
});
