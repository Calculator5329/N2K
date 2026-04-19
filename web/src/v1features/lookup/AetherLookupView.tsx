import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react-lite";
import { ADV_DICE_RANGE, ADV_TARGET_RANGE } from "@solver/core/constants.js";
import { useStore } from "../../v1stores/storeContext";
import { Equation } from "../../v1ui/Equation";
import { DifficultyBreakdown } from "../../v1ui/DifficultyBreakdown";
import { DifficultyMeter } from "../../v1ui/DifficultyMeter";
import { PageHeader } from "../_shared/PageHeader";
import type { AetherArity } from "../../core/types";
import type { AetherTuplePartialSweep } from "../../v1stores/AetherDataStore";
import { AetherLookupStore } from "./AetherLookupStore";

/**
 * Æther variant of the Lookup view.
 *
 * Mirrors the standard `LookupView` in shape — pick dice, pick a target,
 * read the easiest equation — but widened along three axes:
 *
 *   - Arity: 3, 4, or 5 dice (selectable via segmented control).
 *   - Dice values: −10 .. 32 (literal negatives — see tech_spec).
 *   - Target: 1 .. 5,000.
 *
 * Solutions come from the on-demand `AetherDataStore` worker pool — one
 * sweep per tuple covers every target, so changing the target is
 * instantaneous after the initial solve. The "All equations" list is
 * intentionally omitted in Æther mode because it would require
 * enumerating every other tuple that hits the target (millions of them
 * at the wider ranges). Use the standalone Compare or Visualize tabs
 * for cross-tuple browsing.
 */

const ARITY_OPTIONS: readonly AetherArity[] = [3, 4, 5];

type QuickAction =
  | { kind: "set"; label: string; value: number }
  | { kind: "delta"; label: string; delta: number };

const QUICK_ACTIONS: readonly QuickAction[] = [
  { kind: "set",   label: `\u2192 ${ADV_TARGET_RANGE.min}`, value: ADV_TARGET_RANGE.min },
  { kind: "delta", label: "\u2212100",                       delta: -100 },
  { kind: "delta", label: "\u201210",                        delta: -10 },
  { kind: "delta", label: "\u22121",                         delta: -1 },
  { kind: "delta", label: "+1",                              delta: +1 },
  { kind: "delta", label: "+10",                             delta: +10 },
  { kind: "delta", label: "+100",                            delta: +100 },
  { kind: "set",   label: `\u2192 ${ADV_TARGET_RANGE.max.toLocaleString()}`, value: ADV_TARGET_RANGE.max },
];

// ---------------------------------------------------------------------------
//  Dice + arity picker
// ---------------------------------------------------------------------------

const ArityPicker = observer(function ArityPicker({
  store,
}: {
  store: AetherLookupStore;
}) {
  return (
    <div role="tablist" aria-label="Arity" className="flex items-baseline gap-1">
      {ARITY_OPTIONS.map((a) => {
        const active = a === store.arity;
        return (
          <button
            key={a}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => store.setArity(a)}
            className={[
              "px-3 py-1 text-[12px] font-mono uppercase tracking-wide-caps",
              "border transition-colors",
              active
                ? "border-oxblood-500 bg-oxblood-500/10 text-oxblood-500"
                : "border-ink-100/30 text-ink-200 hover:border-ink-200/60",
            ].join(" ")}
            style={{ borderRadius: "2px" }}
          >
            {a} dice
          </button>
        );
      })}
    </div>
  );
});

