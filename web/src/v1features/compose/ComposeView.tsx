import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../v1stores/storeContext";
import { PageHeader } from "../_shared/PageHeader";
import {
  CompositionStore,
  TIME_BUDGET_PRESETS,
  type TimeBudgetPreset,
} from "./CompositionStore";
import {
  AETHER_CANDIDATE_POOLS,
  CANDIDATE_POOLS,
  type CandidatePoolId,
} from "../../v1services/candidatePools";
import {
  downloadBlob,
  exportToDocx,
  exportToPdf,
  type CompositionExportData,
  type ExportBoard,
} from "../../v1services/competitionExport";
import { BoardEditor } from "./BoardEditor";
import { CompetitionResults } from "./CompetitionResults";

/**
 * § V Compose — top-level view for the competition generator.
 *
 * Lets the user assemble one or more boards (random or pattern, with
 * optional pinned cells), pick a candidate dice pool + per-board time
 * budget, and generate balanced rolls for two players across multiple
 * rounds. All algorithms run client-side against the bundled dataset.
 */
export const ComposeView = observer(function ComposeView() {
  const root = useStore();
  const compose = useMemo(() => new CompositionStore(root.data), [root.data]);

  // #17: rehydrate from a shared `#plan=…` permalink on first mount.
  // Decoding is async (CompressionStream), but the plan only changes
  // form fields — generation is still triggered explicitly by the user.
  useEffect(() => {
    void compose.loadFromUrl();
  }, [compose]);

  return (
    <article>
      {/* PageHeader is editorial chrome; it makes a great first screen but a
          wasteful first page on paper. Tag it `no-print` so the printed
          deliverable starts with the first board sheet. */}
      <div className="no-print">
        <PageHeader
          folio="V"
          eyebrow="Compose"
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
          dek="Build custom 6×6 boards and let the almanac roll a balanced pair of dice for each round of a two-player competition. Expected score is the primary balancing target; board difficulty stays as an easier-board guardrail."
        />
      </div>

      <AetherNotice />

      <div className="space-y-10">
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
    </article>
  );
});

const AetherNotice = observer(function AetherNotice() {
  const { secret } = useStore();
  if (!secret.aetherActive) return null;
  return (
    <aside
      className="no-print mb-6 px-4 py-3 border border-oxblood-500/30 bg-oxblood-500/5 text-[12px] text-ink-200 font-mono"
      style={{ borderRadius: "2px" }}
    >
      <strong className="text-oxblood-500 uppercase tracking-wide-caps mr-2">Æther note</strong>
      Compose evaluates each candidate against the bundled 1..20 stats dataset, so wider Æther tuples (negatives, values &gt; 20) aren't valid here.
      The new <em>Æther sample (3d)</em> pool restricts the search to the same triples used elsewhere in Æther tooling.
    </aside>
  );
});

const ConfigPanel = observer(function ConfigPanel({
  store,
}: {
  store: CompositionStore;
}) {
  const { secret } = useStore();
  const pools = secret.aetherActive
    ? [...CANDIDATE_POOLS, ...AETHER_CANDIDATE_POOLS]
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
        <label className="block">
          <span className="label-caps block mb-2">Seed (optional)</span>
          <input
            type="text"
            value={store.seed}
            onChange={(e) => store.setSeed(e.target.value)}
            placeholder="leave blank for fresh rolls"
            className="w-full bg-paper-100 border border-ink-100/30 font-mono text-[13px] text-ink-500 px-2 py-1.5 focus:outline-none focus:border-oxblood-500"
            style={{ borderRadius: "2px" }}
          />
        </label>
        <p className="mt-2 text-[11px] italic text-ink-100 leading-snug">
          Set a seed to make board generation and roll selection
          deterministic across runs.
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
  const disabled = store.generating || store.boards.length === 0;

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
          loading difficulty matrix…
        </span>
      )}
      {store.globalError && (
        <span className="text-[12px] font-mono text-oxblood-500">
          {store.globalError}
        </span>
      )}
      <ShareButton store={store} />
      {!store.generating && store.boards.some((b) => b.result !== null) && (
        <>
          <ExportButton store={store} />
          <ExportPdfButton store={store} />
          <ExportWordButton store={store} />
          <PrintButton />
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

function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="px-3 py-1.5 text-[12px] font-mono uppercase tracking-wide-caps text-ink-300 border border-ink-100/40 hover:border-oxblood-500 hover:text-oxblood-500 transition-colors"
      style={{ borderRadius: "2px" }}
      title="Print competition sheets — one board per page"
      aria-label="Print competition sheets, one board per page"
    >
      ⎙ Print boards
    </button>
  );
}

/**
 * Project the live MobX store onto the plain `CompositionExportData`
 * envelope the export service consumes. Skips boards that haven't been
 * generated — the toolbar already gates this on `boards.some(b =>
 * b.result !== null)`, but the helper guards anyway so future callers
 * can rely on it.
 */
function buildExportPayload(store: CompositionStore): CompositionExportData {
  const boards: ExportBoard[] = store.boards
    .map((board, i): ExportBoard | null => {
      if (board.result === null) return null;
      const result = board.result;
      const cells = (board.preview ?? Array.from({ length: 36 }).map(() => 0)).map(
        (v) => (v === 0 ? null : v),
      );
      return {
        index: i + 1,
        title:
          board.kind === "random"
            ? `Random ${board.rangeMin}–${board.rangeMax}`
            : `Pattern [${board.multiples.join(", ")}] start ${board.patternStart}`,
        rounds: board.rounds,
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
      };
    })
    .filter((b): b is ExportBoard => b !== null);

  return {
    generatedAt: new Date().toISOString(),
    candidatePool: store.candidatePool,
    timeBudget: store.timeBudget,
    seed: store.seed,
    boards,
  };
}

/**
 * Generic "export → file" button. Both the PDF and Word buttons share
 * the same shape: build the payload, hand it to a generator, surface
 * the result via `idle / working / failed` flash. Errors are surfaced
 * inline rather than swallowed so a user can see why nothing
 * downloaded — generators can throw on extreme inputs (a board
 * matrix of zero cells, etc.) even though the toolbar gating prevents
 * the obvious cases.
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

function ExportWordButton({ store }: { store: CompositionStore }) {
  return (
    <ExportFileButton
      store={store}
      label="↓ Export Word"
      ariaLabel="Export competition as Word document"
      filename={(data) => `n2k-competition-${data.generatedAt.slice(0, 10)}.docx`}
      build={(data) => exportToDocx(data)}
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
      boards: store.boards.map((b, i) => ({
        index: i + 1,
        kind: b.kind,
        ...(b.kind === "random"
          ? { range: { min: b.rangeMin, max: b.rangeMax } }
          : { multiples: b.multiples, start: b.patternStart }),
        rounds: b.rounds,
        overrides: [...b.overrides.entries()].map(([slot, value]) => ({
          slot,
          value,
        })),
        cells: b.preview,
        result: b.result,
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
