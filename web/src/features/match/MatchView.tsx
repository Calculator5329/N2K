/**
 * `MatchView` — the in-match surface that takes over the Play tab
 * while a competition match is in progress.
 *
 * Composition:
 *   - `IndicatorStrip` — context line (comp · phase · board · bout)
 *   - One of:
 *       - `PausedOverlay`     — blurred board + dice + Resume button
 *       - `BoutSummaryCard`   — 5-second auto-advance with Next button
 *       - `PhaseInterstitial` — "Phase 1 complete — Begin Phase 2"
 *       - `PassDeviceOverlay` — hot-seat handoff
 *       - `MatchEndScreen`    — final scoreboard + history hand-off
 *       - `MatchRaceScreen`   — the live race itself
 *
 * Reuses the same `PlayStore` API as Quick Race for board/dice/scores
 * but binds to `match.play` (the per-match instance) so the singleton
 * `appStore.play` keeps its independent Quick Race state untouched.
 */
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useAppStore } from "../../stores/AppStoreContext.js";
import { BOUT_SUMMARY_AUTO_ADVANCE_MS, type MatchStore } from "./MatchStore.js";
import type { PlayStore, BoutSummary } from "../../stores/PlayStore.js";

export const MatchView = observer(function MatchView() {
  const root = useAppStore();
  const match = root.match;

  // Tear down match-specific timers if the component unmounts. We do
  // NOT dispose the match here — the AppStore owns its lifecycle.
  // The hook stays declared even when `match` is null so React's
  // rules-of-hooks ordering is preserved across re-renders.
  useEffect(() => {
    if (match === null) return;
    return () => {
      // Auto-pause on unmount as a safety net (the explicit
      // setView-listener already handles tab switches).
      if (match.play.isRacing) match.autoPause();
    };
  }, [match]);

  if (match === null) return null;

  return (
    <article className="flex flex-col gap-3 sm:gap-4">
      <IndicatorStrip match={match} />
      <MatchBody match={match} />
    </article>
  );
});

