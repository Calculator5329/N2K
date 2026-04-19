/**
 * Competition export service.
 *
 * Stateless helpers that turn a generated competition (boards + balanced
 * dice rolls) into a binary deliverable — currently PDF and Word
 * (.docx). Lives in the service layer per the project's three-layer
 * rule: no MobX, no UI awareness, no dependency on the live
 * `CompositionStore` instance. Callers lower their store down to a
 * plain `CompositionExportData` envelope and pass that in.
 *
 * Output shape on paper / on screen:
 *   pages 1..N  one board per page: title + 6×6 grid + rolls table
 *               (P1 dice / P2 dice only, like the printed view)
 *   page  N+1+  "Stats summary" — full per-round difficulty + expected
 *               score for every board, with totals and Δ deltas
 *
 * The stats are intentionally split out so a tabletop referee can keep
 * one stats sheet next to the stack of boards.
 *
 * Bundle hygiene: `jspdf` (+ html2canvas, DOMPurify) and `docx`
 * together add ~600KB to the bundle. Both are loaded via dynamic
 * `import()` from sibling impl files so they only ship to users who
 * actually click an export button. The public surface here stays
 * lightweight: just types, the `downloadBlob` helper, and two thin
 * promise-returning entry points.
 */

// ---------------------------------------------------------------------------
//  Public envelope — callers build this from their store.
// ---------------------------------------------------------------------------

export interface ExportRound {
  /** 1-based round index. */
  readonly index: number;
  readonly p1: readonly [number, number, number];
  readonly p2: readonly [number, number, number];
  readonly p1Difficulty: number;
  readonly p2Difficulty: number;
  readonly p1ExpectedScore: number;
  readonly p2ExpectedScore: number;
}

export interface ExportBoardTotals {
  readonly p1Difficulty: number;
  readonly p2Difficulty: number;
  readonly difficultyDelta: number;
  readonly p1ExpectedScore: number;
  readonly p2ExpectedScore: number;
  readonly expectedScoreDelta: number;
}

export interface ExportBoard {
  /** 1-based, matches the on-screen "Board N" label. */
  readonly index: number;
  /** Human title, e.g. `Random 1–200` or `Pattern [6] start 6`. */
  readonly title: string;
  /** Number of rounds shown in the rolls table. */
  readonly rounds: number;
  /** 36 cells, row-major. Empty / unset slots come through as `null`. */
  readonly cells: ReadonlyArray<number | null>;
  /** Slot indices (0..35) that were user-pinned, for emphasis. */
  readonly overrideSlots: ReadonlyArray<number>;
  readonly rolls: ReadonlyArray<ExportRound>;
  readonly totals: ExportBoardTotals;
}

export interface CompositionExportData {
  /** ISO timestamp for the file metadata + footer. */
  readonly generatedAt: string;
  readonly candidatePool: string;
  readonly timeBudget: number;
  readonly seed: string;
  readonly boards: ReadonlyArray<ExportBoard>;
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
  // Defer revoke — some browsers race the navigation otherwise.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------------------
//  Generators — thin wrappers that lazy-load the heavy implementation.
// ---------------------------------------------------------------------------

/**
 * Build a multi-page PDF: one page per board followed by a trailing
 * stats summary page. The implementation lives in
 * `competitionExportPdf` so that jsPDF and its transitive deps
 * (html2canvas, DOMPurify) only land in the bundle on first call.
 */
export async function exportToPdf(
  data: CompositionExportData,
): Promise<Blob> {
  const { generatePdf } = await import("./competitionExportPdf");
  return generatePdf(data);
}

/**
 * Build a multi-section Word document (.docx). One section per board
 * (each starts on a fresh page) plus a final stats-summary section.
 * The implementation lives in `competitionExportDocx` so that the
 * `docx` library only lands in the bundle on first call.
 */
export async function exportToDocx(
  data: CompositionExportData,
): Promise<Blob> {
  const { generateDocx } = await import("./competitionExportDocx");
  return generateDocx(data);
}
