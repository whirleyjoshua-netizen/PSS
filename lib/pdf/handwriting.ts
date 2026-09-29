import "server-only";
import fontkit from "@pdf-lib/fontkit";
import { StandardFonts, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { winAnsiSafe } from "@/lib/dc/contract-layout";
import { GREAT_VIBES_TTF_BASE64 } from "./fonts/great-vibes";

let ttf: Uint8Array | null = null;

/** The handwriting font's bytes (spec §7), decoded once per process. */
export function handwritingTtf(): Uint8Array {
  ttf ??= new Uint8Array(Buffer.from(GREAT_VIBES_TTF_BASE64, "base64"));
  return ttf;
}

/** The hand font, its fallback (spec §7: Helvetica Oblique) and the code points the hand font can draw. */
export type Handwriting = { hand: PDFFont; fallback: PDFFont; supported: Set<number> };

export async function embedHandwriting(pdf: PDFDocument): Promise<Handwriting> {
  pdf.registerFontkit(fontkit);
  const hand = await pdf.embedFont(handwritingTtf(), { subset: true });
  const fallback = await pdf.embedFont(StandardFonts.HelveticaOblique);
  return { hand, fallback, supported: new Set(hand.getCharacterSet()) };
}

export type HandRun = { text: string; hand: boolean };

/**
 * Splits text into runs the hand font draws and runs it cannot. A custom font never throws on a
 * missing glyph (it draws an empty box), so the check is by code point. The fallback text goes
 * through winAnsiSafe, because the standard font WOULD throw.
 */
export function handRuns(text: string, supported: Set<number>): HandRun[] {
  const runs: HandRun[] = [];
  for (const ch of text.replace(/\s+/g, " ").trim()) {
    const hand = supported.has(ch.codePointAt(0)!);
    const piece = hand ? ch : winAnsiSafe(ch);
    const last = runs[runs.length - 1];
    if (last && last.hand === hand) last.text += piece;
    else runs.push({ text: piece, hand });
  }
  return runs;
}

/** Draws `text` in handwriting on the baseline at (x, y), sized to fit maxWidth and never above maxSize. Answers the size. */
export function drawHandwriting(
  page: PDFPage, fonts: Handwriting, text: string, box: { x: number; y: number; maxWidth: number; maxSize: number },
): number {
  const runs = handRuns(text, fonts.supported);
  const fontOf = (run: HandRun) => (run.hand ? fonts.hand : fonts.fallback);
  const widthAtOne = runs.reduce((sum, run) => sum + fontOf(run).widthOfTextAtSize(run.text, 1), 0);
  const size = widthAtOne > 0 ? Math.min(box.maxSize, box.maxWidth / widthAtOne) : box.maxSize;
  let x = box.x;
  for (const run of runs) {
    page.drawText(run.text, { x, y: box.y, size, font: fontOf(run) });
    x += fontOf(run).widthOfTextAtSize(run.text, size);
  }
  return size;
}
