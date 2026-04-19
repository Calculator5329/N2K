/**
 * ScrapbookLayout — kraft + washi tape + polaroid stack.
 *
 * Tilted polaroid masthead, washi-tape stripe accent, paper-clip on
 * the main page surface, polaroid card nav row at the bottom.
 */
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

export function ScrapbookLayout({ nav, activeId, onNavigate, children, themeId, statsLine }: LayoutProps) {
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--color-bg)" }}>
      <div className="mx-auto max-w-[1300px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-16">
        <header className="mb-10 grid grid-cols-12 items-start gap-6">
          <div
            className="col-span-12 sm:col-span-7 px-6 py-5"
            style={{
              background: "#FAF8F2",
              transform: "rotate(-2.2deg)",
              boxShadow: "8px 8px 0 0 rgba(0,0,0,0.10), 0 4px 24px rgba(0,0,0,0.06)",
              border: "1px solid rgba(0,0,0,0.18)",
              borderRadius: 2,
            }}
          >
            <div className="label-caps mb-1">Vol. III · No. 7</div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2.5rem, 9vw, 4rem)", color: "#2a241c" }}>
              The N2K Scrapbook
            </h1>
          </div>
          <div className="col-span-12 sm:col-span-5 flex items-end justify-end gap-3">
            <span
              style={{
                display: "inline-block",
                width: 80,
                height: 24,
                background: "linear-gradient(45deg, var(--color-accent) 25%, color-mix(in oklab, var(--color-accent) 60%, transparent) 25%)",
                backgroundSize: "10px 10px",
                transform: "rotate(8deg)",
              }}
            />
            <span
              style={{
                display: "inline-block",
                width: 60,
                height: 22,
                background: "color-mix(in oklab, var(--color-ink) 40%, transparent)",
                transform: "rotate(-12deg)",
                opacity: 0.7,
              }}
            />
          </div>
        </header>
        <main
          className="page-surface relative"
          style={{
            transform: "rotate(0.6deg)",
            padding: "clamp(20px, 5vw, 44px)",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -16,
              left: 24,
              width: 24,
              height: 56,
              border: "2px solid var(--color-ink-muted)",
              borderRadius: 12,
              transform: "rotate(-12deg)",
              opacity: 0.6,
            }}
          />
          {children}
        </main>
        <nav className="mt-12 flex items-end justify-center gap-4 flex-wrap">
          {nav.map((item, i) => {
            const active = activeId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className="text-left px-4 py-3"
                style={{
                  width: 130,
                  background: active ? "var(--color-accent)" : "#FAF8F2",
                  color: active ? "var(--color-bg)" : "#2a241c",
                  border: "1px solid rgba(0,0,0,0.18)",
                  boxShadow: "3px 3px 0 0 rgba(0,0,0,0.08)",
                  transform: `rotate(${i % 2 === 0 ? "-3deg" : "3deg"})`,
                  cursor: "pointer",
                  borderRadius: 2,
                }}
              >
                <div className="label-caps mb-1">{item.folio} · ✿</div>
                <div className="font-display text-base lowercase">{item.label}</div>
                <div className="text-[10px] italic opacity-80">{item.subtitle}</div>
              </button>
            );
          })}
        </nav>
        <footer className="mt-8 flex items-center justify-between flex-wrap gap-3">
          <ThemeSelector orientation="discreet" />
          <div className="label-caps">{colophonFor(themeId)}</div>
          {statsLine !== undefined ? <div className="text-[11px] font-mono" style={{ color: "var(--color-ink-muted)" }}>{statsLine}</div> : null}
        </footer>
      </div>
    </div>
  );
}
