import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import type { ContractInput } from "@/lib/dc/contract-layout";
import { buildTermsPdf, renderContractPdf } from "@/lib/dc/contract-pdf";
import { buildQuotePdf } from "@/lib/dc/quote-pdf";
import { parseDocText } from "@/lib/docs/parse";
import { renderDocumentPdf } from "@/lib/docs/pdf";
import { LETTER, MARGIN } from "@/lib/pdf/text";

/** What each page carries: "lockup", "mark" or nothing, by page index, and every text baseline drawn. */
function spy() {
  const art: string[][] = [];
  const baselines: number[] = [];
  const drawPage = PDFPage.prototype.drawPage;
  vi.spyOn(PDFPage.prototype, "drawPage").mockImplementation(function (this: PDFPage, embedded, options) {
    const index = this.doc.getPages().indexOf(this);
    (art[index] ??= []).push(embedded.width / embedded.height > 2 ? "lockup" : "mark");
    return drawPage.call(this, embedded, options);
  });
  const drawText = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    baselines.push(options!.y!);
    return drawText.call(this, text, options);
  });
  return { art, baselines };
}

const pagesOf = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();
/** One lockup on page 1, one mark on every later page. */
const expected = (pages: number, from = 1) => Array.from({ length: pages }, (_, i) => (i === 0 && from === 1 ? ["lockup"] : ["mark"]));

const line = { room: "Primary Bedroom", description: "Hunter Douglas Silhouette", options: [["Order Width", "48"]] as [string, string][], qty: 1, sellUnitCents: 128150, sellExtendedCents: 128150 };
const input: ContractInput = {
  projectNo: "PSS-1042", version: 1, date: new Date("2026-09-28T12:00:00Z"),
  client: { name: "Test Testt", address: "1 Main St", city: "Las Vegas", email: "t@example.com" },
  lines: Array.from({ length: 30 }, () => line),
  installCents: 25000, handlingChargedCents: 6600, oversizedCents: 0, clientTotalCents: 30 * 128150 + 31600,
};
const TERMS = Array.from({ length: 12 }, (_, i) => `## ${i + 1}. Section\n\n${"The client agrees to the terms of this section. ".repeat(12)}`).join("\n\n");

afterEach(() => vi.restoreAllMocks());

describe("the logo on every generated PDF", () => {
  it("quote: letterhead on page 1, the mark on every later page", async () => {
    const s = spy();
    const pages = await pagesOf(await buildQuotePdf(input));
    expect(pages).toBeGreaterThan(1);
    expect(s.art).toEqual(expected(pages));
    expect(Math.max(...s.baselines)).toBeLessThanOrEqual(LETTER[1] - MARGIN);
  });

  it("quote preview: the same logo placement, the PREVIEW line too", async () => {
    const s = spy();
    const pages = await pagesOf(await buildQuotePdf(input, { preview: true }));
    expect(s.art).toEqual(expected(pages));
  });

  it("contract with typed terms: letterhead, then the mark on the priced, terms and signature pages", async () => {
    const s = spy();
    const pages = await pagesOf((await renderContractPdf(input, { text: TERMS })).bytes);
    expect(pages).toBeGreaterThan(3);
    expect(s.art).toEqual(expected(pages));
    expect(Math.max(...s.baselines)).toBeLessThanOrEqual(LETTER[1] - MARGIN);
  });

  it("contract with uploaded terms: those pages print exactly as uploaded", async () => {
    const uploaded = await PDFDocument.create();
    uploaded.addPage(LETTER); uploaded.addPage(LETTER);
    const terms = await uploaded.save();
    const priced = await pagesOf(await buildQuotePdf(input));
    vi.restoreAllMocks();
    const s = spy();
    const pages = await pagesOf((await renderContractPdf(input, { pdf: terms })).bytes);
    expect(pages).toBe(priced + 3);
    const want = expected(pages);
    want[priced] = undefined as never; want[priced + 1] = undefined as never;
    expect(Array.from({ length: pages }, (_, i) => s.art[i])).toEqual(want);
  });

  it("terms preview: the mark on every page, the first included", async () => {
    const s = spy();
    const pages = await pagesOf(await buildTermsPdf(TERMS));
    expect(s.art).toEqual(expected(pages, 0));
  });

  it.each(["sign", "view"] as const)("job document (%s): letterhead on page 1, the mark on later pages", async (response) => {
    const s = spy();
    const pages = await pagesOf((await renderDocumentPdf({
      title: "Care guide", projectNo: "PSS-1042", date: new Date("2026-09-28T12:00:00Z"),
      client: { name: "Test Testt", address: "1 Main St", city: "Las Vegas", email: "t@example.com" },
      blocks: parseDocText(TERMS), response,
    })).bytes);
    expect(pages).toBeGreaterThan(1);
    expect(s.art).toEqual(expected(pages));
    expect(Math.max(...s.baselines)).toBeLessThanOrEqual(LETTER[1] - MARGIN);
  });
});
