/**
 * Theme registry + active-theme MobX store.
 *
 * v2 treats themes as DATA. The structured `Theme` documents live in
 * `src/themes/` (canonical schema, JSON editions, validation, inheritance).
 * This store wraps a `ThemeRegistry`, exposes it to React, and translates
 * the active theme's structured tokens into flat CSS custom properties on a
 * target element so plain Tailwind utility classes can pick them up via
 * `var(--color-bg)`, `var(--shadow-card)`, etc.
 *
 * The legacy flat token map that lived here in Phase 3 is gone — the
 * registry is the single source of truth for both bundled and user-authored
 * themes.
 */
import { action, computed, makeObservable, observable } from "mobx";
import {
  ThemeRegistry,
  loadBundledThemes,
  type Theme,
} from "@platform/themes/index.js";

/** Lightweight summary surfaced to UI pickers. */
export interface ThemeSummary {
  readonly id: string;
  readonly displayName: string;
  readonly summary?: string;
  readonly tags?: readonly string[];
}

const FALLBACK_THEME_ID = "tabletop";

export class ThemeStore {
  private registry: ThemeRegistry;
  activeId: string;

  constructor(initialId: string = FALLBACK_THEME_ID, registry?: ThemeRegistry) {
    this.registry = registry ?? new ThemeRegistry({ themes: loadBundledThemes() });
    this.activeId = this.registry.byId(initialId)
      ? initialId
      : (this.registry.all()[0]?.meta.id ?? FALLBACK_THEME_ID);

    makeObservable<this, "registry">(this, {
      registry: observable.ref,
      activeId: observable,
      activeTheme: computed,
      availableThemes: computed,
      setActive: action,
      register: action,
    });
  }

  get activeTheme(): Theme {
    const t = this.registry.byId(this.activeId);
    if (t === null) {
      throw new Error(`ThemeStore: missing active theme '${this.activeId}'`);
    }
    return t;
  }

  get availableThemes(): readonly ThemeSummary[] {
    return this.registry.all().map((t) => {
      const summary: ThemeSummary = {
        id: t.meta.id,
        displayName: t.meta.displayName,
        ...(t.meta.summary !== undefined ? { summary: t.meta.summary } : {}),
        ...(t.meta.tags !== undefined ? { tags: t.meta.tags } : {}),
      };
      return summary;
    });
  }

  setActive(id: string): void {
    if (this.registry.byId(id) === null) {
      throw new Error(`ThemeStore: unknown theme id '${id}'`);
    }
    this.activeId = id;
  }

  /**
   * Adds (or replaces) a theme. Useful for user-authored / AI-generated
   * themes that arrive after construction.
   */
  register(theme: Theme, opts?: { readonly replace?: boolean }): void {
    this.registry = this.registry.with(theme);
    void opts;
  }

  /**
   * Apply the active theme's tokens to a target element (typically
   * `document.documentElement`). Idempotent. Safe in tests where
   * `document` is a happy-dom shim.
   */
  applyTo(target: {
    style: { setProperty(name: string, value: string): void };
    setAttribute(name: string, value: string): void;
  }): void {
    const theme = this.activeTheme;
    target.setAttribute("data-theme", theme.meta.id);
    for (const [name, value] of toCssVariables(theme)) {
      target.style.setProperty(name, value);
    }
  }
}

/**
 * Flatten a structured `Theme` into `[--name, value]` CSS-variable pairs.
 *
 * Naming convention (locked): `--color-<name>`, `--font-<name>`,
 * `--font-scale-ratio`, `--spacing-unit`, `--radius-<name>`,
 * `--shadow-<name>`, `--color-extra-<name>`. Components may rely on these
 * names existing for any bundled theme; optional tokens are simply absent
 * when the theme omits them.
 */
function toCssVariables(theme: Theme): ReadonlyArray<readonly [string, string]> {
  const out: Array<readonly [string, string]> = [];
  const c = theme.tokens.color;

  out.push(
    ["--color-bg", c.bg],
    ["--color-surface", c.surface],
    ["--color-ink", c.ink],
    ["--color-ink-muted", c.inkMuted],
    ["--color-accent", c.accent],
    ["--color-rule", c.rule],
  );
  if (c.success !== undefined) out.push(["--color-success", c.success]);
  if (c.warning !== undefined) out.push(["--color-warning", c.warning]);
  if (c.danger !== undefined) out.push(["--color-danger", c.danger]);
  if (c.extras !== undefined) {
    for (const [k, v] of Object.entries(c.extras)) {
      out.push([`--color-extra-${kebab(k)}`, v]);
    }
  }

  const t = theme.tokens.typography;
  out.push(["--font-sans", t.fontFamilySans]);
  if (t.fontFamilySerif !== undefined) out.push(["--font-serif", t.fontFamilySerif]);
  if (t.fontFamilyMono !== undefined) out.push(["--font-mono", t.fontFamilyMono]);
  if (t.scaleRatio !== undefined) out.push(["--font-scale-ratio", String(t.scaleRatio)]);

  if (theme.tokens.spacing !== undefined) {
    out.push(["--spacing-unit", `${theme.tokens.spacing.unitPx}px`]);
  }
  if (theme.tokens.radius !== undefined) {
    out.push(
      ["--radius-card", theme.tokens.radius.card],
      ["--radius-chip", theme.tokens.radius.chip],
    );
  }
  if (theme.tokens.shadow !== undefined) {
    out.push(["--shadow-card", theme.tokens.shadow.card]);
    if (theme.tokens.shadow.popover !== undefined) {
      out.push(["--shadow-popover", theme.tokens.shadow.popover]);
    }
  }

  return out;
}

function kebab(camel: string): string {
  return camel.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
