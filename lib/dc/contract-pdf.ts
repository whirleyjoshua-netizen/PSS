import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatShortDate } from "@/lib/admin/time";
import { contractRows, winAnsiSafe, type ContractInput } from "./contract-layout";
import { drawLetterhead, embedLogo, markPages, type EmbeddedLogo } from "@/lib/pdf/logo";
import { LETTER, MARGIN, wrap } from "@/lib/pdf/text";
import { parseDocText } from "@/lib/docs/parse";
import { drawSignatureBlock, renderBlocks, type PdfPen, type RenderedPdf } from "@/lib/docs/pdf";
import type { InitialsMark, MarkPoint } from "@/lib/pdf/sign-marks";

const COLS = { room: MARGIN, product: MARGIN + 95, qty: 430, unit: 470, total: 540 };

/** The terms a contract prints: the terms template's filled text, or (legacy) the uploaded PDF. */
export type ContractTerms = { text: string } | { pdf: Uint8Array };

/**
 * The "Terms and Conditions" pages, from a new page. Same fonts and margins as the contract; the
 * signed PDF then carries the exact terms signed. Numbered sections get initials boxes, their
 * marks pushed onto `initials`. Answers the pen, so the signature block follows the terms.
 */
function drawTerms(doc: PDFDocument, regular: PDFFont, bold: PDFFont, text: string, initials: InitialsMark[]): PdfPen {
  const pen: PdfPen = { doc, page: doc.addPage(LETTER), y: LETTER[1] - MARGIN, regular, bold, initials };
  pen.page.drawText("Terms and Conditions", { x: MARGIN, y: pen.y, size: 14, font: bold, color: rgb(0.1, 0.1, 0.1) });
  pen.y -= 26;
  renderBlocks(pen, parseDocText(text));
  return pen;
}

/** The terms pages alone, drawn exactly as buildContractPdf prints them (initials boxes and signature block included): the terms template's Preview PDF. */
export async function buildTermsPdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  drawSignatureBlock(drawTerms(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), text, []));
  // No letterhead here (the terms pages alone), so every page carries the mark, the first included.
  markPages(doc, await embedLogo(doc), { fromPage: 0 });
  return doc.save();
}

/**
 * Page 1+: the letterhead, the client, the priced lines and the totals under `heading`, ending with the
 * `closing` sentence. The contract and the quote both print through this, so the quote the client
 * approves and the contract they sign show the same figures. `details` draws the size · mount · fabric ·
 * control line under each product: the contract prints it, the quote leaves it out (owner, 2026-10-07).
 */
