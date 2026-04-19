import { describe, expect, it } from "vitest";

import { validateTheme } from "../../src/themes/schema.js";
import type { Theme } from "../../src/themes/types.js";

const MINIMAL: Theme = {
  meta: { id: "minimal", displayName: "Minimal", version: "0.0.1" },
  tokens: {
    color: {
      bg: "#fff",
      surface: "#fafafa",
      ink: "#111",
      inkMuted: "#666",
      accent: "#0a84ff",
      rule: "#e5e5e5",
    },
    typography: { fontFamilySans: "system-ui, sans-serif" },
  },
};

describe("validateTheme", () => {
  it("accepts a well-formed minimal theme", () => {
    const result = validateTheme(MINIMAL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.meta.id).toBe("minimal");
    }
  });

  it("accepts a theme with every optional group populated", () => {
    const full: Theme = {
      meta: {
        id: "full-example",
        displayName: "Full Example",
        version: "1.0.0",
        authorId: "user_1",
        summary: "every token",
        tags: ["dark", "demo"],
      },
      tokens: {
        color: {
          ...MINIMAL.tokens.color,
          success: "#3f7a3a",
          warning: "#c08a1f",
          danger: "#a8331f",
          extras: { brand: "#ff00aa", muted: "#22222a" },
        },
        typography: {
          fontFamilySans: "Inter, sans-serif",
          fontFamilySerif: "Georgia, serif",
          fontFamilyMono: "Menlo, monospace",
          scaleRatio: 1.25,
        },
        spacing: { unitPx: 8 },
        radius: { card: "10px", chip: "999px" },
        shadow: { card: "0 1px 2px rgba(0,0,0,.1)", popover: "0 8px 24px rgba(0,0,0,.2)" },
      },
    };
    const result = validateTheme(full);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-object root", () => {
    const result = validateTheme("not a theme");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.message).toMatch(/object/);
    }
  });

  it("reports missing required fields with dot-paths", () => {
    const broken = { meta: { displayName: "x", version: "0" }, tokens: { color: {}, typography: {} } };
    const result = validateTheme(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.map((e) => e.path);
      expect(paths).toContain("meta.id");
      expect(paths).toContain("tokens.color.bg");
      expect(paths).toContain("tokens.color.surface");
      expect(paths).toContain("tokens.color.ink");
      expect(paths).toContain("tokens.color.inkMuted");
      expect(paths).toContain("tokens.color.accent");
      expect(paths).toContain("tokens.color.rule");
      expect(paths).toContain("tokens.typography.fontFamilySans");
    }
  });

  it("rejects an id that is not kebab-case", () => {
    const broken = { ...MINIMAL, meta: { ...MINIMAL.meta, id: "Not Kebab" } };
    const result = validateTheme(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === "meta.id")).toBe(true);
    }
  });

  it("rejects empty strings on required color fields", () => {
    const broken: unknown = {
      ...MINIMAL,
      tokens: { ...MINIMAL.tokens, color: { ...MINIMAL.tokens.color, bg: "" } },
    };
    const result = validateTheme(broken);
    expect(result.ok).toBe(false);
  });

  it("rejects extras with non-string values and reports the bracketed path", () => {
    const broken = {
      ...MINIMAL,
      tokens: {
        ...MINIMAL.tokens,
        color: { ...MINIMAL.tokens.color, extras: { ok: "#fff", bad: 42 } },
      },
    };
    const result = validateTheme(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === 'tokens.color.extras["bad"]')).toBe(true);
    }
  });

  it("rejects a non-positive scaleRatio", () => {
    const broken = {
      ...MINIMAL,
      tokens: { ...MINIMAL.tokens, typography: { fontFamilySans: "sans", scaleRatio: 0 } },
    };
    const result = validateTheme(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === "tokens.typography.scaleRatio")).toBe(true);
    }
  });

  it("rejects spacing.unitPx that is not a positive number", () => {
    const broken = {
      ...MINIMAL,
      tokens: { ...MINIMAL.tokens, spacing: { unitPx: -1 } },
    };
    const result = validateTheme(broken);
    expect(result.ok).toBe(false);
  });

  it("rejects radius missing required fields", () => {
    const broken = {
      ...MINIMAL,
      tokens: { ...MINIMAL.tokens, radius: { card: "8px" } },
    };
    const result = validateTheme(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === "tokens.radius.chip")).toBe(true);
    }
  });

  it("rejects tags whose entries are not strings", () => {
    const broken = {
      ...MINIMAL,
      meta: { ...MINIMAL.meta, tags: ["ok", 5] },
    };
    const result = validateTheme(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === "meta.tags[1]")).toBe(true);
    }
  });

  it("accepts an `extends` reference (the registry resolves the chain)", () => {
    const child = { ...MINIMAL, extends: "tabletop" };
    const result = validateTheme(child);
    expect(result.ok).toBe(true);
  });

  it("rejects an empty `extends` string", () => {
    const broken = { ...MINIMAL, extends: "" };
    const result = validateTheme(broken);
    expect(result.ok).toBe(false);
  });

  it("returns multiple errors at once (no early-exit)", () => {
    const broken = {
      meta: { id: "X", displayName: "", version: "" },
      tokens: { color: {}, typography: {} },
    };
    const result = validateTheme(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(3);
    }
  });
});
