import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext.js";
import { useAlmanacIndex } from "../../v1stores/useAlmanacIndex.js";
import { ThemeSelector } from "../ThemeSelector.js";
import { useNavItems, FOOTER_COLOPHON, type NavItem as NavItemT } from "../nav.js";
import { THEMES } from "../../core/themes.js";

/**
 * NYC subway platform layout.
 *
 *   ┌──────────────────────────────────────────────────┐  ← BLACK info strip
 *   │ THE N2K ALMANAC ◾ DOWNTOWN & BROOKLYN  EDITION I │
 *   │ [1][2][3][A][B] route-bullet navigation          │
 *   ├──────────────────────────────────────────────────┤
 *   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← YELLOW tactile strip
 *   │                                                  │
 *   │      [white-tile body content]                   │
 *   │                                                  │
 *   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← YELLOW tactile strip
 *   ├──────────────────────────────────────────────────┤
 *   │ STAY BACK FROM THE PLATFORM EDGE  ◾  EDITION ▢▢▢ │  ← black footer strip
 *   └──────────────────────────────────────────────────┘
 */

const ROUTE_COLORS = ["#EE352E", "#FF6319", "#00933C", "#0039A6", "#A626AA"];

export const PlatformLayout = observer(function PlatformLayout({
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
    <div className="min-h-screen w-full" style={{ background: "rgb(var(--paper-100))" }}>
      <div className="mx-auto max-w-[1500px]">
        {/* ── TOP BLACK INFO STRIP ────────────────────────────── */}
        <div
          style={{
            background: "rgb(var(--ink-500))",
            color: "#ffffff",
            padding: "14px 16px",
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className="font-display"
                style={{
                  fontSize: "clamp(1.4rem, 6vw, 1.625rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "#ffffff",
                }}
              >
                THE N2K ALMANAC
              </span>
              <span
                className="font-display"
                style={{ fontSize: "12px", letterSpacing: "0.18em", color: "rgb(var(--accent-500))" }}
              >
                ◾ {String(themeMeta.label).toUpperCase()} LINE
              </span>
            </div>
            {index.status === "ready" && (
              <div className="flex flex-wrap items-baseline gap-3 sm:gap-5 font-display">
                <Stat label="Triples" value={index.value.diceTriplesTotal.toLocaleString()} />
                <Stat label="Records" value={index.value.recordsWritten.toLocaleString()} />
                <Stat label="Targets" value={`${index.value.totalMin}–${index.value.totalMax}`} />
              </div>
            )}
          </div>

          {/* Route-bullet nav row */}
          <nav className="mt-4 flex items-center gap-3 flex-wrap" aria-label="Sections">
            {navItems.map((item, i) => (
              <RouteBullet key={item.id} item={item} color={ROUTE_COLORS[i % ROUTE_COLORS.length]!} />
            ))}
          </nav>
        </div>

        {/* ── YELLOW TACTILE WARNING STRIP (top edge) ─────────── */}
        <TactileStrip />

        {/* ── BODY (white tile) ───────────────────────────────── */}
        <main className="px-4 py-6 sm:px-7 sm:py-8 lg:px-12 lg:py-12" style={{ background: "#ffffff" }}>
          <div className="page-surface">{children}</div>
        </main>

        {/* ── YELLOW TACTILE WARNING STRIP (bottom edge) ─────── */}
        <TactileStrip />

        {/* ── BOTTOM BLACK FOOTER STRIP ──────────────────────── */}
        <div
          style={{
            background: "rgb(var(--ink-500))",
            color: "#ffffff",
            padding: "12px 16px",
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="font-display"
              style={{ fontSize: "11px", letterSpacing: "0.20em", color: "#ffffff" }}
            >
              ◾ STAY BEHIND THE YELLOW LINE  ◾  {themeMeta.ornaments.mastheadSuffix}
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <span
                className="font-display"
                style={{ fontSize: "11px", letterSpacing: "0.20em", color: "rgb(var(--accent-500))" }}
              >
                EDITION
              </span>
              <ThemeSelector orientation="horizontal" />
            </div>
          </div>
          <div
            className="mt-2 font-display"
            style={{ fontSize: "10px", letterSpacing: "0.18em", color: "rgba(255,255,255,0.55)" }}
          >
            {FOOTER_COLOPHON[themeId]}
          </div>
        </div>
      </div>
    </div>
  );
});

const RouteBullet = observer(function RouteBullet({
  item,
  color,
}: {
  item: NavItemT;
  color: string;
}) {
  const store = useStore();
  const active = store.view === item.id;
  return (
    <button
      type="button"
      onClick={() => store.setView(item.id)}
      title={item.subtitle}
      className="flex items-center gap-2 font-display transition-opacity"
      style={{ opacity: active ? 1 : 0.7 }}
    >
      <span
        className="inline-flex items-center justify-center"
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "9999px",
          background: color,
          color: "#ffffff",
          fontWeight: 800,
          fontSize: "14px",
          letterSpacing: "-0.02em",
          boxShadow: active ? "0 0 0 3px #ffffff" : "none",
        }}
      >
        {item.folio}
      </span>
      <span
        style={{
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: "#ffffff",
        }}
      >
        {item.label}
      </span>
    </button>
  );
});

function TactileStrip() {
  return (
    <div
      style={{
        background: "rgb(var(--accent-500))",
        height: "16px",
        backgroundImage:
          "radial-gradient(rgba(0,0,0,0.30) 1.6px, transparent 2.0px)",
        backgroundSize: "10px 10px",
        backgroundPosition: "5px 4px",
        borderTop: "2px solid rgb(var(--ink-500))",
        borderBottom: "2px solid rgb(var(--ink-500))",
      }}
      aria-hidden="true"
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        style={{
          fontSize: "10px",
          letterSpacing: "0.18em",
          color: "rgb(var(--accent-500))",
          fontWeight: 700,
        }}
      >
        {label.toUpperCase()}
      </span>
      <span
        className="tabular"
        style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "-0.02em", color: "#ffffff" }}
      >
        {value}
      </span>
    </div>
  );
}
