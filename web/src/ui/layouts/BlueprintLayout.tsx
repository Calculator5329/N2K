/**
 * BlueprintLayout — engineering drawing with title block.
 *
 * Top strip with drawing id + revision, hairline rule, page surface,
 * AutoCAD-style title block bottom-right with edition + nav cells +
 * dataset cells + theme picker. Mono throughout.
 */
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

export function BlueprintLayout({ nav, activeId, onNavigate, children, themeId, statsLine }: LayoutProps) {
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--color-bg)" }}>
      <div className="mx-auto max-w-[1400px] px-4 py-8 lg:px-12 lg:py-14">
        <header className="mb-6 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--color-ink-muted)" }}>
            DWG-001 · REV.A · SCALE 1:1
          </div>
          <div
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 22,
              letterSpacing: "0.04em",
              color: "var(--color-ink)",
              fontWeight: 600,
            }}
          >
            N2K Drafting Bureau
          </div>
        </header>
        <div className="divider-hair mb-8" />
        <main
          className="page-surface relative px-5 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-12"
          style={{ borderRadius: 0 }}
        >
          {children}
        </main>
        <div className="flex justify-end mt-6">
          <TitleBlock nav={nav} activeId={activeId} onNavigate={onNavigate} themeId={themeId} statsLine={statsLine} />
        </div>
        <footer
          className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--color-ink-muted)" }}
        >
          {colophonFor(themeId)}
        </footer>
      </div>
    </div>
  );
}

interface TitleBlockProps {
  readonly nav: LayoutProps["nav"];
  readonly activeId: LayoutProps["activeId"];
  readonly onNavigate: LayoutProps["onNavigate"];
  readonly themeId: string;
  readonly statsLine: string | undefined;
}

function TitleBlock({ nav, activeId, onNavigate, themeId, statsLine }: TitleBlockProps) {
  return (
    <div
      className="w-full max-w-[640px] font-mono text-[11px] uppercase tracking-[0.18em]"
      style={{
        border: "1px solid var(--color-ink-muted)",
        background: "color-mix(in oklab, var(--color-surface) 85%, transparent)",
        color: "var(--color-ink-muted)",
      }}
    >
      <div className="grid grid-cols-3" style={{ borderBottom: "1px solid var(--color-ink-muted)" }}>
        <Cell label="Drawing">{themeId}</Cell>
        <Cell label="Edition">
          <ThemeSelector orientation="discreet" />
        </Cell>
        <Cell label="Dataset">{statsLine ?? "—"}</Cell>
      </div>
      <div className="grid grid-cols-5">
        {nav.slice(0, 5).map((item, i) => {
          const active = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className="px-2 py-2 flex flex-col gap-0.5 text-left"
              style={{
                background: active ? "var(--color-accent)" : "transparent",
                color: active ? "var(--color-bg)" : "var(--color-ink)",
                borderLeft: i === 0 ? "none" : "1px solid var(--color-ink-muted)",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 9 }}>{item.folio}</span>
              <span className="font-display text-[12px]">{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${nav.length - 5}, 1fr)`, borderTop: "1px solid var(--color-ink-muted)" }}>
        {nav.slice(5).map((item, i) => {
          const active = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className="px-2 py-2 flex flex-col gap-0.5 text-left"
              style={{
                background: active ? "var(--color-accent)" : "transparent",
                color: active ? "var(--color-bg)" : "var(--color-ink)",
                borderLeft: i === 0 ? "none" : "1px solid var(--color-ink-muted)",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 9 }}>{item.folio}</span>
              <span className="font-display text-[12px]">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Cell({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="px-3 py-2" style={{ borderRight: "1px solid var(--color-ink-muted)" }}>
      <div style={{ fontSize: 9, opacity: 0.7 }}>{label}</div>
      <div style={{ color: "var(--color-ink)" }}>{children}</div>
    </div>
  );
}
