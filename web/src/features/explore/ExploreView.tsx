/**
 * ExploreView — sortable, filterable catalog of every legal dice tuple.
 *
 * Columns: dice, solvable count, min/max target, min/avg/max difficulty,
 * favorite. Header click sorts; query box filters by tuple substring;
 * favorites filter + min-solvable threshold + difficulty band slider.
 *
 * Rows are clickable: selecting a tuple opens a side drawer with the
 * easiest-difficulty equation, the hardest target, a histogram chip strip,
 * and quick-jump links to Lookup / Compare.
 */
import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";
import type { ExploreModeId, SortKey } from "../../stores/ExploreStore.js";
import { tierForDifficulty } from "../lookup/difficultyTier.js";
import type { TupleStat } from "../../services/tupleIndexService.js";

const COLUMN_DEFS: ReadonlyArray<{ key: SortKey; label: string; align: "left" | "right" }> = [
  { key: "dice", label: "Dice", align: "left" },
  { key: "solvable", label: "Solvable", align: "right" },
  { key: "minTarget", label: "Min target", align: "right" },
  { key: "maxTarget", label: "Max target", align: "right" },
  { key: "minDifficulty", label: "Easiest", align: "right" },
  { key: "avgDifficulty", label: "Avg", align: "right" },
  { key: "maxDifficulty", label: "Hardest", align: "right" },
];

