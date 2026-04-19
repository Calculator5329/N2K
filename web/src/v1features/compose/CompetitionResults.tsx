import { observer } from "mobx-react-lite";
import { DiceGlyph } from "../../v1ui/DiceGlyph";
import { DifficultyMeter } from "../../v1ui/DifficultyMeter";
import {
  BOARD_COLS,
  BOARD_SIZE,
  type BoardConfig,
  type CompositionStore,
} from "./CompositionStore";

/**
 * Renders the per-board competition output: the generated 6×6 board, plus a
 * round-by-round table of dice + difficulties + expected scores for both
 * players, and the per-player totals + delta.
 */
export const CompetitionResults = observer(function CompetitionResults({
  store,
}: {
  store: CompositionStore;
}) {
  if (store.boards.every((b) => b.result === null)) {
    return null;
  }
  return (
    <section>
      <div className="label-caps mb-4 no-print">Results</div>
      <div className="space-y-10">
        {store.boards.map((board, i) =>
          board.result === null ? null : (
            <BoardResult key={board.id} board={board} index={i} />
          ),
        )}
      </div>
      {/* Print-only stats summary — collected after all the per-board
          sheets, so a referee can keep one stats page next to the
          stack of board pages. Hidden on screen because the stats
          already live inline with each board for interactive use. */}
      <PrintStatsSummary store={store} />
    </section>
  );
});

