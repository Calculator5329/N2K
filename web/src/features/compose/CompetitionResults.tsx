import { observer } from "mobx-react-lite";
import { DiceGlyph } from "../../ui/primitives/DiceGlyph";
import { DifficultyMeter } from "../../ui/primitives/DifficultyMeter";
import {
  BOARD_COLS,
  BOARD_SIZE,
  type BoardConfig,
  type CompositionStore,
} from "./CompositionStore";

/**
 * Renders the per-board competition output: the generated 6×6 board, plus a
 * bout-by-bout table of dice + difficulties + expected scores for both
 * players, and the per-player totals + delta.
 *
 * Scoped to the **active phase** in v3.2 — switching phase tabs in
 * Compose swaps which phase's boards render here. The print summary
 * spans all phases so a printed deck stays a single deliverable.
 */
export const CompetitionResults = observer(function CompetitionResults({
  store,
}: {
  store: CompositionStore;
}) {
  const phaseBoards = store.currentPhase.boards;
  if (phaseBoards.every((b) => b.result === null)) {
    return null;
  }
  return (
    <section>
      <div className="label-caps mb-4 no-print">Results</div>
      <div className="space-y-10">
        {phaseBoards.map((board, i) =>
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
          {board.bouts} bout{board.bouts === 1 ? "" : "s"}
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
  return (
    <div>
      <div className="label-caps mb-2">Rolls per round</div>
      {/* Tabular rolls list, two rows per round (P1 / P2). The grid
          gives proper column alignment so the diff and exp numbers
          line up vertically across rounds — much easier to scan
          balance at a glance than the old "label-prefix + value"
          inline format. The whole grid wraps below `xs` widths via
          a min-width clamp + auto-flow rather than horizontal
          scroll. */}
      <RollsGrid rounds={result.rounds} />
    </div>
  );
});

type RollRound = {
  p1: readonly [number, number, number];
  p2: readonly [number, number, number];
  p1Difficulty: number;
  p2Difficulty: number;
  p1ExpectedScore: number;
  p2ExpectedScore: number;
};

function RollsGrid({ rounds }: { rounds: readonly RollRound[] }) {
  // Two layouts share the same data:
  //   - `rolls-grid` (>= 420px container width): true tabular grid
  //     with column headers and right-aligned numbers, so an
  //     operator can scan diff/exp balance vertically.
  //   - `rolls-stack` (< 420px): each round is a card with P1 above
  //     P2, dice on one line and stats wrapping below. No
  //     horizontal scroll, no column collisions.
  // The container query lives on the rolls section itself, not the
  // viewport, so the layout adapts to whatever column width the
  // parent grid hands it (e.g. the rolls live in a `md:col-span-7`
  // slot that's narrow at md but wide at xl).
  return (
    <div
      className="rolls-container font-mono text-[11px] text-ink-300"
      style={{ containerType: "inline-size" }}
    >
      <div className="rolls-grid grid items-center gap-x-3 gap-y-1 grid-cols-[auto_auto_max-content_auto_minmax(0,1fr)_minmax(0,1fr)]">
        <div />
        <div />
        <div />
        <div />
        <div className="compose-stats-col label-caps text-right">Diff</div>
        <div className="compose-stats-col label-caps text-right">Exp</div>

        {rounds.map((r, i) => (
          <RoundGridRows
            key={i}
            index={i}
            p1={r.p1}
            p2={r.p2}
            p1Difficulty={r.p1Difficulty}
            p2Difficulty={r.p2Difficulty}
            p1ExpectedScore={r.p1ExpectedScore}
            p2ExpectedScore={r.p2ExpectedScore}
          />
        ))}
      </div>

      <ol className="rolls-stack flex-col divide-y divide-ink-100/15 border-y border-ink-100/15">
        {rounds.map((r, i) => (
          <li key={i} className="flex items-start gap-3 py-2.5">
            <span className="tabular text-ink-200 leading-none pt-1.5 shrink-0 w-6">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex flex-1 min-w-0 flex-col gap-1.5">
              <RoundPlayerStacked
                label="P1"
                dice={r.p1}
                difficulty={r.p1Difficulty}
                expectedScore={r.p1ExpectedScore}
              />
              <RoundPlayerStacked
                label="P2"
                dice={r.p2}
                difficulty={r.p2Difficulty}
                expectedScore={r.p2ExpectedScore}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RoundGridRows({
  index,
  p1,
  p2,
  p1Difficulty,
  p2Difficulty,
  p1ExpectedScore,
  p2ExpectedScore,
}: { index: number } & RollRound) {
  return (
    <>
      {index > 0 && (
        <div className="col-span-6 border-t border-ink-100/15 my-1" />
      )}
      <div className="row-span-2 self-start pt-0.5 text-ink-200 tabular">
        {String(index + 1).padStart(2, "0")}
      </div>
      <PlayerGridCells
        label="P1"
        dice={p1}
        difficulty={p1Difficulty}
        expectedScore={p1ExpectedScore}
      />
      <PlayerGridCells
        label="P2"
        dice={p2}
        difficulty={p2Difficulty}
        expectedScore={p2ExpectedScore}
      />
    </>
  );
}

function PlayerGridCells({
  label,
  dice,
  difficulty,
  expectedScore,
}: {
  label: "P1" | "P2";
  dice: readonly [number, number, number];
  difficulty: number;
  expectedScore: number;
}) {
  return (
    <>
      <span className="uppercase tracking-wide-caps text-[10px] text-ink-100 w-5">
        {label}
      </span>
      <div>
        <DiceGlyph dice={dice} size="sm" />
      </div>
      <div className="compose-stats-col">
        <DifficultyMeter difficulty={difficulty} size="sm" showValue={false} />
      </div>
      <div className="compose-stats-col tabular text-right">
        {difficulty.toFixed(2)}
      </div>
      <div className="compose-stats-col tabular text-right">
        {expectedScore.toFixed(1)}
      </div>
    </>
  );
}

function RoundPlayerStacked({
  label,
  dice,
  difficulty,
  expectedScore,
}: {
  label: "P1" | "P2";
  dice: readonly [number, number, number];
  difficulty: number;
  expectedScore: number;
}) {
  return (
    <div className="flex flex-1 min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <span className="uppercase tracking-wide-caps text-[10px] text-ink-100 shrink-0 w-5">
        {label}
      </span>
      <div className="shrink-0">
        <DiceGlyph dice={dice} size="sm" />
      </div>
      <div className="compose-stats-col flex flex-1 min-w-fit items-center justify-end gap-3 tabular whitespace-nowrap ml-auto">
        <DifficultyMeter difficulty={difficulty} size="sm" showValue={false} />
        <span>
          <span className="text-ink-100">diff</span>{" "}
          {difficulty.toFixed(2)}
        </span>
        <span>
          <span className="text-ink-100">exp</span>{" "}
          {expectedScore.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

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
  // Print summary spans every phase (the deck is one printed
  // deliverable). On-screen results stay scoped to the active phase
  // tab; on paper, phase boundaries become headings between the
  // per-board blocks.
  const allBoards = store.allBoards.filter(({ board }) => board.result !== null);
  if (allBoards.length === 0) return null;
  return (
    <section className="print-only compose-stats-sheet">
      <h2 className="compose-stats-sheet__title">Stats summary</h2>
      <p className="compose-stats-sheet__caption">
        Per-bout difficulty + expected score, with totals and Δ for
        each board. Boards print one per page; this stats sheet
        accompanies the stack.
      </p>
      <div className="compose-stats-sheet__boards">
        {allBoards.map(({ board, phase, boardIndex }) => (
          <BoardStatsBlock
            key={board.id}
            board={board}
            label={`${phase.name} — Board ${boardIndex + 1}`}
          />
        ))}
      </div>
    </section>
  );
});

function BoardStatsBlock({
  board,
  label,
}: {
  board: BoardConfig;
  label: string;
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
        <span className="compose-stats-sheet__board-eyebrow">{label}</span>
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
