import { observer } from "mobx-react-lite";
import type { LookupModeId, LookupStore } from "../../stores/LookupStore.js";

const MODES: ReadonlyArray<{ id: LookupModeId; label: string }> = [
  { id: "standard", label: "Standard" },
  { id: "aether", label: "Æther" },
];

export interface ModePickerProps {
  readonly store: LookupStore;
}

export const ModePicker = observer(function ModePicker({ store }: ModePickerProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="text-xs uppercase tracking-wider"
        style={{ color: "var(--color-ink-muted)" }}
      >
        Mode
      </span>
      <div
        className="inline-flex rounded border overflow-hidden self-start"
        style={{ borderColor: "var(--color-rule)" }}
        role="radiogroup"
        aria-label="Mode"
      >
        {MODES.map((m) => {
          const active = store.modeId === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => store.setMode(m.id)}
              className="px-3 py-1.5 text-sm"
              style={{
                background: active ? "var(--color-accent)" : "var(--color-surface)",
                color: active ? "var(--color-bg)" : "var(--color-ink)",
                borderRight:
                  m.id === MODES[MODES.length - 1]!.id
                    ? "none"
                    : `1px solid var(--color-rule)`,
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
});
