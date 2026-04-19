import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext";
import { COMPARE_MAX } from "../../v1stores/CompareStore";
import type { CompareChartMode } from "../../v1stores/CompareStore";
import { DiceGlyph } from "../../v1ui/DiceGlyph";
import { PageHeader } from "../_shared/PageHeader";
import type {
  DiceDetail,
  DiceTriple,
  Loadable,
} from "../../core/types";
import { AetherCompareView } from "./AetherCompareView";

/**
 * Up-to-four-triple overlay chart, built on top of `CompareStore`. The
 * heart of the view is a single SVG rendering one difficulty-vs-target
 * line per active triple, plus a summary table underneath.
 *
 * Triples can be added three ways:
 *   1. Quick-pick from the user's starred favorites,
 *   2. Manual entry (three small dice inputs + "Add"),
 *   3. (External) — Lookup and Explore both expose a `+ Compare` button
 *      that delegates to `CompareStore.toggle`.
 *
 * Selection is capped at `COMPARE_MAX` (4) to keep the chart readable;
 * the picker UI grays out further entries once the limit is hit.
 */

// Stable color palette indexed by the position of the triple in the
// compare set. Chosen so all four read clearly on light AND dark
// editions — pure CSS variable colors don't survive an SVG <path stroke>
// reliably across themes, so we use literal hex values.
const SERIES_COLORS = ["#7a1f24", "#1e6f9d", "#d18b00", "#3a8754"] as const;

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function diceKey(dice: DiceTriple): string {
  return `${dice[0]}-${dice[1]}-${dice[2]}`;
}

function clampDie(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const n = Math.round(value);
  if (n < 1 || n > 20) return null;
  return n;
}

interface SeriesPoint {
  readonly target: number;
  readonly difficulty: number;
}

function detailToSeries(detail: DiceDetail): readonly SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const [total, sol] of Object.entries(detail.solutions)) {
    out.push({ target: Number(total), difficulty: sol.difficulty });
  }
  out.sort((a, b) => a.target - b.target);
  return out;
}

// ---------------------------------------------------------------------------
//  Chart
// ---------------------------------------------------------------------------

/** One raw triple's per-target series, ready for chart projection. */
interface ChartSeries {
  readonly dice: DiceTriple;
  readonly color: string;
  readonly points: readonly SeriesPoint[];
}

/** Bucket of width 100 spanning [start, start+99]. */
interface Bucket {
  readonly start: number;
  readonly mid: number;
  readonly count: number;
  readonly avg: number | null;
}

const BUCKET_SIZE = 100;

function bucketize(points: readonly SeriesPoint[]): readonly Bucket[] {
  if (points.length === 0) return [];
  const minStart =
    Math.floor(points[0]!.target / BUCKET_SIZE) * BUCKET_SIZE;
  const maxStart =
    Math.floor(points[points.length - 1]!.target / BUCKET_SIZE) *
    BUCKET_SIZE;

  const buckets: { count: number; sum: number }[] = [];
  const length = (maxStart - minStart) / BUCKET_SIZE + 1;
  for (let i = 0; i < length; i++) buckets.push({ count: 0, sum: 0 });

  for (const p of points) {
    const idx = (Math.floor(p.target / BUCKET_SIZE) * BUCKET_SIZE - minStart) /
      BUCKET_SIZE;
    const b = buckets[idx]!;
    b.count += 1;
    b.sum += p.difficulty;
  }

  return buckets.map((b, i) => {
    const start = minStart + i * BUCKET_SIZE;
    return {
      start,
      mid: start + BUCKET_SIZE / 2,
      count: b.count,
      avg: b.count === 0 ? null : b.sum / b.count,
    };
  });
}

function cumulativeCounts(
  points: readonly SeriesPoint[],
  domainMax: number,
): readonly SeriesPoint[] {
  // Step function: emit a sample at each solvable target so the curve
  // has visible inflection points; bookend at domainMax so series with
  // sparse late hits still extend to the right edge of the chart.
  const out: SeriesPoint[] = [];
  let n = 0;
  for (const p of points) {
    n += 1;
    out.push({ target: p.target, difficulty: n });
  }
  if (out.length > 0 && out[out.length - 1]!.target < domainMax) {
    out.push({ target: domainMax, difficulty: n });
  }
  return out;
}

