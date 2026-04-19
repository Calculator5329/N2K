import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext";
import { PageHeader } from "../_shared/PageHeader";
import { Equation } from "../../v1ui/Equation";
import { DifficultyMeter } from "../../v1ui/DifficultyMeter";
import type {
  AetherTuple,
  AetherTupleSummary,
} from "../../core/types";
import { tupleKey } from "../../v1stores/AetherDataStore";
import { AETHER_SAMPLE } from "../../v1services/aetherSample";
import {
  AetherExploreStore,
  PAGE_SIZE,
  type AetherSortField,
  type ArityFilter,
  type SortDir,
} from "./AetherExploreStore";

const ARITY_OPTS: readonly ArityFilter[] = ["all", 3, 4, 5];

/** Compare key extractor for the table sort. */
function sortKey(
  field: AetherSortField,
  tuple: AetherTuple,
  summary: AetherTupleSummary | null,
): number | string {
  switch (field) {
    case "tuple":
      return tupleKey(tuple);
    case "arity":
      return tuple.length;
    case "solvable":
      return summary?.solvableCount ?? -1;
    case "easiest":
      return summary?.minDifficulty ?? Number.POSITIVE_INFINITY;
    case "hardest":
      return summary?.maxDifficulty ?? Number.NEGATIVE_INFINITY;
    case "average":
      return summary?.averageDifficulty ?? Number.POSITIVE_INFINITY;
    case "median":
      return summary?.medianDifficulty ?? Number.POSITIVE_INFINITY;
  }
}

function compare(a: number | string, b: number | string, dir: SortDir): number {
  let res: number;
  if (typeof a === "number" && typeof b === "number") res = a - b;
  else res = String(a).localeCompare(String(b));
  return dir === "asc" ? res : -res;
}

