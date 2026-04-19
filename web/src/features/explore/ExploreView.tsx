/**
 * ExploreView — sortable, filterable catalog of every legal dice tuple.
 *
 * Columns: dice, solvable count, min/max target, min/avg/max difficulty,
 * favorite. Header click sorts; query box filters by tuple substring;
 * favorites filter + min-solvable threshold + difficulty band slider.
 *
 * Rows are clickable: selecting a tuple opens a side drawer with the
 * easiest-difficulty equation, the hardest target, a histogram chip strip,
 * and quick-jump links to Lookup / Compare. Body is virtualized via
 * {@link VirtualRows} so 1000+ tuples scroll smoothly.
 */
import { observer } from "mobx-react-lite";
import { useAppStore } from "../../stores/AppStoreContext.js";
import type { ExploreModeId, SortKey } from "../../stores/ExploreStore.js";
import { tierForDifficulty } from "../lookup/difficultyTier.js";
import type { TupleStat } from "../../services/tupleIndexService.js";
import { VirtualRows } from "../../ui/virtualization/VirtualRows.js";
import { PageHeader } from "../../ui/primitives/PageHeader.js";
import { navItemById } from "../../ui/layouts/nav.js";

const COLUMN_DEFS: ReadonlyArray<{ key: SortKey; label: string; align: "left" | "right" }> = [
  { key: "dice", label: "Dice", align: "left" },
  { key: "solvable", label: "Solvable", align: "right" },
  { key: "minTarget", label: "Min target", align: "right" },
  { key: "maxTarget", label: "Max target", align: "right" },
  { key: "minDifficulty", label: "Easiest", align: "right" },
  { key: "avgDifficulty", label: "Avg", align: "right" },
  { key: "maxDifficulty", label: "Hardest", align: "right" },
];

// Single source of truth for column widths so header + virtualized rows
// stay aligned regardless of viewport. Columns: fav | dice | solvable |
// minT | maxT | easiest | avg | hardest | mix | actions.
const GRID_COLUMNS =
  "32px minmax(120px, 1.4fr) 90px 96px 96px 84px 72px 84px 140px 180px";

const ROW_HEIGHT = 44;

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

  const item = navItemById("explore");
  return (
    <div className="space-y-4">
      <PageHeader
        folio={item.folio}
        eyebrow="Every legal tuple"
        title="Explore"
        dek={`Sortable, filterable. ${loaded.toLocaleString()} / ${total.toLocaleString()} indexed${explore.isLoading ? " — warming…" : ""}.`}
        right={<ModeSwitch />}
      />

      {explore.isLoading && total > 0 ? <ProgressBar pct={pct} /> : null}

      <Toolbar />

      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
          overflow: "hidden",
        }}
      >
        {rows.length === 0 && !explore.isLoading ? (
          <>
            <ExploreHeaderRow />
            <div
              className="px-4 py-12 text-center"
              style={{ color: "var(--color-ink-muted)" }}
            >
              No tuples match.
            </div>
          </>
        ) : (
          <VirtualRows
            count={rows.length}
            rowHeight={ROW_HEIGHT}
            maxHeight="70vh"
            resetKey={`${explore.modeId}|${rows.length}|${explore.sortKey}|${explore.sortDir}`}
            header={<ExploreHeaderRow />}
            renderRow={(i) => {
              const r = rows[i];
              if (r === undefined) return null;
              const isFav = explore.favorites.isFavorite(explore.modeId, r.dice);
              const isSel = explore.selectedStat === r;
              return (
                <ExploreRow
                  key={`${r.modeId}-${r.dice.join(",")}`}
                  stat={r}
                  isFav={isFav}
                  isSel={isSel}
                  onSelect={() => explore.selectTuple(isSel ? null : r)}
                  onToggleFav={() => explore.favorites.toggle(explore.modeId, r.dice)}
                  onLookup={() => onSendToLookup(r)}
                  onCompare={() => onSendToCompare(r)}
                />
              );
            }}
          />
        )}
      </div>

      {explore.selectedStat !== null ? <SelectionDrawer stat={explore.selectedStat} /> : null}
    </div>
  );
});

