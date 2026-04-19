import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext.js";
import { useAlmanacIndex } from "../../v1stores/useAlmanacIndex.js";
import { ThemeSelector } from "../ThemeSelector.js";
import { useNavItems, FOOTER_COLOPHON, type NavItem as NavItemT } from "../nav.js";
import { THEMES } from "../../core/themes.js";

/**
 * Engineering-drawing layout.
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │  THE N2K ALMANAC                            ── DWG-001 │
 *   │  ─────────────                                          │
 *   │                                                         │
 *   │            (drawing area — content card)                │
 *   │                                                         │
 *   │                                  ┌────────────────────┐ │
 *   │                                  │ ▣  TITLE BLOCK     │ │
 *   │                                  │ ──────────────     │ │
 *   │                                  │ NAV │ EDITION      │ │
 *   │                                  │ STATS │ DATE       │ │
 *   │                                  └────────────────────┘ │
 *   └────────────────────────────────────────────────────────┘
 *
 * The grid background lives on `body` (set via globals.css). Navigation,
 * dataset stats, and the theme selector all live inside the title block
 * — that's where an engineer would look for them on a real drawing.
 */
export const BlueprintLayout = observer(function BlueprintLayout({
  children,
}: {
  children: ReactNode;
}) {
  const store = useStore();
  const index = useAlmanacIndex();
  const themeId = store.theme.theme;
  const themeMeta = THEMES[themeId];

  return (
    <div className="min-h-screen w-full">
      <div className="relative mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">

        {/* ── TOP STRIP: drawing title + DWG number ───────────────── */}
        <div className="mb-6 flex flex-col gap-2 font-mono text-[11px] tracking-wide-caps uppercase sm:flex-row sm:items-baseline sm:justify-between">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-ink-200">
            <span className="text-accent-500">{themeMeta.ornaments.sectionMarker}</span>
            <span className="font-display text-[20px] tracking-[0.04em]">THE N2K ALMANAC</span>
            <span className="text-ink-100">— Almanac Engineering Co.</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-ink-200">
            <span>SCALE 1:1</span>
            <span className="text-ink-100">|</span>
            <span>{themeMeta.ornaments.mastheadSuffix}</span>
            <span className="text-ink-100">|</span>
            <span className="text-accent-500">REV.A</span>
          </div>
        </div>

        {/* Dimension line — a horizontal bar with end ticks */}
        <div className="rule mb-8" />

        {/* ── DRAWING AREA: page card carrying the actual content ── */}
        <main className="page-surface relative px-5 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-12">
          {children}
        </main>

        {/* ── TITLE BLOCK: nav + stats + selector, bottom-right ─── */}
        <div className="mt-6 flex justify-end">
          <TitleBlock />
        </div>

        <footer className="mt-4 flex flex-wrap items-baseline justify-between gap-2 px-2 text-[10px] font-mono uppercase tracking-wide-caps text-ink-100">
          <span>
            DRAWN: N2K {themeMeta.ornaments.sectionMarker} CHK: SOLVER {themeMeta.ornaments.sectionMarker} APP: ALMANAC
          </span>
          <span>
            {index.status === "ready" ? new Date(index.value.generatedAt).toISOString().slice(0, 10) : "—"}
            <span className="mx-2">{themeMeta.ornaments.sectionMarker}</span>
            {FOOTER_COLOPHON[themeId]}
          </span>
        </footer>
      </div>
    </div>
  );
});

const TitleBlock = observer(function TitleBlock() {
  const store = useStore();
  const index = useAlmanacIndex();
  const themeId = store.theme.theme;
  const themeMeta = THEMES[themeId];
  const navItems = useNavItems();

  return (
    <div
      className="w-full max-w-[560px] font-mono text-[11px] tracking-wide-caps uppercase text-ink-300"
      style={{
        border: "1px solid rgb(var(--ink-200))",
        background: "rgb(var(--paper-100) / 0.85)",
      }}
    >
      {/* Title row */}
      <div
        className="flex items-baseline justify-between px-3 py-1.5"
        style={{ borderBottom: "1px solid rgb(var(--ink-200))" }}
      >
        <span className="text-accent-500">⊕ TITLE BLOCK</span>
        <span className="text-ink-100">SHEET 1 / 1</span>
      </div>

      {/* Nav row */}
      <div
        className="flex"
        style={{ borderBottom: "1px solid rgb(var(--ink-200))" }}
      >
        {navItems.map((item, i) => (
          <NavCell
            key={item.id}
            item={item}
            divider={i < navItems.length - 1}
          />
        ))}
      </div>

      {/* Edition + stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-12">
        <div
          className="px-3 py-2 sm:col-span-5"
          style={{ borderRight: "1px solid rgb(var(--ink-200))", borderBottom: "1px solid rgb(var(--ink-200))" }}
        >
          <div className="text-ink-100 text-[9px] mb-1">EDITION</div>
          <ThemeSelector orientation="horizontal" />
        </div>
        <div
          className="flex flex-col justify-center px-3 py-2 sm:col-span-3"
          style={{ borderRight: "1px solid rgb(var(--ink-200))", borderBottom: "1px solid rgb(var(--ink-200))" }}
        >
          <div className="text-ink-100 text-[9px] mb-1">DATE</div>
          <div className="text-ink-300 text-[12px]">
            {index.status === "ready" ? new Date(index.value.generatedAt).toISOString().slice(0, 10) : "—"}
          </div>
          <div className="text-ink-100 text-[9px] mt-2">DWG NO.</div>
          <div className="text-accent-500 text-[12px]">{themeMeta.ornaments.mastheadSuffix}</div>
        </div>
        <div className="px-3 py-2 sm:col-span-4">
          <div className="text-ink-100 text-[9px] mb-1">DATASET</div>
          {index.status === "ready" ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
              <span className="text-ink-100">TRIPLES</span><span className="text-ink-300 text-right">{index.value.diceTriplesTotal.toLocaleString()}</span>
              <span className="text-ink-100">RECORDS</span><span className="text-ink-300 text-right">{index.value.recordsWritten.toLocaleString()}</span>
              <span className="text-ink-100">TARGETS</span><span className="text-ink-300 text-right">{index.value.totalMin}–{index.value.totalMax}</span>
            </div>
          ) : (
            <div className="text-[10px] text-ink-100">loading…</div>
          )}
        </div>
      </div>
    </div>
  );
});

const NavCell = observer(function NavCell({
  item,
  divider,
}: {
  item: NavItemT;
  divider: boolean;
}) {
  const store = useStore();
  const active = store.view === item.id;
  return (
    <button
      type="button"
      onClick={() => store.setView(item.id)}
      className={[
        "flex-1 px-3 py-2 text-left transition-colors min-w-0",
        active ? "bg-accent-500 text-paper-50" : "hover:bg-paper-200/60 text-ink-300",
      ].join(" ")}
      style={{
        borderRight: divider ? "1px solid rgb(var(--ink-200))" : undefined,
      }}
    >
      <div className="text-[9px] text-ink-100" style={{ color: active ? "rgb(var(--paper-50) / 0.7)" : undefined }}>
        {item.folio}
      </div>
      <div className="text-[12px] font-display">{item.label.toUpperCase()}</div>
    </button>
  );
});