interface ProjectedSeries {
  readonly dice: DiceTriple;
  readonly color: string;
  /** target/x → value/y points already in chart space units. */
  readonly samples: readonly SeriesPoint[];
  /** Whether to draw connecting lines (lines for continuous, dots-only otherwise). */
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

function project(
  raw: readonly ChartSeries[],
  mode: CompareChartMode,
  rawDomainMin: number,
  rawDomainMax: number,
): ProjectedChart {
  if (mode === "perTarget") {
    return {
      series: raw.map((s) => ({
        dice: s.dice,
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
        samples.push({ target: b.mid, difficulty: b.avg });
      }
      return { dice: s.dice, color: s.color, samples, connect: "all" };
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
        dice: s.dice,
        color: s.color,
        samples: buckets.map((b) => ({ target: b.mid, difficulty: b.count })),
        connect: "all",
      };
    });
    return {
      series: projected,
      xMin: rawDomainMin,
      xMax: rawDomainMax,
      yMin: 0,
      yMax: BUCKET_SIZE,
      yTicks: [0, 25, 50, 75, 100],
      yLabel: `Solvable / ${BUCKET_SIZE}`,
      xLabel: `Target (per ${BUCKET_SIZE})`,
      bucketed: true,
    };
  }

  // cumulative
  const projected: ProjectedSeries[] = raw.map((s) => ({
    dice: s.dice,
    color: s.color,
    samples: cumulativeCounts(s.points, rawDomainMax),
    connect: "all",
  }));
  const yMaxData = projected.reduce(
    (m, s) =>
      Math.max(
        m,
        s.samples.length === 0 ? 0 : s.samples[s.samples.length - 1]!.difficulty,
      ),
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

function ComparisonChart({
  raw,
  mode,
  domainMin,
  domainMax,
}: {
  raw: readonly ChartSeries[];
  mode: CompareChartMode;
  domainMin: number;
  domainMax: number;
}) {
  const width = 800;
  const height = 280;
  const margin = { top: 12, right: 16, bottom: 32, left: 56 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const projected = project(raw, mode, domainMin, domainMax);
  const { yMin, yMax, yTicks, xMin, xMax } = projected;

  const x = (v: number): number =>
    margin.left + ((v - xMin) / Math.max(1, xMax - xMin)) * innerW;
  const y = (v: number): number =>
    margin.top + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * innerH;

  const xTicks = pickXTicks(xMin, xMax);

  // Bucketed views render small dots; per-target view stays tight.
  const dotRadius = projected.bucketed ? 2.4 : 1.5;
  const strokeWidth = projected.bucketed ? 1.6 : 1.4;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${projected.yLabel} by ${projected.xLabel.toLowerCase()}, overlaid for the selected dice triples`}
      className="block w-full"
      preserveAspectRatio="none"
    >
      {/* Y axis label */}
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

      {/* Y gridlines + labels */}
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
            {formatTick(t)}
          </text>
        </g>
      ))}

      {/* X axis line + ticks */}
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
            {t}
          </text>
        </g>
      ))}

      {/* Series */}
      {projected.series.map((s) => {
        if (s.samples.length === 0) return null;
        return (
          <g key={diceKey(s.dice)}>
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
                points={s.samples
                  .map((p) => `${x(p.target)},${y(p.difficulty)}`)
                  .join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeWidth}
                opacity={0.9}
              />
            )}
            {s.samples.map((p, i) => (
              <circle
                key={i}
                cx={x(p.target)}
                cy={y(p.difficulty)}
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

/**
 * Splits per-target samples into runs of consecutive targets and emits
 * one polyline per run, so a missing (unsolvable) target leaves a
 * visible gap instead of a long misleading diagonal.
 */
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
  y: (difficulty: number) => number;
}) {
  const runs: SeriesPoint[][] = [];
  let current: SeriesPoint[] = [];
  for (const p of samples) {
    if (current.length === 0) {
      current.push(p);
      continue;
    }
    const last = current[current.length - 1]!;
    if (p.target === last.target + 1) {
      current.push(p);
    } else {
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
          points={run.map((p) => `${x(p.target)},${y(p.difficulty)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          opacity={0.9}
        />
      ))}
    </>
  );
}

function pickXTicks(min: number, max: number): number[] {
  const span = max - min;
  const targetCount = 8;
  const rough = span / targetCount;
  const magnitudes = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
  const step = magnitudes.find((m) => m >= rough) ?? 1000;
  const out: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max; v += step) out.push(v);
  if (out[0] !== min) out.unshift(min);
  if (out[out.length - 1] !== max) out.push(max);
  return out;
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
  for (let i = 0; i <= count; i++) out.push(Math.round(min + i * step));
  return out;
}

