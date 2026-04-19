import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../v1stores/storeContext.js";
import { THEME_IDS, THEMES, type ThemeId } from "../core/themes.js";

/**
 * Edition switcher. Renders one segment per registered theme, each with a
 * tiny tri-color flag (surface / ink / accent) plus a short label.
 *
 * Three orientations:
 *   "vertical"   — list, used in the sidebar layout
 *   "horizontal" — compact row, used in the topbar masthead
 *   "discreet"   — small swatch+caret button that opens a popover; used by
 *                  layouts (Tabletop, Frame, …) where the picker should
 *                  recede from view rather than dominate the chrome
 *
 * Keeps working with any number of themes — no hard-coded grid sizing.
 */
type Orientation = "vertical" | "horizontal" | "discreet";

export const ThemeSelector = observer(function ThemeSelector({
  orientation = "vertical",
}: {
  orientation?: Orientation;
}) {
  const { theme: themeStore } = useStore();
  const active = themeStore.theme;

  if (orientation === "discreet") {
    return <DiscreetSelector active={active} onSelect={(id) => themeStore.setTheme(id)} />;
  }

  if (orientation === "horizontal") {
    return (
      <div className="space-y-1 min-w-0 max-w-full w-full">
        <div className="label-caps text-right">Edition</div>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="flex max-w-full flex-wrap items-stretch justify-end gap-1 p-1 border border-ink-100/30"
          style={{ borderRadius: "2px" }}
        >
          {THEME_IDS.map((id) => (
            <SegmentCompact
              key={id}
              id={id}
              active={active === id}
              onSelect={() => themeStore.setTheme(id)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="label-caps">Edition</div>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="flex flex-col gap-px p-1 border border-ink-100/25"
        style={{ borderRadius: "2px" }}
      >
        {THEME_IDS.map((id) => (
          <SegmentRow
            key={id}
            id={id}
            active={active === id}
            onSelect={() => themeStore.setTheme(id)}
          />
        ))}
      </div>
      <div className="font-mono text-[10px] text-ink-100 italic px-1">
        {THEMES[active].tagline}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
//  Vertical: full row with flag + label, listed top-to-bottom
// ---------------------------------------------------------------------------
function SegmentRow({
  id,
  active,
  onSelect,
}: {
  id: ThemeId;
  active: boolean;
  onSelect: () => void;
}) {
  const theme = THEMES[id];
  const [surface, ink, accent] = theme.swatches;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      title={`${theme.label} — ${theme.tagline}`}
      className={[
        "group flex items-center gap-2.5 px-2 py-1.5 transition-colors text-left",
        active ? "bg-paper-200/70" : "hover:bg-paper-100/60",
      ].join(" ")}
      style={{ borderRadius: "2px" }}
    >
      <Flag surface={surface} ink={ink} accent={accent} active={active} />
      <span
        className={[
          "font-mono text-[10px] uppercase tracking-wide-caps",
          active ? "text-ink-400" : "text-ink-100 group-hover:text-ink-300",
        ].join(" ")}
      >
        {theme.label}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
//  Horizontal: just the flag + tiny label, packed tightly for a topbar
// ---------------------------------------------------------------------------
function SegmentCompact({
  id,
  active,
  onSelect,
}: {
  id: ThemeId;
  active: boolean;
  onSelect: () => void;
}) {
  const theme = THEMES[id];
  const [surface, ink, accent] = theme.swatches;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      title={`${theme.label} — ${theme.tagline}`}
      className={[
        "group flex flex-col items-center gap-1 px-2 py-1.5 transition-colors",
        active ? "bg-paper-200/70" : "hover:bg-paper-100/60",
      ].join(" ")}
      style={{ borderRadius: "2px" }}
    >
      <Flag surface={surface} ink={ink} accent={accent} active={active} />
      <span
        className={[
          "font-mono text-[8px] uppercase tracking-wide-caps",
          active ? "text-ink-400" : "text-ink-100 group-hover:text-ink-300",
        ].join(" ")}
      >
        {theme.label}
      </span>
    </button>
  );
}

function Flag({
  surface,
  ink,
  accent,
  active,
}: {
  surface: string;
  ink: string;
  accent: string;
  active: boolean;
}) {
  return (
    <div
      className={[
        "flex w-8 h-4 overflow-hidden border",
        active ? "border-ink-400" : "border-ink-100/40",
      ].join(" ")}
      style={{ borderRadius: "1px" }}
      aria-hidden="true"
    >
      <span style={{ background: surface, flex: 2 }} />
      <span style={{ background: ink, flex: 1 }} />
      <span style={{ background: accent, flex: 2 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Discreet: small swatch+caret trigger; full picker opens in a popover.
//  The trigger renders just a tiny tri-color flag and the current edition
//  name, so it recedes into the layout chrome (footer / corner) instead of
//  dominating it. The popover uses the SegmentRow list internally.
// ---------------------------------------------------------------------------
function DiscreetSelector({
  active,
  onSelect,
}: {
  active: ThemeId;
  onSelect: (id: ThemeId) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const theme = THEMES[active];
  const [surface, ink, accent] = theme.swatches;

  useEffect(() => {
    if (!open) return;
    function onDocDown(ev: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(ev.target as Node)) setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Edition: ${theme.label}. Click to change.`}
        onClick={() => setOpen((v) => !v)}
        className="group inline-flex items-center gap-2 px-2 py-1 transition-colors hover:bg-paper-200/60"
        style={{ borderRadius: "2px" }}
      >
        <Flag surface={surface} ink={ink} accent={accent} active={true} />
        <span className="font-mono text-[10px] uppercase tracking-wide-caps text-ink-300 group-hover:text-ink-400">
          {theme.label}
        </span>
        <svg
          aria-hidden="true"
          width="8"
          height="6"
          viewBox="0 0 8 6"
          className="text-ink-200"
          style={{
            transform: open ? "rotate(180deg)" : undefined,
            transition: "transform 120ms ease",
          }}
        >
          <path d="M0 1 L4 5 L8 1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choose edition"
          className="absolute z-50 mt-1 right-0 min-w-[180px] p-1 shadow-lg"
          style={{
            background: "rgb(var(--paper-50))",
            border: "1px solid rgb(var(--ink-300))",
            borderRadius: "2px",
            // Hard offset shadow keeps the popover feeling part of the
            // tabletop / boardgame motif without being theme-coupled.
            boxShadow: "3px 3px 0 0 rgba(0,0,0,0.18)",
            maxHeight: "min(60vh, 380px)",
            overflowY: "auto",
          }}
        >
          <div className="flex flex-col gap-px">
            {THEME_IDS.map((id) => (
              <SegmentRow
                key={id}
                id={id}
                active={active === id}
                onSelect={() => {
                  onSelect(id);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
