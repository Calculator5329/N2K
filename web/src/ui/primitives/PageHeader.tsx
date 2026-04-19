/**
 * PageHeader — standard section header used inside every feature view.
 *
 * Folio · eyebrow line + display title + optional dek + hairline rule.
 * Lives in `ui/primitives/` so it stays available regardless of which
 * layout the active theme picks.
 */
import type { ReactNode } from "react";

export interface PageHeaderProps {
  readonly folio: string;
  readonly eyebrow: string;
  readonly title: ReactNode;
  readonly dek?: string;
  readonly right?: ReactNode;
}

export function PageHeader({ folio, eyebrow, title, dek, right }: PageHeaderProps) {
  return (
    <header className="mb-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span
            className="font-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--color-accent)",
            }}
          >
            §&nbsp;{folio}
          </span>
          <span className="label-caps">{eyebrow}</span>
        </div>
        {right !== undefined ? <div>{right}</div> : null}
      </div>
      <h1
        className="mt-2"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "clamp(1.75rem, 8.5vw, 4rem)",
          lineHeight: 0.95,
          letterSpacing: "-0.01em",
          color: "var(--color-ink)",
          fontVariationSettings: '"opsz" 60, "SOFT" 30',
          fontWeight: 600,
        }}
      >
        {title}
      </h1>
      {dek !== undefined ? (
        <p
          className="mt-2 italic"
          style={{
            color: "var(--color-ink-muted)",
            fontSize: "clamp(0.95rem, 2vw, 1.125rem)",
            fontFamily: "var(--font-serif)",
          }}
        >
          {dek}
        </p>
      ) : null}
      <div className="divider-hair mt-4" />
    </header>
  );
}
