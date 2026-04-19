/**
 * Static index of bundled themes.
 *
 * Using a hand-written index (rather than a dynamic glob) keeps Vite, tsx,
 * and the Node test runner happy without per-runtime config tweaks. New
 * bundled editions land here in the same PR that adds the JSON file.
 *
 * Order is informational — the registry is keyed by `meta.id`. The
 * convention is: tabletop first (the canonical foundation theme), then
 * the rest alphabetically.
 */

import type { Theme } from "../types.js";

import tabletop from "./tabletop.theme.json" with { type: "json" };
import ember from "./ember.theme.json" with { type: "json" };
import frost from "./frost.theme.json" with { type: "json" };
import noir from "./noir.theme.json" with { type: "json" };
import verdant from "./verdant.theme.json" with { type: "json" };

export const BUNDLED_THEMES: readonly Theme[] = [
  tabletop as Theme,
  ember as Theme,
  frost as Theme,
  noir as Theme,
  verdant as Theme,
];

export const BUNDLED_THEME_IDS: readonly string[] = BUNDLED_THEMES.map((t) => t.meta.id);
