/**
 * SidebarLayout — almanac / book-of-reference.
 *
 * Sticky left rail with wordmark + tagline + vertical nav + theme
 * selector + index stats. Right pane is the page surface. The most
 * generic layout — used as the fallback for unknown / unset
 * `style.layout`.
 */
import { Wordmark } from "../primitives/Wordmark.js";
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

export function SidebarLayout({ nav, activeId, onNavigate, children, themeId, statsLine }: LayoutProps) {
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--color-bg)" }}>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-12 lg:py-14">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
          <aside className="lg:col-span-3 lg:sticky lg:top-12 lg:self-start space-y-5">
            <Wordmark size="compact" />
            <p className="label-caps">Bound for the home table</p>
            <div className="divider-hair" />
            <nav className="flex flex-col">
              {nav.map((item) => {
                const active = activeId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    className="group block w-full text-left py-3 pr-4 pl-5 -ml-5"
                    style={{
                      borderLeft: active
                        ? "2px solid var(--color-accent)"
                        : "2px solid transparent",
                      background: active ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div className="flex items-baseline gap-3">
                      <span
                        className="font-mono text-[10px] uppercase tracking-[0.18em] tabular"
                        style={{ color: active ? "var(--color-accent)" : "var(--color-ink-muted)" }}
                      >
                        {item.folio}
                      </span>
                      <span
                        className="font-display"
                        style={{
                          fontSize: 22,
                          fontWeight: 500,
                          color: active ? "var(--color-accent)" : "var(--color-ink)",
                          fontVariationSettings: '"opsz" 60, "SOFT" 30',
                        }}
                      >
                        {item.label}
                      </span>
                    </div>
                    <div
                      className="mt-0.5 ml-7 italic"
                      style={{ fontSize: 12, color: "var(--color-ink-muted)" }}
                    >
                      {item.subtitle}
                    </div>
                  </button>
                );
              })}
            </nav>
            <div className="divider-hair" />
            <ThemeSelector orientation="vertical" />
            {statsLine !== undefined ? (
              <>
                <div className="divider-hair" />
                <div className="space-y-2 text-[12px] font-mono tabular" style={{ color: "var(--color-ink-muted)" }}>
                  {statsLine}
                </div>
              </>
            ) : null}
          </aside>
          <main className="lg:col-span-9">
            <div className="page-surface px-5 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-14">
              {children}
            </div>
            <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono" style={{ color: "var(--color-ink-muted)" }}>
              <span>{colophonFor(themeId)}</span>
              <span>v2 · {themeId}</span>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
