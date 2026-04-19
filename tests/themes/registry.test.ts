import { describe, expect, it } from "vitest";

import { ThemeRegistry } from "../../src/themes/registry.js";
import type { Theme } from "../../src/themes/types.js";

function makeTheme(id: string, overrides: Partial<Theme> = {}): Theme {
  const base: Theme = {
    meta: { id, displayName: id, version: "1.0.0" },
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
  return { ...base, ...overrides, meta: { ...base.meta, ...(overrides.meta ?? {}) } };
}

describe("ThemeRegistry", () => {
  it("constructs from an array and exposes byId / all", () => {
    const a = makeTheme("a");
    const b = makeTheme("b");
    const reg = new ThemeRegistry({ themes: [a, b] });

    expect(reg.byId("a")?.meta.id).toBe("a");
    expect(reg.byId("b")?.meta.id).toBe("b");
    expect(reg.byId("missing")).toBeNull();
    expect(reg.all().map((t) => t.meta.id).sort()).toEqual(["a", "b"]);
  });

  it("rejects duplicate ids in the constructor input", () => {
    expect(() => new ThemeRegistry({ themes: [makeTheme("dup"), makeTheme("dup")] })).toThrow(
      /duplicate theme id "dup"/,
    );
  });

  it("rejects invalid themes at construction time", () => {
    const bad = { meta: { id: "bad" }, tokens: {} } as unknown as Theme;
    expect(() => new ThemeRegistry({ themes: [bad] })).toThrow(/invalid theme/);
  });

  it("register() adds a new theme", () => {
    const reg = new ThemeRegistry({ themes: [makeTheme("a")] });
    reg.register(makeTheme("c"));
    expect(reg.byId("c")?.meta.id).toBe("c");
  });

  it("register() rejects duplicates without { replace: true }", () => {
    const reg = new ThemeRegistry({ themes: [makeTheme("a")] });
    expect(() => reg.register(makeTheme("a"))).toThrow(/already registered/);
  });

  it("register() with { replace: true } overwrites", () => {
    const reg = new ThemeRegistry({ themes: [makeTheme("a")] });
    const replacement = makeTheme("a", { meta: { id: "a", displayName: "A2", version: "2.0.0" } });
    reg.register(replacement, { replace: true });
    expect(reg.byId("a")?.meta.displayName).toBe("A2");
  });

  it("with() returns a new registry without mutating the original", () => {
    const original = new ThemeRegistry({ themes: [makeTheme("a")] });
    const next = original.with(makeTheme("b"));

    expect(original.byId("b")).toBeNull();
    expect(next.byId("b")?.meta.id).toBe("b");
    expect(next.byId("a")?.meta.id).toBe("a");
  });

  it("with() replaces an existing entry by id", () => {
    const original = new ThemeRegistry({ themes: [makeTheme("a")] });
    const next = original.with(
      makeTheme("a", { meta: { id: "a", displayName: "A2", version: "2.0.0" } }),
    );
    expect(next.all()).toHaveLength(1);
    expect(next.byId("a")?.meta.displayName).toBe("A2");
  });

  it("rejects register() of an invalid theme", () => {
    const reg = new ThemeRegistry({ themes: [makeTheme("a")] });
    const bad = { meta: { id: "x" }, tokens: {} } as unknown as Theme;
    expect(() => reg.register(bad)).toThrow(/invalid theme/);
  });
});
