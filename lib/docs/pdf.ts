import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { business } from "@/content/business";
import { formatShortDate } from "@/lib/admin/time";
import { winAnsiSafe } from "@/lib/dc/contract-layout";
import { LETTER, MARGIN, wrapRuns, type Seg } from "@/lib/pdf/text";
import type { DocResponse } from "./kinds";
import type { Block, Inline } from "./types";

/** Where the next line goes. renderBlocks moves `page` and `y` as it draws. */
export type PdfPen = { doc: PDFDocument; page: PDFPage; y: number; regular: PDFFont; bold: PDFFont };

export const SIGN_CLOSING = "Signed electronically on the client's project page.";

const INK = rgb(0.1, 0.1, 0.1);
const BODY = 10;
const LEAD = 13;
const GAP = 6;
const BULLET_INDENT = 16;
const HEADING = { 2: { size: 13, lead: 17, before: 12 }, 3: { size: 11, lead: 14, before: 8 } } as const;
const WIDTH = LETTER[0] - 2 * MARGIN;

/** A field still in the text is drawn as its marker, so a preview shows exactly what is missing. */
const segsOf = (inlines: Inline[], forceBold = false): Seg[] =>
  inlines.map((inline) => ({ text: inline.type === "text" ? inline.text : `{{${inline.key}}}`, bold: forceBold || inline.bold }));

/** Starts a new page when `height` would not fit above the margin. Answers whether it did. */
function ensure(pen: PdfPen, height: number): boolean {
  if (pen.y - height >= MARGIN) return false;
  pen.page = pen.doc.addPage(LETTER);
  pen.y = LETTER[1] - MARGIN;
  return true;
}

/** Every string drawn passes through winAnsiSafe: the standard fonts throw on anything they cannot encode. */
function drawLine(pen: PdfPen, segs: Seg[], x: number, size: number): void {
  let cursor = x;
  for (const seg of segs) {
    const font = seg.bold ? pen.bold : pen.regular;
    const text = winAnsiSafe(seg.text);
    pen.page.drawText(text, { x: cursor, y: pen.y, size, font, color: INK });
    cursor += font.widthOfTextAtSize(text, size);
  }
}

function drawLines(pen: PdfPen, lines: Seg[][], x: number, size: number, lead: number): void {
  for (const line of lines) {
    ensure(pen, lead);
    drawLine(pen, line, x, size);
    pen.y -= lead;
  }
}

/** Draws doc-text blocks from the pen's position, adding pages as needed. Used for documents and contract terms. */
export function renderBlocks(pen: PdfPen, blocks: Block[]): void {
  const fonts = { regular: pen.regular, bold: pen.bold };
  blocks.forEach((block, index) => {
    if (block.type === "heading") {
      const style = HEADING[block.level];
      const lines = wrapRuns(segsOf(block.inlines, true), fonts, style.size, WIDTH);
      // A heading never sits alone at the foot of a page: it moves with room for a line of text.
      // The space above it is skipped at the top of a fresh page, where nothing sits above it.
      const freshPage = ensure(pen, style.before + lines.length * style.lead + LEAD);
      if (index > 0 && !freshPage) pen.y -= style.before;
      drawLines(pen, lines, MARGIN, style.size, style.lead);
    } else if (block.type === "paragraph") {
      drawLines(pen, wrapRuns(segsOf(block.inlines), fonts, BODY, WIDTH), MARGIN, BODY, LEAD);
      pen.y -= GAP;
    } else {
      for (const item of block.items) {
        wrapRuns(segsOf(item), fonts, BODY, WIDTH - BULLET_INDENT).forEach((line, i) => {
          ensure(pen, LEAD);
          if (i === 0) drawLine(pen, [{ text: "•", bold: false }], MARGIN + 4, BODY);
          drawLine(pen, line, MARGIN + BULLET_INDENT, BODY);
          pen.y -= LEAD;
        });
      }
      pen.y -= GAP;
    }
  });
}

export type DocumentPdfInput = {
  title: string;
  projectNo: string | null;
  date: Date;
  client: { name: string; address: string | null; city: string; email: string | null };
  blocks: Block[];
  response: DocResponse;
};

/** A job document as a PDF (spec §6): company header, title and date, client block, body, signing line. */
export async function buildDocumentPdf(input: DocumentPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pen: PdfPen = { doc, page: doc.addPage(LETTER), y: LETTER[1] - MARGIN, regular, bold };
  const fonts = { regular, bold };

  drawLines(pen, [[{ text: business.legalName, bold: true }]], MARGIN, 14, 16);
  drawLines(pen, [[{ text: `${business.phone.display} · ${business.email}`, bold: false }]], MARGIN, 9, 12);
  pen.y -= 14;

  const date = winAnsiSafe(formatShortDate(input.date));
  const dateWidth = regular.widthOfTextAtSize(date, 10);
  pen.page.drawText(date, { x: LETTER[0] - MARGIN - dateWidth, y: pen.y, size: 10, font: regular, color: INK });
  drawLines(pen, wrapRuns([{ text: input.title, bold: true }], fonts, 16, WIDTH - dateWidth - 16), MARGIN, 16, 19);
  pen.y -= 6;

  drawLines(pen, wrapRuns([{ text: input.client.name, bold: true }], fonts, 11, WIDTH), MARGIN, 11, 13);
  const details = [input.client.address, input.client.city, input.client.email, input.projectNo ? `Project ${input.projectNo}` : null];
  for (const line of details) {
    if (line) drawLines(pen, wrapRuns([{ text: line, bold: false }], fonts, 10, WIDTH), MARGIN, 10, 12);
  }
  pen.y -= 14;

  renderBlocks(pen, input.blocks);
  if (input.response === "sign") {
    pen.y -= GAP;
    drawLines(pen, [[{ text: SIGN_CLOSING, bold: true }]], MARGIN, BODY, LEAD);
  }
  return doc.save();
}
