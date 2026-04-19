/**
 * BoardLayout — vintage tabletop game-box frame.
 *
 * Outer navy "metal" frame with hard offset shadow, hairline inset,
 * four CSS L-corner brackets (no SVG), inner butter-paper card with a
 * dashed inner ring, masthead with hero serifs, board-tile nav, and a
 * colophon footer that mimics the back of a game box.
 */
import { Wordmark } from "../primitives/Wordmark.js";
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

export function BoardLayout({ nav, activeId, onNavigate, children, themeId, statsLine }: LayoutProps) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden" style={{ background: "var(--color-bg)" }}>
      <div className="board-layout-wrap mx-auto max-w-[1300px] px-3 py-6 sm:px-6 sm:py-10 lg:px-10 lg:py-14">
        <div className="board-layout-frame relative p-[10px] sm:p-[14px] lg:p-[16px]">
          <div className="absolute inset-1 pointer-events-none" style={{ border: "1px solid rgba(255,255,255,0.32)" }} />
          <div className="absolute inset-2 pointer-events-none" style={{ border: "1px solid rgba(255,255,255,0.10)" }} />
          <Brackets />
          <div className="board-layout-card relative px-3 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
            <div className="absolute inset-2 pointer-events-none" style={{ border: "1px dashed rgba(0,0,0,0.12)" }} />
            <Masthead statsLine={statsLine} />
            <div className="board-layout-rule my-4" />
            <nav className="my-4 sm:my-5 flex items-stretch gap-1.5 sm:gap-2 flex-wrap">
              {nav.map((item) => {
                const active = activeId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    className="px-3 py-2 text-left flex flex-col gap-0.5"
                    style={{
                      background: active ? "var(--color-ink)" : "var(--color-surface)",
                      color: active ? "var(--color-bg)" : "var(--color-ink)",
                      border: "1px solid var(--color-ink)",
                      boxShadow: active ? "1px 1px 0 0 var(--color-ink)" : "3px 3px 0 0 var(--color-accent)",
                      transform: active ? "translate(2px, 2px)" : "none",
                      transition: "transform 80ms ease, box-shadow 80ms ease",
                      cursor: "pointer",
                      minWidth: 96,
                    }}
                  >
                    <span className="font-mono text-[10px] tracking-[0.18em] uppercase">{item.folio}</span>
                    <span className="font-display text-sm font-semibold">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="board-layout-rule my-4" />
            <main className="my-5 sm:my-6 min-w-0">
              <div className="page-surface px-4 py-5 sm:px-7 sm:py-8 lg:px-10 lg:py-10 min-w-0">
                {children}
              </div>
            </main>
            <div className="board-layout-rule my-4" />
            <footer className="mt-4 sm:mt-5 grid grid-cols-12 gap-3 sm:gap-4 items-start sm:items-center">
              <div className="col-span-12 sm:col-span-4 text-left">
                <Stamp themeId={themeId} />
              </div>
              <div className="col-span-12 sm:col-span-4 text-center label-caps">
                {colophonFor(themeId)}
              </div>
              <div className="col-span-12 sm:col-span-4 flex justify-end">
                <ThemeSelector orientation="discreet" />
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Masthead({ statsLine }: { readonly statsLine: string | undefined }) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3">
      <div>
        <div className="label-caps mb-2" style={{ color: "var(--color-accent)" }}>
          The N2K Almanac · Tabletop Edition
        </div>
        <div style={{ color: "var(--color-ink)" }}>
          <Wordmark size="default" suffix="Almanac" />
        </div>
      </div>
      {statsLine !== undefined ? (
        <div className="hidden sm:flex flex-col gap-1 text-right label-caps" style={{ color: "var(--color-ink-muted)" }}>
          {statsLine}
        </div>
      ) : null}
    </div>
  );
}

function Stamp({ themeId }: { readonly themeId: string }) {
  return (
    <div
      className="inline-block px-3 py-2"
      style={{
        border: "2px solid var(--color-accent)",
        borderRadius: 2,
        color: "var(--color-accent)",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        transform: "rotate(-2deg)",
      }}
    >
      ★ Patent · {themeId} · No. 1300
    </div>
  );
}

function Brackets() {
  // Four CSS-only L-brackets at the corners of the frame, no SVG.
  const common: React.CSSProperties = {
    position: "absolute",
    width: 22,
    height: 22,
    pointerEvents: "none",
  };
  return (
    <>
      <span style={{ ...common, top: -2, left: -2, borderTop: "3px solid var(--color-ink)", borderLeft: "3px solid var(--color-ink)" }} />
      <span style={{ ...common, top: -2, right: -2, borderTop: "3px solid var(--color-ink)", borderRight: "3px solid var(--color-ink)" }} />
      <span style={{ ...common, bottom: -2, left: -2, borderBottom: "3px solid var(--color-ink)", borderLeft: "3px solid var(--color-ink)" }} />
      <span style={{ ...common, bottom: -2, right: -2, borderBottom: "3px solid var(--color-ink)", borderRight: "3px solid var(--color-ink)" }} />
    </>
  );
}
