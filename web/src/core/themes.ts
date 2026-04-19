/**
 * Theme registry — single source of truth for every edition of the almanac.
 *
 * A `Theme` carries everything React + CSS need to render that edition:
 *
 *   - Identity:    id, label, tagline, swatches (for the selector)
 *   - Layout:      which top-level page layout to render
 *   - Variants:    which alternate component renderers to use
 *                  (dice glyph style, equation rendering style)
 *   - Ornaments:   small typographic flourishes (section marker, folio
 *                  style, rule weight, masthead suffix, corner glyph)
 *   - Scale:       the difficulty heatmap palette + impossible-cell color
 *
 * All visual styling that ISN'T component-shape (colors, fonts, textures,
 * borders, shadows, focus rings, etc.) lives in `src/styles/globals.css`
 * keyed on `[data-theme="<id>"]`.  See `docs/themes.md` for the recipe to
 * add a new edition.
 */
import type { ScaleStop, RGB } from "../v1features/visualize/difficultyScale.js";

export type ThemeId =
  | "almanac"
  | "phosphor"
  | "broadsheet"
  | "risograph"
  | "arcade"
  | "manuscript"
  | "blueprint"
  | "tarot"
  | "vaporwave"
  | "receipt"
  | "tabletop"
  | "subway"
  | "spreadsheet"
  | "polaroid"
  | "comic"
  | "cartographic"
  | "herbarium";

export const THEME_IDS: readonly ThemeId[] = [
  "almanac",
  "phosphor",
  "broadsheet",
  "risograph",
  "arcade",
  "manuscript",
  "blueprint",
  "tarot",
  "vaporwave",
  "receipt",
  "tabletop",
  "subway",
  "spreadsheet",
  "polaroid",
  "comic",
  "cartographic",
  "herbarium",
];

/** Top-level page composition. */
export type LayoutId =
  | "sidebar"      // book-like: left masthead + page-as-card    (Almanac, Phosphor, Risograph, Vaporwave)
  | "topbar"       // newspaper / HUD: horizontal masthead       (Broadsheet, Arcade)
  | "manuscript"   // illuminated codex: folio rail + page       (Manuscript)
  | "blueprint"    // engineering sheet: grid + title block      (Blueprint)
  | "frame"        // ornamental border around centered column   (Tarot)
  | "receipt"      // narrow thermal-printer slip                (Receipt)
  | "board"        // navy game-board frame with corner brackets (Tabletop)
  | "platform"     // subway platform: black info strip + tactile (Subway)
  | "spreadsheet"  // VisiCalc/Lotus: formula bar + cell grid    (Spreadsheet)
  | "scrapbook"    // kraft paper with rotated polaroids         (Polaroid)
  | "panels"       // silver-age comic: panel grid + halftone    (Comic)
  | "chart";       // maritime chart: scroll banner + compass    (Cartographic)

/** How dice triples render in the UI. */
export type DiceGlyphStyle =
  | "tile"         // square typecase tile with a number         (Almanac, Risograph, Vaporwave)
  | "ascii"        // bracketed mono ASCII "[ 2  3  5 ]"        (Phosphor, Receipt)
  | "newsroom"     // tight serif numerals in hairline box       (Broadsheet)
  | "pip-tile"     // chunky 8-bit beveled tile                  (Arcade)
  | "illuminated"  // gilded versal capital with floral border   (Manuscript)
  | "blueprint"    // orthographic line-cube projection          (Blueprint)
  | "tarot"        // mini-card with roman numeral               (Tarot)
  | "boardgame"    // chunky black numerals on white tile        (Tabletop)
  | "bullet"       // colored route bullet with white numeral    (Subway)
  | "cell"         // adjacent spreadsheet cells, right-aligned  (Spreadsheet)
  | "polaroid"     // rotated mini polaroid card                 (Polaroid)
  | "panel"        // numbered comic panel with halftone         (Comic)
  | "buoy";        // navigational marker / ocean buoy           (Cartographic)

