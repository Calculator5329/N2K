import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useAppStore } from "./stores/AppStoreContext.js";
import { LookupView } from "./features/lookup/LookupView.js";
import { ExploreView } from "./features/explore/ExploreView.js";
import { CompareView } from "./features/compare/CompareView.js";
import { VisualizeView } from "./features/visualize/VisualizeView.js";
import { ComposeView } from "./features/compose/ComposeView.js";
import { PlayView } from "./features/play/PlayView.js";
import { GalleryView } from "./features/gallery/GalleryView.js";

type SurfaceId =
  | "lookup"
  | "play"
  | "explore"
  | "compare"
  | "visualize"
  | "compose"
  | "gallery"
  | "about";

const SURFACES: ReadonlyArray<{ id: SurfaceId; label: string }> = [
  { id: "lookup", label: "Lookup" },
  { id: "play", label: "Play" },
  { id: "explore", label: "Explore" },
  { id: "compare", label: "Compare" },
  { id: "visualize", label: "Visualize" },
  { id: "compose", label: "Compose" },
  { id: "gallery", label: "Gallery" },
  { id: "about", label: "About" },
];

export const App = observer(function App() {
  const store = useAppStore();
  const { theme, compose } = store;
  const initialSurface: SurfaceId =
    typeof window !== "undefined" && /(?:^|[#&])plan=/.test(window.location.hash)
      ? "compose"
      : "lookup";
  const [surface, setSurface] = useState<SurfaceId>(initialSurface);

  useEffect(() => {
    theme.applyTo(document.documentElement);
  }, [theme, theme.activeId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!/(?:^|[#&])plan=/.test(window.location.hash)) return;
    void compose.loadFromUrl();
  }, [compose]);

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "var(--color-bg)", color: "var(--color-ink)" }}
    >
      <header className="border-b" style={{ borderColor: "var(--color-rule)" }}>
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-baseline gap-6 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">N2K</h1>
              <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                v2 platform
              </p>
            </div>
            <nav role="tablist" aria-label="Surfaces" className="flex gap-1 flex-wrap">
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
                      border: "1px solid var(--color-rule)",
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

      <main>{renderSurface(surface)}</main>
    </div>
  );
});

function renderSurface(surface: SurfaceId) {
  switch (surface) {
    case "lookup":
      return <LookupView />;
    case "play":
      return <PlayView />;
    case "explore":
      return <ExploreView />;
    case "compare":
      return <CompareView />;
    case "visualize":
      return <VisualizeView />;
    case "compose":
      return <ComposeView />;
    case "gallery":
      return <GalleryView />;
    case "about":
      return <AboutView />;
  }
}

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
          <li>• Play — N2K Classic against four bot personas (easy / standard / hard / Æther)</li>
          <li>• Explore — sortable, filterable index of every legal dice tuple per mode with starring</li>
          <li>• Compare — overlay up to four tuples on a difficulty-vs-target chart, persisted across reloads</li>
          <li>• Visualize — atlas heatmap, difficulty histogram, and scatter of solvable count vs. average difficulty</li>
          <li>• Compose — multi-board editor + balanced two-player generator with JSON / CSV / PDF / DOCX export and shareable URLs</li>
          <li>• Gallery — every bundled theme rendered side-by-side with live activation</li>
          <li>• Theme switcher backed by the structured theme registry (10 bundled editions)</li>
        </ul>
      </Card>

      <Card title="Coming next">
        <ul className="text-sm space-y-1.5" style={{ color: "var(--color-ink-muted)" }}>
          <li>• Web Worker solver + HTTP dataset client backed by the bulk export pipeline (Phase 1 output)</li>
          <li>• User-authored themes (NLP-generated via Gemini) registered into the same `ThemeRegistry`</li>
          <li>• Async multiplayer + tournaments backed by Cloud Run + Firestore + Firebase Auth</li>
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
