// @vitest-environment node
import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFPage, StandardFonts } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GREAT_VIBES_TTF_BASE64 } from "@/lib/pdf/fonts/great-vibes";
import { drawHandwriting, embedHandwriting, HAND_MIN_SIZE, handRuns, handwritingTtf, type Handwriting } from "@/lib/pdf/handwriting";

const TTF = "lib/pdf/fonts/GreatVibes-Regular.ttf";

function spyOnDrawText() {
  const drawn: { text: string; x: number; y: number; size: number; font: string }[] = [];
  const original = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    drawn.push({ text, x: options?.x ?? 0, y: options?.y ?? 0, size: options?.size ?? 0, font: options?.font?.name ?? "" });
    return original.call(this, text, options);
  });
  return drawn;
}
afterEach(() => vi.restoreAllMocks());

describe("the handwriting font", () => {
  it("is embedded byte for byte from the committed TTF", () => {
    expect(Buffer.from(GREAT_VIBES_TTF_BASE64, "base64").equals(readFileSync(TTF))).toBe(true);
    expect(Buffer.from(handwritingTtf()).equals(readFileSync(TTF))).toBe(true);
  });
  it("hands out bytes a caller cannot corrupt for the next caller", () => {
    const first = handwritingTtf();
    first[0] ^= 0xff;
    first[100] ^= 0xff;
    expect(Buffer.from(handwritingTtf()).equals(readFileSync(TTF))).toBe(true);
  });
  it("is a static font (no variation axes) with its OFL licence committed beside it", () => {
    const font = fontkit.create(readFileSync(TTF)) as unknown as { variationAxes: Record<string, unknown> };
    expect(Object.keys(font.variationAxes ?? {})).toEqual([]);
    expect(readFileSync("lib/pdf/fonts/OFL.txt", "utf8")).toMatch(/SIL OPEN FONT LICENSE/i);
  });
});

describe("handRuns", () => {
  const supported = new Set([..."Zoë Jan"].map((ch) => ch.codePointAt(0)!));
  it("keeps characters the font draws in one hand run", () => {
    expect(handRuns("Jan Zoë", supported)).toEqual([{ text: "Jan Zoë", hand: true }]);
  });
  it("puts characters the font cannot draw in fallback runs, WinAnsi-safe", () => {
    expect(handRuns("Zoë 日本 Jan", supported)).toEqual([
      { text: "Zoë ", hand: true }, { text: "??", hand: false }, { text: " Jan", hand: true },
    ]);
  });
  it("collapses whitespace and trims", () => {
    expect(handRuns("  Jan\n\tZoë ", supported)).toEqual([{ text: "Jan Zoë", hand: true }]);
  });
  it("composes a decomposed accent (NFD) so it stays in the hand run", () => {
    const withAccent = new Set([..."José"].map((ch) => ch.codePointAt(0)!));
    expect(handRuns("José", withAccent)).toEqual([{ text: "José", hand: true }]);
  });
});

async function page() {
  const pdf = await PDFDocument.create();
  return { pdf, page: pdf.addPage(), fonts: await embedHandwriting(pdf) };
}
const drawnWidth = (fonts: Handwriting, drawn: { text: string; size: number; font: string }[]) =>
  drawn.reduce((sum, d) => sum + (d.font === fonts.hand.name ? fonts.hand : fonts.fallback).widthOfTextAtSize(d.text, d.size), 0);

