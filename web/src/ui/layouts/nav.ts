/**
 * Base navigation items for every layout.
 *
 * Roman folios + label + subtitle keep typographic chrome (board nav,
 * sidebar list, polaroid stack) personality-rich without each layout
 * having to invent its own copy.
 *
 * Adding a new view: append a NavItem here, then add a case to
 * `App.tsx`'s `renderSurface()` and the `SurfaceId` union in
 * `./types.ts`. Layouts pick up the new item automatically.
 */
import type { NavItem, SurfaceId } from "./types.js";

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "lookup", label: "Lookup", folio: "I", subtitle: "Targets, by dice." },
  { id: "play", label: "Play", folio: "II", subtitle: "N2K Classic, vs bots." },
  { id: "explore", label: "Explore", folio: "III", subtitle: "Every legal tuple." },
  { id: "compare", label: "Compare", folio: "IV", subtitle: "Tuples, side-by-side." },
  { id: "visualize", label: "Visualize", folio: "V", subtitle: "Atlas, scatter, hist." },
  { id: "compose", label: "Compose", folio: "VI", subtitle: "Boards & contests." },
  { id: "studio", label: "Studio", folio: "VII", subtitle: "Live service swap." },
  { id: "sandbox", label: "Sandbox", folio: "VIII", subtitle: "Game kernel sim." },
  { id: "gallery", label: "Gallery", folio: "IX", subtitle: "Every edition." },
  { id: "about", label: "About", folio: "X", subtitle: "What this is." },
];

/**
 * Per-theme footer line. Falls back to a generic colophon when a theme
 * isn't listed.
 */
export const FOOTER_COLOPHON: Readonly<Record<string, string>> = {
  tabletop: "Hand-printed in Patent Felt by N2K Bureau · No. 1300 · Cure 36hrs.",
  almanac: "Set in Fraunces & Source Serif 4 · Almanac Press, MMXXIV.",
  manuscript: "Lapis lazuli & gold leaf · Scriptorium of N2K · Anno MMXXIV.",
  blueprint: "DWG-001 · REV.A · Drafted at 1:1 by N2K Engineering Bureau.",
  noir: "Pulped at midnight by N2K Press, no questions asked.",
  ember: "Pressed in volcanic ink by N2K Foundry · Hand-corrected.",
  frost: "Embossed on cold-press paper · N2K Atelier, Reykjavík.",
  phosphor: "ROM dump · CRT phosphor decay · N2K Computer Lab 1987.",
  vaporwave: "ɢʟɪᴛᴄʜ ʀᴇᴄᴏʀᴅs · ɴ2ᴋ ᴛᴀᴘᴇ ᴄʟᴜʙ · 1996.",
  verdant: "Hand-pressed botanical · N2K Herbarium · Specimen 3·1·12.",
  studio: "Live-service preview · pluggable services · v2 platform.",
  sandbox: "Game kernel sandbox · seat ≤ 4 · v2 platform.",
};

export function colophonFor(themeId: string): string {
  return FOOTER_COLOPHON[themeId] ?? "Composed by N2K Bureau · v2 Platform.";
}

export function navItemById(id: SurfaceId): NavItem {
  const item = NAV_ITEMS.find((n) => n.id === id);
  if (item === undefined) {
    throw new Error(`nav.ts: unknown surface id '${id}'`);
  }
  return item;
}
