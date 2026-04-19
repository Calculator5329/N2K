import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext.js";
import { useAlmanacIndex } from "../../v1stores/useAlmanacIndex.js";
import { Wordmark } from "../Wordmark.js";
import { ThemeSelector } from "../ThemeSelector.js";
import { useNavItems, FOOTER_COLOPHON, type NavItem } from "../nav.js";
import { SecretBadge } from "../SecretBadge.js";
import { THEMES } from "../../core/themes.js";

/**
 * The book-like layout: tall left masthead with sticky navigation and a
 * page-as-card main reading surface. Used by Almanac, Phosphor, Risograph.
 */
export const SidebarLayout = observer(function SidebarLayout({
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
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-12 lg:py-16">
        <div className="grid grid-cols-12 gap-6 lg:gap-12">
          <aside className="col-span-12 lg:col-span-3 lg:sticky lg:top-16 lg:self-start">
            <div className="mb-10">
              <Wordmark />
              <div className="mt-4 ml-px label-caps text-ink-100">
                A reference compendium
                <br />
                of dice, equations, and difficulty
              </div>
            </div>

            <div className="rule mb-3" />
            <nav aria-label="Sections">
              {navItems.map((item) => (
                <NavItem key={item.id} item={item} />
              ))}
            </nav>
            <div className="rule mt-3 mb-6" />

            <div className="mb-6">
              <ThemeSelector orientation="vertical" />
            </div>

            <div className="rule mb-6" />

            {index.status === "ready" && (
              <div className="space-y-2 text-[12px] font-mono tabular text-ink-100">
                <Stat label="Dice triples" value={index.value.diceTriplesTotal.toLocaleString()} />
                <Stat label="Records" value={index.value.recordsWritten.toLocaleString()} />
                <Stat label="Targets" value={`${index.value.totalMin}–${index.value.totalMax}`} />
                <Stat label="Compiled" value={new Date(index.value.generatedAt).toISOString().slice(0, 10)} />
              </div>
            )}
            {index.status === "loading" && (
              <div className="text-[12px] font-mono text-ink-100">loading index…</div>
            )}
            {index.status === "error" && (
              <div className="text-[12px] font-mono text-oxblood-500">
                Could not load dataset. Did you run <code>npm run data:all</code>?
              </div>
            )}
          </aside>

          <main className="col-span-12 lg:col-span-9">
            <div className="page-surface px-5 py-6 sm:px-8 sm:py-8 lg:px-14 lg:py-14">
              {children}
            </div>

            <footer className="mt-6 flex flex-wrap items-baseline justify-between gap-2 px-2 text-[11px] font-mono text-ink-100">
              <span className="tracking-wide-caps uppercase">
                The N2K Almanac
                <span className="mx-2 text-ink-100/40">{themeMeta.ornaments.sectionMarker}</span>
                {themeMeta.label} Edition
                <SecretBadge className="ml-2" />
              </span>
              <span>{FOOTER_COLOPHON[themeId]}</span>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
});

const NavItem = observer(function NavItem({ item }: { item: NavItem }) {
  const store = useStore();
  const active = store.view === item.id;
  return (
    <button
      type="button"
      onClick={() => store.setView(item.id)}
      className={[
        "group block w-full text-left py-3 pr-4 pl-5 -ml-5 transition-colors",
        "border-l-2",
        active
          ? "border-oxblood-500 bg-paper-100/60"
          : "border-transparent hover:border-ink-100/30 hover:bg-paper-100/30",
      ].join(" ")}
    >
      <div className="flex items-baseline gap-3">
        <span
          className={[
            "font-mono text-[10px] tracking-wide-caps uppercase tabular",
            active ? "text-oxblood-500" : "text-ink-100",
          ].join(" ")}
        >
          {item.folio}
        </span>
        <span
          className={[
            "font-display text-[22px] font-medium",
            active ? "text-ink-500" : "text-ink-300 group-hover:text-ink-500",
          ].join(" ")}
          style={{ fontVariationSettings: '"opsz" 60, "SOFT" 30' }}
        >
          {item.label}
        </span>
      </div>
      <div className="mt-0.5 ml-7 text-[12px] text-ink-100 italic">
        {item.subtitle}
      </div>
    </button>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-ink-100/30 pb-1">
      <span className="uppercase tracking-wide-caps text-[10px]">{label}</span>
      <span className="text-ink-300">{value}</span>
    </div>
  );
}
