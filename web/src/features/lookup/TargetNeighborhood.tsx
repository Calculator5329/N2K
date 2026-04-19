/**
 * `TargetNeighborhood` — adjacent-target bar chart + keyboard nav.
 *
 * Shows up to `WINDOW` reachable targets centered on the current
 * selection, sorted by **target value** (so the user reads them in
 * counting order). Each bar's height is proportional to that target's
 * difficulty within the visible window — taller = harder. Clicking a
 * bar selects that target.
 *
 * Mounts a global key listener while a Lookup target is active:
 *   ← / →     previous / next target
 *   Home/End  first / last reachable target
 *   PgUp/PgDn jump 10 targets at a time
 *   Esc       clear selection
 *
 * The listener is suppressed while the user is typing into an input,
 * select, or contenteditable so the chart doesn't steal the dice
 * field's arrow keys.
 */
import { observer } from "mobx-react-lite";
import { useEffect, useMemo } from "react";
import type { LookupStore } from "../../stores/LookupStore.js";
import type { BulkSolution } from "@platform/core/types.js";

export interface TargetNeighborhoodProps {
  readonly store: LookupStore;
  /** Number of bars in the adjacent strip. Defaults to 11. */
  readonly window?: number;
}

export const TargetNeighborhood = observer(function TargetNeighborhood({
  store,
  window: win = 11,
}: TargetNeighborhoodProps) {
  const sortedByValue: readonly BulkSolution[] = useMemo(() => {
    const list = [...store.sortedTargetsByDifficulty];
    list.sort((a, b) => a.equation.total - b.equation.total);
    return list;
  }, [store.sortedTargetsByDifficulty]);

  // Mount the global keyboard handler when there are targets.
  useEffect(() => {
    if (sortedByValue.length === 0) return;
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target !== null) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      const idx = currentIndex(sortedByValue, store.selectedTarget);
      switch (event.key) {
        case "ArrowLeft":
        case "ArrowUp": {
          event.preventDefault();
          const prev = sortedByValue[Math.max(0, idx - 1)];
          if (prev !== undefined) store.setTarget(prev.equation.total);
          break;
        }
        case "ArrowRight":
        case "ArrowDown": {
          event.preventDefault();
          const next = sortedByValue[Math.min(sortedByValue.length - 1, idx + 1)];
          if (next !== undefined) store.setTarget(next.equation.total);
          break;
        }
        case "Home": {
          event.preventDefault();
          const first = sortedByValue[0];
          if (first !== undefined) store.setTarget(first.equation.total);
          break;
        }
        case "End": {
          event.preventDefault();
          const last = sortedByValue[sortedByValue.length - 1];
          if (last !== undefined) store.setTarget(last.equation.total);
          break;
        }
        case "PageUp": {
          event.preventDefault();
          const prev = sortedByValue[Math.max(0, idx - 10)];
          if (prev !== undefined) store.setTarget(prev.equation.total);
          break;
        }
        case "PageDown": {
          event.preventDefault();
          const next = sortedByValue[Math.min(sortedByValue.length - 1, idx + 10)];
          if (next !== undefined) store.setTarget(next.equation.total);
          break;
        }
        case "Escape": {
          if (store.selectedTarget !== null) {
            event.preventDefault();
            store.clearTarget();
          }
          break;
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sortedByValue, store]);

  if (sortedByValue.length === 0) return null;

  const idx = currentIndex(sortedByValue, store.selectedTarget);
  const half = Math.floor(win / 2);
  let start = Math.max(0, idx - half);
  let end = Math.min(sortedByValue.length, start + win);
  start = Math.max(0, end - win);
  const slice = sortedByValue.slice(start, end);
  const maxDiff = slice.reduce((m, s) => Math.max(m, s.difficulty), 1);

  return (
    <section
      className="rounded border px-3 py-2.5"
      style={{
        borderColor: "var(--color-rule)",
        background: "var(--color-surface)",
      }}
      aria-label="Adjacent reachable targets"
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider">
          Adjacent targets
        </h3>
        <span className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
          ← → keys, PgUp/PgDn, Home/End · Esc clears
        </span>
      </div>
      <div className="flex items-end gap-1" style={{ height: 64 }}>
        {slice.map((s) => {
          const heightPct = Math.max(8, (s.difficulty / maxDiff) * 100);
          const active = store.selectedTarget === s.equation.total;
          return (
            <button
              key={s.equation.total}
              type="button"
              onClick={() => store.setTarget(s.equation.total)}
              className="flex flex-col items-center justify-end gap-0.5 flex-1 min-w-0 group"
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
              title={`Target ${s.equation.total} · difficulty ${s.difficulty.toFixed(1)}`}
            >
              <div
                className="w-full rounded-sm"
                style={{
                  height: `${heightPct}%`,
                  background: active ? "var(--color-accent)" : "var(--color-rule)",
                  opacity: active ? 1 : 0.55,
                  transition: "opacity 120ms ease, background 120ms ease",
                }}
              />
              <span
                className="text-[10px] tabular-nums"
                style={{
                  color: active ? "var(--color-ink)" : "var(--color-ink-muted)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {s.equation.total}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
});

function currentIndex(
  list: readonly BulkSolution[],
  selected: number | null,
): number {
  if (selected === null) return Math.floor(list.length / 2);
  const i = list.findIndex((s) => s.equation.total === selected);
  return i < 0 ? Math.floor(list.length / 2) : i;
}
