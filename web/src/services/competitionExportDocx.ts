/**
 * DOCX generator for the Compose feature.
 *
 * Loaded on demand from `competitionExport.ts` so the `docx` library
 * (~250KB unminified) doesn't reach users who never click an export
 * button.
 *
 * Layout:
 *   section 1..N  one section per board, each starting on a fresh
 *                 page via an explicit `PageBreak`. Contents:
 *                 title, 6×6 grid (table), `# / Player A / Player B`
 *                 rolls table.
 *   section N+1   "Stats summary" — title, intro line, then per-board
 *                 stats tables (full score columns + totals row) with
 *                 a Δ deltas paragraph between boards.
 *
 * Note: docx font sizes are in half-points (e.g. `size: 28` == 14pt)
 * and table widths are percentages with `WidthType.PERCENTAGE`.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  PageBreak,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import type { CompositionExportData, ExportBoard } from "./competitionExport.js";

const BOARD_COLS = 6;
const BOARD_ROWS = 6;

export async function generateDocx(data: CompositionExportData): Promise<Blob> {
  const sections = data.boards.map((board, i) => ({
    properties: {
      page: {
        size: { orientation: PageOrientation.PORTRAIT },
        margin: { top: 720, right: 720, bottom: 720, left: 720 },
      },
    },
    footers: { default: docxFooter(data) },
    children: [
      ...(i > 0 ? [new Paragraph({ children: [new PageBreak()] })] : []),
      ...boardSectionParagraphs(board),
    ],
  }));

  if (data.boards.length > 0) {
    sections.push({
      properties: {
        page: {
          size: { orientation: PageOrientation.PORTRAIT },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      footers: { default: docxFooter(data) },
      children: [
        new Paragraph({ children: [new PageBreak()] }),
        ...statsSummaryParagraphs(data),
      ],
    });
  }

  const doc = new Document({
    creator: "N2K",
    title: "N2K Competition",
    description: `Generated ${data.generatedAt}`,
    sections,
  });

  return Packer.toBlob(doc);
}

function boardSectionParagraphs(board: ExportBoard): Array<Paragraph | Table> {
  return [
    new Paragraph({
      children: [
        new TextRun({ text: `BOARD ${board.index}    `, bold: true, size: 18, color: "555555" }),
        new TextRun({ text: board.title, bold: true, size: 32 }),
        new TextRun({
          text: `        ${board.rounds} round${board.rounds === 1 ? "" : "s"}`,
          size: 18,
          color: "555555",
        }),
      ],
      spacing: { after: 240 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "GENERATED BOARD", bold: true, size: 16, color: "555555" }),
      ],
      spacing: { after: 80 },
    }),
    boardGridTable(board),
    new Paragraph({
      children: [
        new TextRun({ text: "ROLLS PER ROUND", bold: true, size: 16, color: "555555" }),
      ],
      spacing: { before: 320, after: 80 },
    }),
    rollsTable(board),
  ];
}

function boardGridTable(board: ExportBoard): Table {
  const rows: TableRow[] = [];
  for (let row = 0; row < BOARD_ROWS; row++) {
    const cells: TableCell[] = [];
    for (let col = 0; col < BOARD_COLS; col++) {
      const slot = row * BOARD_COLS + col;
      const value = board.cells[slot];
      const isPinned = board.pinned.includes(slot);
      const text = value !== undefined ? String(value) : "";
      cells.push(
        new TableCell({
          width: { size: 16.66, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun(
                  isPinned
                    ? { text, bold: true, size: 28 }
                    : { text, size: 28 },
                ),
              ],
              spacing: { before: 120, after: 120 },
            }),
          ],
        }),
      );
    }
    rows.push(new TableRow({ children: cells }));
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
    borders: uniformBorders("000000", 4),
  });
}

function rollsTable(board: ExportBoard): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: ["#", "Player A dice", "Player B dice"].map(
      (text) =>
        new TableCell({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text, bold: true, size: 18, color: "555555" })],
            }),
          ],
          shading: { fill: "F2F2F2" },
        }),
    ),
  });

  const bodyRows = board.rolls.map(
    (r) =>
      new TableRow({
        children: [
          textCell(String(r.index), { align: AlignmentType.RIGHT }),
          textCell(diceText(r.playerA), { align: AlignmentType.CENTER, size: 24 }),
          textCell(diceText(r.playerB), { align: AlignmentType.CENTER, size: 24 }),
        ],
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
    borders: uniformBorders("999999", 2),
  });
}

function statsSummaryParagraphs(data: CompositionExportData): Array<Paragraph | Table> {
  const blocks: Array<Paragraph | Table> = [
    new Paragraph({
      children: [new TextRun({ text: "Stats summary", bold: true, size: 36 })],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text:
            "Per-round expected score with totals and Δ for each board. " +
            "Boards print one per page; this stats sheet accompanies the stack.",
          size: 18,
          color: "555555",
        }),
      ],
      spacing: { after: 280 },
    }),
  ];

  data.boards.forEach((board) => {
    blocks.push(
      new Paragraph({
        children: [
          new TextRun({ text: `BOARD ${board.index}    `, bold: true, size: 16, color: "555555" }),
          new TextRun({ text: board.title, bold: true, size: 26 }),
        ],
        spacing: { before: 240, after: 80 },
      }),
    );
    blocks.push(statsTable(board));

    const higher =
      board.totals.delta > 0 ? "A" : board.totals.delta < 0 ? "B" : "—";

    blocks.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Δ totals: ${Math.abs(board.totals.delta).toFixed(2)} (player ${higher} ahead)`,
            size: 20,
          }),
        ],
        spacing: { before: 80, after: 240 },
      }),
    );
  });

  return blocks;
}

function statsTable(board: ExportBoard): Table {
  const headers = ["#", "A dice", "A score", "B dice", "B score", "Δ"];
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (text) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text, bold: true, size: 16, color: "555555" })],
            }),
          ],
          shading: { fill: "F2F2F2" },
        }),
    ),
  });

  const bodyRows = board.rolls.map(
    (r) =>
      new TableRow({
        children: [
          textCell(String(r.index)),
          textCell(diceText(r.playerA)),
          textCell(r.playerAScore.toFixed(2)),
          textCell(diceText(r.playerB)),
          textCell(r.playerBScore.toFixed(2)),
          textCell(r.delta.toFixed(3)),
        ],
      }),
  );

  const totalsRow = new TableRow({
    children: [
      textCell("Σ", { bold: true }),
      textCell("—", { bold: true }),
      textCell(board.totals.playerA.toFixed(2), { bold: true }),
      textCell("—", { bold: true }),
      textCell(board.totals.playerB.toFixed(2), { bold: true }),
      textCell(board.totals.delta.toFixed(3), { bold: true }),
    ],
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows, totalsRow],
    borders: uniformBorders("999999", 2),
  });
}

function textCell(
  text: string,
  options: {
    bold?: boolean;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    size?: number;
  } = {},
): TableCell {
  // `exactOptionalPropertyTypes` rejects `bold: undefined`; only attach
  // the property when the caller asked for bold.
  const runOptions: { text: string; size: number; bold?: boolean } = {
    text,
    size: options.size ?? 18,
  };
  if (options.bold) runOptions.bold = true;
  return new TableCell({
    children: [
      new Paragraph({
        alignment: options.align ?? AlignmentType.LEFT,
        children: [new TextRun(runOptions)],
      }),
    ],
  });
}

function uniformBorders(color: string, size: number) {
  const side = { style: BorderStyle.SINGLE, size, color };
  return {
    top: side,
    bottom: side,
    left: side,
    right: side,
    insideHorizontal: side,
    insideVertical: side,
  };
}

function docxFooter(data: CompositionExportData): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: `N2K · Compose · ${data.generatedAt.slice(0, 10)}`,
            size: 14,
            color: "999999",
          }),
        ],
      }),
    ],
  });
}

function diceText(dice: readonly number[]): string {
  return dice.join("  ");
}
