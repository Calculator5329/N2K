import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useAppStore } from "./stores/AppStoreContext.js";
import { LookupView } from "./features/lookup/LookupView.js";

type SurfaceId = "lookup" | "about";

const SURFACES: ReadonlyArray<{ id: SurfaceId; label: string }> = [
  { id: "lookup", label: "Lookup" },
  { id: "about", label: "About" },
];

export const App = observer(function App() {
  const store = useAppStore();
  const { theme } = store;
  const [surface, setSurface] = useState<SurfaceId>("lookup");

  useEffect(() => {
    theme.applyTo(document.documentElement);
  }, [theme, theme.activeId]);

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "var(--color-bg)", color: "var(--color-ink)" }}
    >
      <header className="border-b" style={{ borderColor: "var(--color-rule)" }}>
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-6">
          <div className="flex items-baseline gap-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">N2K</h1>
              <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                v2 platform
              </p>
            </div>
            <nav role="tablist" aria-label="Surfaces" className="flex gap-1">
              {SURFACES.map((s) => {
                const active = surface === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSurface(s.id)}
                    className="px-3 py-1.5 text-sm rounded"
                    style={{
                      background: active ? "var(--color-accent)" : "transparent",
                      color: active ? "var(--color-bg)" : "var(--color-ink)",
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </nav>
          </div>
          <ThemeSwitcher />
        </div>
      </header>

      <main>{surface === "lookup" ? <LookupView /> : <AboutView />}</main>
    </div>
  );
});

const AboutView = observer(function AboutView() {
  const { identity } = useAppStore();
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <Card title="Identity">
        <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
          Signed in as
        </p>
        <p className="text-lg font-medium">{identity.user.displayName}</p>
        <p className="text-xs mt-1" style={{ color: "var(--color-ink-muted)" }}>
          id: <code>{identity.user.id}</code>
          {identity.user.anonymous ? " (anonymous, local)" : ""}
        </p>
      </Card>

      <Card title="What works today">
        <ul className="text-sm space-y-1.5" style={{ color: "var(--color-ink-muted)" }}>
          <li>• Lookup — pick mode + dice, see every reachable target with the easiest equation, drill into all solutions</li>
          <li>• Theme switcher backed by the structured theme registry (5 bundled editions)</li>
          <li>• Three pluggable service seams: ContentBackend / IdentityService / AIService</li>
          <li>• DatasetClient + SolverWorkerService (live solver fallback today, Phase 1 chunks + Web Worker tomorrow)</li>
        </ul>
      </Card>

      <Card title="Coming next">
        <ul className="text-sm space-y-1.5" style={{ color: "var(--color-ink-muted)" }}>
          <li>• Play — N2K Classic playable surface against bot personas</li>
          <li>• Compose — board editor + competition generator + DOCX/PDF export</li>
          <li>• Compare / Visualize — multi-tuple charts, heatmaps, scatter plots</li>
          <li>• Gallery — browse the bundled theme editions in a single grid</li>
        </ul>
      </Card>
    </div>
  );
});

const Card = observer(function Card(props: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="p-6"
      style={{
        background: "var(--color-surface)",
        boxShadow: "var(--shadow-card)",
        borderRadius: "var(--radius-card)",
      }}
    >
      <h2 className="text-sm uppercase tracking-wider mb-3" style={{ color: "var(--color-ink-muted)" }}>
        {props.title}
      </h2>
      {props.children}
    </section>
  );
});

const ThemeSwitcher = observer(function ThemeSwitcher() {
  const store = useAppStore();
  return (
    <select
      value={store.theme.activeId}
      onChange={(e) => store.theme.setActive(e.target.value)}
      className="text-sm rounded px-2 py-1.5 border"
      style={{
        borderColor: "var(--color-rule)",
        background: "var(--color-surface)",
        color: "var(--color-ink)",
      }}
    >
      {store.theme.availableThemes.map((t) => (
        <option key={t.id} value={t.id}>
          {t.displayName}
        </option>
      ))}
    </select>
  );
});