/** How equations render in the UI. */
export type EquationStyle =
  | "rendered"     // pretty: real superscripts, ×, ÷, − glyphs
  | "ascii";       // raw: `2^3 * 5^1 * 3^0 = 40`

export interface ThemeOrnaments {
  /** Marker that appears before section labels (e.g. "§", "¶", "✦", "❦"). */
  readonly sectionMarker: string;
  /** Tag that follows the wordmark in topbar/manuscript/frame layouts. */
  readonly mastheadSuffix: string;
  /** Visual style of the rule between sections. CSS picks this up via the data-theme attribute. */
  readonly ruleStyle:
    | "hairline"
    | "double"
    | "bold"
    | "dotted"
    | "pixelated"
    | "ornament"
    | "perforation"
    | "dimension";
  /** Optional ornament glyph used in corners by `frame` and `manuscript` layouts. */
  readonly corner?: string;
}

export interface Theme {
  readonly id: ThemeId;
  readonly label: string;
  readonly tagline: string;
  /** [surface, ink, accent] — used by the selector swatch flag. */
  readonly swatches: readonly [string, string, string];
  readonly layout: LayoutId;
  readonly glyph: DiceGlyphStyle;
  readonly equation: EquationStyle;
  readonly ornaments: ThemeOrnaments;
  readonly scale: {
    readonly stops: readonly ScaleStop[];
    readonly impossible: RGB;
  };
}

// ---------------------------------------------------------------------------
//  ALMANAC — quiet parchment editorial reference book
// ---------------------------------------------------------------------------
const ALMANAC: Theme = {
  id: "almanac",
  label: "Almanac",
  tagline: "Parchment, ink, oxblood",
  swatches: ["#FBF7EE", "#1A1612", "#6F1F1F"],
  layout: "sidebar",
  glyph: "tile",
  equation: "rendered",
  ornaments: { sectionMarker: "§", mastheadSuffix: "Volume I", ruleStyle: "hairline" },
  scale: {
    stops: [
      { at: 0,   color: { r: 245, g: 239, b: 223 } },
      { at: 5,   color: { r: 226, g: 213, b: 175 } },
      { at: 12,  color: { r: 198, g: 178, b: 130 } },
      { at: 25,  color: { r: 156, g: 145, b: 105 } },
      { at: 50,  color: { r: 130, g: 76,  b: 60  } },
      { at: 100, color: { r: 86,  g: 22,  b: 22  } },
    ],
    impossible: { r: 15, g: 12, b: 9 },
  },
};

// ---------------------------------------------------------------------------
//  PHOSPHOR — late-night CRT terminal reissue
// ---------------------------------------------------------------------------
const PHOSPHOR: Theme = {
  id: "phosphor",
  label: "Phosphor",
  tagline: "CRT green, terminal type",
  swatches: ["#050706", "#7FE9AB", "#FFB347"],
  layout: "sidebar",
  glyph: "ascii",
  equation: "ascii",
  ornaments: { sectionMarker: ">", mastheadSuffix: "rev. 1", ruleStyle: "dotted" },
  scale: {
    stops: [
      { at: 0,   color: { r: 5,   g: 7,   b: 6   } },
      { at: 5,   color: { r: 17,  g: 38,  b: 28  } },
      { at: 12,  color: { r: 32,  g: 78,  b: 56  } },
      { at: 25,  color: { r: 70,  g: 153, b: 102 } },
      { at: 50,  color: { r: 165, g: 224, b: 105 } },
      { at: 100, color: { r: 255, g: 147, b: 30  } },
    ],
    impossible: { r: 60, g: 12, b: 12 },
  },
};

