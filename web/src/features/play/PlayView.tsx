/**
 * PlayView — the classic N2K knockout race.
 *
 * Inspired by the original printed boardgame: a 6×6 grid of numbers
 * 1..36, three shared dice, a 60-second timer, and a bot working its
 * way through the same dice on a parallel board on the right. Click a
 * cell on your board to "knock it off"; whoever has the higher score
 * when the buzzer sounds wins.
 *
 * UI follows the v1 editorial vocabulary:
 *   - `PageHeader` for setup/results screens
 *   - `label-caps`, `font-display`, `font-mono`, oxblood accents
 *   - The two boards mimic the printed game card: white surface with a
 *     navy hairline border, large serif numerals, knocked cells filled
 *     with the active accent color. The board never strays from the
 *     theme: `paper-*` for the cell surface, `ink-500` for digits,
 *     `oxblood-500` for player knocks, `support-500` for bot knocks.
 *
 * The functional brain (timer, dice rolls, scoring, bot scheduling)
 * lives in `PlayStore`; this file is presentation only.
 */
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useAppStore } from "../../stores/AppStoreContext.js";
import {
  BOT_DIFFICULTY_LABEL,
  type BotDifficulty,
} from "@platform/games/knockoutBot.js";
import { formatEquationAgainstPool } from "@platform/services/parsing.js";
import type { NEquation } from "@platform/core/types.js";
import { PageHeader } from "../../ui/primitives/PageHeader.js";

// ---------------------------------------------------------------------------
//  Top-level switcher
// ---------------------------------------------------------------------------

export const PlayView = observer(function PlayView() {
  const { play } = useAppStore();

  // Tear down the race timer if the user navigates away mid-race.
  useEffect(() => () => play.dispose(), [play]);

  if (play.status === "setup") return <SetupScreen />;
  if (play.status === "racing") return <RaceScreen />;
  return <ResultsScreen />;
});

// ---------------------------------------------------------------------------
//  Setup
// ---------------------------------------------------------------------------

const DIFFICULTIES: readonly BotDifficulty[] = [
  "easy",
  "standard",
  "hard",
  "expert",
  "master",
];

