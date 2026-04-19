/**
 * Wordmark — branded "N2K Almanac" lockup.
 *
 * Two sizes: `default` for hero mastheads, `compact` for nav rails. The
 * lockup pulls the active theme's accent + ink color from CSS variables
 * so the same component looks at home in every layout.
 */
import type { CSSProperties } from "react";

export interface WordmarkProps {
  readonly size?: "default" | "compact";
  readonly suffix?: string;
}

const FRAUNCES_AXES: CSSProperties = {
  fontVariationSettings: '"opsz" 60, "SOFT" 30, "WONK" 1',
};

export function Wordmark({ size = "default", suffix = "Almanac" }: WordmarkProps) {
  if (size === "compact") {
    return (
      <div className="flex items-baseline gap-2">
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 28,
            fontWeight: 700,
            color: "var(--color-accent)",
            letterSpacing: "-0.02em",
            ...FRAUNCES_AXES,
          }}
        >
          N2K
        </span>
        <span className="label-caps" style={{ color: "var(--color-ink-muted)" }}>
          {suffix}
        </span>
      </div>
    );
  }
  return (
    <div className="leading-[0.95]">
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontWeight: 700,
          fontSize: "clamp(3.25rem, 12vw, 5.5rem)",
          color: "var(--color-accent)",
          letterSpacing: "-0.02em",
          ...FRAUNCES_AXES,
        }}
      >
        N2K
      </div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: "clamp(1.25rem, 4vw, 1.75rem)",
          color: "var(--color-ink)",
          marginTop: 4,
          letterSpacing: "0.02em",
        }}
      >
        The N2K {suffix}
      </div>
    </div>
  );
}
