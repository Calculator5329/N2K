import { observer } from "mobx-react-lite";
import { useMemo, useState } from "react";
import type { LookupStore } from "../../stores/LookupStore.js";
import { formatExpressionAgainstPool } from "@platform/services/parsing.js";
import { tierForDifficulty } from "./difficultyTier.js";
import { VirtualRows } from "../../ui/virtualization/VirtualRows.js";

const TIERS = ["all", "trivial", "easy", "moderate", "hard", "very hard", "extreme", "legendary", "mythic"] as const;
type Filter = (typeof TIERS)[number];

const ROW_HEIGHT = 40;
const GRID_COLUMNS = "92px minmax(0, 1fr) 96px 110px";

export interface TargetGridProps {
  readonly store: LookupStore;
}

/**
 * The "every-target sweep" view. Shows the easiest known equation for
 * each target the dice can hit, sorted by difficulty. Click a row to
 * drill down into "all solutions for this target".
 *
 * Row body is virtualized via {@link VirtualRows} so 500+ targets
 * scroll smoothly even on low-end laptops.
 */
export const TargetGrid = observer(function TargetGrid({ store }: TargetGridProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState<string>("");

  const filtered = useMemo(() => {
    const all = store.sortedTargetsByDifficulty;
    return all.filter((sol) => {
      if (filter !== "all") {
        if (tierForDifficulty(sol.difficulty).label !== filter) return false;
      }
      if (search.trim().length > 0) {
        const q = search.trim();
        if (!String(sol.equation.total).startsWith(q)) return false;
      }
      return true;
    });
  }, [store.sortedTargetsByDifficulty, filter, search]);

  const state = store.chunk.state;
  const isLoading = state.kind === "loading";
  const hasData = store.sortedTargetsByDifficulty.length > 0;

  if (state.kind === "error") {
    return (
      <ErrorBanner
        message={String((state.error as Error)?.message ?? state.error)}
        onRetry={() => void store.chunk.refresh()}
      />
    );
  }

  return (
    <section
      className="flex flex-col rounded border overflow-hidden"
      style={{
        borderColor: "var(--color-rule)",
        background: "var(--color-surface)",
        opacity: isLoading && hasData ? 0.6 : 1,
        transition: "opacity 120ms ease",
      }}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b"
        style={{ borderColor: "var(--color-rule)" }}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            Reachable targets
          </h2>
          <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            {hasData ? `${filtered.length} / ${store.sortedTargetsByDifficulty.length}` : "—"}
          </span>
          {isLoading ? (
            <span className="text-xs italic" style={{ color: "var(--color-ink-muted)" }}>
              loading…
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            placeholder="filter target"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-2 py-1 text-sm rounded border outline-none w-32"
            style={{
              borderColor: "var(--color-rule)",
              background: "var(--color-bg)",
              color: "var(--color-ink)",
            }}
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="px-2 py-1 text-sm rounded border outline-none"
            style={{
              borderColor: "var(--color-rule)",
              background: "var(--color-bg)",
              color: "var(--color-ink)",
            }}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </header>

      {!hasData && !isLoading ? (
        <EmptyState message="No targets reachable for this dice tuple under this mode." />
      ) : !hasData && isLoading ? (
        <SkeletonRows />
      ) : filtered.length === 0 ? (
        <>
          <GridHeader />
          <EmptyState message="No targets match the current filter." />
        </>
      ) : (
        <VirtualRows
          count={filtered.length}
          rowHeight={ROW_HEIGHT}
          maxHeight="60vh"
          // Resetting on the (filter, search, dice) tuple keeps users
          // anchored at the top whenever the underlying list identity
          // shifts, instead of stranding them mid-list with rows that
          // no longer exist.
          resetKey={`${store.mode.id}|${store.dice.join(",")}|${filter}|${search}`}
          header={<GridHeader />}
          renderRow={(i) => {
            const sol = filtered[i];
            if (sol === undefined) return null;
            return (
              <Row
                key={sol.equation.total}
                target={sol.equation.total}
                equation={formatExpressionAgainstPool(sol.equation, store.dice, store.mode)}
                difficulty={sol.difficulty}
                active={store.selectedTarget === sol.equation.total}
                onClick={() =>
                  store.selectedTarget === sol.equation.total
                    ? store.clearTarget()
                    : store.setTarget(sol.equation.total)
                }
              />
            );
          }}
        />
      )}
    </section>
  );
});

function GridHeader() {
  return (
    <div
      className="sticky top-0 z-10 grid items-center px-4 text-xs font-semibold uppercase tracking-wider"
      style={{
        gridTemplateColumns: GRID_COLUMNS,
        height: ROW_HEIGHT,
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-rule)",
        color: "var(--color-ink-muted)",
      }}
    >
      <div>Target</div>
      <div>Easiest equation</div>
      <div style={{ textAlign: "right" }}>Difficulty</div>
      <div>Tier</div>
    </div>
  );
}

interface RowProps {
  readonly target: number;
  readonly equation: string;
  readonly difficulty: number;
  readonly active: boolean;
  readonly onClick: () => void;
}

function Row({ target, equation, difficulty, active, onClick }: RowProps) {
  const tier = tierForDifficulty(difficulty);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="grid items-center px-4 cursor-pointer text-sm"
      style={{
        gridTemplateColumns: GRID_COLUMNS,
        height: ROW_HEIGHT,
        background: active
          ? "var(--color-accent-soft, rgba(0,0,0,0.04))"
          : "transparent",
        borderTop: "1px solid var(--color-rule)",
      }}
    >
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontWeight: 600,
        }}
      >
        {target}
      </div>
      <div
        className="truncate"
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {equation}
      </div>
      <div
        style={{
          textAlign: "right",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {difficulty.toFixed(1)}
      </div>
      <div>
        <span
          className="inline-block px-2 py-0.5 rounded text-xs"
          style={{ background: tier.chipBg, color: tier.chipFg }}
        >
          {tier.label}
        </span>
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <div
      className="px-4 py-3 flex items-center justify-between gap-3 text-sm rounded border"
      style={{ borderColor: "#c0392b", background: "rgba(192, 57, 43, 0.08)", color: "#c0392b" }}
    >
      <span>Failed to load: {message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="px-2 py-1 text-xs rounded border"
        style={{ borderColor: "#c0392b", color: "#c0392b" }}
      >
        retry
      </button>
    </div>
  );
}

function EmptyState({ message }: { readonly message: string }) {
  return (
    <div
      className="px-4 py-12 text-sm italic text-center"
      style={{ color: "var(--color-ink-muted)" }}
    >
      {message}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="px-4 py-6 space-y-2" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-6 rounded"
          style={{
            background: "var(--color-rule)",
            opacity: 0.4 - i * 0.04,
          }}
        />
      ))}
    </div>
  );
}
