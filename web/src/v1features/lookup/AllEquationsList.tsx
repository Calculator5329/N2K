import { useEffect, useRef, useState } from "react";
import type { DiceTriple } from "../../core/types";
import { Equation } from "../../v1ui/Equation";
import { DifficultyMeter } from "../../v1ui/DifficultyMeter";
import {
  solveAllEquations,
  type SolverWorkerSolution,
} from "../../v1services/solverWorkerService";

/**
 * Inline disclosure under the easiest-equation view that lists *every*
 * way to land the current `(dice, total)`, ranked by difficulty
 * ascending. The list is computed on demand via the solver Web Worker
 * (the static dataset only ships the easiest entry per cell).
 *
 * Lazy by construction: we don't even contact the worker until the user
 * opens the panel. After that, we re-fetch whenever `dice` or `total`
 * changes; the worker is kept warm so subsequent fetches are quick.
 */
interface AllEquationsListProps {
  dice: DiceTriple;
  total: number;
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; solutions: readonly SolverWorkerSolution[]; ms: number }
  | { status: "error"; message: string };

const INITIAL_VISIBLE = 25;
const PAGE_SIZE = 25;

export function AllEquationsList({ dice, total }: AllEquationsListProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [visible, setVisible] = useState(INITIAL_VISIBLE);
  // Bump this whenever a new fetch starts so an older in-flight reply
  // can be discarded if the user has already moved on.
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const seq = ++requestSeq.current;
    setState({ status: "loading" });
    setVisible(INITIAL_VISIBLE);
    const start = performance.now();
    solveAllEquations(dice, total).then(
      (solutions) => {
        if (seq !== requestSeq.current) return;
        setState({
          status: "ready",
          solutions,
          ms: Math.max(1, Math.round(performance.now() - start)),
        });
      },
      (err: Error) => {
        if (seq !== requestSeq.current) return;
        setState({ status: "error", message: err.message });
      },
    );
  }, [open, dice, total]);

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={[
          "label-caps inline-flex items-center gap-1.5",
          "text-ink-100 hover:text-oxblood-500 transition-colors",
        ].join(" ")}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        All equations for this cell
      </button>

      {open && (
        <div className="mt-3">
          {state.status === "loading" && (
            <div
              className="font-mono text-[12px] text-ink-100"
              role="status"
              aria-live="polite"
            >
              Searching every combination…
            </div>
          )}

          {state.status === "error" && (
            <div className="font-mono text-[12px] text-oxblood-500">
              Couldn't compute: {state.message}
            </div>
          )}

          {state.status === "ready" && state.solutions.length === 0 && (
            <p className="italic text-ink-200 text-[13px]">
              No equations exist for this cell.
            </p>
          )}

          {state.status === "ready" && state.solutions.length > 0 && (
            <ResultList
              solutions={state.solutions}
              visible={visible}
              onShowMore={() =>
                setVisible((v) => Math.min(state.solutions.length, v + PAGE_SIZE))
              }
              ms={state.ms}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ResultList({
  solutions,
  visible,
  onShowMore,
  ms,
}: {
  solutions: readonly SolverWorkerSolution[];
  visible: number;
  onShowMore: () => void;
  ms: number;
}) {
  const total = solutions.length;
  const shown = Math.min(visible, total);
  const remaining = total - shown;

  return (
    <div>
      <div className="label-caps text-ink-100 mb-2 flex items-baseline justify-between">
        <span>
          {total} equation{total === 1 ? "" : "s"}, easiest first
        </span>
        <span className="font-mono text-[10px] tabular text-ink-100/70">
          {ms} ms
        </span>
      </div>

      <ol className="divide-y divide-ink-100/10 border-y border-ink-100/15">
        {solutions.slice(0, shown).map((s, i) => (
          <li
            key={`${i}-${s.equation}`}
            className="py-2.5 flex items-center justify-between gap-4"
          >
            <div className="flex items-baseline gap-3 min-w-0">
              <span className="font-mono tabular text-[11px] text-ink-100 w-6 shrink-0 text-right">
                {i + 1}
              </span>
              <Equation equation={s.equation} size="inline" />
            </div>
            <DifficultyMeter difficulty={s.difficulty} />
          </li>
        ))}
      </ol>

      {remaining > 0 && (
        <button
          type="button"
          onClick={onShowMore}
          className={[
            "mt-3 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide-caps",
            "text-ink-200 border border-ink-100/30",
            "hover:bg-paper-100 hover:border-ink-100/60 transition-colors",
          ].join(" ")}
          style={{ borderRadius: "2px" }}
        >
          Show {Math.min(PAGE_SIZE, remaining)} more
        </button>
      )}
    </div>
  );
}
