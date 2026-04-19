import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { ADV_DICE_RANGE, ADV_TARGET_RANGE } from "@solver/core/constants.js";
import { useStore } from "../../v1stores/storeContext";
import { PageHeader } from "../_shared/PageHeader";
import type {
  AetherArity,
  AetherTuple,
  Loadable,
} from "../../core/types";
import {
  type AetherTupleSweep,
  tupleKey,
} from "../../v1stores/AetherDataStore";
import {
  AETHER_COMPARE_MAX,
  AetherCompareStore,
  type AetherCompareChartMode,
} from "./AetherCompareStore";

/**
 * Æther variant of the Compare view.
 *
 * Mirrors the standard Compare's chart projections (per-target /
 * avg-per-bucket / count-per-bucket / cumulative) but operates on
 * variable-arity tuples solved on demand by the worker pool.
 *
 * Each tuple's data comes from `AetherDataStore.ensureSweep`; the
 * cache dedupes concurrent requests so adding the same tuple twice
 * (e.g. by toggling it on and off rapidly) costs one solve.
 *
 * The "favorites" picker present in the standard view is omitted —
 * favorites are hard-coded to 3-tuples and don't generalize cleanly
 * to arity 3/4/5 mix. The manual picker covers the common workflow.
 */

const SERIES_COLORS = ["#7a1f24", "#1e6f9d", "#d18b00", "#3a8754"] as const;
const BUCKET_SIZE = 250;
const ARITY_OPTIONS: readonly AetherArity[] = [3, 4, 5];

// ---------------------------------------------------------------------------
//  Chart data shapes
// ---------------------------------------------------------------------------

interface SeriesPoint {
  readonly target: number;
  readonly value: number;
}

interface ChartSeries {
  readonly tuple: AetherTuple;
  readonly color: string;
  readonly points: readonly SeriesPoint[];
}

interface ProjectedSeries {
  readonly tuple: AetherTuple;
  readonly color: string;
  readonly samples: readonly SeriesPoint[];
  readonly connect: "consecutive" | "all" | "none";
}

interface ProjectedChart {
  readonly series: readonly ProjectedSeries[];
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly yTicks: readonly number[];
  readonly yLabel: string;
  readonly xLabel: string;
  readonly bucketed: boolean;
}

function sweepToPoints(sweep: AetherTupleSweep): readonly SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const t of sweep.targetsSorted) {
    out.push({ target: t, value: sweep.cells.get(t)!.difficulty });
  }
  return out;
}

interface Bucket {
  readonly mid: number;
  readonly count: number;
  readonly avg: number | null;
}

function bucketize(points: readonly SeriesPoint[]): readonly Bucket[] {
  if (points.length === 0) return [];
  const minStart = Math.floor(points[0]!.target / BUCKET_SIZE) * BUCKET_SIZE;
  const maxStart = Math.floor(points[points.length - 1]!.target / BUCKET_SIZE) * BUCKET_SIZE;
  const length = (maxStart - minStart) / BUCKET_SIZE + 1;
  const buckets: { count: number; sum: number }[] = [];
  for (let i = 0; i < length; i += 1) buckets.push({ count: 0, sum: 0 });
  for (const p of points) {
    const idx = (Math.floor(p.target / BUCKET_SIZE) * BUCKET_SIZE - minStart) / BUCKET_SIZE;
    const b = buckets[idx]!;
    b.count += 1;
    b.sum += p.value;
  }
  return buckets.map((b, i) => ({
    mid: minStart + i * BUCKET_SIZE + BUCKET_SIZE / 2,
    count: b.count,
    avg: b.count === 0 ? null : b.sum / b.count,
  }));
}

function cumulative(
  points: readonly SeriesPoint[],
  domainMax: number,
): readonly SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let n = 0;
  for (const p of points) {
    n += 1;
    out.push({ target: p.target, value: n });
  }
  if (out.length > 0 && out[out.length - 1]!.target < domainMax) {
    out.push({ target: domainMax, value: n });
  }
  return out;
}

