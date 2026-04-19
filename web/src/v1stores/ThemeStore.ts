import { makeAutoObservable } from "mobx";
import { DEFAULT_THEME, THEMES, type ThemeId } from "../core/themes";

const STORAGE_KEY = "n2k.theme";

function readPersisted(): ThemeId {
  if (typeof localStorage === "undefined") return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null && raw in THEMES) return raw as ThemeId;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

function persist(theme: ThemeId): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

function applyToDom(theme: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Owns the active theme. Persists user choice to localStorage and mirrors
 * it onto the `<html data-theme="...">` attribute, where the CSS variable
 * blocks in `globals.css` pick it up.
 *
 * The initial value is read in `index.html` (so there's no flash on
 * reload); this store only takes over for runtime changes.
 */
export class ThemeStore {
  theme: ThemeId = readPersisted();

  constructor() {
    makeAutoObservable(this);
    applyToDom(this.theme);
  }

  setTheme(theme: ThemeId): void {
    if (this.theme === theme) return;
    this.theme = theme;
    persist(theme);
    applyToDom(theme);
  }
}
