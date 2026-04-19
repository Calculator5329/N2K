/**
 * CompareView — bench up to 4 dice tuples, overlay difficulty curves.
 *
 * Three slots besides the chart: tuple list (drag to remove), favorites
 * picker, manual picker. Chart-mode selector lives above the SVG.
 *
 * The SVG is hand-rolled (no chart library) — projection helpers live in
 * `CompareStore.projectSeries`. Theme-aware via CSS variables for ink,
 * accent, and rule colors.
 */
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useAppStore } from "../../stores/AppStoreContext.js";
import {
  type CompareChartMode,
  type CompareEntry,
  type CompareModeId,
  projectSeries,
} from "../../stores/CompareStore.js";

const SERIES_COLORS = [
  "var(--color-accent)",
  "color-mix(in oklab, var(--color-accent) 25%, var(--color-ink))",
  "color-mix(in oklab, var(--color-ink) 80%, var(--color-accent))",
  "color-mix(in oklab, var(--color-ink-muted) 80%, var(--color-accent) 30%)",
];

const CHART_MODES: ReadonlyArray<{ id: CompareChartMode; label: string }> = [
  { id: "perTarget", label: "Per target" },
  { id: "avgPerBucket", label: "Avg per bucket" },
  { id: "countPerBucket", label: "Count per bucket" },
  { id: "cumulative", label: "Cumulative reach" },
];