const ExploreHeaderRow = observer(function ExploreHeaderRow() {
  const { explore } = useAppStore();
  const arrow = (dir: "asc" | "desc") => (dir === "asc" ? "▲" : "▼");
  return (
    <div
      className="sticky top-0 z-10 grid items-center px-4 text-xs font-semibold uppercase tracking-wider select-none"
      style={{
        gridTemplateColumns: GRID_COLUMNS,
        height: ROW_HEIGHT,
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-rule)",
        color: "var(--color-ink-muted)",
      }}
    >
      <div />
      {COLUMN_DEFS.map((c) => {
        const secondaryIdx = explore.secondarySorts.findIndex((s) => s.key === c.key);
        const secondary = secondaryIdx >= 0 ? explore.secondarySorts[secondaryIdx]! : null;
        return (
          <div
            key={c.key}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              if (e.shiftKey) explore.addSecondarySort(c.key);
              else explore.setSort(c.key);
            }}
            onContextMenu={(e) => {
              if (secondary !== null) {
                e.preventDefault();
                explore.removeSecondarySort(c.key);
              }
            }}
            title="Click to sort · Shift-click to add secondary · Right-click to remove"
            style={{
              textAlign: c.align,
              cursor: "pointer",
            }}
          >
            {c.label}
            {explore.sortKey === c.key ? <span aria-hidden="true"> {arrow(explore.sortDir)}</span> : null}
            {secondary !== null ? (
              <span aria-hidden="true" style={{ opacity: 0.6 }}>
                {" "}
                {secondaryIdx + 2}
                {arrow(secondary.dir)}
              </span>
            ) : null}
          </div>
        );
      })}
      <div style={{ textAlign: "right" }}>Mix</div>
      <div />
    </div>
  );
});

interface ExploreRowProps {
  readonly stat: TupleStat;
  readonly isFav: boolean;
  readonly isSel: boolean;
  readonly onSelect: () => void;
  readonly onToggleFav: () => void;
  readonly onLookup: () => void;
  readonly onCompare: () => void;
}

function ExploreRow({ stat, isFav, isSel, onSelect, onToggleFav, onLookup, onCompare }: ExploreRowProps) {
  return (
    <div
      role="row"
      onClick={onSelect}
      className="grid items-center px-4 cursor-pointer text-sm tabular-nums"
      style={{
        gridTemplateColumns: GRID_COLUMNS,
        height: ROW_HEIGHT,
        background: isSel ? "color-mix(in oklab, var(--color-accent) 14%, transparent)" : "transparent",
        borderBottom: "1px solid var(--color-rule)",
      }}
    >
      <div>
        <button
          type="button"
          aria-label={isFav ? "Unfavorite" : "Favorite"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav();
          }}
          className="text-base leading-none"
          style={{ color: isFav ? "var(--color-accent)" : "var(--color-ink-muted)", background: "transparent", border: "none" }}
        >
          {isFav ? "★" : "☆"}
        </button>
      </div>
      <div className="font-mono truncate">{stat.dice.join(" / ")}</div>
      <div style={{ textAlign: "right" }}>{stat.solvableCount}</div>
      <div style={{ textAlign: "right" }}>{stat.minTarget ?? "—"}</div>
      <div style={{ textAlign: "right" }}>{stat.maxTarget ?? "—"}</div>
      <div style={{ textAlign: "right" }}>{stat.minDifficulty.toFixed(1)}</div>
      <div style={{ textAlign: "right" }}>{stat.avgDifficulty.toFixed(1)}</div>
      <div style={{ textAlign: "right" }}>{stat.maxDifficulty.toFixed(1)}</div>
      <div style={{ textAlign: "right" }}>
        <DistributionStrip buckets={stat.buckets} />
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="flex justify-end gap-1.5">
          <RowAction onClick={(e) => { e.stopPropagation(); onLookup(); }}>Lookup</RowAction>
          <RowAction onClick={(e) => { e.stopPropagation(); onCompare(); }}>Compare</RowAction>
        </div>
      </div>
    </div>
  );
}

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