// ---------------------------------------------------------------------------
//  BROADSHEET — dense daily newspaper, top masthead, news-red rules
// ---------------------------------------------------------------------------
const BROADSHEET: Theme = {
  id: "broadsheet",
  label: "Broadsheet",
  tagline: "Daily ledger of dice",
  swatches: ["#F8F4EC", "#0E0E10", "#B8121A"],
  layout: "topbar",
  glyph: "newsroom",
  equation: "rendered",
  ornaments: { sectionMarker: "¶", mastheadSuffix: "No. CCXVII", ruleStyle: "double" },
  scale: {
    stops: [
      { at: 0,   color: { r: 248, g: 244, b: 236 } },
      { at: 5,   color: { r: 232, g: 222, b: 200 } },
      { at: 12,  color: { r: 213, g: 188, b: 155 } },
      { at: 25,  color: { r: 196, g: 130, b: 105 } },
      { at: 50,  color: { r: 184, g: 18,  b: 26  } },
      { at: 100, color: { r: 36,  g: 8,   b: 10  } },
    ],
    impossible: { r: 14, g: 14, b: 16 },
  },
};

// ---------------------------------------------------------------------------
//  RISOGRAPH — punk math zine, brutalist sans, vermillion ink, hard shadow
// ---------------------------------------------------------------------------
const RISOGRAPH: Theme = {
  id: "risograph",
  label: "Risograph",
  tagline: "Cream, vermillion, ink",
  swatches: ["#F2EBDC", "#000000", "#E73127"],
  layout: "sidebar",
  glyph: "tile",
  equation: "rendered",
  ornaments: { sectionMarker: "★", mastheadSuffix: "Issue 7", ruleStyle: "bold" },
  scale: {
    stops: [
      { at: 0,   color: { r: 242, g: 235, b: 220 } },
      { at: 5,   color: { r: 232, g: 222, b: 165 } },
      { at: 12,  color: { r: 240, g: 200, b: 90  } },
      { at: 25,  color: { r: 244, g: 138, b: 60  } },
      { at: 50,  color: { r: 231, g: 49,  b: 39  } },
      { at: 100, color: { r: 30,  g: 18,  b: 14  } },
    ],
    impossible: { r: 0, g: 0, b: 0 },
  },
};

// ---------------------------------------------------------------------------
//  ARCADE — 8-bit dice oracle, HUD top bar, pip-tile dice, neon palette
// ---------------------------------------------------------------------------
const ARCADE: Theme = {
  id: "arcade",
  label: "Arcade",
  tagline: "8-bit dice oracle",
  swatches: ["#1B0F36", "#7BFFA1", "#FF4DC7"],
  layout: "topbar",
  glyph: "pip-tile",
  equation: "rendered",
  ornaments: { sectionMarker: "●", mastheadSuffix: "1P READY", ruleStyle: "pixelated" },
  scale: {
    stops: [
      { at: 0,   color: { r:  27, g:  15, b:  54 } },
      { at: 5,   color: { r:  35, g:  35, b: 110 } },
      { at: 12,  color: { r:  62, g: 142, b: 200 } },
      { at: 25,  color: { r: 123, g: 255, b: 161 } },
      { at: 50,  color: { r: 255, g: 209, b:  91 } },
      { at: 100, color: { r: 255, g:  77, b: 199 } },
    ],
    impossible: { r: 17, g: 8, b: 30 },
  },
};

// ---------------------------------------------------------------------------
//  MANUSCRIPT — illuminated medieval codex, blackletter + jewel tones
// ---------------------------------------------------------------------------
const MANUSCRIPT: Theme = {
  id: "manuscript",
  label: "Manuscript",
  tagline: "Vellum, ink-gall, gold leaf",
  swatches: ["#EFE4C7", "#1A0E04", "#9B2A1F"],
  layout: "manuscript",
  glyph: "illuminated",
  equation: "rendered",
  ornaments: {
    sectionMarker: "❦",
    mastheadSuffix: "Codex Primus",
    ruleStyle: "ornament",
    corner: "✦",
  },
  scale: {
    // Illuminated palette: vellum → ochre → russet → vermillion → indigo.
    stops: [
      { at: 0,   color: { r: 239, g: 228, b: 199 } },
      { at: 5,   color: { r: 222, g: 198, b: 138 } },
      { at: 12,  color: { r: 196, g: 144, b:  68 } },
      { at: 25,  color: { r: 165, g:  78, b:  44 } },
      { at: 50,  color: { r: 124, g:  32, b:  28 } },
      { at: 100, color: { r:  44, g:  28, b:  88 } },
    ],
    impossible: { r: 26, g: 14, b: 4 },
  },
};