const SetupScreen = observer(function SetupScreen() {
  const { play, secret } = useAppStore();

  return (
    <article>
      <PageHeader
        folio="III"
        eyebrow="Play"
        title={
          <>
            Three dice, sixty seconds,{" "}
            <span
              className="italic text-oxblood-500"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}
            >
              one minute&nbsp;flat.
            </span>
          </>
        }
        dek="Knock numbers off your 6×6 board faster than the bot does theirs. Same dice, same numbers, separate boards. Click a cell when you can hit it with the dice; whoever has the higher score when the buzzer sounds takes the round."
      />

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
        <div className="lg:col-span-7 min-w-0">
          <div className="label-caps mb-4">Bot difficulty</div>
          <div
            // 5-up strip on tablets/desktops (the canonical layout),
            // but a 3-up + 2-up grid below `sm` so each tile is wide
            // enough to fit "Standard" / "Master" on a single line at
            // 320px-wide phones. `containerType: inline-size` lets
            // each label size from the actual strip width via `cqw`.
            className="grid grid-cols-3 sm:grid-cols-5 border border-ink-100/30 divide-y divide-x divide-ink-100/30 sm:divide-y-0 bg-paper-100"
            style={{ containerType: "inline-size" }}
          >
            {DIFFICULTIES.map((d) => (
              <DifficultyTile
                key={d}
                difficulty={d}
                active={play.setup.difficulty === d}
                onClick={() => play.setSetup({ difficulty: d })}
              />
            ))}
          </div>
          <p className="mt-4 max-w-prose text-[13px] italic leading-snug text-ink-200">
            Bots solve the dice up front, then knock cells one at a time —
            harder equations take proportionally longer to reveal. Easy
            stops at the obvious answers; Master finds nearly every cell.
          </p>

          {secret.aetherActive && (
            <div className="mt-10">
              <div className="label-caps mb-3">Rules</div>
              <div className="grid grid-cols-2 border border-ink-100/30 divide-x divide-ink-100/30 bg-paper-100">
                <RulesTile
                  active={play.setup.rules === "standard"}
                  label="Standard"
                  caption="Dice 2–20 · Target 1–999"
                  onClick={() => play.setSetup({ rules: "standard" })}
                />
                <RulesTile
                  active={play.setup.rules === "aether"}
                  label="Æther"
                  caption="Wider dice · negatives · 1–5,000"
                  onClick={() => play.setSetup({ rules: "aether" })}
                />
              </div>
              <p className="mt-3 max-w-prose text-[13px] italic leading-snug text-ink-200">
                Æther races widen the dice range and unlock literal
                negatives plus large exponents. Bots solve under the same
                rules — expect tougher cells and slower per-cell reveals.
              </p>
            </div>
          )}

          <div className="mt-12 flex items-center gap-4">
            <button
              type="button"
              onClick={() => play.start()}
              className="px-7 py-3.5 font-mono uppercase tracking-wide-caps text-[12px] text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90 transition-colors"
              style={{ borderRadius: "2px" }}
            >
              Roll dice &amp; begin
            </button>
            <span className="text-[12px] italic text-ink-200">
              You'll have one minute. The clock starts on the first frame.
            </span>
          </div>
        </div>

        <aside className="lg:col-span-5 lg:pl-10 lg:border-l lg:border-ink-100/15 min-w-0">
          <div className="label-caps mb-4">House rules</div>
          <ul className="space-y-3 font-display text-[18px] leading-snug text-ink-300">
            <RuleRow ord="i.">
              The board is 1 through 36. Both you and the bot work the same
              numbers on separate boards.
            </RuleRow>
            <RuleRow ord="ii.">
              Three dice, values 2 through 20, rolled once at the start of
              the round.
            </RuleRow>
            <RuleRow ord="iii.">
              An equation chains all three dice with{" "}
              <em>+&nbsp;−&nbsp;×&nbsp;÷</em> and integer exponents,
              evaluated left to right.
            </RuleRow>
            <RuleRow ord="iv.">
              Click a cell to knock it off. Click again to put it back.
              Score is the sum of knocked numbers — clear the whole board
              and you get a time bonus.
            </RuleRow>
          </ul>
        </aside>
      </section>
    </article>
  );
});

function DifficultyTile(props: {
  difficulty: BotDifficulty;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={[
        "px-1 py-3 sm:py-4 text-center transition-colors min-w-0 overflow-hidden",
        props.active
          ? "bg-oxblood-500 text-paper-50"
          : "text-ink-300 hover:text-oxblood-500 hover:bg-paper-50",
      ].join(" ")}
    >
      <div
        className="font-display leading-none whitespace-nowrap"
        style={{
          // 3.5cqw scales the label with the strip width so the
          // longest label ("Standard") fits a single line at every
          // breakpoint. Floor at 11px keeps it readable on tiny
          // phones; 15px cap matches the original design.
          fontSize: "clamp(11px, 3.5cqw, 15px)",
          fontVariationSettings: '"opsz" 144, "SOFT" 30',
        }}
      >
        {BOT_DIFFICULTY_LABEL[props.difficulty]}
      </div>
      <div
        className={[
          "mt-1 font-mono uppercase tracking-wide-caps whitespace-nowrap",
          "text-[8px] sm:text-[9px]",
          props.active ? "text-paper-200" : "text-ink-100",
        ].join(" ")}
      >
        Tier&nbsp;{DIFFICULTIES.indexOf(props.difficulty) + 1}
      </div>
    </button>
  );
}

function RulesTile(props: {
  active: boolean;
  label: string;
  caption: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={[
        "px-3 py-3 sm:py-4 text-center transition-colors min-w-0 overflow-hidden",
        props.active
          ? "bg-oxblood-500 text-paper-50"
          : "text-ink-300 hover:text-oxblood-500 hover:bg-paper-50",
      ].join(" ")}
    >
      <div
        className="font-display leading-none whitespace-nowrap"
        style={{
          fontSize: "clamp(13px, 1.4vw, 18px)",
          fontVariationSettings: '"opsz" 144, "SOFT" 30',
        }}
      >
        {props.label}
      </div>
      <div
        className={[
          "mt-1 font-mono uppercase tracking-wide-caps whitespace-nowrap",
          "text-[8px] sm:text-[9px]",
          props.active ? "text-paper-200" : "text-ink-100",
        ].join(" ")}
      >
        {props.caption}
      </div>
    </button>
  );
}

