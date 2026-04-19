import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext.js";
import { useAlmanacIndex } from "../../v1stores/useAlmanacIndex.js";
import { ThemeSelector } from "../ThemeSelector.js";
import { useNavItems, FOOTER_COLOPHON, type NavItem as NavItemT } from "../nav.js";
import { THEMES } from "../../core/themes.js";

/**
 * Kraft-paper scrapbook layout. The body is a polaroid card pinned slightly
 * crooked to the page, surrounded by:
 *   - top-left: rotated polaroid with the wordmark
 *   - top-right: washi-tape labels (date / edition)
 *   - bottom: navigation as a row of polaroids tilted in alternating directions
 *   - margins: doodled rule, dataset stats as a torn-paper note
 */
export const ScrapbookLayout = observer(function ScrapbookLayout({
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
      <div className="mx-auto max-w-[1300px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-16">

        {/* ── TOP ROW: tilted wordmark polaroid + washi tape ────── */}
        <header className="mb-10 grid grid-cols-12 items-start gap-6">
          <div className="col-span-12 lg:col-span-7">
            <div
              className="inline-block"
              style={{
                background: "#FAF8F2",
                padding: "20px 28px 36px 28px",
                transform: "rotate(-2.2deg)",
                boxShadow: "0 1px 0 0 rgba(20,16,12,0.06), 0 16px 30px -16px rgba(20,16,12,0.5)",
              }}
            >
              <div
                className="font-display"
                style={{ color: "rgb(var(--ink-300))", fontSize: "clamp(2.75rem, 11vw, 4.5rem)", lineHeight: 0.95 }}
              >
                The N2K Almanac
              </div>
              <div
                className="font-body mt-1"
                style={{ color: "rgb(var(--ink-200))", fontSize: "clamp(1rem, 4vw, 1.25rem)" }}
              >
                {themeMeta.tagline}
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5 flex flex-col items-end gap-3">
            <WashiTape rotation={3.5} bg="rgb(var(--accent-500))">
              {themeMeta.label} ✿ {themeMeta.ornaments.mastheadSuffix}
            </WashiTape>
            {index.status === "ready" && (
              <WashiTape rotation={-2.2} bg="rgb(var(--support-500))">
                {new Date(index.value.generatedAt).toISOString().slice(0, 10)} · roll developed
              </WashiTape>
            )}
            {index.status === "ready" && (
              <TornPaperNote>
                <Stat label="triples" value={index.value.diceTriplesTotal.toLocaleString()} />
                <Stat label="records" value={index.value.recordsWritten.toLocaleString()} />
                <Stat label="targets" value={`${index.value.totalMin}–${index.value.totalMax}`} />
              </TornPaperNote>
            )}
          </div>
        </header>

        {/* ── BODY: a polaroid card containing the page surface ─── */}
        <main
          className="page-surface"
          style={{
            padding: "clamp(20px, 5vw, 44px) clamp(18px, 5vw, 48px) clamp(28px, 7vw, 64px)",
            transform: "rotate(0.6deg)",
            position: "relative",
          }}
        >
          {children}
          {/* paper-clip bottom-right */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: "-18px",
              right: "60px",
              width: "60px",
              height: "10px",
              background: "transparent",
              borderTop: "3px solid rgb(var(--accent-500))",
              borderLeft: "3px solid rgb(var(--accent-500))",
              borderBottom: "3px solid rgb(var(--accent-500))",
              borderRight: "none",
              borderRadius: "8px 0 0 8px",
              transform: "rotate(-12deg)",
              opacity: 0.85,
            }}
          />
        </main>

        {/* ── NAVIGATION: row of tilted polaroids ───────────────── */}
        <nav className="mt-12 flex items-end justify-center gap-4 flex-wrap" aria-label="Sections">
          {navItems.map((item, i) => (
            <PolaroidNavCard
              key={item.id}
              item={item}
              rotation={i % 2 === 0 ? -3 : 3}
            />
          ))}
        </nav>

        {/* ── FOOTER: edition selector on a washi tape strip ────── */}
        <footer className="mt-12 flex flex-wrap items-end justify-between gap-6">
          <div>
            <div
              className="font-body mb-2"
              style={{ color: "rgb(var(--ink-200))", fontSize: "12px", letterSpacing: "0.10em", textTransform: "uppercase" }}
            >
              ✿ change the roll
            </div>
            <ThemeSelector orientation="horizontal" />
          </div>
          <div
            className="max-w-md text-left font-body sm:text-right"
            style={{ color: "rgb(var(--ink-200))", fontSize: "15px", lineHeight: 1.4 }}
          >
            <div
              className="font-display mb-1"
              style={{ fontSize: "22px", color: "rgb(var(--ink-300))" }}
            >
              colophon
            </div>
            {FOOTER_COLOPHON[themeId]}
          </div>
        </footer>
      </div>
    </div>
  );
});