// ---------------------------------------------------------------------------
//  BLUEPRINT — engineering drafting sheet, cyan grid + corner title block
// ---------------------------------------------------------------------------
const BLUEPRINT: Theme = {
  id: "blueprint",
  label: "Blueprint",
  tagline: "Cyan ink, drafting grid",
  swatches: ["#0E2A52", "#D8ECFF", "#FFC857"],
  layout: "blueprint",
  glyph: "blueprint",
  equation: "rendered",
  ornaments: {
    sectionMarker: "⊕",
    mastheadSuffix: "DWG-001",
    ruleStyle: "dimension",
  },
  scale: {
    // Drafting palette: deep blueprint → mid blue → ghost line → ochre call-out → red revision.
    stops: [
      { at: 0,   color: { r:  14, g:  42, b:  82 } },
      { at: 5,   color: { r:  26, g:  72, b: 130 } },
      { at: 12,  color: { r:  54, g: 120, b: 188 } },
      { at: 25,  color: { r: 152, g: 204, b: 248 } },
      { at: 50,  color: { r: 255, g: 200, b:  87 } },
      { at: 100, color: { r: 220, g:  60,  b: 60  } },
    ],
    impossible: { r: 8, g: 22, b: 44 },
  },
};

// ---------------------------------------------------------------------------
//  TAROT — mystic almanac, ornamental frame around content, Trajan caps
// ---------------------------------------------------------------------------
const TAROT: Theme = {
  id: "tarot",
  label: "Tarot",
  tagline: "Midnight, gold leaf, arcana",
  swatches: ["#0F1131", "#E8DCB7", "#D4A24C"],
  layout: "frame",
  glyph: "tarot",
  equation: "rendered",
  ornaments: {
    sectionMarker: "✦",
    mastheadSuffix: "Arcanum I",
    ruleStyle: "ornament",
    corner: "❖",
  },
  scale: {
    // Mystic palette: midnight → indigo → violet → antique gold → bright gold.
    stops: [
      { at: 0,   color: { r:  15, g:  17, b:  49 } },
      { at: 5,   color: { r:  36, g:  30, b:  82 } },
      { at: 12,  color: { r:  78, g:  46, b: 132 } },
      { at: 25,  color: { r: 134, g:  82, b: 150 } },
      { at: 50,  color: { r: 212, g: 162, b:  76 } },
      { at: 100, color: { r: 244, g: 218, b: 142 } },
    ],
    impossible: { r: 6, g: 6, b: 18 },
  },
};

// ---------------------------------------------------------------------------
//  VAPORWAVE — 90s mall sunset, italic display, neon pink + cyan + grid
// ---------------------------------------------------------------------------
const VAPORWAVE: Theme = {
  id: "vaporwave",
  label: "Vaporwave",
  tagline: "Sunset grid, neon italics",
  swatches: ["#1A0F3D", "#F8C8FF", "#FF61B6"],
  layout: "sidebar",
  glyph: "tile",
  equation: "rendered",
  ornaments: {
    sectionMarker: "▽",
    mastheadSuffix: "AESTHETIC",
    ruleStyle: "double",
  },
  scale: {
    // Sunset gradient: midnight purple → magenta → cyan → coral pink.
    stops: [
      { at: 0,   color: { r:  26, g:  15, b:  61 } },
      { at: 5,   color: { r:  72, g:  18, b: 120 } },
      { at: 12,  color: { r: 158, g:  44, b: 168 } },
      { at: 25,  color: { r: 255, g:  97, b: 182 } },
      { at: 50,  color: { r: 132, g: 224, b: 252 } },
      { at: 100, color: { r: 255, g: 220, b: 152 } },
    ],
    impossible: { r: 14, g: 8, b: 32 },
  },
};

