import "server-only";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { formatShortDate, formatTime } from "@/lib/admin/time";

export type StampFacts = {
  signedName: string;
  signedEmail: string;
  signedAt: Date;
  sha256: string;
  projectNo: string | null;
};

/**
 * Adds a signature page to the owner's contract.
 *
 * A NEW page, never an overlay: the owner's PDF is their legal wording and its layout is
 * theirs. Drawing over it risks covering a term.
 *
 * Returns null instead of throwing. Some PDFs cannot be opened — encrypted ones especially —
 * and the signature is already recorded by the time this runs. The stamped copy is a
 * convenience; the record is what carries the weight.
 */
export async function stampSignature(original: Buffer, facts: StampFacts): Promise<Buffer | null> {
  try {
    const pdf = await PDFDocument.load(original);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage();
    const { height } = page.getSize();
    // Some Node/ICU builds put U+202F (or U+00A0) before AM/PM. The standard font cannot
    // encode either, so without this every stamp in that runtime would come back null.
    const when = `${formatShortDate(facts.signedAt)} at ${formatTime(facts.signedAt)}`.replace(/[\u202F\u00A0]/g, " ");
    const lines = [
      "ELECTRONIC SIGNATURE",
      "",
      `Signed by:  ${facts.signedName}`,
      `Account:    ${facts.signedEmail}`,
      `When:       ${when}`,
      facts.projectNo ? `Project:    ${facts.projectNo}` : null,
      "",
      "Document fingerprint (SHA-256):",
      facts.sha256,
    ].filter((line): line is string => line !== null);

    lines.forEach((line, index) => {
      page.drawText(line, { x: 56, y: height - 80 - index * 18, size: 11, font });
    });
    return Buffer.from(await pdf.save());
  } catch (error) {
    console.error("Could not stamp the signed contract", error);
    return null;
  }
}
