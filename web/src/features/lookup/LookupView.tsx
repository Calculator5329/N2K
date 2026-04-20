/**
 * § I Lookup — find the easiest equation for a (dice, target) pair.
 *
 * Standard mode (the default) drives off the bundled `standard.n2k`
 * dataset via `LookupStore` — picker bounds match `STANDARD_MODE`
 * (dice 2..20, target 1..999) so the user can never type a triple
 * the dataset can't resolve. Æther unlock (Konami) flips the whole
 * surface to `AetherLookupView`, which widens to arity 3/4/5 and
 * dispatches each tuple to the `aetherSolverWorker` pool — see
 * `AetherLookupView` for the wider-bounds variant.
 *
 * The `AllEquationsList` below the picker is the cross-tuple browser
 * for "what *other* dice tuples reach this target?" — only feasible in
 * standard mode (precomputed); intentionally omitted in Æther.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react-lite";
import { STANDARD_MODE } from "@solver/core/constants.js";
import { useStore } from "../../stores/AppStoreContext.js";

const DICE_MIN = STANDARD_MODE.diceRange.min;
const DICE_MAX = STANDARD_MODE.diceRange.max;
const TARGET_MIN = STANDARD_MODE.targetRange.min;
const TARGET_MAX = STANDARD_MODE.targetRange.max;
import { Equation } from "../../ui/primitives/Equation";
import { DifficultyBreakdown } from "../../ui/primitives/DifficultyBreakdown";
import { DifficultyMeter } from "../../ui/primitives/DifficultyMeter";
import { DiceGlyph } from "../../ui/primitives/DiceGlyph";
import { FavoriteToggle } from "../../ui/primitives/FavoriteToggle";
import { PageHeader } from "../../ui/primitives/PageHeader";
import { AllEquationsList } from "./AllEquationsList";
import { AetherLookupView } from "./AetherLookupView";
import { LookupStore } from "./LookupStore";
import { prewarmSolverWorker } from "../../services/solverWorkerService";

type QuickAction =
  | { kind: "set"; label: string; value: number }
  | { kind: "delta"; label: string; delta: number };

const QUICK_ACTIONS: readonly QuickAction[] = [
  { kind: "set",   label: `\u2192 ${TARGET_MIN}`, value: TARGET_MIN },
  { kind: "delta", label: "\u201210",             delta: -10 },
  { kind: "delta", label: "\u22121",              delta: -1 },
  { kind: "delta", label: "+1",                   delta: +1 },
  { kind: "delta", label: "+10",                  delta: +10 },
  { kind: "set",   label: `\u2192 ${TARGET_MAX}`, value: TARGET_MAX },
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
        min={DICE_MIN}
        max={DICE_MAX}
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
          {TARGET_MIN}–{TARGET_MAX}, this triple solves {detail.summary.solvableCount.toLocaleString()} —
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
    if (t >= TARGET_MIN && t <= TARGET_MAX) targets.push(t);
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
      case "Home":       next = TARGET_MIN; break;
      case "End":        next = TARGET_MAX; break;
      default: return;
    }
    e.preventDefault();
    refocusOnNextRender.current = true;
    lookup.setTotal(Math.max(TARGET_MIN, Math.min(TARGET_MAX, next)));
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
        // The 11-bar strip narrows its gap and bar width on phones so
        // every adjacent target stays visible without horizontal
        // scroll, then expands back to fixed-width bars at `sm` and
        // up. The negative margin + matching padding keeps the focus
        // outline of the active bar from being clipped at the column
        // edge if the strip ever does need to scroll (e.g. on a 250px
        // viewport with non-default padding).
        className="flex items-end gap-[2px] sm:gap-1.5 outline-none overflow-x-auto -mx-1 px-1"
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
              className="group flex flex-col items-center gap-1 flex-1 min-w-[18px] sm:flex-none sm:w-10 sm:min-w-0 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-oxblood-500/60"
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

  // Prewarm the "All equations" solver worker on idle so opening the
  // panel later feels instant. The worker bundle parse + thread spawn
  // is ~30–80 ms on a cold tab; doing it here shifts that cost off
  // the user's click. Lookup is the only feature that uses this
  // worker, so mount-time prewarm is a perfect fit. `requestIdleCallback`
  // keeps the prewarm out of the way of the initial paint; we fall
  // back to `setTimeout` for browsers (Safari) that lack it.
  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof win.requestIdleCallback === "function") {
      const handle = win.requestIdleCallback(() => prewarmSolverWorker(), { timeout: 2000 });
      return () => win.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(prewarmSolverWorker, 500);
    return () => window.clearTimeout(handle);
  }, []);

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
      case "Home":       next = TARGET_MIN; break;
      case "End":        next = TARGET_MAX; break;
      default: return;
      }
      e.preventDefault();
      lookup.setTotal(Math.max(TARGET_MIN, Math.min(TARGET_MAX, next)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lookup]);

  return (
    <article>
      <PageHeader
        folio="I"
        eyebrow="Lookup"
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
        dek={`Pick a dice triple and a target between ${TARGET_MIN} and ${TARGET_MAX}. The almanac returns the lowest-difficulty equation that uses each die exactly once.`}
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
                min={TARGET_MIN}
                max={TARGET_MAX}
                value={lookup.total}
                onChange={(e) => lookup.setTotal(Number(e.target.value))}
                aria-label="Target value"
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