function project(
  raw: readonly ChartSeries[],
  mode: AetherCompareChartMode,
  rawDomainMin: number,
  rawDomainMax: number,
): ProjectedChart {
  if (mode === "perTarget") {
    return {
      series: raw.map((s) => ({
        tuple: s.tuple,
        color: s.color,
        samples: s.points,
        connect: "consecutive",
      })),
      xMin: rawDomainMin,
      xMax: rawDomainMax,
      yMin: 0,
      yMax: 100,
      yTicks: [0, 25, 50, 75, 100],
      yLabel: "Difficulty",
      xLabel: "Target",
      bucketed: false,
    };
  }
  if (mode === "avgPerBucket") {
    const projected: ProjectedSeries[] = raw.map((s) => {
      const buckets = bucketize(s.points);
      const samples: SeriesPoint[] = [];
      for (const b of buckets) {
        if (b.avg === null) continue;
        samples.push({ target: b.mid, value: b.avg });
      }
      return { tuple: s.tuple, color: s.color, samples, connect: "all" };
    });
    return {
      series: projected,
      xMin: rawDomainMin,
      xMax: rawDomainMax,
      yMin: 0,
      yMax: 100,
      yTicks: [0, 25, 50, 75, 100],
      yLabel: "Avg difficulty",
      xLabel: `Target (per ${BUCKET_SIZE})`,
      bucketed: true,
    };
  }
  if (mode === "countPerBucket") {
    const projected: ProjectedSeries[] = raw.map((s) => {
      const buckets = bucketize(s.points);
      return {
        tuple: s.tuple,
        color: s.color,
        samples: buckets.map((b) => ({ target: b.mid, value: b.count })),
        connect: "all",
      };
    });
    return {
      series: projected,
      xMin: rawDomainMin,
      xMax: rawDomainMax,
      yMin: 0,
      yMax: BUCKET_SIZE,
      yTicks: [0, BUCKET_SIZE / 4, BUCKET_SIZE / 2, (BUCKET_SIZE * 3) / 4, BUCKET_SIZE],
      yLabel: `Solvable / ${BUCKET_SIZE}`,
      xLabel: `Target (per ${BUCKET_SIZE})`,
      bucketed: true,
    };
  }
  // cumulative
  const projected: ProjectedSeries[] = raw.map((s) => ({
    tuple: s.tuple,
    color: s.color,
    samples: cumulative(s.points, rawDomainMax),
    connect: "all",
  }));
  const yMaxData = projected.reduce(
    (m, s) => Math.max(m, s.samples.length === 0 ? 0 : s.samples[s.samples.length - 1]!.value),
    0,
  );
  const yMax = niceCeil(Math.max(yMaxData, 10));
  return {
    series: projected,
    xMin: rawDomainMin,
    xMax: rawDomainMax,
    yMin: 0,
    yMax,
    yTicks: niceTicks(0, yMax, 5),
    yLabel: "Cumulative solvable",
    xLabel: "Target",
    bucketed: false,
  };
}

function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const norm = v / base;
  let nice: number;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

function niceTicks(min: number, max: number, count: number): number[] {
  const step = (max - min) / count;
  const out: number[] = [];
  for (let i = 0; i <= count; i += 1) out.push(Math.round(min + i * step));
  return out;
}

function pickXTicks(min: number, max: number): number[] {
  const span = max - min;
  const targetCount = 8;
  const rough = span / targetCount;
  const magnitudes = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  const step = magnitudes.find((m) => m >= rough) ?? 5000;
  const out: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max; v += step) out.push(v);
  if (out[0] !== min) out.unshift(min);
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}

// ---------------------------------------------------------------------------
//  Chart
// ---------------------------------------------------------------------------

