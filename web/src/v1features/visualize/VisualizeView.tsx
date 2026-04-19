import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext";
import { DiceGlyph } from "../../v1ui/DiceGlyph";
import { FavoriteToggle } from "../../v1ui/FavoriteToggle";
import { PageHeader } from "../_shared/PageHeader";
import { paletteFor } from "./difficultyScale";
import { AetherVisualizeView } from "./AetherVisualizeView";
import type {
  DiceDetail,
  DiceSummary,
  DiceTriple,
  TargetStatsEntry,
} from "../../core/types";

/**
 * Phase 4 redesign. Visualize is now four sections, top to bottom:
 *
 *   1. Atlas (heatmap) with three switchable overlays —
 *      Easiest / Hardest / Coverage — sharing the same 999-cell grid.
 *   2. Distribution + Coverage row: avg-difficulty histogram alongside
 *      the new Coverage gaps panel (fragility list + most-skipped totals
 *      across the catalogue).
 *   3. Scatter (unchanged shape, with CSS transitions).
 *   4. Small-multiples grid: one tiny per-triple difficulty sparkline
 *      for every favorited + compared triple, lazy-loaded on demand.
 *
 * All four animations (#12) are CSS-only — `transition` properties on
 * the elements that change between modes (heatmap cells, scatter dots,
 * histogram bars). No new animation dependency.
 */

// ---------------------------------------------------------------------------
//  Theme palette (recomputed when the user switches editions)
// ---------------------------------------------------------------------------

function useDifficultyPalette() {
  const { theme } = useStore();
  return useMemo(() => paletteFor(theme.theme), [theme.theme]);
}

const HISTOGRAM_BINS = 20;

// ---------------------------------------------------------------------------
//  Heatmap overlay modes (#10)
// ---------------------------------------------------------------------------

type AtlasMode = "easiest" | "hardest" | "coverage";

const ATLAS_MODES: ReadonlyArray<{
  id: AtlasMode;
  label: string;
  caption: string;
}> = [
  {
    id: "easiest",
    label: "Easiest",
    caption: "Easiest reachable difficulty for each target (1–999)",
  },
  {
    id: "hardest",
    label: "Hardest",
    caption: "Hardest reachable difficulty for each target (1–999)",
  },
  {
    id: "coverage",
    label: "Coverage",
    caption: "How many distinct dice triples can solve each target",
  },
];

// ---------------------------------------------------------------------------
//  Histogram (avg difficulty across all triples)
// ---------------------------------------------------------------------------

