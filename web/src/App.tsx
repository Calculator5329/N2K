/**
 * App — root composition.
 *
 * Picks the active surface (Lookup, Play, …) and hands rendering to
 * `PageShell`, which selects the layout component (Board, Manuscript,
 * Studio, Sandbox, …) based on the active theme. Feature views render
 * inside the layout's main slot — every layout therefore stays in
 * charge of chrome (masthead, navigation, colophon) while the views
 * stay in charge of content.
 */
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
import { PageShell } from "./ui/layouts/PageShell.js";
import { PageHeader } from "./ui/primitives/PageHeader.js";
import { ThemeSelector } from "./ui/primitives/ThemeSelector.js";
import { navItemById } from "./ui/layouts/nav.js";
import type { SurfaceId } from "./ui/layouts/types.js";

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
    <PageShell activeSurface={surface} onNavigate={setSurface}>
      {renderSurface(surface)}
    </PageShell>
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
    case "studio":
      return <StudioSurface />;
    case "sandbox":
      return <SandboxSurface />;
    case "about":
      return <AboutView />;
  }
}

const StudioSurface = observer(function StudioSurface() {
  const item = navItemById("studio");
  const { services } = useAppStore();
  const seams: ReadonlyArray<{ readonly key: string; readonly impl: string; readonly hint: string }> = [
    { key: "ContentBackend", impl: services.content.constructor.name, hint: "boards · themes · plans" },
    { key: "IdentityService", impl: services.identity.constructor.name, hint: "anonymous → cloud sign-in" },
    { key: "AIService", impl: services.ai.constructor.name, hint: "theme + plan generation" },
    { key: "DatasetClient", impl: services.dataset.constructor.name, hint: "tuple sweeps + caching" },
    { key: "SolverWorkerService", impl: services.solverWorker.constructor.name, hint: "interactive solves" },
    { key: "TupleIndexService", impl: services.tupleIndex.constructor.name, hint: "explore catalog" },
    { key: "CompetitionService", impl: services.competition.constructor.name, hint: "balanced board generator" },
  ];
  return (
    <div className="space-y-8">
      <PageHeader
        folio={item.folio}
        eyebrow="Live service"
        title={item.label}
        dek="Every render in this app reaches the screen through one of seven swappable service seams. Today they're local. Tomorrow they're Cloud Run, Firestore, Firebase Auth, and Gemini — without a single feature view changing."
      />

      <section
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        aria-label="Service seams"
      >
        {seams.map((s) => (
          <article
            key={s.key}
            className="px-5 py-4"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-rule)",
              borderRadius: 6,
            }}
          >
            <header className="flex items-baseline justify-between gap-3 mb-2">
              <h3 style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 600 }}>
                {s.key}
              </h3>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{
                  color: "var(--color-accent)",
                  border: "1px solid color-mix(in oklab, var(--color-accent) 60%, transparent)",
                  borderRadius: 3,
                  padding: "2px 6px",
                }}
              >
                {s.impl}
              </span>
            </header>
            <p className="text-[12px]" style={{ color: "var(--color-ink-muted)" }}>
              {s.hint}
            </p>
          </article>
        ))}
      </section>

      <section
        className="px-5 py-4"
        style={{
          background: "var(--color-surface)",
          border: "1px dashed var(--color-rule)",
          borderRadius: 6,
        }}
      >
        <h3 className="label-caps mb-2">Edition</h3>
        <p className="text-[12px] mb-3" style={{ color: "var(--color-ink-muted)" }}>
          The Studio chrome itself is just one more theme/layout combo —
          flip the edition below to see the same data wrapped in a
          completely different visual world.
        </p>
        <ThemeSelector orientation="horizontal" />
      </section>
    </div>
  );
});

