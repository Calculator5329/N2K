import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext";
import { DiceGlyph } from "../../v1ui/DiceGlyph";
import { DifficultyMeter } from "../../v1ui/DifficultyMeter";
import { Equation } from "../../v1ui/Equation";
import { FavoriteToggle } from "../../v1ui/FavoriteToggle";
import { PageHeader } from "../_shared/PageHeader";
import { ExploreStore, type SortKey } from "./ExploreStore";
import type { DiceSummary, DiceTriple } from "../../core/types";
import { AetherExploreView } from "./AetherExploreView";

const COLUMNS: ReadonlyArray<{
  key: SortKey;
  label: string;
  align: "left" | "right";
  width: string;
}> = [
  { key: "dice",              label: "Dice",        align: "left",  width: "16rem" },
  { key: "solvableCount",     label: "Solvable",    align: "right", width: "7rem" },
  { key: "averageDifficulty", label: "Avg",         align: "right", width: "7rem" },
  { key: "minDifficulty",     label: "Easiest",     align: "right", width: "7rem" },
  { key: "maxDifficulty",     label: "Hardest",     align: "right", width: "7rem" },
];

// ---------------------------------------------------------------------------
//  Sort header — single click sets primary; shift-click adds/flips
// ---------------------------------------------------------------------------

