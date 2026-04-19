/**
 * PanelsLayout — silver-age comic.
 *
 * Splash header panel + nav grid of comic panels + page surface +
 * footer panel. Bold black borders + offset hard shadows give the
 * comic-book stamp.
 */
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

export function PanelsLayout({ nav, activeId, onNavigate, children, themeId, statsLine }: LayoutProps) {
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--color-bg)" }}>
      <div className="mx-auto max-w-[1300px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-14">
        <Panel accent>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <h1
              style={{
                fontFamily: "var(--font-serif)",
                color: "#fff",
                fontSize: "clamp(2.25rem, 8vw, 3.5rem)",
                textShadow: "4px 4px 0 var(--color-ink)",
                fontWeight: 800,
                textTransform: "uppercase",
              }}
            >
              N2K · Issue {Math.max(1, nav.length)}
            </h1>
            <span className="splat-badge">!Pow{statsLine !== undefined ? "!" : "!"}</span>
          </div>
        </Panel>
        <nav className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {nav.map((item) => {
            const active = activeId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                style={{
                  background: active ? "color-mix(in oklab, var(--color-accent) 80%, white 10%)" : "var(--color-surface)",
                  color: active ? "#fff" : "var(--color-ink)",
                  border: "3px solid var(--color-ink)",
                  boxShadow: active ? "3px 3px 0 0 var(--color-ink)" : "5px 5px 0 0 var(--color-accent)",
                  padding: "clamp(14px,4vw,20px) clamp(16px,5vw,24px)",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "transform 80ms ease",
                  transform: active ? "translate(2px,2px)" : "none",
                }}
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.18em]">Panel {item.folio}</div>
                <div
                  className="font-display"
                  style={{ fontSize: 22, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}
                >
                  {item.label}!
                </div>
              </button>
            );
          })}
        </nav>
        <main className="mt-6 page-surface px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-12">
          {children}
        </main>
        <Panel className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <ThemeSelector orientation="discreet" />
            {statsLine !== undefined ? <div className="label-caps">{statsLine}</div> : null}
            <div className="font-display text-base">{colophonFor(themeId)}</div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ accent, className, children }: { readonly accent?: boolean; readonly className?: string; readonly children: React.ReactNode }) {
  return (
    <div
      className={className}
      style={{
        background: accent === true ? "var(--color-accent)" : "var(--color-surface)",
        color: accent === true ? "#fff" : "var(--color-ink)",
        border: "3px solid var(--color-ink)",
        boxShadow: "5px 5px 0 0 var(--color-ink)",
        padding: "clamp(14px,4vw,20px) clamp(16px,5vw,24px)",
      }}
    >
      {children}
    </div>
  );
}
