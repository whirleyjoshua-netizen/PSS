import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage, StandardFonts, type PDFEmbeddedPage } from "pdf-lib";
import { business } from "@/content/business";
import { LETTER, MARGIN } from "@/lib/pdf/text";
import { LETTERHEAD_WIDTH, MARK_HEIGHT, drawLetterhead, drawLogo, embedLogo, markPages } from "@/lib/pdf/logo";

type Drawn = { page: PDFPage; art: PDFEmbeddedPage; x: number; y: number; width: number; height: number };

/** Every logo placement, with the page it went on. */
function spyOnDrawPage() {
  const drawn: Drawn[] = [];
  const original = PDFPage.prototype.drawPage;
  vi.spyOn(PDFPage.prototype, "drawPage").mockImplementation(function (this: PDFPage, art, options) {
    drawn.push({ page: this, art, x: options!.x!, y: options!.y!, width: options!.width!, height: options!.height! });
    return original.call(this, art, options);
  });
  return drawn;
}

afterEach(() => vi.restoreAllMocks());

describe("drawLogo", () => {
  it.each([40, 170, 333])("keeps the master's proportions at %d pt wide, and never stretches", async (width) => {
    const doc = await PDFDocument.create();
    const logo = await embedLogo(doc);
    const drawn = spyOnDrawPage();
    const page = doc.addPage(LETTER);
    for (const art of [logo.lockup, logo.mark]) {
      const size = drawLogo(page, art, { x: 10, top: 700, width });
      expect(size.height / size.width).toBeCloseTo(art.height / art.width, 9);
    }
    for (const d of drawn) {
      expect(d.width).toBe(width);
      expect(d.height / d.width).toBeCloseTo(d.art.height / d.art.width, 9);
      expect(d.y + d.height).toBeCloseTo(700, 9);
    }
  });

  it("embeds the master's two pages: the wide lockup and the 76 × 106 mark", async () => {
    const logo = await embedLogo(await PDFDocument.create());
    expect(logo.lockup.width / logo.lockup.height).toBeGreaterThan(3);
    expect(logo.mark.width / logo.mark.height).toBeCloseTo(76 / 106, 9);
  });
});

describe("drawLetterhead", () => {
  it("puts the lockup top-left, then the legal name and phone · email, and answers where the content starts below them", async () => {
    const doc = await PDFDocument.create();
    const logo = await embedLogo(doc);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage(LETTER);
    const drawn = spyOnDrawPage();
    const texts: { text: string; y: number }[] = [];
    const drawText = PDFPage.prototype.drawText;
    vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
      texts.push({ text, y: options!.y! });
      return drawText.call(this, text, options);
    });

    const start = drawLetterhead(page, logo, font);

    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatchObject({ art: logo.lockup, x: MARGIN, width: LETTERHEAD_WIDTH });
    const logoBottom = drawn[0].y;
    expect(texts.map((t) => t.text)).toEqual([business.legalName, `${business.phone.display} · ${business.email}`]);
    expect(texts[0].y).toBeLessThan(logoBottom);
    expect(texts[1].y).toBeLessThan(texts[0].y);
    expect(start).toBeLessThan(texts[1].y - 10);
  });
});

describe("markPages", () => {
  it("marks every page from `fromPage`, top-right inside the top margin, skipping the pages it is told to", async () => {
    const doc = await PDFDocument.create();
    const logo = await embedLogo(doc);
    const pages = [doc.addPage(LETTER), doc.addPage(LETTER), doc.addPage(LETTER), doc.addPage(LETTER)];
    const drawn = spyOnDrawPage();

    markPages(doc, logo, { fromPage: 1, skip: new Set([pages[2]]) });

    expect(drawn.map((d) => d.page)).toEqual([pages[1], pages[3]]);
    for (const d of drawn) {
      expect(d.art).toBe(logo.mark);
      expect(d.height).toBeCloseTo(MARK_HEIGHT, 9);
      expect(d.x + d.width).toBeCloseTo(LETTER[0] - MARGIN, 9);
      // Above the cap height of a first line set at the margin, and on the page.
      // 4pt clear of an initials box under a heading at the top of a page, which reaches LETTER[1] - MARGIN + 14.
      expect(d.y).toBeGreaterThanOrEqual(LETTER[1] - MARGIN + 18);
      expect(d.y + d.height).toBeLessThanOrEqual(LETTER[1] - 10);
    }
  });

  it("marks page 1 too when asked", async () => {
    const doc = await PDFDocument.create();
    const logo = await embedLogo(doc);
    doc.addPage(LETTER);
    const drawn = spyOnDrawPage();
    markPages(doc, logo, { fromPage: 0 });
    expect(drawn).toHaveLength(1);
  });
});