const SortHeader = observer(function SortHeader({
  store,
  field,
  label,
  align = "left",
}: {
  store: AetherExploreStore;
  field: AetherSortField;
  label: string;
  align?: "left" | "right";
}) {
  const active = store.sortField === field;
  const arrow = active ? (store.sortDir === "asc" ? "▲" : "▼") : "";
  return (
    <th
      className={[
        "py-2 px-3 align-bottom border-b border-ink-300/30",
        align === "right" ? "text-right" : "text-left",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => store.setSort(field)}
        className={[
          "label-caps inline-flex items-center gap-1 transition-colors",
          active ? "text-oxblood-500" : "text-ink-200 hover:text-ink-300",
        ].join(" ")}
      >
        <span>{label}</span>
        {active && <span aria-hidden="true">{arrow}</span>}
      </button>
    </th>
  );
});

const ArityFilterBar = observer(function ArityFilterBar({
  store,
}: {
  store: AetherExploreStore;
}) {
  return (
    <div role="tablist" aria-label="Filter by arity" className="flex items-center gap-1">
      {ARITY_OPTS.map((a) => {
        const active = store.arityFilter === a;
        return (
          <button
            key={String(a)}
            role="tab"
            aria-selected={active}
            onClick={() => store.setArityFilter(a)}
            className={[
              "px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide-caps",
              "border transition-colors",
              active
                ? "border-oxblood-500 text-oxblood-500 bg-oxblood-500/5"
                : "border-ink-100/30 text-ink-200 hover:border-ink-200/60",
            ].join(" ")}
            style={{ borderRadius: "2px" }}
          >
            {a === "all" ? "All" : `${a}d`}
          </button>
        );
      })}
    </div>
  );
});

interface RowProps {
  readonly tuple: AetherTuple;
  readonly state: "idle" | "loading" | "ready" | "error";
  readonly summary: AetherTupleSummary | null;
  readonly onWarm: (tuple: AetherTuple) => void;
  readonly onSelect: (tuple: AetherTuple) => void;
  readonly selected: boolean;
}

function Row({ tuple, state, summary, onWarm, onSelect, selected }: RowProps) {
  const stateLabel = state === "loading" ? "solving…" : state === "error" ? "error" : "—";
  const cls = selected
    ? "bg-oxblood-500/5"
    : state === "ready"
      ? ""
      : "opacity-90";
  return (
    <tr
      className={cls}
      onMouseEnter={() => {
        if (state === "idle") onWarm(tuple);
      }}
    >
      <td className="py-2 px-3 border-b border-ink-100/10">
        <button
          type="button"
          onClick={() => {
            onWarm(tuple);
            onSelect(tuple);
          }}
          className="font-mono text-[13px] text-ink-300 hover:text-oxblood-500 text-left"
        >
          [{tuple.join(", ")}]
        </button>
      </td>
      <td className="py-2 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
        {tuple.length}
      </td>
      <td className="py-2 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
        {summary?.solvableCount.toLocaleString() ?? stateLabel}
      </td>
      <td className="py-2 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
        {summary?.minDifficulty?.toFixed(2) ?? stateLabel}
      </td>
      <td className="py-2 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
        {summary?.maxDifficulty?.toFixed(2) ?? stateLabel}
      </td>
      <td className="py-2 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
        {summary?.averageDifficulty?.toFixed(2) ?? stateLabel}
      </td>
      <td className="py-2 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
        {summary?.medianDifficulty?.toFixed(2) ?? stateLabel}
      </td>
    </tr>
  );
}

const SelectionDetail = observer(function SelectionDetail({
  tuple,
}: {
  tuple: AetherTuple;
}) {
  const { aetherData } = useStore();
  const state = aetherData.sweepState(tuple);
  const summary = aetherData.summaryFor(tuple);

  const sweep = state.status === "ready" ? state.value : null;
  const easiest = useMemo(() => {
    if (sweep === null) return null;
    let bestT: number | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const t of sweep.targetsSorted) {
      const d = sweep.cells.get(t)!.difficulty;
      if (d < bestD) {
        bestD = d;
        bestT = t;
      }
    }
    if (bestT === null) return null;
    const cell = sweep.cells.get(bestT)!;
    return { target: bestT, equation: cell.equation, difficulty: cell.difficulty };
  }, [sweep]);

  const hardest = useMemo(() => {
    if (sweep === null) return null;
    let bestT: number | null = null;
    let bestD = Number.NEGATIVE_INFINITY;
    for (const t of sweep.targetsSorted) {
      const d = sweep.cells.get(t)!.difficulty;
      if (d > bestD) {
        bestD = d;
        bestT = t;
      }
    }
    if (bestT === null) return null;
    const cell = sweep.cells.get(bestT)!;
    return { target: bestT, equation: cell.equation, difficulty: cell.difficulty };
  }, [sweep]);

  return (
    <aside
      className="border border-ink-100/15 p-4 bg-paper-50 flex flex-col gap-3"
      style={{ borderRadius: "2px" }}
    >
      <header className="flex items-center justify-between">
        <div>
          <div className="label-caps mb-1">Tuple detail</div>
          <div className="font-mono text-[15px] text-ink-300">[{tuple.join(", ")}]</div>
        </div>
        <div className="text-right font-mono text-[11px] text-ink-100">
          arity {tuple.length}
          {state.status === "ready" && (
            <div>solved in {sweep!.elapsedMs.toFixed(0)}ms</div>
          )}
        </div>
      </header>

      {state.status === "loading" && (
        <div className="font-mono text-[12px] text-ink-100 py-6 text-center">
          Solving sweep…
        </div>
      )}
      {state.status === "error" && (
        <div className="font-mono text-[12px] text-oxblood-500 py-6 text-center">
          {state.error}
        </div>
      )}

      {summary !== null && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[12px]">
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
        </dl>
      )}

      {easiest !== null && (
        <section>
          <div className="label-caps mb-1">Easiest target</div>
          <div className="font-mono text-[13px] text-ink-300 mb-1">
            <span className="text-ink-100">target {easiest.target}</span> ·{" "}
            <Equation equation={easiest.equation} size="inline" />
          </div>
          <DifficultyMeter difficulty={easiest.difficulty} />
        </section>
      )}

      {hardest !== null && (
        <section>
          <div className="label-caps mb-1">Hardest solvable target</div>
          <div className="font-mono text-[13px] text-ink-300 mb-1">
            <span className="text-ink-100">target {hardest.target}</span> ·{" "}
            <Equation equation={hardest.equation} size="inline" />
          </div>
          <DifficultyMeter difficulty={hardest.difficulty} />
        </section>
      )}
    </aside>
  );
});

