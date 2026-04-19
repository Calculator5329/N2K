/**
 * Competition export service.
 *
 * Stateless helpers that turn a generated `CompetitionPlan` into a
 * binary deliverable — currently PDF (`jspdf` + `jspdf-autotable`) and
 * Word (`docx`). Both heavy libraries are loaded via dynamic
 * `import()` from sibling impl files so they only ship to users who
 * actually click an export button.
 *
 * Lives in the service layer per the project's three-layer rule: no
 * MobX, no UI awareness. Callers lower their `CompetitionPlan` down
 * to the plain `CompositionExportData` envelope and pass that in.
 *
 * Output shape on paper / on screen:
 *   pages 1..N  one board per page: title, 6×6 grid, rolls table
 *               (`# / Player A / Player B`)
 *   page  N+1+  "Stats summary" — full per-round expected score for
 *               every board, with totals and Δ deltas
 */

import type { CompetitionPlan } from "./competitionService.js";

// ---------------------------------------------------------------------------
//  Public envelope — callers build this from their store / plan.
// ---------------------------------------------------------------------------

export interface ExportRound {
  /** 1-based round index. */
  readonly index: number;
  readonly playerA: readonly number[];
  readonly playerB: readonly number[];
  readonly playerAScore: number;
  readonly playerBScore: number;
  readonly delta: number;
}

export interface ExportBoardTotals {
  readonly playerA: number;
  readonly playerB: number;
  readonly delta: number;
}

export interface ExportBoard {
  /** 1-based, matches the on-screen "Board N" label. */
  readonly index: number;
  /** Original board id from the compose store (e.g. `board-3`). */
  readonly id: string;
  /** Human title, e.g. `Random 1–200` or `Pattern [6] start 6`. */
  readonly title: string;
  readonly rounds: number;
  /** 36 cells, row-major. */
  readonly cells: readonly number[];
  /** Slot indices (0..35) that were user-pinned, for emphasis. */
  readonly pinned: readonly number[];
  readonly rolls: readonly ExportRound[];
  readonly totals: ExportBoardTotals;
}

export interface CompositionExportData {
  /** ISO timestamp for the file metadata + footer. */
  readonly generatedAt: string;
  readonly modeId: string;
  readonly candidatePool: string;
  readonly timeBudgetMs: number;
  readonly seed: number | null;
  readonly boards: readonly ExportBoard[];
}

// ---------------------------------------------------------------------------
//  Plan → export envelope
// ---------------------------------------------------------------------------

export interface BoardTitleInput {
  readonly id: string;
  readonly kind: "random" | "pattern";
  readonly random: { readonly min: number; readonly max: number };
  readonly pattern: { readonly multiples: readonly number[]; readonly start: number };
  readonly cells: readonly number[];
  readonly pinned: ReadonlySet<number>;
}

/**
 * Lower a live `CompetitionPlan` (plus the original board configs for
 * titles + pin masks) into the export envelope.
 */
export function planToExportData(
  plan: CompetitionPlan,
  boards: readonly BoardTitleInput[],
): CompositionExportData {
  const byId = new Map(boards.map((b) => [b.id, b]));
  const exportBoards: ExportBoard[] = plan.results.map((r, i) => {
    const cfg = byId.get(r.boardId);
    const title = cfg ? boardTitleFor(cfg) : r.boardId;
    const cells = cfg?.cells ?? plan.config.boards.find((b) => b.id === r.boardId)?.cells ?? [];
    const pinned = cfg ? [...cfg.pinned] : [];
    const rolls: ExportRound[] = r.rounds.map((round) => ({
      index: round.index + 1,
      playerA: [...round.playerA.dice],
      playerB: [...round.playerB.dice],
      playerAScore: round.playerA.expectedScore,
      playerBScore: round.playerB.expectedScore,
      delta: round.delta,
    }));
    return {
      index: i + 1,
      id: r.boardId,
      title,
      rounds: r.rounds.length,
      cells: [...cells],
      pinned,
      rolls,
      totals: {
        playerA: r.totals.playerA,
        playerB: r.totals.playerB,
        delta: r.totals.playerA - r.totals.playerB,
      },
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    modeId: plan.config.modeId,
    candidatePool: plan.config.pool,
    timeBudgetMs: plan.config.timeBudgetMs,
    seed: plan.config.seed ?? null,
    boards: exportBoards,
  };
}

function boardTitleFor(cfg: BoardTitleInput): string {
  if (cfg.kind === "random") {
    return `Random ${cfg.random.min}–${cfg.random.max}`;
  }
  return `Pattern [${cfg.pattern.multiples.join(", ")}] start ${cfg.pattern.start}`;
}

// ---------------------------------------------------------------------------
//  Download helper — a tiny convenience for the UI layer.
// ---------------------------------------------------------------------------

/**
 * Trigger a browser download for an in-memory blob. Safe to call from
 * any React event handler; the temporary `<a>` is detached after the
 * synchronous click and the object URL is revoked on the next tick so
 * Firefox has time to start the download before the URL goes away.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------------------
//  Generators — thin wrappers that lazy-load the heavy implementation.
// ---------------------------------------------------------------------------

export async function exportToPdf(data: CompositionExportData): Promise<Blob> {
  const { generatePdf } = await import("./competitionExportPdf.js");
  return generatePdf(data);
}

export async function exportToDocx(data: CompositionExportData): Promise<Blob> {
  const { generateDocx } = await import("./competitionExportDocx.js");
  return generateDocx(data);
}
