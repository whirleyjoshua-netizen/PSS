import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { embedLogo, markPages } from "@/lib/pdf/logo";
import { LETTER, MARGIN } from "@/lib/pdf/text";
import { winAnsiSafe, type ContractInput } from "./contract-layout";
import { drawPricedPages } from "./contract-pdf";

const PREVIEW = "PREVIEW · Not sent to the client";

/**
 * Spec §2: the quote the client approves — the contract's priced pages, titled Quote, with no terms and no signature block,
 * and no details line under each product (those stay on the contract).
 * A preview is the very same pages with a line under the margin on each, so a saved copy can't pass for a sent quote.
 */
export async function buildQuotePdf(input: ContractInput, options: { preview?: boolean } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(doc);
  drawPricedPages(doc, logo, regular, bold, input, `Quote ${input.projectNo} · Version ${input.version}`,
    "Approve this quote on your project page and we will send your contract to sign.", { details: false });
  markPages(doc, logo, { fromPage: 1 });
  if (options.preview) {
    const text = winAnsiSafe(PREVIEW);
    const x = (LETTER[0] - bold.widthOfTextAtSize(text, 11)) / 2;
    for (const page of doc.getPages()) page.drawText(text, { x, y: MARGIN / 2, size: 11, font: bold, color: rgb(0.75, 0.1, 0.1) });
  }
  return doc.save();
}
