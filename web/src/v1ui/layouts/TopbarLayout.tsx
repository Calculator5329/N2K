import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext.js";
import { useAlmanacIndex } from "../../v1stores/useAlmanacIndex.js";
import { ThemeSelector } from "../ThemeSelector.js";
import { useNavItems, FOOTER_COLOPHON, type NavItem as NavItemT } from "../nav.js";
import { THEMES } from "../../core/themes.js";

/**
 * Horizontal masthead layout — title bar at the top, horizontal section
 * navigation below it, then full-width content. Used by Broadsheet (which
 * presents like a daily newspaper) and Arcade (which presents like a HUD
 * status bar).
 *
 * The structural composition is identical between the two themes; their
 * different feel comes entirely from the CSS-variable bundles +
 * treatment overrides keyed on `[data-theme="..."]`.
 */
export const TopbarLayout = observer(function TopbarLayout({
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
      <header className="border-b border-ink-300/40 bg-paper-50">
        <div className="mx-auto max-w-[1400px] px-4 pt-4 pb-2 sm:px-6 lg:px-12 lg:pt-6">
          {/* MASTHEAD ROW: wordmark, suffix, theme selector, dataset stats. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div>
              <div
                className="font-display text-ink-500 leading-none"
                style={{
                  fontSize: themeId === "arcade" ? "clamp(1.75rem, 7vw, 2rem)" : "clamp(2.5rem, 9vw, 3.875rem)",
                  letterSpacing: themeId === "arcade" ? "0.04em" : "-0.02em",
                  textTransform: themeId === "arcade" ? "uppercase" : "none",
                }}
              >
                The N2K Almanac
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 label-caps text-ink-100">
                <span>{themeMeta.label} Edition</span>
                <span className="text-ink-100/50">{themeMeta.ornaments.sectionMarker}</span>
                <span>{themeMeta.ornaments.mastheadSuffix}</span>
                <span className="text-ink-100/50">{themeMeta.ornaments.sectionMarker}</span>
                <span>
                  {index.status === "ready"
                    ? new Date(index.value.generatedAt).toISOString().slice(0, 10)
                    : "compiling…"}
                </span>
              </div>
            </div>

            <div className="flex w-full flex-col gap-4 sm:w-auto sm:items-end sm:gap-6">
              {index.status === "ready" && (
                <div className="hidden md:flex items-baseline gap-5 font-mono tabular text-[11px] text-ink-200">
                  <Stat label="Triples" value={index.value.diceTriplesTotal.toLocaleString()} />
                  <Stat label="Records" value={index.value.recordsWritten.toLocaleString()} />
                  <Stat label="Targets" value={`${index.value.totalMin}–${index.value.totalMax}`} />
                </div>
              )}
              <ThemeSelector orientation="horizontal" />
            </div>
          </div>

          {/* NAV ROW: horizontal section tabs, separated from masthead by a hair. */}
          <div className="rule mt-5 mb-3" />
          <nav aria-label="Sections" className="flex items-baseline gap-2 flex-wrap pb-2">
            {navItems.map((item) => (
              <NavItem key={item.id} item={item} />
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-12 lg:py-12">
        <div className="page-surface px-5 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-12">
          {children}
        </div>

        <footer className="mt-5 px-2 flex items-baseline justify-between text-[11px] font-mono text-ink-100 flex-wrap gap-2">
          <span className="tracking-wide-caps uppercase">
            The N2K Almanac
            <span className="mx-2 text-ink-100/40">{themeMeta.ornaments.sectionMarker}</span>
            {themeMeta.label} Edition
          </span>
          <span>{FOOTER_COLOPHON[themeId]}</span>
        </footer>
      </main>
    </div>
  );
});

const NavItem = observer(function NavItem({ item }: { item: NavItemT }) {
  const store = useStore();
  const active = store.view === item.id;
  return (
    <button
      type="button"
      onClick={() => store.setView(item.id)}
      className={[
        "group inline-flex items-baseline gap-2 px-3 py-2 transition-colors border-b-2",
        active
          ? "border-oxblood-500 text-ink-500"
          : "border-transparent text-ink-200 hover:text-ink-500 hover:border-ink-200/60",
      ].join(" ")}
    >
      <span
        className={[
          "font-mono text-[10px] tracking-wide-caps uppercase tabular",
          active ? "text-oxblood-500" : "text-ink-100",
        ].join(" ")}
      >
        {item.folio}
      </span>
      <span
        className="font-display text-[18px] font-medium"
        style={{ fontVariationSettings: '"opsz" 60, "SOFT" 30' }}
      >
        {item.label}
      </span>
    </button>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="uppercase tracking-wide-caps text-[9px] text-ink-100">{label}</span>
      <span className="text-ink-400">{value}</span>
    </span>
  );
}
