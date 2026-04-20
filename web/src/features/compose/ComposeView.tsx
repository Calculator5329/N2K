import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../stores/AppStoreContext.js";
import { PageHeader } from "../../ui/primitives/PageHeader";
import {
  CompositionStore,
  SPICE_PRESETS,
  TIME_BUDGET_PRESETS,
  VARIANCE_PRESETS,
  type SpicePresetId,
  type TimeBudgetPreset,
  type VariancePresetId,
} from "./CompositionStore";
import {
  AETHER_CANDIDATE_POOLS,
  CANDIDATE_POOLS,
  type CandidatePoolId,
} from "../../services/candidatePools";
import {
  downloadBlob,
  exportToPdf,
  type CompositionExportData,
  type ExportBoard,
} from "../../services/competitionExport";
import { BoardEditor } from "./BoardEditor";
import { CompetitionResults } from "./CompetitionResults";
import { ManagePhasesPanel } from "./ManagePhasesPanel";
import { SaveAsDialog } from "../library/LibraryView";

/**
 * § II Competition — top-level view for the competition generator.
 *
 * Internal slug is `compose` (and so is the file path) for URL
 * stability; the nav label and folio say "Competition · II".
 *
 * Lets the user assemble one or more boards (random or pattern, with
 * optional pinned cells), pick a candidate dice pool + per-board time
 * budget, and generate balanced rolls for two players across multiple
 * rounds. All algorithms run client-side against the bundled dataset.
 */
export const ComposeView = observer(function ComposeView() {
  const root = useStore();
  // Use the singleton composition store (lifted to AppStore in v3.2) so
  // the Library tab and the Compose tab edit the same document. A
  // `useMemo` would create a fresh per-mount instance and lose the
  // Library binding the moment the user navigates away and back.
  const compose = root.composition;
  const lib = root.library;
  const [showManagePhases, setShowManagePhases] = useState(false);
  // Save-as dialog state lives on `LibraryStore.dialog` (single source
  // of truth) so the dialog's Cancel + Save buttons — which call
  // `lib.closeDialog()` — actually dismiss it. A previous local
  // `useState` here meant `closeDialog()` was a no-op against this
  // mount, so users would hit Save repeatedly thinking nothing
  // happened and create N duplicate Library entries on each click.
  const showSaveAs = lib.dialog.kind === "save-as";

  // #17: rehydrate from a shared `#plan=…` permalink on first mount.
  // Decoding is async (CompressionStream); generation is still
  // triggered explicitly by the user.
  //
  // Phase F: precedence is hash > local autosave. The hash is the
  // sender's intent (a shareable link), so it always wins over our
  // local working copy; if the URL has no hash, fall through to the
  // last persisted snapshot from the ContentBackend so a refresh
  // doesn't lose work in progress.
  //
  // The `hasHydratedFromBackend` guard is important: ComposeView can
  // remount when the user navigates II → III → II (or after Library
  // "Open" routes here via setView("compose")), and we MUST NOT
  // re-load the draft over a deliberately-loaded saved entry. The
  // store itself flips the flag once any hydrate path runs.
  useEffect(() => {
    if (compose.hasHydratedFromBackend) return;
    let cancelled = false;
    void (async () => {
      const fromHash = await compose.loadFromUrl();
      if (cancelled) return;
      if (!fromHash) await compose.loadFromContentBackend();
    })();
    return () => {
      cancelled = true;
    };
  }, [compose]);

  // Subscribe the autosave reaction. The disposer tears it down on
  // unmount so React StrictMode's double-mount cycle in dev doesn't
  // leave dangling autoruns.
  useEffect(() => compose.attachAutosave(), [compose]);

  return (
    <article>
      {/* PageHeader is editorial chrome; it makes a great first screen but a
          wasteful first page on paper. Tag it `no-print` so the printed
          deliverable starts with the first board sheet. */}
      <div className="no-print">
        <PageHeader
          folio="II"
          eyebrow="Competition"
          title={
            <>
              Boards, dice,{" "}
              <span
                className="italic text-oxblood-500"
                style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "WONK" 1' }}
              >
                and balance.
              </span>
            </>
          }
          dek="Build custom 6×6 boards and let the almanac roll a balanced pair of dice for each phase of a multi-phase competition. Expected score is the primary balancing target; board difficulty stays as an easier-board guardrail."
        />
      </div>

      <CompositionHeader
        store={compose}
        onManagePhases={() => setShowManagePhases(true)}
        onSaveAsNew={() => lib.openSaveAs(compose.name)}
      />
      <AetherNotice store={compose} />

      <div className="space-y-10">
        <div className="no-print">
          <PhaseTabs store={compose} />
        </div>
        <div className="no-print">
          <ConfigPanel store={compose} />
        </div>
        <div className="no-print">
          <BoardsList store={compose} />
        </div>
        <div className="no-print">
          <Toolbar store={compose} />
        </div>
        <CompetitionResults store={compose} />
      </div>

      {showManagePhases && (
        <ManagePhasesPanel store={compose} onClose={() => setShowManagePhases(false)} />
      )}
      {showSaveAs && lib.dialog.kind === "save-as" && (
        <SaveAsDialog
          lib={lib}
          compose={compose}
          suggestedName={lib.dialog.suggestedName}
        />
      )}
    </article>
  );
});

