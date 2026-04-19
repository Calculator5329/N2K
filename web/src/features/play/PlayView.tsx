/**
 * PlayView — single human vs single bot N2K Classic match.
 *
 * Setup screen → board with dice pool + scoreboard + per-cell claim
 * dialog. The bot's turn ticks automatically; the view observes the
 * `PlayStore` for state changes.
 */
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useAppStore } from "../../stores/AppStoreContext.js";
import {
  personasForMode,
  type PersonaId,
} from "@platform/games/personas.js";
import {
  formatEquationAgainstPool,
} from "@platform/services/parsing.js";
import type { NEquation } from "@platform/core/types.js";
import type { PlayModeId } from "../../stores/PlayStore.js";

export const PlayView = observer(function PlayView() {
  const { play } = useAppStore();
  if (play.state === null) return <SetupScreen />;
  return <MatchScreen />;
});

const SetupScreen = observer(function SetupScreen() {
  const { play } = useAppStore();
  const personas = personasForMode(play.mode);
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Play</h2>
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Solo match against a bot. Claim cells with dice equations; whoever ends with the highest score wins.
        </p>
      </header>
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Mode">
            <select
              value={play.setup.modeId}
              onChange={(e) => play.setSetup({ modeId: e.target.value as PlayModeId })}
              className="px-2 py-1 text-sm rounded border w-full"
              style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
            >
              <option value="standard">Standard</option>
              <option value="aether">Æther</option>
            </select>
          </Field>
          <Field label="Bot persona">
            <select
              value={play.setup.botPersonaId}
              onChange={(e) => play.setSetup({ botPersonaId: e.target.value as PersonaId })}
              className="px-2 py-1 text-sm rounded border w-full"
              style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
            >
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Who goes first">
            <select
              value={play.setup.humanFirst ? "human" : "bot"}
              onChange={(e) => play.setSetup({ humanFirst: e.target.value === "human" })}
              className="px-2 py-1 text-sm rounded border w-full"
              style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
            >
              <option value="human">You</option>
              <option value="bot">Bot</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => play.startMatch()}
            className="px-4 py-2 text-sm font-medium rounded"
            style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}
          >
            Start match
          </button>
        </div>
      </Card>
    </div>
  );
});