function formatTick(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

function chartTitle(mode: CompareChartMode): string {
  switch (mode) {
    case "perTarget":
      return "Difficulty per target";
    case "avgPerBucket":
      return `Average difficulty per ${BUCKET_SIZE}`;
    case "countPerBucket":
      return `Solvable targets per ${BUCKET_SIZE}`;
    case "cumulative":
      return "Cumulative solvable targets";
  }
}

function chartHint(mode: CompareChartMode): string {
  switch (mode) {
    case "perTarget":
      return "(lower = easier · gaps = unsolvable target)";
    case "avgPerBucket":
      return `(mean over solvable targets in each ${BUCKET_SIZE}-window)`;
    case "countPerBucket":
      return `(0–${BUCKET_SIZE} per window · higher = broader coverage)`;
    case "cumulative":
      return "(steeper rise = more targets unlocked)";
  }
}

// ---------------------------------------------------------------------------
//  Mode selector
// ---------------------------------------------------------------------------

interface ModeOption {
  readonly id: CompareChartMode;
  readonly label: string;
  readonly hint: string;
}

const MODE_OPTIONS: readonly ModeOption[] = [
  {
    id: "perTarget",
    label: "Per target",
    hint: "Difficulty at every individual target — exact but noisy.",
  },
  {
    id: "avgPerBucket",
    label: `Avg / ${BUCKET_SIZE}`,
    hint: `Average difficulty within each ${BUCKET_SIZE}-target window.`,
  },
  {
    id: "countPerBucket",
    label: `Solvable / ${BUCKET_SIZE}`,
    hint: `Coverage: how many targets in each ${BUCKET_SIZE}-target window are reachable.`,
  },
  {
    id: "cumulative",
    label: "Cumulative solvable",
    hint: "Running total of solvable targets — steepest curve = broadest set.",
  },
];

const ChartModeSelector = observer(function ChartModeSelector() {
  const { compare } = useStore();
  const active = compare.chartMode;
  return (
    <div
      role="tablist"
      aria-label="Chart projection"
      className="flex items-center flex-wrap gap-1"
    >
      {MODE_OPTIONS.map((opt) => {
        const isActive = opt.id === active;
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => compare.setChartMode(opt.id)}
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

const ManualPicker = observer(function ManualPicker() {
  const { compare } = useStore();
  const [d1, setD1] = useState(2);
  const [d2, setD2] = useState(3);
  const [d3, setD3] = useState(5);
  const disabled = compare.isFull;

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const triple: DiceTriple = [d1, d2, d3];
    compare.add(triple);
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 flex-wrap"
      aria-label="Add a dice triple manually"
    >
      <span className="label-caps">Add manually</span>
      {[d1, d2, d3].map((v, i) => (
        <input
          key={i}
          type="number"
          min={1}
          max={20}
          step={1}
          value={v}
          onChange={(e) => {
            const n = clampDie(Number(e.target.value));
            if (n === null) return;
            if (i === 0) setD1(n);
            if (i === 1) setD2(n);
            if (i === 2) setD3(n);
          }}
          aria-label={`Die ${i + 1}`}
          className="w-12 px-1.5 py-1 text-center text-[13px] font-mono bg-paper-50 border border-ink-100/30 text-ink-300 focus:outline-none focus:border-oxblood-500"
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
        title={disabled ? `Already comparing ${COMPARE_MAX} triples` : "Add to comparison"}
      >
        + Add
      </button>
    </form>
  );
});

const FavoritePicker = observer(function FavoritePicker() {
  const { favorites, compare } = useStore();
  const list = favorites.list();
  if (list.length === 0) {
    return (
      <div className="font-mono text-[11px] italic text-ink-100">
        No favorites yet — star a triple in Lookup or Explore, then quick-add it here.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="label-caps">Quick-add from favorites</span>
      {list.map((dice) => {
        const inSet = compare.has(dice);
        const disabled = !inSet && compare.isFull;
        return (
          <button
            key={diceKey(dice)}
            type="button"
            disabled={disabled}
            onClick={() => compare.toggle(dice)}
            aria-pressed={inSet}
            className={[
              "px-2 py-1 text-[12px] font-mono",
              "border transition-colors",
              inSet
                ? "border-oxblood-500 bg-oxblood-500/10 text-oxblood-500"
                : "border-ink-100/30 text-ink-300 hover:border-ink-200/60",
              disabled && !inSet ? "opacity-30 cursor-not-allowed" : "",
            ].join(" ")}
            style={{ borderRadius: "2px" }}
            title={
              inSet
                ? "Click to remove from comparison"
                : disabled
                  ? `Already comparing ${COMPARE_MAX} triples`
                  : "Click to add to comparison"
            }
          >
            {dice.join("·")}
          </button>
        );
      })}
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Selected legend / summary table
// ---------------------------------------------------------------------------

/** Difficulty bands used for the per-row distribution mini-bar. */
const DIFFICULTY_BANDS = [
  { id: "easy", label: "Easy (<25)", color: "#3a8754", min: 0, max: 25 },
  { id: "medium", label: "Medium (25–49)", color: "#1e6f9d", min: 25, max: 50 },
  { id: "hard", label: "Hard (50–74)", color: "#d18b00", min: 50, max: 75 },
  { id: "brutal", label: "Brutal (75+)", color: "#7a1f24", min: 75, max: Infinity },
] as const;

interface DerivedStats {
  readonly median: number | null;
  readonly bandCounts: readonly number[]; // matches DIFFICULTY_BANDS order
  readonly total: number;
}

function deriveStats(detail: DiceDetail): DerivedStats {
  const diffs: number[] = [];
  for (const sol of Object.values(detail.solutions)) {
    diffs.push(sol.difficulty);
  }
  if (diffs.length === 0) {
    return {
      median: null,
      bandCounts: DIFFICULTY_BANDS.map(() => 0),
      total: 0,
    };
  }
  diffs.sort((a, b) => a - b);
  const mid = Math.floor(diffs.length / 2);
  const median =
    diffs.length % 2 === 0 ? (diffs[mid - 1]! + diffs[mid]!) / 2 : diffs[mid]!;
  const counts = DIFFICULTY_BANDS.map(() => 0);
  for (const d of diffs) {
    for (let i = 0; i < DIFFICULTY_BANDS.length; i++) {
      const b = DIFFICULTY_BANDS[i]!;
      if (d >= b.min && d < b.max) {
        counts[i] = (counts[i] ?? 0) + 1;
        break;
      }
    }
  }
  return { median, bandCounts: counts, total: diffs.length };
}

function DistributionBar({ stats }: { stats: DerivedStats }) {
  if (stats.total === 0) {
    return (
      <span className="font-mono text-[11px] text-ink-100/60">—</span>
    );
  }
  return (
    <div
      className="flex h-3 w-full min-w-[120px] overflow-hidden border border-ink-100/15"
      style={{ borderRadius: 2 }}
      role="img"
      aria-label={DIFFICULTY_BANDS.map((b, i) => {
        const pct = ((stats.bandCounts[i] ?? 0) / stats.total) * 100;
        return `${b.label}: ${pct.toFixed(0)} percent`;
      }).join(", ")}
    >
      {DIFFICULTY_BANDS.map((b, i) => {
        const count = stats.bandCounts[i] ?? 0;
        const pct = (count / stats.total) * 100;
        if (pct === 0) return null;
        return (
          <div
            key={b.id}
            title={`${b.label} — ${count} (${pct.toFixed(1)}%)`}
            style={{
              flex: `${pct} 0 0`,
              background: b.color,
            }}
          />
        );
      })}
    </div>
  );
}

function DistributionLegend() {
  return (
    <div className="flex items-center flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wide-caps text-ink-100">
      {DIFFICULTY_BANDS.map((b) => (
        <span key={b.id} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              background: b.color,
              borderRadius: 2,
            }}
          />
          {b.label}
        </span>
      ))}
    </div>
  );
}

const SelectedPanel = observer(function SelectedPanel({
  detailMap,
}: {
  detailMap: ReadonlyMap<string, Loadable<DiceDetail>>;
}) {
  const { compare } = useStore();
  const selected = compare.selected;
  if (selected.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto border border-ink-100/15">
        <table className="w-full">
          <thead>
            <tr className="bg-paper-100/40">
              <th className="py-2 px-3 text-left label-caps border-b border-ink-300/30">
                In comparison
              </th>
              <th className="py-2 px-3 text-right label-caps border-b border-ink-300/30">
                Solvable
              </th>
              <th className="py-2 px-3 text-right label-caps border-b border-ink-300/30">
                Easiest
              </th>
              <th className="py-2 px-3 text-right label-caps border-b border-ink-300/30">
                Hardest
              </th>
              <th className="py-2 px-3 text-right label-caps border-b border-ink-300/30">
                Average
              </th>
              <th className="py-2 px-3 text-right label-caps border-b border-ink-300/30">
                Median
              </th>
              <th className="py-2 px-3 text-left label-caps border-b border-ink-300/30 min-w-[160px]">
                Difficulty mix
              </th>
              <th
                className="py-2 px-3 text-right border-b border-ink-300/30"
                aria-label="Remove"
              />
            </tr>
          </thead>
          <tbody>
            {selected.map((dice, i) => {
              const state = detailMap.get(diceKey(dice));
              const detail = state?.status === "ready" ? state.value : null;
              const summary = detail?.summary ?? null;
              const stats = detail
                ? deriveStats(detail)
                : { median: null, bandCounts: [], total: 0 };
              const color = SERIES_COLORS[i] ?? "#444";
              return (
                <tr key={diceKey(dice)}>
                  <td className="py-2 px-3 border-b border-ink-100/10">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          background: color,
                          borderRadius: 2,
                        }}
                      />
                      <DiceGlyph dice={dice} size="sm" />
                    </span>
                  </td>
                  <td className="py-2 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
                    {summary?.solvableCount ?? "—"}
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
                    {stats.median?.toFixed(2) ?? "—"}
                  </td>
                  <td className="py-2 px-3 border-b border-ink-100/10">
                    <DistributionBar stats={stats} />
                  </td>
                  <td className="py-2 px-3 border-b border-ink-100/10 text-right">
                    <button
                      type="button"
                      onClick={() => compare.remove(dice)}
                      aria-label={`Remove ${dice.join("·")} from comparison`}
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
      <DistributionLegend />
    </div>
  );
});

// ---------------------------------------------------------------------------
//  CompareView
// ---------------------------------------------------------------------------

export const CompareView = observer(function CompareView() {
  const { secret } = useStore();
  if (secret.aetherActive) return <AetherCompareView />;
  return <StandardCompareView />;
});

const StandardCompareView = observer(function StandardCompareView() {
  const { compare, data } = useStore();
  const selected = compare.selected;

  // Kick off (or wait on) loads for every selected triple. `ensureDice`
  // dedupes itself so this is safe to fire on every render.
  useEffect(() => {
    for (const dice of selected) data.ensureDice(dice);
    // selected is observable; rebuild deps from its key string so React
    // sees the change without depending on referential identity.
  }, [data, selected.map((d) => diceKey(d)).join("|")]);

  // Snapshot of the current load state for each selected triple.
  // Reading `data.diceState` inside the observer wires up MobX
  // dependencies, so the chart re-renders when any load resolves.
  const detailMap = useMemo(() => {
    const map = new Map<string, Loadable<DiceDetail>>();
    for (const dice of selected) {
      map.set(diceKey(dice), data.diceState(dice));
    }
    return map;
    // Dependency keyed on selection + per-triple load state ticks.
  }, [data, selected, ...selected.map((d) => data.diceState(d).status)]);

  // Build chart series. Skip not-yet-ready triples so the chart pops in
  // progressively rather than blocking on the slowest load.
  const series: ChartSeries[] = [];
  selected.forEach((dice, i) => {
    const state = detailMap.get(diceKey(dice));
    if (state?.status !== "ready") return;
    series.push({
      dice,
      color: SERIES_COLORS[i] ?? "#444",
      points: detailToSeries(state.value),
    });
  });

  const allTargets = series.flatMap((s) => s.points.map((p) => p.target));
  const domainMin = allTargets.length === 0 ? 1 : Math.min(...allTargets);
  const domainMax = allTargets.length === 0 ? 999 : Math.max(...allTargets);

  return (
    <article>
      <PageHeader
        folio="III"
        eyebrow="The Bench"
        title={
          <>
            Four triples,{" "}
            <span
              className="italic text-oxblood-500"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}
            >
              overlaid
            </span>
            .
          </>
        }
        dek="Pick up to four dice triples and read their difficulty curves on a shared axis. Useful for sizing up custom sets before a competition."
        right={
          compare.size > 0 ? (
            <button
              type="button"
              onClick={() => compare.clear()}
              className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide-caps text-ink-100 hover:text-oxblood-500"
            >
              Clear comparison
            </button>
          ) : undefined
        }
      />

      <section className="mb-6 flex flex-col gap-3">
        <FavoritePicker />
        <ManualPicker />
        <div className="font-mono text-[11px] text-ink-100">
          {compare.size}/{COMPARE_MAX} selected
          {compare.isFull && (
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
            Pick a dice triple above to begin the comparison.
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
                {chartTitle(compare.chartMode)}
                <span className="ml-2 text-ink-100/60 normal-case tracking-normal">
                  {chartHint(compare.chartMode)}
                </span>
              </div>
              <ChartModeSelector />
            </div>
            {series.length === 0 ? (
              <div
                className="font-mono text-[12px] text-ink-100 py-12 text-center"
                role="status"
                aria-live="polite"
              >
                Loading dice details…
              </div>
            ) : (
              <ComparisonChart
                raw={series}
                mode={compare.chartMode}
                domainMin={domainMin}
                domainMax={domainMax}
              />
            )}
          </div>

          <SelectedPanel detailMap={detailMap} />
        </div>
      )}
    </article>
  );
});