// ---------------------------------------------------------------------------
//  Header (name + Save as new + Manage phases)
// ---------------------------------------------------------------------------

const CompositionHeader = observer(function CompositionHeader({
  store,
  onManagePhases,
  onSaveAsNew,
}: {
  store: CompositionStore;
  onManagePhases: () => void;
  onSaveAsNew: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(store.name);
  return (
    <section
      className="no-print mt-2 mb-6 flex items-center gap-3 flex-wrap"
    >
      <div className="flex-1 min-w-[220px]">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              store.setName(draft);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                store.setName(draft);
                setEditing(false);
              } else if (e.key === "Escape") {
                setDraft(store.name);
                setEditing(false);
              }
            }}
            className="w-full px-3 py-1.5 text-[18px] border border-ink-100/40 bg-paper-50"
            style={{ borderRadius: "2px" }}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(store.name);
              setEditing(true);
            }}
            className="text-left font-display text-[26px] text-ink-500 hover:text-oxblood-500"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
            title="Click to rename"
          >
            {store.name}
            {store.openedLibraryId !== null && (
              <span className="ml-2 font-mono uppercase tracking-wide-caps text-[10px] text-support-500">
                · saved
              </span>
            )}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onManagePhases}
          className="px-3 py-1.5 font-mono uppercase tracking-wide-caps text-[11px] text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
          style={{ borderRadius: "2px" }}
        >
          Manage phases
        </button>
        <button
          type="button"
          onClick={onSaveAsNew}
          disabled={!store.isFullyGenerated}
          title={
            store.isFullyGenerated
              ? "Save a new Library entry from the current plan"
              : "Generate every board first"
          }
          className={[
            "px-3 py-1.5 font-mono uppercase tracking-wide-caps text-[11px] transition-colors",
            store.isFullyGenerated
              ? "text-paper-50 bg-oxblood-500 hover:bg-oxblood-500/90"
              : "text-ink-100 bg-ink-100/20 cursor-not-allowed",
          ].join(" ")}
          style={{ borderRadius: "2px" }}
        >
          Save as new
        </button>
      </div>
    </section>
  );
});

// ---------------------------------------------------------------------------
//  Phase tabs
// ---------------------------------------------------------------------------