export const ExploreView = observer(function ExploreView() {
  const { explore, lookup, compare } = useAppStore();
  const rows = explore.filteredSorted;
  const total = explore.totalCount;
  const loaded = explore.loadedCount;
  const pct = total === 0 ? 0 : Math.min(100, Math.round((loaded / total) * 100));

  const onSendToLookup = (stat: TupleStat) => {
    lookup.setMode(explore.modeId);
    lookup.setDice(stat.dice);
  };
  const onSendToCompare = (stat: TupleStat) => {
    compare.add(explore.modeId, stat.dice);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Explore</h2>
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Every legal tuple, sortable + filterable. {loaded.toLocaleString()} / {total.toLocaleString()} indexed
            {explore.isLoading ? " — warming…" : ""}.
          </p>
        </div>
        <ModeSwitch />
      </header>

      {explore.isLoading && total > 0 ? <ProgressBar pct={pct} /> : null}

      <Toolbar />

      <div
        className="overflow-auto"
        style={{
          background: "var(--color-surface)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
          maxHeight: "70vh",
        }}
      >
        <table className="w-full text-sm">
          <thead
            className="sticky top-0 z-10"
            style={{
              background: "var(--color-surface)",
              borderBottom: "1px solid var(--color-rule)",
            }}
          >
            <tr>
              <th className="px-2 py-2 text-left font-medium" style={{ width: "32px" }}></th>
              {COLUMN_DEFS.map((c) => (
                <th
                  key={c.key}
                  className={`px-3 py-2 font-medium select-none cursor-pointer ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                  onClick={() => explore.setSort(c.key)}
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  {c.label}
                  {explore.sortKey === c.key ? (
                    <span aria-hidden="true">{explore.sortDir === "asc" ? " ▲" : " ▼"}</span>
                  ) : null}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--color-ink-muted)" }}>
                Mix
              </th>
              <th className="px-3 py-2 text-right" style={{ width: "180px" }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !explore.isLoading ? (
              <tr>
                <td colSpan={COLUMN_DEFS.length + 3} className="px-4 py-12 text-center" style={{ color: "var(--color-ink-muted)" }}>
                  No tuples match.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => {
              const isFav = explore.favorites.isFavorite(explore.modeId, r.dice);
              const isSel = explore.selectedStat === r;
              return (
                <tr
                  key={`${r.modeId}-${r.dice.join(",")}`}
                  onClick={() => explore.selectTuple(isSel ? null : r)}
                  className="cursor-pointer"
                  style={{
                    background: isSel ? "color-mix(in oklab, var(--color-accent) 14%, transparent)" : "transparent",
                    borderBottom: "1px solid var(--color-rule)",
                  }}
                >
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      aria-label={isFav ? "Unfavorite" : "Favorite"}
                      onClick={(e) => {
                        e.stopPropagation();
                        explore.favorites.toggle(explore.modeId, r.dice);
                      }}
                      className="text-base leading-none"
                      style={{ color: isFav ? "var(--color-accent)" : "var(--color-ink-muted)" }}
                    >
                      {isFav ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-mono">{r.dice.join(" / ")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.solvableCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.minTarget ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.maxTarget ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.minDifficulty.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.avgDifficulty.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.maxDifficulty.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">
                    <DistributionStrip buckets={r.buckets} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <RowAction onClick={(e) => { e.stopPropagation(); onSendToLookup(r); }}>Lookup</RowAction>
                      <RowAction onClick={(e) => { e.stopPropagation(); onSendToCompare(r); }}>Compare</RowAction>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {explore.selectedStat !== null ? <SelectionDrawer stat={explore.selectedStat} /> : null}
    </div>
  );
});

const ModeSwitch = observer(function ModeSwitch() {
  const { explore } = useAppStore();
  return (
    <div className="flex gap-1" role="tablist" aria-label="Mode">
      {(["standard", "aether"] as ExploreModeId[]).map((m) => {
        const active = explore.modeId === m;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => explore.setMode(m)}
            className="px-3 py-1.5 text-sm rounded"
            style={{
              background: active ? "var(--color-accent)" : "transparent",
              color: active ? "var(--color-bg)" : "var(--color-ink)",
              border: "1px solid var(--color-rule)",
            }}
          >
            {m === "standard" ? "Standard" : "Æther"}
          </button>
        );
      })}
    </div>
  );
});

const Toolbar = observer(function Toolbar() {
  const { explore } = useAppStore();
  const f = explore.filters;
  return (
    <div
      className="flex flex-wrap items-end gap-3 px-4 py-3"
      style={{
        background: "var(--color-surface)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <Field label="Search dice (e.g. 3/5)">
        <input
          type="text"
          value={f.query}
          onChange={(e) => explore.setQuery(e.target.value)}
          placeholder="Substring of a/b/c"
          className="px-2 py-1 text-sm rounded border w-48"
          style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
        />
      </Field>
      <Field label="Min solvable">
        <input
          type="number"
          value={f.minSolvable}
          min={0}
          onChange={(e) => explore.setMinSolvable(Number.parseInt(e.target.value, 10) || 0)}
          className="px-2 py-1 text-sm rounded border w-24 tabular-nums"
          style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
        />
      </Field>
      <Field label="Avg difficulty min">
        <input
          type="number"
          value={f.avgDifficultyMin ?? ""}
          step="0.5"
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number.parseFloat(e.target.value);
            explore.setAvgDifficultyRange(v, f.avgDifficultyMax);
          }}
          className="px-2 py-1 text-sm rounded border w-24 tabular-nums"
          style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
        />
      </Field>
      <Field label="Max">
        <input
          type="number"
          value={f.avgDifficultyMax ?? ""}
          step="0.5"
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number.parseFloat(e.target.value);
            explore.setAvgDifficultyRange(f.avgDifficultyMin, v);
          }}
          className="px-2 py-1 text-sm rounded border w-24 tabular-nums"
          style={{ background: "var(--color-bg)", color: "var(--color-ink)", borderColor: "var(--color-rule)" }}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--color-ink)" }}>
        <input
          type="checkbox"
          checked={f.favoritesOnly}
          onChange={(e) => explore.setFavoritesOnly(e.target.checked)}
        />
        Favorites only
      </label>
    </div>
  );
});

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
      {props.label}
      {props.children}
    </label>
  );
}

function ProgressBar(props: { pct: number }) {
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full"
      style={{ background: "color-mix(in oklab, var(--color-rule) 60%, transparent)" }}
    >
      <div
        className="h-full transition-all"
        style={{ width: `${props.pct}%`, background: "var(--color-accent)" }}
      />
    </div>
  );
}

function DistributionStrip(props: { buckets: readonly number[] }) {
  const total = props.buckets.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return (
    <div className="flex h-2.5 w-32 ml-auto overflow-hidden rounded">
      {props.buckets.map((count, idx) => {
        if (count === 0) return null;
        const tier = tierForDifficulty(idx === 0 ? 0 : idx * 10);
        return (
          <div
            key={idx}
            title={`${tier.label}: ${count}`}
            style={{
              width: `${(count / total) * 100}%`,
              background: tier.chipBg.replace(/0\.\d+/, "0.65"),
            }}
          />
        );
      })}
    </div>
  );
}

function RowAction(props: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="px-2 py-1 text-xs rounded"
      style={{
        background: "transparent",
        border: "1px solid var(--color-rule)",
        color: "var(--color-ink)",
      }}
    >
      {props.children}
    </button>
  );
}

const SelectionDrawer = observer(function SelectionDrawer(props: { stat: TupleStat }) {
  const { explore } = useAppStore();
  const tier = tierForDifficulty(props.stat.avgDifficulty);
  return (
    <div
      className="px-5 py-4"
      style={{
        background: "var(--color-surface)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Selected tuple
          </p>
          <h3 className="text-base font-semibold font-mono">{props.stat.dice.join(" / ")}</h3>
        </div>
        <button
          type="button"
          onClick={() => explore.clearSelection()}
          className="px-2 py-1 text-xs rounded border"
          style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
        >
          Close
        </button>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Stat label="Solvable">{props.stat.solvableCount}</Stat>
        <Stat label="Range">{props.stat.minTarget ?? "—"} … {props.stat.maxTarget ?? "—"}</Stat>
        <Stat label="Avg difficulty">
          <span
            className="px-1.5 py-0.5 rounded text-xs"
            style={{ background: tier.chipBg, color: tier.chipFg }}
          >
            {props.stat.avgDifficulty.toFixed(1)} · {tier.label}
          </span>
        </Stat>
        <Stat label="Difficulty span">
          {props.stat.minDifficulty.toFixed(1)} … {props.stat.maxDifficulty.toFixed(1)}
        </Stat>
      </dl>
    </div>
  );
});

function Stat(props: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide mb-0.5" style={{ color: "var(--color-ink-muted)" }}>
        {props.label}
      </dt>
      <dd className="font-medium">{props.children}</dd>
    </div>
  );
}
