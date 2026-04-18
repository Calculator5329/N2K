/**
 * Theme registry + active-theme MobX store.
 *
 * v2 treats themes as DATA, not code. The registry holds `Theme`
 * descriptors (id, displayName, token map). The store applies the
 * active theme by setting `data-theme` on `<html>` and writing each
 * token as a CSS variable so plain Tailwind utility classes can pick
 * them up.
 *
 * For Phase 3 we ship two themes:
 *   - `tabletop` (the default — paper/ink palette, the foundation)
 *   - `noir` (a contrasting dark theme to prove the swap actually works)
 *
 * The eventual flow is: themes load from `ContentBackend` (built-ins
 * are seeded on first launch, user-authored ones live in IDB/Firestore),
 * Gemini-generated themes plug in through the same path, and editions
 * register override tokens. None of that touches consuming components.
 */
import { action, computed, makeObservable, observable } from "mobx";

export type ThemeTokenMap = Readonly<Record<string, string>>;

export interface Theme {
  readonly id: string;
  readonly displayName: string;
  /** Map of CSS variable name (without the `--`) to value. */
  readonly tokens: ThemeTokenMap;
}

const TABLETOP_THEME: Theme = {
  id: "tabletop",
  displayName: "Tabletop",
  tokens: {
    "color-bg": "#f4ece0",
    "color-surface": "#fbf6ec",
    "color-ink": "#2b2118",
    "color-ink-muted": "#766250",
    "color-accent": "#a3461c",
    "color-rule": "#d6c6ad",
    "shadow-card": "0 1px 0 #d6c6ad, 0 12px 24px -12px rgba(43, 33, 24, 0.18)",
    "radius-card": "10px",
  },
};

const NOIR_THEME: Theme = {
  id: "noir",
  displayName: "Noir",
  tokens: {
    "color-bg": "#0e0e10",
    "color-surface": "#161618",
    "color-ink": "#f5f1e6",
    "color-ink-muted": "#8a8378",
    "color-accent": "#e5b06b",
    "color-rule": "#2a2a2d",
    "shadow-card": "0 1px 0 #2a2a2d, 0 12px 24px -12px rgba(0, 0, 0, 0.6)",
    "radius-card": "10px",
  },
};

const BUILTIN_THEMES: readonly Theme[] = [TABLETOP_THEME, NOIR_THEME];

export class ThemeStore {
  private readonly themesById = new Map<string, Theme>();
  activeId: string;

  constructor(initialId: string = "tabletop") {
    for (const t of BUILTIN_THEMES) this.themesById.set(t.id, t);
    this.activeId = this.themesById.has(initialId) ? initialId : "tabletop";

    makeObservable(this, {
      activeId: observable,
      activeTheme: computed,
      availableThemes: computed,
      setActive: action,
      register: action,
    });
  }

  get activeTheme(): Theme {
    const t = this.themesById.get(this.activeId);
    if (t === undefined) {
      // Should be unreachable: setActive guards against unknown ids.
      throw new Error(`ThemeStore: missing active theme '${this.activeId}'`);
    }
    return t;
  }

  get availableThemes(): readonly Theme[] {
    return [...this.themesById.values()];
  }

  setActive(id: string): void {
    if (!this.themesById.has(id)) {
      throw new Error(`ThemeStore: unknown theme id '${id}'`);
    }
    this.activeId = id;
  }

  /** Adds (or replaces) a theme. Returns the registered theme. */
  register(theme: Theme): Theme {
    this.themesById.set(theme.id, theme);
    return theme;
  }

  /**
   * Apply the active theme's tokens to a target element (typically
   * `document.documentElement`). Idempotent. Safe in tests where
   * `document` is a happy-dom shim.
   */
  applyTo(target: { style: { setProperty(name: string, value: string): void }; setAttribute(name: string, value: string): void }): void {
    const theme = this.activeTheme;
    target.setAttribute("data-theme", theme.id);
    for (const [k, v] of Object.entries(theme.tokens)) {
      target.style.setProperty(`--${k}`, v);
    }
  }
}
