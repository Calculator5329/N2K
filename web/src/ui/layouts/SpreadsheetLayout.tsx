/**
 * SpreadsheetLayout — Lotus 1-2-3 / VisiCalc window chrome.
 *
 * Title bar + formula bar + column header row + body grid (8 row-number
 * gutter columns + the page surface) + status bar + colophon. Every
 * border is a single hairline; every text run is mono.
 */
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

export function SpreadsheetLayout({ nav, activeId, onNavigate, children, themeId, statsLine }: LayoutProps) {
  const activeFolio = nav.find((n) => n.id === activeId)?.folio ?? "I";
  const view = activeId.toUpperCase();
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--color-bg)" }}>
      <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8 lg:py-8">
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-ink-muted)" }}>
          {/* Title bar */}
          <div
            className="flex items-center justify-between px-3 py-1"
            style={{
              background: "var(--color-accent)",
              color: "#fff",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            <span>N2K-ALMANAC.WK1</span>
            <span style={{ opacity: 0.85 }}>{themeId.toUpperCase()} · v2</span>
          </div>
          {/* Formula bar */}
          <div
            className="flex items-stretch font-mono text-[12px]"
            style={{ borderBottom: "1px solid var(--color-ink-muted)" }}
          >
            <div className="px-3 py-1" style={{ background: "color-mix(in oklab, var(--color-rule) 60%, transparent)", borderRight: "1px solid var(--color-ink-muted)", minWidth: 56, textAlign: "center" }}>
              {activeFolio}1
            </div>
            <div className="px-3 py-1" style={{ flex: 1 }}>
              fx =N2K.ALMANAC.{view}()
            </div>
          </div>
          {/* Column header row */}
          <div className="flex font-mono text-[11px]" style={{ borderBottom: "1px solid var(--color-ink-muted)" }}>
            <ColumnHeader>{" "}</ColumnHeader>
            {nav.map((n) => (
              <ColumnHeader key={n.id} active={activeId === n.id} onClick={() => onNavigate(n.id)}>
                {n.label}
              </ColumnHeader>
            ))}
          </div>
          {/* Body */}
          <div className="flex">
            <div className="flex flex-col" style={{ borderRight: "1px solid var(--color-ink-muted)" }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="font-mono text-[11px] px-2 py-1"
                  style={{
                    minWidth: 40,
                    textAlign: "right",
                    borderBottom: i === 7 ? "none" : "1px solid var(--color-ink-muted)",
                    color: "var(--color-ink-muted)",
                  }}
                >
                  {i + 1}
                </div>
              ))}
            </div>
            <main className="flex-1 page-surface px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10" style={{ borderRadius: 0, border: "none", boxShadow: "none", minHeight: "60vh" }}>
              {children}
            </main>
          </div>
          {/* Status bar */}
          <div
            className="flex items-center justify-between px-3 py-1 font-mono text-[11px]"
            style={{ borderTop: "1px solid var(--color-ink-muted)", background: "color-mix(in oklab, var(--color-rule) 60%, transparent)" }}
          >
            <span style={{ background: "var(--color-accent)", color: "#fff", padding: "0 6px" }}>READY</span>
            <span>{statsLine ?? "—"}</span>
            <ThemeSelector orientation="discreet" />
          </div>
        </div>
        <div
          className="mt-2 px-3 py-2 font-mono text-[11px]"
          style={{ background: "color-mix(in oklab, var(--color-rule) 30%, transparent)", color: "var(--color-ink-muted)" }}
        >
          REM · {colophonFor(themeId)}
        </div>
      </div>
    </div>
  );
}

function ColumnHeader({ children, active, onClick }: { readonly children: React.ReactNode; readonly active?: boolean; readonly onClick?: () => void }) {
  const Tag = onClick !== undefined ? "button" : "div";
  return (
    <Tag
      type={onClick !== undefined ? "button" : undefined}
      onClick={onClick}
      className="flex-1 px-3 py-1 text-center"
      style={{
        background: active === true ? "color-mix(in oklab, var(--color-accent) 18%, transparent)" : "transparent",
        color: "var(--color-ink)",
        borderRight: "1px solid var(--color-ink-muted)",
        cursor: onClick !== undefined ? "pointer" : "default",
        font: "inherit",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </Tag>
  );
}
