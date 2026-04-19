import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { ADV_DICE_RANGE, ADV_TARGET_RANGE } from "@solver/core/constants.js";
import { useStore } from "../../v1stores/storeContext";
import { PageHeader } from "../_shared/PageHeader";
import { paletteFor } from "./difficultyScale";
import type {
  AetherArity,
  AetherTuple,
} from "../../core/types";
import { tupleKey, type AetherTupleSweep } from "../../v1stores/AetherDataStore";
import { AETHER_SAMPLE } from "../../v1services/aetherSample";

/**
 * Visualize, Æther flavour.
 *
 * Two stacked sections:
 *
 *   1. Single-tuple difficulty band — pick (or accept the default)
 *      tuple, see a 1×5,000 heatmap of its difficulty across every
 *      target, plus a 20-bin histogram and the easiest/hardest cells.
 *
 *   2. Sampled atlas — opt-in compute over a configurable subset of
 *      the 1,000-tuple sample. Shows running progress while sweeps
 *      land, then an aggregate "average difficulty per target"
 *      curve over the 1..5,000 axis.
 *
 * The atlas is opt-in because even a 50-tuple aggregate kicks the
 * worker pool for several seconds. Dropping the user straight into a
 * heavy compute on tab open would feel rude.
 */

const ARITY_OPTIONS: readonly AetherArity[] = [3, 4, 5];
const HISTOGRAM_BINS = 20;
const ATLAS_SIZES = [25, 50, 100, 200] as const;

function useDifficultyPalette() {
  const { theme } = useStore();
  return useMemo(() => paletteFor(theme.theme), [theme.theme]);
}

// ---------------------------------------------------------------------------
//  Tuple picker (compact)
// ---------------------------------------------------------------------------