const ColumnHeader = observer(function ColumnHeader({
  store,
  col,
}: {
  store: ExploreStore;
  col: (typeof COLUMNS)[number];
}) {
  const position = store.sortPosition(col.key);
  const dir = store.sortDirOf(col.key);
  const active = position > 0;
  const isPrimary = position === 1;
  return (
    <th
      style={{ width: col.width }}
      className={[
        "py-3 px-3 align-bottom border-b border-ink-300/30",
        col.align === "right" ? "text-right" : "text-left",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={(e) => {
          if (e.shiftKey) store.toggleSecondarySort(col.key);
          else store.setPrimarySort(col.key);
        }}
        title={
          active
            ? "Click to make primary · Shift-click to flip direction · Right-click to remove"
            : "Click to sort · Shift-click to add as secondary"
        }
        onContextMenu={(e) => {
          // Right-click removes the column from the sort stack (if it isn't
          // the only criterion). Bail out gracefully if we'd leave an
          // empty stack.
          if (active && store.sorts.length > 1) {
            e.preventDefault();
            store.removeSort(col.key);
          }
        }}
        className={[
          "label-caps inline-flex items-baseline gap-1",
          isPrimary
            ? "text-oxblood-500"
            : active
              ? "text-ink-300"
              : "text-ink-100 hover:text-ink-300",
        ].join(" ")}
      >
        {col.label}
        {active && (
          <span aria-hidden="true" className="inline-flex items-baseline gap-0.5">
            <span>{dir === "asc" ? "↑" : "↓"}</span>
            {store.sorts.length > 1 && (
              <span
                className={[
                  "ml-0.5 inline-block min-w-[12px] text-center font-mono text-[9px] leading-none",
                  "border border-current rounded-sm px-0.5 py-[1px]",
                  "tabular",
                ].join(" ")}
              >
                {position}
              </span>
            )}
          </span>
        )}
      </button>
    </th>
  );
});

// ---------------------------------------------------------------------------
//  Filter toolbar
// ---------------------------------------------------------------------------

const FilterToolbar = observer(function FilterToolbar({
  store,
}: {
  store: ExploreStore;
}) {
  const f = store.filters;
  const setNullableNumber = (
    raw: string,
    apply: (n: number | null) => void,
  ): void => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      apply(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return;
    apply(n);
  };

  return (
    <div
      className={[
        "mb-4 flex flex-wrap items-center gap-x-4 gap-y-3",
        "px-3 py-3 border border-ink-100/15 bg-paper-100/40",
      ].join(" ")}
      style={{ borderRadius: "2px" }}
    >
      <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide-caps text-ink-200">
        <input
          type="checkbox"
          checked={f.favoritesOnly}
          onChange={(e) => store.setFavoritesOnly(e.target.checked)}
          className="accent-oxblood-500"
        />
        Favorites only
      </label>

      <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide-caps text-ink-200">
        Min&nbsp;solvable
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={999}
          step={1}
          value={f.minSolvable ?? ""}
          placeholder="0"
          onChange={(e) =>
            setNullableNumber(e.target.value, (n) => store.setMinSolvable(n))
          }
          className="w-16 px-2 py-1 text-[12px] font-mono bg-paper-50 border border-ink-100/30 text-ink-300 focus:outline-none focus:border-oxblood-500"
          style={{ borderRadius: "2px" }}
        />
      </label>

      <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide-caps text-ink-200">
        Avg&nbsp;diff
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          value={f.minAvgDifficulty ?? ""}
          placeholder="0"
          onChange={(e) =>
            setNullableNumber(e.target.value, (n) =>
              store.setAvgDifficultyRange(n, f.maxAvgDifficulty),
            )
          }
          className="w-14 px-2 py-1 text-[12px] font-mono bg-paper-50 border border-ink-100/30 text-ink-300 focus:outline-none focus:border-oxblood-500"
          style={{ borderRadius: "2px" }}
        />
        <span className="text-ink-100">–</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          value={f.maxAvgDifficulty ?? ""}
          placeholder="100"
          onChange={(e) =>
            setNullableNumber(e.target.value, (n) =>
              store.setAvgDifficultyRange(f.minAvgDifficulty, n),
            )
          }
          className="w-14 px-2 py-1 text-[12px] font-mono bg-paper-50 border border-ink-100/30 text-ink-300 focus:outline-none focus:border-oxblood-500"
          style={{ borderRadius: "2px" }}
        />
      </label>

      {store.hasActiveFilters && (
        <button
          type="button"
          onClick={() => store.resetFilters()}
          className="ml-auto font-mono text-[11px] uppercase tracking-wide-caps text-ink-100 hover:text-oxblood-500"
        >
          Reset filters
        </button>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Saved views menu
// ---------------------------------------------------------------------------

const SavedViewsMenu = observer(function SavedViewsMenu({
  store,
}: {
  store: ExploreStore;
}) {
  const [open, setOpen] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const views = store.savedViews;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide-caps",
          "border border-ink-100/30 bg-paper-50 text-ink-300 hover:border-oxblood-500/60",
        ].join(" ")}
        style={{ borderRadius: "2px" }}
      >
        Views ({views.length})
      </button>
      {open && (
        <div
          className={[
            "absolute right-0 z-20 mt-1 w-72 p-3 shadow-lg",
            "border border-ink-100/30 bg-paper-50",
          ].join(" ")}
          style={{ borderRadius: "2px" }}
        >
          <div className="mb-3">
            <div className="label-caps mb-1.5">Save current</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = pendingName.trim();
                if (trimmed.length === 0) return;
                store.saveCurrentView(trimmed);
                setPendingName("");
              }}
              className="flex gap-1.5"
            >
              <input
                type="text"
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
                placeholder="View name"
                className="flex-1 px-2 py-1 text-[12px] font-mono bg-paper-100 border border-ink-100/30 text-ink-300 focus:outline-none focus:border-oxblood-500"
                style={{ borderRadius: "2px" }}
              />
              <button
                type="submit"
                disabled={pendingName.trim().length === 0}
                className={[
                  "px-2 py-1 text-[11px] font-mono uppercase tracking-wide-caps",
                  "border border-oxblood-500/60 text-oxblood-500",
                  "disabled:opacity-30 disabled:cursor-not-allowed",
                ].join(" ")}
                style={{ borderRadius: "2px" }}
              >
                Save
              </button>
            </form>
          </div>

          <div className="label-caps mb-1.5">Saved</div>
          {views.length === 0 ? (
            <div className="font-mono text-[11px] text-ink-100 italic">
              No saved views yet.
            </div>
          ) : (
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {views.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-2 group"
                >
                  <button
                    type="button"
                    onClick={() => {
                      store.applyView(v.id);
                      setOpen(false);
                    }}
                    className="flex-1 text-left px-2 py-1 text-[12px] font-mono text-ink-300 hover:text-oxblood-500 hover:bg-paper-100 truncate"
                    style={{ borderRadius: "2px" }}
                    title={v.name}
                  >
                    {v.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => store.deleteView(v.id)}
                    aria-label={`Delete view ${v.name}`}
                    className="px-1.5 py-1 text-[11px] font-mono text-ink-100 opacity-0 group-hover:opacity-100 hover:text-oxblood-500"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Row + Drilldown (mostly unchanged from the pre-Phase-3 view)
// ---------------------------------------------------------------------------

const Row = observer(function Row({
  row,
  selected,
  onSelect,
}: {
  row: DiceSummary;
  selected: boolean;
  onSelect: (dice: DiceTriple) => void;
}) {
  return (
    <tr
      onClick={() => onSelect(row.dice)}
      className={[
        "cursor-pointer transition-colors",
        selected
          ? "bg-paper-200/60"
          : "hover:bg-paper-100/70",
      ].join(" ")}
    >
      <td className="py-2.5 px-2 border-b border-ink-100/10 text-center">
        <FavoriteToggle dice={row.dice} size="sm" />
      </td>
      <td className="py-2.5 px-3 border-b border-ink-100/10">
        <DiceGlyph dice={row.dice} size="sm" emphasis={selected ? "active" : "default"} />
      </td>
      <td className="py-2.5 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
        {row.solvableCount}
      </td>
      <td className="py-2.5 px-3 border-b border-ink-100/10 text-right">
        <DifficultyMeter difficulty={row.averageDifficulty} size="sm" />
      </td>
      <td className="py-2.5 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
        {row.minDifficulty?.toFixed(2) ?? "—"}
      </td>
      <td className="py-2.5 px-3 border-b border-ink-100/10 text-right font-mono tabular text-ink-300">
        {row.maxDifficulty?.toFixed(2) ?? "—"}
      </td>
    </tr>
  );
});

const Drilldown = observer(function Drilldown({
  dice,
}: {
  dice: DiceTriple;
}) {
  const { data, compare } = useStore();
  const detailState = data.diceState(dice);

  useEffect(() => {
    data.ensureDice(dice);
  }, [data, dice]);

  if (detailState.status === "loading" || detailState.status === "idle") {
    return (
      <div
        className="font-mono text-[12px] text-ink-100"
        role="status"
        aria-live="polite"
      >
        Loading solutions for {dice.join("·")}…
      </div>
    );
  }
  if (detailState.status === "error") {
    return <div className="font-mono text-oxblood-500">Failed to load solutions.</div>;
  }
  const detail = detailState.value;
  const inCompare = compare.has(dice);
  const compareDisabled = !inCompare && compare.isFull;

  // Two showcases — easiest (gentlest equations to read) and hardest
  // (the brutal edges of this triple's solvable range). Both are
  // cropped to a small N so they fit side by side on wider viewports
  // without overwhelming the page; on narrow viewports they stack.
  const SHOWCASE_LEN = 8;
  const entries = Object.entries(detail.solutions).map(([total, sol]) => ({
    total: Number(total),
    ...sol,
  }));
  entries.sort((a, b) => a.difficulty - b.difficulty);
  const easiest = entries.slice(0, SHOWCASE_LEN);
  const hardest = entries.slice(-SHOWCASE_LEN).reverse();

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-2">
          <DiceGlyph dice={dice} size="md" emphasis="active" />
          <h3
            className="font-display text-[28px] text-ink-500 leading-none"
            style={{ fontVariationSettings: '"opsz" 100, "SOFT" 30' }}
          >
            Easiest &amp; hardest
          </h3>
          <button
            type="button"
            onClick={() => compare.toggle(dice)}
            disabled={compareDisabled}
            aria-pressed={inCompare}
            title={
              inCompare
                ? "Remove from comparison"
                : compareDisabled
                  ? "Comparison set is full"
                  : "Add to comparison"
            }
            className={[
              "ml-auto px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide-caps",
              "border transition-colors",
              inCompare
                ? "border-oxblood-500 bg-oxblood-500/10 text-oxblood-500"
                : "border-ink-100/30 text-ink-200 hover:border-oxblood-500/60",
              compareDisabled ? "opacity-30 cursor-not-allowed" : "",
            ].join(" ")}
            style={{ borderRadius: "2px" }}
          >
            {inCompare ? "✓ In compare" : "+ Compare"}
          </button>
        </div>
        <div className="font-mono text-[11px] tracking-wide-caps uppercase text-ink-100">
          {detail.summary.solvableCount} solvable
          <span className="mx-2 text-ink-100/50">·</span>
          {detail.summary.impossibleCount} impossible
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-6">
        <DrilldownColumn label={`Top ${easiest.length} easiest`} entries={easiest} />
        <DrilldownColumn label={`Top ${hardest.length} hardest`} entries={hardest} />
      </div>
    </div>
  );
});

interface DrilldownEntry {
  readonly total: number;
  readonly equation: string;
  readonly difficulty: number;
}

function DrilldownColumn({
  label,
  entries,
}: {
  label: string;
  entries: readonly DrilldownEntry[];
}) {
  if (entries.length === 0) {
    return (
      <div>
        <div className="label-caps mb-2">{label}</div>
        <div className="font-mono text-[12px] italic text-ink-100">
          No equations to show.
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="label-caps mb-2">{label}</div>
      <ol className="space-y-2">
        {entries.map((row) => (
          <li
            key={row.total}
            className="grid grid-cols-[2.5rem_1fr_6rem] items-center gap-3 py-1.5 border-b border-ink-100/10"
          >
            <span className="font-mono tabular text-[16px] text-oxblood-500 font-medium">
              {row.total}
            </span>
            <Equation equation={row.equation} size="inline" />
            <DifficultyMeter difficulty={row.difficulty} size="sm" />
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  ExploreView
// ---------------------------------------------------------------------------

export const ExploreView = observer(function ExploreView() {
  const { secret } = useStore();
  if (secret.aetherActive) return <AetherExploreView />;
  return <StandardExploreView />;
});

const StandardExploreView = observer(function StandardExploreView() {
  const { data, favorites } = useStore();
  const explore = useMemo(() => new ExploreStore(favorites), [favorites]);
  const index = data.index;

  // Mirror the Lookup pattern: register the URL/hash sync from a useEffect
  // so React StrictMode's mount/unmount/remount cycle in dev cleanly tears
  // down and re-registers the autorun.
  useEffect(() => explore.startSync(), [explore]);

  const rows = useMemo(() => {
    if (index.status !== "ready") return [];
    return explore.sort(explore.filter(index.value.dice));
    // explore.* are observable so re-renders happen when sort/filter change.
  }, [
    explore,
    explore.filters,
    explore.sorts,
    // favorites.size is read so toggling a star re-evaluates "favorites only".
    favorites.size,
    index,
  ]);

  return (
    <article>
      <PageHeader
        folio="II"
        eyebrow="The Index"
        title={
          <>
            Every dice triple,{" "}
            <span className="italic text-oxblood-500" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}>
              sortable
            </span>
            , catalogued.
          </>
        }
        dek="One thousand, five hundred and forty unordered combinations of three dice (1–20). Sort by overall ease, drill in to read each triple's easiest and hardest equations side by side."
        right={
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Filter (e.g. 6 12)"
              value={explore.filters.query}
              onChange={(e) => explore.setQuery(e.target.value)}
              className="px-3 py-1.5 text-[13px] font-mono bg-paper-100 border border-ink-100/30 text-ink-300 placeholder:text-ink-100 focus:outline-none focus:border-oxblood-500 focus:ring-1 focus:ring-oxblood-500/40 w-44"
              style={{ borderRadius: "2px" }}
            />
            <SavedViewsMenu store={explore} />
          </div>
        }
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
        <div className="grid grid-cols-12 gap-y-8 xl:gap-10">
          <div className="col-span-12 xl:col-span-7 min-w-0">
            <FilterToolbar store={explore} />
            <div className="overflow-y-auto max-h-[640px] pr-2 -mr-2 border border-ink-100/15">
              <table className="w-full">
                <thead className="sticky top-0 bg-paper-50 z-10">
                  <tr>
                    <th
                      style={{ width: "2.25rem" }}
                      className="py-3 px-2 align-bottom border-b border-ink-300/30 text-center"
                      aria-label="Starred"
                    >
                      <span className="label-caps text-ink-100">★</span>
                    </th>
                    {COLUMNS.map((col) => (
                      <ColumnHeader key={col.key} store={explore} col={col} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={COLUMNS.length + 1}
                        className="py-8 text-center font-mono text-[12px] text-ink-100 italic"
                      >
                        No triples match these filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <Row
                        key={row.dice.join("-")}
                        row={row}
                        selected={
                          explore.selected !== null &&
                          explore.selected.join("-") === row.dice.join("-")
                        }
                        onSelect={(dice) => explore.select(dice)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[11px] font-mono text-ink-100">
              Showing {rows.length.toLocaleString()} of {index.value.dice.length.toLocaleString()} triples
              <span className="mx-2 text-ink-100/50">·</span>
              <span className="text-ink-200">
                Shift-click a column to sort by it secondarily; right-click to remove.
              </span>
            </div>
          </div>

          <aside className="col-span-12 xl:col-span-5 xl:pl-8 xl:border-l xl:border-ink-100/15 min-w-0">
            {explore.selected ? (
              <Drilldown dice={explore.selected} />
            ) : (
              <div>
                <div className="label-caps mb-3">Begin reading</div>
                <p
                  className="font-display text-[28px] italic text-ink-200 leading-snug max-w-md"
                  style={{ fontVariationSettings: '"opsz" 100, "SOFT" 80, "WONK" 1' }}
                >
                  Select any row to expand its full solution roster.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </article>
  );
});
