/**
 * `LibraryView` — Section IV: locally-saved competitions.
 *
 * Lists every entry persisted under `compose:saved:{id}`, sorted by
 * "last played" by default (with toggles for "Updated" + "Name"). Each
 * card surfaces the comp name, generation status, phase/board/bout
 * counts, last-played timestamp, best avg score, and an action row:
 *
 *   - Open in Compose      (autosave routes to this entry)
 *   - Play                  (opens the format/persona picker)
 *   - Overflow → rename / duplicate / history / delete
 *
 * Clean-room single-player surface — no auth, no remote state. Every
 * write goes through `LibraryStore` → `CompetitionLibrary` →
 * `ContentBackend` (LocalStorage today).
 */
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useStore } from "../../stores/AppStoreContext.js";
import { PageHeader } from "../../ui/primitives/PageHeader.js";
import {
  BOT_PERSONAS,
  MatchStore,
  type BotPersona,
} from "../match/MatchStore.js";
import { defaultCompetitionLibrary } from "../../services/competitionLibrary.js";
import type { LibraryEntry } from "../../services/competitionLibrary.js";
import type { LibraryStore } from "./LibraryStore.js";
import type { MatchFormat, MatchRecord } from "../../services/matchStats.js";
import type { CompositionStore, SharedPlanV5 } from "../compose/CompositionStore.js";

export const LibraryView = observer(function LibraryView() {
  const root = useStore();
  const lib = root.library;
  const compose = root.composition;

  useEffect(() => {
    void lib.refresh();
  }, [lib]);

  return (
    <article>
      <div className="no-print">
        <PageHeader
          folio="IV"
          eyebrow="Library"
          title={
            <>
              Saved competitions,{" "}
              <span
                className="italic text-oxblood-500"
                style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}
              >
                ready to play.
              </span>
            </>
          }
          dek="Every comp you save in Compose lands here. Open one to keep editing, or hit Play to race the boards against a bot — vs-bot or pass-the-device hot-seat."
          right={<NewCompButton />}
        />
      </div>

      <Toolbar lib={lib} />
      <EntriesList lib={lib} compose={compose} />

      <DialogHost lib={lib} compose={compose} />
    </article>
  );
});

const NewCompButton = observer(function NewCompButton() {
  const root = useStore();
  return (
    <button
      type="button"
      onClick={() => {
        root.composition.resetToDefault();
        root.setView("compose");
      }}
      className="px-4 py-2 font-mono uppercase tracking-wide-caps text-[11px] text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90 transition-colors"
      style={{ borderRadius: "2px" }}
    >
      + New competition
    </button>
  );
});

const Toolbar = observer(function Toolbar({ lib }: { lib: LibraryStore }) {
  return (
    <div className="flex items-baseline justify-between mt-2 mb-6">
      <div className="label-caps">Sort by</div>
      <div
        className="inline-flex border border-ink-100/30"
        style={{ borderRadius: "2px" }}
      >
        <SortPill label="Last played" active={lib.sort === "last-played"} onClick={() => lib.setSort("last-played")} />
        <SortPill label="Updated"     active={lib.sort === "updated"}     onClick={() => lib.setSort("updated")} />
        <SortPill label="Name"        active={lib.sort === "name"}        onClick={() => lib.setSort("name")} />
      </div>
    </div>
  );
});

function SortPill(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={[
        "px-3 py-1 text-[11px] font-mono uppercase tracking-wide-caps transition-colors",
        props.active ? "bg-oxblood-500 text-paper-50" : "text-ink-300 hover:text-oxblood-500",
      ].join(" ")}
    >
      {props.label}
    </button>
  );
}

