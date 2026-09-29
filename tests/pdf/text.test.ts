import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { LETTER, MARGIN, breakWord, wrap, wrapRuns, type Fonts, type Seg } from "@/lib/pdf/text";

async function fonts(): Promise<Fonts> {
  const doc = await PDFDocument.create();
  return { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
}
const widthOf = (f: Fonts, line: Seg[], size: number) =>
  line.reduce((sum, s) => sum + (s.bold ? f.bold : f.regular).widthOfTextAtSize(s.text, size), 0);
const plain = (lines: Seg[][]) => lines.map((line) => line.map((s) => s.text).join(""));

describe("page geometry and the moved helpers", () => {
  it("keeps the contract's letter page and margin", () => {
    expect(LETTER).toEqual([612, 792]);
    expect(MARGIN).toBe(54);
  });
  it("wrap and breakWord behave as they did inside contract-pdf", async () => {
    const { regular } = await fonts();
    expect(wrap("", regular, 9, 100)).toEqual([""]);
    expect(wrap("a  b\nc", regular, 9, 1000)).toEqual(["a b c"]);
    const pieces = breakWord("W".repeat(50), regular, 9, 60);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(regular.widthOfTextAtSize(piece, 9)).toBeLessThanOrEqual(60);
  });
});

describe("wrapRuns", () => {
  it("keeps punctuation glued to a bold word; a space is bold only between bold words", async () => {
    const f = await fonts();
    expect(wrapRuns([{ text: "Pay ", bold: false }, { text: "50%", bold: true }, { text: ", now.", bold: false }], f, 10, 500))
      .toEqual([[{ text: "Pay ", bold: false }, { text: "50%", bold: true }, { text: ", now.", bold: false }]]);
  });
  it("keeps a bold phrase in one segment", async () => {
    const f = await fonts();
    expect(wrapRuns([{ text: "within ", bold: false }, { text: "3 business days", bold: true }, { text: " of signing.", bold: false }], f, 10, 500))
      .toEqual([[{ text: "within ", bold: false }, { text: "3 business days", bold: true }, { text: " of signing.", bold: false }]]);
  });
  it("breaks at the width, never over it, losing no word", async () => {
    const f = await fonts();
    const runs = Array.from({ length: 60 }, (_, i) => ({ text: `word${i} `, bold: i % 3 === 0 }));
    const lines = wrapRuns(runs, f, 10, 200);
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) expect(widthOf(f, line, 10)).toBeLessThanOrEqual(200);
    expect(plain(lines).join(" ")).toBe(Array.from({ length: 60 }, (_, i) => `word${i}`).join(" "));
  });
  it("splits a word wider than the line", async () => {
    const f = await fonts();
    const lines = wrapRuns([{ text: "X".repeat(200), bold: true }], f, 10, 100);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(widthOf(f, line, 10)).toBeLessThanOrEqual(100);
    expect(plain(lines).join("")).toBe("X".repeat(200));
  });
  it("collapses whitespace and maps what WinAnsi cannot encode", async () => {
    const f = await fonts();
    expect(plain(wrapRuns([{ text: "a\n\tb → 日", bold: false }], f, 10, 500))).toEqual(["a b ? ?"]);
  });
  it("answers one empty line for no text", async () => expect(wrapRuns([], await fonts(), 10, 100)).toEqual([[]]));
});