// ---------------------------------------------------------------------------
//  RECEIPT — thermal-printer slip, narrow column, dotted perforations
// ---------------------------------------------------------------------------
const RECEIPT: Theme = {
  id: "receipt",
  label: "Receipt",
  tagline: "Thermal print, all caps",
  swatches: ["#F6F1E2", "#1B1812", "#8C2A1A"],
  layout: "receipt",
  glyph: "ascii",
  equation: "ascii",
  ornaments: {
    sectionMarker: "*",
    mastheadSuffix: "TXN #00040",
    ruleStyle: "perforation",
  },
  scale: {
    // Sepia thermal-print palette: cream → warm beige → toast → brown → faded burn.
    stops: [
      { at: 0,   color: { r: 246, g: 241, b: 226 } },
      { at: 5,   color: { r: 232, g: 217, b: 188 } },
      { at: 12,  color: { r: 210, g: 184, b: 138 } },
      { at: 25,  color: { r: 174, g: 132, b:  92 } },
      { at: 50,  color: { r: 124, g:  72, b:  44 } },
      { at: 100, color: { r:  56, g:  30, b:  18 } },
    ],
    impossible: { r: 20, g: 14, b: 8 },
  },
};

// ---------------------------------------------------------------------------
//  TABLETOP — vintage board-game edition: navy frame, butter surface, chunky
//  black numerals on white tiles. Mirrors the look of the original N2K board.
// ---------------------------------------------------------------------------
const TABLETOP: Theme = {
  id: "tabletop",
  label: "Tabletop",
  tagline: "Butter board, navy bracket, chunky ink",
  swatches: ["#F0E0A4", "#1B2A55", "#C61F2C"],
  layout: "board",
  glyph: "boardgame",
  equation: "rendered",
  ornaments: {
    sectionMarker: "■",
    mastheadSuffix: "BOARD I",
    ruleStyle: "bold",
    corner: "▟",
  },
  scale: {
    // Warm gameboard ramp: butter cream → tan → gold → red-orange → navy.
    stops: [
      { at: 0,   color: { r: 246, g: 232, b: 178 } },
      { at: 5,   color: { r: 232, g: 200, b: 132 } },
      { at: 12,  color: { r: 224, g: 158, b:  72 } },
      { at: 25,  color: { r: 220, g:  92, b:  52 } },
      { at: 50,  color: { r: 198, g:  31, b:  44 } },
      { at: 100, color: { r:  27, g:  42, b:  85 } },
    ],
    impossible: { r: 14, g: 22, b: 44 },
  },
};

// ---------------------------------------------------------------------------
//  SUBWAY — NYC MTA platform: black info strip, tactile yellow safety strip,
//  Helvetica caps, route-bullet navigation.
// ---------------------------------------------------------------------------
const SUBWAY: Theme = {
  id: "subway",
  label: "Subway",
  tagline: "Helvetica, route bullets, tactile yellow",
  swatches: ["#0E0E10", "#FCD300", "#EE352E"],
  layout: "platform",
  glyph: "bullet",
  equation: "rendered",
  ornaments: {
    sectionMarker: "●",
    mastheadSuffix: "PLATFORM 1",
    ruleStyle: "bold",
  },
  scale: {
    // Service-alert ramp: clear → caution → delays → service change → suspended.
    stops: [
      { at: 0,   color: { r: 245, g: 245, b: 245 } },
      { at: 5,   color: { r: 252, g: 211,  b:   0 } }, // MTA yellow
      { at: 12,  color: { r: 255, g: 99,   b:  25 } }, // M-line orange
      { at: 25,  color: { r: 238, g: 53,   b:  46 } }, // 1/2/3 red
      { at: 50,  color: { r: 153, g:  9,   b:  86 } }, // 7-line magenta
      { at: 100, color: { r:  14, g:  14,  b:  16 } }, // platform black
    ],
    impossible: { r: 8, g: 8, b: 10 },
  },
};