describe("drawHandwriting at the edges", () => {
  it("draws a 200-character name no smaller than the floor, cut with ... to fit maxWidth", async () => {
    const { pdf, page: p, fonts } = await page();
    const name = "Maximiliana Alexandrina Montgomery-Worthington ".repeat(5).slice(0, 200);
    expect(name).toHaveLength(200);
    const drawn = spyOnDrawText();
    const size = drawHandwriting(p, fonts, name, { x: 0, y: 0, maxWidth: 120, maxSize: 24 });
    expect(HAND_MIN_SIZE).toBe(7);
    expect(size).toBeGreaterThanOrEqual(HAND_MIN_SIZE);
    const text = drawn.map((d) => d.text).join("");
    expect(text.endsWith("...")).toBe(true);
    expect(name.startsWith(text.slice(0, -3))).toBe(true);
    expect(text.length).toBeGreaterThan(3);
    expect(drawn.every((d) => d.size === size)).toBe(true);
    expect(drawnWidth(fonts, drawn)).toBeLessThanOrEqual(120 + 0.01);
    await expect(pdf.save()).resolves.toBeInstanceOf(Uint8Array);
  });
  it.each([0, -3, NaN])("draws nothing and answers the floor for maxWidth %d", async (maxWidth) => {
    const { page: p, fonts } = await page();
    const drawn = spyOnDrawText();
    let size = 0;
    expect(() => { size = drawHandwriting(p, fonts, "Jan", { x: 0, y: 0, maxWidth, maxSize: 24 }); }).not.toThrow();
    expect(drawn).toEqual([]);
    expect(size).toBe(HAND_MIN_SIZE);
  });
  it("draws a decomposed José as José in the hand font", async () => {
    const { page: p, fonts } = await page();
    const drawn = spyOnDrawText();
    drawHandwriting(p, fonts, "José", { x: 0, y: 0, maxWidth: 300, maxSize: 20 });
    expect(drawn.map((d) => [d.text, d.font])).toEqual([["José", fonts.hand.name]]);
  });
  it.each([["an emoji", "Jan \u{1F600}"], ["a lone surrogate", "Jan \uD800 Zoë"]])("never throws on %s", async (_, text) => {
    const { pdf, page: p, fonts } = await page();
    const drawn = spyOnDrawText();
    expect(() => drawHandwriting(p, fonts, text, { x: 0, y: 0, maxWidth: 300, maxSize: 20 })).not.toThrow();
    expect(drawn.length).toBeGreaterThan(0);
    await expect(pdf.save()).resolves.toBeInstanceOf(Uint8Array);
  });
  it.each([["empty", ""], ["whitespace-only", " \n\t "]])("draws nothing for %s text", async (_, text) => {
    const { page: p, fonts } = await page();
    const drawn = spyOnDrawText();
    const size = drawHandwriting(p, fonts, text, { x: 0, y: 0, maxWidth: 300, maxSize: 20 });
    expect(drawn).toEqual([]);
    expect(size).toBeGreaterThanOrEqual(HAND_MIN_SIZE);
  });
});

describe("drawHandwriting", () => {
  it("draws in the hand font, at most maxSize", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const fonts = await embedHandwriting(pdf);
    const drawn = spyOnDrawText();
    const size = drawHandwriting(page, fonts, "Jo", { x: 10, y: 20, maxWidth: 500, maxSize: 24 });
    expect(size).toBe(24);
    expect(drawn).toEqual([{ text: "Jo", x: 10, y: 20, size: 24, font: fonts.hand.name }]);
    await expect(pdf.save()).resolves.toBeInstanceOf(Uint8Array);
  });
  it("shrinks a long name to fit maxWidth", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const fonts = await embedHandwriting(pdf);
    const name = "Maximiliana Alexandrina Montgomery-Worthington";
    // 200pt keeps this a pure shrink, above HAND_MIN_SIZE (at 120pt the floor cuts it; see the edge tests).
    const size = drawHandwriting(page, fonts, name, { x: 0, y: 0, maxWidth: 200, maxSize: 24 });
    expect(size).toBeLessThan(24);
    expect(size).toBeGreaterThan(HAND_MIN_SIZE);
    expect(fonts.hand.widthOfTextAtSize(name, size)).toBeLessThanOrEqual(200 + 0.01);
  });
  it("draws what the font lacks in Helvetica Oblique, encodably, and never throws", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const fonts = await embedHandwriting(pdf);
    const drawn = spyOnDrawText();
    expect(() => drawHandwriting(page, fonts, "Jan 日本", { x: 0, y: 0, maxWidth: 300, maxSize: 20 })).not.toThrow();
    const fallback = drawn.filter((d) => d.font === "Helvetica-Oblique");
    expect(fallback.map((d) => d.text)).toEqual(["??"]);
    const oblique = await (await PDFDocument.create()).embedFont(StandardFonts.HelveticaOblique);
    for (const { text } of fallback) expect(() => oblique.encodeText(text)).not.toThrow();
    // Consecutive runs sit side by side, never on top of one another.
    expect(drawn[1].x).toBeGreaterThan(drawn[0].x);
    await expect(pdf.save()).resolves.toBeInstanceOf(Uint8Array);
  });
});
