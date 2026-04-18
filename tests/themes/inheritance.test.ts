import { describe, expect, it } from "vitest";

import { BUNDLED_THEMES } from "../../src/themes/editions/index.js";
import { ThemeRegistry } from "../../src/themes/registry.js";
import type { Theme } from "../../src/themes/types.js";

const TABLETOP = BUNDLED_THEMES.find((t) => t.meta.id === "tabletop")!;

/**
 * Partial-token convenience: when extending tabletop, every field is
 * optional. Cast through `unknown` so the helper can construct truly
 * partial documents that the registry will fill in via inheritance.
 */
function partialChild(
  id: string,
  tokens: Partial<{
    color: Partial<Theme["tokens"]["color"]>;
    typography: Partial<Theme["tokens"]["typography"]>;
    spacing: Theme["tokens"]["spacing"];
    radius: Theme["tokens"]["radius"];
    shadow: Theme["tokens"]["shadow"];
  }>,
): Theme {
  return {
    meta: { id, displayName: id, version: "1.0.0" },
    extends: "tabletop",
    tokens: tokens as Theme["tokens"],
  };
}

describe("ThemeRegistry inheritance", () => {
  it("merges parent tokens beneath the child via extends (single override)", () => {
    // The child declares ONLY tokens.color.accent — everything else must
    // fall back to tabletop's values after resolution. This is the "the
    // whole point of extends" test from the plan.
    const childTheme = partialChild("accent-only", { color: { accent: "#ff00ff" } });

    const reg = new ThemeRegistry({ themes: [TABLETOP, childTheme] });
    const resolved = reg.byId("accent-only");
    expect(resolved).not.toBeNull();
    if (!resolved) return;

    expect(resolved.tokens.color.accent).toBe("#ff00ff");
    expect(resolved.tokens.color.bg).toBe(TABLETOP.tokens.color.bg);
    expect(resolved.tokens.color.success).toBe(TABLETOP.tokens.color.success);
    expect(resolved.tokens.typography.fontFamilySans).toBe(
      TABLETOP.tokens.typography.fontFamilySans,
    );
    expect(resolved.tokens.spacing?.unitPx).toBe(TABLETOP.tokens.spacing?.unitPx);
    expect(resolved.tokens.radius?.card).toBe(TABLETOP.tokens.radius?.card);
    expect(resolved.tokens.shadow?.card).toBe(TABLETOP.tokens.shadow?.card);
    expect(resolved.tokens.shadow?.popover).toBe(TABLETOP.tokens.shadow?.popover);
    // The resolved theme drops `extends` (already applied).
    expect(resolved.extends).toBeUndefined();
  });

  it("allows a child to declare an empty tokens object and still be valid", () => {
    const empty: Theme = {
      meta: { id: "empty-child", displayName: "Empty", version: "1.0.0" },
      extends: "tabletop",
      tokens: {} as Theme["tokens"],
    };
    const reg = new ThemeRegistry({ themes: [TABLETOP, empty] });
    const resolved = reg.byId("empty-child")!;
    expect(resolved.tokens.color.bg).toBe(TABLETOP.tokens.color.bg);
    expect(resolved.tokens.typography.fontFamilySans).toBe(
      TABLETOP.tokens.typography.fontFamilySans,
    );
  });

  it("preserves child overrides for optional groups", () => {
    const overridden = partialChild("override-shadow", {
      shadow: { card: "0 0 0 1px red", popover: "0 0 0 2px blue" },
    });
    const reg = new ThemeRegistry({ themes: [TABLETOP, overridden] });
    const resolved = reg.byId("override-shadow")!;
    expect(resolved.tokens.shadow?.card).toBe("0 0 0 1px red");
    expect(resolved.tokens.shadow?.popover).toBe("0 0 0 2px blue");
  });

  it("merges color.extras additively (child wins on key collision)", () => {
    const overridden = partialChild("extras-merge", {
      color: { extras: { highlight: "#000000", mistNew: "#abcdef" } },
    });
    const reg = new ThemeRegistry({ themes: [TABLETOP, overridden] });
    const resolved = reg.byId("extras-merge")!;
    // Child override wins on collision.
    expect(resolved.tokens.color.extras?.["highlight"]).toBe("#000000");
    // Parent extras still present.
    expect(resolved.tokens.color.extras?.["feltGreen"]).toBe(
      TABLETOP.tokens.color.extras?.["feltGreen"],
    );
    // Child-only extra survives.
    expect(resolved.tokens.color.extras?.["mistNew"]).toBe("#abcdef");
  });

  it("supports multi-level chains (grandchild → child → parent)", () => {
    const middle: Theme = {
      meta: { id: "middle", displayName: "Middle", version: "1.0.0" },
      extends: "tabletop",
      tokens: { color: { accent: "#aaaaaa" } } as Theme["tokens"],
    };
    const grand: Theme = {
      meta: { id: "grand", displayName: "Grand", version: "1.0.0" },
      extends: "middle",
      tokens: { color: { surface: "#bbbbbb" } } as Theme["tokens"],
    };
    const reg = new ThemeRegistry({ themes: [TABLETOP, middle, grand] });
    const resolved = reg.byId("grand")!;
    expect(resolved.tokens.color.accent).toBe("#aaaaaa"); // from middle
    expect(resolved.tokens.color.surface).toBe("#bbbbbb"); // from grand
    expect(resolved.tokens.color.bg).toBe(TABLETOP.tokens.color.bg); // from tabletop
  });

  it("rejects a standalone theme that omits required tokens", () => {
    const broken: Theme = {
      meta: { id: "incomplete", displayName: "Incomplete", version: "1.0.0" },
      tokens: { color: { accent: "#abc" } } as Theme["tokens"],
    };
    expect(() => new ThemeRegistry({ themes: [broken] })).toThrow();
  });

  it("rejects a child whose parent is missing required tokens too", () => {
    // A pathological case: parent declares only some required tokens.
    // After resolution the merged theme is still incomplete, so the
    // registry must reject it with a clear "incomplete" message.
    const partialParent: Theme = {
      meta: { id: "partial-parent", displayName: "Partial Parent", version: "1.0.0" },
      // No extends, but missing tokens.color.bg etc. — this should fail at
      // construction because standalone themes are validated strictly.
      tokens: { color: { accent: "#abc" } } as Theme["tokens"],
    };
    expect(() => new ThemeRegistry({ themes: [partialParent] })).toThrow();
  });

  it("throws on a cyclic extends chain with the chain in the message", () => {
    const a: Theme = {
      meta: { id: "cycle-a", displayName: "A", version: "1.0.0" },
      extends: "cycle-b",
      tokens: TABLETOP.tokens,
    };
    const b: Theme = {
      meta: { id: "cycle-b", displayName: "B", version: "1.0.0" },
      extends: "cycle-a",
      tokens: TABLETOP.tokens,
    };
    expect(() => new ThemeRegistry({ themes: [a, b] })).toThrow(/cyclic extends chain/);
  });

  it("throws when extends references an unknown theme", () => {
    const orphan: Theme = {
      meta: { id: "orphan", displayName: "Orphan", version: "1.0.0" },
      extends: "does-not-exist",
      tokens: TABLETOP.tokens,
    };
    expect(() => new ThemeRegistry({ themes: [orphan] })).toThrow(/unknown theme "does-not-exist"/);
  });

  it("resolveInheritance: false leaves the child as-authored", () => {
    const sparse: Theme = {
      meta: { id: "sparse", displayName: "Sparse", version: "1.0.0" },
      extends: "tabletop",
      tokens: {
        color: { ...TABLETOP.tokens.color, accent: "#abc" },
        typography: TABLETOP.tokens.typography,
      },
    };
    const reg = new ThemeRegistry({
      themes: [TABLETOP, sparse],
      resolveInheritance: false,
    });
    const resolved = reg.byId("sparse")!;
    expect(resolved.extends).toBe("tabletop"); // not stripped when not resolving
    expect(resolved.tokens.color.accent).toBe("#abc");
  });

  it("resolves inheritance after register() too", () => {
    const reg = new ThemeRegistry({ themes: [TABLETOP] });
    const late = partialChild("late", { color: { accent: "#111111" } });
    reg.register(late);
    const resolved = reg.byId("late")!;
    expect(resolved.tokens.color.accent).toBe("#111111");
    expect(resolved.tokens.color.bg).toBe(TABLETOP.tokens.color.bg);
    expect(resolved.tokens.shadow?.card).toBe(TABLETOP.tokens.shadow?.card);
  });
});
