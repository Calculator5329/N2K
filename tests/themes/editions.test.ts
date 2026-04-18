import { describe, expect, it } from "vitest";

import { BUNDLED_THEMES, BUNDLED_THEME_IDS } from "../../src/themes/editions/index.js";
import { loadBundledThemes } from "../../src/themes/loader.js";
import { ThemeRegistry } from "../../src/themes/registry.js";
import { validateTheme } from "../../src/themes/schema.js";

describe("bundled editions", () => {
  it("ships at least 5 bundled themes", () => {
    expect(BUNDLED_THEMES.length).toBeGreaterThanOrEqual(5);
  });

  it("includes the canonical tabletop edition", () => {
    expect(BUNDLED_THEME_IDS).toContain("tabletop");
  });

  it("validates every bundled theme", () => {
    const failures: { id: string; errors: string[] }[] = [];
    for (const theme of BUNDLED_THEMES) {
      const result = validateTheme(theme);
      if (!result.ok) {
        failures.push({
          id: theme?.meta?.id ?? "<unknown>",
          errors: result.errors.map((e) => `${e.path}: ${e.message}`),
        });
      }
    }
    expect(failures).toEqual([]);
  });

  it("has unique ids", () => {
    expect(new Set(BUNDLED_THEME_IDS).size).toBe(BUNDLED_THEMES.length);
  });

  it("loads them through the loader without throwing", () => {
    const loaded = loadBundledThemes();
    expect(loaded.length).toBe(BUNDLED_THEMES.length);
  });

  it("can be wrapped in a ThemeRegistry that resolves inheritance", () => {
    const reg = new ThemeRegistry({ themes: [...BUNDLED_THEMES] });
    expect(reg.byId("tabletop")?.meta.id).toBe("tabletop");
    expect(reg.byId("noir")?.tokens.color.bg).not.toBe(reg.byId("tabletop")?.tokens.color.bg);
  });

  it("the canonical tabletop theme populates EVERY token group", () => {
    const tabletop = BUNDLED_THEMES.find((t) => t.meta.id === "tabletop");
    expect(tabletop).toBeDefined();
    if (!tabletop) return;
    expect(tabletop.tokens.color.success).toBeDefined();
    expect(tabletop.tokens.color.warning).toBeDefined();
    expect(tabletop.tokens.color.danger).toBeDefined();
    expect(tabletop.tokens.color.extras).toBeDefined();
    expect(tabletop.tokens.typography.fontFamilySerif).toBeDefined();
    expect(tabletop.tokens.typography.fontFamilyMono).toBeDefined();
    expect(tabletop.tokens.typography.scaleRatio).toBeDefined();
    expect(tabletop.tokens.spacing).toBeDefined();
    expect(tabletop.tokens.radius).toBeDefined();
    expect(tabletop.tokens.shadow?.popover).toBeDefined();
    expect(tabletop.extends).toBeUndefined();
  });

  it("non-tabletop bundled themes extend tabletop (the documented foundation pattern)", () => {
    for (const theme of BUNDLED_THEMES) {
      if (theme.meta.id === "tabletop") continue;
      expect(theme.extends).toBe("tabletop");
    }
  });

  it("every theme declares a non-empty summary so theme-pickers have copy", () => {
    for (const theme of BUNDLED_THEMES) {
      expect(theme.meta.summary, `${theme.meta.id} summary`).toBeTruthy();
    }
  });

  it("every theme tags itself for filterable discovery", () => {
    for (const theme of BUNDLED_THEMES) {
      expect(theme.meta.tags?.length, `${theme.meta.id} tags`).toBeGreaterThan(0);
    }
  });
});