const Histogram = observer(function Histogram({
  rows,
}: {
  rows: readonly DiceSummary[];
}) {
  const { colorForDifficulty } = useDifficultyPalette();
  const bins = useMemo(() => {
    const counts = new Array<number>(HISTOGRAM_BINS).fill(0);
    let max = 100;
    for (const r of rows) {
      if (r.averageDifficulty === null) continue;
      const idx = Math.min(
        HISTOGRAM_BINS - 1,
        Math.max(0, Math.floor((r.averageDifficulty / max) * HISTOGRAM_BINS)),
      );
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const peak = Math.max(1, ...bins);

  return (
    <div>
      <div className="label-caps mb-3">Distribution of average difficulty</div>
      <div className="flex items-end gap-[3px]" style={{ height: "11rem" }}>
        {bins.map((count, i) => {
          const heightPct = (count / peak) * 100;
          const midpoint = ((i + 0.5) / HISTOGRAM_BINS) * 100;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end h-full"
              title={`${count} triples in ${(i * 5).toFixed(0)}–${((i + 1) * 5).toFixed(0)}`}
            >
              <div
                className="w-full"
                style={{
                  height: `${heightPct}%`,
                  minHeight: count > 0 ? "2px" : "0",
                  background: colorForDifficulty(midpoint),
                  borderRadius: "1px",
                  // #12: animate height + color when the dataset or theme
                  // changes. 320ms + ease-out reads as crisp without
                  // feeling sluggish.
                  transition:
                    "height 320ms ease-out, background-color 240ms ease-out",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-mono text-ink-100">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Atlas (heatmap with mode overlay)
// ---------------------------------------------------------------------------

interface AtlasCell {
  total: number;
  difficulty: number | null;
  hardest: number | null;
  solverCount: number;
}

/**
 * Coverage palette: red for fragile targets, neutral for well-covered.
 * Independent from `paletteFor()` so the Coverage overlay reads as a
 * structural channel rather than a difficulty one.
 */
function coverageColor(
  count: number,
  minCount: number,
  maxCount: number,
): string {
  if (maxCount === minCount) return "rgb(var(--ink-100) / 0.18)";
  // Fragile (low count) -> accent; covered (high) -> ink/40.
  const t = (count - minCount) / (maxCount - minCount);
  // Invert: low t (fragile) = strong accent, high t (covered) = subdued.
  const intensity = 1 - t;
  const accentAlpha = 0.25 + intensity * 0.6; // 0.25..0.85
  return `rgb(var(--accent-500) / ${accentAlpha.toFixed(2)})`;
}

const Atlas = observer(function Atlas({
  cells,
  mode,
  onModeChange,
}: {
  cells: readonly AtlasCell[];
  mode: AtlasMode;
  onModeChange: (next: AtlasMode) => void;
}) {
  const { colorForDifficulty, impossibleColor } = useDifficultyPalette();
  const counts = cells.map((c) => c.solverCount);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);

  function colorFor(cell: AtlasCell): string {
    switch (mode) {
      case "easiest":
        return cell.difficulty === null
          ? impossibleColor
          : colorForDifficulty(cell.difficulty);
      case "hardest":
        return cell.hardest === null
          ? impossibleColor
          : colorForDifficulty(cell.hardest);
      case "coverage":
        return coverageColor(cell.solverCount, minCount, maxCount);
    }
  }

  function tooltipFor(cell: AtlasCell): string {
    switch (mode) {
      case "easiest":
        return cell.difficulty === null
          ? `${cell.total}: unreachable`
          : `${cell.total}: easiest difficulty ${cell.difficulty.toFixed(2)}`;
      case "hardest":
        return cell.hardest === null
          ? `${cell.total}: unreachable`
          : `${cell.total}: hardest reachable ${cell.hardest.toFixed(2)}`;
      case "coverage":
        return `${cell.total}: solvable from ${cell.solverCount} triples`;
    }
  }

  const cols = 37;
  const active = ATLAS_MODES.find((m) => m.id === mode)!;

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3 flex-wrap">
        <div className="label-caps">{active.caption}</div>
        <div
          role="tablist"
          aria-label="Atlas overlay"
          className="inline-flex items-stretch border border-ink-100/30"
          style={{ borderRadius: "2px" }}
        >
          {ATLAS_MODES.map((m) => {
            const isActive = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onModeChange(m.id)}
                className={[
                  "px-3 py-1 text-[11px] font-mono uppercase tracking-wide-caps transition-colors",
                  isActive
                    ? "bg-oxblood-500 text-paper-50"
                    : "bg-paper-50 text-ink-200 hover:text-ink-500",
                ].join(" ")}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="grid w-full select-none"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: "2px",
        }}
      >
        {cells.map((cell) => (
          <div
            key={cell.total}
            className="aspect-square relative group"
            style={{
              background: colorFor(cell),
              borderRadius: "1px",
              // #12: animate background-color when the overlay mode flips.
              transition: "background-color 280ms ease-out",
            }}
            title={tooltipFor(cell)}
          >
            {cell.total % 100 === 0 && (
              <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-mono text-ink-100">
                {cell.total}
              </span>
            )}
          </div>
        ))}
      </div>

      <AtlasLegend mode={mode} minCount={minCount} maxCount={maxCount} />
    </div>
  );
});

function AtlasLegend({
  mode,
  minCount,
  maxCount,
}: {
  mode: AtlasMode;
  minCount: number;
  maxCount: number;
}) {
  const { colorForDifficulty, impossibleColor } = useDifficultyPalette();

  if (mode === "coverage") {
    return (
      <div className="mt-8 flex items-center gap-3 flex-wrap">
        <span className="label-caps">Fragile ({minCount})</span>
        <div
          className="h-3 flex-1 max-w-md"
          style={{
            background: `linear-gradient(to right, ${coverageColor(maxCount, minCount, maxCount)} 0%, ${coverageColor(minCount, minCount, maxCount)} 100%)`,
            borderRadius: "1px",
            transition: "background 280ms ease-out",
          }}
        />
        <span className="label-caps">Covered ({maxCount})</span>
      </div>
    );
  }

  const isHardest = mode === "hardest";
  return (
    <div className="mt-8 flex items-center gap-3 flex-wrap">
      <span className="label-caps">{isHardest ? "Easiest hard" : "Easier"}</span>
      <div
        className="h-3 flex-1 max-w-md"
        style={{
          background: `linear-gradient(to right,
            ${colorForDifficulty(0)} 0%,
            ${colorForDifficulty(25)} 25%,
            ${colorForDifficulty(50)} 50%,
            ${colorForDifficulty(75)} 75%,
            ${colorForDifficulty(100)} 100%)`,
          borderRadius: "1px",
          transition: "background 280ms ease-out",
        }}
      />
      <span className="label-caps">{isHardest ? "Hardest hard" : "Harder"}</span>
      <div className="ml-3 inline-flex items-center gap-1.5">
        <div
          className="w-3 h-3"
          style={{
            background: impossibleColor,
            borderRadius: "1px",
            transition: "background-color 280ms ease-out",
          }}
        />
        <span className="label-caps">Unreachable</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Coverage gaps panel (#11)
// ---------------------------------------------------------------------------

const CoverageGaps = observer(function CoverageGaps({
  cells,
  rows,
}: {
  cells: readonly AtlasCell[];
  rows: readonly DiceSummary[];
}) {
  const totalTargets = cells.length;
  const reachable = cells.filter((c) => c.solverCount > 0).length;
  // Both lists below are presented side by side; keeping them the same
  // length avoids the visual ragged-bottom that happens when one column
  // is taller than the other inside a `grid sm:grid-cols-2`.
  const COVERAGE_LIST_LEN = 8;
  const fragile = useMemo(() => {
    const sorted = [...cells].sort((a, b) => a.solverCount - b.solverCount);
    return sorted.slice(0, COVERAGE_LIST_LEN);
  }, [cells]);
  const worstCovered = useMemo(() => {
    const sorted = [...rows].sort(
      (a, b) => b.impossibleCount - a.impossibleCount,
    );
    return sorted.slice(0, COVERAGE_LIST_LEN);
  }, [rows]);

  // Distribution of solverCount, log-binned so the long tail of well-
  // covered targets doesn't drown out the fragile head of the curve.
  const solverBins = useMemo(() => {
    const counts = cells.map((c) => c.solverCount);
    const max = Math.max(...counts);
    const bins = 20;
    const edges = new Array<number>(bins + 1);
    for (let i = 0; i <= bins; i += 1) {
      edges[i] = Math.round((i / bins) * max);
    }
    const buckets = new Array<number>(bins).fill(0);
    for (const c of counts) {
      const idx = Math.min(
        bins - 1,
        Math.max(0, Math.floor((c / max) * bins)),
      );
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
    return { buckets, edges, max };
  }, [cells]);

  const peak = Math.max(1, ...solverBins.buckets);

  return (
    <div>
      <div className="label-caps mb-3">Coverage gaps</div>
      <div className="text-[12px] font-mono text-ink-200 mb-4 leading-relaxed">
        {reachable === totalTargets ? (
          <>
            <span className="text-ink-500">{totalTargets}</span> of {totalTargets}{" "}
            targets are reachable from at least one dice triple — no global
            gaps. The fragile targets below are the ones that only a handful
            of triples can solve.
          </>
        ) : (
          <>
            <span className="text-oxblood-500">
              {totalTargets - reachable}
            </span>{" "}
            of {totalTargets} targets cannot be reached from any dice triple.
          </>
        )}
      </div>

      <div className="mb-5">
        <div className="label-caps mb-2 text-[10px]">
          How many triples solve each target
        </div>
        <div
          className="flex items-end gap-[2px]"
          style={{ height: "5rem" }}
          aria-label="Distribution of solver counts per target"
        >
          {solverBins.buckets.map((count, i) => {
            const heightPct = (count / peak) * 100;
            // Fragile bins (left side) get the accent color; well-covered
            // bins fade to ink. Visual rhyme with the Coverage overlay.
            const t = i / (solverBins.buckets.length - 1);
            const bg = `rgb(var(--accent-500) / ${(0.85 - t * 0.55).toFixed(2)})`;
            return (
              <div
                key={i}
                className="flex-1 h-full flex flex-col justify-end"
                title={`${count} targets · ~${solverBins.edges[i]}–${solverBins.edges[i + 1]} solvers`}
              >
                <div
                  className="w-full"
                  style={{
                    height: `${heightPct}%`,
                    minHeight: count > 0 ? "2px" : "0",
                    background: bg,
                    borderRadius: "1px",
                    transition:
                      "height 320ms ease-out, background-color 240ms ease-out",
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-mono text-ink-100">
          <span>fragile · {Math.min(...cells.map((c) => c.solverCount))}</span>
          <span>covered · {Math.max(...cells.map((c) => c.solverCount))}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <div className="label-caps mb-2 text-[10px]">
            Most fragile targets
          </div>
          <ul className="space-y-1">
            {fragile.map((cell) => (
              <li
                key={cell.total}
                // min-h matches the dice-glyph row on the right so the
                // two columns of the grid stay vertically aligned.
                className="flex items-center justify-between gap-2 min-h-[2rem] text-[12px] font-mono border-b border-ink-100/10 pb-0.5"
              >
                <span className="text-oxblood-500 tabular">{cell.total}</span>
                <span className="text-ink-200">
                  {cell.solverCount.toLocaleString()} triples
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="label-caps mb-2 text-[10px]">
            Triples with the worst coverage
          </div>
          <ul className="space-y-1">
            {worstCovered.map((row) => (
              <li
                key={row.dice.join("-")}
                className="flex items-center justify-between gap-3 min-h-[2rem] text-[12px] font-mono border-b border-ink-100/10 pb-0.5"
              >
                <DiceGlyph dice={row.dice} size="sm" />
                <span className="text-oxblood-500 tabular">
                  {row.impossibleCount} miss
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Scatter (coverage × difficulty) — unchanged shape, with transitions
// ---------------------------------------------------------------------------

const ScatterPlot = observer(function ScatterPlot({
  rows,
}: {
  rows: readonly DiceSummary[];
}) {
  const { colorForDifficulty } = useDifficultyPalette();
  const width = 800;
  const height = 280;
  const padding = { top: 20, right: 20, bottom: 32, left: 44 };
  const xMax = 999;
  const yMax = 100;
  const xScale = (n: number) =>
    padding.left + (n / xMax) * (width - padding.left - padding.right);
  const yScale = (n: number) =>
    height - padding.bottom - (n / yMax) * (height - padding.top - padding.bottom);

  return (
    <div>
      <div className="label-caps mb-3">
        Coverage <span className="text-ink-100">×</span> difficulty (each dot = a dice triple)
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {[0, 25, 50, 75, 100].map((y) => (
          <g key={`y-${y}`}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yScale(y)}
              y2={yScale(y)}
              stroke="rgb(var(--ink-100))"
              strokeOpacity={0.25}
              strokeWidth={1}
            />
            <text
              x={padding.left - 8}
              y={yScale(y) + 3}
              className="font-mono"
              style={{ fontSize: 10, fill: "rgb(var(--ink-100))" }}
              textAnchor="end"
            >
              {y}
            </text>
          </g>
        ))}
        {[0, 250, 500, 750, 999].map((x) => (
          <text
            key={`x-${x}`}
            x={xScale(x)}
            y={height - 10}
            className="font-mono"
            style={{ fontSize: 10, fill: "rgb(var(--ink-100))" }}
            textAnchor="middle"
          >
            {x}
          </text>
        ))}
        <text x={width / 2} y={height} className="font-mono" style={{ fontSize: 10, fill: "rgb(var(--ink-200))" }} textAnchor="middle">
          targets solvable
        </text>
        <text
          x={-(height / 2)}
          y={14}
          transform="rotate(-90)"
          className="font-mono"
          style={{ fontSize: 10, fill: "rgb(var(--ink-200))" }}
          textAnchor="middle"
        >
          average difficulty
        </text>

        {rows.map((r) => {
          if (r.averageDifficulty === null) return null;
          const cx = xScale(r.solvableCount);
          const cy = yScale(r.averageDifficulty);
          return (
            <circle
              key={r.dice.join("-")}
              cx={cx}
              cy={cy}
              r={2.5}
              fill={colorForDifficulty(r.averageDifficulty)}
              opacity={0.6}
              // #12: animated dot positions when the source data shifts
              // (theme switch, future filter overlays).
              style={{ transition: "fill 240ms ease-out, cx 320ms ease-out, cy 320ms ease-out" }}
            >
              <title>{`${r.dice.join("·")}  ·  solves ${r.solvableCount}  ·  avg ${r.averageDifficulty.toFixed(2)}`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Small-multiples grid (#9)
// ---------------------------------------------------------------------------

interface SparklineProps {
  detail: DiceDetail;
  colorForDifficulty: (d: number) => string;
}

function Sparkline({ detail, colorForDifficulty }: SparklineProps) {
  // Draw a light-stroked area chart of difficulty vs. target. Width is
  // 999 logical units (one per target), height 32. Missing targets break
  // the line so unsolvable cells stay legible.
  const width = 999;
  const height = 32;
  const segments = useMemo(() => {
    const points: Array<{ t: number; d: number }> = [];
    for (let t = 1; t <= 999; t += 1) {
      const sol = detail.solutions[String(t)];
      if (sol !== undefined) points.push({ t, d: sol.difficulty });
    }
    // Split into runs of consecutive targets.
    const runs: Array<Array<{ t: number; d: number }>> = [];
    let current: Array<{ t: number; d: number }> = [];
    for (const p of points) {
      if (current.length === 0 || p.t === current[current.length - 1]!.t + 1) {
        current.push(p);
      } else {
        runs.push(current);
        current = [p];
      }
    }
    if (current.length > 0) runs.push(current);
    return runs;
  }, [detail]);

  const avg = detail.summary.averageDifficulty ?? 50;
  const seriesColor = colorForDifficulty(avg);
  const x = (t: number) => ((t - 1) / 998) * width;
  const y = (d: number) => height - (d / 100) * height;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      preserveAspectRatio="none"
    >
      <line
        x1={0}
        x2={width}
        y1={height}
        y2={height}
        stroke="rgb(var(--ink-100) / 0.3)"
        strokeWidth={1}
      />
      {segments.map((run, i) => (
        <polyline
          key={i}
          points={run.map((p) => `${x(p.t)},${y(p.d)}`).join(" ")}
          fill="none"
          stroke={seriesColor}
          strokeWidth={1.4}
          opacity={0.95}
          style={{ transition: "stroke 240ms ease-out" }}
        />
      ))}
    </svg>
  );
}

const SparklineCard = observer(function SparklineCard({
  dice,
}: {
  dice: DiceTriple;
}) {
  const { data } = useStore();
  const { colorForDifficulty } = useDifficultyPalette();

  useEffect(() => {
    data.ensureDice(dice);
  }, [data, dice]);

  const state = data.diceState(dice);

  return (
    <div
      className="border border-ink-100/15 px-3 py-3 bg-paper-50 group"
      style={{
        borderRadius: "2px",
        transition: "border-color 200ms ease-out",
      }}
    >
      <div className="mb-2 flex items-center gap-2 min-w-0">
        <FavoriteToggle dice={dice} size="sm" />
        <DiceGlyph dice={dice} size="sm" />
      </div>
      {state.status === "ready" && (
        <div className="mb-1 font-mono text-[10px] tracking-wide-caps uppercase text-ink-100 whitespace-nowrap overflow-hidden text-ellipsis">
          avg{" "}
          <span className="tabular text-ink-300">
            {state.value.summary.averageDifficulty?.toFixed(1) ?? "—"}
          </span>
          <span className="mx-1 text-ink-100/40">·</span>
          <span className="tabular text-ink-300">
            {state.value.summary.solvableCount}
          </span>
          <span className="text-ink-100/60">/999</span>
        </div>
      )}
      <div style={{ height: "32px" }}>
        {state.status === "ready" ? (
          <Sparkline detail={state.value} colorForDifficulty={colorForDifficulty} />
        ) : state.status === "error" ? (
          <div className="font-mono text-[10px] text-oxblood-500">load failed</div>
        ) : (
          <div className="w-full h-full bg-ink-100/10" style={{ borderRadius: "1px" }} />
        )}
      </div>
    </div>
  );
});

const SmallMultiples = observer(function SmallMultiples({
  rows,
}: {
  rows: readonly DiceSummary[];
}) {
  const { favorites, compare } = useStore();
  const [showHardest, setShowHardest] = useState(false);
  const [showEasiest, setShowEasiest] = useState(false);

  const dice: DiceTriple[] = useMemo(() => {
    const seen = new Set<string>();
    const out: DiceTriple[] = [];
    function add(d: DiceTriple): void {
      const k = d.join("-");
      if (seen.has(k)) return;
      seen.add(k);
      out.push(d);
    }
    for (const d of compare.selected) add(d);
    for (const d of favorites.list()) add(d);
    if (showHardest) {
      const sorted = [...rows]
        .filter((r) => r.averageDifficulty !== null)
        .sort(
          (a, b) =>
            (b.averageDifficulty ?? 0) - (a.averageDifficulty ?? 0),
        )
        .slice(0, 12);
      for (const r of sorted) add(r.dice);
    }
    if (showEasiest) {
      const sorted = [...rows]
        .filter((r) => r.averageDifficulty !== null)
        .sort(
          (a, b) =>
            (a.averageDifficulty ?? 0) - (b.averageDifficulty ?? 0),
        )
        .slice(0, 12);
      for (const r of sorted) add(r.dice);
    }
    return out;
  }, [rows, favorites.list().map((d) => d.join("-")).join("|"), compare.selected.map((d) => d.join("-")).join("|"), showHardest, showEasiest]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="label-caps">
          Per-triple sparklines
          <span className="ml-2 text-ink-100/60 normal-case tracking-normal">
            ({dice.length} {dice.length === 1 ? "card" : "cards"})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowEasiest((v) => !v)}
            aria-pressed={showEasiest}
            className={[
              "px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide-caps border transition-colors",
              showEasiest
                ? "border-oxblood-500 bg-oxblood-500/10 text-oxblood-500"
                : "border-ink-100/30 text-ink-200 hover:border-oxblood-500/60",
            ].join(" ")}
            style={{ borderRadius: "2px" }}
          >
            + 12 easiest
          </button>
          <button
            type="button"
            onClick={() => setShowHardest((v) => !v)}
            aria-pressed={showHardest}
            className={[
              "px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide-caps border transition-colors",
              showHardest
                ? "border-oxblood-500 bg-oxblood-500/10 text-oxblood-500"
                : "border-ink-100/30 text-ink-200 hover:border-oxblood-500/60",
            ].join(" ")}
            style={{ borderRadius: "2px" }}
          >
            + 12 hardest
          </button>
        </div>
      </div>

      {dice.length === 0 ? (
        <div
          className="border border-dashed border-ink-100/30 px-6 py-10 text-center"
          style={{ borderRadius: "2px" }}
        >
          <p
            className="font-display italic text-[20px] text-ink-200 max-w-md mx-auto leading-snug"
            style={{ fontVariationSettings: '"opsz" 100, "SOFT" 80, "WONK" 1' }}
          >
            Star a triple, drop one on the bench, or use the buttons above to
            populate this grid.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {dice.map((d) => (
            <SparklineCard key={d.join("-")} dice={d} />
          ))}
        </div>
      )}

      {dice.length > 0 && (
        <p className="mt-3 text-[10px] font-mono italic text-ink-100">
          Each sparkline runs target 1 → 999 left to right; vertical = difficulty
          0 → 100. Gaps = unsolvable targets for that triple.
        </p>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Top-level VisualizeView
// ---------------------------------------------------------------------------

export const VisualizeView = observer(function VisualizeView() {
  const { secret } = useStore();
  if (secret.aetherActive) return <AetherVisualizeView />;
  return <StandardVisualizeView />;
});

const StandardVisualizeView = observer(function StandardVisualizeView() {
  const { data } = useStore();
  const index = data.index;
  const [atlasMode, setAtlasMode] = useState<AtlasMode>("easiest");

  // Lazy-load both auxiliary datasets on first visit. ensure*-style
  // calls dedupe internally, so it's safe to fire on every render.
  useEffect(() => {
    if (data.byTarget.status === "idle") void data.loadByTarget();
    if (data.targetStats.status === "idle") void data.loadTargetStats();
  }, [data]);

  const cells: AtlasCell[] = useMemo(() => {
    if (data.targetStats.status !== "ready") return [];
    const stats = data.targetStats.value;
    const out: AtlasCell[] = [];
    for (let total = 1; total <= 999; total += 1) {
      const entry: TargetStatsEntry | undefined = stats[String(total)];
      out.push({
        total,
        difficulty: entry?.easiest?.difficulty ?? null,
        hardest: entry?.hardest?.difficulty ?? null,
        solverCount: entry?.solverCount ?? 0,
      });
    }
    return out;
  }, [data.targetStats]);

  return (
    <article>
      <PageHeader
        folio="IV"
        eyebrow="Atlas of Difficulty"
        title={
          <>
            The whole space,{" "}
            <span className="italic text-oxblood-500" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}>
              at a glance
            </span>
            .
          </>
        }
        dek="Where ease lives, where the hard problems hide, and which target totals refuse to be reached at all."
      />

      {index.status !== "ready" ? (
        <div
          className="font-mono text-ink-100"
          role="status"
          aria-live="polite"
        >
          Loading the index…
        </div>
      ) : (
        <div className="space-y-14">
          <section>
            {data.targetStats.status === "ready" ? (
              <Atlas
                cells={cells}
                mode={atlasMode}
                onModeChange={setAtlasMode}
              />
            ) : (
              <div
                className="font-mono text-[12px] text-ink-100"
                role="status"
                aria-live="polite"
              >
                Loading target stats…
              </div>
            )}
          </section>

          <div className="grid grid-cols-12 gap-y-12 lg:gap-10">
            <section className="col-span-12 lg:col-span-5 min-w-0">
              <Histogram rows={index.value.dice} />
            </section>
            <section className="col-span-12 lg:col-span-7 min-w-0">
              {data.targetStats.status === "ready" ? (
                <CoverageGaps cells={cells} rows={index.value.dice} />
              ) : (
                <div
                  className="font-mono text-[12px] text-ink-100"
                  role="status"
                  aria-live="polite"
                >
                  Loading target stats…
                </div>
              )}
            </section>
          </div>

          <section>
            <ScatterPlot rows={index.value.dice} />
          </section>

          <section>
            <SmallMultiples rows={index.value.dice} />
          </section>

          <section>
            <div className="rule" aria-hidden="true" />
            <p className="mt-8 font-serif italic text-[16px] text-ink-200 max-w-2xl leading-relaxed">
              Read the heatmap row by row, like a calendar. Most numbers fall to a
              forgiving olive — easy combinations that any dice triple can absorb.
              The deepening reds mark stubborn primes, awkward composites, and the
              occasional run of unreachable totals near the upper bound.
            </p>
          </section>
        </div>
      )}
    </article>
  );
});
