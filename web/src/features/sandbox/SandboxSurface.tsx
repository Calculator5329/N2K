/**
 * Sandbox surface — game-kernel HUD.
 *
 * Mirrors the live `Game<Config, State, Move>` kernel state from
 * `PlayStore`. Until a match is started in the Play surface, this is
 * a read-only description of what the kernel is wired up to do.
 */
import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";

export const SandboxSurface = observer(function SandboxSurface() {
  const { play } = useAppStore();
  const state = play.state;

  return (
    <div className="space-y-6">
      <header>
        <div className="label-caps text-accent-500 text-[10px] mb-1">Game kernel</div>
        <h1 className="font-display text-[34px] leading-[1.05] text-ink-500" style={{ letterSpacing: "-0.01em" }}>
          Sandbox
        </h1>
        <p className="mt-3 max-w-prose text-[14px] text-ink-300 leading-relaxed">
          The same pure <code>Game&lt;Config, State, Move&gt;</code> kernel that powers
          the Play view also drives bot-vs-bot replays and (soon) multiplayer seats.
          Start a match in <strong>Play</strong> and the kernel state will stream in below.
        </p>
      </header>

      <section
        className="px-4 py-3"
        style={{
          background: "rgb(var(--paper-100))",
          border: "1px solid rgb(var(--ink-100))",
          borderRadius: 4,
        }}
      >
        <h3 className="label-caps text-ink-300 text-[10px] mb-2">What's wired</h3>
        <ul className="space-y-1.5 text-[13px] text-ink-500">
          <li><strong>Pure kernel</strong> — every state transition is a pure function.</li>
          <li><strong>Bot players</strong> — four ranked personas behind the same <code>Player</code> interface.</li>
          <li><strong>Replay-ready</strong> — saving the seed + move log reconstructs any match.</li>
          <li><strong>Open seat</strong> — seat 5 reserved for the multiplayer drop-in.</li>
        </ul>
      </section>

      <section
        className="px-4 py-3"
        style={{
          background: "rgb(var(--paper-100))",
          border: "1px solid rgb(var(--ink-100))",
          borderRadius: 4,
        }}
      >
        <h3 className="label-caps text-ink-300 text-[10px] mb-2">Live kernel</h3>
        {state === null ? (
          <p className="text-[13px] text-ink-300 italic">
            No active match — open the <strong>Play</strong> surface and start one.
          </p>
        ) : (
          <dl className="font-mono text-[11px] text-ink-500 space-y-1">
            <Row k="mode" v={state.config.mode.id} />
            <Row k="players" v={String(state.playerIds.length)} />
            <Row k="ply" v={String(state.turn)} />
            <Row k="claimed" v={`${state.claimed.size} cells`} />
            <Row k="dice-pool" v={String(state.dicePool.length)} />
            <Row k="turn" v={play.currentPlayer ?? "—"} />
            {Object.entries(play.scoreboard).map(([id, val]) => (
              <Row key={id} k={`score:${id}`} v={String(val)} />
            ))}
            {play.isBotThinking ? (
              <div className="pt-1 italic text-accent-500">bot thinking…</div>
            ) : null}
          </dl>
        )}
      </section>
    </div>
  );
});

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-300">{k}</dt>
      <dd className="tabular">{v}</dd>
    </div>
  );
}
