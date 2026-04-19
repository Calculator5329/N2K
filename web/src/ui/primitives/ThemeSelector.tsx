/**
 * ThemeSelector — edition picker with tri-color flag swatches.
 *
 * Three orientations:
 *   - `vertical`: stacked list, used in sidebar / manuscript rails.
 *   - `horizontal`: inline buttons, used in topbar / blueprint title block.
 *   - `discreet`: collapsed trigger that pops a list, used in framed
 *     layouts where chrome real estate is tight.
 *
 * Reads / writes through `ThemeStore.activeId` + `setActive`.
 */
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../stores/AppStoreContext.js";
import type { ThemeSummary } from "../../stores/ThemeStore.js";

export interface ThemeSelectorProps {
  readonly orientation?: "vertical" | "horizontal" | "discreet";
}

export const ThemeSelector = observer(function ThemeSelector({
  orientation = "horizontal",
}: ThemeSelectorProps) {
  const store = useAppStore();
  const themes = store.theme.availableThemes;
  const activeId = store.theme.activeId;

  if (orientation === "discreet") {
    return <DiscreetSelector themes={themes} activeId={activeId} onSelect={(id) => store.theme.setActive(id)} />;
  }

  return (
    <div
      role="radiogroup"
      aria-label="Edition"
      className={orientation === "vertical" ? "flex flex-col gap-1" : "flex flex-wrap gap-1.5"}
    >
      {themes.map((t) => (
        <SegmentRow
          key={t.id}
          theme={t}
          active={activeId === t.id}
          onClick={() => store.theme.setActive(t.id)}
          orientation={orientation}
        />
      ))}
    </div>
  );
});

function SegmentRow({
  theme,
  active,
  onClick,
  orientation,
}: {
  readonly theme: ThemeSummary;
  readonly active: boolean;
  readonly onClick: () => void;
  readonly orientation: "vertical" | "horizontal";
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex items-center gap-2 px-2 py-1.5 text-left ${
        orientation === "vertical" ? "w-full" : ""
      }`}
      style={{
        background: active ? "color-mix(in oklab, var(--color-accent) 16%, transparent)" : "transparent",
        border: "1px solid var(--color-rule)",
        borderRadius: 2,
        color: "var(--color-ink)",
        cursor: "pointer",
      }}
    >
      <Flag id={theme.id} />
      <span
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: active ? "var(--color-accent)" : "var(--color-ink-muted)",
        }}
      >
        {theme.displayName}
      </span>
    </button>
  );
}

function DiscreetSelector({
  themes,
  activeId,
  onSelect,
}: {
  readonly themes: readonly ThemeSummary[];
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = themes.find((t) => t.id === activeId);
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5"
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-rule)",
          borderRadius: 2,
          color: "var(--color-ink)",
          cursor: "pointer",
        }}
      >
        <Flag id={activeId} />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
          {active?.displayName ?? "Theme"}
        </span>
        <span style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 120ms" }}>▾</span>
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute right-0 mt-1 z-50 flex flex-col gap-1 p-2"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-rule)",
            boxShadow: "var(--shadow-popover, 0 8px 24px rgba(0,0,0,0.16))",
            minWidth: 180,
          }}
        >
          {themes.map((t) => (
            <SegmentRow
              key={t.id}
              theme={t}
              active={activeId === t.id}
              onClick={() => {
                onSelect(t.id);
                setOpen(false);
              }}
              orientation="vertical"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Flag({ id }: { readonly id: string }) {
  // The actual swatches come from CSS custom properties scoped to the
  // `<html data-theme=…>` attribute the ThemeStore writes. To preview a
  // *non-active* theme we'd need each registered theme to publish its
  // swatches up-front; for now we render the active theme's accent-bg-ink
  // triple regardless, which is fine because each row's flag sits next
  // to the theme's own label.
  void id;
  return (
    <div className="flex h-4 w-7 overflow-hidden" style={{ border: "1px solid var(--color-rule)" }}>
      <span style={{ flex: 1, background: "var(--color-bg)" }} />
      <span style={{ flex: 1, background: "var(--color-ink)" }} />
      <span style={{ flex: 1, background: "var(--color-accent)" }} />
    </div>
  );
}