const PhaseTabs = observer(function PhaseTabs({ store }: { store: CompositionStore }) {
  return (
    <nav
      aria-label="Phases"
      className="flex items-baseline gap-1 flex-wrap border-b border-ink-100/30 pb-1"
    >
      {store.phases.map((phase) => {
        const active = store.currentPhaseId === phase.id;
        return (
          <button
            key={phase.id}
            type="button"
            onClick={() => store.setCurrentPhase(phase.id)}
            className={[
              "px-3 py-1.5 font-display text-[15px] border-b-2 transition-colors",
              active
                ? "border-oxblood-500 text-oxblood-500"
                : "border-transparent text-ink-200 hover:text-ink-500 hover:border-ink-100/60",
            ].join(" ")}
            style={{ fontVariationSettings: '"opsz" 60, "SOFT" 30' }}
          >
            {phase.name}
            <span className="ml-2 font-mono text-[10px] uppercase tracking-wide-caps text-ink-100">
              {phase.boards.length}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => store.addPhase()}
        title="Add a new phase"
        className="ml-auto px-2 py-1 font-mono uppercase tracking-wide-caps text-[10px] text-ink-200 hover:text-oxblood-500"
      >
        + Phase
      </button>
    </nav>
  );
});

const AetherNotice = observer(function AetherNotice({
  store,
}: {
  store: CompositionStore;
}) {
  const { secret } = useStore();
  if (!secret.aetherActive) return null;
  return (
    <aside
      className="no-print mb-6 px-4 py-3 border border-oxblood-500/30 bg-oxblood-500/5 text-[12px] text-ink-200 font-mono"
      style={{ borderRadius: "2px" }}
    >
      <strong className="text-oxblood-500 uppercase tracking-wide-caps mr-2">Rules</strong>
      <div className="mt-2 inline-flex border border-oxblood-500/40" style={{ borderRadius: "2px" }}>
        <RulesPill
          active={store.rules === "standard"}
          label="Standard"
          onClick={() => store.setRules("standard")}
        />
        <RulesPill
          active={store.rules === "aether"}
          label="Æther"
          onClick={() => store.setRules("aether")}
        />
      </div>
      <p className="mt-2 not-italic">
        {store.rules === "standard" ? (
          <>
            Standard solves against <code>standard.n2k</code> with the
            depowered dice set (4 → 2, 9 → 3, …). Pools resolve in
            milliseconds; board cells live in [1, 999].
          </>
        ) : (
          <>
            Æther swaps the resolver to <code>aether-arity3.n2k</code>,
            opens board cells up to [1, 4999], and unlocks two arity-3
            candidate pools — a familiar <em>positive</em> sample in
            [2, 16] and the <em>full range</em> covering every triple
            in [-10, 32]. The blob is ~31&nbsp;MB and loads once per
            session on the first generate.
          </>
        )}
      </p>
    </aside>
  );
});

function RulesPill(props: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={[
        "px-3 py-1 text-[11px] font-mono uppercase tracking-wide-caps transition-colors",
        props.active
          ? "bg-oxblood-500 text-paper-50"
          : "text-ink-300 hover:text-oxblood-500",
      ].join(" ")}
    >
      {props.label}
    </button>
  );
}

const ConfigPanel = observer(function ConfigPanel({
  store,
}: {
  store: CompositionStore;
}) {
  const { secret } = useStore();
  // Pool list mirrors the active resolver: under standard rules we only
  // surface pools whose triples resolve against `standard.n2k`; under
  // Æther we only surface pools backed by the Æther matrix. This keeps
  // the picker honest about what will actually generate sensibly.
  const pools = !secret.aetherActive
    ? CANDIDATE_POOLS
    : store.rules === "aether"
    ? AETHER_CANDIDATE_POOLS
    : CANDIDATE_POOLS;
  return (
    <section className="grid grid-cols-12 gap-y-6 md:gap-6 border-t border-b border-ink-100/15 py-6">
      <div className="col-span-12 md:col-span-4">
        <div className="label-caps mb-2">Candidate pool</div>
        <div className="space-y-1.5">
          {pools.map((p) => (
            <PoolOption
              key={p.id}
              id={p.id}
              label={p.label}
              description={p.description}
              active={store.candidatePool === p.id}
              onSelect={() => store.setPool(p.id)}
            />
          ))}
        </div>
      </div>

      <div className="col-span-6 md:col-span-4">
        <div className="label-caps mb-2">Time budget per board (s)</div>
        <div className="inline-flex border border-ink-100/30" style={{ borderRadius: "2px" }}>
          {TIME_BUDGET_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => store.setTimeBudget(s as TimeBudgetPreset)}
              className={[
                "px-3 py-1.5 text-[12px] font-mono uppercase tracking-wide-caps",
                store.timeBudget === s
                  ? "bg-oxblood-500 text-paper-50"
                  : "text-ink-200 hover:text-ink-500",
              ].join(" ")}
            >
              {s}s
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] italic text-ink-100 leading-snug">
          Forwarded to the expected-score heuristic. 60s matches the
          almanac's default.
        </p>
      </div>

      <div className="col-span-6 md:col-span-4">
        <div className="label-caps mb-2">Round spice</div>
        <div
          className="inline-flex border border-ink-100/30"
          style={{ borderRadius: "2px" }}
        >
          {SPICE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => store.setSpice(p.id as SpicePresetId)}
              className={[
                "px-3 py-1.5 text-[12px] font-mono uppercase tracking-wide-caps transition-colors",
                store.spice === p.id
                  ? "bg-oxblood-500 text-paper-50"
                  : "text-ink-200 hover:text-ink-500",
              ].join(" ")}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] italic text-ink-100 leading-snug">
          {SPICE_PRESETS.find((p) => p.id === store.spice)!.caption}
        </p>
      </div>

      <div className="col-span-6 md:col-span-4">
        <div className="label-caps mb-2">Round variance</div>
        <div
          className="inline-flex border border-ink-100/30"
          style={{ borderRadius: "2px" }}
        >
          {VARIANCE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => store.setVariance(p.id as VariancePresetId)}
              className={[
                "px-3 py-1.5 text-[12px] font-mono uppercase tracking-wide-caps transition-colors",
                store.variance === p.id
                  ? "bg-oxblood-500 text-paper-50"
                  : "text-ink-200 hover:text-ink-500",
              ].join(" ")}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] italic text-ink-100 leading-snug">
          {VARIANCE_PRESETS.find((p) => p.id === store.variance)!.caption}
        </p>
      </div>

    </section>
  );
});