export const CompareView = observer(function CompareView() {
  const { compare } = useAppStore();
  const domain = compare.domain;
  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Compare</h2>
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Up to 4 tuples on one chart. Click "Compare" rows in Explore or add manually.
          </p>
        </div>
        <ChartModeSelector />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <Card>
          {compare.bench.length === 0 ? (
            <EmptyState />
          ) : domain === null ? (
            <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>Loading bench…</p>
          ) : (
            <CompareChart />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <BenchList />
          </Card>
          <Card>
            <ManualPicker />
          </Card>
          <Card>
            <FavoritePicker />
          </Card>
        </div>
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

const ChartModeSelector = observer(function ChartModeSelector() {
  const { compare } = useAppStore();
  return (
    <div className="flex gap-1">
      {CHART_MODES.map((m) => {
        const active = compare.chartMode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => compare.setChartMode(m.id)}
            className="px-2.5 py-1 text-xs rounded"
            style={{
              background: active ? "var(--color-accent)" : "transparent",
              color: active ? "var(--color-bg)" : "var(--color-ink)",
              border: "1px solid var(--color-rule)",
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
});

function EmptyState() {
  return (
    <div className="py-16 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>
      Bench is empty. Add tuples from Explore or with the manual picker.
    </div>
  );
}

const CompareChart = observer(function CompareChart() {
  const { compare } = useAppStore();
  const domain = compare.domain;
  if (domain === null) return null;

  const W = 720;
  const H = 280;
  const PAD = { top: 12, right: 24, bottom: 28, left: 44 };

  const seriesData = compare.bench.map((entry, idx) => ({
    entry,
    color: SERIES_COLORS[idx]!,
    points: projectSeries(entry, compare.chartMode, domain),
  }));

  const allY = seriesData.flatMap((s) => s.points.map((p) => p.y));
  const yMax = allY.length === 0 ? 1 : Math.max(...allY) || 1;
  const yMin = 0;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const xScale = (x: number) =>
    PAD.left + ((x - domain.min) / Math.max(1, domain.max - domain.min)) * innerW;
  const yScale = (y: number) =>
    H - PAD.bottom - ((y - yMin) / Math.max(1e-9, yMax - yMin)) * innerH;

  const xTicks = niceTicks(domain.min, domain.max, 6);
  const yTicks = niceTicks(yMin, yMax, 5);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Difficulty comparison chart" className="w-full h-auto">
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="var(--color-rule)"
              strokeOpacity={0.5}
            />
            <text
              x={PAD.left - 6}
              y={yScale(t)}
              dy="0.35em"
              textAnchor="end"
              fontSize={10}
              fill="var(--color-ink-muted)"
            >
              {formatTick(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={`x-${t}`}
            x={xScale(t)}
            y={H - PAD.bottom + 14}
            textAnchor="middle"
            fontSize={10}
            fill="var(--color-ink-muted)"
          >
            {t}
          </text>
        ))}
        {seriesData.map((s, idx) => (
          <g key={idx}>
            <path
              d={pathFor(s.points, xScale, yScale)}
              fill="none"
              stroke={s.color}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>
        {seriesData.map((s, idx) => (
          <span key={idx} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-3"
              style={{ background: s.color, borderRadius: "1px" }}
            />
            {s.entry.dice.join("/")} ({s.entry.modeId})
          </span>
        ))}
      </div>
    </div>
  );
});

const BenchList = observer(function BenchList() {
  const { compare } = useAppStore();
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Bench</h3>
        {compare.bench.length > 0 ? (
          <button
            type="button"
            onClick={() => compare.clear()}
            className="text-xs underline"
            style={{ color: "var(--color-ink-muted)" }}
          >
            Clear
          </button>
        ) : null}
      </div>
      {compare.bench.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          No tuples yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {compare.bench.map((e, idx) => (
            <BenchRow key={`${e.modeId}-${e.dice.join(",")}`} entry={e} index={idx} />
          ))}
        </ul>
      )}
    </div>
  );
});

function BenchRow(props: { entry: CompareEntry; index: number }) {
  const { compare } = useAppStore();
  const { entry } = props;
  const sols = entry.chunk?.solutions;
  const reach = sols === undefined ? "—" : `${sols.size} reachable`;
  return (
    <li
      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded"
      style={{ border: "1px solid var(--color-rule)" }}
    >
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-2 w-3"
          style={{ background: SERIES_COLORS[props.index]!, borderRadius: "1px" }}
        />
        <span className="font-mono text-sm">{entry.dice.join("/")}</span>
        <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {entry.modeId}
        </span>
      </span>
      <span className="flex items-center gap-3">
        <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {entry.loading ? "loading…" : entry.error !== null ? entry.error : reach}
        </span>
        <button
          type="button"
          onClick={() => compare.remove(props.index)}
          className="text-xs px-1.5 py-0.5 rounded border"
          style={{ borderColor: "var(--color-rule)", color: "var(--color-ink-muted)" }}
          aria-label="Remove from bench"
        >
          ×
        </button>
      </span>
    </li>
  );
}

const ManualPicker = observer(function ManualPicker() {
  const { compare } = useAppStore();
  const [d1, setD1] = useState("3");
  const [d2, setD2] = useState("5");
  const [d3, setD3] = useState("8");
  const [modeId, setModeId] = useState<CompareModeId>("standard");
  const [error, setError] = useState<string | null>(null);

  const onAdd = () => {
    const dice = [d1, d2, d3].map((s) => Number.parseInt(s, 10));
    if (dice.some((d) => Number.isNaN(d))) {
      setError("Enter three integers");
      return;
    }
    const result = compare.add(modeId, dice);
    if (!result.ok) setError(result.reason);
    else setError(null);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Manual</h3>
      <div className="grid grid-cols-3 gap-2 mb-2">
        {[d1, d2, d3].map((v, i) => (
          <input
            key={i}
            type="number"
            value={v}
            onChange={(e) => {
              const setter = i === 0 ? setD1 : i === 1 ? setD2 : setD3;
              setter(e.target.value);
            }}
            className="px-2 py-1 text-sm rounded border tabular-nums"
            style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <select
          value={modeId}
          onChange={(e) => setModeId(e.target.value as CompareModeId)}
          className="text-xs rounded border px-2 py-1"
          style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
        >
          <option value="standard">Standard</option>
          <option value="aether">Æther</option>
        </select>
        <button
          type="button"
          onClick={onAdd}
          disabled={compare.isFull}
          className="px-3 py-1 text-xs rounded"
          style={{
            background: compare.isFull ? "var(--color-rule)" : "var(--color-accent)",
            color: "var(--color-bg)",
          }}
        >
          Add
        </button>
      </div>
      {error !== null ? (
        <p className="mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
});

const FavoritePicker = observer(function FavoritePicker() {
  const { compare, explore } = useAppStore();
  const favs = explore.favorites.forMode(explore.modeId);
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Favorites</h3>
      {favs.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
          Star tuples in Explore to bench them here.
        </p>
      ) : (
        <ul className="space-y-1">
          {favs.map((dice) => (
            <li
              key={dice.join(",")}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="font-mono">{dice.join("/")}</span>
              <button
                type="button"
                disabled={compare.isFull}
                onClick={() => compare.add(explore.modeId, dice)}
                className="px-2 py-0.5 text-xs rounded border"
                style={{
                  borderColor: "var(--color-rule)",
                  color: compare.isFull ? "var(--color-ink-muted)" : "var(--color-ink)",
                }}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

function pathFor(
  points: ReadonlyArray<{ x: number; y: number }>,
  xs: (n: number) => number,
  ys: (n: number) => number,
): string {
  if (points.length === 0) return "";
  const pts = [...points].sort((a, b) => a.x - b.x);
  let d = `M ${xs(pts[0]!.x)} ${ys(pts[0]!.y)}`;
  for (let i = 1; i < pts.length; i += 1) {
    d += ` L ${xs(pts[i]!.x)} ${ys(pts[i]!.y)}`;
  }
  return d;
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (max === min) return [min];
  const span = max - min;
  const step = niceStep(span / count);
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) {
    out.push(Math.round(v * 1e6) / 1e6);
  }
  return out;
}

function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const mantissa = rough / base;
  if (mantissa < 1.5) return 1 * base;
  if (mantissa < 3) return 2 * base;
  if (mantissa < 7.5) return 5 * base;
  return 10 * base;
}

function formatTick(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(1);
}
