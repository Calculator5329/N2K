import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext";
import { PageHeader } from "../_shared/PageHeader";
import { DiceGlyph } from "../../v1ui/DiceGlyph";
import { DifficultyMeter } from "../../v1ui/DifficultyMeter";
import { Equation } from "../../v1ui/Equation";
import { ThemeScope } from "../../v1ui/themeOverride";
import { THEMES, THEME_IDS, type ThemeId } from "../../core/themes";
import type { DiceTriple } from "../../core/types";

/**
 * Edition gallery — renders the same dice/target lookup through every
 * registered edition at once (currently `THEME_IDS.length`).
 *
 * Doubles as a visual regression surface: any per-theme breakage shows
 * up immediately because every card shares one input. Clicking a card
 * sets the global theme and jumps to the full Lookup view.
 *
 * Implementation notes:
 *
 *   - Each card wraps its preview in `<ThemeScope theme="…">`, which
 *     sets `data-theme` on a wrapper `<div>` (so the CSS-variable
 *     blocks in `globals.css` apply) AND pushes a context that the
 *     glyph + equation components read via `useActiveThemeId()`.
 *
 *   - Body-targeted theme rules (background images, etc.) are
 *     intentionally NOT replicated inside the cards; the cards use the
 *     theme's `--paper-*` / `--ink-*` variables for surface + ink so
 *     each card reads as that edition without becoming a full page.
 *
 *   - The dice + total picker is local React state — no need for a
 *     dedicated MobX store because nothing else reads from it. All
 *     equation lookups go through `data.ensureDice` so we share the
 *     same lazy cache the rest of the app uses.
 */
const DEFAULT_DICE: DiceTriple = [2, 3, 5];
const DEFAULT_TOTAL = 40;

// Spelled-out cardinals so the masthead reads "Seventeen editions, one
// lookup." rather than "17 editions" — matches the in-print voice of
// the rest of the almanac. Adding a new theme automatically picks the
// right word; we cap at twenty (the same range AboutView uses) and
// fall back to the digit if anyone ever blows past that.
const EDITION_COUNT_WORDS: Record<number, string> = {
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
  10: "ten",
  11: "eleven",
  12: "twelve",
  13: "thirteen",
  14: "fourteen",
  15: "fifteen",
  16: "sixteen",
  17: "seventeen",
  18: "eighteen",
  19: "nineteen",
  20: "twenty",
};

function clampDie(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(20, Math.round(value)));
}

function clampTotal(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(999, Math.round(value)));
}

function sortedDice(d1: number, d2: number, d3: number): DiceTriple {
  const sorted = [d1, d2, d3].sort((a, b) => a - b);
  return [sorted[0]!, sorted[1]!, sorted[2]!];
}

const Stepper = observer(function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="flex flex-col items-center gap-1">
      <span className="label-caps text-ink-100">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          aria-label={`decrement ${label}`}
          className="font-mono text-[14px] text-ink-100 hover:text-oxblood-500 px-2 py-1 border border-ink-100/20"
        >
          −
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 h-10 text-center bg-paper-100 border border-ink-100/30 font-mono text-[18px] tabular text-ink-500 focus:outline-none focus:border-oxblood-500 focus:ring-1 focus:ring-oxblood-500/40"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={`increment ${label}`}
          className="font-mono text-[14px] text-ink-100 hover:text-oxblood-500 px-2 py-1 border border-ink-100/20"
        >
          +
        </button>
      </div>
    </label>
  );
});

interface CardProps {
  themeId: ThemeId;
  dice: DiceTriple;
  total: number;
  isActive: boolean;
  onSelect: (id: ThemeId) => void;
}

