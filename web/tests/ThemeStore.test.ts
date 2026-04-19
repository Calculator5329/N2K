import { describe, expect, it } from "vitest";
import { autorun } from "mobx";
import { ThemeStore } from "../src/stores/ThemeStore.js";
import { ThemeRegistry, type Theme } from "@platform/themes/index.js";

const MINIMAL_THEME: Theme = {
  meta: { id: "frost-test", displayName: "Frost Test", version: "1.0.0" },
  tokens: {
    color: {
      bg: "#eef",
      surface: "#fff",
      ink: "#012",
      inkMuted: "#345",
      accent: "#678",
      rule: "#9ab",
    },
    typography: { fontFamilySans: "system-ui" },
  },
};

describe("ThemeStore", () => {
  it("defaults to tabletop and lists bundled editions", () => {
    const s = new ThemeStore();
    expect(s.activeId).toBe("tabletop");
    expect(s.activeTheme.meta.id).toBe("tabletop");
    const ids = s.availableThemes.map((t) => t.id);
    expect(ids).toContain("tabletop");
    expect(ids).toContain("ember");
    expect(ids).toContain("frost");
    expect(ids).toContain("noir");
    expect(ids).toContain("verdant");
    expect(ids.length).toBeGreaterThanOrEqual(5);
    // Bundled list must keep unique ids.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("falls back when initialId is unknown", () => {
    const s = new ThemeStore("does-not-exist");
    expect(s.activeId).toBe("tabletop");
  });

  it("setActive switches and triggers reactivity", () => {
    const s = new ThemeStore();
    const seen: string[] = [];
    const dispose = autorun(() => seen.push(s.activeTheme.meta.id));
    s.setActive("noir");
    dispose();
    expect(seen).toEqual(["tabletop", "noir"]);
  });

  it("setActive throws on unknown id", () => {
    const s = new ThemeStore();
    expect(() => s.setActive("nope")).toThrow();
  });

  it("register adds new themes that become available + activatable", () => {
    const s = new ThemeStore();
    s.register(MINIMAL_THEME);
    expect(s.availableThemes.find((t) => t.id === "frost-test")).toBeDefined();
    s.setActive("frost-test");
    expect(s.activeTheme.tokens.color.bg).toBe("#eef");
  });

  it("applyTo writes data-theme attribute and flat CSS variables", () => {
    const s = new ThemeStore();
    const calls: { name: string; value: string }[] = [];
    let attrName = "";
    let attrValue = "";
    const target = {
      style: {
        setProperty(name: string, value: string) {
          calls.push({ name, value });
        },
      },
      setAttribute(name: string, value: string) {
        attrName = name;
        attrValue = value;
      },
    };
    s.applyTo(target);
    expect(attrName).toBe("data-theme");
    expect(attrValue).toBe("tabletop");
    const bg = calls.find((c) => c.name === "--color-bg");
    expect(bg?.value).toBe("#f5efe1");
    expect(calls.find((c) => c.name === "--shadow-card")).toBeDefined();
    expect(calls.find((c) => c.name === "--font-sans")).toBeDefined();
    expect(calls.find((c) => c.name === "--radius-card")).toBeDefined();
    expect(calls.find((c) => c.name === "--color-extra-felt-green")).toBeDefined();
  });

  it("accepts a custom registry instance", () => {
    const registry = new ThemeRegistry({ themes: [MINIMAL_THEME] });
    const s = new ThemeStore("frost-test", registry);
    expect(s.activeTheme.meta.id).toBe("frost-test");
    expect(s.availableThemes).toHaveLength(1);
  });
});