function RuleRow(props: { ord: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-baseline">
      <span className="font-mono text-[10px] uppercase tracking-wide-caps text-oxblood-500 min-w-[22px]">
        {props.ord}
      </span>
      <span>{props.children}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
//  Race screen
// ---------------------------------------------------------------------------

const RaceScreen = observer(function RaceScreen() {
  return (
    // Single tight column that fits the typical viewport without
    // scrolling: timer + scoreline at the top, two boards in the
    // middle, dice strip directly under the player's board where the
    // eye is, forfeit button at the bottom.
    //
    // At <`sm` (640px) the dual-board grid would crush each 6×6 grid
    // to ~25px cells, making digits unreadable. Stack the boards
    // vertically (the player on top, where the thumb is) and keep the
    // side-by-side race only on tablet and up.
    <article className="flex flex-col items-stretch gap-3 sm:gap-4">
      <RaceTopBar />
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 lg:gap-8 items-start">
        <PlayerColumn />
        <BotColumn />
      </section>
      <RaceFooter />
    </article>
  );
});

const RaceTopBar = observer(function RaceTopBar() {
  const { play } = useAppStore();
  return (
    <header className="text-center pt-2 pb-3 sm:pb-4 border-b border-ink-100/20">
      <div className="font-mono uppercase tracking-wide-caps text-[10px] text-oxblood-500 mb-1">
        §&nbsp;III · Play · race in progress
      </div>
      <CountdownClock />
      <ScoreLine />
    </header>
  );
});

const CountdownClock = observer(function CountdownClock() {
  const { play } = useAppStore();
  const total = Math.ceil(play.remainingMs / 1000);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  const urgent = play.remainingMs <= 10_000;
  return (
    <div
      className={[
        "font-display tabular leading-none",
        // Comfortable but not viewport-dominating; ~64px on desktop.
        "text-[clamp(2.75rem,7vw,4.25rem)]",
        urgent ? "text-oxblood-500" : "text-ink-500",
      ].join(" ")}
      style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 1' }}
      aria-live="polite"
    >
      {String(mm).padStart(1, "0")}:
      <span className={urgent ? "text-oxblood-500" : ""}>
        {String(ss).padStart(2, "0")}
      </span>
    </div>
  );
});

const ScoreLine = observer(function ScoreLine() {
  const { play } = useAppStore();
  return (
    <div className="mt-1 flex items-baseline justify-center gap-3 sm:gap-5">
      <span className="label-caps text-oxblood-500">You</span>
      <span
        className="font-display tabular leading-none text-ink-500"
        style={{
          fontSize: "clamp(20px, 2.6vw, 28px)",
          fontVariationSettings: '"opsz" 144, "SOFT" 30',
        }}
      >
        {play.playerScore}
      </span>
      <span className="text-ink-100/60 font-display leading-none">·</span>
      <span className="label-caps text-support-500">{play.setup.botName}</span>
      <span
        className="font-display tabular leading-none text-ink-500"
        style={{
          fontSize: "clamp(20px, 2.6vw, 28px)",
          fontVariationSettings: '"opsz" 144, "SOFT" 30',
        }}
      >
        {play.botScore}
      </span>
    </div>
  );
});

const PlayerColumn = observer(function PlayerColumn() {
  const { play } = useAppStore();
  return (
    <div className="min-w-0 flex flex-col gap-2 sm:gap-3">
      <ColumnHeader
        title="You"
        accent="text-oxblood-500"
        subtitle="Click to knock"
      />
      <BoardGrid
        knockedSet={play.playerKnockedSet}
        accentClass="bg-oxblood-500 text-paper-50 border-oxblood-500"
        interactive
      />
      <DiceStrip side="player" />
    </div>
  );
});

const BotColumn = observer(function BotColumn() {
  const { play } = useAppStore();
  return (
    <div className="min-w-0 flex flex-col gap-2 sm:gap-3">
      <ColumnHeader
        title={play.setup.botName}
        accent="text-support-500"
        subtitle={`Tier ${
          DIFFICULTIES.indexOf(play.setup.difficulty) + 1
        } · ${play.botKnocked.length}/${play.boardCells.length} found`}
      />
      <BoardGrid
        knockedSet={play.botKnockedSet}
        accentClass="bg-support-500 text-paper-50 border-support-500"
        interactive={false}
      />
      {/* Mirror the player's dice strip so the layout reads as a true
          split-screen race rather than two mismatched columns. The
          dice are physically the same (one shared roll), but showing
          them under both boards is the symmetry the eye expects. */}
      <DiceStrip side="bot" />
    </div>
  );
});

function ColumnHeader(props: {
  title: string;
  accent: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <div className="min-w-0 truncate">
        <span
          className={[
            "font-display leading-none truncate",
            props.accent,
          ].join(" ")}
          style={{
            fontSize: "clamp(18px, 2.4vw, 26px)",
            fontVariationSettings: '"opsz" 144, "SOFT" 30',
          }}
        >
          {props.title}
        </span>
        <span className="ml-2 font-mono uppercase tracking-wide-caps text-[10px] text-ink-100">
          {props.subtitle}
        </span>
      </div>
    </div>
  );
}

const DiceStrip = observer(function DiceStrip(props: {
  /**
   * Which board this strip sits under. Both sides see the same roll;
   * the side prop only changes the label colour and the auxiliary
   * text so each column reads as belonging to its player.
   */
  side?: "player" | "bot";
}) {
  const { play } = useAppStore();
  const side = props.side ?? "player";
  const labelClass = side === "bot" ? "text-support-500" : "text-oxblood-500";
  const aux =
    side === "bot"
      ? `Reaches ${play.botReachableCount}/${play.boardCells.length}`
      : `Found ${play.playerKnocked.length}/${play.boardCells.length}`;
  return (
    <section
      // `flex-wrap` lets the auxiliary "Reaches X/36" text drop to a
      // second line at very narrow widths (≲ 320px) instead of being
      // clipped past the right border. `min-w-0` on the parent +
      // `flex-1` on the dice block keeps the dice glyphs centered
      // when the aux text wraps.
      className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2 py-1.5 bg-paper-100 border border-ink-100/20"
      style={{ borderRadius: "3px" }}
      aria-label={`Dice pool — ${side === "bot" ? "bot" : "player"}`}
    >
      <span className={["label-caps shrink-0", labelClass].join(" ")}>
        Dice
      </span>
      <div
        className="inline-flex items-stretch border border-ink-100/30 divide-x divide-ink-100/30 bg-paper-50 font-display tabular text-ink-500"
        style={{ borderRadius: "2px" }}
      >
        {play.dice.map((d, i) => (
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
      <span className="text-[10px] italic text-ink-200 text-right shrink-0">
        {aux}
      </span>
    </section>
  );
});

const BoardGrid = observer(function BoardGrid(props: {
  knockedSet: ReadonlySet<number>;
  accentClass: string;
  interactive: boolean;
}) {
  const { play } = useAppStore();
  const cells = play.boardCells;
  return (
    <div
      // `containerType: inline-size` lets the inner cells size their
      // text based on the actual rendered width of this board (via
      // `cqw` units) rather than the global viewport width. This keeps
      // 3-digit numbers like 104/112/288 readable when the board is
      // squeezed into a 2-up layout at md/lg breakpoints.
      className="p-2 bg-paper-50 border-2 border-ink-500"
      style={{ borderRadius: "3px", containerType: "inline-size" }}
    >
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}
      >
        {cells.map((value, idx) => (
          <BoardCell
            key={idx}
            idx={idx}
            value={value}
            knocked={props.knockedSet.has(idx)}
            accentClass={props.accentClass}
            interactive={props.interactive}
          />
        ))}
      </div>
    </div>
  );
});

const BoardCell = observer(function BoardCell(props: {
  idx: number;
  value: number;
  knocked: boolean;
  accentClass: string;
  interactive: boolean;
}) {
  const { play } = useAppStore();
  const onClick = () => {
    if (!props.interactive) return;
    play.knockCell(props.idx);
  };
  const baseClass =
    "aspect-square flex items-center justify-center border font-display tabular leading-none transition-colors";
  const restingClass = "bg-paper-50 text-ink-500 border-ink-100/40";
  const interactiveHover = props.interactive
    ? "hover:border-oxblood-500 hover:text-oxblood-500 cursor-pointer"
    : "cursor-default";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!props.interactive}
      aria-pressed={props.knocked}
      title={
        props.knocked
          ? `${props.value} — knocked`
          : props.interactive
            ? `Knock ${props.value}`
            : `${props.value}`
      }
      className={[
        baseClass,
        props.knocked ? props.accentClass : restingClass,
        props.knocked ? "" : interactiveHover,
      ].join(" ")}
      style={{
        borderRadius: "2px",
        // Board container is ~6 cells wide → each cell ≈ 16cqw.
        // 5.5cqw keeps a 3-digit number ("288") inside its cell at
        // every board width without overlapping the neighbour, with
        // a 22px cap on wide layouts and an 11px floor on tiny ones.
        fontSize: "clamp(11px, 5.5cqw, 22px)",
        fontVariationSettings: '"opsz" 144',
      }}
    >
      {props.value}
    </button>
  );
});

const RaceFooter = observer(function RaceFooter() {
  const { play } = useAppStore();
  return (
    <div className="mt-1 sm:mt-2 flex items-center justify-between gap-3 no-print">
      <span className="text-[11px] italic text-ink-200 hidden sm:inline">
        Click cells you can hit with the dice. Click again to put one back.
      </span>
      <button
        type="button"
        onClick={() => play.restart()}
        className="ml-auto px-3 py-1 font-mono uppercase tracking-wide-caps text-[10px] border border-ink-100/30 text-ink-200 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
        style={{ borderRadius: "2px" }}
      >
        Forfeit
      </button>
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Results
// ---------------------------------------------------------------------------

const ResultsScreen = observer(function ResultsScreen() {
  const { play } = useAppStore();
  const winner = play.winner;

  // Wire ←/→ to step events, space to play/pause, Esc to exit. Only
  // active on the results screen so it can't fight the in-race UI.
  // Repeated edges are fine — `setReplayMs` clamps and the actions are
  // idempotent.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        play.stepReplay(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        play.stepReplay(1);
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        play.togglePlayReplay();
      } else if (e.key === "Escape") {
        if (play.replayActive) {
          e.preventDefault();
          play.exitReplay();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play]);

  const headline =
    winner === "tie" ? (
      <>
        A draw —{" "}
        <span className="italic text-oxblood-500" style={WONK_STYLE}>
          well played.
        </span>
      </>
    ) : winner === "player" ? (
      <>
        You{" "}
        <span className="italic text-oxblood-500" style={WONK_STYLE}>
          win.
        </span>
      </>
    ) : (
      <>
        {play.setup.botName}{" "}
        <span className="italic text-oxblood-500" style={WONK_STYLE}>
          wins.
        </span>
      </>
    );

  return (
    <article>
      <PageHeader
        folio="III"
        eyebrow="Race complete"
        title={headline}
        dek={
          winner === "tie"
            ? "A perfect tie. Same dice, same numbers, identical scores. Roll again?"
            : winner === "player"
              ? "You knocked more value off the board than the bot. The almanac approves."
              : "The bot has its uses. Roll again and try to outpace it on the next set."
        }
        right={
          <button
            type="button"
            onClick={() => play.restart()}
            className="px-4 py-2 font-mono uppercase tracking-wide-caps text-[11px] text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90 transition-colors"
            style={{ borderRadius: "2px" }}
          >
            New race
          </button>
        }
      />

      <DiceStrip />

      <ReplayBar />

      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
        <ResultsBoard
          title="You"
          score={play.playerScore}
          knocked={play.currentPlayerKnocked}
          accentClass="bg-oxblood-500 text-paper-50 border-oxblood-500"
        />
        <ResultsBoard
          title={play.setup.botName}
          score={play.botScore}
          knocked={play.currentBotKnocked}
          accentClass="bg-support-500 text-paper-50 border-support-500"
        />
      </section>

      <BotEquationLog />
    </article>
  );
});

// ---------------------------------------------------------------------------
//  Replay scrubber (#C — post-race timeline review)
//
//  Closed by default — clicking "Replay race" drops the user into the
//  scrubber, where the boards reflect the chosen timestamp instead of
//  the final state. ←/→/Space keyboard shortcuts are wired in
//  `ResultsScreen` above; this component renders the visual controls.
// ---------------------------------------------------------------------------

const ReplayBar = observer(function ReplayBar() {
  const { play } = useAppStore();
  if (play.replayTimeline.length === 0) {
    // No knocks happened — nothing to scrub through. (Edge case but
    // worth handling so we don't show an empty 0-second bar.)
    return null;
  }

  if (!play.replayActive) {
    return (
      <div className="my-6 flex items-center gap-3 no-print">
        <button
          type="button"
          onClick={() => play.enterReplay()}
          className="px-3 py-1.5 font-mono uppercase tracking-wide-caps text-[11px] border border-ink-100/40 text-ink-300 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
          style={{ borderRadius: "2px" }}
        >
          ▶ Replay race
        </button>
        <span className="text-[11px] italic text-ink-200">
          Step through every knock — ←/→ to navigate, Space to play.
        </span>
      </div>
    );
  }

  const totalMs = 60_000;
  const cursor = play.replayMs ?? 0;
  const seconds = (cursor / 1000).toFixed(1);
  const eventsBefore = play.replayTimeline.filter((e) => e.atMs <= cursor).length;

  return (
    <section
      className="my-6 px-4 py-3 border border-ink-100/30 bg-paper-100 no-print"
      style={{ borderRadius: "3px" }}
      aria-label="Race replay scrubber"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="label-caps">Replay</div>
        <div
          className="font-mono tabular text-[12px] text-ink-300"
          aria-live="polite"
        >
          {seconds}s · {eventsBefore}/{play.replayTimeline.length} knocks
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => play.stepReplay(-1)}
          aria-label="Previous knock"
          title="Previous knock (←)"
          className="px-2.5 py-1 font-mono text-[14px] text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500"
          style={{ borderRadius: "2px" }}
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => play.togglePlayReplay()}
          aria-label={play.replayPlaying ? "Pause replay" : "Play replay"}
          title={play.replayPlaying ? "Pause (Space)" : "Play (Space)"}
          className="px-3 py-1 font-mono text-[12px] uppercase tracking-wide-caps text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90"
          style={{ borderRadius: "2px" }}
        >
          {play.replayPlaying ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button
          type="button"
          onClick={() => play.stepReplay(1)}
          aria-label="Next knock"
          title="Next knock (→)"
          className="px-2.5 py-1 font-mono text-[14px] text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500"
          style={{ borderRadius: "2px" }}
        >
          →
        </button>
        <input
          type="range"
          min={0}
          max={totalMs}
          step={100}
          value={cursor}
          onChange={(e) => play.setReplayMs(Number(e.target.value))}
          aria-label="Replay timestamp (milliseconds)"
          className="flex-1 accent-oxblood-500"
        />
        <button
          type="button"
          onClick={() => play.exitReplay()}
          aria-label="Exit replay"
          title="Exit replay (Esc)"
          className="px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide-caps text-ink-200 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500"
          style={{ borderRadius: "2px" }}
        >
          ✕ Exit
        </button>
      </div>
      <ReplayTimelineMarks />
    </section>
  );
});

const ReplayTimelineMarks = observer(function ReplayTimelineMarks() {
  const { play } = useAppStore();
  // Two stacked rails of tick marks — top = player knocks (oxblood),
  // bottom = bot knocks (support). Lets the eye see at a glance who
  // was on top throughout the race without scrubbing through each
  // event one at a time.
  const total = 60_000;
  const cursor = play.replayMs ?? 0;
  return (
    <div className="mt-3 space-y-1">
      <TimelineRail
        events={play.replayTimeline.filter((e) => e.side === "player")}
        cursor={cursor}
        total={total}
        accent="bg-oxblood-500"
        label="You"
      />
      <TimelineRail
        events={play.replayTimeline.filter((e) => e.side === "bot")}
        cursor={cursor}
        total={total}
        accent="bg-support-500"
        label={play.setup.botName}
      />
    </div>
  );
});

function TimelineRail(props: {
  events: readonly { atMs: number }[];
  cursor: number;
  total: number;
  accent: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="label-caps text-[9px] w-16 text-ink-200 truncate">
        {props.label}
      </span>
      <div className="relative flex-1 h-3 bg-paper-50 border border-ink-100/30">
        {props.events.map((e, i) => {
          const left = `${(e.atMs / props.total) * 100}%`;
          const past = e.atMs <= props.cursor;
          return (
            <span
              key={i}
              className={[
                "absolute top-0 bottom-0 w-[2px] -translate-x-[1px]",
                past ? props.accent : "bg-ink-100/40",
              ].join(" ")}
              style={{ left }}
              aria-hidden
            />
          );
        })}
        <span
          className="absolute top-[-3px] bottom-[-3px] w-[1.5px] -translate-x-[0.75px] bg-ink-500"
          style={{ left: `${(props.cursor / props.total) * 100}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

const WONK_STYLE = {
  fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1',
} as const;

const ResultsBoard = observer(function ResultsBoard(props: {
  title: string;
  score: number;
  knocked: ReadonlyArray<{ readonly cellIndex: number; readonly cellValue: number }>;
  accentClass: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div
          className="font-display text-[28px] leading-none text-ink-500"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
        >
          {props.title}
        </div>
        <div
          className="font-display tabular text-[48px] leading-none text-oxblood-500"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 1' }}
        >
          {props.score}
        </div>
      </div>
      <div
        className="p-2 bg-paper-50 border-2 border-ink-500"
        style={{ borderRadius: "3px" }}
      >
        <KnockedReadonlyGrid
          knockedSet={new Set(props.knocked.map((c) => c.cellIndex))}
          accentClass={props.accentClass}
        />
      </div>
      <p className="mt-3 text-[12px] italic text-ink-200">
        {props.knocked.length} cells knocked.
      </p>
    </div>
  );
});

const KnockedReadonlyGrid = observer(function KnockedReadonlyGrid(props: {
  knockedSet: ReadonlySet<number>;
  accentClass: string;
}) {
  const { play } = useAppStore();
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}
    >
      {play.boardCells.map((value, idx) => (
        <span
          key={idx}
          className={[
            "aspect-square flex items-center justify-center border font-display tabular leading-none",
            props.knockedSet.has(idx)
              ? props.accentClass
              : "bg-paper-50 text-ink-500 border-ink-100/40",
          ].join(" ")}
          style={{
            borderRadius: "2px",
            fontSize: "clamp(14px, 3.6vw, 24px)",
            fontVariationSettings: '"opsz" 144',
          }}
        >
          {value}
        </span>
      ))}
    </div>
  );
});

const BotEquationLog = observer(function BotEquationLog() {
  const { play } = useAppStore();
  if (play.botKnocked.length === 0) return null;
  // Newest first — typical event log.
  const sorted = [...play.botKnocked].sort((a, b) => b.cellValue - a.cellValue);
  return (
    <section className="mt-12">
      <div className="label-caps mb-4">How the bot got there</div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1.5">
        {sorted.map((c) => (
          <BotEquationRow
            key={c.cellIndex}
            cellValue={c.cellValue}
            equation={c.equation}
          />
        ))}
      </ul>
    </section>
  );
});

function BotEquationRow(props: {
  cellValue: number;
  equation: NEquation | null;
}) {
  const { play } = useAppStore();
  return (
    <li className="flex items-baseline gap-3 py-1 border-b border-ink-100/15">
      <span
        className="font-display tabular text-[18px] leading-none text-oxblood-500 min-w-[36px] text-right"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
      >
        {props.cellValue}
      </span>
      <span className="font-mono tabular text-[12px] text-ink-300 truncate">
        {props.equation
          ? formatEquationAgainstPool(props.equation, play.dice, play.mode)
          : "—"}
      </span>
    </li>
  );
}
