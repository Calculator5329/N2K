import { useStore } from "../v1stores/storeContext.js";
import type { View } from "../v1stores/types.js";

export interface NavItem {
  readonly id: View;
  readonly folio: string;
  readonly label: string;
  readonly subtitle: string;
}

const BASE_NAV_ITEMS: readonly NavItem[] = [
  { id: "lookup",    folio: "I",    label: "Lookup",    subtitle: "Pick dice, find an equation" },
  { id: "explore",   folio: "II",   label: "Explore",   subtitle: "1,540 triples, indexed" },
  { id: "compare",   folio: "III",  label: "Compare",   subtitle: "Up to four triples, side by side" },
  { id: "visualize", folio: "IV",   label: "Visualize", subtitle: "Difficulty, mapped" },
  { id: "compose",   folio: "V",    label: "Compose",   subtitle: "Boards, rounds, balanced rolls" },
  { id: "play",      folio: "VI",   label: "Play",      subtitle: "Bots, seats, kernel" },
  { id: "gallery",   folio: "VII",  label: "Gallery",   subtitle: "Every edition, side by side" },
  { id: "studio",    folio: "VIII", label: "Studio",    subtitle: "Service seams, exposed" },
  { id: "sandbox",   folio: "IX",   label: "Sandbox",   subtitle: "Game-kernel HUD" },
  { id: "about",     folio: "X",    label: "Colophon",  subtitle: "About this volume" },
];

/**
 * Public nav list. The standalone "Æ" tab was retired once Æther mode
 * became a global behaviour toggle (rather than a separate page).
 *
 * The hook below is preserved for back-compat with the dozen layouts
 * that already call it; it currently always returns `BASE_NAV_ITEMS`,
 * but lives here so future per-mode nav variations have a single
 * extension point.
 */
export const NAV_ITEMS = BASE_NAV_ITEMS;

export function useNavItems(): readonly NavItem[] {
  // `useStore` kept in the call chain so any future mode-conditional
  // entries (e.g. an Æther-only diagnostics page) can be added without
  // touching the layouts again.
  useStore();
  return BASE_NAV_ITEMS;
}

/** Footer colophon byline, varies per edition. Keep keys in sync with `ThemeId`. */
export const FOOTER_COLOPHON: Record<string, string> = {
  almanac:    "Set in Fraunces, Source Serif 4, & JetBrains Mono",
  phosphor:   "Rendered in JetBrains Mono on simulated phosphor",
  broadsheet: "Set in Playfair Display SC & Source Serif 4 — printed daily",
  risograph:  "Set in Bricolage Grotesque & Inter Tight, ink on cream",
  arcade:     "8-bit cabinet rendering — insert coin to continue",
  manuscript: "Illuminated in UnifrakturMaguntia & IM Fell English",
  blueprint:  "Drafted in IBM Plex Mono — scale 1:1, all dims in dice",
  tarot:      "Inscribed in Cinzel Decorative & Crimson Text by candlelight",
  vaporwave:  "Rendered in Major Mono & Pacifico — vaporwave forever",
  receipt:      "Printed on thermal stock in Special Elite — keep dry",
  tabletop:     "Set in Archivo Black & Work Sans — patent pending, ages 8+",
  subway:       "Set in Inter / Helvetica — last stop, all passengers must exit",
  spreadsheet:  "Composed in IBM Plex Mono / Sans — Sheet 1 of 1, save before exit",
  polaroid:     "Hand-lettered in Caveat & Patrick Hand — develop in dark room",
  comic:        "Lettered in Bangers & Roboto Condensed — to be continued in #002!",
  cartographic: "Engraved in IM Fell English & Tangerine — here be dragons",
  herbarium:    "Set in IM Fell English & Cinzel — pressed, mounted, catalogued",
};
