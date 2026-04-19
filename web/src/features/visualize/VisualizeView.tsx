/**
 * VisualizeView — atlas heatmap, histogram, scatter plot.
 *
 * Three SVG charts driven by `VisualizeStore`:
 *   - Atlas: 999-cell target grid, color = easiest difficulty (or coverage)
 *   - Histogram: tuple count per average-difficulty bucket
 *   - Scatter: solvable count vs. avg difficulty per tuple
 *
 * Reuses `ExploreStore.stats` (the live tuple index) so opening Visualize
 * after Explore is instantaneous.
 */
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useAppStore } from "../../stores/AppStoreContext.js";
import { tierForDifficulty } from "../lookup/difficultyTier.js";
import type { TargetCell } from "../../stores/VisualizeStore.js";

type AtlasMode = "easiest" | "hardest" | "coverage";

export const VisualizeView = observer(function VisualizeView() {
  const { explore, visualize } = useAppStore();
  const [atlasMode, setAtlasMode] = useState<AtlasMode>("easiest");

  const cells = visualize.targetCells;
  const histogram = visualize.histogram;
  const scatter = visualize.scatter;

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Visualize</h2>
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Target atlas + difficulty distribution + tuple scatter, derived live from the
            tuple index ({explore.stats.length.toLocaleString()} tuples loaded).
          </p>
        </div>
        <div className="flex gap-1">
          {(["easiest", "hardest", "coverage"] as AtlasMode[]).map((m) => {
            const active = atlasMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setAtlasMode(m)}
                className="px-2.5 py-1 text-xs rounded"
                style={{
                  background: active ? "var(--color-accent)" : "transparent",
                  color: active ? "var(--color-bg)" : "var(--color-ink)",
                  border: "1px solid var(--color-rule)",
                }}
              >
                {m === "easiest" ? "Easiest" : m === "hardest" ? "Hardest" : "Coverage"}
              </button>
            );
          })}
        </div>
      </header>

      <Card>
        <h3 className="text-sm font-semibold mb-2">Atlas — every target</h3>
        {cells.length === 0 ? (
          <Empty message="Index is still loading." />
        ) : (
          <Atlas cells={cells} mode={atlasMode} />
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold mb-2">Difficulty distribution</h3>
          <Histogram bars={histogram} />
        </Card>
        <Card>
          <h3 className="text-sm font-semibold mb-2">Solvable vs. difficulty</h3>
          <Scatter points={scatter} />
        </Card>
      </div>
    </div>
  );
});

function Card(props: { children: React.ReactNode }) {
  return (
    <div
      className="px-5 py-4"
      style={{
        background: "var(--color-surface)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {props.children}
    </div>
  );
}

function Empty(props: { message: string }) {
  return (
    <div className="py-12 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>
      {props.message}
    </div>
  );
}

function Atlas(props: { cells: readonly TargetCell[]; mode: AtlasMode }) {
  const targets = props.cells.map((c) => c.target);
  const minT = Math.min(...targets);
  const maxT = Math.max(...targets);

  const cellSize = 12;
  const cols = 50;
  const rows = Math.ceil((maxT - minT + 1) / cols);
  const W = cols * cellSize;
  const H = rows * cellSize;
  const cellByTarget = new Map<number, TargetCell>();
  for (const c of props.cells) cellByTarget.set(c.target, c);

  const colorOf = (cell: TargetCell | undefined) => {
    if (cell === undefined) return "transparent";
    if (props.mode === "coverage") {
      const intensity = Math.min(1, cell.coverage / 200);
      return `color-mix(in oklab, var(--color-accent) ${Math.round(intensity * 100)}%, var(--color-rule))`;
    }
    const value = props.mode === "easiest" ? cell.easiest : cell.hardest;
    if (!Number.isFinite(value)) return "transparent";
    const tier = tierForDifficulty(value);
    return tier.chipBg.replace(/0\.\d+/, "0.7");
  };

  return (
    <div className="overflow-auto">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Target atlas heatmap" style={{ width: "100%", maxWidth: W * 1.2 }}>
        {Array.from({ length: maxT - minT + 1 }, (_, i) => i + minT).map((t) => {
          const offset = t - minT;
          const r = Math.floor(offset / cols);
          const c = offset % cols;
          const cell = cellByTarget.get(t);
          return (
            <rect
              key={t}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize - 1}
              height={cellSize - 1}
              fill={colorOf(cell)}
              stroke="var(--color-rule)"
              strokeOpacity={0.2}
              strokeWidth={0.5}
            >
              <title>
                {`Target ${t}: ${
                  cell === undefined
                    ? "unreachable"
                    : `${cell.coverage} tuples, easiest ${cell.easiest.toFixed(1)}, hardest ${cell.hardest.toFixed(1)}`
                }`}
              </title>
            </rect>
          );
        })}
      </svg>
      <p className="mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
        Hover a cell for stats. Mode: <strong>{props.mode}</strong>. Range: {minT}…{maxT}.
      </p>
    </div>
  );
}

function Histogram(props: { bars: readonly { bucketIndex: number; label: string; count: number }[] }) {
  const max = Math.max(1, ...props.bars.map((b) => b.count));
  const total = props.bars.reduce((a, b) => a + b.count, 0);
  if (total === 0) return <Empty message="No tuples indexed yet." />;
  return (
    <div className="space-y-1.5">
      {props.bars.map((b) => {
        const tier = tierForDifficulty(b.bucketIndex * 10 + 1);
        return (
          <div key={b.bucketIndex} className="flex items-center gap-2 text-xs">
            <span className="w-12 text-right tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
              {b.label}
            </span>
            <div className="flex-1 h-3 rounded overflow-hidden" style={{ background: "color-mix(in oklab, var(--color-rule) 50%, transparent)" }}>
              <div
                className="h-full"
                style={{
                  width: `${(b.count / max) * 100}%`,
                  background: tier.chipBg.replace(/0\.\d+/, "0.65"),
                }}
              />
            </div>
            <span className="w-12 tabular-nums">{b.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function Scatter(props: { points: readonly { dice: readonly number[]; solvable: number; avgDifficulty: number }[] }) {
  if (props.points.length === 0) return <Empty message="No tuples indexed yet." />;
  const W = 480;
  const H = 280;
  const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

  const xs = props.points.map((p) => p.solvable);
  const ys = props.points.map((p) => p.avgDifficulty);
  const xMax = Math.max(1, ...xs);
  const yMax = Math.max(1, ...ys);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const xScale = (n: number) => PAD.left + (n / xMax) * innerW;
  const yScale = (n: number) => H - PAD.bottom - (n / yMax) * innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tuple scatter plot" className="w-full h-auto">
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--color-rule)" />
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-rule)" />
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--color-ink-muted)">
        Solvable count
      </text>
      <text x={10} y={H / 2} textAnchor="middle" fontSize={10} fill="var(--color-ink-muted)" transform={`rotate(-90 10 ${H / 2})`}>
        Avg difficulty
      </text>
      {props.points.map((p) => {
        const tier = tierForDifficulty(p.avgDifficulty);
        return (
          <circle
            key={p.dice.join(",")}
            cx={xScale(p.solvable)}
            cy={yScale(p.avgDifficulty)}
            r={2.5}
            fill={tier.chipBg.replace(/0\.\d+/, "0.55")}
            stroke="var(--color-ink)"
            strokeOpacity={0.05}
            strokeWidth={0.5}
          >
            <title>
              {p.dice.join("/")} — {p.solvable} reachable, avg {p.avgDifficulty.toFixed(1)}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}