const TuplePicker = observer(function TuplePicker({
  tuple,
  onChange,
}: {
  tuple: AetherTuple;
  onChange: (next: AetherTuple) => void;
}) {
  const arity = tuple.length as AetherArity;
  function clamp(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(ADV_DICE_RANGE.min, Math.min(ADV_DICE_RANGE.max, Math.round(v)));
  }
  function setArity(a: AetherArity): void {
    if (a === arity) return;
    const next = [...tuple];
    while (next.length < a) next.push(next[next.length - 1] ?? 1);
    next.length = a;
    onChange([...next].sort((x, y) => x - y));
  }
  function setDie(i: number, v: number): void {
    const next = [...tuple];
    next[i] = clamp(v);
    onChange([...next].sort((x, y) => x - y));
  }
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div className="flex flex-col gap-1">
        <span className="label-caps">Arity</span>
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
      </div>
      <div className="flex flex-col gap-1">
        <span className="label-caps">Dice</span>
        <div className="flex items-center gap-1">
          {tuple.map((v, i) => (
            <input
              key={i}
              type="number"
              min={ADV_DICE_RANGE.min}
              max={ADV_DICE_RANGE.max}
              step={1}
              value={v}
              onChange={(e) => setDie(i, Number(e.target.value))}
              aria-label={`Die ${i + 1}`}
              className="w-14 px-1.5 py-1 text-center text-[13px] font-mono bg-paper-50 border border-ink-100/30 text-ink-300 focus:outline-none focus:border-oxblood-500"
              style={{ borderRadius: "2px" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Single-tuple difficulty band
// ---------------------------------------------------------------------------

function DifficultyBand({ sweep }: { sweep: AetherTupleSweep }) {
  const palette = useDifficultyPalette();
  const min = ADV_TARGET_RANGE.min;
  const max = ADV_TARGET_RANGE.max;
  const span = max - min + 1;

  // Render as one wide canvas-style strip: 1px per target wide,
  // 32px tall, flat-coloured by difficulty.
  const width = 1000;
  const height = 32;
  const cellW = width / span;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Difficulty band for tuple [${sweep.tuple.join(", ")}]`}
      className="block w-full"
      preserveAspectRatio="none"
    >
      {/* Background = "unsolvable" tone */}
      <rect x={0} y={0} width={width} height={height} fill="rgb(var(--ink-100) / 0.08)" />
      {sweep.targetsSorted.map((t, i) => {
        const cell = sweep.cells.get(t)!;
        const x = ((t - min) / span) * width;
        return (
          <rect
            key={i}
            x={x}
            y={0}
            width={Math.max(cellW, 0.5)}
            height={height}
            fill={palette.colorForDifficulty(cell.difficulty)}
          />
        );
      })}
    </svg>
  );
}

function DifficultyHistogram({ sweep }: { sweep: AetherTupleSweep }) {
  const palette = useDifficultyPalette();
  const bins = useMemo(() => {
    const out = new Array(HISTOGRAM_BINS).fill(0) as number[];
    for (const cell of sweep.cells.values()) {
      const idx = Math.min(
        HISTOGRAM_BINS - 1,
        Math.max(0, Math.floor((cell.difficulty / 100) * HISTOGRAM_BINS)),
      );
      out[idx] = (out[idx] ?? 0) + 1;
    }
    return out;
  }, [sweep]);
  const maxCount = bins.reduce((m, c) => Math.max(m, c), 0);
  const width = 600;
  const height = 120;
  const padBottom = 18;
  const innerH = height - padBottom;
  const barW = width / HISTOGRAM_BINS;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" preserveAspectRatio="none" role="img" aria-label="Distribution of difficulty across solved targets">
      {bins.map((count, i) => {
        const h = maxCount === 0 ? 0 : (count / maxCount) * innerH;
        const x = i * barW;
        const y = innerH - h;
        const midDifficulty = (i + 0.5) * (100 / HISTOGRAM_BINS);
        return (
          <g key={i}>
            <rect
              x={x + 1}
              y={y}
              width={Math.max(barW - 2, 1)}
              height={h}
              fill={palette.colorForDifficulty(midDifficulty)}
              opacity={0.9}
            />
          </g>
        );
      })}
      <line x1={0} x2={width} y1={innerH} y2={innerH} stroke="rgb(var(--ink-100) / 0.3)" />
      {[0, 25, 50, 75, 100].map((label) => {
        const x = (label / 100) * width;
        return (
          <text
            key={label}
            x={x}
            y={innerH + 14}
            textAnchor="middle"
            style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)", fill: "rgb(var(--ink-100))" }}
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

const SingleTupleSection = observer(function SingleTupleSection() {
  const { aetherData } = useStore();
  const [tuple, setTuple] = useState<AetherTuple>([2, 3, 5]);

  useEffect(() => {
    void aetherData.ensureSweep(tuple);
  }, [aetherData, tupleKey(tuple)]);

  const state = aetherData.sweepState(tuple);
  const summary = aetherData.summaryFor(tuple);

  return (
    <section className="flex flex-col gap-4 mb-12">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="label-caps mb-1">Single-tuple difficulty band</div>
          <p className="font-display text-[20px] italic text-ink-200 leading-snug max-w-2xl" style={{ fontVariationSettings: '"opsz" 100, "SOFT" 80, "WONK" 1' }}>
            Every target in <span className="text-ink-300">1..{ADV_TARGET_RANGE.max.toLocaleString()}</span>, coloured by the easiest difficulty this tuple can hit.
          </p>
        </div>
        <TuplePicker tuple={tuple} onChange={setTuple} />
      </header>

      {state.status === "loading" && (
        <div className="font-mono text-[12px] text-ink-100 py-12 text-center border border-dashed border-ink-100/30" style={{ borderRadius: "2px" }}>
          Solving sweep…
        </div>
      )}
      {state.status === "error" && (
        <div className="font-mono text-[12px] text-oxblood-500 py-12 text-center border border-dashed border-oxblood-500/30" style={{ borderRadius: "2px" }}>
          {state.error}
        </div>
      )}
      {state.status === "ready" && (
        <>
          <div className="border border-ink-100/15 p-3 bg-paper-50" style={{ borderRadius: "2px" }}>
            <DifficultyBand sweep={state.value} />
            <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-100">
              <span>{ADV_TARGET_RANGE.min.toLocaleString()}</span>
              <span>{Math.round(ADV_TARGET_RANGE.max / 2).toLocaleString()}</span>
              <span>{ADV_TARGET_RANGE.max.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
            <div className="border border-ink-100/15 p-3 bg-paper-50" style={{ borderRadius: "2px" }}>
              <div className="label-caps mb-2">Difficulty distribution</div>
              <DifficultyHistogram sweep={state.value} />
            </div>
            {summary !== null && (
              <dl className="border border-ink-100/15 p-3 grid grid-cols-2 gap-y-1 font-mono text-[12px] bg-paper-50" style={{ borderRadius: "2px" }}>
                <dt className="text-ink-100">Solvable</dt>
                <dd className="text-right text-ink-300">
                  {summary.solvableCount.toLocaleString()} / {(summary.solvableCount + summary.impossibleCount).toLocaleString()}
                </dd>
                <dt className="text-ink-100">Easiest</dt>
                <dd className="text-right text-ink-300">{summary.minDifficulty?.toFixed(2) ?? "—"}</dd>
                <dt className="text-ink-100">Hardest</dt>
                <dd className="text-right text-ink-300">{summary.maxDifficulty?.toFixed(2) ?? "—"}</dd>
                <dt className="text-ink-100">Average</dt>
                <dd className="text-right text-ink-300">{summary.averageDifficulty?.toFixed(2) ?? "—"}</dd>
                <dt className="text-ink-100">Median</dt>
                <dd className="text-right text-ink-300">{summary.medianDifficulty?.toFixed(2) ?? "—"}</dd>
                <dt className="text-ink-100">Solved in</dt>
                <dd className="text-right text-ink-300">{state.value.elapsedMs.toFixed(0)} ms</dd>
              </dl>
            )}
          </div>
        </>
      )}
    </section>
  );
});

// ---------------------------------------------------------------------------
//  Sampled atlas (opt-in aggregate)
// ---------------------------------------------------------------------------

interface AggregateCurve {
  readonly readyCount: number;
  readonly avgPerBucket: readonly { mid: number; avg: number | null }[];
  readonly coverage: readonly number[];
}

const BUCKET = 250;

function aggregateSample(
  tuples: readonly AetherTuple[],
  sweepStateOf: (t: AetherTuple) => { status: string; value?: AetherTupleSweep },
): AggregateCurve {
  const min = ADV_TARGET_RANGE.min;
  const max = ADV_TARGET_RANGE.max;
  const buckets = Math.ceil((max - min + 1) / BUCKET);
  const sums = new Array(buckets).fill(0) as number[];
  const counts = new Array(buckets).fill(0) as number[];
  const coverage = new Array(buckets).fill(0) as number[];

  let readyCount = 0;
  for (const tuple of tuples) {
    const s = sweepStateOf(tuple);
    if (s.status !== "ready" || s.value === undefined) continue;
    readyCount += 1;
    for (const t of s.value.targetsSorted) {
      const idx = Math.floor((t - min) / BUCKET);
      sums[idx]! += s.value.cells.get(t)!.difficulty;
      counts[idx]! += 1;
      coverage[idx]! += 1;
    }
  }

  const avgPerBucket = sums.map((sum, i) => ({
    mid: min + i * BUCKET + BUCKET / 2,
    avg: counts[i] === 0 ? null : sum / counts[i]!,
  }));

  return { readyCount, avgPerBucket, coverage };
}

function AggregateChart({ curve, totalSelected }: { curve: AggregateCurve; totalSelected: number }) {
  const palette = useDifficultyPalette();
  const width = 1000;
  const height = 240;
  const margin = { top: 12, right: 16, bottom: 28, left: 56 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const xMin = ADV_TARGET_RANGE.min;
  const xMax = ADV_TARGET_RANGE.max;
  const x = (v: number) => margin.left + ((v - xMin) / (xMax - xMin)) * innerW;
  const y = (v: number) => margin.top + (1 - v / 100) * innerH;

  const points = curve.avgPerBucket
    .filter((b) => b.avg !== null)
    .map((b) => `${x(b.mid)},${y(b.avg!)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" preserveAspectRatio="none" role="img" aria-label="Average difficulty per target bucket across the sample">
      {[0, 25, 50, 75, 100].map((t) => (
        <g key={t}>
          <line
            x1={margin.left}
            x2={margin.left + innerW}
            y1={y(t)}
            y2={y(t)}
            stroke="rgb(var(--ink-100) / 0.18)"
            strokeWidth={t === 0 || t === 100 ? 1 : 0.5}
            strokeDasharray={t === 0 || t === 100 ? undefined : "2 3"}
          />
          <text x={margin.left - 6} y={y(t) + 3} textAnchor="end" style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)", fill: "rgb(var(--ink-100))" }}>
            {t}
          </text>
        </g>
      ))}
      {/* Per-bucket coloured tiles to show coverage density */}
      {curve.avgPerBucket.map((b, i) => {
        if (b.avg === null) return null;
        return (
          <rect
            key={i}
            x={x(b.mid - BUCKET / 2)}
            y={y(b.avg)}
            width={(BUCKET / (xMax - xMin)) * innerW}
            height={Math.max(0, innerH - (y(b.avg) - margin.top))}
            fill={palette.colorForDifficulty(b.avg)}
            opacity={0.4}
          />
        );
      })}
      <polyline points={points} fill="none" stroke="rgb(var(--accent-500))" strokeWidth={1.6} />
      {[xMin, Math.round(xMax * 0.25), Math.round(xMax * 0.5), Math.round(xMax * 0.75), xMax].map((t) => (
        <text key={t} x={x(t)} y={margin.top + innerH + 16} textAnchor="middle" style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)", fill: "rgb(var(--ink-100))" }}>
          {t.toLocaleString()}
        </text>
      ))}
      <text x={12} y={margin.top + innerH / 2} transform={`rotate(-90 12 ${margin.top + innerH / 2})`} textAnchor="middle" style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--font-mono, monospace)", fill: "rgb(var(--ink-100))" }}>
        Avg difficulty
      </text>
      <text x={width - margin.right} y={margin.top + 12} textAnchor="end" style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)", fill: "rgb(var(--ink-100))" }}>
        {curve.readyCount}/{totalSelected} tuples
      </text>
    </svg>
  );
}

const SampledAtlasSection = observer(function SampledAtlasSection() {
  const { aetherData } = useStore();
  const [size, setSize] = useState<number | null>(null);
  const [arity, setArity] = useState<"all" | AetherArity>("all");

  // Take the first `size` tuples from the sample, optionally filtered by arity.
  const selected = useMemo(() => {
    if (size === null) return [];
    let pool = AETHER_SAMPLE.slice();
    if (arity !== "all") pool = pool.filter((t) => t.length === arity);
    return pool.slice(0, size);
  }, [size, arity]);

  // Kick off sweeps for all selected tuples on mount / change. The
  // worker pool will service them N at a time; ensureSweep dedupes.
  useEffect(() => {
    for (const tuple of selected) void aetherData.ensureSweep(tuple);
  }, [aetherData, selected.map((t) => tupleKey(t)).join("|")]);

  const curve = useMemo(() => {
    void aetherData.cacheTick;
    return aggregateSample(selected, (t) => aetherData.sweepState(t) as { status: string; value?: AetherTupleSweep });
  }, [aetherData, aetherData.cacheTick, selected]);

  const ready = curve.readyCount;
  const total = selected.length;
  const pct = total === 0 ? 0 : (ready / total) * 100;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="label-caps mb-1">Sampled atlas</div>
          <p className="font-display text-[20px] italic text-ink-200 leading-snug max-w-2xl" style={{ fontVariationSettings: '"opsz" 100, "SOFT" 80, "WONK" 1' }}>
            Pool a slice of the sample and watch the aggregate difficulty curve fill in as the workers churn.
          </p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="label-caps">Arity</span>
            <div className="flex items-center gap-1">
              {(["all", 3, 4, 5] as const).map((a) => {
                const active = a === arity;
                return (
                  <button
                    key={String(a)}
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
                    {a === "all" ? "All" : `${a}d`}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="label-caps">Sample size</span>
            <div className="flex items-center gap-1">
              {ATLAS_SIZES.map((n) => {
                const active = size === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSize(n)}
                    className={[
                      "px-2 py-1 text-[11px] font-mono uppercase",
                      "border transition-colors",
                      active
                        ? "border-oxblood-500 text-oxblood-500"
                        : "border-ink-100/30 text-ink-200 hover:border-ink-200/60",
                    ].join(" ")}
                    style={{ borderRadius: "2px" }}
                  >
                    {n}
                  </button>
                );
              })}
              {size !== null && (
                <button
                  type="button"
                  onClick={() => setSize(null)}
                  className="px-2 py-1 text-[11px] font-mono uppercase text-ink-100 hover:text-oxblood-500"
                  title="Clear selection"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {size === null ? (
        <div className="border border-dashed border-ink-100/30 px-6 py-12 text-center" style={{ borderRadius: "2px" }}>
          <p className="font-display text-[18px] italic text-ink-200" style={{ fontVariationSettings: '"opsz" 100, "SOFT" 80, "WONK" 1' }}>
            Pick a sample size to begin computing the aggregate.
          </p>
          <p className="mt-2 font-mono text-[11px] text-ink-100">
            Each tuple is solved on a Web Worker — expect roughly 0.5–4 seconds per tuple depending on arity.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="border border-ink-100/15 p-3 bg-paper-50" style={{ borderRadius: "2px" }}>
            <div className="flex items-center justify-between font-mono text-[11px] text-ink-100 mb-2">
              <span>Computing {ready.toLocaleString()} / {total.toLocaleString()} tuples</span>
              <span>{pct.toFixed(0)}%</span>
            </div>
            <div className="w-full h-2 bg-ink-100/10" style={{ borderRadius: "2px" }}>
              <div
                className="h-full bg-oxblood-500 transition-all"
                style={{ width: `${pct}%`, borderRadius: "2px" }}
              />
            </div>
          </div>
          <div className="border border-ink-100/15 p-3 bg-paper-50" style={{ borderRadius: "2px" }}>
            {ready === 0 ? (
              <div className="font-mono text-[12px] text-ink-100 py-12 text-center">
                Waiting on first sweep…
              </div>
            ) : (
              <AggregateChart curve={curve} totalSelected={total} />
            )}
          </div>
        </div>
      )}
    </section>
  );
});

// ---------------------------------------------------------------------------
//  Top-level
// ---------------------------------------------------------------------------

export const AetherVisualizeView = observer(function AetherVisualizeView() {
  return (
    <article>
      <PageHeader
        folio="IV"
        eyebrow="The Æther Atlas"
        title={
          <>
            <span
              className="italic text-oxblood-500"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}
            >
              Five thousand
            </span>{" "}
            targets, charted.
          </>
        }
        dek="Two views over the wider Æther space: a single-tuple difficulty band you can dial in by arity and dice, and an opt-in sampled atlas that aggregates a slice of the canonical sample on demand."
      />
      <SingleTupleSection />
      <SampledAtlasSection />
    </article>
  );
});