function ConnectedRuns({
  samples,
  color,
  strokeWidth,
  x,
  y,
}: {
  samples: readonly SeriesPoint[];
  color: string;
  strokeWidth: number;
  x: (target: number) => number;
  y: (value: number) => number;
}) {
  const runs: SeriesPoint[][] = [];
  let current: SeriesPoint[] = [];
  for (const p of samples) {
    if (current.length === 0) {
      current.push(p);
      continue;
    }
    const last = current[current.length - 1]!;
    if (p.target === last.target + 1) current.push(p);
    else {
      runs.push(current);
      current = [p];
    }
  }
  if (current.length > 0) runs.push(current);
  return (
    <>
      {runs.map((run, i) => (
        <polyline
          key={i}
          points={run.map((p) => `${x(p.target)},${y(p.value)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          opacity={0.9}
        />
      ))}
    </>
  );
}

function ComparisonChart({
  raw,
  mode,
  domainMin,
  domainMax,
}: {
  raw: readonly ChartSeries[];
  mode: AetherCompareChartMode;
  domainMin: number;
  domainMax: number;
}) {
  const width = 800;
  const height = 280;
  const margin = { top: 12, right: 16, bottom: 32, left: 64 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const projected = project(raw, mode, domainMin, domainMax);
  const { yMin, yMax, yTicks, xMin, xMax } = projected;

  const x = (v: number): number => margin.left + ((v - xMin) / Math.max(1, xMax - xMin)) * innerW;
  const y = (v: number): number =>
    margin.top + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * innerH;

  const xTicks = pickXTicks(xMin, xMax);
  const dotRadius = projected.bucketed ? 2.4 : 1.0;
  const strokeWidth = projected.bucketed ? 1.6 : 1.2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${projected.yLabel} by ${projected.xLabel.toLowerCase()} for the selected Æther tuples`}
      className="block w-full"
      preserveAspectRatio="none"
    >
      <text
        x={12}
        y={margin.top + innerH / 2}
        transform={`rotate(-90 12 ${margin.top + innerH / 2})`}
        textAnchor="middle"
        style={{
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono, monospace)",
          fill: "rgb(var(--ink-100))",
        }}
      >
        {projected.yLabel}
      </text>
      {yTicks.map((t) => (
        <g key={`y-${t}`}>
          <line
            x1={margin.left}
            x2={margin.left + innerW}
            y1={y(t)}
            y2={y(t)}
            stroke="rgb(var(--ink-100) / 0.18)"
            strokeWidth={t === yMin || t === yMax ? 1 : 0.5}
            strokeDasharray={t === yMin || t === yMax ? undefined : "2 3"}
          />
          <text
            x={margin.left - 6}
            y={y(t) + 3}
            textAnchor="end"
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono, monospace)",
              fill: "rgb(var(--ink-100))",
            }}
          >
            {Number.isInteger(t) ? t : t.toFixed(1)}
          </text>
        </g>
      ))}
      <line
        x1={margin.left}
        x2={margin.left + innerW}
        y1={margin.top + innerH}
        y2={margin.top + innerH}
        stroke="rgb(var(--ink-100) / 0.4)"
        strokeWidth={1}
      />
      {xTicks.map((t) => (
        <g key={`x-${t}`}>
          <line
            x1={x(t)}
            x2={x(t)}
            y1={margin.top + innerH}
            y2={margin.top + innerH + 4}
            stroke="rgb(var(--ink-100) / 0.4)"
            strokeWidth={1}
          />
          <text
            x={x(t)}
            y={margin.top + innerH + 16}
            textAnchor="middle"
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono, monospace)",
              fill: "rgb(var(--ink-100))",
            }}
          >
            {t.toLocaleString()}
          </text>
        </g>
      ))}
      {projected.series.map((s, i) => {
        if (s.samples.length === 0) return null;
        return (
          <g key={i}>
            {s.connect === "consecutive" && (
              <ConnectedRuns
                samples={s.samples}
                color={s.color}
                strokeWidth={strokeWidth}
                x={x}
                y={y}
              />
            )}
            {s.connect === "all" && (
              <polyline
                points={s.samples.map((p) => `${x(p.target)},${y(p.value)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeWidth}
                opacity={0.9}
              />
            )}
            {projected.bucketed &&
              s.samples.map((p, j) => (
                <circle
                  key={j}
                  cx={x(p.target)}
                  cy={y(p.value)}
                  r={dotRadius}
                  fill={s.color}
                  opacity={0.9}
                />
              ))}
          </g>
        );
      })}
    </svg>
  );
}

interface ModeOption {
  readonly id: AetherCompareChartMode;
  readonly label: string;
  readonly hint: string;
}

const MODE_OPTIONS: readonly ModeOption[] = [
  { id: "perTarget", label: "Per target", hint: "Difficulty at every individual target — exact but noisy." },
  { id: "avgPerBucket", label: `Avg / ${BUCKET_SIZE}`, hint: `Average difficulty within each ${BUCKET_SIZE}-target window.` },
  { id: "countPerBucket", label: `Solvable / ${BUCKET_SIZE}`, hint: `Coverage: how many targets in each window are reachable.` },
  { id: "cumulative", label: "Cumulative solvable", hint: "Running total of solvable targets — steepest curve = broadest set." },
];

const ChartModeSelector = observer(function ChartModeSelector({
  store,
}: {
  store: AetherCompareStore;
}) {
  const active = store.chartMode;
  return (
    <div role="tablist" aria-label="Chart projection" className="flex items-center flex-wrap gap-1">
      {MODE_OPTIONS.map((opt) => {
        const isActive = opt.id === active;
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => store.setChartMode(opt.id)}
            title={opt.hint}
            className={[
              "px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide-caps",
              "border transition-colors",
              isActive
                ? "border-oxblood-500 bg-oxblood-500/10 text-oxblood-500"
                : "border-ink-100/30 text-ink-200 hover:border-ink-200/60",
            ].join(" ")}
            style={{ borderRadius: "2px" }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Picker UI
// ---------------------------------------------------------------------------

const ManualPicker = observer(function ManualPicker({
  store,
}: {
  store: AetherCompareStore;
}) {
  const [arity, setArity] = useState<AetherArity>(3);
  const [dice, setDice] = useState<number[]>([2, 3, 5, 7, 11]);
  const disabled = store.isFull;

  function clamp(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.max(ADV_DICE_RANGE.min, Math.min(ADV_DICE_RANGE.max, Math.round(n)));
  }

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const tuple = dice.slice(0, arity);
    store.add(tuple);
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 flex-wrap"
      aria-label="Add an Æther tuple manually"
    >
      <span className="label-caps">Add tuple</span>
      <div className="flex items-center gap-1">
        {ARITY_OPTIONS.map((a) => {
          const active = a === arity;
          return (
            <button
              key={a}
              type="button"
              onClick={() => setArity(a)}
              className={[
                "px-2 py-1 text-[11px] font-mono uppercase",
                "border transition-colors",
                active
                  ? "border-oxblood-500 text-oxblood-500"
                  : "border-ink-100/30 text-ink-200 hover:border-ink-200/60",
              ].join(" ")}
              style={{ borderRadius: "2px" }}
            >
              {a}d
            </button>
          );
        })}
      </div>
      {dice.slice(0, arity).map((v, i) => (
        <input
          key={i}
          type="number"
          min={ADV_DICE_RANGE.min}
          max={ADV_DICE_RANGE.max}
          step={1}
          value={v}
          onChange={(e) => {
            const n = clamp(Number(e.target.value));
            const next = [...dice];
            next[i] = n;
            setDice(next);
          }}
          aria-label={`Die ${i + 1}`}
          className="w-14 px-1.5 py-1 text-center text-[13px] font-mono bg-paper-50 border border-ink-100/30 text-ink-300 focus:outline-none focus:border-oxblood-500"
          style={{ borderRadius: "2px" }}
        />
      ))}
      <button
        type="submit"
        disabled={disabled}
        className={[
          "px-3 py-1 text-[11px] font-mono uppercase tracking-wide-caps",
          "border border-oxblood-500/60 text-oxblood-500",
          "disabled:opacity-30 disabled:cursor-not-allowed",
        ].join(" ")}
        style={{ borderRadius: "2px" }}
        title={disabled ? `Already comparing ${AETHER_COMPARE_MAX} tuples` : "Add to comparison"}
      >
        + Add
      </button>
    </form>
  );
});

// ---------------------------------------------------------------------------
//  Selected legend / summary table
// ---------------------------------------------------------------------------

function tupleLabel(tuple: AetherTuple): string {
  return `[${tuple.join(", ")}]`;
}

const SelectedPanel = observer(function SelectedPanel({
  compareStore,
  sweepStates,
}: {
  compareStore: AetherCompareStore;
  sweepStates: ReadonlyMap<string, Loadable<AetherTupleSweep>>;
}) {
  const { aetherData } = useStore();
  const selected = compareStore.selected;
  if (selected.length === 0) return null;

  return (
    <div className="overflow-x-auto border border-ink-100/15">
      <table className="w-full">
        <thead>
          <tr className="bg-paper-100/40">
            <th className="py-2 px-3 text-left label-caps border-b border-ink-300/30">In comparison</th>
            <th className="py-2 px-3 text-right label-caps border-b border-ink-300/30">Arity</th>
            <th className="py-2 px-3 text-right label-caps border-b border-ink-300/30">Solvable</th>
            <th className="py-2 px-3 text-right label-caps border-b border-ink-300/30">Easiest</th>
            <th className="py-2 px-3 text-right label-caps border-b border-ink-300/30">Hardest</th>
            <th className="py-2 px-3 text-right label-caps border-b border-ink-300/30">Average</th>
            <th className="py-2 px-3 text-right label-caps border-b border-ink-300/30">Median</th>
            <th className="py-2 px-3 text-right border-b border-ink-300/30" aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {selected.map((tuple, i) => {
            const state = sweepStates.get(tupleKey(tuple));
            const summary = state?.status === "ready" ? aetherData.summaryFor(tuple) : null;
            const color = SERIES_COLORS[i] ?? "#444";
            const status = state?.status ?? "idle";
            return (
              <tr key={i}>
                <td className="py-2 px-3 border-b border-ink-100/10">
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      style={{ display: "inline-block", width: 10, height: 10, background: color, borderRadius: 2 }}
                    />
                    <span className="font-mono text-[13px] text-ink-300">{tupleLabel(tuple)}</span>
                    {status !== "ready" && (
                      <span className="font-mono text-[10px] uppercase text-ink-100">
                        {status === "loading" || status === "idle" ? "solving…" : "error"}
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-2 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
                  {tuple.length}
                </td>
                <td className="py-2 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
                  {summary?.solvableCount.toLocaleString() ?? "—"}
                </td>
                <td className="py-2 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
                  {summary?.minDifficulty?.toFixed(2) ?? "—"}
                </td>
                <td className="py-2 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
                  {summary?.maxDifficulty?.toFixed(2) ?? "—"}
                </td>
                <td className="py-2 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
                  {summary?.averageDifficulty?.toFixed(2) ?? "—"}
                </td>
                <td className="py-2 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
                  {summary?.medianDifficulty?.toFixed(2) ?? "—"}
                </td>
                <td className="py-2 px-3 border-b border-ink-100/10 text-right">
                  <button
                    type="button"
                    onClick={() => compareStore.remove(tuple)}
                    aria-label={`Remove ${tupleLabel(tuple)} from comparison`}
                    className="font-mono text-[12px] text-ink-100 hover:text-oxblood-500"
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Top-level view
// ---------------------------------------------------------------------------

export const AetherCompareView = observer(function AetherCompareView() {
  const { aetherData } = useStore();
  const compareStore = useMemo(() => new AetherCompareStore(), []);
  const selected = compareStore.selected;

  // Kick off sweeps for every selected tuple. `ensureSweep` dedupes
  // in-flight requests, so this is safe to fire on every render.
  useEffect(() => {
    for (const tuple of selected) void aetherData.ensureSweep(tuple);
  }, [aetherData, selected.map((t) => tupleKey(t)).join("|")]);

  // Snapshot per-tuple load state. Reading `sweepState` inside the
  // observer wires up MobX deps so the chart re-renders as sweeps land.
  const sweepStates = useMemo(() => {
    const map = new Map<string, Loadable<AetherTupleSweep>>();
    for (const tuple of selected) {
      map.set(tupleKey(tuple), aetherData.sweepState(tuple));
    }
    return map;
  }, [
    aetherData,
    selected,
    aetherData.cacheTick,
  ]);

  const series: ChartSeries[] = [];
  selected.forEach((tuple, i) => {
    const state = sweepStates.get(tupleKey(tuple));
    if (state?.status !== "ready") return;
    series.push({
      tuple,
      color: SERIES_COLORS[i] ?? "#444",
      points: sweepToPoints(state.value),
    });
  });

  const domainMin = ADV_TARGET_RANGE.min;
  const domainMax = ADV_TARGET_RANGE.max;

  return (
    <article>
      <PageHeader
        folio="III"
        eyebrow="The Æther Bench"
        title={
          <>
            Four tuples,{" "}
            <span
              className="italic text-oxblood-500"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}
            >
              overlaid
            </span>
            .
          </>
        }
        dek="Pick up to four Æther tuples (any arity 3–5, dice −10..32) and read their difficulty curves on a shared 1..5,000 axis. Each tuple is solved live by the worker pool — first plot may take a moment, additional projections are instant."
        right={
          compareStore.size > 0 ? (
            <button
              type="button"
              onClick={() => compareStore.clear()}
              className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide-caps text-ink-100 hover:text-oxblood-500"
            >
              Clear comparison
            </button>
          ) : undefined
        }
      />

      <section className="mb-6 flex flex-col gap-3">
        <ManualPicker store={compareStore} />
        <div className="font-mono text-[11px] text-ink-100">
          {compareStore.size}/{AETHER_COMPARE_MAX} selected
          {compareStore.isFull && (
            <span className="ml-2 text-oxblood-500">
              · cap reached, remove one to add another
            </span>
          )}
        </div>
      </section>

      {selected.length === 0 ? (
        <div
          className="border border-dashed border-ink-100/30 px-6 py-12 text-center"
          style={{ borderRadius: "2px" }}
        >
          <p
            className="font-display text-[24px] italic text-ink-200 max-w-md mx-auto leading-snug"
            style={{ fontVariationSettings: '"opsz" 100, "SOFT" 80, "WONK" 1' }}
          >
            Pick a tuple above to begin the comparison.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div
            className="border border-ink-100/15 p-3 bg-paper-50"
            style={{ borderRadius: "2px" }}
          >
            <div className="mb-3 flex items-start justify-between gap-3 flex-wrap px-1">
              <div className="label-caps">
                {compareStore.chartMode === "perTarget" && "Difficulty per target"}
                {compareStore.chartMode === "avgPerBucket" && `Average difficulty per ${BUCKET_SIZE}`}
                {compareStore.chartMode === "countPerBucket" && `Solvable targets per ${BUCKET_SIZE}`}
                {compareStore.chartMode === "cumulative" && "Cumulative solvable targets"}
              </div>
              <ChartModeSelector store={compareStore} />
            </div>
            {series.length === 0 ? (
              <div className="font-mono text-[12px] text-ink-100 py-12 text-center">
                Solving Æther sweeps…
              </div>
            ) : (
              <ComparisonChart
                raw={series}
                mode={compareStore.chartMode}
                domainMin={domainMin}
                domainMax={domainMax}
              />
            )}
          </div>
          <SelectedPanel compareStore={compareStore} sweepStates={sweepStates} />
        </div>
      )}
    </article>
  );
});
