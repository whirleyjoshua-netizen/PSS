// @vitest-environment node
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { pdfPages } from "@/e2e/fixtures/pdf-pages";
import { embedHandwriting } from "@/lib/pdf/handwriting";
import { pngBytes } from "../fixtures/png";

async function sample() {
  const pdf = await PDFDocument.create();
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const hand = await embedHandwriting(pdf);
  const image = await pdf.embedPng(pngBytes(40, 20));
  const first = pdf.addPage();
  first.drawText("4. Your Right to Cancel", { x: 50, y: 700, size: 11, font: helvetica });
  first.drawText("JD", { x: 500, y: 700, size: 14, font: hand.hand });
  first.drawImage(image, { x: 500, y: 650, width: 40, height: 20 });
  const second = pdf.addPage();
  second.drawText("Jane Doe", { x: 150, y: 400, size: 20, font: hand.hand });
  second.drawImage(image, { x: 1, y: 1, width: 4, height: 2 });
  second.drawImage(image, { x: 9, y: 9, width: 4, height: 2 });
  return { bytes: await pdf.save(), handName: hand.hand.name };
}

describe("pdfPages", () => {
  it("reads each page's runs with their font, decoding the embedded font through ToUnicode", async () => {
    const { bytes, handName } = await sample();
    const pages = await pdfPages(bytes);
    expect(pages).toHaveLength(2);
    expect(pages[0].runs).toEqual([
      { font: "Helvetica", text: "4. Your Right to Cancel" },
      { font: handName, text: "JD" },
    ]);
    expect(pages[1].runs).toEqual([{ font: handName, text: "Jane Doe" }]);
  });
  it("counts image draws per page", async () => {
    const pages = await pdfPages((await sample()).bytes);
    expect(pages.map((page) => page.images)).toEqual([1, 2]);
  });
  it("reads a page that was drawn on again after loading (several content streams)", async () => {
    const loaded = await PDFDocument.load((await sample()).bytes);
    loaded.getPage(0).drawText("Printed", { x: 10, y: 10, size: 9, font: await loaded.embedFont(StandardFonts.Helvetica) });
    const pages = await pdfPages(await loaded.save());
    expect(pages[0].runs.map((run) => run.text)).toEqual(["4. Your Right to Cancel", "JD", "Printed"]);
    expect(pages[0].runs[2]).toEqual({ font: "Helvetica", text: "Printed" });
  });
  it("counts only image XObjects, not a drawn form XObject (an embedded page)", async () => {
    const pdf = await PDFDocument.create();
    const source = pdf.addPage();
    source.drawText("Source", { x: 10, y: 10, size: 9, font: await pdf.embedFont(StandardFonts.Helvetica) });
    const target = pdf.addPage();
    target.drawPage(await pdf.embedPage(source));
    target.drawImage(await pdf.embedPng(pngBytes(4, 2)), { x: 1, y: 1, width: 4, height: 2 });
    const pages = await pdfPages(await pdf.save());
    expect(pages[1].images).toBe(1);
  });
});

/** A page whose fonts are Helvetica and the hand font (drawn once each), with `content(keys)` appended as a raw content stream. */
async function withContent(content: (keys: { helvetica: string; hand: string }) => string, drawFirst = true): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const keys = { helvetica: "", hand: "" };
  if (drawFirst) {
    page.drawText("A", { x: 10, y: 10, size: 9, font: await pdf.embedFont(StandardFonts.Helvetica) });
    page.drawText("JD", { x: 10, y: 30, size: 9, font: (await embedHandwriting(pdf)).hand });
    const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    for (const key of fonts.keys()) {
      const name = key.asString();
      if (name.startsWith("/Helvetica-")) keys.helvetica = name;
      else keys.hand = name;
    }
  }
  page.node.addContentStream(pdf.context.register(pdf.context.stream(content(keys))));
  return pdf.save();
}

describe("pdfPages refuses what it cannot read", () => {
  it("rejects a Tj before any Tf", async () => {
    await expect(pdfPages(await withContent(() => "BT <41> Tj ET", false))).rejects.toThrow(/Tj with no current font/);
  });
  it("rejects a Tf naming a font the page does not have", async () => {
    await expect(pdfPages(await withContent(() => "BT /Nope-123 12 Tf <41> Tj ET"))).rejects.toThrow(/not in the page's fonts: \/Nope-123/);
  });
  it("rejects a glyph the hand font's ToUnicode does not map", async () => {
    await expect(pdfPages(await withContent(({ hand }) => `BT ${hand} 12 Tf <FFFF> Tj ET`))).rejects.toThrow(/no ToUnicode mapping for glyph ffff/);
  });
  it("rejects a hand-font run that is not whole 2-byte glyphs", async () => {
    await expect(pdfPages(await withContent(({ hand }) => `BT ${hand} 12 Tf <ABC> Tj ET`))).rejects.toThrow(/not whole 2-byte glyphs/);
  });
  it("rejects a Tj whose operand is not a hex string", async () => {
    await expect(pdfPages(await withContent(({ helvetica }) => `BT ${helvetica} 12 Tf 41 Tj ET`))).rejects.toThrow(/Tj without a hex string/);
  });
  it("rejects a Do naming an XObject the page does not have", async () => {
    await expect(pdfPages(await withContent(() => "q /Nope-9 Do Q"))).rejects.toThrow(/not in the page's XObjects: \/Nope-9/);
  });
  it("rejects a literal-string Tj", async () => {
    await expect(pdfPages(await withContent(({ helvetica }) => `BT ${helvetica} 12 Tf (Hi) Tj ET`))).rejects.toThrow(/literal string/);
  });
  it.each([
    ["TJ", "[<41> 10 <42>] TJ"],
    ["'", "<41> '"],
    ['"', '1 2 <41> "'],
  ])("rejects the %s text operator", async (operator, show) => {
    await expect(pdfPages(await withContent(({ helvetica }) => `BT ${helvetica} 12 Tf ${show} ET`))).rejects.toThrow(
      `unsupported text operator ${operator}`,
    );
  });
});
