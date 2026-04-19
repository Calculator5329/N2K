import { observer } from "mobx-react-lite";
import type { DiceTriple } from "../core/types.js";
import { THEMES, type DiceGlyphStyle } from "../core/themes.js";
import { useActiveThemeId } from "./themeOverride.js";

/**
 * Visual representation of a dice triple.
 *
 * Renders one of thirteen variants — chosen by the active theme's `glyph`
 * field — sharing the same external API:
 *
 *   tile        — typecase block with a number       (Almanac, Risograph, Vaporwave)
 *   ascii       — bracketed mono ASCII "[ 2  3  5 ]" (Phosphor, Receipt)
 *   newsroom    — tight serif numerals + hairlines   (Broadsheet)
 *   pip-tile    — chunky 8-bit beveled tile          (Arcade)
 *   illuminated — gilded versal capital              (Manuscript)
 *   blueprint   — orthographic line cube             (Blueprint)
 *   tarot       — mini-card with arcane numerals     (Tarot)
 *   boardgame   — chunky black numerals on white     (Tabletop)
 *   bullet      — colored route bullet               (Subway)
 *   cell        — adjacent spreadsheet cells         (Spreadsheet)
 *   polaroid    — rotated mini photo cards           (Polaroid)
 *   panel       — comic panels with thick border     (Comic)
 *   buoy        — ringed navigational marker         (Cartographic)
 *
 * A new variant: add a `case` below + a matching `dice-<name>` block in
 * `globals.css`. No other component code needs to change.
 */
type Size = "sm" | "md" | "lg";
type Emphasis = "default" | "active" | "muted";

interface DiceGlyphProps {
  dice: DiceTriple;
  size?: Size;
  emphasis?: Emphasis;
  onClick?: () => void;
}

const TILE_SIZES: Record<Size, { tile: string; gap: string }> = {
  sm: { tile: "w-7 h-7 text-[13px]",   gap: "gap-1"   },
  md: { tile: "w-10 h-10 text-[18px]", gap: "gap-1.5" },
  lg: { tile: "w-14 h-14 text-[24px]", gap: "gap-2"   },
};

const NEWSROOM_SIZES: Record<Size, { box: string; cell: string; gap: string }> = {
  sm: { box: "h-7 text-[13px]",   cell: "min-w-[20px]", gap: "" },
  md: { box: "h-10 text-[18px]",  cell: "min-w-[28px]", gap: "" },
  lg: { box: "h-14 text-[28px]",  cell: "min-w-[36px]", gap: "" },
};

const PIXEL_SIZES: Record<Size, { tile: string; text: string }> = {
  sm: { tile: "w-8 h-8",   text: "text-[10px]" },
  md: { tile: "w-12 h-12", text: "text-[14px]" },
  lg: { tile: "w-16 h-16", text: "text-[18px]" },
};

const ASCII_SIZES: Record<Size, string> = {
  sm: "text-[14px]",
  md: "text-[18px]",
  lg: "text-[26px]",
};

const ILLUMINATED_SIZES: Record<Size, { tile: string; text: string }> = {
  sm: { tile: "w-7 h-9",   text: "text-[15px]" },
  md: { tile: "w-10 h-12", text: "text-[20px]" },
  lg: { tile: "w-14 h-16", text: "text-[28px]" },
};

const BLUEPRINT_SIZES: Record<Size, { tile: string; text: string }> = {
  sm: { tile: "w-7 h-7",   text: "text-[13px]" },
  md: { tile: "w-10 h-10", text: "text-[18px]" },
  lg: { tile: "w-14 h-14", text: "text-[24px]" },
};

const TAROT_SIZES: Record<Size, { tile: string; text: string }> = {
  sm: { tile: "w-7 h-10",  text: "text-[12px]" },
  md: { tile: "w-10 h-14", text: "text-[16px]" },
  lg: { tile: "w-14 h-20", text: "text-[22px]" },
};

const BOARDGAME_SIZES: Record<Size, { tile: string; text: string }> = {
  sm: { tile: "w-9 h-9",   text: "text-[16px]" },
  md: { tile: "w-12 h-12", text: "text-[22px]" },
  lg: { tile: "w-16 h-16", text: "text-[30px]" },
};

