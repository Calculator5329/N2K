/**
 * PDF generator for the Compose feature.
 *
 * Loaded on demand from `competitionExport.ts` so jsPDF + jspdf-autotable
 * (~70KB gzipped, plus html2canvas + DOMPurify ~150KB more) don't reach
 * users who never click an export button.
 *
 * Layout matches the screen / print stylesheet:
 *   pages 1..N  one board per page: title, 6×6 grid (drawn with
 *               rect+text), `# / P1 dice / P2 dice` rolls table
 *   page  N+1+  "Stats summary" — full per-round difficulty +
 *               expected score table, totals row, Δ deltas line
 *
 * Page geometry: US Letter portrait, 0.5in margins, all coordinates in
 * points (72 dpi). The grid is centered horizontally and clamped to
 * 360pt wide so it never overflows on narrower future formats.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import type {
  CompositionExportData,
  ExportBoard,
} from "./competitionExport";

const PDF_PAGE_FORMAT = "letter";
const PDF_MARGIN = 36;
const BOARD_COLS = 6;
const BOARD_ROWS = 6;

export async function generatePdf(
  data: CompositionExportData,
): Promise<Blob> {
  const doc = new jsPDF({
    unit: "pt",
    format: PDF_PAGE_FORMAT,
    orientation: "portrait",
  });

  data.boards.forEach((board, i) => {
    if (i > 0) doc.addPage();
    drawBoardPage(doc, board, data);
  });

  if (data.boards.length > 0) {
    doc.addPage();
    drawStatsSummary(doc, data);
  }

  return doc.output("blob");
}

function drawBoardPage(
  doc: jsPDF,
  board: ExportBoard,
  data: CompositionExportData,
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const innerWidth = pageWidth - PDF_MARGIN * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`BOARD ${board.index}`, PDF_MARGIN, PDF_MARGIN + 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(board.title, PDF_MARGIN + 70, PDF_MARGIN + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const roundLabel = `${board.rounds} ROUND${board.rounds === 1 ? "" : "S"}`;
  const roundWidth = doc.getTextWidth(roundLabel);
  doc.text(roundLabel, pageWidth - PDF_MARGIN - roundWidth, PDF_MARGIN + 4);

  doc.setLineWidth(0.75);
  doc.line(
    PDF_MARGIN,
    PDF_MARGIN + 18,
    pageWidth - PDF_MARGIN,
    PDF_MARGIN + 18,
  );

  const gridTop = PDF_MARGIN + 36;
  const gridSize = Math.min(innerWidth, 360);
  const cellSize = gridSize / BOARD_COLS;
  const gridLeft = PDF_MARGIN + (innerWidth - gridSize) / 2;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("GENERATED BOARD", PDF_MARGIN, gridTop - 8);

  doc.setLineWidth(0.5);
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      const slot = row * BOARD_COLS + col;
      const x = gridLeft + col * cellSize;
      const y = gridTop + row * cellSize;
      doc.rect(x, y, cellSize, cellSize, "S");

      const value = board.cells[slot];
      if (value !== null && value !== undefined) {
        const isPinned = board.overrideSlots.includes(slot);
        doc.setFont("helvetica", isPinned ? "bold" : "normal");
        doc.setFontSize(14);
        const text = String(value);
        const textWidth = doc.getTextWidth(text);
        // jsPDF text baseline sits at the y position; nudge so the
        // glyph centers vertically inside the cell.
        doc.text(
          text,
          x + (cellSize - textWidth) / 2,
          y + cellSize / 2 + 5,
        );
      }
    }
  }

  const tableTop = gridTop + gridSize + 28;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("ROLLS PER ROUND", PDF_MARGIN, tableTop - 6);

  autoTable(doc, {
    startY: tableTop,
    margin: { left: PDF_MARGIN, right: PDF_MARGIN },
    head: [["#", "P1 dice", "P2 dice"]],
    body: board.rolls.map((r) => [
      String(r.index),
      diceText(r.p1),
      diceText(r.p2),
    ]),
    styles: {
      font: "helvetica",
      fontSize: 12,
      cellPadding: 6,
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 30, halign: "right" },
      1: { halign: "center" },
      2: { halign: "center" },
    },
    theme: "grid",
  });

  drawFooter(doc, data);
}

function drawStatsSummary(
  doc: jsPDF,
  data: CompositionExportData,
): void {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Stats summary", PDF_MARGIN, PDF_MARGIN + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(
    "Per-round difficulty + expected score, with totals and Δ for each board.",
    PDF_MARGIN,
    PDF_MARGIN + 24,
  );
  doc.setTextColor(0, 0, 0);

  doc.setLineWidth(0.75);
  doc.line(
    PDF_MARGIN,
    PDF_MARGIN + 32,
    pageWidth - PDF_MARGIN,
    PDF_MARGIN + 32,
  );

  let cursorY = PDF_MARGIN + 50;

  data.boards.forEach((board) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`BOARD ${board.index}`, PDF_MARGIN, cursorY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(board.title, PDF_MARGIN + 60, cursorY);
    cursorY += 6;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: PDF_MARGIN, right: PDF_MARGIN },
      head: [
        ["#", "P1 dice", "P1 diff", "P1 exp.", "P2 dice", "P2 diff", "P2 exp."],
      ],
      body: [
        ...board.rolls.map((r) => [
          String(r.index),
          diceText(r.p1),
          r.p1Difficulty.toFixed(2),
          r.p1ExpectedScore.toFixed(1),
          diceText(r.p2),
          r.p2Difficulty.toFixed(2),
          r.p2ExpectedScore.toFixed(1),
        ]),
        [
          "Σ",
          "—",
          board.totals.p1Difficulty.toFixed(2),
          board.totals.p1ExpectedScore.toFixed(1),
          "—",
          board.totals.p2Difficulty.toFixed(2),
          board.totals.p2ExpectedScore.toFixed(1),
        ],
      ],
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 3,
        lineColor: [180, 180, 180],
        lineWidth: 0.25,
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [40, 40, 40],
        fontStyle: "bold",
        fontSize: 8,
      },
      didParseCell: (hookData) => {
        if (hookData.row.index === board.rolls.length) {
          hookData.cell.styles.fontStyle = "bold";
          hookData.cell.styles.lineWidth = 0.5;
          hookData.cell.styles.lineColor = [0, 0, 0];
        }
      },
      theme: "grid",
    });

    // jspdf-autotable stashes the next-Y on `lastAutoTable.finalY`; the
    // type isn't exposed on the jsPDF interface so we read it loosely.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable?.finalY ?? cursorY + 60;
    cursorY = finalY + 14;

    const higher =
      board.totals.expectedScoreDelta > 0
        ? "P1"
        : board.totals.expectedScoreDelta < 0
        ? "P2"
        : "—";
    const harder =
      board.totals.difficultyDelta > 0
        ? "P1"
        : board.totals.difficultyDelta < 0
        ? "P2"
        : "—";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Δ expected score: ${Math.abs(board.totals.expectedScoreDelta).toFixed(1)} (${higher} higher)    ` +
        `Δ difficulty: ${Math.abs(board.totals.difficultyDelta).toFixed(2)} (${harder} harder)`,
      PDF_MARGIN,
      cursorY,
    );
    cursorY += 24;

    const pageHeight = doc.internal.pageSize.getHeight();
    if (cursorY > pageHeight - PDF_MARGIN - 80) {
      doc.addPage();
      cursorY = PDF_MARGIN + 24;
    }
  });

  drawFooter(doc, data);
}

function drawFooter(doc: jsPDF, data: CompositionExportData): void {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageNum = doc.getNumberOfPages();
  const date = data.generatedAt.slice(0, 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `N2K Almanac · Compose · ${date}`,
    PDF_MARGIN,
    pageHeight - PDF_MARGIN / 2,
  );
  const pageLabel = `Page ${pageNum}`;
  const pageLabelWidth = doc.getTextWidth(pageLabel);
  doc.text(
    pageLabel,
    pageWidth - PDF_MARGIN - pageLabelWidth,
    pageHeight - PDF_MARGIN / 2,
  );
  doc.setTextColor(0, 0, 0);
}

function diceText(dice: readonly [number, number, number]): string {
  return `${dice[0]}  ${dice[1]}  ${dice[2]}`;
}
