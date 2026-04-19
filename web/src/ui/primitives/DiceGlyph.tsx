/**
 * DiceGlyph — theme-aware visual for an N-tuple of dice.
 *
 * The component itself is intentionally minimal: it renders one
 * `<span>` per die under a wrapper whose CSS class root (`dice-tile`,
 * `dice-pixel`, `dice-tarot`, …) drives the entire visual. The class
 * is chosen by the active theme's `style.glyph` field, with a sensible
 * default of "tile".
 *
 * The roman-numeral mapping for the tarot variant is the only piece
 * of glyph-level logic that lives in TS instead of CSS, because CSS
 * can't translate `7` into `VII`.
 */
import { useMemo } from "react";
import type { DiceGlyphStyle } from "@platform/themes/types.js";

export interface DiceGlyphProps {
  readonly dice: readonly number[];
  readonly variant?: DiceGlyphStyle;
  readonly size?: "sm" | "md" | "lg";
  readonly emphasis?: "default" | "active" | "muted";
  readonly onClick?: () => void;
  readonly className?: string;
}

const ROMAN: readonly string[] = [
  "·", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
];

const SIZE_PX: Readonly<Record<NonNullable<DiceGlyphProps["size"]>, number>> = {
  sm: 12,
  md: 14,
  lg: 18,
};

export function DiceGlyph({
  dice,
  variant = "tile",
  size = "md",
  emphasis = "default",
  onClick,
  className,
}: DiceGlyphProps) {
  const labels = useMemo(() => {
    if (variant === "tarot") {
      return dice.map((d) => (d >= 0 && d < ROMAN.length ? ROMAN[d] : String(d)));
    }
    return dice.map((d) => String(d));
  }, [dice, variant]);

  const Outer = onClick !== undefined ? "button" : "div";
  const cls = `dice dice-${variant} ${emphasis === "active" ? "is-active" : emphasis === "muted" ? "is-muted" : ""} ${className ?? ""}`.trim();
  const fontSize = SIZE_PX[size];
  const inner = (
    <>
      {variant === "ascii" ? <span className="dice-ascii__bracket">[</span> : null}
      {labels.map((label, i) => (
        <span key={i}>{label}</span>
      ))}
      {variant === "ascii" ? <span className="dice-ascii__bracket">]</span> : null}
    </>
  );

  if (Outer === "button") {
    return (
      <button
        type="button"
        className={cls}
        onClick={onClick}
        style={{
          fontSize,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={cls} style={{ fontSize }}>
      {inner}
    </div>
  );
}
