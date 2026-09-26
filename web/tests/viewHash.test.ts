/**
 * Top-level view <-> URL hash. The hash is how reload, Back/Forward and
 * pasted links find a view, so the parser must keep old Lookup, plan and
 * race links working and must never throw on junk.
 */
import { describe, expect, it } from "vitest";
import { hashForView, sharePayloadDecodes, viewFromHash } from "../src/stores/viewHash";
import { encodeShareable } from "../src/services/compressedHashCodec";

describe("viewFromHash / hashForView", () => {
  it("round-trips every view and leaves Lookup links byte-identical", () => {
    const lookupLink = "lookup=1%3A2%2C3%2C5%2F10";
    expect(viewFromHash(`#${lookupLink}`)).toBe("lookup");
    expect(hashForView(lookupLink, "lookup")).toBe(lookupLink);
    const slugs = { compose: "competition", library: "library", play: "play" } as const;
    for (const view of ["compose", "library", "play"] as const) {
      const next = hashForView(lookupLink, view);
      expect(next).toBe(`view=${slugs[view]}&${lookupLink}`);
      expect(viewFromHash(`#${next}`)).toBe(view);
      expect(hashForView(next, "lookup")).toBe(lookupLink);
    }
    // Hand-typed, unencoded links survive untouched too.
    expect(hashForView("lookup=1:2,3,5/10", "library")).toBe("view=library&lookup=1:2,3,5/10");
  });

  it("drops a plan/race payload when leaving the view that owns it", () => {
    const lookup = hashForView("view=competition&plan=X", "lookup");
    expect(lookup).toBe("");
    expect(viewFromHash(`#${lookup}`)).toBe("lookup");
    const library = hashForView("view=competition&plan=X&lookup=1:2,3,5/10", "library");
    expect(library).toBe("view=library&lookup=1:2,3,5/10");
    expect(viewFromHash(`#${library}`)).toBe("library");
    expect(hashForView("view=play&race=Y", "lookup")).toBe("");
    // The owner keeps its payload.
    expect(hashForView("plan=X", "compose")).toBe("view=competition&plan=X");
    expect(hashForView("race=Y", "play")).toBe("view=play&race=Y");
  });

  it("lets an explicit view beat the plan/race inference used by old share links", () => {
    expect(viewFromHash("#plan=v1.abc")).toBe("compose");
    expect(viewFromHash("#race=v1.abc&plan=v1.abc")).toBe("play");
    expect(viewFromHash("#view=library&plan=v1.abc")).toBe("library");
    // `compose` (the internal id) still reads as Competition.
    expect(viewFromHash("#view=compose")).toBe("compose");
  });

  it("falls back to Lookup on unknown or malformed hashes without throwing", () => {
    expect(viewFromHash("#view=bogus")).toBe("lookup");
    expect(viewFromHash("#%E0%A4%A")).toBe("lookup");
    expect(viewFromHash("#view=%E0%A4%A&x")).toBe("lookup");
  });
});

describe("sharePayloadDecodes", () => {
  it("is true only for a race or plan payload that actually decodes", async () => {
    const valid = await encodeShareable({ v: 1 });
    expect(await sharePayloadDecodes("#lookup=1:2,3,5/10")).toBe(false);
    expect(await sharePayloadDecodes("#view=play&race=")).toBe(false);
    expect(await sharePayloadDecodes("#view=play&race=garbage")).toBe(false);
    expect(await sharePayloadDecodes("#view=play&race=v1.@@@")).toBe(false);
    expect(await sharePayloadDecodes(`#view=play&race=${valid}`)).toBe(true);
    expect(await sharePayloadDecodes(`#view=competition&plan=${valid}`)).toBe(true);
  });
});