const BULLET_SIZES: Record<Size, { tile: string; text: string }> = {
  sm: { tile: "w-7 h-7",   text: "text-[13px]" },
  md: { tile: "w-10 h-10", text: "text-[18px]" },
  lg: { tile: "w-14 h-14", text: "text-[24px]" },
};

const CELL_SIZES: Record<Size, { tile: string; text: string }> = {
  sm: { tile: "w-10 h-7  px-1.5", text: "text-[13px]" },
  md: { tile: "w-14 h-9  px-2",   text: "text-[16px]" },
  lg: { tile: "w-20 h-12 px-2.5", text: "text-[22px]" },
};

const POLAROID_SIZES: Record<Size, { tile: string; text: string }> = {
  sm: { tile: "w-8 h-9   pt-1",   text: "text-[16px]" },
  md: { tile: "w-12 h-14 pt-1.5", text: "text-[22px]" },
  lg: { tile: "w-16 h-20 pt-2",   text: "text-[30px]" },
};

const PANEL_SIZES: Record<Size, { tile: string; text: string }> = {
  sm: { tile: "w-9 h-9",   text: "text-[18px]" },
  md: { tile: "w-12 h-12", text: "text-[26px]" },
  lg: { tile: "w-16 h-16", text: "text-[34px]" },
};

const BUOY_SIZES: Record<Size, { tile: string; text: string }> = {
  sm: { tile: "w-7 h-7",   text: "text-[12px]" },
  md: { tile: "w-10 h-10", text: "text-[16px]" },
  lg: { tile: "w-14 h-14", text: "text-[22px]" },
};

/** Roman numeral for small values 0..20. Falls back to digits beyond that. */
const ROMAN: Record<number, string> = {
  0: "·", 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII",
  8: "VIII", 9: "IX", 10: "X", 11: "XI", 12: "XII", 13: "XIII", 14: "XIV",
  15: "XV", 16: "XVI", 17: "XVII", 18: "XVIII", 19: "XIX", 20: "XX",
};

export const DiceGlyph = observer(function DiceGlyph(props: DiceGlyphProps) {
  // Honors the per-subtree `<ThemeScope>` override used by the
  // edition gallery; falls through to the global theme everywhere else.
  const themeId = useActiveThemeId();
  const variant: DiceGlyphStyle = THEMES[themeId].glyph;

  switch (variant) {
    case "ascii":       return <DiceAscii       {...props} />;
    case "newsroom":    return <DiceNewsroom    {...props} />;
    case "pip-tile":    return <DicePixel       {...props} />;
    case "illuminated": return <DiceIlluminated {...props} />;
    case "blueprint":   return <DiceBlueprint   {...props} />;
    case "tarot":       return <DiceTarot       {...props} />;
    case "boardgame":   return <DiceBoardgame   {...props} />;
    case "bullet":      return <DiceBullet      {...props} />;
    case "cell":        return <DiceCell        {...props} />;
    case "polaroid":    return <DicePolaroid    {...props} />;
    case "panel":       return <DicePanel       {...props} />;
    case "buoy":        return <DiceBuoy        {...props} />;
    case "tile":
    default:            return <DiceTile        {...props} />;
  }
});

