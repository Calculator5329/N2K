import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext";
import { Equation } from "../../v1ui/Equation";
import { DifficultyBreakdown } from "../../v1ui/DifficultyBreakdown";
import { DifficultyMeter } from "../../v1ui/DifficultyMeter";
import { DiceGlyph } from "../../v1ui/DiceGlyph";
import { FavoriteToggle } from "../../v1ui/FavoriteToggle";
import { PageHeader } from "../_shared/PageHeader";
import { AllEquationsList } from "./AllEquationsList";
import { AetherLookupView } from "./AetherLookupView";
import { LookupStore } from "./LookupStore";

type QuickAction =
  | { kind: "set"; label: string; value: number }
  | { kind: "delta"; label: string; delta: number };

const QUICK_ACTIONS: readonly QuickAction[] = [
  { kind: "set",   label: "\u2192 1",   value: 1 },
  { kind: "delta", label: "\u201210",   delta: -10 },
  { kind: "delta", label: "\u22121",    delta: -1 },
  { kind: "delta", label: "+1",         delta: +1 },
  { kind: "delta", label: "+10",        delta: +10 },
  { kind: "set",   label: "\u2192 999", value: 999 },
];

const DiceStepper = observer(function DiceStepper({
  store,
  index,
}: {
  store: LookupStore;
  index: 0 | 1 | 2;
}) {
  const value = [store.d1, store.d2, store.d3][index]!;
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => store.setDie(index, value + 1)}
        aria-label="increment"
        className="text-ink-100 hover:text-oxblood-500 text-xs leading-none p-1"
      >
        ▲
      </button>
      <input
        type="number"
        min={1}
        max={20}
        value={value}
        onChange={(e) => store.setDie(index, Number(e.target.value))}
        className="w-16 h-16 text-center bg-paper-100 border border-ink-100/30 font-mono text-[28px] tabular text-ink-500 focus:outline-none focus:border-oxblood-500 focus:ring-1 focus:ring-oxblood-500/40"
        style={{ borderRadius: "3px" }}
      />
      <button
        type="button"
        onClick={() => store.setDie(index, value - 1)}
        aria-label="decrement"
        className="text-ink-100 hover:text-oxblood-500 text-xs leading-none p-1"
      >
        ▼
      </button>
    </div>
  );
});

const SolutionPanel = observer(function SolutionPanel({
  lookup,
}: {
  lookup: LookupStore;
}) {
  const { data } = useStore();
  const dice = lookup.dice;
  const detailState = data.diceState(dice);

  if (detailState.status === "idle" || detailState.status === "loading") {
    return <Skeleton />;
  }
  if (detailState.status === "error") {
    return (
      <div className="font-mono text-oxblood-500 text-sm">
        Couldn't load solutions for this dice triple.
      </div>
    );
  }

  const detail = detailState.value;
  const solution = detail.solutions[String(lookup.total)];

  if (solution === undefined) {
    return (
      <div>
        <div className="label-caps mb-2">No solution</div>
        <p className="font-display text-[40px] text-ink-500 leading-tight max-w-md" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}>
          The dice <DiceInline dice={dice} /> cannot reach
          <span className="text-oxblood-500"> {lookup.total}</span>.
        </p>
        <p className="mt-4 italic text-ink-200">
          Of {detail.summary.solvableCount + detail.summary.impossibleCount} targets in
          1–999, this triple solves {detail.summary.solvableCount.toLocaleString()} —
          {" "}
          {Math.round(
            (100 * detail.summary.solvableCount) /
              (detail.summary.solvableCount + detail.summary.impossibleCount),
          )}
          %.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-6 mb-3">
        <div className="label-caps">The easiest equation</div>
        <DifficultyMeter difficulty={solution.difficulty} />
      </div>
      <Equation equation={solution.equation} size="display" />
      <DifficultyBreakdown equation={solution.equation} />
      <div className="no-print">
        <AllEquationsList dice={dice} total={lookup.total} />
      </div>
      <div className="mt-10 no-print">
        <NeighborhoodStrip lookup={lookup} />
      </div>
    </div>
  );
});

