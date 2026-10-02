import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatShortDate } from "@/lib/admin/time";
import { winAnsiSafe } from "@/lib/dc/contract-layout";
import { drawLetterhead, embedLogo, markPages } from "@/lib/pdf/logo";
import { LETTER, MARGIN, wrapRuns, type Seg } from "@/lib/pdf/text";
import {
  INITIALS_BOX, INITIALS_GUTTER, SIGNATURE_BLOCK, sectionNumber, type InitialsMark, type MarkPoint, type SignMarks,
} from "@/lib/pdf/sign-marks";
import type { DocResponse } from "./kinds";
import type { Block, Inline } from "./types";

/**
 * Where the next line goes. renderBlocks moves `page` and `y` as it draws. When `initials` is set
 * (a PDF the client will sign), each numbered heading gets an empty initials box and its mark is
 * pushed here (spec §3).
 */
export type PdfPen = { doc: PDFDocument; page: PDFPage; y: number; regular: PDFFont; bold: PDFFont; initials?: InitialsMark[] };

/** A generated PDF and the places the client's marks belong on it (spec §3). */
export type RenderedPdf = { bytes: Uint8Array; marks: SignMarks };

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

const plainText = (inlines: Inline[]): string =>
  inlines.map((inline) => (inline.type === "text" ? inline.text : `{{${inline.key}}}`)).join("");

const pageIndex = (pen: PdfPen): number => pen.doc.getPages().indexOf(pen.page);

/** The "Initials" caption under the initials line: its baseline is `drop` below the line. */
const CAPTION = { drop: 8, size: 6 } as const;

/** The empty initials line at the right margin, level with the heading's first baseline (pen.y). Answers its place. */
function drawInitialsBox(pen: PdfPen): MarkPoint {
  const x = LETTER[0] - MARGIN - INITIALS_BOX.width;
  const y = pen.y - INITIALS_BOX.lineDrop;
  pen.page.drawLine({ start: { x, y }, end: { x: x + INITIALS_BOX.width, y }, thickness: 0.5, color: INK });
  pen.page.drawText("Initials", { x, y: y - CAPTION.drop, size: CAPTION.size, font: pen.regular, color: INK });
  return { page: pageIndex(pen), x, y };
}

/**
 * How far below a numbered heading's first baseline the next line's baseline must sit, so that line's
 * ascenders clear the bottom of the "Initials" caption by at least 1pt. About 20.4pt: more than one
 * heading lead (17pt for ##, 14pt for ###), so a one-line numbered heading needs extra room after it.
 */
function clearOfCaption(pen: PdfPen): number {
  const ascent = (size: number) => pen.regular.heightAtSize(size, { descender: false });
  const captionDescent = pen.regular.heightAtSize(CAPTION.size) - ascent(CAPTION.size);
  return INITIALS_BOX.lineDrop + CAPTION.drop + captionDescent + 1 + ascent(BODY);
}

/**
 * "Client signature", "Printed name" and "Date", each with an empty line, kept together on one
 * page (a new one if the rest of this one is too short). Answers the signature line's left end (spec §3).
 */
export function drawSignatureBlock(pen: PdfPen): MarkPoint {
  ensure(pen, SIGNATURE_BLOCK.height);
  const top = pen.y - SIGNATURE_BLOCK.before;
  const x = MARGIN + SIGNATURE_BLOCK.labelWidth;
  const rows: [string, number][] = [
    ["Client signature", SIGNATURE_BLOCK.lineWidth], ["Printed name", SIGNATURE_BLOCK.lineWidth], ["Date", SIGNATURE_BLOCK.dateWidth],
  ];
  rows.forEach(([label, width], i) => {
    const baseline = top - i * SIGNATURE_BLOCK.row;
    const line = baseline - SIGNATURE_BLOCK.lineDrop;
    pen.page.drawText(label, { x: MARGIN, y: baseline, size: BODY, font: pen.regular, color: INK });
    pen.page.drawLine({ start: { x, y: line }, end: { x: x + width, y: line }, thickness: 0.5, color: INK });
  });
  pen.y = top - 2 * SIGNATURE_BLOCK.row - LEAD;
  return { page: pageIndex(pen), x, y: top - SIGNATURE_BLOCK.lineDrop };
}

/** Draws doc-text blocks from the pen's position, adding pages as needed. Used for documents and contract terms. */
export function renderBlocks(pen: PdfPen, blocks: Block[]): void {
  const fonts = { regular: pen.regular, bold: pen.bold };
  blocks.forEach((block, index) => {
    if (block.type === "heading") {
      const style = HEADING[block.level];
      // Only a PDF the client will sign initials its numbered sections (spec §3).
      const section = pen.initials ? sectionNumber(plainText(block.inlines)) : null;
      const lines = wrapRuns(segsOf(block.inlines, true), fonts, style.size, section ? WIDTH - INITIALS_GUTTER : WIDTH);
      // The room a numbered heading leaves under itself so the next line clears its "Initials" caption.
      const belowCaption = section && pen.initials ? Math.max(0, clearOfCaption(pen) - lines.length * style.lead) : 0;
      // A heading never sits alone at the foot of a page: it moves with room for a line of text.
      // The space above it is skipped at the top of a fresh page, where nothing sits above it.
      const freshPage = ensure(pen, style.before + lines.length * style.lead + belowCaption + LEAD);
      if (index > 0 && !freshPage) pen.y -= style.before;
      // After the page decision, so a heading that moved takes its box and its mark with it.
      if (section && pen.initials) {
        pen.initials.push({ ...drawInitialsBox(pen), section });
        drawLines(pen, lines, MARGIN, style.size, style.lead);
        pen.y -= belowCaption;
      } else {
        drawLines(pen, lines, MARGIN, style.size, style.lead);
      }
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

/** A job document as a PDF (spec §6): company header, title and date, client block, body, and for a sign document the signature block. */
export async function renderDocumentPdf(input: DocumentPdfInput): Promise<RenderedPdf> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const signing = input.response === "sign";
  const pen: PdfPen = { doc, page: doc.addPage(LETTER), y: LETTER[1] - MARGIN, regular, bold, initials: signing ? [] : undefined };
  const fonts = { regular, bold };

  const logo = await embedLogo(doc);
  pen.y = drawLetterhead(pen.page, logo, regular);

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
  let signature: MarkPoint | null = null;
  if (signing) {
    pen.y -= GAP;
    signature = drawSignatureBlock(pen);
  }
  markPages(doc, logo, { fromPage: 1 });
  return { bytes: await doc.save(), marks: { initials: pen.initials ?? [], signature } };
}

/** The same PDF as bytes alone: the preview route and anything that never stores marks. */
export async function buildDocumentPdf(input: DocumentPdfInput): Promise<Uint8Array> {
  return (await renderDocumentPdf(input)).bytes;
}
