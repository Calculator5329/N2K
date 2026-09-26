/**
 * EquationEntry — the player's input during a knockout race.
 *
 * Used under the player's board by Quick Race (`PlayView`) and by
 * competition bouts (`MatchView`), each passing its own `PlayStore`.
 * The player types an equation and presses Enter; `submitEquation`
 * knocks the open cell the equation hits (or the targeted cell) only
 * when the equation is legal for the roll. A refusal shows its reason
 * under the input and the text stays so it can be fixed.
 *
 * Test ids are written out as literals per surface so the Agent Handles
 * scanner can register them (a `${prefix}.equation` template cannot be).
 */
import { observer } from "mobx-react-lite";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { PlayStore } from "../../stores/PlayStore.js";

export const EquationEntry = observer(function EquationEntry(props: {
  play: PlayStore;
  /** Which race this sits in; picks the `play.race.*` or `match.race.*` ids. */
  surface: "play" | "match";
}) {
  const { play } = props;
  const inMatch = props.surface === "match";
  const formTestId = inMatch ? "match.race.entry" : "play.race.entry";
  const equationTestId = inMatch ? "match.race.equation" : "play.race.equation";
  const knockTestId = inMatch ? "match.race.knock" : "play.race.knock";
  const refusalTestId = inMatch ? "match.race.refusal" : "play.race.refusal";
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const reasonId = useId();
  const target =
    play.targetIndex === null ? null : play.boardCells[play.targetIndex] ?? null;

  // The race starting (or resuming) and clicking a cell to aim both put
  // the caret where the typing goes.
  useEffect(() => {
    if (play.isRacing) inputRef.current?.focus();
  }, [play.isRacing, play.targetIndex]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() === "") return;
    if (play.submitEquation(text).ok) setText("");
  };

  return (
    <form onSubmit={submit} data-testid={formTestId} className="flex flex-col gap-1 no-print">
      <div className="flex items-stretch gap-2 min-w-0">
        <label
          htmlFor={`${reasonId}-input`}
          className="label-caps text-oxblood-500 shrink-0 self-center min-w-[64px]"
        >
          {target === null ? "Equation" : `For ${target}`}
        </label>
        <input
          id={`${reasonId}-input`}
          ref={inputRef}
          data-testid={equationTestId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!play.isRacing}
          placeholder="2^3 × 5 − 3"
          // Numeric keypads have no ^ or operators, so ask for the full
          // text keyboard explicitly; Enter reads "Go" on phones.
          inputMode="text"
          enterKeyHint="go"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={play.lastRefusal !== null}
          aria-describedby={reasonId}
          className="flex-1 min-w-0 px-2 py-1.5 bg-paper-50 border border-ink-100/40 font-mono text-[15px] text-ink-500 placeholder:text-ink-100 focus:outline-none focus:border-oxblood-500"
          style={{ borderRadius: "2px" }}
        />
        <button
          type="submit"
          data-testid={knockTestId}
          disabled={!play.isRacing}
          className="shrink-0 px-3 font-mono uppercase tracking-wide-caps text-[10px] text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90 transition-colors"
          style={{ borderRadius: "2px" }}
        >
          Knock
        </button>
      </div>
      <p
        id={reasonId}
        role="status"
        aria-live="polite"
        data-testid={refusalTestId}
        className="min-h-[1.25em] text-[11px] italic text-oxblood-500"
      >
        {play.lastRefusal ?? ""}
      </p>
    </form>
  );
});
