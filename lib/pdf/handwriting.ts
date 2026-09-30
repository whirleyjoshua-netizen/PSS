import "server-only";
import fontkit from "@pdf-lib/fontkit";
import { StandardFonts, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { winAnsiSafe } from "@/lib/dc/contract-layout";
import { GREAT_VIBES_TTF_BASE64 } from "./fonts/great-vibes";

let ttf: Uint8Array | null = null;

/**
 * The handwriting font's bytes (spec §7), decoded once per process. Each caller gets its own copy,
 * so nothing a caller (or pdf-lib) does to the bytes can corrupt the font for the next document.
 */
export function handwritingTtf(): Uint8Array {
  ttf ??= new Uint8Array(Buffer.from(GREAT_VIBES_TTF_BASE64, "base64"));
  return ttf.slice();
}

/** The smallest size handwriting is drawn at. A name too long to fit at this size is cut with "...". */
export const HAND_MIN_SIZE = 7;
const ELLIPSIS = "...";

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
 * through winAnsiSafe, because the standard font WOULD throw. Text is composed (NFC) first, so a
 * decomposed "José" is drawn as José, not "Jose?".
 */
export function handRuns(text: string, supported: Set<number>): HandRun[] {
  const runs: HandRun[] = [];
  for (const ch of clean(text)) {
    const hand = supported.has(ch.codePointAt(0)!);
    const piece = hand ? ch : winAnsiSafe(ch);
    const last = runs[runs.length - 1];
    if (last && last.hand === hand) last.text += piece;
    else runs.push({ text: piece, hand });
  }
  return runs;
}

const clean = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();

/**
 * Draws `text` in handwriting on the baseline at (x, y), sized to fit maxWidth, never above maxSize
 * and never below HAND_MIN_SIZE. Text still too wide at HAND_MIN_SIZE is cut by code point and ends
 * in "...". A maxWidth of 0 or less draws nothing. Answers the size used (at least HAND_MIN_SIZE).
 */
export function drawHandwriting(
  page: PDFPage, fonts: Handwriting, text: string, box: { x: number; y: number; maxWidth: number; maxSize: number },
): number {
  if (!(box.maxWidth > 0)) return HAND_MIN_SIZE;
  const fontOf = (run: HandRun) => (run.hand ? fonts.hand : fonts.fallback);
  const widthOf = (rs: HandRun[], size: number) => rs.reduce((sum, run) => sum + fontOf(run).widthOfTextAtSize(run.text, size), 0);
  let runs = handRuns(text, fonts.supported);
  const widthAtOne = widthOf(runs, 1);
  const size = Math.max(HAND_MIN_SIZE, widthAtOne > 0 ? Math.min(box.maxSize, box.maxWidth / widthAtOne) : box.maxSize);
  if (widthOf(runs, size) > box.maxWidth) {
    // Longest code-point prefix that fits with the ellipsis. Nothing fits: nothing is drawn.
    const chars = [...clean(text)];
    runs = [];
    for (let n = chars.length - 1; n >= 0; n--) {
      const cut = handRuns(chars.slice(0, n).join("").trimEnd() + ELLIPSIS, fonts.supported);
      if (widthOf(cut, size) <= box.maxWidth) { runs = cut; break; }
    }
  }
  let x = box.x;
  for (const run of runs) {
    page.drawText(run.text, { x, y: box.y, size, font: fontOf(run) });
    x += fontOf(run).widthOfTextAtSize(run.text, size);
  }
  return size;
}