// ---------------------------------------------------------------------------
//  SPREADSHEET — Lotus 1-2-3 / VisiCalc DOS: formula bar, gridlined cells,
//  column letters, row numbers, IBM Plex Mono.
// ---------------------------------------------------------------------------
const SPREADSHEET: Theme = {
  id: "spreadsheet",
  label: "Spreadsheet",
  tagline: "Formula bar, cell grid, column letters",
  swatches: ["#FCFCFA", "#0A2A66", "#C9302C"],
  layout: "spreadsheet",
  glyph: "cell",
  equation: "ascii",
  ornaments: {
    sectionMarker: "│",
    mastheadSuffix: "WB1.WK1",
    ruleStyle: "hairline",
  },
  scale: {
    // VisiCalc/Lotus error progression: clean → warn → error.
    stops: [
      { at: 0,   color: { r: 252, g: 252, b: 250 } },
      { at: 5,   color: { r: 224, g: 232, b: 252 } }, // pale cell-fill blue
      { at: 12,  color: { r: 173, g: 196, b: 240 } },
      { at: 25,  color: { r: 248, g: 200, b:  88 } }, // warn yellow
      { at: 50,  color: { r: 201, g:  48, b:  44 } }, // error red
      { at: 100, color: { r:  10, g:  42, b: 102 } }, // header bar navy
    ],
    impossible: { r: 60, g: 70, b: 90 },
  },
};

// ---------------------------------------------------------------------------
//  POLAROID — kraft-paper scrapbook with rotated polaroids, washi tape,
//  handwritten captions.
// ---------------------------------------------------------------------------
const POLAROID: Theme = {
  id: "polaroid",
  label: "Polaroid",
  tagline: "Kraft scrapbook, washi tape, ink pen",
  swatches: ["#D6BC92", "#FAF8F2", "#3F8F92"],
  layout: "scrapbook",
  glyph: "polaroid",
  equation: "rendered",
  ornaments: {
    sectionMarker: "✿",
    mastheadSuffix: "Roll #11",
    ruleStyle: "dotted",
  },
  scale: {
    // Faded film tones → vibrant developed photo → dark room.
    stops: [
      { at: 0,   color: { r: 250, g: 244, b: 222 } },
      { at: 5,   color: { r: 235, g: 218, b: 168 } },
      { at: 12,  color: { r: 215, g: 168, b: 122 } },
      { at: 25,  color: { r: 196, g: 110, b:  84 } },
      { at: 50,  color: { r:  63, g: 143, b: 146 } }, // washi-tape teal
      { at: 100, color: { r:  56, g:  44, b:  36 } }, // dark room
    ],
    impossible: { r: 36, g: 28, b: 22 },
  },
};

// ---------------------------------------------------------------------------
//  COMIC — silver-age comic page: thick black panel borders, halftone dots,
//  primary colors, sound-effect display.
// ---------------------------------------------------------------------------
const COMIC: Theme = {
  id: "comic",
  label: "Comic",
  tagline: "Halftone, panel borders, KAPOW",
  swatches: ["#FFE34F", "#1B1B1F", "#E63946"],
  layout: "panels",
  glyph: "panel",
  equation: "rendered",
  ornaments: {
    sectionMarker: "★",
    mastheadSuffix: "ISSUE #001",
    ruleStyle: "bold",
  },
  scale: {
    // Comic CMYK ramp: yellow tint → orange → red → magenta → ink.
    stops: [
      { at: 0,   color: { r: 255, g: 240, b: 188 } },
      { at: 5,   color: { r: 253, g: 220, b:  95 } },
      { at: 12,  color: { r: 248, g: 162, b:  46 } },
      { at: 25,  color: { r: 230, g:  57, b:  70 } },
      { at: 50,  color: { r: 165, g:  43, b: 142 } },
      { at: 100, color: { r:  27, g:  27, b:  31 } },
    ],
    impossible: { r: 14, g: 14, b: 18 },
  },
};

