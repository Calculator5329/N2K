import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext.js";
import { useAlmanacIndex } from "../../v1stores/useAlmanacIndex.js";
import { ThemeSelector } from "../ThemeSelector.js";
import { useNavItems, FOOTER_COLOPHON, type NavItem as NavItemT } from "../nav.js";
import { THEMES } from "../../core/themes.js";

/**
 * Silver-age comic page layout.
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  ★ THE N2K ALMANAC! KAPOW!! ★    (splash panel)      │   ← bold display
 *   │  ── Issue #001 — Featuring three dice and danger! ── │     masthead
 *   ├────────────┬────────────┬────────────┬───────────────┤
 *   │ PANEL 1    │ PANEL 2    │ PANEL 3    │ PANEL 4       │   ← nav as panel grid
 *   │ LOOKUP     │ EXPLORE    │ VISUALIZE  │ COMPOSE       │
 *   ├────────────┴────────────┴────────────┴───────────────┤
 *   │   ((( BIG BODY PANEL with halftone background )))    │
 *   ├──────────────────────────────────────────────────────┤
 *   │  ⚡ EDITION SELECTOR ⚡   |   colophon                │
 *   └──────────────────────────────────────────────────────┘
 */
export const PanelsLayout = observer(function PanelsLayout({
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
    <div className="min-h-screen w-full">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-14">

        {/* ── SPLASH MASTHEAD PANEL ───────────────────────────── */}
        <Panel rotation={0} accent>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <div
                className="font-display"
                style={{
                  fontSize: "clamp(2.75rem, 11vw, 4.75rem)",
                  lineHeight: 0.92,
                  letterSpacing: "0.02em",
                  color: "rgb(var(--ink-500))",
                  textShadow: "4px 4px 0 rgb(var(--support-500))",
                }}
              >
                THE N2K ALMANAC!
              </div>
              <div
                className="font-body mt-3"
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "rgb(var(--ink-500))",
                }}
              >
                ★ {themeMeta.ornaments.mastheadSuffix} ★ Featuring 3 dice & 1 lonely number ★
              </div>
            </div>
            {index.status === "ready" && (
              <SplatBadge>{index.value.diceTriplesTotal.toLocaleString()} TRIPLES!!</SplatBadge>
            )}
          </div>
        </Panel>

        {/* ── NAV: row of comic panels ─────────────────────────── */}
        <nav
          className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5"
          aria-label="Sections"
        >
          {navItems.map((item) => (
            <NavPanel key={item.id} item={item} />
          ))}
        </nav>

        {/* ── BIG BODY PANEL ──────────────────────────────────── */}
        <main className="mt-6 page-surface" style={{ padding: "clamp(20px, 5vw, 44px) clamp(18px, 5vw, 48px) clamp(24px, 6vw, 52px)" }}>
          {children}
        </main>

        {/* ── FOOTER PANEL: edition + colophon + stats ────────── */}
        <Panel className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div
              className="font-display mb-2"
              style={{
                fontSize: "20px",
                color: "rgb(var(--support-500))",
                textShadow: "2px 2px 0 rgb(var(--ink-500))",
                letterSpacing: "0.04em",
              }}
            >
              ⚡ CHANGE THE COVER! ⚡
            </div>
            <ThemeSelector orientation="horizontal" />
          </div>
          {index.status === "ready" && (
            <div className="flex items-end gap-5">
              <Stat label="Records" value={index.value.recordsWritten.toLocaleString()} />
              <Stat label="Targets" value={`${index.value.totalMin}-${index.value.totalMax}`} />
            </div>
          )}
          <div
            className="font-body text-right max-w-md"
            style={{ color: "rgb(var(--ink-500))", fontSize: "13px", lineHeight: 1.4 }}
          >
            <div
              className="font-display mb-1"
              style={{
                fontSize: "16px",
                color: "rgb(var(--accent-500))",
                textShadow: "1px 1px 0 rgb(var(--ink-500))",
              }}
            >
              COLOPHON
            </div>
            {FOOTER_COLOPHON[themeId]}
          </div>
        </Panel>
      </div>
    </div>
  );
});

function Panel({
  children,
  className = "",
  rotation = 0,
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  rotation?: number;
  accent?: boolean;
}) {
  return (
    <div
      className={className}
      style={{
        background: accent ? "rgb(var(--accent-500))" : "#ffffff",
        color: accent ? "#ffffff" : "rgb(var(--ink-500))",
        border: "3px solid rgb(var(--ink-500))",
        boxShadow: "5px 5px 0 0 rgb(var(--ink-500))",
        padding: "clamp(14px, 4vw, 20px) clamp(16px, 5vw, 24px)",
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
      }}
    >
      {children}
    </div>
  );
}

function SplatBadge({ children }: { children: ReactNode }) {
  // A jagged "burst" badge using clip-path.
  const burst =
    "polygon(50% 0%,61% 12%,77% 6%,80% 24%,96% 25%,90% 41%,100% 50%,90% 59%,96% 75%,80% 76%,77% 94%,61% 88%,50% 100%,39% 88%,23% 94%,20% 76%,4% 75%,10% 59%,0% 50%,10% 41%,4% 25%,20% 24%,23% 6%,39% 12%)";
  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: "120px",
        height: "120px",
        background: "rgb(var(--support-500))",
        color: "#ffffff",
        clipPath: burst,
        transform: "rotate(8deg)",
      }}
    >
      <div
        className="font-display text-center px-3"
        style={{
          fontSize: "14px",
          letterSpacing: "0.04em",
          lineHeight: 1.05,
          textShadow: "2px 2px 0 rgb(var(--ink-500))",
        }}
      >
        {children}
      </div>
    </div>
  );
}

const NavPanel = observer(function NavPanel({
  item,
}: {
  item: NavItemT;
}) {
  const store = useStore();
  const active = store.view === item.id;
  return (
    <button
      type="button"
      onClick={() => store.setView(item.id)}
      title={item.subtitle}
      className="text-left transition-transform hover:-translate-y-1"
      style={{
        background: active ? "rgb(var(--support-500))" : "#ffffff",
        color: active ? "#ffffff" : "rgb(var(--ink-500))",
        border: "3px solid rgb(var(--ink-500))",
        boxShadow: active
          ? "3px 3px 0 0 rgb(var(--ink-500))"
          : "5px 5px 0 0 rgb(var(--accent-500))",
        padding: "12px 14px",
        transform: undefined,
      }}
    >
      <div
        className="font-display"
        style={{
          fontSize: "14px",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: active ? "#ffffff" : "rgb(var(--accent-500))",
        }}
      >
        Panel {item.folio}
      </div>
      <div
        className="font-display leading-none mt-1"
        style={{
          fontSize: "clamp(1.35rem, 5vw, 1.875rem)",
          letterSpacing: "0.02em",
          textShadow: active
            ? "2px 2px 0 rgb(var(--ink-500))"
            : "2px 2px 0 rgb(var(--accent-500))",
        }}
      >
        {item.label.toUpperCase()}!
      </div>
    </button>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end">
      <span
        className="font-display"
        style={{
          fontSize: "12px",
          letterSpacing: "0.10em",
          color: "rgb(var(--accent-500))",
        }}
      >
        {label.toUpperCase()}
      </span>
      <span
        className="font-display tabular leading-none"
        style={{
          fontSize: "clamp(1.5rem, 6vw, 2rem)",
          color: "rgb(var(--ink-500))",
          textShadow: "2px 2px 0 rgb(var(--accent-500))",
        }}
      >
        {value}
      </span>
    </div>
  );
}
