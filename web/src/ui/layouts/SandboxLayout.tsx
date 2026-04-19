/**
 * SandboxLayout — "Game Sandbox" showcase.
 *
 * v2 refactored the game logic into a pure `Game<TConfig, TState,
 * TMove>` kernel + `Player` interfaces, which means we can run bot-vs-bot
 * matches headlessly, scrub through replays, and pre-allocate seats for
 * future multiplayer. This layout puts that machinery on display:
 *
 *   - top header reads like a game-room HUD with a SEAT slot for each
 *     of the 4 players plus a "join multiplayer" affordance,
 *   - left rail lists the surface views as game-room panels,
 *   - right rail shows the kernel inspector (current player, remaining
 *     budget, last move, bot personas) wired straight into PlayStore.
 *
 * The body itself remains the standard view children — Sandbox just
 * frames it so you can SEE the kernel at work.
 */
import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";
import { ThemeSelector } from "../primitives/ThemeSelector.js";
import { colophonFor } from "./nav.js";
import type { LayoutProps } from "./types.js";

export const SandboxLayout = observer(function SandboxLayout({
  nav,
  activeId,
  onNavigate,
  children,
  themeId,
  statsLine,
}: LayoutProps) {
  return (
    <div
      className="min-h-screen w-full"
      style={{
        background:
          "radial-gradient(ellipse at 20% 0%, color-mix(in oklab, var(--color-accent) 10%, var(--color-bg)) 0%, var(--color-bg) 60%)",
      }}
    >
      <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-10 lg:py-10 space-y-5">
        <HeroBar themeId={themeId} statsLine={statsLine} />

        <div className="grid grid-cols-12 gap-5">
          <aside className="col-span-12 lg:col-span-3 space-y-4">
            <PanelRail nav={nav} activeId={activeId} onNavigate={onNavigate} />
            <ThemeBlock />
          </aside>

          <main className="col-span-12 lg:col-span-6">
            <div
              className="page-surface px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-rule)" }}
            >
              {children}
            </div>
          </main>

          <aside className="col-span-12 lg:col-span-3">
            <KernelInspector />
          </aside>
        </div>

        <footer
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 font-mono text-[11px]"
          style={{
            background: "color-mix(in oklab, var(--color-ink) 88%, var(--color-bg) 12%)",
            color: "color-mix(in oklab, var(--color-bg) 80%, transparent)",
            borderRadius: 6,
          }}
        >
          <span>seat: ≤ 4 · kernel: pure · replay-ready</span>
          <span>{colophonFor(themeId)}</span>
        </footer>
      </div>
    </div>
  );
});

const HeroBar = observer(function HeroBar({
  themeId,
  statsLine,
}: {
  readonly themeId: string;
  readonly statsLine: string | undefined;
}) {
  return (
    <header
      className="flex flex-wrap items-stretch gap-3 px-4 py-3 lg:px-6 lg:py-4"
      style={{
        background: "color-mix(in oklab, var(--color-ink) 92%, var(--color-bg) 8%)",
        color: "color-mix(in oklab, var(--color-bg) 85%, transparent)",
        borderRadius: 8,
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="flex flex-col">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-70">N2K · Game Sandbox</span>
        <span style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 700 }}>
          Room <span style={{ color: "var(--color-accent)" }}>0xN2K</span>
        </span>
        <span className="font-mono text-[10px] opacity-60">theme: {themeId}</span>
      </div>
      <div className="flex-1 flex flex-wrap items-center justify-end gap-2">
        <Seat seat={1} label="You" filled />
        <Seat seat={2} label="Bot · easy" filled />
        <Seat seat={3} label="Bot · standard" filled />
        <Seat seat={4} label="Bot · Æther" filled />
        <Seat seat={5} label="Multiplayer (soon)" filled={false} />
      </div>
      {statsLine !== undefined ? (
        <div className="font-mono text-[11px] opacity-80 self-center">{statsLine}</div>
      ) : null}
    </header>
  );
});

