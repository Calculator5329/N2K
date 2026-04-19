/**
 * TopbarLayout — broadsheet / arcade HUD.
 *
 * Wide masthead bar, hairline rule, horizontal underline tabs, page
 * surface body, plain footer. The accent shifts are entirely in the
 * theme tokens — this layout doesn't switch on `themeId`.
 */
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

export function TopbarLayout({ nav, activeId, onNavigate, children, themeId, statsLine }: LayoutProps) {
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--color-bg)" }}>
      <header className="border-b" style={{ borderColor: "var(--color-rule)", background: "var(--color-surface)" }}>
        <div className="mx-auto max-w-[1400px] px-4 pt-4 pb-2 sm:px-6 lg:px-12 lg:pt-6">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <h1
              style={{
                fontFamily: "var(--font-serif)",
                color: "var(--color-ink)",
                lineHeight: 1,
                fontSize: "clamp(2.5rem, 9vw, 3.875rem)",
                letterSpacing: "-0.02em",
                fontWeight: 700,
              }}
            >
              The N2K Almanac
            </h1>
            <div className="flex items-center gap-4">
              {statsLine !== undefined ? (
                <div
                  className="hidden md:flex font-mono tabular text-[11px]"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  {statsLine}
                </div>
              ) : null}
              <ThemeSelector orientation="discreet" />
            </div>
          </div>
          <div className="divider-hair mt-5 mb-3" />
          <nav className="flex items-baseline gap-1 flex-wrap pb-2">
            {nav.map((item) => {
              const active = activeId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className="inline-flex items-baseline gap-2 px-3 py-2"
                  style={{
                    background: "transparent",
                    border: "none",
                    borderBottom: active ? "2px solid var(--color-accent)" : "2px solid transparent",
                    color: active ? "var(--color-ink)" : "var(--color-ink-muted)",
                    cursor: "pointer",
                  }}
                >
                  <span className="font-mono text-[10px] tracking-[0.18em] uppercase">{item.folio}</span>
                  <span className="font-display text-[18px]">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-12 lg:py-12">
        <div className="page-surface px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-12">
          {children}
        </div>
        <footer className="mt-6 text-[11px] font-mono" style={{ color: "var(--color-ink-muted)" }}>
          {colophonFor(themeId)}
        </footer>
      </main>
    </div>
  );
}
