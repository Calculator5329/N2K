import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext.js";
import { useAlmanacIndex } from "../../v1stores/useAlmanacIndex.js";
import { ThemeSelector } from "../ThemeSelector.js";
import { useNavItems, FOOTER_COLOPHON, type NavItem as NavItemT } from "../nav.js";
import { THEMES } from "../../core/themes.js";

/**
 * Lotus 1-2-3 / VisiCalc DOS spreadsheet layout.
 *
 *   ╔════════════════════════════════════════════════════╗
 *   ║ N2K.ALMANAC  WB1.WK1                       2026-04 ║   ← title bar
 *   ╠════════════════════════════════════════════════════╣
 *   ║ A1  =N2K(2,3,5,40)                                 ║   ← formula bar
 *   ╠════╦══════╦══════╦══════╦══════╦══════╦══════════╣
 *   ║    ║  A   ║  B   ║  C   ║  D   ║  E   ║   F      ║   ← column letters
 *   ╠════╬══════╬══════╬══════╬══════╬══════╬══════════╣
 *   ║  1 ║                                              ║
 *   ║  2 ║         [body content area]                  ║   ← row numbers + cells
 *   ║  3 ║                                              ║
 *   ║  4 ║                                              ║
 *   ╠════╩══════╩══════╩══════╩══════╩══════╩══════════╣
 *   ║ READY   NUM  CAPS                       Sheet 1/N ║   ← status bar
 *   ╚════════════════════════════════════════════════════╝
 */

export const SpreadsheetLayout = observer(function SpreadsheetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const store = useStore();
  const index = useAlmanacIndex();
  const themeId = store.theme.theme;
  const themeMeta = THEMES[themeId];
  const navItems = useNavItems();

  const accent = "rgb(var(--accent-500))";
  const ink300 = "rgb(var(--ink-300))";
  const cellBorder = "1px solid rgb(var(--ink-300))";

  const todayStamp =
    index.status === "ready"
      ? new Date(index.value.generatedAt).toISOString().slice(0, 10)
      : "—";

  const activeFolio =
    navItems.find((n) => n.id === store.view)?.folio.toUpperCase() ?? "I";

  return (
    <div className="min-h-screen w-full">
      <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8 lg:py-8">

        {/* Outer "window" */}
        <div style={{ background: "#ffffff", border: cellBorder }}>

          {/* ── TITLE BAR (navy, white text) ─────────────────────── */}
          <div
            className="flex items-baseline justify-between px-3 py-1.5"
            style={{ background: accent, color: "#ffffff" }}
          >
            <div className="flex items-baseline gap-3 font-mono">
              <span style={{ fontWeight: 700, fontSize: "13px", letterSpacing: "0.06em" }}>
                N2K.ALMANAC
              </span>
              <span style={{ opacity: 0.7, fontSize: "12px" }}>
                {themeMeta.ornaments.mastheadSuffix}
              </span>
            </div>
            <div className="flex items-baseline gap-3 font-mono" style={{ fontSize: "12px" }}>
              <span style={{ opacity: 0.7 }}>
                Edition: <span style={{ color: "rgb(var(--accent-400) / 1)", fontWeight: 700 }}>{themeMeta.label}</span>
              </span>
              <span style={{ opacity: 0.7 }}>{todayStamp}</span>
            </div>
          </div>

          {/* ── FORMULA BAR ────────────────────────────────────── */}
          <div
            className="flex items-stretch"
            style={{ borderTop: cellBorder, borderBottom: cellBorder }}
          >
            <div
              className="flex items-center justify-center px-3 py-1.5 font-mono"
              style={{
                width: "60px",
                background: "rgb(var(--paper-200))",
                color: ink300,
                borderRight: cellBorder,
                fontWeight: 700,
                fontSize: "12px",
              }}
            >
              {activeFolio}1
            </div>
            <div
              className="flex-1 px-3 py-1.5 font-mono"
              style={{ color: "rgb(var(--ink-500))", fontSize: "13px" }}
            >
              <span style={{ color: accent, fontWeight: 700 }}>fx </span>
              =N2K.ALMANAC.{store.view.toUpperCase()}()
            </div>
          </div>

          {/* ── COLUMN HEADER ROW ─────────────────────────────── */}
          <div className="flex items-stretch" style={{ borderBottom: cellBorder }}>
            <ColumnHeader corner />
            {navItems.map((item) => (
              <ColumnNavCell key={item.id} item={item} />
            ))}
          </div>

          {/* ── BODY: row numbers + cell area ──────────────────── */}
          <div className="flex items-stretch" style={{ minHeight: "60vh" }}>
            <div style={{ width: "60px", borderRight: cellBorder }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div
                  key={n}
                  className="flex items-center justify-center font-mono"
                  style={{
                    height: "44px",
                    background: "rgb(var(--paper-200))",
                    color: ink300,
                    borderBottom: cellBorder,
                    fontWeight: 700,
                    fontSize: "12px",
                  }}
                >
                  {n}
                </div>
              ))}
            </div>
            <div className="flex-1 page-surface" style={{ padding: "28px 36px" }}>
              {children}
            </div>
          </div>

          {/* ── STATUS BAR ─────────────────────────────────────── */}
          <div
            className="flex items-stretch font-mono"
            style={{
              background: "rgb(var(--paper-200))",
              borderTop: cellBorder,
              fontSize: "11px",
              color: ink300,
            }}
          >
            <StatusCell label="READY" highlight />
            {index.status === "ready" && (
              <>
                <StatusCell label={`TRIPLES=${index.value.diceTriplesTotal.toLocaleString()}`} />
                <StatusCell label={`RECS=${index.value.recordsWritten.toLocaleString()}`} />
                <StatusCell label={`RANGE=${index.value.totalMin}..${index.value.totalMax}`} />
              </>
            )}
            <div
              className="flex items-center gap-2 px-3 py-1.5 ml-auto"
              style={{ borderLeft: cellBorder }}
            >
              <span style={{ fontWeight: 700, color: accent }}>EDITION</span>
              <ThemeSelector orientation="horizontal" />
            </div>
          </div>

          {/* ── COLOPHON ──────────────────────────────────────── */}
          <div
            className="px-3 py-1.5 font-mono"
            style={{
              background: "rgb(var(--paper-100))",
              borderTop: cellBorder,
              fontSize: "10px",
              color: ink300,
              opacity: 0.8,
            }}
          >
            REM {FOOTER_COLOPHON[themeId]}
          </div>
        </div>
      </div>
    </div>
  );
});