export function drawPricedPages(doc: PDFDocument, logo: EmbeddedLogo, regular: PDFFont, bold: PDFFont, input: ContractInput, heading: string, closing: string, { details: showDetails }: { details: boolean }): void {
  const { rows, totals } = contractRows(input);
  const fullWidth = LETTER[0] - 2 * MARGIN;

  let page: PDFPage = doc.addPage(LETTER);
  let y = LETTER[1] - MARGIN;
  // Every string drawn passes through winAnsiSafe: the standard fonts throw on anything they cannot encode.
  const text = (s: string, x: number, size = 9, font = regular) => page.drawText(winAnsiSafe(s), { x, y, size, font, color: rgb(0.1, 0.1, 0.1) });
  const right = (s: string, xRight: number, size = 9, font = regular) => text(s, xRight - font.widthOfTextAtSize(winAnsiSafe(s), size), size, font);
  const need = (height: number) => { if (y - height < MARGIN) { page = doc.addPage(LETTER); y = LETTER[1] - MARGIN; } };

  y = drawLetterhead(page, logo, regular);
  const date = formatShortDate(input.date);
  const title = wrap(heading, bold, 16, fullWidth - regular.widthOfTextAtSize(winAnsiSafe(date), 10) - 16);
  right(date, LETTER[0] - MARGIN, 10);
  title.forEach((l, i) => { if (i) y -= 18; text(l, MARGIN, 16, bold); }); y -= 20;
  for (const l of wrap(input.client.name, bold, 11, fullWidth)) { text(l, MARGIN, 11, bold); y -= 13; }
  for (const line of [input.client.address, input.client.city, input.client.email]) {
    if (line) for (const l of wrap(line, regular, 10, fullWidth)) { text(l, MARGIN, 10); y -= 12; }
  }
  y -= 14;

  const header = () => {
    text("Room", COLS.room, 9, bold); text("Product", COLS.product, 9, bold);
    right("Qty", COLS.qty, 9, bold); right("Each", COLS.unit + 20, 9, bold); right("Total", LETTER[0] - MARGIN, 9, bold);
    y -= 6; page.drawLine({ start: { x: MARGIN, y }, end: { x: LETTER[0] - MARGIN, y }, thickness: 0.5 }); y -= 12;
  };
  need(40);
  header();
  for (const row of rows) {
    const product = wrap(row.product, bold, 9, COLS.qty - COLS.product - 40);
    const details = showDetails ? wrap(row.details, regular, 8, COLS.qty - COLS.product - 40) : [];
    const roomLines = wrap(row.room, regular, 9, COLS.product - COLS.room - 8);
    const height = Math.max(product.length * 11 + details.length * 10, roomLines.length * 11) + 8;
    if (y - height < MARGIN) { page = doc.addPage(LETTER); y = LETTER[1] - MARGIN; header(); }
    const top = y;
    roomLines.forEach((l, i) => { y = top - i * 11; text(l, COLS.room); });
    y = top; right(row.qty, COLS.qty); right(row.unit, COLS.unit + 20); right(row.total, LETTER[0] - MARGIN);
    product.forEach((l, i) => { y = top - i * 11; text(l, COLS.product, 9, bold); });
    details.forEach((l, i) => { y = top - product.length * 11 - i * 10; text(l, COLS.product, 8); });
    y = top - height;
  }
  need(totals.length * 16 + 20);
  y -= 6; page.drawLine({ start: { x: 330, y }, end: { x: LETTER[0] - MARGIN, y }, thickness: 0.5 }); y -= 14;
  for (const [label, value] of totals) {
    const strong = label === "Total";
    right(label, 470, strong ? 11 : 9, strong ? bold : regular);
    right(value, LETTER[0] - MARGIN, strong ? 11 : 9, strong ? bold : regular);
    y -= strong ? 16 : 13;
  }
  need(40);
  y -= 16;
  text(closing, MARGIN, 9);
}

/** Page 1+: the priced contract. Then the terms: drawn from the terms template, or the uploaded PDF page for page. Signing stamps it later. */
export async function renderContractPdf(input: ContractInput, terms: ContractTerms): Promise<RenderedPdf> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(doc);
  drawPricedPages(doc, logo, regular, bold, input, `Contract ${input.projectNo} · Version ${input.version}`,
    "The terms and conditions on the following pages are part of this contract.", { details: true });

  const initials: InitialsMark[] = [];
  let signature: MarkPoint;
  let uploadedPages: ReadonlySet<PDFPage> = new Set();
  if ("text" in terms) {
    signature = drawSignatureBlock(drawTerms(doc, regular, bold, terms.text, initials));
  } else {
    const uploaded = await PDFDocument.load(terms.pdf);
    const copied = await doc.copyPages(uploaded, uploaded.getPageIndices());
    for (const p of copied) doc.addPage(p);
    uploadedPages = new Set(copied);
    // Uploaded terms have no sections we can find (spec §11): the block gets a final page of its own (spec §3).
    const pen: PdfPen = { doc, page: doc.addPage(LETTER), y: LETTER[1] - MARGIN, regular, bold };
    pen.page.drawText("Signature", { x: MARGIN, y: pen.y, size: 14, font: bold, color: rgb(0.1, 0.1, 0.1) });
    pen.y -= 26;
    signature = drawSignatureBlock(pen);
  }
  // Uploaded terms print exactly as uploaded: nothing is drawn on them.
  markPages(doc, logo, { fromPage: 1, skip: uploadedPages });
  return { bytes: await doc.save(), marks: { initials, signature } };
}

/** The contract as bytes alone, for callers that never store marks (tests, scripts). */
export async function buildContractPdf(input: ContractInput, terms: ContractTerms): Promise<Uint8Array> {
  return (await renderContractPdf(input, terms)).bytes;
}
