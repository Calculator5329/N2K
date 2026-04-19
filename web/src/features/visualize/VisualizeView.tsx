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
import { useMemo, useState } from "react";
import { useAppStore } from "../../stores/AppStoreContext.js";
import { tierForDifficulty } from "../lookup/difficultyTier.js";
import type { TargetCell, VisualizeStore } from "../../stores/VisualizeStore.js";
import { PageHeader } from "../../ui/primitives/PageHeader.js";
import { navItemById } from "../../ui/layouts/nav.js";

type AtlasMode = "easiest" | "hardest" | "coverage";

export const VisualizeView = observer(function VisualizeView() {
  const { explore, visualize } = useAppStore();
  const [atlasMode, setAtlasMode] = useState<AtlasMode>("easiest");

  const cells = visualize.targetCells;
  const histogram = visualize.histogram;
  const scatter = visualize.scatter;
  const item = navItemById("visualize");

  return (
    <div className="space-y-4">
      <PageHeader
        folio={item.folio}
        eyebrow="Atlas, scatter, hist."
        title="Visualize"
        dek={`Target atlas + difficulty distribution + tuple scatter, derived live from the tuple index (${explore.stats.length.toLocaleString()} tuples loaded).`}
        right={
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
        }
      />

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

      <Card>
        <h3 className="text-sm font-semibold mb-2">Coverage gaps</h3>
        <CoverageGaps store={visualize} />
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-2">Per-tuple sparklines</h3>
        <SmallMultiples store={visualize} />
      </Card>
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

// ---------------------------------------------------------------------------
//  Coverage gaps panel
// ---------------------------------------------------------------------------

const CoverageGaps = observer(function CoverageGaps({ store }: { store: VisualizeStore }) {
  const cov = store.coverage;
  const peak = Math.max(1, ...cov.coverageBuckets);

  if (cov.totalTargets === 0) {
    return <Empty message="Index is still loading." />;
  }

  return (
    <div>
      <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
        {cov.unreachable === 0 ? (
          <>
            <strong style={{ color: "var(--color-ink)" }}>{cov.reachable}</strong>
            {" "}of {cov.totalTargets} targets are reachable from at least one tuple — no
            global gaps. The fragile targets below are the ones only a handful of tuples can solve.
          </>
        ) : (
          <>
            <strong style={{ color: "var(--color-danger)" }}>{cov.unreachable}</strong>
            {" "}of {cov.totalTargets} targets cannot be reached from any indexed tuple.
          </>
        )}
      </p>

      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--color-ink-muted)" }}>
          How many tuples solve each reachable target
        </div>
        <div className="flex items-end gap-[2px]" style={{ height: "4rem" }}>
          {cov.coverageBuckets.map((count, i) => {
            const heightPct = (count / peak) * 100;
            const t = cov.coverageBuckets.length > 1 ? i / (cov.coverageBuckets.length - 1) : 0;
            const opacity = (0.85 - t * 0.55).toFixed(2);
            return (
              <div
                key={i}
                className="flex-1 h-full flex flex-col justify-end"
                title={`bucket ${i + 1}: ${count} target${count === 1 ? "" : "s"}`}
              >
                <div
                  style={{
                    height: `${heightPct}%`,
                    minHeight: count > 0 ? "2px" : "0",
                    background: `color-mix(in oklab, var(--color-accent) ${Math.round(parseFloat(opacity) * 100)}%, transparent)`,
                    borderRadius: "1px",
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
          <span>fragile · {cov.minCoverage}</span>
          <span>covered · {cov.maxCoverage}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "var(--color-ink-muted)" }}>
            Most fragile targets
          </div>
          <ul className="space-y-1 text-xs">
            {cov.fragile.map((cell) => (
              <li
                key={cell.target}
                className="flex items-center justify-between gap-2 py-1"
                style={{ borderBottom: "1px solid var(--color-rule)" }}
              >
                <span className="tabular-nums font-mono" style={{ color: "var(--color-accent)" }}>
                  {cell.target}
                </span>
                <span style={{ color: "var(--color-ink-muted)" }}>
                  {cell.coverage} tuple{cell.coverage === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "var(--color-ink-muted)" }}>
            Tuples with the worst coverage
          </div>
          <ul className="space-y-1 text-xs">
            {cov.worstCovered.map((s) => {
              const missing = cov.totalTargets - s.solvableCount;
              return (
                <li
                  key={s.dice.join("-")}
                  className="flex items-center justify-between gap-2 py-1"
                  style={{ borderBottom: "1px solid var(--color-rule)" }}
                >
                  <span className="font-mono">{s.dice.join(" / ")}</span>
                  <span style={{ color: "var(--color-danger)" }}>
                    {missing} miss
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Small-multiples grid (per-tuple sparklines)
// ---------------------------------------------------------------------------

const SmallMultiples = observer(function SmallMultiples({ store }: { store: VisualizeStore }) {
  const { explore, favorites } = useAppStore();
  const [showHardest, setShowHardest] = useState(false);
  const [showEasiest, setShowEasiest] = useState(true);

  const dice = useMemo(() => {
    const seen = new Set<string>();
    const out: number[][] = [];
    const add = (d: readonly number[]): void => {
      const k = d.join(",");
      if (seen.has(k)) return;
      seen.add(k);
      out.push([...d]);
    };
    for (const fav of favorites.forMode(store.mode.id)) add(fav);
    const stats = explore.stats;
    if (showEasiest) {
      const easiest = [...stats]
        .filter((s) => s.solvableCount > 0)
        .sort((a, b) => a.avgDifficulty - b.avgDifficulty)
        .slice(0, 6);
      for (const s of easiest) add(s.dice);
    }
    if (showHardest) {
      const hardest = [...stats]
        .filter((s) => s.solvableCount > 0)
        .sort((a, b) => b.avgDifficulty - a.avgDifficulty)
        .slice(0, 6);
      for (const s of hardest) add(s.dice);
    }
    return out;
  }, [explore.stats, favorites, store.mode.id, showEasiest, showHardest]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {dice.length} tuple{dice.length === 1 ? "" : "s"} — each sparkline runs target left → right,
          height = difficulty. Gaps mark unreachable targets.
        </p>
        <div className="flex gap-1">
          <ToggleChip active={showEasiest} onClick={() => setShowEasiest((v) => !v)}>
            + 6 easiest
          </ToggleChip>
          <ToggleChip active={showHardest} onClick={() => setShowHardest((v) => !v)}>
            + 6 hardest
          </ToggleChip>
        </div>
      </div>

      {dice.length === 0 ? (
        <Empty message="Star a tuple in Lookup, or toggle the buttons above to populate this grid." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {dice.map((d) => (
            <SparklineCard key={d.join("-")} dice={d} store={store} />
          ))}
        </div>
      )}
    </div>
  );
});

function ToggleChip(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className="px-2.5 py-1 text-xs rounded"
      style={{
        background: props.active ? "var(--color-accent)" : "transparent",
        color: props.active ? "var(--color-bg)" : "var(--color-ink)",
        border: "1px solid var(--color-rule)",
      }}
    >
      {props.children}
    </button>
  );
}

const SparklineCard = observer(function SparklineCard({
  dice,
  store,
}: {
  dice: readonly number[];
  store: VisualizeStore;
}) {
  const profile = store.tupleProfile(dice);
  const targetMin = store.mode.targetRange.min;
  const targetMax = store.mode.targetRange.max;

  return (
    <div
      className="px-3 py-2"
      style={{
        background: "color-mix(in oklab, var(--color-bg) 50%, var(--color-surface))",
        border: "1px solid var(--color-rule)",
        borderRadius: "var(--radius-card)",
      }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="font-mono">{dice.join(" / ")}</span>
        {profile.kind === "ready" && (
          <span className="tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
            {profile.points.length}/{targetMax - targetMin + 1}
          </span>
        )}
      </div>
      <div style={{ height: "36px" }}>
        {profile.kind === "ready" ? (
          <Sparkline points={profile.points} targetMin={targetMin} targetMax={targetMax} />
        ) : profile.kind === "error" ? (
          <div className="text-[10px]" style={{ color: "var(--color-danger)" }}>load failed</div>
        ) : (
          <div className="w-full h-full" style={{ background: "color-mix(in oklab, var(--color-rule) 40%, transparent)", borderRadius: "2px" }} />
        )}
      </div>
    </div>
  );
});

function Sparkline(props: {
  points: readonly { target: number; difficulty: number }[];
  targetMin: number;
  targetMax: number;
}) {
  const { points, targetMin, targetMax } = props;
  const W = 200;
  const H = 36;
  const span = Math.max(1, targetMax - targetMin);
  const x = (t: number) => ((t - targetMin) / span) * W;
  const y = (d: number) => H - (Math.max(0, Math.min(100, d)) / 100) * H;

  // Split into runs of consecutive targets so unreachable gaps stay visible.
  const sorted = [...points].sort((a, b) => a.target - b.target);
  const runs: Array<typeof sorted> = [];
  let current: typeof sorted = [];
  for (const p of sorted) {
    if (current.length === 0 || p.target === current[current.length - 1]!.target + 1) {
      current.push(p);
    } else {
      runs.push(current);
      current = [p];
    }
  }
  if (current.length > 0) runs.push(current);

  const avg =
    points.length > 0
      ? points.reduce((acc, p) => acc + p.difficulty, 0) / points.length
      : 50;
  const seriesColor = tierForDifficulty(avg).chipBg.replace(/0\.\d+/, "0.85");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-full">
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--color-rule)" strokeWidth={0.5} />
      {runs.map((run, i) => (
        <polyline
          key={i}
          points={run.map((p) => `${x(p.target)},${y(p.difficulty)}`).join(" ")}
          fill="none"
          stroke={seriesColor}
          strokeWidth={1.4}
        />
      ))}
    </svg>
  );
}
