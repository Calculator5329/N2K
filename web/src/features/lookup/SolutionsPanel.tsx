import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import type { LookupStore } from "../../stores/LookupStore.js";
import { formatExpression } from "@platform/services/parsing.js";
import { difficultyOfEquation } from "@platform/services/difficulty.js";
import { tierForDifficulty } from "./difficultyTier.js";

export interface SolutionsPanelProps {
  readonly store: LookupStore;
}

/**
 * "All solutions for the selected target" panel. Appears below
 * `TargetGrid` whenever `store.selectedTarget !== null`. Reactively
 * driven by `store.solutionsForTarget` (a `Resource<NEquation[]>`)
 * which is itself driven by a MobX `reaction` in the store.
 */
export const SolutionsPanel = observer(function SolutionsPanel({
  store,
}: SolutionsPanelProps) {
  const target = store.selectedTarget;
  const state = store.solutionsForTarget.state;

  const sorted = useMemo(() => {
    if (state.kind !== "ready") return null;
    const enriched = state.value.map((eq) => ({
      eq,
      diff: difficultyOfEquation(eq, store.mode),
    }));
    enriched.sort((a, b) => a.diff - b.diff);
    return enriched;
  }, [state, store.mode]);

  if (target === null) return null;

  return (
    <section
      className="flex flex-col rounded border overflow-hidden"
      style={{
        borderColor: "var(--color-rule)",
        background: "var(--color-surface)",
      }}
    >
      <header
        className="flex items-center justify-between gap-3 px-4 py-3 border-b"
        style={{ borderColor: "var(--color-rule)" }}
      >
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            All solutions for{" "}
            <span style={{ color: "var(--color-accent)" }}>{target}</span>
          </h2>
          {state.kind === "ready" ? (
            <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
              {state.value.length} found
            </span>
          ) : null}
          {state.kind === "loading" ? (
            <span className="text-xs italic" style={{ color: "var(--color-ink-muted)" }}>
              solving…
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => store.clearTarget()}
          className="px-2 py-1 text-xs rounded border"
          style={{
            borderColor: "var(--color-rule)",
            color: "var(--color-ink)",
          }}
        >
          close
        </button>
      </header>

      {state.kind === "error" ? (
        <div
          className="px-4 py-3 text-sm"
          style={{ color: "#c0392b" }}
        >
          {String((state.error as Error)?.message ?? state.error)}
        </div>
      ) : null}

      {state.kind === "loading" || state.kind === "idle" ? (
        <div className="px-4 py-6 space-y-2" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-5 rounded"
              style={{
                background: "var(--color-rule)",
                opacity: 0.4 - i * 0.06,
              }}
            />
          ))}
        </div>
      ) : null}

      {sorted !== null ? (
        sorted.length === 0 ? (
          <div
            className="px-4 py-6 text-sm italic text-center"
            style={{ color: "var(--color-ink-muted)" }}
          >
            No equations on these dice evaluate to {target}.
          </div>
        ) : (
          <div className="overflow-auto" style={{ maxHeight: "40vh" }}>
            <ul className="divide-y" style={{ borderColor: "var(--color-rule)" }}>
              {sorted.map(({ eq, diff }, i) => {
                const tier = tierForDifficulty(diff);
                return (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-4 px-4 py-2 text-sm"
                    style={{ borderTop: i === 0 ? "none" : "1px solid var(--color-rule)" }}
                  >
                    <span
                      className="font-mono"
                      style={{
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}
                    >
                      {formatExpression(eq)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className="font-mono text-xs"
                        style={{ color: "var(--color-ink-muted)" }}
                      >
                        {diff.toFixed(1)}
                      </span>
                      <span
                        className="inline-block px-2 py-0.5 rounded text-xs"
                        style={{ background: tier.chipBg, color: tier.chipFg }}
                      >
                        {tier.label}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      ) : null}
    </section>
  );
});
