import "server-only";
import { rgb, type PDFDocument, type PDFEmbeddedPage, type PDFFont, type PDFPage } from "pdf-lib";
import { business } from "@/content/business";
import { LOGO_MASTER_PDF_BASE64 } from "@/lib/brand/logo-master";
import { winAnsiSafe } from "@/lib/dc/contract-layout";
import { LETTER, MARGIN } from "./text";

/**
 * The logo on every PDF we generate, always from the one master (lib/brand/logo-master.ts, pinned by
 * tests/brand/logo-master.test.ts). It is placed by width alone, so it can never be stretched.
 */

export type EmbeddedLogo = { lockup: PDFEmbeddedPage; mark: PDFEmbeddedPage };

/** Page 1's lockup width, in points. */
export const LETTERHEAD_WIDTH = 170;
/** The mark's height on later pages, in points. */
export const MARK_HEIGHT = 22;

/** The letterhead's top: a little above the margin, where the old text letterhead's capitals reached. */
const TOP = LETTER[1] - MARGIN + 8;
const SMALL = 8.5;
const GREY = rgb(0.33, 0.33, 0.33);

let master: Uint8Array | null = null;

/** The master's bytes, decoded once per process; each caller gets its own copy. */
function masterBytes(): Uint8Array {
  master ??= new Uint8Array(Buffer.from(LOGO_MASTER_PDF_BASE64, "base64"));
  return master.slice();
}

/** Embeds the master's lockup and mark once per document, as vector pages. */
export async function embedLogo(doc: PDFDocument): Promise<EmbeddedLogo> {
  const [lockup, mark] = await doc.embedPdf(masterBytes(), [0, 1]);
  return { lockup, mark };
}

/** Draws `art` `width` points wide with its top-left at (x, top). The height always follows the master. */
export function drawLogo(page: PDFPage, art: PDFEmbeddedPage, at: { x: number; top: number; width: number }): { width: number; height: number } {
  const height = (at.width * art.height) / art.width;
  page.drawPage(art, { x: at.x, y: at.top - height, width: at.width, height });
  return { width: at.width, height };
}

/**
 * Page 1's letterhead: the lockup top-left, then the legal name and phone · email in small type.
 * Answers the y of the first line of content below it.
 */
export function drawLetterhead(page: PDFPage, logo: EmbeddedLogo, font: PDFFont): number {
  const { height } = drawLogo(page, logo.lockup, { x: MARGIN, top: TOP, width: LETTERHEAD_WIDTH });
  let y = TOP - height - 14;
  for (const line of [business.legalName, `${business.phone.display} · ${business.email}`]) {
    page.drawText(winAnsiSafe(line), { x: MARGIN, y, size: SMALL, font, color: GREY });
    y -= SMALL + 3;
  }
  return y - 20;
}

/**
 * The mark, MARK_HEIGHT tall, top-right in the top margin of every page from `fromPage` (0-based) on,
 * except the pages in `skip` (uploaded terms, which are printed exactly as uploaded).
 */
export function markPages(doc: PDFDocument, logo: EmbeddedLogo, options: { fromPage: number; skip?: ReadonlySet<PDFPage> }): void {
  const width = (MARK_HEIGHT * logo.mark.width) / logo.mark.height;
  for (const page of doc.getPages().slice(options.fromPage)) {
    if (options.skip?.has(page)) continue;
    drawLogo(page, logo.mark, { x: LETTER[0] - MARGIN - width, top: LETTER[1] - 18, width });
  }
}
