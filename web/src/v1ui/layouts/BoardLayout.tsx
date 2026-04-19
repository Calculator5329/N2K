import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext.js";
import { useAlmanacIndex } from "../../v1stores/useAlmanacIndex.js";
import { ThemeSelector } from "../ThemeSelector.js";
import { useNavItems, FOOTER_COLOPHON, type NavItem as NavItemT } from "../nav.js";
import { THEMES, type Theme } from "../../core/themes.js";

/**
 * Vintage board-game layout — modeled on the original N2K box art.
 *
 *   ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 *   ┃▙ ┌────────────────────────────┐ ▟┃   ← navy "metal" frame, white
 *   ┃  │       N 2 K                │  ┃     inset hairline, true L-shape
 *   ┃  │       THE ALMANAC          │  ┃     corner brackets that punch
 *   ┃  │  ────────────────────────  │  ┃     outside the frame
 *   ┃  │  [white play card with     │  ┃
 *   ┃  │   the active section]      │  ┃
 *   ┃  │  ────────────────────────  │  ┃
 *   ┃  │  [LOOKUP] [EXPLORE] ...    │  ┃
 *   ┃▜ │                            │ ▛┃
 *   ┃  └────────────────────────────┘  ┃
 *   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
 *
 * Design notes:
 *   - The chrome is the page boundary; there is no shadow on the inner
 *     play surface (it lives *inside* the frame).
 *   - Padding, type scale, corner-bracket size, stats panel, and nav
 *     tiles all scale across `sm:` (640px) and `lg:` (1024px) so the
 *     box reads correctly from a phone all the way to a 4K monitor.
 *   - The footer carries a discreet edition switcher and a small
 *     "patent" stamp, in the spirit of a real game-box back panel.
 */
