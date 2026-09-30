import "server-only";
import { PDFDocument, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatShortDate, formatTime } from "@/lib/admin/time";
import { winAnsiSafe } from "@/lib/dc/contract-layout";
import { HAND_MIN_SIZE, drawHandwriting, embedHandwriting } from "@/lib/pdf/handwriting";
import { INITIALS_BOX, SIGNATURE_BLOCK, initialedSections, type SignMarks } from "@/lib/pdf/sign-marks";
import { wrap } from "@/lib/pdf/text";
import type { Adoption } from "./adoption";

export type StampFacts = {
  signedName: string;
  signedEmail: string;
  signedAt: Date;
  sha256: string;
  projectNo: string | null;
};

type Box = { x: number; y: number; width: number; height: number };

/** An image scaled to fit the box, proportions kept, sitting on the box's bottom-left corner. */
function drawImageIn(page: PDFPage, image: PDFImage, box: Box): void {
  const { width, height } = image.scaleToFit(box.width, box.height);
  page.drawImage(image, { x: box.x, y: box.y, width, height });
}

const PRINTED_SIZE = 11;

/**
 * A line holding the signer's name (the printed name, and "Signed by:" on the signature page) sized
 * to fit `maxWidth`, as drawHandwriting sizes a signature: never above 11pt, never below
 * HAND_MIN_SIZE, and cut by code point with "..." when still too wide. The text is not made safe: a
 * name the standard font cannot draw throws, and the stamp answers null, as before.
 */
function fitPrinted(font: PDFFont, name: string, maxWidth: number): { text: string; size: number } {
  const widthAtOne = font.widthOfTextAtSize(name, 1);
  const size = Math.max(HAND_MIN_SIZE, widthAtOne > 0 ? Math.min(PRINTED_SIZE, maxWidth / widthAtOne) : PRINTED_SIZE);
  if (font.widthOfTextAtSize(name, size) <= maxWidth) return { text: name, size };
  const chars = [...name];
  for (let n = chars.length - 1; n >= 0; n--) {
    const cut = chars.slice(0, n).join("").trimEnd() + "...";
    if (font.widthOfTextAtSize(cut, size) <= maxWidth) return { text: cut, size };
  }
  return { text: "", size };
}

/**
 * Makes the signed copy (spec §5).
 *
 * With sign marks (a PDF we generated), a copy of the original gets the client's initials at every
 * initials mark and their signature, printed name and date in the signature block: only into the
 * empty places the unsigned PDF drew for them. Nothing else on those pages changes. Every copy then
 * gains the ELECTRONIC SIGNATURE page, which also shows the adoption. A file with no marks (a
 * hand-uploaded contract, or one generated before marks existed) gets only that page, as before.
 *
 * The original and its fingerprint are untouched: the client signed the original bytes, and this
 * copy is a convenience. The record is what carries the weight.
 *
 * Returns null instead of throwing. Some PDFs cannot be opened (encrypted ones especially), and a
 * drawn PNG with a valid header can still fail to decode. The signature is already recorded by the
 * time this runs.
 */
