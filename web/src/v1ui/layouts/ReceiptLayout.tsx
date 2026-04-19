import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext.js";
import { useAlmanacIndex } from "../../v1stores/useAlmanacIndex.js";
import { ThemeSelector } from "../ThemeSelector.js";
import { useNavItems, FOOTER_COLOPHON, type NavItem as NavItemT } from "../nav.js";
import { THEMES } from "../../core/themes.js";

/**
 * Thermal-printer slip layout — a narrow vertical strip of typewriter
 * paper, with perforated cut lines at top and bottom, an all-caps store
 * header, dashed dividers between sections, and a "transaction footer"
 * with totals.
 *
 *      ✂  - - - - - - - - - - -
 *           THE N2K ALMANAC
 *      Receipt Edition   #00040
 *      ─────────────────────────
 *           [section content]
 *      ─────────────────────────
 *      I LOOKUP  II EXPLORE  ...
 *      ─────────────────────────
 *      TOTAL TRIPLES  1,540
 *      TOTAL RECORDS  371,989
 *      ─────────────────────────
 *      EDITION:  [almanac · ...]
 *      THANK YOU  STOP
 *      ✂  - - - - - - - - - - -
 */
export const ReceiptLayout = observer(function ReceiptLayout({
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
    <div className="min-h-screen w-full py-8 lg:py-12">
      <div
        className="mx-auto"
        style={{
          maxWidth: "560px",
          background: "rgb(var(--paper-50))",
          boxShadow: "var(--page-shadow)",
        }}
      >
        {/* ── Top perforation cut line ────────────────────────────── */}
        <Perforation position="top" />

        <div className="px-7 py-6">
          {/* ── Store header ──────────────────────────────────────── */}
          <header className="text-center mb-5">
            <h1 className="font-display" style={{ fontSize: "26px", letterSpacing: "0.10em" }}>
              THE N2K ALMANAC
            </h1>
            <div className="font-body text-[12px] tracking-widest uppercase text-ink-200 mt-1">
              {themeMeta.label} Edition · {themeMeta.ornaments.mastheadSuffix}
            </div>
            <div className="font-body text-[11px] text-ink-100 mt-0.5">
              {index.status === "ready"
                ? new Date(index.value.generatedAt).toISOString().replace("T", " ").slice(0, 16) + "Z"
                : "compiling…"}
            </div>
          </header>

          <DashedRule />

          {/* ── Body ──────────────────────────────────────────────── */}
          <main className="my-5">{children}</main>

          <DashedRule />

          {/* ── Navigation as line items ──────────────────────────── */}
          <nav
            aria-label="Sections"
            className="my-4 flex items-center justify-between gap-1 flex-wrap"
          >
            {navItems.map((item) => (
              <ReceiptNavItem key={item.id} item={item} />
            ))}
          </nav>

          <DashedRule />

          {/* ── Totals (dataset stats as receipt line items) ─────── */}
          {index.status === "ready" && (
            <div className="my-4 font-body text-[12px] uppercase tracking-wide-caps text-ink-300 space-y-1">
              <LineItem label="Total Triples" value={index.value.diceTriplesTotal.toLocaleString()} />
              <LineItem label="Total Records" value={index.value.recordsWritten.toLocaleString()} />
              <LineItem label="Targets Range" value={`${index.value.totalMin}-${index.value.totalMax}`} />
              <DashedRule />
              <LineItem label="GRAND TOTAL" value="∞" emphasis />
            </div>
          )}

          <DashedRule />

          {/* ── Edition selector ──────────────────────────────────── */}
          <div className="my-4">
            <div className="text-center font-body text-[10px] uppercase tracking-widest text-ink-200 mb-2">
              CHANGE EDITION
            </div>
            <ThemeSelector orientation="horizontal" />
          </div>

          <DashedRule />

          {/* ── Closing ───────────────────────────────────────────── */}
          <footer className="my-4 text-center font-body text-[11px] text-ink-300 uppercase tracking-widest space-y-1">
            <div>* * THANK YOU * *</div>
            <div className="text-ink-100">{FOOTER_COLOPHON[themeId]}</div>
            <div className="text-accent-500 text-[10px]">RETAIN FOR YOUR RECORDS</div>
          </footer>
        </div>

        {/* ── Bottom perforation cut line ─────────────────────────── */}
        <Perforation position="bottom" />
      </div>
    </div>
  );
});

const ReceiptNavItem = observer(function ReceiptNavItem({ item }: { item: NavItemT }) {
  const store = useStore();
  const active = store.view === item.id;
  return (
    <button
      type="button"
      onClick={() => store.setView(item.id)}
      title={item.subtitle}
      className={[
        "px-2 py-1 font-body text-[12px] uppercase tracking-wide-caps transition-colors",
        active ? "bg-ink-300 text-paper-50" : "text-ink-200 hover:text-ink-400",
      ].join(" ")}
    >
      <span className="text-[9px] mr-1 text-ink-100">{item.folio}</span>
      {item.label}
    </button>
  );
});

function LineItem({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={["flex items-baseline justify-between gap-2", emphasis && "text-accent-500 font-bold"]
        .filter(Boolean)
        .join(" ")}
    >
      <span>{label}</span>
      <span
        className="flex-1 mx-2"
        style={{
          height: "1em",
          backgroundImage: "linear-gradient(to right, transparent 0, transparent calc(100% - 1px), rgb(var(--ink-100)) calc(100% - 1px))",
          backgroundSize: "8px 1px",
          backgroundPosition: "bottom",
          backgroundRepeat: "repeat-x",
        }}
        aria-hidden="true"
      />
      <span className="tabular">{value}</span>
    </div>
  );
}

function DashedRule() {
  return (
    <div
      style={{
        height: "1px",
        backgroundImage: "linear-gradient(to right, rgb(var(--ink-200)) 50%, transparent 50%)",
        backgroundSize: "6px 1px",
        backgroundRepeat: "repeat-x",
      }}
      aria-hidden="true"
    />
  );
}

function Perforation({ position }: { position: "top" | "bottom" }) {
  return (
    <div
      className="flex items-center gap-3 px-4 text-ink-200"
      style={{
        height: "20px",
        backgroundImage:
          "linear-gradient(to right, rgb(var(--ink-200)) 50%, transparent 50%)",
        backgroundSize: "10px 1px",
        backgroundRepeat: "repeat-x",
        backgroundPosition: position === "top" ? "bottom" : "top",
      }}
      aria-hidden="true"
    >
      <span style={{ fontSize: "13px" }}>✂</span>
    </div>
  );
}
