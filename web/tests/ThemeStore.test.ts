import { describe, expect, it } from "vitest";
import { autorun } from "mobx";
import { ThemeStore } from "../src/stores/ThemeStore.js";

describe("ThemeStore", () => {
  it("defaults to tabletop and lists built-ins", () => {
    const s = new ThemeStore();
    expect(s.activeId).toBe("tabletop");
    expect(s.activeTheme.id).toBe("tabletop");
    const ids = s.availableThemes.map((t) => t.id).sort();
    expect(ids).toEqual(["noir", "tabletop"]);
  });

  it("setActive switches and triggers reactivity", () => {
    const s = new ThemeStore();
    const seen: string[] = [];
    const dispose = autorun(() => seen.push(s.activeTheme.id));
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
    s.register({
      id: "frost",
      displayName: "Frost",
      tokens: { "color-bg": "#eef" },
    });
    expect(s.availableThemes.find((t) => t.id === "frost")).toBeDefined();
    s.setActive("frost");
    expect(s.activeTheme.tokens["color-bg"]).toBe("#eef");
  });

  it("applyTo writes data-theme attribute and CSS vars", () => {
    const s = new ThemeStore();
    const calls: { name: string; value: string }[] = [];
    const target = {
      style: {
        setProperty(name: string, value: string) {
          calls.push({ name, value });
        },
      },
      setAttribute(_name: string, _value: string) {
        /* tracked via attr below */
      },
      attr: "" as string,
    };
    let attrName = "";
    let attrValue = "";
    target.setAttribute = (name: string, value: string) => {
      attrName = name;
      attrValue = value;
    };
    s.applyTo(target);
    expect(attrName).toBe("data-theme");
    expect(attrValue).toBe("tabletop");
    expect(calls.find((c) => c.name === "--color-bg")?.value).toBe("#f4ece0");
    expect(calls.find((c) => c.name === "--shadow-card")).toBeDefined();
  });
});
