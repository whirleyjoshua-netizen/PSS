// @vitest-environment node
import { PDFDocument, StandardFonts } from "pdf-lib";
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
  });
});