const BoardResult = observer(function BoardResult({
  board,
  index,
}: {
  board: BoardConfig;
  index: number;
}) {
  const result = board.result!;
  const preview = board.preview ?? [];

  return (
    <div className="compose-board-sheet border border-ink-100/20 bg-paper-50 px-6 py-5">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-wide-caps uppercase text-oxblood-500">
            Board {index + 1}
          </span>
          <span
            className="font-display text-[22px] text-ink-500 leading-none"
            style={{ fontVariationSettings: '"opsz" 100, "SOFT" 30' }}
          >
            {board.kind === "random"
              ? `Random ${board.rangeMin}–${board.rangeMax}`
              : `Pattern [${board.multiples.join(", ")}] start ${board.patternStart}`}
          </span>
        </div>
        <span className="font-mono text-[11px] tracking-wide-caps uppercase text-ink-100">
          {board.rounds} round{board.rounds === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-12 gap-y-6 md:gap-6">
        <div className="col-span-12 md:col-span-5 min-w-0">
          <div className="label-caps mb-2">Generated board</div>
          <BoardGrid cells={preview} overrides={board.overrides} />
        </div>

        <div className="col-span-12 md:col-span-7 min-w-0">
          <RoundsTable board={board} />
          <Totals
            p1={result.p1TotalDifficulty}
            p2={result.p2TotalDifficulty}
            difficultyDelta={result.difficultyDelta}
            p1Score={result.p1TotalExpectedScore}
            p2Score={result.p2TotalExpectedScore}
            expectedScoreDelta={result.expectedScoreDelta}
          />
        </div>
      </div>
    </div>
  );
});

function BoardGrid({
  cells,
  overrides,
}: {
  cells: readonly number[];
  overrides: ReadonlyMap<number, number>;
}) {
  return (
    <div
      className="compose-board-grid grid gap-px bg-ink-100/15 p-px"
      style={{
        gridTemplateColumns: `repeat(${BOARD_COLS}, minmax(0, 1fr))`,
        borderRadius: "2px",
      }}
    >
      {Array.from({ length: BOARD_SIZE }).map((_, slot) => {
        const value = cells[slot];
        const isPinnedSlot = overrides.has(slot);
        return (
          <div
            key={slot}
            className={[
              "h-12 flex items-center justify-center bg-paper-50 font-mono tabular text-[13px]",
              isPinnedSlot ? "text-oxblood-500 font-medium" : "text-ink-300",
            ].join(" ")}
          >
            {value ?? ""}
          </div>
        );
      })}
    </div>
  );
}

const RoundsTable = observer(function RoundsTable({
  board,
}: {
  board: BoardConfig;
}) {
  const result = board.result!;
  // The diff/exp columns and totals strip live on screen alongside the
  // dice rolls so an operator can balance interactively, but they
  // print as a separate stats page (see `PrintStatsSummary`). Tagging
  // each diff/exp cell with `compose-stats-col` lets the print
  // stylesheet collapse the per-board sheet down to "board grid + dice
  // rolls" without restructuring the JSX twice.
  const statsCol =
    "compose-stats-col py-2 px-2 font-mono uppercase tracking-wide-caps text-ink-100 text-[10px]";
  const statsCell = "compose-stats-col py-2 px-2";
  return (
    <div>
      <div className="label-caps mb-2">Rolls per round</div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-ink-100/30 text-left">
            <th className="py-2 pr-2 font-mono uppercase tracking-wide-caps text-ink-100 text-[10px]">#</th>
            <th className="py-2 px-2 font-mono uppercase tracking-wide-caps text-ink-100 text-[10px]">P1 dice</th>
            <th className={statsCol}>P1 diff</th>
            <th className={statsCol}>P1 exp.</th>
            <th className="py-2 px-2 font-mono uppercase tracking-wide-caps text-ink-100 text-[10px]">P2 dice</th>
            <th className={statsCol}>P2 diff</th>
            <th className={statsCol}>P2 exp.</th>
          </tr>
        </thead>
        <tbody>
          {result.rounds.map((r, i) => (
            <tr key={i} className="border-b border-ink-100/10">
              <td className="py-2 pr-2 font-mono tabular text-ink-200">{i + 1}</td>
              <td className="py-2 px-2"><DiceGlyph dice={r.p1} size="sm" /></td>
              <td className={statsCell}>
                <DifficultyMeter difficulty={r.p1Difficulty} size="sm" />
              </td>
              <td className={`${statsCell} font-mono tabular text-ink-300`}>
                {r.p1ExpectedScore.toFixed(1)}
              </td>
              <td className="py-2 px-2"><DiceGlyph dice={r.p2} size="sm" /></td>
              <td className={statsCell}>
                <DifficultyMeter difficulty={r.p2Difficulty} size="sm" />
              </td>
              <td className={`${statsCell} font-mono tabular text-ink-300`}>
                {r.p2ExpectedScore.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

function Totals({
  p1,
  p2,
  difficultyDelta,
  p1Score,
  p2Score,
  expectedScoreDelta,
}: {
  p1: number;
  p2: number;
  difficultyDelta: number;
  p1Score: number;
  p2Score: number;
  expectedScoreDelta: number;
}) {
  const higherScorePlayer =
    expectedScoreDelta > 0 ? "P1" : expectedScoreDelta < 0 ? "P2" : null;
  const harderPlayer =
    difficultyDelta > 0 ? "P1" : difficultyDelta < 0 ? "P2" : null;
  return (
    <div className="compose-stats-col mt-4 pt-3 border-t border-ink-100/20 grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-[12px]">
      <Cell label="P1 totals" diff={p1} score={p1Score} />
      <Cell label="P2 totals" diff={p2} score={p2Score} />
      <div>
        <div className="label-caps mb-0.5">Δ expected score</div>
        <div className="text-ink-500 text-[16px] tabular">
          {Math.abs(expectedScoreDelta).toFixed(1)}
          {higherScorePlayer && (
            <span className="ml-1 text-[10px] uppercase tracking-wide-caps text-ink-100">
              {higherScorePlayer} higher
            </span>
          )}
        </div>
      </div>
      <div>
        <div className="label-caps mb-0.5">Δ difficulty</div>
        <div className="text-ink-500 text-[16px] tabular">
          {Math.abs(difficultyDelta).toFixed(2)}
          {harderPlayer && (
            <span className="ml-1 text-[10px] uppercase tracking-wide-caps text-ink-100">
              {harderPlayer} harder
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({ label, diff, score }: { label: string; diff: number; score: number }) {
  return (
    <div>
      <div className="label-caps mb-0.5">{label}</div>
      <div className="text-ink-500 text-[14px] tabular">
        diff {diff.toFixed(2)} <span className="text-ink-100">/</span> exp {score.toFixed(1)}
      </div>
    </div>
  );
}

/**
 * Print-only consolidated stats sheet.
 *
 * The per-board sheets above print as "board grid + dice rolls" only —
 * difficulty meters, expected-score columns, and the totals strip are
 * suppressed by the print stylesheet. The same numbers reappear here,
 * collected into one stats page (or a few) at the end of the deck so
 * the referee can keep a single sheet next to the stack of boards.
 *
 * Hidden on screen via `.print-only` (already wired up in `globals.css`).
 */
const PrintStatsSummary = observer(function PrintStatsSummary({
  store,
}: {
  store: CompositionStore;
}) {
  const boards = store.boards.filter((b) => b.result !== null);
  if (boards.length === 0) return null;
  return (
    <section className="print-only compose-stats-sheet">
      <h2 className="compose-stats-sheet__title">Stats summary</h2>
      <p className="compose-stats-sheet__caption">
        Per-round difficulty + expected score, with totals and Δ for
        each board. Boards print one per page; this stats sheet
        accompanies the stack.
      </p>
      <div className="compose-stats-sheet__boards">
        {boards.map((b) => (
          <BoardStatsBlock
            key={b.id}
            board={b}
            index={store.boards.indexOf(b) + 1}
          />
        ))}
      </div>
    </section>
  );
});

function BoardStatsBlock({
  board,
  index,
}: {
  board: BoardConfig;
  index: number;
}) {
  const result = board.result!;
  const titleSuffix =
    board.kind === "random"
      ? `Random ${board.rangeMin}–${board.rangeMax}`
      : `Pattern [${board.multiples.join(", ")}] start ${board.patternStart}`;
  const higherScorePlayer =
    result.expectedScoreDelta > 0
      ? "P1"
      : result.expectedScoreDelta < 0
      ? "P2"
      : "—";
  const harderPlayer =
    result.difficultyDelta > 0
      ? "P1"
      : result.difficultyDelta < 0
      ? "P2"
      : "—";
  return (
    <div className="compose-stats-sheet__board">
      <div className="compose-stats-sheet__board-header">
        <span className="compose-stats-sheet__board-eyebrow">
          Board {index}
        </span>
        <span className="compose-stats-sheet__board-title">{titleSuffix}</span>
      </div>
      <table className="compose-stats-sheet__table">
        <thead>
          <tr>
            <th>#</th>
            <th>P1 dice</th>
            <th>P1 diff</th>
            <th>P1 exp.</th>
            <th>P2 dice</th>
            <th>P2 diff</th>
            <th>P2 exp.</th>
          </tr>
        </thead>
        <tbody>
          {result.rounds.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                {r.p1[0]} · {r.p1[1]} · {r.p1[2]}
              </td>
              <td>{r.p1Difficulty.toFixed(2)}</td>
              <td>{r.p1ExpectedScore.toFixed(1)}</td>
              <td>
                {r.p2[0]} · {r.p2[1]} · {r.p2[2]}
              </td>
              <td>{r.p2Difficulty.toFixed(2)}</td>
              <td>{r.p2ExpectedScore.toFixed(1)}</td>
            </tr>
          ))}
          <tr className="compose-stats-sheet__totals-row">
            <td>Σ</td>
            <td>—</td>
            <td>{result.p1TotalDifficulty.toFixed(2)}</td>
            <td>{result.p1TotalExpectedScore.toFixed(1)}</td>
            <td>—</td>
            <td>{result.p2TotalDifficulty.toFixed(2)}</td>
            <td>{result.p2TotalExpectedScore.toFixed(1)}</td>
          </tr>
        </tbody>
      </table>
      <div className="compose-stats-sheet__deltas">
        <span>
          <strong>Δ expected:</strong>{" "}
          {Math.abs(result.expectedScoreDelta).toFixed(1)} ({higherScorePlayer}{" "}
          higher)
        </span>
        <span>
          <strong>Δ difficulty:</strong>{" "}
          {Math.abs(result.difficultyDelta).toFixed(2)} ({harderPlayer} harder)
        </span>
      </div>
    </div>
  );
}
