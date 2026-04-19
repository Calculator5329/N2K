import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext.js";
import { useAlmanacIndex } from "../../v1stores/useAlmanacIndex.js";
import { ThemeSelector } from "../ThemeSelector.js";
import { useNavItems, FOOTER_COLOPHON, type NavItem as NavItemT } from "../nav.js";
import { THEMES } from "../../core/themes.js";

/**
 * Illuminated codex layout.
 *
 *   ┌──┬───────────────────────────┬──┐
 *   │ I│  ✦ CODEX PRIMUS ✦         │  │
 *   │II│  ─── ❦ ─── ❦ ─── ❦ ──    │ E│  ← E = Edition selector + stats
 *   │  │                           │ d│
 *   │II│   illuminated body card   │ i│
 *   │I │                           │ t│
 *   │  │                           │  │
 *   │IV│                           │  │
 *   └──┴───────────────────────────┴──┘
 *
 * The left rail is the navigation: each section as a tall illuminated
 * roman folio numeral; the right rail is the marginalia (theme selector
 * + dataset stats); the centered page card is the body.
 */
export const ManuscriptLayout = observer(function ManuscriptLayout({
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
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-14">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">

          {/* ── LEFT FOLIO RAIL ─────────────────────────────────────── */}
          <aside className="order-2 col-span-12 lg:order-none lg:col-span-1 lg:sticky lg:top-12 lg:self-start">
            <nav aria-label="Sections" className="flex flex-wrap items-center justify-center gap-3 py-2 lg:flex-col lg:py-4">
              {navItems.map((item) => (
                <FolioBadge key={item.id} item={item} />
              ))}
            </nav>
          </aside>

          {/* ── CENTER PAGE CARD ────────────────────────────────────── */}
          <main className="order-1 col-span-12 lg:order-none lg:col-span-9">
            <header className="mb-4">
              {/* Illuminated bar with corner ornaments */}
              <div className="flex items-center justify-between gap-3 font-display text-[11px] tracking-wide-caps text-ink-200 sm:text-[12px]">
                <span className="text-accent-500">{corner}</span>
                <span className="uppercase" style={{ letterSpacing: "0.18em" }}>
                  {themeMeta.label} {themeMeta.ornaments.sectionMarker} {themeMeta.ornaments.mastheadSuffix}
                </span>
                <span className="text-accent-500">{corner}</span>
              </div>
              <div
                className="font-display text-center mt-2"
                style={{
                  fontSize: "clamp(2.75rem, 11vw, 4.875rem)",
                  lineHeight: 0.95,
                  color: "rgb(var(--accent-500))",
                  textShadow: "1px 1px 0 rgb(var(--accent-600)), 2px 2px 0 rgba(212, 162, 76, 0.55)",
                }}
              >
                The N2K Almanac
              </div>
              <div className="rule mt-3" />
            </header>

            <div className="page-surface px-5 py-6 sm:px-8 sm:py-8 lg:px-16 lg:py-14">
              {children}
            </div>

            <footer className="mt-4 flex flex-wrap items-baseline justify-between gap-2 px-2 text-[11px] font-body italic text-ink-200">
              <span>
                The N2K Almanac
                <span className="mx-2 text-ink-100/40">{themeMeta.ornaments.sectionMarker}</span>
                {themeMeta.label} Edition
              </span>
              <span>{FOOTER_COLOPHON[themeId]}</span>
            </footer>
          </main>

          {/* ── RIGHT MARGINALIA RAIL ──────────────────────────────── */}
          <aside className="order-3 col-span-12 space-y-5 pt-0 lg:col-span-2 lg:sticky lg:top-12 lg:self-start lg:pt-8">
            <ThemeSelector orientation="vertical" />

            <div className="rule" />

            {index.status === "ready" && (
              <div className="space-y-2 text-[12px] font-body italic text-ink-200">
                <Marginalia label="Triplices" value={index.value.diceTriplesTotal.toLocaleString()} />
                <Marginalia label="Versus" value={index.value.recordsWritten.toLocaleString()} />
                <Marginalia label="Numeri" value={`${index.value.totalMin}–${index.value.totalMax}`} />
                <Marginalia label="Compositum" value={new Date(index.value.generatedAt).toISOString().slice(0, 10)} />
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
});

/** Folio numeral that doubles as a nav button. */
const FolioBadge = observer(function FolioBadge({ item }: { item: NavItemT }) {
  const store = useStore();
  const active = store.view === item.id;
  return (
    <button
      type="button"
      onClick={() => store.setView(item.id)}
      title={`${item.label} — ${item.subtitle}`}
      className={[
        "group flex items-center justify-center w-10 h-12 transition-colors font-display",
        active
          ? "bg-accent-500 text-paper-50 border border-accent-600"
          : "text-ink-300 hover:bg-paper-200/60 border border-transparent",
      ].join(" ")}
      style={{
        boxShadow: active ? "inset 0 0 0 2px rgba(212, 162, 76, 0.45)" : undefined,
        borderRadius: "1px",
        fontSize: "20px",
        lineHeight: 1,
      }}
    >
      {item.folio}
    </button>
  );
});

function Marginalia({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-dotted border-ink-100/40 pb-1 italic">
      <span className="text-ink-100">{label}</span>
      <span className="text-ink-300 not-italic font-mono text-[11px]">{value}</span>
    </div>
  );
}