function ColumnHeader({ corner }: { corner?: boolean }) {
  return (
    <div
      style={{
        width: "60px",
        background: "rgb(var(--paper-200))",
        borderRight: "1px solid rgb(var(--ink-300))",
      }}
    >
      {corner ? null : null}
    </div>
  );
}

const ColumnNavCell = observer(function ColumnNavCell({ item }: { item: NavItemT }) {
  const store = useStore();
  const active = store.view === item.id;
  return (
    <button
      type="button"
      onClick={() => store.setView(item.id)}
      title={item.subtitle}
      className="flex-1 flex items-baseline justify-center gap-2 px-3 py-1.5 font-mono transition-colors"
      style={{
        background: active ? "rgb(224 232 252)" : "rgb(var(--paper-200))",
        color: active ? "rgb(var(--accent-500))" : "rgb(var(--ink-300))",
        borderRight: "1px solid rgb(var(--ink-300))",
        fontWeight: active ? 700 : 600,
        fontSize: "12px",
        letterSpacing: "0.06em",
      }}
    >
      <span style={{ fontSize: "11px", opacity: 0.7 }}>{item.folio.toUpperCase()}</span>
      <span style={{ textTransform: "uppercase" }}>{item.label}</span>
    </button>
  );
});

function StatusCell({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <div
      className="px-3 py-1.5"
      style={{
        borderRight: "1px solid rgb(var(--ink-300))",
        background: highlight ? "rgb(var(--accent-500))" : "transparent",
        color: highlight ? "#ffffff" : "rgb(var(--ink-300))",
        fontWeight: highlight ? 700 : 500,
      }}
    >
      {label}
    </div>
  );
}