const NeighborhoodStrip = observer(function NeighborhoodStrip({
  lookup,
}: {
  lookup: LookupStore;
}) {
  const { data } = useStore();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);
  // Track whether the next render should refocus the active button. Set when
  // a key changed the total *while focus was inside the strip*. We can't just
  // refocus on every render — that would steal focus from the dice inputs.
  const refocusOnNextRender = useRef(false);

  // After re-render: if a keystroke just moved focus, snap focus back onto
  // the (new) active button so chevron-mashing keeps working.
  useLayoutEffect(() => {
    if (refocusOnNextRender.current && activeButtonRef.current !== null) {
      activeButtonRef.current.focus();
    }
    refocusOnNextRender.current = false;
  });

  const detailState = data.diceState(lookup.dice);
  if (detailState.status !== "ready") return null;
  const detail = detailState.value;

  const center = lookup.total;
  const radius = 5;
  const targets: number[] = [];
  for (let t = center - radius; t <= center + radius; t += 1) {
    if (t >= 1 && t <= 999) targets.push(t);
  }

  const localMax = targets.reduce((m, t) => {
    const d = detail.solutions[String(t)]?.difficulty;
    return d === undefined ? m : Math.max(m, d);
  }, 1);

  /**
   * Step the total only if focus was already inside this strip — otherwise
   * a stray arrow key on a faraway element would yank the bar chart around.
   */
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    let next: number | null = null;
    switch (e.key) {
      case "ArrowLeft":  next = center - 1; break;
      case "ArrowRight": next = center + 1; break;
      case "PageDown":   next = center - 10; break;
      case "PageUp":     next = center + 10; break;
      case "Home":       next = 1; break;
      case "End":        next = 999; break;
      default: return;
    }
    e.preventDefault();
    refocusOnNextRender.current = true;
    lookup.setTotal(Math.max(1, Math.min(999, next)));
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div className="label-caps">Adjacent targets</div>
        <div className="text-[10px] font-mono text-ink-100 hidden sm:block">
          ←/→ step · PgUp/PgDn × 10 · Home/End jump
        </div>
      </div>
      <div
        ref={containerRef}
        role="group"
        aria-label="Adjacent targets — keyboard navigable"
        onKeyDown={handleKeyDown}
        // Allow the 11-bar strip to scroll horizontally inside its
        // column on narrow viewports. The negative margin + matching
        // padding keeps the focus outline of the active bar from being
        // clipped at the column edge.
        className="flex items-end gap-1.5 outline-none overflow-x-auto -mx-1 px-1"
      >
        {targets.map((t) => {
          const sol = detail.solutions[String(t)];
          const active = t === center;
          const diff = sol?.difficulty ?? null;
          const heightPct =
            diff === null ? 0 : Math.max(8, (diff / localMax) * 100);
          return (
            <button
              key={t}
              ref={active ? activeButtonRef : undefined}
              type="button"
              tabIndex={active ? 0 : -1}
              aria-current={active ? "true" : undefined}
              aria-label={`Target ${t}${diff === null ? ", no solution" : `, difficulty ${diff}`}`}
              onClick={() => lookup.setTotal(t)}
              className="group flex flex-col items-center gap-1 w-8 sm:w-10 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-oxblood-500/60"
              style={{ borderRadius: "2px" }}
            >
              <div className="h-24 w-full flex items-end">
                <div
                  className={[
                    "w-full transition-all",
                    diff === null
                      ? "bg-paper-300/40 h-1"
                      : active
                      ? "bg-oxblood-500"
                      : "bg-ink-200/30 group-hover:bg-ink-300/50",
                  ].join(" ")}
                  style={{ height: diff === null ? "4px" : `${heightPct}%`, borderRadius: "1px" }}
                />
              </div>
              <span
                className={[
                  "font-mono tabular text-[11px]",
                  active ? "text-oxblood-500 font-medium" : "text-ink-100",
                ].join(" ")}
              >
                {t}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

function DiceInline({ dice }: { dice: readonly [number, number, number] }) {
  return (
    <span className="inline-flex align-baseline mx-1.5">
      <DiceGlyph dice={dice} size="sm" />
    </span>
  );
}

function Skeleton() {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-live="polite"
      aria-label="Loading dice details"
    >
      <div className="h-3 w-32 bg-ink-100/15" />
      <div className="h-16 w-full max-w-[460px] bg-ink-100/10" />
      <div className="h-2 w-full max-w-[300px] bg-ink-100/10" />
    </div>
  );
}

/**
 * Top-level Lookup view. Branches between standard and Æther variants
 * based on the global mode flag (set by `SecretStore`). Both variants
 * share the same page slot, header style, and core widgets — Æther just
 * widens the inputs and routes solves through the on-demand worker
 * pool. See `AetherLookupView` for the Æther-mode implementation.
 */
export const LookupView = observer(function LookupView() {
  const { secret } = useStore();
  if (secret.aetherActive) return <AetherLookupView />;
  return <StandardLookupView />;
});

const StandardLookupView = observer(function StandardLookupView() {
  const { data } = useStore();
  const lookup = useMemo(() => new LookupStore(), []);
  const dice = lookup.dice;

  useEffect(() => lookup.startSync(), [lookup]);

  useEffect(() => {
    data.ensureDice(dice);
  }, [data, dice]);

  // Page-level keyboard shortcuts: when the user is *not* focused inside an
  // editable field (so we don't fight native input arrow handling), arrow
  // keys / Page keys / Home / End walk the target. Mirrors the in-strip
  // bindings so the chart is immediately usable on page load.
  useEffect(() => {
    function isEditable(el: Element | null): boolean {
      if (el === null) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent): void {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(document.activeElement)) return;
      let next: number | null = null;
      switch (e.key) {
        case "ArrowLeft":  next = lookup.total - 1; break;
        case "ArrowRight": next = lookup.total + 1; break;
        case "PageDown":   next = lookup.total - 10; break;
        case "PageUp":     next = lookup.total + 10; break;
        case "Home":       next = 1; break;
        case "End":        next = 999; break;
        default: return;
      }
      e.preventDefault();
      lookup.setTotal(Math.max(1, Math.min(999, next)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lookup]);

  return (
    <article className="lookup-print-sheet">
      <div className="no-print mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide-caps text-ink-200 border border-ink-100/30 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
          style={{ borderRadius: "2px" }}
          title="Print this triple's solutions sheet"
          aria-label="Print this triple's solutions sheet"
        >
          ⎙ Print sheet
        </button>
      </div>
      <PageHeader
        folio="I"
        eyebrow="Equation Lookup"
        title={
          <>
            Three dice,
            <br />
            <span className="italic text-oxblood-500" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}>
              one number,
            </span>{" "}
            its easiest equation.
          </>
        }
        dek="Pick a dice triple and a target between 1 and 999. The almanac returns the lowest-difficulty equation that uses each die exactly once."
      />

      <section className="grid grid-cols-12 gap-y-10 lg:gap-14">
        <div className="col-span-12 lg:col-span-5 min-w-0">
          <div className="label-caps mb-4 flex items-center justify-between">
            <span>The dice</span>
            <FavoriteToggle dice={lookup.dice} size="sm" />
          </div>
          <div className="flex items-center gap-3">
            <DiceStepper store={lookup} index={0} />
            <DiceStepper store={lookup} index={1} />
            <DiceStepper store={lookup} index={2} />
          </div>

          <div className="mt-10">
            <div className="label-caps mb-4">The target</div>
            <div className="relative inline-block max-w-full">
              <input
                type="number"
                min={1}
                max={999}
                value={lookup.total}
                onChange={(e) => lookup.setTotal(Number(e.target.value))}
                className="w-32 sm:w-44 bg-paper-100 border border-ink-100/30 font-display text-[40px] sm:text-[56px] text-center text-ink-500 tabular focus:outline-none focus:border-oxblood-500 focus:ring-1 focus:ring-oxblood-500/40"
                style={{ borderRadius: "3px", fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 no-print">
              {QUICK_ACTIONS.map((qa, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    lookup.setTotal(qa.kind === "set" ? qa.value : lookup.total + qa.delta)
                  }
                  className="px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide-caps text-ink-200 border border-ink-100/30 hover:bg-paper-100 hover:border-ink-100/60 transition-colors"
                  style={{ borderRadius: "2px" }}
                >
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-7 lg:pl-10 lg:border-l lg:border-ink-100/15 min-w-0">
          <SolutionPanel lookup={lookup} />
        </div>
      </section>
    </article>
  );
});