export async function stampSignature(
  original: Buffer, facts: StampFacts, adoption: Adoption, marks: SignMarks | null,
): Promise<Buffer | null> {
  try {
    const pdf = await PDFDocument.load(original);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const hand = await embedHandwriting(pdf);
    const signatureImage = adoption.method === "drawn" ? await pdf.embedPng(adoption.signaturePng) : null;
    const initialsImage = adoption.method === "drawn" && adoption.initialsPng ? await pdf.embedPng(adoption.initialsPng) : null;
    const typedInitials = adoption.method === "typed" ? adoption.initials : null;
    const hasInitials = initialsImage !== null || typedInitials !== null;
    if (!hasInitials && marks && marks.initials.length > 0) {
      // The action refuses this (spec §6: initials exactly when the file has initial marks), so it
      // means a caller skipped that check. The marks stay empty rather than failing the whole stamp.
      console.error(`The file has ${marks.initials.length} initials marks but the adoption has no initials: left empty`);
    }
    // Taken before the signature page is added: marks index the original's pages.
    const pages = pdf.getPages();

    const drawInitials = (page: PDFPage, box: Box) => {
      if (initialsImage) drawImageIn(page, initialsImage, box);
      else if (typedInitials) drawHandwriting(page, hand, typedInitials, { x: box.x + 2, y: box.y + 3, maxWidth: box.width - 4, maxSize: Math.min(14, box.height - 2) });
    };
    const drawSignature = (page: PDFPage, box: Box) => {
      if (signatureImage) drawImageIn(page, signatureImage, box);
      else drawHandwriting(page, hand, facts.signedName, { x: box.x + 2, y: box.y + 4, maxWidth: box.width - 4, maxSize: Math.min(24, box.height - 2) });
    };

    if (marks) {
      for (const mark of marks.initials) {
        const page = pages[mark.page];
        if (!page) {
          console.error(`Initials mark on page ${mark.page} of a ${pages.length}-page PDF: skipped`);
          continue;
        }
        drawInitials(page, { x: mark.x, y: mark.y + 1, width: INITIALS_BOX.width, height: INITIALS_BOX.height });
      }
      const at = marks.signature;
      const page = at ? pages[at.page] : undefined;
      if (at && page) {
        drawSignature(page, { x: at.x, y: at.y + 1, width: SIGNATURE_BLOCK.lineWidth, height: SIGNATURE_BLOCK.signatureHeight });
        const printed = fitPrinted(font, facts.signedName, SIGNATURE_BLOCK.lineWidth - 4);
        page.drawText(printed.text, { x: at.x + 4, y: at.y - SIGNATURE_BLOCK.row + 4, size: printed.size, font });
        page.drawText(winAnsiSafe(formatShortDate(facts.signedAt)), { x: at.x + 4, y: at.y - 2 * SIGNATURE_BLOCK.row + 4, size: 11, font });
      } else if (at) {
        console.error(`Signature mark on page ${at.page} of a ${pages.length}-page PDF: skipped`);
      }
    }

    const page = pdf.addPage();
    const { width: pageWidth, height } = page.getSize();
    const signedBy = fitPrinted(font, `Signed by:  ${facts.signedName}`, pageWidth - 2 * 56);
    // Some Node/ICU builds put U+202F (or U+00A0) before AM/PM. The standard font cannot
    // encode either, so without this every stamp in that runtime would come back null.
    const when = `${formatShortDate(facts.signedAt)} at ${formatTime(facts.signedAt)}`.replace(/[\u202F\u00A0]/g, " ");
    const sections = initialedSections(marks);
    const lines = [
      "ELECTRONIC SIGNATURE",
      "",
      signedBy,
      `Account:    ${winAnsiSafe(facts.signedEmail)}`,
      `When:       ${when}`,
      facts.projectNo ? `Project:    ${winAnsiSafe(facts.projectNo)}` : null,
      `Method:     ${adoption.method}`,
      ...(sections.length > 0 ? wrap(`Initialed sections: ${sections.join(", ")}`, font, 11, 500) : ["No numbered sections"]),
      "",
      "Document fingerprint (SHA-256):",
      facts.sha256,
    ].filter((line) => line !== null);

    lines.forEach((line, index) => {
      const { text, size } = typeof line === "string" ? { text: line, size: 11 } : line;
      page.drawText(text, { x: 56, y: height - 80 - index * 18, size, font });
    });

    let y = height - 80 - lines.length * 18 - 24;
    page.drawText("Adopted signature:", { x: 56, y, size: 11, font });
    drawSignature(page, { x: 200, y: y - 4, width: 240, height: 40 });
    if (hasInitials) {
      y -= 56;
      page.drawText("Adopted initials:", { x: 56, y, size: 11, font });
      drawInitials(page, { x: 200, y: y - 4, width: 80, height: 30 });
    }
    return Buffer.from(await pdf.save());
  } catch (error) {
    console.error("Could not stamp the signed contract", error);
    return null;
  }
}