const IndicatorStrip = observer(function IndicatorStrip({ match }: { match: MatchStore }) {
  const root = useAppStore();
  const entry = match.currentEntry;
  if (entry === null) return null;
  const phase = match.phaseMeta[entry.phaseIndex];
  return (
    <header
      className="flex items-baseline justify-between gap-3 px-3 py-2 border border-ink-100/30 bg-paper-100 flex-wrap"
      style={{ borderRadius: "3px" }}
    >
      <div className="flex items-baseline gap-2 flex-wrap font-mono uppercase tracking-wide-caps text-[11px] text-ink-300">
        <span className="text-oxblood-500">{match.compName}</span>
        <span className="text-ink-100/60">·</span>
        <span>{phase?.name ?? `Phase ${entry.phaseIndex + 1}`}</span>
        <span className="text-ink-100/60">·</span>
        <span>Board {entry.boardIndex + 1}</span>
        <span className="text-ink-100/60">·</span>
        <span>
          Bout {match.currentBoardBoutIndex}/{match.currentBoardBoutCount}
        </span>
        {match.format === "hot-seat" && (
          <>
            <span className="text-ink-100/60">·</span>
            <span className="text-support-500">{entry.userSeat}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!match.isMatchEnded && match.play.isRacing && (
          <button
            type="button"
            data-testid="match.header.pause"
            onClick={() => match.pauseExplicit()}
            className="px-3 py-1 font-mono uppercase tracking-wide-caps text-[10px] text-ink-200 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
            style={{ borderRadius: "2px" }}
          >
            ❚❚ Pause
          </button>
        )}
        <button
          type="button"
          data-testid="match.header.discard"
          onClick={async () => {
            if (!confirm("Discard this match? Your in-flight scores will be lost.")) return;
            await match.discard();
            root.setMatch(null);
          }}
          className="px-3 py-1 font-mono uppercase tracking-wide-caps text-[10px] text-ink-200 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
          style={{ borderRadius: "2px" }}
        >
          Discard
        </button>
      </div>
    </header>
  );
});

const MatchBody = observer(function MatchBody({ match }: { match: MatchStore }) {
  if (match.isMatchEnded) return <MatchEndScreen match={match} />;
  if (match.passingDevice) return <PassDeviceOverlay match={match} />;
  if (match.uiPhase.kind === "phase-summary") return <PhaseInterstitial match={match} />;
  if (match.uiPhase.kind === "bout-summary") {
    return <BoutSummaryCard match={match} bout={match.uiPhase.bout} seat={match.uiPhase.seat} />;
  }
  return <MatchRaceScreen match={match} />;
});

// ---------------------------------------------------------------------------
//  Race screen (paused overlay overlaid when applicable)
// ---------------------------------------------------------------------------

const MatchRaceScreen = observer(function MatchRaceScreen({ match }: { match: MatchStore }) {
  const play = match.play;
  return (
    <section className="relative flex flex-col gap-3 sm:gap-4">
      <RaceClock play={play} />
      <ScoreLine match={match} />
      <BoardsGrid match={match} />
      {play.isPaused && <PausedOverlay match={match} />}
    </section>
  );
});

const RaceClock = observer(function RaceClock({ play }: { play: PlayStore }) {
  const total = Math.ceil(play.remainingMs / 1000);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  const urgent = play.remainingMs <= 10_000 && play.isRacing;
  return (
    <div
      className={[
        "text-center font-display tabular leading-none",
        "text-[clamp(2.5rem,6vw,3.75rem)]",
        urgent ? "text-oxblood-500" : "text-ink-500",
      ].join(" ")}
      style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 1' }}
      aria-live="polite"
    >
      {String(mm).padStart(1, "0")}:{String(ss).padStart(2, "0")}
    </div>
  );
});

const ScoreLine = observer(function ScoreLine({ match }: { match: MatchStore }) {
  const totals = match.userTotals;
  if (match.format === "hot-seat") {
    const entry = match.currentEntry;
    const activeSeat = entry?.userSeat ?? "P1";
    return (
      <div className="flex items-baseline justify-center gap-4 sm:gap-6 text-center">
        <SeatScore label="P1" value={totals.P1} active={activeSeat === "P1"} hidden={false} />
        <span className="text-ink-100/40">·</span>
        <SeatScore
          label="P2"
          value={totals.P2}
          active={activeSeat === "P2"}
          // Hide P2's score until they've played, so P1 doesn't see
          // the target they need to beat. Once it's P2's turn the
          // score is visible (it's their own).
          hidden={activeSeat === "P1"}
        />
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-center gap-4 sm:gap-6 text-center">
      <SeatScore label="You" value={totals.P1 + match.play.playerScore} active hidden={false} />
      <span className="text-ink-100/40">·</span>
      <SeatScore
        label={match.persona?.name ?? "Bot"}
        value={match.opponentTotal + match.play.botScore}
        active
        hidden={false}
      />
    </div>
  );
});

function SeatScore(props: { label: string; value: number; active: boolean; hidden: boolean }) {
  return (
    <div className={props.active ? "" : "opacity-40"}>
      <div className="label-caps text-oxblood-500">{props.label}</div>
      <div
        className="font-display tabular text-[28px] leading-none text-ink-500"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
      >
        {props.hidden ? "—" : props.value.toLocaleString()}
      </div>
    </div>
  );
}

const BoardsGrid = observer(function BoardsGrid({ match }: { match: MatchStore }) {
  const play = match.play;
  // In hot-seat we only show the user's board (no bot side); the
  // grid degrades to a single-column layout with the dice strip
  // beneath. In vs-bot we keep the dual-board race.
  if (match.format === "hot-seat") {
    return (
      <section className="grid grid-cols-1 max-w-[500px] mx-auto gap-3 w-full">
        <SideColumn play={play} side="player" hideBotName />
      </section>
    );
  }
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start">
      <SideColumn play={play} side="player" />
      <SideColumn play={play} side="bot" />
    </section>
  );
});

const SideColumn = observer(function SideColumn({
  play,
  side,
  hideBotName,
}: {
  play: PlayStore;
  side: "player" | "bot";
  hideBotName?: boolean;
}) {
  const isPlayer = side === "player";
  const dice = isPlayer ? play.dice : play.botDice;
  const knockedSet = isPlayer ? play.playerKnockedSet : play.botKnockedSet;
  const knockedCount = isPlayer ? play.playerKnocked.length : play.botKnocked.length;
  const accentClass = isPlayer
    ? "bg-oxblood-500 text-paper-50 border-oxblood-500"
    : "bg-support-500 text-paper-50 border-support-500";
  const labelColor = isPlayer ? "text-oxblood-500" : "text-support-500";
  const subtitle = isPlayer
    ? `${knockedCount}/${play.boardCells.length} knocked`
    : `${knockedCount}/${play.boardCells.length} found · reaches ${play.botReachableCount}`;
  return (
    <div className="min-w-0 flex flex-col gap-2 sm:gap-3">
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span
          className={["font-display text-[20px] leading-none truncate", labelColor].join(" ")}
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
        >
          {isPlayer ? "You" : hideBotName ? "Opponent" : play.setup.botName}
        </span>
        <span className="font-mono uppercase tracking-wide-caps text-[10px] text-ink-200 whitespace-nowrap">
          {subtitle}
        </span>
      </div>
      <BoardGrid
        cellTestId={isPlayer
          ? (idx) => `match.board.player.cell-${idx}`
          : (idx) => `match.board.bot.cell-${idx}`}
        cells={play.boardCells}
        knockedSet={knockedSet}
        accentClass={accentClass}
        interactive={isPlayer && play.isRacing}
        onKnock={(idx) => play.knockCell(idx)}
      />
      <DiceStrip dice={dice} labelColor={labelColor} />
    </div>
  );
});

function BoardGrid(props: {
  cellTestId: (idx: number) => string;
  cells: readonly number[];
  knockedSet: ReadonlySet<number>;
  accentClass: string;
  interactive: boolean;
  onKnock: (idx: number) => void;
}) {
  return (
    <div
      className="p-2 bg-paper-50 border-2 border-ink-500"
      style={{ borderRadius: "3px", containerType: "inline-size" }}
    >
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}
      >
        {props.cells.map((value, idx) => {
          const knocked = props.knockedSet.has(idx);
          return (
            <button
              key={idx}
              data-testid={props.cellTestId(idx)}
              type="button"
              onClick={() => props.interactive && props.onKnock(idx)}
              disabled={!props.interactive}
              aria-pressed={knocked}
              className={[
                "aspect-square flex items-center justify-center border font-display tabular leading-none transition-colors",
                knocked ? props.accentClass : "bg-paper-50 text-ink-500 border-ink-100/40",
                props.interactive && !knocked
                  ? "hover:border-oxblood-500 hover:text-oxblood-500 cursor-pointer"
                  : "cursor-default",
              ].join(" ")}
              style={{
                borderRadius: "2px",
                fontSize: "clamp(11px, 5.5cqw, 22px)",
                fontVariationSettings: '"opsz" 144',
              }}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DiceStrip(props: { dice: readonly number[]; labelColor: string }) {
  return (
    <section
      className="flex items-center justify-between gap-2 px-2 py-1.5 bg-paper-100 border border-ink-100/20"
      style={{ borderRadius: "3px" }}
    >
      <span className={["label-caps shrink-0", props.labelColor].join(" ")}>Dice</span>
      <div
        className="inline-flex items-stretch border border-ink-100/30 divide-x divide-ink-100/30 bg-paper-50 font-display tabular text-ink-500"
        style={{ borderRadius: "2px" }}
      >
        {props.dice.map((d, i) => (
          <span
            key={i}
            className="inline-flex items-center justify-center px-2 py-1 leading-none"
            style={{
              minWidth: 36,
              fontSize: "clamp(18px, 2.2vw, 24px)",
              fontVariationSettings: '"opsz" 144',
            }}
          >
            {d}
          </span>
        ))}
      </div>
      <span className="w-10" aria-hidden />
    </section>
  );
}

// ---------------------------------------------------------------------------
//  Overlays
// ---------------------------------------------------------------------------

const PausedOverlay = observer(function PausedOverlay({ match }: { match: MatchStore }) {
  return (
    <div
      className="absolute inset-0 bg-paper-50/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-10"
      style={{ borderRadius: "3px" }}
    >
      <div
        className="font-display text-[36px] text-ink-500 leading-none"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 1' }}
      >
        Paused
      </div>
      <p className="text-[12px] italic text-ink-200">
        {match.pauseSource === "auto"
          ? "Auto-paused while you were away. Resume when you're ready."
          : "Take a breath. Hit Resume to keep racing."}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          data-testid="match.pause.resume"
          onClick={() => match.resume()}
          className="px-5 py-2 font-mono uppercase tracking-wide-caps text-[12px] text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90"
          style={{ borderRadius: "2px" }}
        >
          ▶ Resume
        </button>
      </div>
    </div>
  );
});

const PassDeviceOverlay = observer(function PassDeviceOverlay({ match }: { match: MatchStore }) {
  const entry = match.currentEntry;
  return (
    <section
      className="text-center py-20 border-2 border-dashed border-oxblood-500/60 bg-paper-100"
      style={{ borderRadius: "3px" }}
    >
      <div
        className="font-display text-[32px] sm:text-[42px] text-ink-500 mb-3 leading-tight"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 1' }}
      >
        Pass the device to{" "}
        <span className="text-oxblood-500 italic">Player {entry?.userSeat ?? "2"}</span>
      </div>
      <p className="text-[13px] italic text-ink-200 max-w-md mx-auto mb-8">
        Player 1's race is in the books. The next race rolls fresh dice for the other seat — no peeking before you tap.
      </p>
      <button
        type="button"
        data-testid="match.hot-seat.ready"
        onClick={() => match.acknowledgePassingDevice()}
        className="px-6 py-3 font-mono uppercase tracking-wide-caps text-[13px] text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90"
        style={{ borderRadius: "2px" }}
      >
        Tap when ready
      </button>
    </section>
  );
});

const BoutSummaryCard = observer(function BoutSummaryCard({
  match,
  bout,
  seat,
}: {
  match: MatchStore;
  bout: BoutSummary;
  seat: "P1" | "P2";
}) {
  const totalCells = bout.maxCells || 36;
  const efficiency = totalCells === 0 ? 0 : Math.round((bout.playerCellsKnocked / totalCells) * 100);
  const seconds = (bout.elapsedMs / 1000).toFixed(1);
  return (
    <section
      className="text-center py-12 border border-ink-300 bg-paper-100 mt-2"
      style={{ borderRadius: "3px" }}
    >
      <div className="label-caps mb-3">Bout complete · {seat}</div>
      <div className="flex items-baseline justify-center gap-6 mb-6 flex-wrap">
        <div>
          <div className="label-caps text-oxblood-500">You</div>
          <div
            className="font-display tabular text-[44px] leading-none text-ink-500"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
          >
            {bout.playerScore.toLocaleString()}
          </div>
        </div>
        {match.format === "vs-bot" && (
          <>
            <span className="text-ink-100/40 font-display text-[36px]">·</span>
            <div>
              <div className="label-caps text-support-500">{match.persona?.name ?? "Bot"}</div>
              <div
                className="font-display tabular text-[44px] leading-none text-ink-500"
                style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
              >
                {bout.botScore.toLocaleString()}
              </div>
            </div>
          </>
        )}
      </div>
      <p className="font-mono text-[12px] text-ink-200">
        {bout.playerCellsKnocked}/{totalCells} cells · {efficiency}% efficiency · {seconds}s
      </p>
      <button
        type="button"
        data-testid="match.bout.next"
        onClick={() => match.advanceFromBoutSummary()}
        className="mt-6 px-5 py-2 font-mono uppercase tracking-wide-caps text-[12px] text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90"
        style={{ borderRadius: "2px" }}
      >
        Next bout →
      </button>
      <p className="mt-2 text-[10px] italic text-ink-200">
        Auto-advancing in {Math.round(BOUT_SUMMARY_AUTO_ADVANCE_MS / 1000)}s.
      </p>
    </section>
  );
});

const PhaseInterstitial = observer(function PhaseInterstitial({ match }: { match: MatchStore }) {
  if (match.uiPhase.kind !== "phase-summary") return null;
  const finishedIdx = match.uiPhase.finishedPhaseIndex;
  const finishedPhase = match.phaseMeta[finishedIdx];
  const nextPhase = match.phaseMeta[finishedIdx + 1];
  const phaseBouts = match.bouts.filter((b) => b.phaseIndex === finishedIdx);
  const userPhaseScore = phaseBouts.reduce((s, b) => s + b.playerScore, 0);
  const oppPhaseScore = phaseBouts.reduce((s, b) => s + b.opponentScore, 0);
  return (
    <section
      className="text-center py-12 border border-ink-300 bg-paper-100"
      style={{ borderRadius: "3px" }}
    >
      <div className="label-caps mb-2">Phase complete</div>
      <div
        className="font-display text-[32px] text-ink-500 mb-1"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
      >
        {finishedPhase?.name ?? `Phase ${finishedIdx + 1}`}
      </div>
      <div className="font-mono text-[12px] text-ink-200 mb-6">
        {phaseBouts.length} bout{phaseBouts.length === 1 ? "" : "s"} · You {userPhaseScore.toLocaleString()}
        {match.format === "vs-bot" && (
          <> · {match.persona?.name ?? "Bot"} {oppPhaseScore.toLocaleString()}</>
        )}
      </div>
      <button
        type="button"
        data-testid="match.phase.begin-next"
        onClick={() => match.beginNextPhase()}
        className="px-6 py-3 font-mono uppercase tracking-wide-caps text-[13px] text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90"
        style={{ borderRadius: "2px" }}
      >
        Begin {nextPhase?.name ?? `Phase ${finishedIdx + 2}`} →
      </button>
    </section>
  );
});

// ---------------------------------------------------------------------------
//  Match end
// ---------------------------------------------------------------------------

const MatchEndScreen = observer(function MatchEndScreen({ match }: { match: MatchStore }) {
  const root = useAppStore();
  const totals = match.userTotals;
  const userTotal = totals.P1 + totals.P2;
  const opp = match.opponentTotal;
  const userRaces = match.bouts.length;
  const userAvg = userRaces === 0 ? 0 : userTotal / userRaces;
  const headline =
    match.format === "vs-bot"
      ? userTotal > opp
        ? "You win."
        : userTotal < opp
        ? `${match.persona?.name ?? "Bot"} wins.`
        : "Tie game."
      : `Hot-seat complete.`;

  return (
    <section className="text-center pt-6">
      <div className="label-caps mb-2 text-oxblood-500">Match complete</div>
      <h2
        className="font-display text-[44px] text-ink-500 mb-6 leading-tight"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}
      >
        {headline}
      </h2>

      <div className="flex items-baseline justify-center gap-6 sm:gap-10 mb-3 flex-wrap">
        {match.format === "hot-seat" ? (
          <>
            <SeatTotal
              label="P1 total"
              value={totals.P1}
              expected={match.userExpectedTotal}
            />
            <span className="text-ink-100/40 font-display text-[36px]">·</span>
            <SeatTotal
              label="P2 total"
              value={totals.P2}
              expected={match.opponentExpectedTotal}
            />
          </>
        ) : (
          <>
            <SeatTotal
              label="You"
              value={userTotal}
              expected={match.userExpectedTotal}
            />
            <span className="text-ink-100/40 font-display text-[36px]">·</span>
            <SeatTotal
              label={match.persona?.name ?? "Bot"}
              value={opp}
              expected={match.opponentExpectedTotal}
            />
          </>
        )}
      </div>

      <p className="text-[12px] font-mono text-ink-200 mb-8">
        {userRaces} race{userRaces === 1 ? "" : "s"} · avg {userAvg.toFixed(1)} pts/race
      </p>

      <div className="flex justify-center gap-3 flex-wrap">
        <button
          type="button"
          data-testid="match.end.open-compose"
          onClick={async () => {
            await root.composition.loadFromContentBackend(match.compId);
            root.setMatch(null);
            root.setView("compose");
          }}
          className="px-4 py-2 font-mono uppercase tracking-wide-caps text-[11px] text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90"
          style={{ borderRadius: "2px" }}
        >
          Open in Compose
        </button>
        <button
          type="button"
          data-testid="match.end.view-history"
          onClick={() => {
            root.library.openHistory(match.compId);
            root.setMatch(null);
            root.setView("library");
          }}
          className="px-4 py-2 font-mono uppercase tracking-wide-caps text-[11px] text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500"
          style={{ borderRadius: "2px" }}
        >
          View history
        </button>
        <button
          type="button"
          data-testid="match.end.quick-race"
          onClick={() => {
            root.setMatch(null);
          }}
          className="px-4 py-2 font-mono uppercase tracking-wide-caps text-[11px] text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500"
          style={{ borderRadius: "2px" }}
        >
          Back to Quick Race
        </button>
      </div>

      <BoutBreakdown match={match} />
    </section>
  );
});

function SeatTotal(props: {
  label: string;
  value: number;
  /**
   * Sum of the matrix's `expectedScore` for this seat across every
   * bout that was played. Rendered as a small caption beneath the
   * actual total so the user can gauge how well they tracked the
   * matrix prediction. Pass `0` to omit (e.g. hot-seat opponent
   * column, or any state with zero played bouts).
   */
  expected: number;
}) {
  const { value, expected } = props;
  // Only show a delta when we actually have an expected value AND
  // at least one bout was scored — otherwise the "vs expected 0"
  // caption is noise.
  const showExpected = expected > 0;
  const delta = showExpected ? value - expected : 0;
  const deltaSign = delta > 0 ? "+" : "";
  return (
    <div>
      <div className="label-caps">{props.label}</div>
      <div
        className="font-display tabular text-[60px] leading-none text-oxblood-500"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 1' }}
      >
        {value.toLocaleString()}
      </div>
      {showExpected && (
        <div className="mt-1 font-mono text-[11px] text-ink-200 tabular">
          <span className="label-caps mr-1.5 text-ink-100">Expected</span>
          {Math.round(expected).toLocaleString()}
          <span
            className={
              delta === 0
                ? "ml-2 text-ink-100"
                : delta > 0
                ? "ml-2 text-support-500"
                : "ml-2 text-oxblood-500/70"
            }
          >
            ({deltaSign}
            {delta.toLocaleString()})
          </span>
        </div>
      )}
    </div>
  );
}

const BoutBreakdown = observer(function BoutBreakdown({ match }: { match: MatchStore }) {
  if (match.bouts.length === 0) return null;
  return (
    <section className="mt-12 text-left max-w-2xl mx-auto">
      <div className="label-caps mb-3">Bout-by-bout</div>
      <ul className="space-y-1.5">
        {match.bouts.map((b, i) => {
          const phase = match.phaseMeta[b.phaseIndex];
          const expected = match.expectedFor(b);
          return (
            <li
              key={`${i}-${b.phaseIndex}-${b.boardIndex}-${b.boutIndex}-${b.userSeat}`}
              className="flex items-baseline gap-3 px-3 py-1.5 border-b border-ink-100/15 font-mono text-[12px] text-ink-300"
            >
              <span className="label-caps text-ink-100 min-w-[120px]">
                {phase?.name ?? `Phase ${b.phaseIndex + 1}`} · B{b.boardIndex + 1}·{b.boutIndex + 1}
              </span>
              <span className="min-w-[40px] text-oxblood-500">{b.userSeat}</span>
              <span className="tabular">{b.playerScore.toLocaleString()}</span>
              {match.format === "vs-bot" && (
                <>
                  <span className="text-ink-100/40">vs</span>
                  <span className="tabular">{b.opponentScore.toLocaleString()}</span>
                </>
              )}
              {expected !== null && (
                <span
                  className="text-ink-100"
                  title={
                    match.format === "vs-bot"
                      ? `Matrix expected ${Math.round(expected.user)} for you, ${Math.round(expected.opponent)} for opponent`
                      : `Matrix expected ${Math.round(expected.user)} for ${b.userSeat}`
                  }
                >
                  exp&nbsp;
                  <span className="tabular">{Math.round(expected.user).toLocaleString()}</span>
                  {match.format === "vs-bot" && (
                    <>
                      <span className="text-ink-100/40">/</span>
                      <span className="tabular">{Math.round(expected.opponent).toLocaleString()}</span>
                    </>
                  )}
                </span>
              )}
              <span className="ml-auto text-ink-200">
                {b.playerCellsKnocked}/{b.maxCells} cells
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
