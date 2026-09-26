import { describe, expect, it } from "vitest";
import { plural } from "../src/core/plural";

describe("plural", () => {
  it("uses the singular only for exactly one", () => {
    expect(plural(1, "cell")).toBe("1 cell");
    expect(plural(0, "cell")).toBe("0 cells");
    expect(plural(36, "cell")).toBe("36 cells");
  });

  it("takes an irregular plural", () => {
    expect(plural(2, "match", "matches")).toBe("2 matches");
  });
});