const SandboxSurface = observer(function SandboxSurface() {
  const item = navItemById("sandbox");
  const { play } = useAppStore();
  return (
    <div className="space-y-8">
      <PageHeader
        folio={item.folio}
        eyebrow="Game kernel"
        title={item.label}
        dek="The same pure Game<Config, State, Move> kernel that powers the Play view also drives bot-vs-bot replays and (soon) multiplayer seats. Start a match in Play and watch the kernel state stream into the Sandbox sidebars."
      />

      <section
        className="px-5 py-4"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-rule)",
          borderRadius: 6,
        }}
      >
        <h3 className="label-caps mb-3">What's wired</h3>
        <ul className="space-y-2 text-[13px]" style={{ color: "var(--color-ink)" }}>
          <li>
            <strong>Pure kernel</strong> — every state transition is a
            pure function: <code>applyMove(state, move, playerId)</code>.
            No DOM, no MobX, no time.
          </li>
          <li>
            <strong>Bot players</strong> — four ranked personas (easy /
            standard / hard / Æther) implement the same{" "}
            <code>Player</code> interface a remote multiplayer seat will.
          </li>
          <li>
            <strong>Replay-ready</strong> — because the kernel is pure,
            saving the seed + move log is enough to reconstruct any
            match for review.
          </li>
          <li>
            <strong>Open seat</strong> — seats 1–4 in the room HUD are
            real today; seat 5 is reserved for the multiplayer drop-in
            once Cloud Run identity lands.
          </li>
        </ul>
      </section>

      <section
        className="px-5 py-4"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-rule)",
          borderRadius: 6,
        }}
      >
        <h3 className="label-caps mb-2">Live kernel</h3>
        {play.state === null ? (
          <p className="text-[13px]" style={{ color: "var(--color-ink-muted)" }}>
            No active match — open the <strong>Play</strong> surface and
            start one. The Sandbox HUD will mirror the kernel state,
            scoreboard, and remaining time budget for every seat in real
            time.
          </p>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--color-ink-muted)" }}>
            Active match: mode <strong>{play.state.config.mode.id}</strong>,
            ply <strong>{play.state.turn}</strong>,{" "}
            <strong>{play.state.claimed.size}</strong> cell
            {play.state.claimed.size === 1 ? "" : "s"} claimed,
            current seat <strong>{play.currentPlayer ?? "—"}</strong>.
          </p>
        )}
      </section>
    </div>
  );
});

const AboutView = observer(function AboutView() {
  const { identity } = useAppStore();
  const item = navItemById("about");
  return (
    <div className="space-y-8">
      <PageHeader
        folio={item.folio}
        eyebrow="Colophon"
        title="About"
        dek="N2K v2 — pluggable services, structured themes, real game kernel."
      />

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
          <li>• Lookup — pick mode + dice, see every reachable target with the easiest equation</li>
          <li>• Play — N2K Classic against four bot personas (easy / standard / hard / Æther)</li>
          <li>• Explore — sortable, filterable, virtualized index of every legal dice tuple</li>
          <li>• Compare — overlay up to four tuples on a difficulty-vs-target chart</li>
          <li>• Visualize — atlas heatmap, difficulty histogram, scatter of solvable count vs. avg difficulty</li>
          <li>• Compose — multi-board editor + balanced two-player generator with JSON / CSV / PDF / DOCX export</li>
          <li>• Gallery — every bundled theme rendered side-by-side with live activation</li>
          <li>• Studio — every pluggable service seam, surfaced</li>
          <li>• Sandbox — game kernel HUD with seat slots and live state inspector</li>
          <li>• Theme registry — 10 bundled editions, each with its own layout + glyph + ornaments</li>
          <li>• Web Worker solver + virtualized large tables (no main-thread jank)</li>
        </ul>
      </Card>

      <Card title="Coming next">
        <ul className="text-sm space-y-1.5" style={{ color: "var(--color-ink-muted)" }}>
          <li>• HTTP dataset client backed by the bulk export pipeline</li>
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
        border: "1px solid var(--color-rule)",
      }}
    >
      <h2 className="label-caps mb-3" style={{ color: "var(--color-ink-muted)" }}>
        {props.title}
      </h2>
      {props.children}
    </section>
  );
});
