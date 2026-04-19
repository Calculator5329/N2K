/**
 * ComposeView — author N2K boards + generate balanced two-player rolls.
 *
 * One or more `BoardConfig`s are edited inline (random vs. pattern, with
 * pin-overlay clicks on the 6×6 grid). The Generate button triggers
 * `CompetitionService.generate` and renders a per-board, per-round table
 * with totals + a JSON download for the entire plan.
 */
import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";
import type { BoardConfig, ComposeModeId } from "../../stores/ComposeStore.js";
import type { CandidatePool, CompetitionPlan } from "../../services/competitionService.js";
import { CANDIDATE_POOL_META } from "../../services/competitionService.js";
import {
  downloadBlob,
  exportToDocx,
  exportToPdf,
  planToExportData,
} from "../../services/competitionExport.js";

export const ComposeView = observer(function ComposeView() {
  const { compose } = useAppStore();
  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Compose</h2>
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Author boards, generate balanced two-player dice rolls, export the plan.
          </p>
        </div>
        <ModePicker />
      </header>

      <Card>
        <GlobalControls />
      </Card>

      <Card>
        <BoardLibraryPanel />
      </Card>

      <div className="space-y-4">
        {compose.boards.map((b) => (
          <Card key={b.id}>
            <BoardEditor board={b} />
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => compose.addBoard()}
          className="px-3 py-1.5 text-sm rounded border"
          style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
        >
          + Add board
        </button>
        <button
          type="button"
          disabled={compose.isGenerating}
          onClick={() => compose.generate()}
          className="px-4 py-2 text-sm font-medium rounded"
          style={{
            background: compose.isGenerating ? "var(--color-rule)" : "var(--color-accent)",
            color: "var(--color-bg)",
          }}
        >
          {compose.isGenerating ? "Generating…" : "Generate balanced rounds"}
        </button>
      </div>

      {compose.lastError !== null ? (
        <Card>
          <p className="text-sm" style={{ color: "var(--color-ink)" }}>
            {compose.lastError}
          </p>
        </Card>
      ) : null}

      {compose.plan !== null ? <PlanResults plan={compose.plan} /> : null}
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

const ModePicker = observer(function ModePicker() {
  const { compose } = useAppStore();
  return (
    <div className="flex gap-1">
      {(["standard", "aether"] as ComposeModeId[]).map((m) => {
        const active = compose.modeId === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => compose.setMode(m)}
            className="px-3 py-1.5 text-sm rounded"
            style={{
              background: active ? "var(--color-accent)" : "transparent",
              color: active ? "var(--color-bg)" : "var(--color-ink)",
              border: "1px solid var(--color-rule)",
            }}
          >
            {m === "standard" ? "Standard" : "Æther"}
          </button>
        );
      })}
    </div>
  );
});

const GlobalControls = observer(function GlobalControls() {
  const { compose } = useAppStore();
  return (
    <div className="flex flex-wrap items-end gap-4">
      <Field label="Candidate pool">
        <select
          value={compose.pool}
          onChange={(e) => compose.setPool(e.target.value as CandidatePool)}
          className="px-2 py-1 text-sm rounded border"
          style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
          title={CANDIDATE_POOL_META.find((m) => m.id === compose.pool)?.description ?? ""}
        >
          {CANDIDATE_POOL_META.map((m) => (
            <option key={m.id} value={m.id} title={m.description}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Time budget">
        <select
          value={compose.timeBudgetMs}
          onChange={(e) => compose.setTimeBudget(Number.parseInt(e.target.value, 10))}
          className="px-2 py-1 text-sm rounded border"
          style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
        >
          <option value={30_000}>30 s</option>
          <option value={60_000}>1 min</option>
          <option value={120_000}>2 min</option>
        </select>
      </Field>
      <Field label="Seed (optional)">
        <input
          type="number"
          value={compose.seed ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number.parseInt(e.target.value, 10);
            compose.setSeed(v);
          }}
          placeholder="random"
          className="w-32 px-2 py-1 text-sm rounded border tabular-nums"
          style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
        />
      </Field>
    </div>
  );
});

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
      {props.label}
      {props.children}
    </label>
  );
}

const BoardEditor = observer(function BoardEditor(props: { board: BoardConfig }) {
  const { compose } = useAppStore();
  const { board } = props;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{board.id}</h3>
          <div className="flex items-center gap-2">
            <SaveBoardButton boardId={board.id} />
            {compose.boards.length > 1 ? (
              <button
                type="button"
                onClick={() => compose.removeBoard(board.id)}
                className="text-xs underline"
                style={{ color: "var(--color-ink-muted)" }}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <Field label="Kind">
          <select
            value={board.kind}
            onChange={(e) => compose.updateBoard(board.id, { kind: e.target.value as "random" | "pattern" })}
            className="px-2 py-1 text-sm rounded border"
            style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
          >
            <option value="random">Random range</option>
            <option value="pattern">Arithmetic pattern</option>
          </select>
        </Field>
        {board.kind === "random" ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Min">
              <input
                type="number"
                value={board.random.min}
                onChange={(e) =>
                  compose.updateBoard(board.id, {
                    random: { ...board.random, min: Number.parseInt(e.target.value, 10) || 0 },
                  })
                }
                className="px-2 py-1 text-sm rounded border tabular-nums"
                style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
              />
            </Field>
            <Field label="Max">
              <input
                type="number"
                value={board.random.max}
                onChange={(e) =>
                  compose.updateBoard(board.id, {
                    random: { ...board.random, max: Number.parseInt(e.target.value, 10) || 0 },
                  })
                }
                className="px-2 py-1 text-sm rounded border tabular-nums"
                style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
              />
            </Field>
          </div>
        ) : (
          <div className="space-y-2">
            <Field label="Multiples (comma-separated)">
              <input
                type="text"
                value={board.pattern.multiples.join(",")}
                onChange={(e) => {
                  const parts = e.target.value
                    .split(",")
                    .map((s) => Number.parseInt(s.trim(), 10))
                    .filter((n) => !Number.isNaN(n));
                  if (parts.length >= 1 && parts.length <= 3) {
                    compose.updateBoard(board.id, { pattern: { ...board.pattern, multiples: parts } });
                  }
                }}
                className="px-2 py-1 text-sm rounded border w-full"
                style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
              />
            </Field>
            <Field label="Start">
              <input
                type="number"
                value={board.pattern.start}
                onChange={(e) =>
                  compose.updateBoard(board.id, {
                    pattern: { ...board.pattern, start: Number.parseInt(e.target.value, 10) || 0 },
                  })
                }
                className="px-2 py-1 text-sm rounded border tabular-nums"
                style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
              />
            </Field>
          </div>
        )}
        <Field label="Rounds">
          <input
            type="number"
            min={1}
            max={20}
            value={board.rounds}
            onChange={(e) => compose.updateBoard(board.id, { rounds: Math.max(1, Number.parseInt(e.target.value, 10) || 1) })}
            className="px-2 py-1 text-sm rounded border w-24 tabular-nums"
            style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
          />
        </Field>
        <button
          type="button"
          onClick={() => compose.regenerateBoard(board.id)}
          className="px-2 py-1 text-xs rounded border"
          style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
        >
          Regenerate
        </button>
      </div>
      <BoardGrid board={board} />
    </div>
  );
});

const BoardGrid = observer(function BoardGrid(props: { board: BoardConfig }) {
  const { compose } = useAppStore();
  const { board } = props;
  return (
    <div className="grid grid-cols-6 gap-1">
      {board.cells.map((value, idx) => {
        const pinned = board.pinned.has(idx);
        return (
          <button
            key={`${idx}-${value}`}
            type="button"
            onClick={() => compose.togglePin(board.id, idx)}
            className="aspect-square text-sm font-medium rounded tabular-nums"
            style={{
              background: pinned ? "var(--color-accent)" : "var(--color-bg)",
              color: pinned ? "var(--color-bg)" : "var(--color-ink)",
              border: "1px solid var(--color-rule)",
            }}
            aria-pressed={pinned}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
});

const ShareButton = observer(function ShareButton() {
  const { compose } = useAppStore();
  const onShare = async () => {
    const url = await compose.buildShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      // eslint-disable-next-line no-alert -- explicit user-triggered confirmation
      window.alert("Share link copied to clipboard.\n\n" + url);
    } catch {
      // eslint-disable-next-line no-alert -- fallback when clipboard is blocked
      window.prompt("Copy this share link", url);
    }
  };
  return (
    <button
      type="button"
      onClick={onShare}
      className="px-2.5 py-1 text-xs rounded border"
      style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
    >
      Share plan
    </button>
  );
});

const PlanResults = observer(function PlanResults(props: { plan: CompetitionPlan }) {
  const { compose } = useAppStore();
  const stamp = () => Date.now();
  const exportPdf = async () => {
    const data = planToExportData(props.plan, compose.boards);
    const blob = await exportToPdf(data);
    downloadBlob(blob, `n2k-competition-${stamp()}.pdf`);
  };
  const exportDocx = async () => {
    const data = planToExportData(props.plan, compose.boards);
    const blob = await exportToDocx(data);
    downloadBlob(blob, `n2k-competition-${stamp()}.docx`);
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(planToJson(props.plan), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `n2k-competition-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportCsv = () => {
    const lines: string[] = ["board,round,playerA_dice,playerA_score,playerB_dice,playerB_score,delta"];
    for (const r of props.plan.results) {
      for (const round of r.rounds) {
        lines.push(
          [
            r.boardId,
            round.index + 1,
            round.playerA.dice.join("/"),
            round.playerA.expectedScore.toFixed(2),
            round.playerB.dice.join("/"),
            round.playerB.expectedScore.toFixed(2),
            round.delta.toFixed(3),
          ].join(","),
        );
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `n2k-competition-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">Plan</h3>
            <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
              Generated in {(props.plan.elapsedMs / 1000).toFixed(1)} s.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <ShareButton />
            <button
              type="button"
              onClick={exportJson}
              className="px-2.5 py-1 text-xs rounded border"
              style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="px-2.5 py-1 text-xs rounded border"
              style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void exportPdf()}
              className="px-2.5 py-1 text-xs rounded border"
              style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={() => void exportDocx()}
              className="px-2.5 py-1 text-xs rounded border"
              style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
            >
              Export Word
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-2.5 py-1 text-xs rounded border"
              style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
            >
              Print
            </button>
          </div>
        </div>
      </Card>

      {props.plan.results.map((r) => (
        <Card key={r.boardId}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">{r.boardId}</h3>
            <div className="text-xs tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
              Totals — A: {r.totals.playerA.toFixed(2)} · B: {r.totals.playerB.toFixed(2)}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead style={{ color: "var(--color-ink-muted)" }}>
              <tr>
                <th className="text-left px-2 py-1">Round</th>
                <th className="text-left px-2 py-1">Player A roll</th>
                <th className="text-right px-2 py-1">A score</th>
                <th className="text-left px-2 py-1">Player B roll</th>
                <th className="text-right px-2 py-1">B score</th>
                <th className="text-right px-2 py-1">Δ</th>
              </tr>
            </thead>
            <tbody>
              {r.rounds.map((round) => (
                <tr key={round.index} style={{ borderTop: "1px solid var(--color-rule)" }}>
                  <td className="px-2 py-1 tabular-nums">{round.index + 1}</td>
                  <td className="px-2 py-1 font-mono">{round.playerA.dice.join("/")}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{round.playerA.expectedScore.toFixed(2)}</td>
                  <td className="px-2 py-1 font-mono">{round.playerB.dice.join("/")}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{round.playerB.expectedScore.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{round.delta.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Board library (Phase 6)
//
// Persists individual boards through `BoardLibraryStore`. The list shows
// the user's saved boards newest-first; loading replaces the *first*
// editor board so the user immediately sees the result inline. Append
// adds it as a new board so they can compare.
// ---------------------------------------------------------------------------

const BoardLibraryPanel = observer(function BoardLibraryPanel() {
  const { compose, boardLibrary } = useAppStore();
  const entries = boardLibrary.entries;
  const onLoadInto = (bodyEntry: (typeof entries)[number]) => {
    const target = compose.boards[0]?.id;
    if (target === undefined) return;
    compose.loadFromLibrary(target, bodyEntry.body);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Saved boards</h3>
        <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {entries.length === 0
            ? "Save any board with the ★ button to add it here."
            : `${entries.length} saved`}
        </span>
      </div>
      {boardLibrary.lastError !== null ? (
        <p className="text-xs" style={{ color: "var(--color-ink)" }}>
          {boardLibrary.lastError}
        </p>
      ) : null}
      {entries.length === 0 ? null : (
        <ul className="divide-y" style={{ borderColor: "var(--color-rule)" }}>
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 py-1.5"
              style={{ borderTopColor: "var(--color-rule)" }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{entry.title ?? "Untitled board"}</div>
                <div className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                  {entry.body.modeId} · {entry.body.kind} · {entry.body.cells.length} cells ·{" "}
                  {entry.body.pinned.length} pinned
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onLoadInto(entry)}
                  className="px-2 py-1 text-xs rounded border"
                  style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
                  title="Replace the first editor board with this saved board."
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => compose.appendFromLibrary(entry.body)}
                  className="px-2 py-1 text-xs rounded border"
                  style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
                  title="Append as a new editor board."
                >
                  Append
                </button>
                <button
                  type="button"
                  onClick={() => void boardLibrary.remove(entry.id)}
                  className="px-2 py-1 text-xs rounded border"
                  style={{ borderColor: "var(--color-rule)", color: "var(--color-ink-muted)" }}
                  title="Delete this saved board."
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

const SaveBoardButton = observer(function SaveBoardButton(props: { boardId: string }) {
  const { compose, boardLibrary } = useAppStore();
  const onSave = () => {
    const body = compose.toLibraryBody(props.boardId);
    if (body === null) return;
    // eslint-disable-next-line no-alert -- minimal MVP prompt; replace with a modal once Phase 6 UI lands.
    const title = window.prompt("Name this board", `Board ${new Date().toLocaleString()}`);
    if (title === null || title.trim() === "") return;
    void boardLibrary.save(title.trim(), body);
  };
  return (
    <button
      type="button"
      onClick={onSave}
      className="px-2 py-1 text-xs rounded border"
      style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
      title="Save this board to the library."
    >
      ★ Save
    </button>
  );
});

function planToJson(plan: CompetitionPlan): object {
  return {
    version: "v2.compose.plan/1",
    config: {
      modeId: plan.config.modeId,
      pool: plan.config.pool,
      timeBudgetMs: plan.config.timeBudgetMs,
      seed: plan.config.seed ?? null,
      boards: plan.config.boards,
    },
    results: plan.results,
    elapsedMs: plan.elapsedMs,
  };
}
