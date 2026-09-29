import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { business } from "@/content/business";
import { formatShortDate } from "@/lib/admin/time";
import { contractRows, winAnsiSafe, type ContractInput } from "./contract-layout";
import { LETTER, MARGIN, wrap } from "@/lib/pdf/text";

const COLS = { room: MARGIN, product: MARGIN + 95, qty: 430, unit: 470, total: 540 };

/** Page 1+: the priced contract. Then the owner's terms PDF, page for page. Signing stamps it later. */
export async function buildContractPdf(input: ContractInput, termsPdf: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { rows, totals } = contractRows(input);
  const fullWidth = LETTER[0] - 2 * MARGIN;

  let page: PDFPage = doc.addPage(LETTER);
  let y = LETTER[1] - MARGIN;
  // Every string drawn passes through winAnsiSafe: the standard fonts throw on anything they cannot encode.
  const text = (s: string, x: number, size = 9, font = regular) => page.drawText(winAnsiSafe(s), { x, y, size, font, color: rgb(0.1, 0.1, 0.1) });
  const right = (s: string, xRight: number, size = 9, font = regular) => text(s, xRight - font.widthOfTextAtSize(winAnsiSafe(s), size), size, font);
  const need = (height: number) => { if (y - height < MARGIN) { page = doc.addPage(LETTER); y = LETTER[1] - MARGIN; } };

  text(business.legalName, MARGIN, 14, bold); y -= 16;
  text(`${business.phone.display} · ${business.email}`, MARGIN, 9); y -= 26;
  const date = formatShortDate(input.date);
  const title = wrap(`Contract ${input.projectNo} \u00b7 Version ${input.version}`, bold, 16, fullWidth - regular.widthOfTextAtSize(winAnsiSafe(date), 10) - 16);
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
    const details = wrap(row.details, regular, 8, COLS.qty - COLS.product - 40);
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
  text("The terms and conditions on the following pages are part of this contract.", MARGIN, 9);

  const terms = await PDFDocument.load(termsPdf);
  const copied = await doc.copyPages(terms, terms.getPageIndices());
  for (const p of copied) doc.addPage(p);
  return doc.save();
}