function PoolOption({
  id,
  label,
  description,
  active,
  onSelect,
}: {
  id: CandidatePoolId;
  label: string;
  description: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "block w-full text-left px-3 py-2 border transition-colors",
        active
          ? "border-oxblood-500 bg-paper-100"
          : "border-ink-100/20 hover:border-ink-100/50",
      ].join(" ")}
      style={{ borderRadius: "2px" }}
      data-pool={id}
    >
      <div className="font-mono text-[12px] text-ink-500">{label}</div>
      <div className="text-[11px] italic text-ink-100">{description}</div>
    </button>
  );
}

const BoardsList = observer(function BoardsList({
  store,
}: {
  store: CompositionStore;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <div className="label-caps">Boards</div>
        <button
          type="button"
          onClick={() => store.addBoard()}
          className="px-3 py-1 text-[11px] font-mono uppercase tracking-wide-caps text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500"
          style={{ borderRadius: "2px" }}
        >
          + add board
        </button>
      </div>
      <div className="space-y-5">
        {store.boards.map((board, i) => (
          <BoardEditor key={board.id} store={store} board={board} index={i} />
        ))}
        {store.boards.length === 0 && (
          <div className="text-[12px] italic text-ink-100">
            No boards yet — add one above to get started.
          </div>
        )}
      </div>
    </section>
  );
});

const Toolbar = observer(function Toolbar({
  store,
}: {
  store: CompositionStore;
}) {
  const disabled = store.generating || store.allBoards.length === 0;

  return (
    <section className="flex flex-wrap items-center gap-4 border-t border-ink-100/15 pt-5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => void store.generateAll()}
        className={[
          "px-5 py-2 text-[13px] font-mono uppercase tracking-wide-caps transition-colors",
          disabled
            ? "bg-ink-100/20 text-ink-100 cursor-not-allowed"
            : "bg-oxblood-500 text-paper-50 hover:bg-oxblood-500/90",
        ].join(" ")}
        style={{ borderRadius: "2px" }}
      >
        {store.generating ? "Generating…" : "Generate score-balanced rolls"}
      </button>

      {store.generating && store.loadProgress < 1 && (
        <span
          className="text-[12px] font-mono text-ink-200"
          role="status"
          aria-live="polite"
        >
          {store.rules === "aether"
            ? "loading Æther matrix (~31 MB, one-time)…"
            : "loading difficulty matrix…"}
        </span>
      )}
      {store.globalError && (
        <span className="text-[12px] font-mono text-oxblood-500">
          {store.globalError}
        </span>
      )}
      <ShareButton store={store} />
      {!store.generating && store.allBoards.some(({ board }) => board.result !== null) && (
        <>
          <ExportButton store={store} />
          <ExportPdfButton store={store} />
        </>
      )}
    </section>
  );
});

const ShareButton = observer(function ShareButton({
  store,
}: {
  store: CompositionStore;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function handleClick() {
    try {
      const url = await store.buildShareUrl();
      try {
        await navigator.clipboard.writeText(url);
        setStatus("copied");
      } catch {
        setStatus("failed");
      }
      window.setTimeout(() => setStatus("idle"), 2400);
    } catch {
      setStatus("failed");
      window.setTimeout(() => setStatus("idle"), 2400);
    }
  }

  const label =
    status === "copied"
      ? "✓ Link copied"
      : status === "failed"
      ? "Link in URL — copy failed"
      : "↗ Share plan";

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className="px-3 py-1.5 text-[12px] font-mono uppercase tracking-wide-caps text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
      style={{ borderRadius: "2px" }}
      title="Update the URL with a sharable, lossless snapshot of this plan"
      aria-label="Share this competition plan as a URL"
      aria-live="polite"
    >
      {label}
    </button>
  );
});

/**
 * Project the live MobX store onto the plain `CompositionExportData`
 * envelope the export service consumes. Skips boards that haven't been
 * generated — the toolbar already gates this on `boards.some(b =>
 * b.result !== null)`, but the helper guards anyway so future callers
 * can rely on it.
 */
