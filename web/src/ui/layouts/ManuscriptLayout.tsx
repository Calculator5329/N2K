/**
 * ManuscriptLayout — illuminated codex.
 *
 * Three-column grid: left folio rail (vertical nav), center page,
 * right marginalia (theme picker + stats). Title gets the layered
 * gold-leaf shadow.
 */
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

export function ManuscriptLayout({ nav, activeId, onNavigate, children, themeId, statsLine }: LayoutProps) {
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--color-bg)" }}>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-14">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">
          <aside className="order-2 lg:order-none lg:col-span-2 lg:sticky lg:top-10 lg:self-start">
            <div className="label-caps mb-3">Folios</div>
            <div className="flex flex-wrap lg:flex-col gap-1.5">
              {nav.map((item) => {
                const active = activeId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    className="px-3 py-2 text-left flex items-baseline gap-2"
                    style={{
                      background: active ? "color-mix(in oklab, var(--color-accent) 18%, transparent)" : "transparent",
                      border: active ? "1px solid var(--color-accent)" : "1px solid transparent",
                      color: active ? "var(--color-accent)" : "var(--color-ink)",
                      cursor: "pointer",
                      borderRadius: 2,
                    }}
                  >
                    <span className="font-mono text-[11px] tracking-[0.18em]">{item.folio}</span>
                    <span className="font-display text-base">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </aside>
          <main className="order-1 lg:col-span-8">
            <header className="mb-6">
              <div className="label-caps">The N2K Almanac · Manuscript Edition</div>
              <h1
                className="mt-2"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: "clamp(2.75rem, 11vw, 4.875rem)",
                  lineHeight: 0.9,
                  color: "var(--color-accent)",
                  textShadow: "1px 1px 0 var(--color-ink), 2px 2px 0 color-mix(in oklab, var(--color-accent) 55%, transparent)",
                  fontWeight: 700,
                }}
              >
                Numerus &amp; Triplices
              </h1>
              <div className="divider-hair mt-3" />
            </header>
            <div className="page-surface px-5 py-6 sm:px-8 sm:py-8 lg:px-16 lg:py-14">
              {children}
            </div>
            <footer
              className="mt-4 flex flex-wrap items-center justify-between gap-3 italic"
              style={{ color: "var(--color-ink-muted)", fontFamily: "var(--font-serif)" }}
            >
              <span>{colophonFor(themeId)}</span>
              {statsLine !== undefined ? <span>{statsLine}</span> : null}
            </footer>
          </main>
          <aside className="order-3 lg:col-span-2 lg:sticky lg:top-10 lg:self-start space-y-3">
            <div className="label-caps">Editiones</div>
            <ThemeSelector orientation="vertical" />
            <div className="divider-hair" />
            {statsLine !== undefined ? (
              <div className="text-xs italic" style={{ color: "var(--color-ink-muted)" }}>
                {statsLine}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