// ---------------------------------------------------------------------------
//  CARTOGRAPHIC — aged maritime chart: sepia paper, hairline grid, scroll
//  banner masthead, compass-rose corner ornament, cartouche body frame.
// ---------------------------------------------------------------------------
const CARTOGRAPHIC: Theme = {
  id: "cartographic",
  label: "Cartographic",
  tagline: "Sepia paper, hairline grid, compass rose",
  swatches: ["#E9D9A8", "#3A2914", "#7A1F1F"],
  layout: "chart",
  glyph: "buoy",
  equation: "rendered",
  ornaments: {
    sectionMarker: "✦",
    mastheadSuffix: "Chart No. III",
    ruleStyle: "double",
    corner: "✺",
  },
  scale: {
    // Bathymetric: shallows → reef → coastal water → open sea → deep abyss.
    stops: [
      { at: 0,   color: { r: 233, g: 217, b: 168 } }, // shoals / paper
      { at: 5,   color: { r: 198, g: 188, b: 142 } },
      { at: 12,  color: { r: 156, g: 169, b: 156 } }, // pale teal
      { at: 25,  color: { r: 102, g: 138, b: 144 } }, // shelf
      { at: 50,  color: { r:  58, g:  88, b: 110 } }, // deep ocean
      { at: 100, color: { r:  28,  g:  44,  b:  60 } }, // abyssal
    ],
    impossible: { r: 18, g: 28, b: 38 },
  },
};

// ---------------------------------------------------------------------------
//  HERBARIUM — Edwardian botanical specimen ledger, pressed-leaf greens
// ---------------------------------------------------------------------------
//  Reuses existing layout (`sidebar`), glyph (`tile`), and equation
//  (`rendered`) variants; all decoration lives in the per-theme CSS
//  bundle. The smallest recipe an editor can follow — see `docs/themes.md`
//  Step 1.
const HERBARIUM: Theme = {
  id: "herbarium",
  label: "Herbarium",
  tagline: "Pressed leaves, sage ink, specimen tag",
  swatches: ["#F5EFDF", "#1F2A1A", "#A14B3A"],
  layout: "sidebar",
  glyph: "tile",
  equation: "rendered",
  ornaments: { sectionMarker: "❦", mastheadSuffix: "Pl. XVII", ruleStyle: "hairline" },
  scale: {
    // Herbarium gradient: cream → fresh sage → moss → forest → autumn rust → specimen vermilion.
    stops: [
      { at: 0,   color: { r: 245, g: 239, b: 223 } },
      { at: 5,   color: { r: 220, g: 222, b: 188 } },
      { at: 12,  color: { r: 180, g: 196, b: 152 } },
      { at: 25,  color: { r: 122, g: 152, b: 108 } },
      { at: 50,  color: { r:  79, g: 107,  b:  58 } },
      { at: 100, color: { r: 161, g:  75,  b:  58 } },
    ],
    impossible: { r: 31, g: 42, b: 26 },
  },
};

export const THEMES: Record<ThemeId, Theme> = {
  almanac:      ALMANAC,
  phosphor:     PHOSPHOR,
  broadsheet:   BROADSHEET,
  risograph:    RISOGRAPH,
  arcade:       ARCADE,
  manuscript:   MANUSCRIPT,
  blueprint:    BLUEPRINT,
  tarot:        TAROT,
  vaporwave:    VAPORWAVE,
  receipt:      RECEIPT,
  tabletop:     TABLETOP,
  subway:       SUBWAY,
  spreadsheet:  SPREADSHEET,
  polaroid:     POLAROID,
  comic:        COMIC,
  cartographic: CARTOGRAPHIC,
  herbarium:    HERBARIUM,
};

/**
 * Default edition served on first paint — Tabletop. Mirrors the original
 * N2K board game look (navy frame, butter board, chunky black numerals).
 * Keep `index.html`'s pre-paint script fallback in sync.
 */
export const DEFAULT_THEME: ThemeId = "tabletop";
