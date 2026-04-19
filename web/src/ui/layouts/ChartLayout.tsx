/**
 * ChartLayout — maritime chart.
 *
 * Scroll-banner masthead with cursive subtitle, double rule, page
 * surface inside an inner cartouche border, buoy-shaped nav row, and
 * a compass-rose colophon footer.
 */
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

export function ChartLayout({ nav, activeId, onNavigate, children, themeId, statsLine }: LayoutProps) {
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--color-bg)" }}>
      <div className="relative mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-16">
        <header className="text-center mb-6">
          <div className="flex items-center justify-center gap-3" style={{ color: "var(--color-accent)" }}>
            <span>❦</span>
            <span className="label-caps">N2K Hydrographic · {themeId}</span>
            <span>❦</span>
          </div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(2rem, 7vw, 3.5rem)",
              color: "var(--color-ink)",
              fontWeight: 600,
            }}
          >
            Chart of the N2K Triplices
          </h1>
          <p
            className="italic mt-1"
            style={{
              fontFamily: '"Tangerine", "IM Fell English", cursive',
              fontSize: 22,
              color: "var(--color-ink-muted)",
            }}
          >
            being a true and faithful map of all reachable totals
          </p>
          <div className="mt-3 flex items-center justify-center gap-2 label-caps" style={{ color: "var(--color-ink-muted)" }}>
            <span>{new Date().toLocaleDateString()}</span>
            <span>·</span>
            <span>{statsLine ?? "Soundings in fathoms"}</span>
          </div>
        </header>
        <div className="divider-hair my-4" />
        <main className="page-surface relative px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-12">
          <div
            className="absolute inset-2 pointer-events-none"
            style={{ border: "1px solid color-mix(in oklab, var(--color-accent) 40%, transparent)" }}
          />
          <div className="relative">{children}</div>
        </main>
        <nav className="mt-10 flex items-end justify-center gap-6 flex-wrap">
          {nav.map((item, i) => (
            <Buoy
              key={item.id}
              folio={item.folio}
              label={item.label}
              compass={"NESW·"[i % 5] ?? "·"}
              active={activeId === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </nav>
        <footer className="mt-10 grid grid-cols-12 items-end gap-6">
          <div className="col-span-12 sm:col-span-4">
            <ThemeSelector orientation="discreet" />
          </div>
          <div className="col-span-12 sm:col-span-4 text-center label-caps">
            {colophonFor(themeId)}
          </div>
          <div className="col-span-12 sm:col-span-4 flex justify-end">
            <CompassRose />
          </div>
        </footer>
      </div>
    </div>
  );
}

function Buoy({
  folio,
  label,
  compass,
  active,
  onClick,
}: {
  readonly folio: string;
  readonly label: string;
  readonly compass: string;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1"
      style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-ink)" }}
    >
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          background: active ? "var(--color-accent)" : "var(--color-surface)",
          color: active ? "var(--color-bg)" : "var(--color-ink)",
          border: "2px solid var(--color-accent)",
          boxShadow: "inset 0 0 0 2px var(--color-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-serif)",
        }}
      >
        {compass}
      </span>
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase" style={{ color: "var(--color-ink-muted)" }}>
        {folio}
      </span>
      <span style={{ fontFamily: '"IM Fell English", serif', fontSize: 14 }}>{label}</span>
    </button>
  );
}

function CompassRose() {
  return (
    <svg width={56} height={56} viewBox="0 0 64 64" aria-hidden style={{ color: "var(--color-accent)" }}>
      <circle cx={32} cy={32} r={28} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <circle cx={32} cy={32} r={20} fill="none" stroke="currentColor" strokeWidth={0.5} />
      <path d="M32 4 L36 32 L32 60 L28 32 Z" fill="currentColor" opacity={0.85} />
      <path d="M4 32 L32 36 L60 32 L32 28 Z" fill="currentColor" opacity={0.5} />
      <text x={32} y={12} textAnchor="middle" fontSize={8} fill="currentColor" fontFamily="serif">N</text>
    </svg>
  );
}
