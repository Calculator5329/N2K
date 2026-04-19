/**
 * FrameLayout — tarot / ornamental gold frame.
 *
 * Centered narrow column wrapped in a gold double-frame with corner
 * ornaments. Hero title gets a soft gold glow. Nav renders as inline
 * arcana links separated by section markers.
 */
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

export function FrameLayout({ nav, activeId, onNavigate, children, themeId, statsLine }: LayoutProps) {
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--color-bg)" }}>
      <div className="mx-auto py-10 px-4" style={{ maxWidth: 920 }}>
        <div
          className="relative px-8 py-10 lg:px-12 lg:py-12"
          style={{
            border: "1px solid var(--color-accent)",
            boxShadow:
              "inset 0 0 0 4px var(--color-surface), inset 0 0 0 5px color-mix(in oklab, var(--color-accent) 40%, transparent)",
            background: "var(--color-surface)",
          }}
        >
          <CornerOrnaments />
          <header className="text-center mb-6">
            <div className="label-caps" style={{ color: "var(--color-accent)" }}>
              Arcana · {themeId}
            </div>
            <h1
              className="mt-1"
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "clamp(2rem, 6vw, 3rem)",
                color: "var(--color-accent)",
                textShadow: "0 0 22px color-mix(in oklab, var(--color-accent) 45%, transparent)",
                fontWeight: 700,
              }}
            >
              N2K · The Folio
            </h1>
            <p
              className="mt-2 italic"
              style={{ color: "var(--color-ink-muted)", fontFamily: "var(--font-serif)" }}
            >
              Drawn this {new Date().toLocaleDateString(undefined, { dateStyle: "long" })}.
            </p>
            <OrnamentRule />
          </header>
          <main>{children}</main>
          <OrnamentRule />
          <nav className="flex items-center justify-center gap-2 flex-wrap">
            {nav.map((item, i) => (
              <span key={item.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className="px-1 py-1"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: activeId === item.id ? "var(--color-accent)" : "var(--color-ink)",
                    fontFamily: "var(--font-serif)",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  <span style={{ opacity: 0.6, marginRight: 6 }}>{item.folio}</span>
                  {item.label}
                </button>
                {i < nav.length - 1 ? (
                  <span style={{ color: "color-mix(in oklab, var(--color-accent) 50%, transparent)" }}>❦</span>
                ) : null}
              </span>
            ))}
          </nav>
          <div
            className="mt-6 grid grid-cols-2 items-end gap-4 pt-3"
            style={{ borderTop: "1px solid color-mix(in oklab, var(--color-accent) 30%, transparent)" }}
          >
            <ThemeSelector orientation="discreet" />
            <div className="text-right label-caps">
              {statsLine ?? colophonFor(themeId)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrnamentRule() {
  return (
    <div className="my-5 flex items-center justify-center gap-3" style={{ color: "var(--color-accent)" }}>
      <span className="flex-1 h-px" style={{ background: "color-mix(in oklab, var(--color-accent) 50%, transparent)" }} />
      <span>❦</span>
      <span className="flex-1 h-px" style={{ background: "color-mix(in oklab, var(--color-accent) 50%, transparent)" }} />
    </div>
  );
}

function CornerOrnaments() {
  const corner: React.CSSProperties = {
    position: "absolute",
    width: 24,
    height: 24,
    background: "var(--color-surface)",
    color: "var(--color-accent)",
    fontFamily: "var(--font-serif)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
  };
  return (
    <>
      <span style={{ ...corner, top: -12, left: -12 }}>✦</span>
      <span style={{ ...corner, top: -12, right: -12 }}>✦</span>
      <span style={{ ...corner, bottom: -12, left: -12 }}>✦</span>
      <span style={{ ...corner, bottom: -12, right: -12 }}>✦</span>
    </>
  );
}