const DieStepper = observer(function DieStepper({
  store,
  index,
}: {
  store: AetherLookupStore;
  index: number;
}) {
  const value = store.dice[index]!;
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => store.setDie(index, value + 1)}
        aria-label={`Die ${index + 1} increment`}
        className="text-ink-100 hover:text-oxblood-500 text-xs leading-none p-1"
      >
        ▲
      </button>
      <input
        type="number"
        min={ADV_DICE_RANGE.min}
        max={ADV_DICE_RANGE.max}
        value={value}
        onChange={(e) => store.setDie(index, Number(e.target.value))}
        className="w-16 h-16 text-center bg-paper-100 border border-ink-100/30 font-mono text-[24px] tabular text-ink-500 focus:outline-none focus:border-oxblood-500 focus:ring-1 focus:ring-oxblood-500/40"
        style={{ borderRadius: "3px" }}
      />
      <button
        type="button"
        onClick={() => store.setDie(index, value - 1)}
        aria-label={`Die ${index + 1} decrement`}
        className="text-ink-100 hover:text-oxblood-500 text-xs leading-none p-1"
      >
        ▼
      </button>
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Solution panel — reads from the AetherDataStore sweep cache
// ---------------------------------------------------------------------------

const SolutionPanel = observer(function SolutionPanel({
  store,
}: {
  store: AetherLookupStore;
}) {
  const { aetherData } = useStore();
  const tuple = store.tuple;
  const sweepState = aetherData.sweepState(tuple);

  if (sweepState.status === "error") {
    return (
      <div className="font-mono text-oxblood-500 text-sm">
        Æther solver failed for [{tuple.join(", ")}]: {sweepState.error}
      </div>
    );
  }

  // Pre-final renderings: prefer a streaming partial if the worker has
  // posted one. The partial holds the running best-known equation per
  // target — almost always non-empty after the first permutation, even
  // at arity 5, so the user sees a real answer in ~400 ms instead of
  // staring at a skeleton for two minutes.
  if (sweepState.status === "idle" || sweepState.status === "loading") {
    const partial = aetherData.partialFor(tuple);
    if (partial === null) return <Skeleton />;
    return <RunningSolution store={store} partial={partial} />;
  }

  const sweep = sweepState.value;
  const cell = sweep.cells.get(store.total);

  if (cell === undefined) {
    const summary = aetherData.summaryFor(tuple);
    const totalSpan = ADV_TARGET_RANGE.max - ADV_TARGET_RANGE.min + 1;
    return (
      <div>
        <div className="label-caps mb-2">No solution</div>
        <p
          className="font-display text-[40px] text-ink-500 leading-tight max-w-md"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
        >
          The tuple <DiceInline tuple={tuple} /> cannot reach
          <span className="text-oxblood-500"> {store.total.toLocaleString()}</span>.
        </p>
        {summary !== null && (
          <p className="mt-4 italic text-ink-200">
            Of {totalSpan.toLocaleString()} targets in
            {" "}{ADV_TARGET_RANGE.min}–{ADV_TARGET_RANGE.max.toLocaleString()},
            this tuple solves {summary.solvableCount.toLocaleString()} —{" "}
            {Math.round((100 * summary.solvableCount) / totalSpan)}%.
          </p>
        )}
        <p className="mt-3 text-[11px] font-mono text-ink-100">
          Computed in {sweep.elapsedMs.toFixed(0)} ms · arity {sweep.arity}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-6 mb-3">
        <div className="label-caps">The easiest equation</div>
        <DifficultyMeter difficulty={cell.difficulty} />
      </div>
      <Equation equation={cell.equation} size="display" />
      <DifficultyBreakdown equation={cell.equation} />
      <div className="mt-10 no-print">
        <NeighborhoodStrip store={store} />
      </div>
      <p className="mt-6 text-[11px] font-mono text-ink-100">
        Sweep computed in {sweep.elapsedMs.toFixed(0)} ms · arity {sweep.arity} ·{" "}
        {sweep.targetsSorted.length.toLocaleString()} solvable targets
      </p>
    </div>
  );
});

/**
 * Streaming partial-result panel. Mirrors the final `SolutionPanel`
 * layout (equation + difficulty meter + adjacent-targets strip) but
 * reads from the still-mutating partial sweep, with a "running" badge
 * and progress meter so the user understands the answer may sharpen as
 * remaining permutations finish.
 */
const RunningSolution = observer(function RunningSolution({
  store,
  partial,
}: {
  store: AetherLookupStore;
  partial: AetherTuplePartialSweep;
}) {
  const cell = partial.cells.get(store.total);
  const pct =
    partial.permsTotal === 0
      ? 0
      : Math.min(100, Math.round((100 * partial.permsDone) / partial.permsTotal));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-6 mb-3">
        <div className="label-caps flex items-center gap-2">
          <span>Easiest so far</span>
          <RunningBadge />
        </div>
        {cell !== undefined && <DifficultyMeter difficulty={cell.difficulty} />}
      </div>

      {cell === undefined ? (
        <p
          className="font-display text-[28px] text-ink-200 leading-tight max-w-md italic"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
        >
          No equation reaches{" "}
          <span className="text-oxblood-500">{store.total.toLocaleString()}</span>{" "}
          yet — checking remaining permutations.
        </p>
      ) : (
        <>
          <Equation equation={cell.equation} size="display" />
          <DifficultyBreakdown equation={cell.equation} />
        </>
      )}

      <div className="mt-10 no-print">
        <PartialNeighborhoodStrip store={store} partial={partial} />
      </div>

      <div className="mt-6 space-y-1.5">
        <ProgressBar pct={pct} />
        <p className="text-[11px] font-mono text-ink-100">
          Permutation {partial.permsDone} of {partial.permsTotal} ·{" "}
          {(partial.elapsedMs / 1000).toFixed(1)}s elapsed ·{" "}
          {partial.targetsSorted.length.toLocaleString()} targets solvable so far
        </p>
      </div>
    </div>
  );
});

function RunningBadge() {
  return (
    <span
      aria-label="Solver still running"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide-caps text-oxblood-500 border border-oxblood-500/40 bg-oxblood-500/5"
      style={{ borderRadius: "2px" }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-oxblood-500 animate-pulse" />
      Running
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      className="h-1 w-full max-w-[360px] bg-ink-100/15 overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      style={{ borderRadius: "1px" }}
    >
      <div
        className="h-full bg-oxblood-500/70 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const NeighborhoodStrip = observer(function NeighborhoodStrip({
  store,
}: {
  store: AetherLookupStore;
}) {
  const { aetherData } = useStore();
  const sweepState = aetherData.sweepState(store.tuple);
  if (sweepState.status !== "ready") return null;
  return (
    <NeighborhoodStripCore store={store} cells={sweepState.value.cells} />
  );
});

const PartialNeighborhoodStrip = observer(function PartialNeighborhoodStrip({
  store,
  partial,
}: {
  store: AetherLookupStore;
  partial: AetherTuplePartialSweep;
}) {
  return <NeighborhoodStripCore store={store} cells={partial.cells} />;
});

/**
 * Shared rendering for the adjacent-targets strip. Takes a cell map so
 * it can be driven by either the final sweep or a streaming partial.
 * Cells absent from the map render as "no solution yet" — visually
 * identical between modes; the surrounding `RunningSolution` /
 * `SolutionPanel` provide the "still searching" affordance.
 */
const NeighborhoodStripCore = observer(function NeighborhoodStripCore({
  store,
  cells,
}: {
  store: AetherLookupStore;
  cells: ReadonlyMap<number, { equation: string; difficulty: number }>;
}) {
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);
  const refocusOnNextRender = useRef(false);

  useLayoutEffect(() => {
    if (refocusOnNextRender.current && activeButtonRef.current !== null) {
      activeButtonRef.current.focus();
    }
    refocusOnNextRender.current = false;
  });

  const center = store.total;
  const radius = 5;
  const targets: number[] = [];
  for (let t = center - radius; t <= center + radius; t += 1) {
    if (t >= ADV_TARGET_RANGE.min && t <= ADV_TARGET_RANGE.max) targets.push(t);
  }

  const localMax = targets.reduce((m, t) => {
    const d = cells.get(t)?.difficulty;
    return d === undefined ? m : Math.max(m, d);
  }, 1);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    let next: number | null = null;
    switch (e.key) {
      case "ArrowLeft":  next = center - 1; break;
      case "ArrowRight": next = center + 1; break;
      case "PageDown":   next = center - 10; break;
      case "PageUp":     next = center + 10; break;
      case "Home":       next = ADV_TARGET_RANGE.min; break;
      case "End":        next = ADV_TARGET_RANGE.max; break;
      default: return;
    }
    e.preventDefault();
    refocusOnNextRender.current = true;
    store.setTotal(next);
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
        role="group"
        aria-label="Adjacent targets — keyboard navigable"
        onKeyDown={handleKeyDown}
        className="flex items-end gap-1.5 outline-none overflow-x-auto -mx-1 px-1"
      >
        {targets.map((t) => {
          const sol = cells.get(t);
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
              onClick={() => store.setTotal(t)}
              className="group flex flex-col items-center gap-1 w-10 sm:w-12 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-oxblood-500/60"
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
                  style={{
                    height: diff === null ? "4px" : `${heightPct}%`,
                    borderRadius: "1px",
                  }}
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

function DiceInline({ tuple }: { tuple: readonly number[] }) {
  return (
    <span
      className="inline-flex align-baseline mx-1.5 px-2 py-0.5 font-mono text-[18px] tabular bg-paper-100 border border-ink-100/20"
      style={{ borderRadius: 2 }}
    >
      [{tuple.join(", ")}]
    </span>
  );
}

function Skeleton() {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-live="polite"
      aria-label="Computing Æther sweep"
    >
      <div className="h-3 w-32 bg-ink-100/15" />
      <div className="h-16 w-full max-w-[460px] bg-ink-100/10" />
      <div className="h-2 w-full max-w-[300px] bg-ink-100/10" />
      <div className="text-[11px] font-mono text-ink-100">
        Warming up the Æther solver — first answer should appear within a
        second or two; arity-5 sweeps continue refining for 1–3 minutes.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Top-level view
// ---------------------------------------------------------------------------

export const AetherLookupView = observer(function AetherLookupView() {
  const { aetherData } = useStore();
  const lookup = useMemo(() => new AetherLookupStore(), []);
  const tuple = lookup.tuple;

  useEffect(() => lookup.startSync(), [lookup]);

  // Trigger a sweep whenever the tuple changes. `ensureSweep` is
  // idempotent + dedupes in-flight requests, so safe to fire on every
  // render of every observer down the tree.
  useEffect(() => {
    void aetherData.ensureSweep(tuple);
    // tuple is observable; React only sees its identity, so key on the
    // canonical string form to avoid spurious effects.
  }, [aetherData, tuple.join(",")]);

  // Page-level keyboard shortcuts (mirror the strip's bindings).
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
        case "Home":       next = ADV_TARGET_RANGE.min; break;
        case "End":        next = ADV_TARGET_RANGE.max; break;
        default: return;
      }
      e.preventDefault();
      lookup.setTotal(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lookup]);

  return (
    <article>
      <PageHeader
        folio="Æ"
        eyebrow="The Æther Atlas"
        title={
          <>
            Three, four, or five dice.{" "}
            <span
              className="italic text-oxblood-500"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}
            >
              Five thousand
            </span>{" "}
            targets.
          </>
        }
        dek="Pick an arity, choose your dice (−10 to 32 — negatives are literal), and the Æther solver hunts the easiest equation across every permutation. One sweep per tuple covers every target instantly."
      />

      <section className="grid grid-cols-12 gap-x-12 gap-y-10">
        <div className="col-span-12 lg:col-span-5 space-y-6">
          <div>
            <div className="label-caps mb-2">Arity</div>
            <ArityPicker store={lookup} />
          </div>

          <div>
            <div className="label-caps mb-3">Dice</div>
            <div className="flex items-center gap-3 flex-wrap">
              {Array.from({ length: lookup.arity }, (_, i) => (
                <DieStepper key={i} store={lookup} index={i} />
              ))}
            </div>
          </div>

          <div>
            <div className="label-caps mb-3">Target</div>
            <input
              type="number"
              min={ADV_TARGET_RANGE.min}
              max={ADV_TARGET_RANGE.max}
              value={lookup.total}
              onChange={(e) => lookup.setTotal(Number(e.target.value))}
              className="w-40 h-14 text-center bg-paper-100 border border-ink-100/30 font-mono text-[28px] tabular text-ink-500 focus:outline-none focus:border-oxblood-500 focus:ring-1 focus:ring-oxblood-500/40"
              style={{ borderRadius: "3px" }}
            />
            <div className="mt-2 flex items-center gap-1 flex-wrap">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => {
                    if (a.kind === "set") lookup.setTotal(a.value);
                    else lookup.setTotal(lookup.total + a.delta);
                  }}
                  className="px-2 py-1 text-[11px] font-mono uppercase tracking-wide-caps text-ink-100 hover:text-oxblood-500 border border-ink-100/15 hover:border-oxblood-500/40"
                  style={{ borderRadius: "2px" }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-7 lg:pl-8 lg:border-l lg:border-ink-100/15 min-w-0">
          <SolutionPanel store={lookup} />
        </div>
      </section>
    </article>
  );
});