function WashiTape({
  children,
  rotation,
  bg,
}: {
  children: ReactNode;
  rotation: number;
  bg: string;
}) {
  return (
    <div
      className="font-body"
      style={{
        background: bg,
        color: "#FAF8F2",
        padding: "6px 18px",
        fontSize: "14px",
        transform: `rotate(${rotation}deg)`,
        opacity: 0.92,
        boxShadow: "1px 1px 4px rgba(20,16,12,0.18)",
        backgroundImage:
          "linear-gradient(45deg, rgba(255,255,255,0.10) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.10) 75%, transparent 75%)",
        backgroundSize: "10px 10px",
      }}
    >
      {children}
    </div>
  );
}

function TornPaperNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="mt-2 flex flex-wrap items-end gap-4"
      style={{
        background: "#FAF8F2",
        padding: "12px 20px 16px 20px",
        transform: "rotate(-1.4deg)",
        boxShadow: "0 1px 0 0 rgba(20,16,12,0.06), 0 8px 18px -10px rgba(20,16,12,0.4)",
        borderTop: "2px dashed rgba(20,16,12,0.20)",
        borderBottom: "2px dashed rgba(20,16,12,0.20)",
      }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="font-mono"
        style={{
          fontSize: "10px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgb(var(--ink-200))",
        }}
      >
        {label}
      </div>
      <div
        className="font-display tabular leading-none"
        style={{ fontSize: "26px", color: "rgb(var(--ink-300))" }}
      >
        {value}
      </div>
    </div>
  );
}

const PolaroidNavCard = observer(function PolaroidNavCard({
  item,
  rotation,
}: {
  item: NavItemT;
  rotation: number;
}) {
  const store = useStore();
  const active = store.view === item.id;

  return (
    <button
      type="button"
      onClick={() => store.setView(item.id)}
      title={item.subtitle}
      className="transition-transform hover:-translate-y-1"
      style={{
        background: active ? "rgb(var(--accent-500))" : "#FAF8F2",
        color: active ? "#FAF8F2" : "rgb(var(--ink-300))",
        padding: "20px 18px 28px 18px",
        width: "130px",
        transform: `rotate(${rotation}deg)`,
        boxShadow: active
          ? "0 8px 18px -6px rgba(20,16,12,0.45), 0 0 0 2px rgb(var(--accent-500))"
          : "0 1px 0 0 rgba(20,16,12,0.06), 0 10px 22px -10px rgba(20,16,12,0.45)",
      }}
    >
      <div
        className="font-mono mb-2"
        style={{
          fontSize: "10px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          opacity: active ? 0.85 : 0.6,
        }}
      >
        {item.folio} ✿
      </div>
      <div
        className="font-display leading-none"
        style={{ fontSize: "clamp(1.5rem, 6vw, 2rem)" }}
      >
        {item.label.toLowerCase()}
      </div>
      <div
        className="font-body mt-2 leading-tight"
        style={{ fontSize: "13px", opacity: active ? 0.9 : 0.7 }}
      >
        {item.subtitle}
      </div>
    </button>
  );
});
