import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import type { LookupStore } from "../../stores/LookupStore.js";
import { useAppStore } from "../../stores/AppStoreContext.js";
import { isLegalDiceForMode } from "@platform/services/generators.js";

export interface DicePickerProps {
  readonly store: LookupStore;
}

export const DicePicker = observer(function DicePicker({ store }: DicePickerProps) {
  const { favorites } = useAppStore();
  // Local string buffer so the input can hold transient invalid values
  // (mid-typing) without reverting on every keystroke.
  const [draft, setDraft] = useState<string>(() => store.dice.join(", "));
  const [error, setError] = useState<string | null>(null);
  const isFav = favorites.isFavorite(store.modeId, store.dice);

  // Re-sync the input when the store changes via "roll" or programmatic set.
  useEffect(() => {
    setDraft(store.dice.join(", "));
    setError(null);
  }, [store.dice]);

  const commit = (next: string): void => {
    const parts = next
      .split(/[,\s]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const nums = parts.map((p) => Number.parseInt(p, 10));
    if (nums.some((n) => Number.isNaN(n))) {
      setError("Use comma- or space-separated integers");
      return;
    }
    if (
      nums.some(
        (n) =>
          n < store.mode.diceRange.min || n > store.mode.diceRange.max,
      )
    ) {
      setError(
        `Each die must be in [${store.mode.diceRange.min}, ${store.mode.diceRange.max}] for ${store.modeId}`,
      );
      return;
    }
    if (!store.mode.arities.includes(nums.length as 3 | 4 | 5)) {
      setError(
        `Need ${store.mode.arities.join(" / ")} dice for ${store.modeId}, got ${nums.length}`,
      );
      return;
    }
    if (!isLegalDiceForMode(nums, store.mode)) {
      setError(`Illegal tuple for ${store.modeId} (no all-same triples, ≤1 one)`);
      return;
    }
    setError(null);
    store.setDice(nums);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-xs uppercase tracking-wider"
        style={{ color: "var(--color-ink-muted)" }}
      >
        Dice
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          className="flex-1 px-3 py-2 text-base font-mono rounded border outline-none"
          style={{
            borderColor: error === null ? "var(--color-rule)" : "#c0392b",
            background: "var(--color-bg)",
            color: "var(--color-ink)",
          }}
          aria-invalid={error !== null}
          aria-describedby={error !== null ? "dice-error" : undefined}
        />
        <button
          type="button"
          onClick={() => favorites.toggle(store.modeId, store.dice)}
          className="px-3 py-2 text-sm rounded border"
          style={{
            borderColor: "var(--color-rule)",
            background: isFav ? "var(--color-accent)" : "var(--color-surface)",
            color: isFav ? "var(--color-bg)" : "var(--color-ink)",
          }}
          aria-pressed={isFav}
          title={isFav ? "Unstar this tuple" : "Star this tuple"}
        >
          {isFav ? "★" : "☆"}
        </button>
        <button
          type="button"
          onClick={() => store.rollDice()}
          className="px-3 py-2 text-sm rounded border"
          style={{
            borderColor: "var(--color-rule)",
            background: "var(--color-surface)",
            color: "var(--color-ink)",
          }}
          title={`Roll a random ${store.modeId}-legal dice tuple`}
        >
          roll
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="px-3 py-2 text-sm rounded border"
          style={{
            borderColor: "var(--color-rule)",
            background: "var(--color-surface)",
            color: "var(--color-ink)",
          }}
          title="Print the current Lookup view"
        >
          print
        </button>
      </div>
      {error !== null ? (
        <div id="dice-error" className="text-xs" style={{ color: "#c0392b" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
});
