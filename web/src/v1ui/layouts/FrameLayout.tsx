import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext.js";
import { useAlmanacIndex } from "../../v1stores/useAlmanacIndex.js";
import { ThemeSelector } from "../ThemeSelector.js";
import { useNavItems, FOOTER_COLOPHON, type NavItem as NavItemT } from "../nav.js";
import { THEMES } from "../../core/themes.js";

/**
 * Mystic / tarot-card layout.
 *
 *   ❖ ─────────────────────────── ❖
 *   ✦  THE N2K ALMANAC            ✦
 *   ✦  Arcanum I · 2026.04.18     ✦
 *   ✦  ─────────────              ✦
 *   ✦                             ✦
 *   ✦  centered narrow body card  ✦
 *   ✦                             ✦
 *   ✦  I · II · III · IV          ✦
 *   ❖ ─────────────────────────── ❖
 *
 * A single decorative frame surrounds an ornate centered card containing
 * the active section. The masthead reads like an arcana title; the
 * navigation lives inside the bottom of the frame as a horizontal row of
 * roman numerals separated by ornamental glyphs.
 */
export const FrameLayout = observer(function FrameLayout({
  children,
}: {
  children: ReactNode;
}) {
  const store = useStore();
  const index = useAlmanacIndex();
  const themeId = store.theme.theme;
  const themeMeta = THEMES[themeId];
  const corner = themeMeta.ornaments.corner ?? themeMeta.ornaments.sectionMarker;
  const navItems = useNavItems();

  return (
    <div className="min-h-screen w-full">
      <div className="mx-auto px-6 py-10 lg:py-14" style={{ maxWidth: "920px" }}>

        {/* ── Outer ornamental frame ──────────────────────────────── */}
        <div
          className="relative px-8 py-10 lg:px-12 lg:py-12"
          style={{
            border: "1px solid rgb(var(--accent-500))",
            boxShadow:
              "inset 0 0 0 4px rgb(var(--paper-50)), inset 0 0 0 5px rgb(var(--accent-500) / 0.4)",
          }}
        >
          {/* corner ornaments */}
          <CornerOrnament glyph={corner} pos="tl" />
          <CornerOrnament glyph={corner} pos="tr" />
          <CornerOrnament glyph={corner} pos="bl" />
          <CornerOrnament glyph={corner} pos="br" />

          {/* ── Masthead ─────────────────────────────────────────── */}
          <header className="text-center mb-6">
            <div className="font-display label-caps text-accent-500 mb-3">
              ✦  {themeMeta.ornaments.mastheadSuffix}  ✦
            </div>
            <h1
              className="font-display"
              style={{
                fontSize: "44px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                lineHeight: 1.1,
                color: "rgb(var(--accent-500))",
                textTransform: "uppercase",
                textShadow: "0 0 22px rgba(212, 162, 76, 0.45)",
              }}
            >
              The N2K Almanac
            </h1>
            <div className="font-body italic text-ink-200 mt-2 text-[14px]">
              {themeMeta.tagline}
              {index.status === "ready" && (
                <>
                  <span className="mx-2 text-accent-500">{themeMeta.ornaments.sectionMarker}</span>
                  {new Date(index.value.generatedAt).toISOString().slice(0, 10)}
                </>
              )}
            </div>

            {/* Ornament rule */}
            <div className="my-5 flex items-center justify-center gap-3 text-accent-500">
              <span className="flex-1 h-px bg-accent-500/50" />
              <span style={{ fontSize: "18px" }}>{themeMeta.ornaments.sectionMarker}</span>
              <span className="flex-1 h-px bg-accent-500/50" />
            </div>
          </header>

          {/* ── Body card ────────────────────────────────────────── */}
          <main>{children}</main>

          {/* ── Bottom: arcane navigation ────────────────────────── */}
          <div className="my-6 flex items-center justify-center gap-3 text-accent-500">
            <span className="flex-1 h-px bg-accent-500/50" />
            <span style={{ fontSize: "18px" }}>{themeMeta.ornaments.sectionMarker}</span>
            <span className="flex-1 h-px bg-accent-500/50" />
          </div>

          <nav
            aria-label="Sections"
            className="flex items-center justify-center gap-2 flex-wrap"
          >
            {navItems.map((item, i) => (
              <span key={item.id} className="flex items-center gap-2">
                <ArcanaLink item={item} />
                {i < navItems.length - 1 && (
                  <span className="text-accent-500">{themeMeta.ornaments.sectionMarker}</span>
                )}
              </span>
            ))}
          </nav>

          {/* ── Edition selector + colophon ──────────────────────── */}
          <div className="mt-8 pt-6 border-t border-accent-500/30 grid grid-cols-2 gap-6 items-end">
            <ThemeSelector orientation="horizontal" />
            {index.status === "ready" && (
              <div className="font-body italic text-[12px] text-ink-200 text-right space-y-0.5">
                <div>
                  <span className="text-ink-100">{index.value.diceTriplesTotal.toLocaleString()} triples</span>
                  <span className="text-accent-500/60 mx-1.5">·</span>
                  <span className="text-ink-100">{index.value.recordsWritten.toLocaleString()} records</span>
                </div>
                <div>{FOOTER_COLOPHON[themeId]}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

const ArcanaLink = observer(function ArcanaLink({ item }: { item: NavItemT }) {
  const store = useStore();
  const active = store.view === item.id;
  return (
    <button
      type="button"
      onClick={() => store.setView(item.id)}
      title={item.subtitle}
      className={[
        "inline-flex items-baseline gap-1.5 px-3 py-1.5 transition-colors font-display",
        active ? "text-paper-50 bg-accent-500" : "text-accent-500 hover:bg-accent-500/15",
      ].join(" ")}
      style={{
        fontSize: "13px",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        borderRadius: "1px",
      }}
    >
      <span className="text-[10px] opacity-80">{item.folio}</span>
      <span>{item.label}</span>
    </button>
  );
});

function CornerOrnament({
  glyph,
  pos,
}: {
  glyph: string;
  pos: "tl" | "tr" | "bl" | "br";
}) {
  const positionStyle: React.CSSProperties = {
    position: "absolute",
    color: "rgb(var(--accent-500))",
    fontSize: "20px",
    lineHeight: 1,
    background: "rgb(var(--paper-50))",
    padding: "0 6px",
    pointerEvents: "none",
  };
  switch (pos) {
    case "tl": positionStyle.top = "-12px"; positionStyle.left = "16px"; break;
    case "tr": positionStyle.top = "-12px"; positionStyle.right = "16px"; break;
    case "bl": positionStyle.bottom = "-12px"; positionStyle.left = "16px"; break;
    case "br": positionStyle.bottom = "-12px"; positionStyle.right = "16px"; break;
  }
  return <span style={positionStyle}>{glyph}</span>;
}
