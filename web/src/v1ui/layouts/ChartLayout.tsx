import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext.js";
import { useAlmanacIndex } from "../../v1stores/useAlmanacIndex.js";
import { ThemeSelector } from "../ThemeSelector.js";
import { useNavItems, FOOTER_COLOPHON, type NavItem as NavItemT } from "../nav.js";
import { THEMES } from "../../core/themes.js";

/**
 * Aged maritime chart layout.
 *
 *   ╔═══════════════════════════════════════════════════════╗
 *   ║   ⊛                                            ⊛       ║
 *   ║      ╭──── A CHART OF THE THREE-DICE OCEAN ────╮      ║   ← scroll banner masthead
 *   ║      │   surveyed and engraved · MMXXVI         │      ║
 *   ║      ╰────────────────────────────────────────╯      ║
 *   ║   ⊛                                            ⊛       ║
 *   ║                                                       ║
 *   ║   [body cartouche with chart contents]                ║
 *   ║                                                       ║
 *   ║   N - E - S - W   ROUTE BUOYS  for navigation         ║   ← directional nav
 *   ║   ────  EDITION ────                                  ║
 *   ║                                                       ║
 *   ║   compass rose ⊕   bottom-right corner                ║
 *   ╚═══════════════════════════════════════════════════════╝
 */
export const ChartLayout = observer(function ChartLayout({
  children,
}: {
  children: ReactNode;
}) {
  const store = useStore();
  const index = useAlmanacIndex();
  const themeId = store.theme.theme;
  const themeMeta = THEMES[themeId];
  const corner = themeMeta.ornaments.corner ?? "✺";
  const navItems = useNavItems();

  return (
    <div className="min-h-screen w-full">
      <div className="relative mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-16">

        {/* corner ornaments — like cartographic flourishes */}
        <CornerOrnament glyph={corner} pos="tl" />
        <CornerOrnament glyph={corner} pos="tr" />
        <CornerOrnament glyph={corner} pos="bl" />
        <CornerOrnament glyph={corner} pos="br" />

        {/* ── SCROLL BANNER MASTHEAD ──────────────────────────── */}
        <header className="mb-8 px-2 text-center sm:px-4">
          <div className="relative inline-block max-w-full" style={{ padding: "0 clamp(24px, 8vw, 64px)" }}>
            {/* scroll ends — using ▻◅ shapes */}
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "clamp(24px, 6vw, 44px)",
                color: "rgb(var(--ink-300))",
                opacity: 0.6,
              }}
            >
              ❦
            </span>
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "clamp(24px, 6vw, 44px)",
                color: "rgb(var(--ink-300))",
                opacity: 0.6,
              }}
            >
              ❦
            </span>

            <div
              className="font-display"
              style={{
                fontSize: "clamp(2rem, 7vw, 2.75rem)",
                letterSpacing: "0.06em",
                color: "rgb(var(--ink-300))",
                lineHeight: 1.05,
              }}
            >
              A Chart of the Three-Dice Ocean
            </div>
            <div
              className="font-body italic mt-2"
              style={{
                fontSize: "clamp(1.125rem, 4vw, 1.25rem)",
                color: "rgb(var(--support-500))",
                fontFamily: '"Tangerine", "IM Fell English", cursive',
              }}
            >
              surveyed and engraved · {themeMeta.ornaments.mastheadSuffix}
            </div>
            {index.status === "ready" && (
              <div
                className="font-body mt-2"
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgb(var(--ink-200))",
                }}
              >
                · {themeMeta.label} · {new Date(index.value.generatedAt).toISOString().slice(0, 10)} ·
              </div>
            )}
          </div>

          {/* double rule beneath masthead */}
          <div
            className="mx-auto mt-6"
            style={{
              maxWidth: "min(70%, 560px)",
              height: "6px",
              borderTop: "1px solid rgb(var(--ink-300))",
              borderBottom: "1px solid rgb(var(--ink-300))",
            }}
          />
        </header>

        {/* ── BODY CARTOUCHE ────────────────────────────────── */}
        <main className="page-surface" style={{ padding: "clamp(20px, 5vw, 44px) clamp(18px, 6vw, 56px) clamp(24px, 6vw, 56px)", position: "relative" }}>
          {/* inner cartouche border */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "12px",
              border: "1px solid rgb(var(--ink-300))",
              opacity: 0.5,
              pointerEvents: "none",
            }}
          />
          <div className="relative">{children}</div>
        </main>

        {/* ── ROUTE BUOY NAVIGATION ─────────────────────────── */}
        <nav className="mt-10 flex items-end justify-center gap-6 flex-wrap" aria-label="Sections">
          {navItems.map((item, i) => {
            const compass = ["N", "E", "S", "W", "·"][i % 5] ?? "·";
            return <BuoyNav key={item.id} item={item} compass={compass} />;
          })}
        </nav>

        {/* ── FOOTER: edition + stats + colophon w/ compass rose ─ */}
        <footer className="mt-10 grid grid-cols-12 items-end gap-6">
          <div className="col-span-12 lg:col-span-5">
            <div
              className="font-display mb-2"
              style={{
                fontSize: "12px",
                letterSpacing: "0.20em",
                textTransform: "uppercase",
                color: "rgb(var(--support-500))",
              }}
            >
              ✦ select chart edition ✦
            </div>
            <ThemeSelector orientation="horizontal" />
          </div>

          <div className="col-span-12 lg:col-span-3 text-center">
            {index.status === "ready" && (
              <div className="flex items-end justify-center gap-5">
                <Stat label="Soundings" value={index.value.diceTriplesTotal.toLocaleString()} />
                <Stat label="Routes" value={index.value.recordsWritten.toLocaleString()} />
              </div>
            )}
          </div>

          <div className="relative col-span-12 text-left lg:col-span-4 lg:text-right">
            <CompassRose />
            <div
              className="font-display"
              style={{
                fontSize: "13px",
                letterSpacing: "0.20em",
                textTransform: "uppercase",
                color: "rgb(var(--ink-200))",
                marginBottom: "4px",
              }}
            >
              colophon
            </div>
            <div
              className="font-body"
              style={{
                fontSize: "16px",
                color: "rgb(var(--ink-300))",
                fontStyle: "italic",
                fontFamily: '"IM Fell English", "Crimson Text", serif',
              }}
            >
              {FOOTER_COLOPHON[themeId]}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
});