function buildExportPayload(store: CompositionStore): CompositionExportData {
  // Walk every phase's boards in order so the PDF lays them out
  // phase-by-phase and the title block can show "Phase 1 — Board 2".
  const boards: ExportBoard[] = [];
  let runningIndex = 0;
  for (const { phase, board, boardIndex } of store.allBoards) {
    if (board.result === null) continue;
    runningIndex += 1;
    const result = board.result;
    const cells = (board.preview ?? Array.from({ length: 36 }).map(() => 0)).map(
      (v) => (v === 0 ? null : v),
    );
    boards.push({
      index: runningIndex,
      title:
        board.kind === "random"
          ? `Random ${board.rangeMin}–${board.rangeMax}`
          : `Pattern [${board.multiples.join(", ")}] start ${board.patternStart}`,
      phaseLabel: `${phase.name} — Board ${boardIndex + 1}`,
      rounds: board.bouts,
      cells,
      overrideSlots: [...board.overrides.keys()],
      rolls: result.rounds.map((r, j) => ({
        index: j + 1,
        p1: [r.p1[0], r.p1[1], r.p1[2]] as const,
        p2: [r.p2[0], r.p2[1], r.p2[2]] as const,
        p1Difficulty: r.p1Difficulty,
        p2Difficulty: r.p2Difficulty,
        p1ExpectedScore: r.p1ExpectedScore,
        p2ExpectedScore: r.p2ExpectedScore,
      })),
      totals: {
        p1Difficulty: result.p1TotalDifficulty,
        p2Difficulty: result.p2TotalDifficulty,
        difficultyDelta: result.difficultyDelta,
        p1ExpectedScore: result.p1TotalExpectedScore,
        p2ExpectedScore: result.p2TotalExpectedScore,
        expectedScoreDelta: result.expectedScoreDelta,
      },
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    name: store.name,
    candidatePool: store.candidatePool,
    timeBudget: store.timeBudget,
    seed: store.seed,
    boards,
  };
}

/**
 * Generic "export → file" button. The PDF button uses this shape:
 * build the payload, hand it to a generator, surface the result via
 * `idle / working / failed` flash. Errors are surfaced inline rather
 * than swallowed so a user can see why nothing downloaded —
 * generators can throw on extreme inputs (a board matrix of zero
 * cells, etc.) even though the toolbar gating prevents the obvious
 * cases.
 */
const ExportFileButton = observer(function ExportFileButton({
  store,
  label,
  ariaLabel,
  filename,
  build,
}: {
  store: CompositionStore;
  label: string;
  ariaLabel: string;
  filename: (data: CompositionExportData) => string;
  build: (data: CompositionExportData) => Promise<Blob>;
}) {
  const [status, setStatus] = useState<"idle" | "working" | "failed">("idle");

  async function handleClick() {
    if (status === "working") return;
    setStatus("working");
    try {
      const data = buildExportPayload(store);
      const blob = await build(data);
      downloadBlob(blob, filename(data));
      setStatus("idle");
    } catch (err) {
      console.error("[compose] export failed:", err);
      setStatus("failed");
      window.setTimeout(() => setStatus("idle"), 2400);
    }
  }

  const visibleLabel =
    status === "working" ? "Working…" : status === "failed" ? "Failed" : label;

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className="px-3 py-1.5 text-[12px] font-mono uppercase tracking-wide-caps text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors disabled:opacity-50"
      style={{ borderRadius: "2px" }}
      aria-label={ariaLabel}
      aria-live="polite"
      disabled={status === "working"}
    >
      {visibleLabel}
    </button>
  );
});

function ExportPdfButton({ store }: { store: CompositionStore }) {
  return (
    <ExportFileButton
      store={store}
      label="↓ Export PDF"
      ariaLabel="Export competition as PDF"
      filename={(data) => `n2k-competition-${data.generatedAt.slice(0, 10)}.pdf`}
      build={(data) => exportToPdf(data)}
    />
  );
}

const ExportButton = observer(function ExportButton({
  store,
}: {
  store: CompositionStore;
}) {
  const handleClick = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      candidatePool: store.candidatePool,
      timeBudget: store.timeBudget,
      seed: store.seed || null,
      name: store.name,
      phases: store.phases.map((phase) => ({
        name: phase.name,
        boards: phase.boards.map((b, i) => ({
          index: i + 1,
          kind: b.kind,
          ...(b.kind === "random"
            ? { range: { min: b.rangeMin, max: b.rangeMax } }
            : { multiples: b.multiples, start: b.patternStart }),
          bouts: b.bouts,
          overrides: [...b.overrides.entries()].map(([slot, value]) => ({
            slot,
            value,
          })),
          cells: b.preview,
          result: b.result,
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `n2k-competition-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="px-3 py-1.5 text-[12px] font-mono uppercase tracking-wide-caps text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
      style={{ borderRadius: "2px" }}
    >
      ↓ Export plan (JSON)
    </button>
  );
});
