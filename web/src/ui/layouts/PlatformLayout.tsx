/**
 * PlatformLayout — subway platform with MTA route bullets.
 *
 * Black top + bottom bars enclose the page surface. Tactile-strip
 * dot-grid bands above and below the surface. Nav items render as
 * round route bullets in arbitrary line colors.
 */
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

const ROUTE_COLORS: readonly string[] = [
  "#EE352E", "#FCCC0A", "#0039A6", "#FF6319", "#6CBE45", "#996633", "#A7A9AC", "#00933C", "#0083DB", "#B933AD",
];

export function PlatformLayout({ nav, activeId, onNavigate, children, themeId, statsLine }: LayoutProps) {
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--color-bg)" }}>
      <div className="mx-auto max-w-[1500px]">
        <div
          className="px-4 py-4 sm:px-7"
          style={{ background: "var(--color-ink)", color: "#fff" }}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-baseline gap-3">
              <span style={{ color: "var(--color-accent)", fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700 }}>
                LINE N2K
              </span>
              <span className="label-caps" style={{ color: "rgba(255,255,255,0.7)" }}>
                Now serving · {themeId}
              </span>
            </div>
            <nav className="flex items-center gap-2 flex-wrap">
              {nav.map((item, i) => (
                <RouteBullet
                  key={item.id}
                  color={ROUTE_COLORS[i % ROUTE_COLORS.length] ?? "#EE352E"}
                  active={activeId === item.id}
                  label={item.folio}
                  title={item.label}
                  onClick={() => onNavigate(item.id)}
                />
              ))}
            </nav>
          </div>
        </div>
        <TactileStrip />
        <main className="px-4 py-6 sm:px-7 sm:py-8 lg:px-12 lg:py-12" style={{ background: "var(--color-surface)" }}>
          <div className="page-surface px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-12">
            {children}
          </div>
        </main>
        <TactileStrip />
        <div
          className="px-4 py-4 sm:px-7 flex flex-wrap items-center justify-between gap-3"
          style={{ background: "var(--color-ink)", color: "#fff" }}
        >
          <div className="label-caps" style={{ color: "rgba(255,255,255,0.7)" }}>
            Mind the gap · {colophonFor(themeId)}
          </div>
          <div className="flex items-center gap-3">
            {statsLine !== undefined ? <span className="font-mono text-[11px]">{statsLine}</span> : null}
            <ThemeSelector orientation="discreet" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TactileStrip() {
  return <div className="tactile-strip" />;
}

function RouteBullet({
  color,
  label,
  title,
  active,
  onClick,
}: {
  readonly color: string;
  readonly label: string;
  readonly title: string;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 38,
        height: 38,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        fontFamily: "var(--font-serif)",
        fontWeight: 700,
        border: "none",
        cursor: "pointer",
        boxShadow: active ? "0 0 0 3px #fff, 0 0 0 5px var(--color-accent)" : "none",
        transition: "box-shadow 120ms",
      }}
    >
      {label}
    </button>
  );
}
