import "server-only";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { ContractInput } from "./contract-layout";
import { drawPricedPages } from "./contract-pdf";

/** Spec §2: the quote the client approves — the contract's priced pages, titled Quote, with no terms and no signature block. */
export async function buildQuotePdf(input: ContractInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  drawPricedPages(doc, regular, bold, input, `Quote ${input.projectNo} · Version ${input.version}`,
    "Approve this quote on your project page and we will send your contract to sign.");
  return doc.save();
}
