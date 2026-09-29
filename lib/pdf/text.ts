import type { PDFFont } from "pdf-lib";
import { winAnsiSafe } from "@/lib/dc/contract-layout";

/** US Letter in points, and the margin the contract uses. Shared so terms pages match contract pages. */
export const LETTER: [number, number] = [612, 792];
export const MARGIN = 54;

/** Splits one word wider than `width` into pieces that fit, so it cannot run into the next column. */
export function breakWord(word: string, font: PDFFont, size: number, width: number): string[] {
  const pieces: string[] = [];
  let piece = "";
  for (const ch of word) {
    if (piece && font.widthOfTextAtSize(piece + ch, size) > width) { pieces.push(piece); piece = ch; } else piece += ch;
  }
  if (piece) pieces.push(piece);
  return pieces;
}

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = winAnsiSafe(text).split(/\s+/).filter(Boolean).flatMap((word) => breakWord(word, font, size, width));
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && current) { lines.push(current); current = word; } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export type Seg = { text: string; bold: boolean };
export type Fonts = { regular: PDFFont; bold: PDFFont };
type Word = { segs: Seg[]; spaceBefore: boolean };

/**
 * `wrap` for mixed-weight text. A "word" is everything between spaces, so "**Bold**," stays one
 * word of two weights and never gains a space. Every piece passes through winAnsiSafe here, so
 * the widths measured are the widths drawn. A word wider than the line is broken with breakWord.
 * Returns lines of segments; adjacent segments of one weight are merged.
 */
export function wrapRuns(runs: Seg[], fonts: Fonts, size: number, width: number): Seg[][] {
  const fontOf = (bold: boolean) => (bold ? fonts.bold : fonts.regular);
  const widthOf = (segs: Seg[]) => segs.reduce((sum, s) => sum + fontOf(s.bold).widthOfTextAtSize(s.text, size), 0);

  const words: Word[] = [];
  let gap = false;
  for (const run of runs) {
    for (const part of winAnsiSafe(run.text).split(/( )/)) {
      if (part === "") continue;
      if (part === " ") { gap = true; continue; }
      const last = words[words.length - 1];
      if (last && !gap) last.segs.push({ text: part, bold: run.bold });
      else words.push({ segs: [{ text: part, bold: run.bold }], spaceBefore: words.length > 0 });
      gap = false;
    }
  }

  const fitted = words.flatMap((word): Word[] => {
    if (widthOf(word.segs) <= width) return [word];
    const pieces: Word[] = word.segs.flatMap((seg) =>
      breakWord(seg.text, fontOf(seg.bold), size, width).map((text) => ({ segs: [{ text, bold: seg.bold }], spaceBefore: false })));
    pieces[0].spaceBefore = word.spaceBefore;
    return pieces;
  });

  const lines: Seg[][] = [];
  let line: Seg[] = [];
  let used = 0;
  const append = (segs: Seg[]) => {
    for (const seg of segs) {
      const prev = line[line.length - 1];
      if (prev && prev.bold === seg.bold) prev.text += seg.text;
      else line.push({ ...seg });
    }
  };
  for (const word of fitted) {
    // A space is bold only between two bold words, so "**3 business days**" stays one bold
    // segment while "Pay **50%** now" draws "Pay " and " now" regular around a bold "50%".
    const space: Seg[] = line.length > 0 && word.spaceBefore
      ? [{ text: " ", bold: line[line.length - 1].bold && word.segs[0].bold }]
      : [];
    const needed = widthOf([...space, ...word.segs]);
    if (line.length > 0 && used + needed > width) {
      lines.push(line);
      line = [];
      append(word.segs);
      used = widthOf(word.segs);
      continue;
    }
    append([...space, ...word.segs]);
    used += needed;
  }
  if (line.length > 0) lines.push(line);
  return lines.length > 0 ? lines : [[]];
}
