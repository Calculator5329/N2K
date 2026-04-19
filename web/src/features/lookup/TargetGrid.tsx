import { observer } from "mobx-react-lite";
import { useMemo, useState } from "react";
import type { LookupStore } from "../../stores/LookupStore.js";
import { formatExpression } from "@platform/services/parsing.js";
import { tierForDifficulty } from "./difficultyTier.js";

const TIERS = ["all", "trivial", "easy", "moderate", "hard", "very hard", "extreme", "legendary", "mythic"] as const;
type Filter = (typeof TIERS)[number];

export interface TargetGridProps {
  readonly store: LookupStore;
}

/**
 * The "every-target sweep" view. Shows the easiest known equation for
 * each target the dice can hit, sorted by difficulty. Click a row to
 * drill down into "all solutions for this target".
 *
 * Three view states:
 *   - loading (Resource state = "loading", no previous value): skeleton
 *   - error: error message + retry button
 *   - ready / loading-with-previous: the table itself, optionally
 *     dimmed to indicate a refresh is in flight
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
      ) : (
        <div className="overflow-auto" style={{ maxHeight: "60vh" }}>
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0" style={{ background: "var(--color-surface)" }}>
              <tr style={{ color: "var(--color-ink-muted)" }}>
                <Th>Target</Th>
                <Th>Easiest equation</Th>
                <Th align="right">Difficulty</Th>
                <Th>Tier</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sol) => {
                const tier = tierForDifficulty(sol.difficulty);
                const active = store.selectedTarget === sol.equation.total;
                return (
                  <tr
                    key={sol.equation.total}
                    onClick={() =>
                      active ? store.clearTarget() : store.setTarget(sol.equation.total)
                    }
                    className="cursor-pointer"
                    style={{
                      background: active ? "var(--color-accent-soft, rgba(0,0,0,0.04))" : "transparent",
                      borderTop: "1px solid var(--color-rule)",
                    }}
                  >
                    <Td mono bold>{sol.equation.total}</Td>
                    <Td mono>{formatExpression(sol.equation)}</Td>
                    <Td align="right" mono>{sol.difficulty.toFixed(1)}</Td>
                    <Td>
                      <span
                        className="inline-block px-2 py-0.5 rounded text-xs"
                        style={{ background: tier.chipBg, color: tier.chipFg }}
                      >
                        {tier.label}
                      </span>
                    </Td>
                  </tr>
                );
              })}
              {filtered.length === 0 && hasData ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-sm italic text-center"
                    style={{ color: "var(--color-ink-muted)" }}
                  >
                    No targets match the current filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
});

function Th({ children, align }: { readonly children: React.ReactNode; readonly align?: "right" }) {
  return (
    <th
      className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider"
      style={{ textAlign: align ?? "left" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
  bold,
}: {
  readonly children: React.ReactNode;
  readonly align?: "right";
  readonly mono?: boolean;
  readonly bold?: boolean;
}) {
  return (
    <td
      className="px-4 py-2"
      style={{
        textAlign: align ?? "left",
        fontFamily: mono === true ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
        fontWeight: bold === true ? 600 : undefined,
      }}
    >
      {children}
    </td>
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