export const BoardLayout = observer(function BoardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const store = useStore();
  const index = useAlmanacIndex();
  const themeId = store.theme.theme;
  const themeMeta = THEMES[themeId];
  const navItems = useNavItems();

  return (
    // overflow-x-hidden on the very outer wrapper guarantees that an
    // accidentally-wide chart inside `children` can never break the
    // navy frame at narrow widths — it'll scroll inside its own card
    // (each chart owner is responsible for its own overflow handling),
    // and the chrome itself stays pristine.
    <div className="min-h-screen w-full overflow-x-hidden">
      <div className="board-layout-wrap mx-auto max-w-[1300px] px-3 py-6 sm:px-6 sm:py-10 lg:px-10 lg:py-14">

        {/* ── Outer NAVY FRAME with corner brackets ───────────────────
            `board-layout-frame` lets the print stylesheet strip the
            navy fill, the inset shadows, and the corner brackets so
            the printed sheet is just ink on paper. */}
        <div
          className="board-layout-frame relative p-[10px] sm:p-[14px] lg:p-[16px]"
          style={{
            background: "rgb(var(--accent-500))",
            border: "2px solid rgb(var(--ink-500))",
            boxShadow:
              "6px 6px 0 0 rgba(0, 0, 0, 0.20)," +
              "inset 0 0 0 1px rgba(255, 255, 255, 0.06)",
          }}
        >
          {/* white inset hairline (the "metal" highlight on the frame) */}
          <div
            className="no-print pointer-events-none absolute inset-[3px] sm:inset-[4px] lg:inset-[5px]"
            style={{ border: "1px solid rgba(255, 255, 255, 0.32)" }}
          />
          {/* second, finer inset (the brass channel) */}
          <div
            className="no-print pointer-events-none absolute inset-[6px] sm:inset-[7px] lg:inset-[9px]"
            style={{ border: "1px solid rgba(255, 255, 255, 0.10)" }}
          />

          {/* True L-shaped corner brackets — chrome-only, suppressed on print. */}
          <div className="no-print contents">
            <CornerBracket pos="tl" />
            <CornerBracket pos="tr" />
            <CornerBracket pos="bl" />
            <CornerBracket pos="br" />
          </div>

          {/* ── Inner butter-yellow play surface ─────────────────── */}
          <div
            className="board-layout-card relative px-3 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-9"
            style={{
              background: "rgb(var(--paper-50))",
              border: "1px solid rgb(var(--ink-500))",
            }}
          >
            {/* Faint dashed registration ring on the play surface. */}
            <div
              className="no-print pointer-events-none absolute inset-[6px] hidden sm:block"
              style={{ border: "1px dashed rgba(0, 0, 0, 0.12)" }}
            />

            {/* ── Masthead row — screen-only ─────────────────── */}
            <div className="no-print">
              <Masthead themeMeta={themeMeta} index={index} />
              <BoardRule />

              <nav
                aria-label="Sections"
                className="my-4 sm:my-5 flex items-stretch gap-1.5 sm:gap-2 flex-wrap"
              >
                {navItems.map((item) => (
                  <BoardNavTile key={item.id} item={item} />
                ))}
              </nav>

              <BoardRule />
            </div>

            {/* ── Body ─────────────────────────────────────────── */}
            <main className="my-5 sm:my-6 min-w-0">
              <div className="page-surface px-4 py-5 sm:px-7 sm:py-8 lg:px-10 lg:py-10 min-w-0">
                {children}
              </div>
            </main>

            {/* ── Box-back footer: screen-only ─────────────────── */}
            <div className="no-print">
              <BoardRule />
              <footer className="mt-4 sm:mt-5 grid grid-cols-12 gap-3 sm:gap-4 items-start sm:items-center">
                <div className="col-span-12 sm:col-span-4 flex sm:block justify-center">
                  <PatentStamp themeMeta={themeMeta} />
                </div>

                <div className="col-span-12 sm:col-span-4 text-center text-[11px] font-body text-ink-300 leading-snug">
                  <div className="font-display uppercase text-accent-500 tracking-[0.16em] text-[10px] mb-1">
                    Colophon
                  </div>
                  <div>{FOOTER_COLOPHON[themeId]}</div>
                </div>

                <div className="col-span-12 sm:col-span-4 flex justify-center sm:justify-end">
                  <ThemeSelector orientation="discreet" />
                </div>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Masthead — wordmark + edition meta + score panel.
//  At <640px the score panel is hidden (it's a duplicate of the index totals
//  reported by every other view); the wordmark itself shrinks proportionally.
// ---------------------------------------------------------------------------
const Masthead = observer(function Masthead({
  themeMeta,
  index,
}: {
  themeMeta: Theme;
  index: ReturnType<typeof useStore>["data"]["index"];
}) {
  return (
    <header className="relative mb-4 sm:mb-5 flex items-end justify-between gap-4 sm:gap-6 flex-wrap">
      <div className="min-w-0">
        {/* Big "N2K" wordmark — the box-art lockup */}
        <div
          className="font-display flex items-baseline gap-2 sm:gap-3 leading-none"
          style={{ color: "rgb(var(--accent-500))" }}
        >
          <span className="text-[52px] sm:text-[68px] lg:text-[84px]" style={{ letterSpacing: "-0.02em" }}>
            N2K
          </span>
          <span
            className="text-support-500 text-[18px] sm:text-[24px] lg:text-[30px]"
            style={{ letterSpacing: "-0.01em" }}
          >
            THE ALMANAC
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2 sm:gap-3 label-caps text-accent-500 text-[10px] sm:text-[12px] flex-wrap">
          <span>{themeMeta.label} Edition</span>
          <span className="text-accent-500/40">{themeMeta.ornaments.sectionMarker}</span>
          <span>{themeMeta.ornaments.mastheadSuffix}</span>
          {index.status === "ready" && (
            <>
              <span className="text-accent-500/40">{themeMeta.ornaments.sectionMarker}</span>
              <span>{new Date(index.value.generatedAt).toISOString().slice(0, 10)}</span>
            </>
          )}
        </div>
      </div>

      {/* Stats — like the score panel on a board. Hidden on <640px so the
          wordmark gets the entire row. */}
      {index.status === "ready" && (
        <div className="hidden sm:flex items-end gap-3 lg:gap-4">
          <Stat label="Triples" value={index.value.diceTriplesTotal.toLocaleString()} />
          <Stat label="Records" value={index.value.recordsWritten.toLocaleString()} />
          <Stat label="Targets" value={`${index.value.totalMin}-${index.value.totalMax}`} />
        </div>
      )}
    </header>
  );
});

// ---------------------------------------------------------------------------
//  CornerBracket — true L-shape sitting on the corner of the navy frame.
//  Built from two solid bars in CSS so it stays crisp at any DPR and works
//  without an SVG dependency. The white inset is a thinner pair of bars
//  laid on top, mimicking the "metal" highlight of a steamer-trunk corner.
//
//  Sizes scale across breakpoints so the bracket stays proportional to the
//  outer page padding (`px-3` mobile / `px-6` tablet / `px-10` desktop) and
//  never clips against the viewport edge.
// ---------------------------------------------------------------------------
function CornerBracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const inkColor = "rgb(var(--ink-500))";
  const fillColor = "rgb(var(--accent-500))";
  const highlight = "rgba(255, 255, 255, 0.42)";

  // Each variant is `[size, thickness, offset]` in px, picked at the
  // matching Tailwind breakpoint via inline data attributes; we render
  // three absolutely-positioned wrappers and toggle them via CSS.
  const variants = [
    { cls: "block sm:hidden",         size: 22, thick: 6, off: -8  },
    { cls: "hidden sm:block lg:hidden", size: 28, thick: 7, off: -9 },
    { cls: "hidden lg:block",         size: 32, thick: 8, off: -10 },
  ];

  return (
    <>
      {variants.map((v, i) => (
        <CornerBracketBox
          key={i}
          pos={pos}
          size={v.size}
          thickness={v.thick}
          offset={v.off}
          ink={inkColor}
          fill={fillColor}
          highlight={highlight}
          className={v.cls}
        />
      ))}
    </>
  );
}

function CornerBracketBox({
  pos,
  size,
  thickness,
  offset,
  ink,
  fill,
  highlight,
  className,
}: {
  pos: "tl" | "tr" | "bl" | "br";
  size: number;
  thickness: number;
  offset: number;
  ink: string;
  fill: string;
  highlight: string;
  className: string;
}) {
  const wrapper: React.CSSProperties = {
    position: "absolute",
    width: `${size}px`,
    height: `${size}px`,
    pointerEvents: "none",
  };
  switch (pos) {
    case "tl": wrapper.top    = `${offset}px`; wrapper.left  = `${offset}px`; break;
    case "tr": wrapper.top    = `${offset}px`; wrapper.right = `${offset}px`; break;
    case "bl": wrapper.bottom = `${offset}px`; wrapper.left  = `${offset}px`; break;
    case "br": wrapper.bottom = `${offset}px`; wrapper.right = `${offset}px`; break;
  }

  const horizontal: React.CSSProperties = {
    position: "absolute",
    width: `${size}px`,
    height: `${thickness}px`,
    background: fill,
    border: `1.5px solid ${ink}`,
    boxSizing: "border-box",
  };
  const vertical: React.CSSProperties = {
    position: "absolute",
    width: `${thickness}px`,
    height: `${size}px`,
    background: fill,
    border: `1.5px solid ${ink}`,
    boxSizing: "border-box",
  };
  switch (pos) {
    case "tl":
      horizontal.top = "0"; horizontal.left = "0";
      vertical.top   = "0"; vertical.left   = "0";
      break;
    case "tr":
      horizontal.top = "0"; horizontal.right = "0";
      vertical.top   = "0"; vertical.right   = "0";
      break;
    case "bl":
      horizontal.bottom = "0"; horizontal.left = "0";
      vertical.bottom   = "0"; vertical.left   = "0";
      break;
    case "br":
      horizontal.bottom = "0"; horizontal.right = "0";
      vertical.bottom   = "0"; vertical.right   = "0";
      break;
  }

  // Highlight slivers — the "polished metal" specular line on each arm.
  const horizHi: React.CSSProperties = {
    position: "absolute",
    width: `${size - 4}px`,
    height: "1px",
    background: highlight,
  };
  const vertHi: React.CSSProperties = {
    position: "absolute",
    width: "1px",
    height: `${size - 4}px`,
    background: highlight,
  };
  switch (pos) {
    case "tl":
      horizHi.top = "2px"; horizHi.left = "2px";
      vertHi.top  = "2px"; vertHi.left  = "2px";
      break;
    case "tr":
      horizHi.top = "2px"; horizHi.right = "2px";
      vertHi.top  = "2px"; vertHi.right  = "2px";
      break;
    case "bl":
      horizHi.bottom = "2px"; horizHi.left = "2px";
      vertHi.bottom  = "2px"; vertHi.left  = "2px";
      break;
    case "br":
      horizHi.bottom = "2px"; horizHi.right = "2px";
      vertHi.bottom  = "2px"; vertHi.right  = "2px";
      break;
  }

  return (
    <div className={className} style={wrapper} aria-hidden="true">
      <div style={horizontal} />
      <div style={vertical} />
      <div style={horizHi} />
      <div style={vertHi} />
    </div>
  );
}

/** A bold game-board rule — solid 4-5px navy bar with a thin highlight. */
function BoardRule() {
  return (
    <div
      className="h-[4px] sm:h-[5px]"
      style={{
        position: "relative",
        background: "rgb(var(--accent-500))",
        border: "1px solid rgb(var(--ink-500))",
      }}
      aria-hidden="true"
    >
      <div
        style={{
          position: "absolute",
          left: 0, right: 0, top: 0,
          height: "1px",
          background: "rgba(255, 255, 255, 0.30)",
        }}
      />
    </div>
  );
}

/** Game-tile navigation button with hard offset shadow. */
const BoardNavTile = observer(function BoardNavTile({ item }: { item: NavItemT }) {
  const store = useStore();
  const active = store.view === item.id;
  return (
    <button
      type="button"
      onClick={() => store.setView(item.id)}
      title={item.subtitle}
      className="font-display uppercase transition-all flex items-baseline gap-1.5 sm:gap-2 px-2.5 py-2 sm:px-4 sm:py-3"
      style={{
        background: active ? "rgb(var(--support-500))" : "#ffffff",
        color: active ? "#ffffff" : "rgb(var(--ink-500))",
        border: "2px solid rgb(var(--ink-500))",
        letterSpacing: "0.02em",
        boxShadow: active
          ? "1px 1px 0 0 rgb(var(--ink-500))"
          : "3px 3px 0 0 rgb(var(--accent-500))",
        transform: active ? "translate(2px, 2px)" : undefined,
      }}
    >
      <span
        className="text-[9px] sm:text-[10px]"
        style={{
          color: active ? "rgba(255,255,255,0.85)" : "rgb(var(--accent-500))",
        }}
      >
        {item.folio}
      </span>
      <span className="text-[13px] sm:text-[16px]">{item.label}</span>
    </button>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end">
      <div className="label-caps text-accent-500 text-[10px] mb-0.5">{label}</div>
      <div
        className="font-display tabular leading-none text-ink-500 text-[20px] lg:text-[26px]"
        style={{ letterSpacing: "-0.01em" }}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Patent / edition stamp — small printed-on-the-box-back panel. Reuses the
 * theme's corner ornament + suffix tag so it adapts when other themes
 * (e.g. Almanac) opt into this layout.
 */
function PatentStamp({ themeMeta }: { themeMeta: Theme }) {
  const corner = themeMeta.ornaments.corner ?? "■";
  return (
    <div
      className="inline-flex items-center gap-2 px-2 py-1"
      style={{
        border: "1.5px solid rgb(var(--accent-500))",
        background: "transparent",
        color: "rgb(var(--accent-500))",
      }}
    >
      <span className="font-display text-[16px] leading-none" aria-hidden="true">
        {corner}
      </span>
      <div className="flex flex-col leading-none gap-0.5">
        <span className="font-display uppercase tracking-[0.16em] text-[9px]">
          Patent Pending
        </span>
        <span className="font-mono uppercase tracking-wide-caps text-[9px] text-ink-300">
          {themeMeta.label} · {themeMeta.ornaments.mastheadSuffix} · Ages 8+
        </span>
      </div>
    </div>
  );
}