function CornerOrnament({
  glyph,
  pos,
}: {
  glyph: string;
  pos: "tl" | "tr" | "bl" | "br";
}) {
  const style: React.CSSProperties = {
    position: "absolute",
    fontSize: "30px",
    color: "rgb(var(--support-500))",
    opacity: 0.6,
    pointerEvents: "none",
    zIndex: 1,
  };
  switch (pos) {
    case "tl": style.top    = "20px"; style.left  = "30px"; break;
    case "tr": style.top    = "20px"; style.right = "30px"; break;
    case "bl": style.bottom = "20px"; style.left  = "30px"; break;
    case "br": style.bottom = "20px"; style.right = "30px"; break;
  }
  return <div style={style} aria-hidden="true">{glyph}</div>;
}

const BuoyNav = observer(function BuoyNav({
  item,
  compass,
}: {
  item: NavItemT;
  compass: string;
}) {
  const store = useStore();
  const active = store.view === item.id;
  return (
    <button
      type="button"
      onClick={() => store.setView(item.id)}
      title={item.subtitle}
        className="flex flex-col items-center transition-transform hover:-translate-y-1"
      style={{ minWidth: "96px" }}
    >
      {/* the buoy */}
      <span
        className="inline-flex items-center justify-center font-display tabular"
        style={{
          width: "44px",
          height: "44px",
          borderRadius: "9999px",
          background: active ? "rgb(var(--support-500))" : "rgb(var(--accent-500))",
          color: "rgb(var(--paper-50))",
          border: "1.5px solid rgb(var(--ink-500))",
          boxShadow:
            "0 0 0 2px rgb(var(--paper-50)), 0 0 0 3px rgb(var(--ink-500)), 0 6px 0 -3px rgb(var(--ink-300) / 0.5)",
          fontSize: "16px",
          fontWeight: 700,
          marginBottom: "12px",
        }}
      >
        {compass}
      </span>
      <div
        className="font-display"
        style={{
          fontSize: "11px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: active ? "rgb(var(--support-500))" : "rgb(var(--ink-300))",
        }}
      >
        {item.folio} · {item.label}
      </div>
      <div
        className="font-body italic mt-1 max-w-[140px] text-center sm:max-w-[160px]"
        style={{
          fontSize: "13px",
          color: "rgb(var(--ink-200))",
          fontFamily: '"IM Fell English", serif',
        }}
      >
        {item.subtitle}
      </div>
    </button>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="font-display"
        style={{
          fontSize: "11px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgb(var(--support-500))",
        }}
      >
        {label}
      </span>
      <span
        className="font-display tabular leading-none"
        style={{ fontSize: "30px", color: "rgb(var(--ink-300))" }}
      >
        {value}
      </span>
    </div>
  );
}

function CompassRose() {
  // A small inline compass rose using SVG, placed absolutely at the corner.
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      style={{
        position: "absolute",
        top: "-10px",
        right: "0",
        opacity: 0.5,
        color: "rgb(var(--ink-300))",
      }}
      fill="none"
      stroke="currentColor"
      strokeWidth="0.8"
    >
      <circle cx="32" cy="32" r="28" />
      <circle cx="32" cy="32" r="20" />
      <circle cx="32" cy="32" r="2" fill="currentColor" />
      {/* N-S-E-W */}
      <path d="M32 4 L32 60 M4 32 L60 32" />
      {/* NE-SW-NW-SE */}
      <path d="M14 14 L50 50 M14 50 L50 14" strokeOpacity="0.5" />
      {/* N arrow filled */}
      <polygon points="32,4 28,16 32,12 36,16" fill="currentColor" />
      {/* labels */}
      <text x="32" y="3" textAnchor="middle" fontSize="6" fill="currentColor" fontFamily="serif">N</text>
      <text x="61" y="34" textAnchor="middle" fontSize="6" fill="currentColor" fontFamily="serif">E</text>
      <text x="32" y="64" textAnchor="middle" fontSize="6" fill="currentColor" fontFamily="serif">S</text>
      <text x="3"  y="34" textAnchor="middle" fontSize="6" fill="currentColor" fontFamily="serif">W</text>
    </svg>
  );
}