export const AetherExploreView = observer(function AetherExploreView() {
  const { aetherData } = useStore();
  const store = useMemo(() => new AetherExploreStore(), []);
  const [selected, setSelected] = useState<AetherTuple | null>(null);

  // Snapshot summaries / states for every base tuple so the sort sees
  // current data. Reading inside the observer wires up MobX deps.
  const decorated = useMemo(() => {
    void aetherData.cacheTick;
    return store.baseTuples.map((tuple) => {
      const state = aetherData.sweepState(tuple);
      const summary = aetherData.summaryFor(tuple);
      return { tuple, state: state.status, summary };
    });
  }, [
    aetherData,
    aetherData.cacheTick,
    store.baseTuples,
  ]);

  const sorted = useMemo(() => {
    const dir = store.sortDir;
    const field = store.sortField;
    const arr = [...decorated];
    arr.sort((a, b) => compare(sortKey(field, a.tuple, a.summary), sortKey(field, b.tuple, b.summary), dir));
    return arr;
  }, [decorated, store.sortDir, store.sortField]);

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(store.page, pages - 1);
  const slice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Auto-warm visible page so columns fill in as the user scrolls.
  useEffect(() => {
    for (const row of slice) {
      if (row.state === "idle") void aetherData.ensureSweep(row.tuple);
    }
  }, [aetherData, page, slice.map((r) => tupleKey(r.tuple)).join("|")]);

  function warm(tuple: AetherTuple): void {
    void aetherData.ensureSweep(tuple);
  }

  function select(tuple: AetherTuple): void {
    setSelected(tuple);
  }

  return (
    <article>
      <PageHeader
        folio="II"
        eyebrow="The Æther Survey"
        title={
          <>
            <span
              className="italic text-oxblood-500"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}
            >
              {AETHER_SAMPLE.length.toLocaleString()}
            </span>{" "}
            tuples, sampled.
          </>
        }
        dek="A representative slice of the Æther universe across arities 3–5. Stats land as you browse — hover or click any tuple to solve its full 1..5,000 sweep, or type your own dice (e.g. `2 3 5` or `−1, 7, 11`) to inject a custom row."
      />

      <section className="mb-6 flex items-end gap-4 flex-wrap">
        <label className="flex flex-col gap-1">
          <span className="label-caps">Search a tuple</span>
          <input
            type="text"
            value={store.query}
            onChange={(e) => store.setQuery(e.target.value)}
            placeholder="e.g. 2 3 5  or  -1, 7, 11"
            className="w-72 px-2 py-1.5 text-[13px] font-mono bg-paper-50 border border-ink-100/30 text-ink-300 focus:outline-none focus:border-oxblood-500"
            style={{ borderRadius: "2px" }}
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="label-caps">Arity</span>
          <ArityFilterBar store={store} />
        </div>
        <div className="ml-auto font-mono text-[11px] text-ink-100">
          {total.toLocaleString()} tuples · page {page + 1} of {pages}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] items-start">
        <div className="overflow-x-auto border border-ink-100/15">
          <table className="w-full">
            <thead>
              <tr className="bg-paper-100/40">
                <SortHeader store={store} field="tuple" label="Tuple" />
                <SortHeader store={store} field="arity" label="Arity" align="right" />
                <SortHeader store={store} field="solvable" label="Solvable" align="right" />
                <SortHeader store={store} field="easiest" label="Easiest" align="right" />
                <SortHeader store={store} field="hardest" label="Hardest" align="right" />
                <SortHeader store={store} field="average" label="Avg" align="right" />
                <SortHeader store={store} field="median" label="Median" align="right" />
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <Row
                  key={tupleKey(row.tuple)}
                  tuple={row.tuple}
                  state={row.state}
                  summary={row.summary}
                  onWarm={warm}
                  onSelect={select}
                  selected={selected !== null && tupleKey(selected) === tupleKey(row.tuple)}
                />
              ))}
              {slice.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center font-mono text-[12px] text-ink-100">
                    No tuples match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <nav
            className="flex items-center justify-between gap-2 px-3 py-2 border-t border-ink-100/15 bg-paper-100/30"
            aria-label="Pagination"
          >
            <button
              type="button"
              onClick={() => store.setPage(page - 1)}
              disabled={page === 0}
              className="px-3 py-1 text-[11px] font-mono uppercase tracking-wide-caps border border-ink-100/30 text-ink-200 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ borderRadius: "2px" }}
            >
              ← Prev
            </button>
            <div className="font-mono text-[11px] text-ink-100">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
            </div>
            <button
              type="button"
              onClick={() => store.setPage(page + 1)}
              disabled={page >= pages - 1}
              className="px-3 py-1 text-[11px] font-mono uppercase tracking-wide-caps border border-ink-100/30 text-ink-200 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ borderRadius: "2px" }}
            >
              Next →
            </button>
          </nav>
        </div>

        {selected !== null ? (
          <SelectionDetail tuple={selected} />
        ) : (
          <aside
            className="border border-dashed border-ink-100/30 p-6 text-center"
            style={{ borderRadius: "2px" }}
          >
            <p
              className="font-display text-[20px] italic text-ink-200 leading-snug"
              style={{ fontVariationSettings: '"opsz" 100, "SOFT" 80, "WONK" 1' }}
            >
              Click a tuple for the easiest / hardest equations and a per-difficulty rollup.
            </p>
          </aside>
        )}
      </div>

    </article>
  );
});
