/**
 * ReceiptLayout — narrow thermal receipt slip.
 *
 * Centered single-column ~560px wide, dashed perforations top + bottom,
 * inline tab nav, totals, theme picker.
 */
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

export function ReceiptLayout({ nav, activeId, onNavigate, children, themeId, statsLine }: LayoutProps) {
  return (
    <div className="min-h-screen w-full py-8 lg:py-12" style={{ background: "var(--color-bg)" }}>
      <div
        className="mx-auto"
        style={{
          maxWidth: 560,
          background: "var(--color-surface)",
          boxShadow: "var(--shadow-card, 0 6px 18px rgba(0,0,0,0.12))",
        }}
      >
        <Perforation />
        <div className="px-7 py-6">
          <header className="text-center mb-3">
            <div className="label-caps">N2K Almanac · Receipt</div>
            <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 22, letterSpacing: "0.04em" }}>
              N2K · {themeId.toUpperCase()}
            </h1>
            <div className="font-mono text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              REG #007 · {new Date().toISOString().slice(0, 10)}
            </div>
          </header>
          <DashedRule />
          <main className="my-4">{children}</main>
          <DashedRule />
          <nav className="my-4 flex items-center justify-between gap-1 flex-wrap">
            {nav.map((item) => {
              const active = activeId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className="px-2 py-1"
                  style={{
                    background: active ? "var(--color-ink)" : "transparent",
                    color: active ? "var(--color-bg)" : "var(--color-ink)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 9, opacity: 0.6, marginRight: 4 }}>{item.folio}</span>
                  {item.label}
                </button>
              );
            })}
          </nav>
          <DashedRule />
          {statsLine !== undefined ? (
            <div className="my-3 font-mono text-[12px] uppercase tracking-[0.18em]" style={{ color: "var(--color-ink-muted)" }}>
              {statsLine}
            </div>
          ) : null}
          <div className="my-4 font-mono text-[12px] uppercase tracking-[0.18em] flex justify-between" style={{ color: "var(--color-accent)" }}>
            <span>GRAND TOTAL</span>
            <span>∞</span>
          </div>
          <div className="flex justify-between items-center mt-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--color-accent)" }}>
              ★ RETAIN FOR YOUR RECORDS
            </span>
            <ThemeSelector orientation="discreet" />
          </div>
          <footer className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--color-ink-muted)" }}>
            {colophonFor(themeId)}
          </footer>
        </div>
        <Perforation />
      </div>
    </div>
  );
}

function DashedRule() {
  return <div className="dashed-rule my-2" />;
}

function Perforation() {
  return (
    <div className="flex items-center justify-center text-xs px-4 py-1" style={{ color: "var(--color-ink-muted)" }}>
      <span>✂</span>
      <span className="dashed-rule" style={{ flex: 1, marginLeft: 8, marginRight: 8 }} />
      <span>✂</span>
    </div>
  );
}