const EntriesList = observer(function EntriesList({
  lib,
  compose,
}: {
  lib: LibraryStore;
  compose: CompositionStore;
}) {
  if (lib.loadingState === "loading") {
    return <p className="text-[12px] italic text-ink-200">Loading library…</p>;
  }
  if (lib.loadingState === "error") {
    return (
      <p className="text-[12px] font-mono text-oxblood-500">
        Failed to load library: {lib.errorMessage}
      </p>
    );
  }
  if (lib.entries.length === 0) {
    return (
      <section className="text-center py-16 border border-dashed border-ink-100/40" style={{ borderRadius: "3px" }}>
        <div
          className="font-display text-[28px] text-ink-300 mb-3"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
        >
          No saved competitions yet
        </div>
        <p className="text-[13px] italic text-ink-200 max-w-md mx-auto mb-6">
          Build a competition in Compose, hit <em>Save as new</em>, and it'll appear
          here for one-click play.
        </p>
        <NewCompButton />
      </section>
    );
  }
  return (
    <ul className="space-y-3">
      {lib.sortedEntries.map((entry) => (
        <EntryCard key={entry.id} entry={entry} lib={lib} compose={compose} />
      ))}
    </ul>
  );
});

const EntryCard = observer(function EntryCard({
  entry,
  lib,
  compose,
}: {
  entry: LibraryEntry;
  lib: LibraryStore;
  compose: CompositionStore;
}) {
  const root = useStore();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const lastPlayed = lib.lastPlayedAt(entry.id);
  const bestAvg = lib.bestAvgScore(entry.id);
  const playCount = lib.playCount(entry.id);
  const isOpenedHere = compose.openedLibraryId === entry.id;

  return (
    <li
      className="p-4 border border-ink-100/30 bg-paper-50 flex gap-4 flex-wrap items-start"
      style={{ borderRadius: "3px" }}
    >
      <CardThumbnail cells={entry.firstBoardCells} />
      <div className="flex-1 min-w-[220px]">
        <div className="flex items-baseline gap-2 flex-wrap">
          <div
            className="font-display text-[22px] text-ink-500 leading-tight"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
          >
            {entry.name}
          </div>
          <ModeBadge rules={entry.rules} />
          {!entry.isGenerated && (
            <span className="font-mono uppercase tracking-wide-caps text-[10px] text-oxblood-500 px-1.5 py-0.5 border border-oxblood-500/40" style={{ borderRadius: "2px" }}>
              Draft
            </span>
          )}
          {isOpenedHere && (
            <span className="font-mono uppercase tracking-wide-caps text-[10px] text-support-500">
              · open in Compose
            </span>
          )}
        </div>
        <div className="mt-1 font-mono text-[11px] text-ink-200 flex flex-wrap gap-x-3 gap-y-1">
          <span>{entry.phaseCount} phase{entry.phaseCount === 1 ? "" : "s"}</span>
          <span className="text-ink-100/60">·</span>
          <span>{entry.boardCount} board{entry.boardCount === 1 ? "" : "s"}</span>
          <span className="text-ink-100/60">·</span>
          <span>{entry.boutCount} bout{entry.boutCount === 1 ? "" : "s"}</span>
          <span className="text-ink-100/60">·</span>
          <span title={entry.updatedAt}>updated {formatRelative(entry.updatedAt)}</span>
        </div>
        <div className="mt-2 font-mono text-[11px] text-ink-200 flex flex-wrap gap-x-3 gap-y-1">
          <span>
            <span className="label-caps mr-1.5 text-ink-100">Plays</span>
            {playCount}
          </span>
          <span className="text-ink-100/60">·</span>
          <span title={lastPlayed ?? "never"}>
            <span className="label-caps mr-1.5 text-ink-100">Last</span>
            {lastPlayed === null ? "never" : formatRelative(lastPlayed)}
          </span>
          <span className="text-ink-100/60">·</span>
          <span>
            <span className="label-caps mr-1.5 text-ink-100">Best avg</span>
            {bestAvg === null ? "—" : Math.round(bestAvg).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          onClick={async () => {
            const ok = await compose.loadFromContentBackend(entry.id);
            if (ok) root.setView("compose");
          }}
          className="px-3 py-1.5 font-mono uppercase tracking-wide-caps text-[11px] text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
          style={{ borderRadius: "2px" }}
        >
          Open
        </button>
        <button
          type="button"
          onClick={() => {
            if (!entry.isGenerated) return;
            lib.openPlayPicker(entry.id);
          }}
          disabled={!entry.isGenerated}
          title={entry.isGenerated ? "Pick format + persona, then race" : "Generate the comp in Compose first"}
          className={[
            "px-4 py-1.5 font-mono uppercase tracking-wide-caps text-[11px] transition-colors",
            entry.isGenerated
              ? "text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90"
              : "text-ink-100 bg-ink-100/20 cursor-not-allowed",
          ].join(" ")}
          style={{ borderRadius: "2px" }}
        >
          ▶ Play
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOverflowOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            className="px-2 py-1.5 font-mono text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
            style={{ borderRadius: "2px" }}
          >
            ⋯
          </button>
          {overflowOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-30 min-w-[180px] bg-paper-50 border border-ink-300 shadow-lg py-1"
              style={{ borderRadius: "3px" }}
            >
              <OverflowItem
                label="Rename"
                onClick={() => {
                  setOverflowOpen(false);
                  lib.openRename(entry);
                }}
              />
              <OverflowItem
                label="Duplicate"
                onClick={async () => {
                  setOverflowOpen(false);
                  await lib.duplicate(entry.id);
                }}
              />
              <OverflowItem
                label="View history"
                onClick={() => {
                  setOverflowOpen(false);
                  lib.openHistory(entry.id);
                }}
              />
              <OverflowItem
                label="Delete"
                destructive
                onClick={async () => {
                  setOverflowOpen(false);
                  if (!confirm(`Delete "${entry.name}"? This cannot be undone.`)) return;
                  await lib.remove(entry.id);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </li>
  );
});

/**
 * 6x6 mini grid showing the first generated board's layout. Cells are
 * rendered with a subtle gradient based on their value so the user
 * gets a glanceable sense of the board's "shape" (e.g. ascending
 * pattern boards lean dark in one corner, random boards look
 * speckled). Falls back to a neutral placeholder when the comp hasn't
 * been generated yet.
 */
function CardThumbnail({ cells }: { cells: readonly number[] }) {
  if (cells.length !== 36) {
    return (
      <div
        className="shrink-0 w-[88px] h-[88px] border border-ink-100/30 bg-paper-100 flex items-center justify-center"
        style={{ borderRadius: "3px" }}
        aria-hidden
      >
        <span className="font-mono text-[10px] text-ink-100 uppercase tracking-wide-caps">
          —
        </span>
      </div>
    );
  }
  // Normalise into 0..1 so the colour ramp works whether the comp is
  // a 1..36 pattern board or an Æther random board with negatives.
  let min = Infinity;
  let max = -Infinity;
  for (const v of cells) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = Math.max(1, max - min);
  return (
    <div
      className="shrink-0 p-1 border border-ink-300 bg-paper-50"
      style={{ borderRadius: "3px" }}
      aria-hidden
    >
      <div
        className="grid gap-px"
        style={{
          gridTemplateColumns: "repeat(6, 12px)",
          gridAutoRows: "12px",
        }}
      >
        {cells.map((v, i) => {
          const t = (v - min) / span;
          // Oxblood ramp from paper-50 to ~oxblood-500. Inline rgba so
          // we don't have to ship a Tailwind palette for this.
          const alpha = 0.12 + t * 0.78;
          return (
            <span
              key={i}
              style={{
                background: `rgba(120, 22, 32, ${alpha.toFixed(2)})`,
                borderRadius: "1px",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Small chip showing which rule set the comp uses (Standard vs Æther). */
function ModeBadge({ rules }: { rules: "standard" | "aether" }) {
  const isAether = rules === "aether";
  return (
    <span
      className={[
        "font-mono uppercase tracking-wide-caps text-[10px] px-1.5 py-0.5 border",
        isAether
          ? "text-oxblood-500 border-oxblood-500/40 bg-oxblood-500/5"
          : "text-ink-200 border-ink-100/40 bg-paper-100",
      ].join(" ")}
      style={{ borderRadius: "2px" }}
      title={isAether ? "Generated under Æther rules" : "Generated under Standard rules"}
    >
      {isAether ? "Æther" : "Standard"}
    </span>
  );
}

function OverflowItem(props: { label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      role="menuitem"
      className={[
        "block w-full text-left px-3 py-1.5 text-[12px] font-mono",
        props.destructive
          ? "text-oxblood-500 hover:bg-oxblood-500/10"
          : "text-ink-300 hover:bg-paper-100",
      ].join(" ")}
    >
      {props.label}
    </button>
  );
}

// ---------------------------------------------------------------------------
//  Dialogs
// ---------------------------------------------------------------------------

const DialogHost = observer(function DialogHost({
  lib,
  compose,
}: {
  lib: LibraryStore;
  compose: CompositionStore;
}) {
  const dialog = lib.dialog;
  if (dialog.kind === "none") return null;
  if (dialog.kind === "rename") {
    return <RenameDialog lib={lib} entryId={dialog.entryId} currentName={dialog.currentName} />;
  }
  if (dialog.kind === "save-as") {
    return <SaveAsDialog lib={lib} compose={compose} suggestedName={dialog.suggestedName} />;
  }
  if (dialog.kind === "history") {
    return <HistoryDialog lib={lib} entryId={dialog.entryId} />;
  }
  if (dialog.kind === "play-picker") {
    return <PlayPickerDialog lib={lib} entryId={dialog.entryId} />;
  }
  return null;
});

export const RenameDialog = observer(function RenameDialog({
  lib,
  entryId,
  currentName,
}: {
  lib: LibraryStore;
  entryId: string;
  currentName: string;
}) {
  const [name, setName] = useState(currentName);
  return (
    <ModalShell title="Rename competition" onClose={() => lib.closeDialog()}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 text-[14px] border border-ink-100/40 bg-paper-50"
        style={{ borderRadius: "2px" }}
      />
      <ModalActions>
        <ModalButton onClick={() => lib.closeDialog()}>Cancel</ModalButton>
        <ModalButton
          primary
          onClick={async () => {
            const ok = await lib.rename(entryId, name);
            if (ok) lib.closeDialog();
          }}
        >
          Rename
        </ModalButton>
      </ModalActions>
    </ModalShell>
  );
});

export const SaveAsDialog = observer(function SaveAsDialog({
  lib,
  compose,
  suggestedName,
}: {
  lib: LibraryStore;
  compose: CompositionStore;
  suggestedName: string;
}) {
  const [name, setName] = useState(suggestedName);
  // Guard against double-fire: a rapid second click on Save (or
  // Enter spam) used to land a second `createFromSnapshot` before
  // the first await resolved + closed the dialog. With the dialog
  // now properly dismissing on Cancel/Save, this is mostly belt-
  // and-suspenders — but also covers the "user mashes Save while
  // the backend is slow" case.
  const [saving, setSaving] = useState(false);
  const fullyGenerated = compose.isFullyGenerated;

  async function handleSave() {
    if (saving) return;
    const trimmed = name.trim();
    if (trimmed === "" || !fullyGenerated) return;
    setSaving(true);
    try {
      const snap = compose.snapshot();
      const id = await lib.createFromSnapshot(trimmed, snap);
      compose.setName(trimmed);
      compose.attachToLibrary(id);
      lib.closeDialog();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Save as new" onClose={() => { if (!saving) lib.closeDialog(); }}>
      {!fullyGenerated && (
        <p className="mb-3 text-[12px] font-mono text-oxblood-500">
          Generate every board first — ungenerated competitions can't be saved.
        </p>
      )}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleSave();
        }}
        placeholder="Competition name"
        disabled={saving}
        className="w-full px-3 py-2 text-[14px] border border-ink-100/40 bg-paper-50 disabled:opacity-50"
        style={{ borderRadius: "2px" }}
      />
      <ModalActions>
        <ModalButton disabled={saving} onClick={() => lib.closeDialog()}>Cancel</ModalButton>
        <ModalButton
          primary
          disabled={!fullyGenerated || name.trim() === "" || saving}
          onClick={handleSave}
        >
          {saving ? "Saving…" : "Save"}
        </ModalButton>
      </ModalActions>
    </ModalShell>
  );
});

const PlayPickerDialog = observer(function PlayPickerDialog({
  lib,
  entryId,
}: {
  lib: LibraryStore;
  entryId: string;
}) {
  const root = useStore();
  const [format, setFormat] = useState<MatchFormat>("vs-bot");
  const [persona, setPersona] = useState<BotPersona>(BOT_PERSONAS[1]!);
  const entry = lib.entries.find((e) => e.id === entryId);
  if (entry === undefined) return null;

  return (
    <ModalShell
      title={`Play "${entry.name}"`}
      onClose={() => lib.closeDialog()}
      maxWidthClass="max-w-[560px]"
    >
      <section className="mb-4">
        <div className="label-caps mb-2">Format</div>
        <div
          className="inline-flex border border-ink-100/30"
          style={{ borderRadius: "2px" }}
        >
          <FormatPill
            label="vs Bot"
            active={format === "vs-bot"}
            onClick={() => setFormat("vs-bot")}
          />
          <FormatPill
            label="Hot-seat"
            active={format === "hot-seat"}
            onClick={() => setFormat("hot-seat")}
          />
        </div>
        <p className="mt-2 text-[11px] italic text-ink-200 leading-snug">
          {format === "vs-bot"
            ? "You play P1, the bot plays P2. Each bout is one race; scores accumulate."
            : "Pass the device — you play P1's race, then again as P2 each bout. Two scoreboards."}
        </p>
      </section>

      {format === "vs-bot" && (
        <section className="mb-4">
          <div className="label-caps mb-2">Bot persona</div>
          <div className="grid grid-cols-5 border border-ink-100/30 divide-x divide-ink-100/30">
            {BOT_PERSONAS.map((p) => (
              <button
                key={p.difficulty}
                type="button"
                onClick={() => setPersona(p)}
                className={[
                  "px-2 py-2 text-center transition-colors",
                  persona.difficulty === p.difficulty
                    ? "bg-oxblood-500 text-paper-50"
                    : "text-ink-300 hover:text-oxblood-500",
                ].join(" ")}
              >
                <div
                  className="font-display text-[12px] leading-tight break-words"
                  style={{ fontVariationSettings: '"opsz" 60, "SOFT" 30' }}
                >
                  {p.name}
                </div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-wide-caps">
                  {p.difficulty}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <ModalActions>
        <ModalButton onClick={() => lib.closeDialog()}>Cancel</ModalButton>
        <ModalButton
          primary
          onClick={async () => {
            const doc = await defaultCompetitionLibrary.load(entryId);
            if (doc === null || doc.body.version !== 5) return;
            const match = new MatchStore(undefined, async (record: MatchRecord) => {
              await lib.refreshStats();
              // Match record is recorded; the MatchView wraps up.
              void record;
            });
            const ok = match.launch({
              compId: entryId,
              body: doc.body,
              format,
              persona: format === "vs-bot" ? persona : undefined,
            });
            if (!ok) {
              alert("Couldn't start — every board needs a generated result.");
              return;
            }
            match.attachAutosave();
            root.setMatch(match);
            lib.closeDialog();
            root.setView("play");
          }}
        >
          Begin
        </ModalButton>
      </ModalActions>
    </ModalShell>
  );
});

function FormatPill(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={[
        "px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide-caps transition-colors",
        props.active ? "bg-oxblood-500 text-paper-50" : "text-ink-300 hover:text-oxblood-500",
      ].join(" ")}
    >
      {props.label}
    </button>
  );
}

const HistoryDialog = observer(function HistoryDialog({
  lib,
  entryId,
}: {
  lib: LibraryStore;
  entryId: string;
}) {
  const stats = lib.statsByCompId.get(entryId);
  const entry = lib.entries.find((e) => e.id === entryId);
  return (
    <ModalShell title={`History — ${entry?.name ?? "competition"}`} onClose={() => lib.closeDialog()}>
      {stats === undefined || stats.matches.length === 0 ? (
        <p className="text-[12px] italic text-ink-200">No matches recorded yet.</p>
      ) : (
        <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
          {[...stats.matches].reverse().map((m) => (
            <li
              key={m.matchId}
              className="px-3 py-2 border border-ink-100/30 bg-paper-50 font-mono text-[11px] text-ink-300"
              style={{ borderRadius: "2px" }}
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="label-caps text-oxblood-500">{m.format}</span>
                <span>{formatRelative(m.finishedAt)}</span>
                <span className="text-ink-100/60">·</span>
                <span>{m.userRaceCount} race{m.userRaceCount === 1 ? "" : "s"}</span>
                <span className="text-ink-100/60">·</span>
                <span>
                  outcome <strong className={m.outcome === "win" ? "text-oxblood-500" : "text-ink-300"}>{m.outcome}</strong>
                </span>
              </div>
              <div className="mt-1">
                {m.format === "hot-seat" && m.userTotalsBySeat !== null
                  ? `P1: ${m.userTotalsBySeat.P1.toLocaleString()} · P2: ${m.userTotalsBySeat.P2.toLocaleString()}`
                  : `You ${m.userTotalScore.toLocaleString()} — ${m.bots[0]?.name ?? "Opponent"} ${m.opponentTotalScore.toLocaleString()}`}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ModalActions>
        <ModalButton onClick={() => lib.closeDialog()}>Close</ModalButton>
      </ModalActions>
    </ModalShell>
  );
});

// ---------------------------------------------------------------------------
//  Modal primitives
// ---------------------------------------------------------------------------

function ModalShell(props: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  /** Tailwind max-width utility. Defaults to `max-w-[480px]` (the
   * single-input dialogs); pickers with denser content (e.g. the
   * 5-column bot persona grid in PlayPickerDialog) widen to fit. */
  maxWidthClass?: string;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      className="fixed inset-0 z-40 bg-ink-500/40 flex items-start justify-center pt-24 px-4"
      onClick={props.onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${props.maxWidthClass ?? "max-w-[480px]"} bg-paper-50 border border-ink-300 p-6 shadow-2xl`}
        style={{ borderRadius: "4px" }}
      >
        <div
          className="font-display text-[24px] mb-4 text-ink-500"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
        >
          {props.title}
        </div>
        {props.children}
      </div>
    </div>
  );
}

function ModalActions(props: { children: React.ReactNode }) {
  return <div className="mt-5 flex items-center justify-end gap-3">{props.children}</div>;
}

function ModalButton(props: {
  children: React.ReactNode;
  onClick: () => void | Promise<void>;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => void props.onClick()}
      disabled={props.disabled}
      className={[
        "px-4 py-1.5 font-mono uppercase tracking-wide-caps text-[11px] transition-colors",
        props.disabled
          ? "bg-ink-100/20 text-ink-100 cursor-not-allowed"
          : props.primary
          ? "bg-oxblood-500 text-paper-50 hover:bg-oxblood-500/90"
          : "text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500",
      ].join(" ")}
      style={{ borderRadius: "2px" }}
    >
      {props.children}
    </button>
  );
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Tiny relative-time formatter — just enough for the Library card. */
function formatRelative(iso: string): string {
  if (iso === "") return "—";
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return iso.slice(0, 10);
}

/** Re-export so other features can compose the SaveAs dialog. */
export type { LibraryStore };