const MatchScreen = observer(function MatchScreen() {
  const { play } = useAppStore();
  const state = play.state!;
  const board = state.config.board;
  const dice = state.dicePool;

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Play — N2K Classic</h2>
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            {play.isTerminal
              ? "Match complete."
              : play.isMyTurn
                ? "Your turn — pick a cell to claim."
                : play.isBotThinking
                  ? "Bot is thinking…"
                  : "Bot's turn."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => play.pass()}
            disabled={!play.isMyTurn || play.isTerminal}
            className="px-3 py-1.5 text-sm rounded border"
            style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
          >
            Pass
          </button>
          <button
            type="button"
            onClick={() => play.restart()}
            className="px-3 py-1.5 text-sm rounded border"
            style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
          >
            New match
          </button>
        </div>
      </header>

      <div
        className="px-5 py-4"
        style={{ background: "var(--color-surface)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)" }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>
              Dice pool
            </p>
            <p className="text-2xl font-semibold tabular-nums">{dice.join(" · ")}</p>
          </div>
          <Scoreboard />
        </div>
      </div>

      {play.lastError !== null ? (
        <Card>
          <p className="text-sm" style={{ color: "var(--color-ink)" }}>
            {play.lastError}
          </p>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <Card>
          <BoardGrid />
        </Card>
        <Card>
          <ClaimPanel />
        </Card>
      </div>

      {play.isTerminal ? <TerminalSummary /> : null}
    </div>
  );
});

function Card(props: { children: React.ReactNode }) {
  return (
    <div
      className="px-5 py-4"
      style={{
        background: "var(--color-surface)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {props.children}
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
      {props.label}
      {props.children}
    </label>
  );
}

const Scoreboard = observer(function Scoreboard() {
  const { play } = useAppStore();
  const score = play.scoreboard;
  const human = score["human"] ?? 0;
  const bot = score["bot"] ?? 0;
  return (
    <div className="flex items-center gap-3 ml-auto">
      <ScoreChip label="You" value={human} highlight={play.currentPlayer === "human"} />
      <ScoreChip label="Bot" value={bot} highlight={play.currentPlayer === "bot"} />
    </div>
  );
});

function ScoreChip(props: { label: string; value: number; highlight: boolean }) {
  return (
    <div
      className="px-3 py-1.5 rounded text-sm tabular-nums"
      style={{
        background: props.highlight ? "var(--color-accent)" : "transparent",
        color: props.highlight ? "var(--color-bg)" : "var(--color-ink)",
        border: "1px solid var(--color-rule)",
      }}
    >
      <span className="font-semibold">{props.label}</span>
      <span className="ml-2">{props.value.toFixed(1)}</span>
    </div>
  );
}

const BoardGrid = observer(function BoardGrid() {
  const { play } = useAppStore();
  const state = play.state!;
  const board = state.config.board;
  return (
    <div className="grid grid-cols-6 gap-1">
      {board.cells.map((value, idx) => {
        const claim = state.claimed.get(idx);
        const claimedBy = claim?.byPlayer ?? null;
        const selected = play.selectedCellIndex === idx;
        const bg =
          claimedBy === "human"
            ? "color-mix(in oklab, var(--color-accent) 30%, var(--color-surface))"
            : claimedBy === "bot"
              ? "color-mix(in oklab, var(--color-ink) 35%, var(--color-surface))"
              : selected
                ? "var(--color-accent)"
                : "var(--color-bg)";
        const fg = selected && claimedBy === null ? "var(--color-bg)" : "var(--color-ink)";
        return (
          <button
            key={idx}
            type="button"
            onClick={() => {
              if (claim !== undefined || !play.isMyTurn) return;
              play.selectCell(selected ? null : idx);
            }}
            className="aspect-square text-sm font-medium rounded tabular-nums flex items-center justify-center"
            style={{
              background: bg,
              color: fg,
              border: "1px solid var(--color-rule)",
              cursor: claim === undefined && play.isMyTurn ? "pointer" : "default",
            }}
            aria-pressed={selected}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
});

const ClaimPanel = observer(function ClaimPanel() {
  const { play } = useAppStore();
  const state = play.state!;
  const idx = play.selectedCellIndex;
  if (idx === null) {
    return (
      <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
        Select an unclaimed cell to see equation candidates.
      </p>
    );
  }
  const claim = state.claimed.get(idx);
  if (claim !== undefined) {
    return (
      <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
        Cell already claimed by <strong>{claim.byPlayer}</strong>.
      </p>
    );
  }
  const target = state.config.board.cells[idx]!;
  const eqs = play.claimOptionsForCell(idx);
  if (eqs.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
        No legal equation hits {target} with this dice pool. Pick another cell or pass.
      </p>
    );
  }
  return (
    <div>
      <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--color-ink-muted)" }}>
        Claim cell {target}
      </p>
      <ul className="space-y-1.5">
        {eqs.map((eq, i) => (
          <ClaimRow
            key={i}
            idx={idx}
            equation={eq}
            originalPool={state.dicePool}
            mode={state.config.mode}
          />
        ))}
      </ul>
    </div>
  );
});

function ClaimRow(props: {
  idx: number;
  equation: NEquation;
  originalPool: readonly number[];
  mode: import("@platform/core/types.js").Mode;
}) {
  const { play } = useAppStore();
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex items-center justify-between gap-2 px-2 py-1.5 rounded" style={{ border: "1px solid var(--color-rule)" }}>
      <span className="font-mono text-sm">
        {formatEquationAgainstPool(props.equation, props.originalPool, props.mode)}
      </span>
      <button
        type="button"
        disabled={busy || !play.isMyTurn}
        onClick={() => {
          setBusy(true);
          play.claimWith(props.idx, props.equation);
        }}
        className="px-2 py-1 text-xs rounded"
        style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}
      >
        Claim
      </button>
    </li>
  );
}

const TerminalSummary = observer(function TerminalSummary() {
  const { play } = useAppStore();
  const score = play.scoreboard;
  const human = score["human"] ?? 0;
  const bot = score["bot"] ?? 0;
  const winner = human > bot ? "You" : bot > human ? "Bot" : "Tied";
  return (
    <div
      className="px-5 py-4 text-center"
      style={{ background: "var(--color-surface)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)" }}
    >
      <p className="text-xs uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
        Match complete
      </p>
      <p className="text-2xl font-semibold mt-1">{winner === "Tied" ? "Tied" : `${winner} win`}</p>
      <p className="text-sm mt-1 tabular-nums">You {human.toFixed(1)} — Bot {bot.toFixed(1)}</p>
    </div>
  );
});