const EditionCard = observer(function EditionCard({
  themeId,
  dice,
  total,
  isActive,
  onSelect,
}: CardProps) {
  const { data } = useStore();
  const theme = THEMES[themeId];

  useEffect(() => {
    data.ensureDice(dice);
  }, [data, dice]);

  const detail = data.diceState(dice);
  const equation =
    detail.status === "ready"
      ? (detail.value.solutions[String(total)]?.equation ?? null)
      : null;
  const difficulty =
    detail.status === "ready"
      ? (detail.value.solutions[String(total)]?.difficulty ?? null)
      : null;

  const isLoading = detail.status === "idle" || detail.status === "loading";
  const hadError = detail.status === "error";

  return (
    <ThemeScope
      theme={themeId}
      className={[
        "edition-card group relative flex flex-col overflow-hidden bg-paper-50 transition-shadow",
        isActive
          ? "ring-2 ring-oxblood-500"
          : "ring-1 ring-ink-100/15 hover:ring-ink-100/40",
      ].join(" ")}
    >
      {/* Header strip: edition swatches + label */}
      <header className="flex items-baseline justify-between gap-3 border-b border-ink-100/15 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span
            aria-hidden="true"
            className="inline-flex h-3 w-9 overflow-hidden rounded-[1px] ring-1 ring-ink-100/20"
            style={{ background: theme.swatches[0] }}
          >
            <span
              style={{ background: theme.swatches[1], width: "33%" }}
            />
            <span
              style={{ background: theme.swatches[2], width: "33%" }}
            />
          </span>
          <span className="font-display text-[15px] tracking-tight text-ink-500">
            {theme.label}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wide-caps text-ink-100">
          {theme.ornaments.mastheadSuffix}
        </span>
      </header>

      <p className="px-4 pt-3 text-[12px] italic text-ink-200">
        {theme.tagline}
      </p>

      <div className="flex flex-1 flex-col gap-3 px-4 pt-3 pb-4">
        <div className="flex items-center justify-between gap-3">
          <DiceGlyph dice={dice} size="sm" />
          <span className="font-mono text-[13px] tabular text-ink-100">
            → {total}
          </span>
        </div>

        <div className="min-h-[44px]" role="status" aria-live="polite">
          {isLoading && (
            <span className="font-mono text-[12px] italic text-ink-100">
              loading…
            </span>
          )}
          {hadError && (
            <span className="font-mono text-[12px] italic text-oxblood-500">
              load failed
            </span>
          )}
          {!isLoading && !hadError && equation === null && (
            <span className="font-mono text-[12px] italic text-ink-100">
              no solution at {total}
            </span>
          )}
          {!isLoading && !hadError && equation !== null && (
            <Equation equation={equation} size="inline" />
          )}
        </div>

        <DifficultyMeter difficulty={difficulty} size="sm" />
      </div>

      <button
        type="button"
        onClick={() => onSelect(themeId)}
        className="border-t border-ink-100/15 bg-paper-100 px-4 py-2 text-left font-mono text-[11px] uppercase tracking-wide-caps text-ink-200 transition-colors hover:bg-oxblood-500 hover:text-paper-50"
      >
        {isActive ? "● Active edition" : "→ Open in this edition"}
      </button>
    </ThemeScope>
  );
});

export const GalleryView = observer(function GalleryView() {
  const store = useStore();
  const [d1, setD1] = useState<number>(DEFAULT_DICE[0]);
  const [d2, setD2] = useState<number>(DEFAULT_DICE[1]);
  const [d3, setD3] = useState<number>(DEFAULT_DICE[2]);
  const [total, setTotal] = useState<number>(DEFAULT_TOTAL);

  const dice = sortedDice(d1, d2, d3);
  const activeTheme = store.theme.theme;
  // Spell out the edition count so the masthead reads "Seventeen
  // editions, one lookup." Falls back to the digit if the registry
  // ever exceeds the lookup table (currently capped at twenty —
  // mirrors `AboutView`'s `NUMBER_WORDS`).
  const editionCount = THEME_IDS.length;
  const editionCountWord =
    EDITION_COUNT_WORDS[editionCount] ?? editionCount.toLocaleString();

  const selectEdition = (id: ThemeId) => {
    store.theme.setTheme(id);
    // The user clicked into a card to "open in this edition" — jump
    // to the full Lookup view so they can see the chosen edition
    // applied to the live page chrome, not just the preview tile.
    store.setView("lookup");
  };

  return (
    <article>
      <PageHeader
        folio="VI"
        eyebrow="Gallery"
        title={
          <>
            {editionCountWord.charAt(0).toUpperCase() + editionCountWord.slice(1)} editions,
            <br />
            one lookup.
          </>
        }
        dek="Every theme rendering the same dice + target. Useful for browsing the catalogue, picking a favorite edition, and spotting per-theme regressions side by side."
      />

      {/* Dice + total picker */}
      <section
        aria-label="Lookup parameters"
        className="mb-8 flex flex-wrap items-end gap-6 border border-ink-100/15 bg-paper-100/40 px-5 py-4 sm:gap-8"
      >
        <div className="flex items-end gap-3 sm:gap-4">
          <Stepper
            label="Die 1"
            value={d1}
            min={1}
            max={20}
            onChange={(v) => setD1(clampDie(v))}
          />
          <Stepper
            label="Die 2"
            value={d2}
            min={1}
            max={20}
            onChange={(v) => setD2(clampDie(v))}
          />
          <Stepper
            label="Die 3"
            value={d3}
            min={1}
            max={20}
            onChange={(v) => setD3(clampDie(v))}
          />
        </div>
        <div className="h-12 w-px self-end bg-ink-100/20" aria-hidden="true" />
        <Stepper
          label="Target"
          value={total}
          min={1}
          max={999}
          onChange={(v) => setTotal(clampTotal(v))}
        />
        <div className="ml-auto flex flex-col items-end gap-1 self-end">
          <span className="label-caps text-ink-100">Showing</span>
          <span className="font-mono text-[14px] tabular text-ink-500">
            {dice[0]}, {dice[1]}, {dice[2]} → {total}
          </span>
        </div>
      </section>

      <section
        aria-label="Edition gallery"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {THEME_IDS.map((id) => (
          <EditionCard
            key={id}
            themeId={id}
            dice={dice}
            total={total}
            isActive={id === activeTheme}
            onSelect={selectEdition}
          />
        ))}
      </section>

      <p className="mt-10 max-w-[640px] text-[13px] italic leading-snug text-ink-200">
        Click any card to switch the rest of the almanac into that
        edition. The active edition is outlined in oxblood. Each card
        loads the same per-dice JSON the Lookup view uses, so the
        equation, difficulty, and "no solution" states are consistent
        with the canonical view.
      </p>
    </article>
  );
});