// ---------------------------------------------------------------------------
//  Variant: TILE  — original typecase block
// ---------------------------------------------------------------------------
function DiceTile({ dice, size = "md", emphasis = "default", onClick }: DiceGlyphProps) {
  const sizes = TILE_SIZES[size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={["inline-flex items-center", sizes.gap, onClick && "transition-transform hover:-translate-y-px focus:outline-none"].filter(Boolean).join(" ")}
      type={onClick ? "button" : undefined}
    >
      {dice.map((value, i) => (
        <span key={i} className={["dice-tile", sizes.tile, emphasis !== "default" ? `is-${emphasis}` : ""].filter(Boolean).join(" ")}>
          {value}
        </span>
      ))}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
//  Variant: ASCII  — bracketed mono triplet "[  2   3   5 ]"
// ---------------------------------------------------------------------------
function DiceAscii({ dice, size = "md", emphasis = "default", onClick }: DiceGlyphProps) {
  const Tag = onClick ? "button" : "span";
  const cls = ["dice-ascii", ASCII_SIZES[size], emphasis === "active" ? "is-active" : "", onClick && "hover:opacity-90 focus:outline-none"]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag onClick={onClick} className={cls} type={onClick ? "button" : undefined}>
      <span className="dice-ascii__bracket">[</span>
      {dice.map((value, i) => (
        <span key={i} className="inline-block min-w-[1.6em] text-center tabular">
          {String(value).padStart(2, " ")}
        </span>
      ))}
      <span className="dice-ascii__bracket">]</span>
    </Tag>
  );
}

// ---------------------------------------------------------------------------
//  Variant: NEWSROOM  — three numerals stacked horizontally in a hairline box
// ---------------------------------------------------------------------------
function DiceNewsroom({ dice, size = "md", emphasis = "default", onClick }: DiceGlyphProps) {
  const sizes = NEWSROOM_SIZES[size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={["dice-newsroom", sizes.box, emphasis === "active" ? "is-active" : "", onClick && "hover:opacity-95 focus:outline-none"]
        .filter(Boolean)
        .join(" ")}
      type={onClick ? "button" : undefined}
    >
      {dice.map((value, i) => (
        <span key={i} className={sizes.cell}>{value}</span>
      ))}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
//  Variant: PIP-TILE  — chunky 8-bit dice with beveled shadow
// ---------------------------------------------------------------------------
function DicePixel({ dice, size = "md", emphasis = "default", onClick }: DiceGlyphProps) {
  const sizes = PIXEL_SIZES[size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={["dice-pixel", emphasis === "active" ? "is-active" : "", onClick && "hover:-translate-y-px focus:outline-none"]
        .filter(Boolean)
        .join(" ")}
      type={onClick ? "button" : undefined}
    >
      {dice.map((value, i) => (
        <span key={i} className={[sizes.tile, sizes.text, "tabular"].join(" ")}>
          {value}
        </span>
      ))}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
//  Variant: ILLUMINATED  — gilded versal capital, manuscript-style
// ---------------------------------------------------------------------------
function DiceIlluminated({ dice, size = "md", emphasis = "default", onClick }: DiceGlyphProps) {
  const sizes = ILLUMINATED_SIZES[size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={["dice-illuminated", emphasis === "active" ? "is-active" : "", onClick && "hover:-translate-y-px focus:outline-none"]
        .filter(Boolean)
        .join(" ")}
      type={onClick ? "button" : undefined}
    >
      {dice.map((value, i) => (
        <span key={i} className={[sizes.tile, sizes.text, "tabular"].join(" ")}>
          {value}
        </span>
      ))}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
//  Variant: BLUEPRINT  — orthographic line-cube projection
// ---------------------------------------------------------------------------
function DiceBlueprint({ dice, size = "md", emphasis = "default", onClick }: DiceGlyphProps) {
  const sizes = BLUEPRINT_SIZES[size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={["dice-blueprint", emphasis === "active" ? "is-active" : "", onClick && "hover:-translate-y-px focus:outline-none"]
        .filter(Boolean)
        .join(" ")}
      type={onClick ? "button" : undefined}
    >
      {dice.map((value, i) => (
        <span key={i} className={[sizes.tile, sizes.text, "tabular"].join(" ")}>
          {value}
        </span>
      ))}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
//  Variant: TAROT  — mini-card with arcane numerals
// ---------------------------------------------------------------------------
function DiceTarot({ dice, size = "md", emphasis = "default", onClick }: DiceGlyphProps) {
  const sizes = TAROT_SIZES[size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={["dice-tarot", emphasis === "active" ? "is-active" : "", onClick && "hover:-translate-y-px focus:outline-none"]
        .filter(Boolean)
        .join(" ")}
      type={onClick ? "button" : undefined}
    >
      {dice.map((value, i) => (
        <span key={i} className={[sizes.tile, sizes.text, "tabular"].join(" ")}>
          {ROMAN[value] ?? String(value)}
        </span>
      ))}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
//  Variant: BOARDGAME  — chunky black numerals on white tile, like a real board
// ---------------------------------------------------------------------------
function DiceBoardgame({ dice, size = "md", emphasis = "default", onClick }: DiceGlyphProps) {
  const sizes = BOARDGAME_SIZES[size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={["dice-boardgame", emphasis === "active" ? "is-active" : "", onClick && "hover:-translate-y-px focus:outline-none"]
        .filter(Boolean)
        .join(" ")}
      type={onClick ? "button" : undefined}
    >
      {dice.map((value, i) => (
        <span key={i} className={[sizes.tile, sizes.text, "tabular"].join(" ")}>
          {value}
        </span>
      ))}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
//  Variant: BULLET  — solid colored route bullets with white numerals (Subway)
// ---------------------------------------------------------------------------
function DiceBullet({ dice, size = "md", emphasis = "default", onClick }: DiceGlyphProps) {
  const sizes = BULLET_SIZES[size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={["dice-bullet", emphasis === "active" ? "is-active" : "", onClick && "hover:-translate-y-px focus:outline-none"]
        .filter(Boolean)
        .join(" ")}
      type={onClick ? "button" : undefined}
    >
      {dice.map((value, i) => (
        <span key={i} className={[sizes.tile, sizes.text, "tabular"].join(" ")}>
          {value}
        </span>
      ))}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
//  Variant: CELL  — adjacent gridlined spreadsheet cells (Spreadsheet)
// ---------------------------------------------------------------------------
function DiceCell({ dice, size = "md", emphasis = "default", onClick }: DiceGlyphProps) {
  const sizes = CELL_SIZES[size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={["dice-cell", emphasis === "active" ? "is-active" : "", onClick && "hover:-translate-y-px focus:outline-none"]
        .filter(Boolean)
        .join(" ")}
      type={onClick ? "button" : undefined}
    >
      {dice.map((value, i) => (
        <span key={i} className={[sizes.tile, sizes.text, "tabular"].join(" ")}>
          {value}
        </span>
      ))}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
//  Variant: POLAROID  — rotated mini photo cards with white border (Polaroid)
// ---------------------------------------------------------------------------
function DicePolaroid({ dice, size = "md", emphasis = "default", onClick }: DiceGlyphProps) {
  const sizes = POLAROID_SIZES[size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={["dice-polaroid", emphasis === "active" ? "is-active" : "", onClick && "hover:-translate-y-px focus:outline-none"]
        .filter(Boolean)
        .join(" ")}
      type={onClick ? "button" : undefined}
    >
      {dice.map((value, i) => (
        <span key={i} className={[sizes.tile, sizes.text, "tabular"].join(" ")}>
          {value}
        </span>
      ))}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
//  Variant: PANEL  — numbered comic-book panels with thick ink border (Comic)
// ---------------------------------------------------------------------------
function DicePanel({ dice, size = "md", emphasis = "default", onClick }: DiceGlyphProps) {
  const sizes = PANEL_SIZES[size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={["dice-panel", emphasis === "active" ? "is-active" : "", onClick && "hover:-translate-y-px focus:outline-none"]
        .filter(Boolean)
        .join(" ")}
      type={onClick ? "button" : undefined}
    >
      {dice.map((value, i) => (
        <span key={i} className={[sizes.tile, sizes.text, "tabular"].join(" ")}>
          {value}
        </span>
      ))}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
//  Variant: BUOY  — ringed navigational marker (Cartographic)
// ---------------------------------------------------------------------------
function DiceBuoy({ dice, size = "md", emphasis = "default", onClick }: DiceGlyphProps) {
  const sizes = BUOY_SIZES[size];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={["dice-buoy", emphasis === "active" ? "is-active" : "", onClick && "hover:-translate-y-px focus:outline-none"]
        .filter(Boolean)
        .join(" ")}
      type={onClick ? "button" : undefined}
    >
      {dice.map((value, i) => (
        <span key={i} className={[sizes.tile, sizes.text, "tabular"].join(" ")}>
          {value}
        </span>
      ))}
    </Tag>
  );
}
