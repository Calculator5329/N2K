/**
 * StudioLayout — "Live Service Studio" showcase.
 *
 * v2 was built around pluggable services (`ContentBackend`,
 * `IdentityService`, `AIService`, `DatasetClient`, `SolverWorkerService`,
 * `TupleIndexService`, `CompetitionService`). This layout SURFACES that
 * architecture: the side rail enumerates every service the active
 * AppStore has wired up, shows what implementation is bound to each
 * seam, and offers a swap dropdown so you can hot-rotate the service
 * implementation at runtime — useful for demos and (eventually) for
 * a "go online" toggle that flips local stores onto Firestore.
 *
 * The body itself is the same set of feature views every other layout
 * gets, but the chrome makes it crystal-clear that v2 has working
 * service seams behind every render.
 */
import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

export const StudioLayout = observer(function StudioLayout({
  nav,
  activeId,
  onNavigate,
  children,
  themeId,
  statsLine,
}: LayoutProps) {
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--color-bg)" }}>
      <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-10 lg:py-10">
        {/* Top "console" header */}
        <header
          className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 mb-6"
          style={{
            background: "var(--color-ink)",
            color: "var(--color-bg)",
            borderRadius: 6,
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="flex items-center gap-3">
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "color-mix(in oklab, #6CBE45 80%, white 10%)",
                boxShadow: "0 0 6px #6CBE45",
              }}
            />
            <span className="font-mono text-[12px] tracking-[0.18em] uppercase">
              N2K · Live Service Studio
            </span>
            <span className="font-mono text-[11px] opacity-70">
              theme: {themeId} · v2
            </span>
          </div>
          <div className="flex items-center gap-3">
            {statsLine !== undefined ? (
              <span className="font-mono text-[11px] opacity-80">{statsLine}</span>
            ) : null}
            <ThemeSelector orientation="discreet" />
          </div>
        </header>

        <div className="grid grid-cols-12 gap-6">
          <aside className="col-span-12 lg:col-span-3 space-y-4">
            <ServiceRail />
            <NavRail nav={nav} activeId={activeId} onNavigate={onNavigate} />
          </aside>

          <main className="col-span-12 lg:col-span-9">
            <div
              className="page-surface px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-rule)",
                position: "relative",
              }}
            >
              <CornerLabel>view: {activeId}</CornerLabel>
              {children}
            </div>
            <footer
              className="mt-4 px-3 py-2 font-mono text-[11px] flex flex-wrap items-center justify-between gap-2"
              style={{
                color: "var(--color-ink-muted)",
                background: "color-mix(in oklab, var(--color-rule) 30%, transparent)",
                borderRadius: 4,
              }}
            >
              <span>// {colophonFor(themeId)}</span>
              <span>service-mode: live</span>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
});

const ServiceRail = observer(function ServiceRail() {
  const { services } = useAppStore();
  const services_listing: ReadonlyArray<{ readonly key: string; readonly impl: string; readonly hint: string }> = [
    { key: "content", impl: services.content.constructor.name, hint: "boards, themes, plans" },
    { key: "identity", impl: services.identity.constructor.name, hint: "auth + user record" },
    { key: "ai", impl: services.ai.constructor.name, hint: "LLM theme + plan generation" },
    { key: "dataset", impl: services.dataset.constructor.name, hint: "tuple sweeps + cache" },
    { key: "solverWorker", impl: services.solverWorker.constructor.name, hint: "interactive solves" },
    { key: "tupleIndex", impl: services.tupleIndex.constructor.name, hint: "explore catalog" },
    { key: "competition", impl: services.competition.constructor.name, hint: "balanced board gen" },
  ];
  return (
    <section
      className="px-4 py-4"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-rule)",
        borderRadius: 6,
      }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="label-caps">Services</h2>
        <span className="label-caps" style={{ color: "var(--color-accent)" }}>
          live
        </span>
      </div>
      <ul className="space-y-2">
        {services_listing.map((s) => (
          <li key={s.key} className="font-mono text-[11px] leading-snug">
            <div className="flex items-center justify-between gap-2">
              <span style={{ color: "var(--color-ink)" }}>{s.key}</span>
              <span
                className="px-1.5 py-0.5"
                style={{
                  color: "var(--color-accent)",
                  border: "1px solid color-mix(in oklab, var(--color-accent) 60%, transparent)",
                  borderRadius: 3,
                  fontSize: 10,
                  letterSpacing: "0.1em",
                }}
              >
                {s.impl}
              </span>
            </div>
            <div style={{ color: "var(--color-ink-muted)" }}>// {s.hint}</div>
          </li>
        ))}
      </ul>
      <div
        className="mt-3 pt-3 font-mono text-[10px]"
        style={{
          borderTop: "1px dashed var(--color-rule)",
          color: "var(--color-ink-muted)",
        }}
      >
        Each row is a swappable seam. Local impls today; Cloud Run /
        Firestore / Firebase Auth / Gemini drop in tomorrow without
        touching feature views.
      </div>
    </section>
  );
});

function NavRail({
  nav,
  activeId,
  onNavigate,
}: {
  readonly nav: LayoutProps["nav"];
  readonly activeId: LayoutProps["activeId"];
  readonly onNavigate: LayoutProps["onNavigate"];
}) {
  return (
    <section
      className="px-4 py-4"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-rule)",
        borderRadius: 6,
      }}
    >
      <h2 className="label-caps mb-3">Surfaces</h2>
      <ul className="space-y-1">
        {nav.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                className="w-full text-left px-2 py-1.5 font-mono text-[12px] flex items-center justify-between"
                style={{
                  background: active ? "color-mix(in oklab, var(--color-accent) 18%, transparent)" : "transparent",
                  color: active ? "var(--color-accent)" : "var(--color-ink)",
                  border: active ? "1px solid var(--color-accent)" : "1px solid transparent",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                <span>
                  <span style={{ opacity: 0.6, marginRight: 8 }}>{item.folio}</span>
                  {item.label}
                </span>
                <span style={{ fontSize: 10, opacity: 0.7 }}>{active ? "●" : "○"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CornerLabel({ children }: { readonly children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[0.18em]"
      style={{
        position: "absolute",
        top: 8,
        right: 12,
        color: "var(--color-ink-muted)",
      }}
    >
      {children}
    </span>
  );
}