function Seat({ seat, label, filled }: { readonly seat: number; readonly label: string; readonly filled: boolean }) {
  return (
    <div
      className="flex flex-col items-center px-3 py-2"
      style={{
        background: filled
          ? "color-mix(in oklab, var(--color-accent) 28%, transparent)"
          : "color-mix(in oklab, var(--color-bg) 18%, transparent)",
        border: filled
          ? "1px solid var(--color-accent)"
          : "1px dashed color-mix(in oklab, var(--color-bg) 60%, transparent)",
        borderRadius: 6,
        minWidth: 90,
      }}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] opacity-70">Seat {seat}</span>
      <span style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function PanelRail({
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
      <h2 className="label-caps mb-3">Rooms</h2>
      <ul className="space-y-1">
        {nav.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                className="w-full text-left px-2 py-1.5 flex items-baseline justify-between"
                style={{
                  background: active ? "color-mix(in oklab, var(--color-accent) 18%, transparent)" : "transparent",
                  color: active ? "var(--color-accent)" : "var(--color-ink)",
                  border: active ? "1px solid var(--color-accent)" : "1px solid transparent",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontFamily: "var(--font-serif)" }}>{item.label}</span>
                <span className="font-mono text-[10px] opacity-60">{item.folio}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ThemeBlock() {
  return (
    <section
      className="px-4 py-4"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-rule)",
        borderRadius: 6,
      }}
    >
      <h2 className="label-caps mb-3">Edition</h2>
      <ThemeSelector orientation="vertical" />
    </section>
  );
}

const KernelInspector = observer(function KernelInspector() {
  const { play } = useAppStore();
  const state = play.state;
  const remaining = state?.remainingBudget;
  return (
    <section
      className="px-4 py-4"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-rule)",
        borderRadius: 6,
      }}
    >
      <h2 className="label-caps mb-3">Kernel</h2>
      {state === null ? (
        <p className="text-[12px] italic" style={{ color: "var(--color-ink-muted)" }}>
          Open the Play view to start a match. The kernel state will appear here in real time.
        </p>
      ) : (
        <dl className="space-y-2 font-mono text-[11px]" style={{ color: "var(--color-ink)" }}>
          <Row k="game" v="N2K Classic" />
          <Row k="mode" v={state.config.mode.id} />
          <Row k="players" v={String(state.playerIds.length)} />
          <Row k="turn" v={play.currentPlayer ?? "—"} />
          <Row k="ply" v={String(state.turn)} />
          <Row k="claimed" v={`${state.claimed.size} cells`} />
          <Row k="dice-pool" v={String(state.dicePool.length)} />
          {remaining !== undefined ? (
            <div className="pt-2" style={{ borderTop: "1px dashed var(--color-rule)" }}>
              <div className="label-caps mb-1">Budgets</div>
              {[...remaining.entries()].map(([id, budget]) => (
                <Row key={id} k={id} v={`${budget.toFixed(1)} pts`} />
              ))}
            </div>
          ) : null}
          <div className="pt-2" style={{ borderTop: "1px dashed var(--color-rule)" }}>
            <div className="label-caps mb-1">Score</div>
            {Object.entries(play.scoreboard).map(([id, val]) => (
              <Row key={id} k={id} v={String(val)} />
            ))}
          </div>
          {play.isBotThinking ? (
            <div
              className="pt-2 italic"
              style={{ borderTop: "1px dashed var(--color-rule)", color: "var(--color-accent)" }}
            >
              bot thinking…
            </div>
          ) : null}
        </dl>
      )}
      <div
        className="mt-3 pt-3 font-mono text-[10px]"
        style={{ borderTop: "1px dashed var(--color-rule)", color: "var(--color-ink-muted)" }}
      >
        Game&lt;Config, State, Move&gt; + Player are pure interfaces — same
        kernel powers single-player vs bots, future multiplayer, and
        replay scrubbing.
      </div>
    </section>
  );
});

function Row({ k, v }: { readonly k: string; readonly v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span style={{ color: "var(--color-ink-muted)" }}>{k}</span>
      <span style={{ color: "var(--color-ink)" }}>{v}</span>
    </div>
  );
}
