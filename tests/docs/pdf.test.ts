import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage, StandardFonts } from "pdf-lib";
import { business } from "@/content/business";
import { SIGN_CLOSING, buildDocumentPdf, type DocumentPdfInput } from "@/lib/docs/pdf";
import type { Block, Inline } from "@/lib/docs/types";

/** Every string drawn, with where and in which font, captured before pdf-lib encodes it. */
function spyOnDrawText() {
  const drawn: { text: string; x: number; y: number; font: string; page: PDFPage }[] = [];
  const original = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    drawn.push({ text, x: options?.x ?? 0, y: options?.y ?? 0, font: options?.font?.name ?? "", page: this });
    return original.call(this, text, options);
  });
  return drawn;
}
afterEach(() => vi.restoreAllMocks());

const t = (text: string, bold = false): Inline => ({ type: "text", text, bold });
const input = (blocks: Block[], response: DocumentPdfInput["response"] = "acknowledge"): DocumentPdfInput => ({
  title: "Service agreement — PSS-1048", projectNo: "PSS-1048", date: new Date("2026-09-28T19:00:00Z"),
  client: { name: "Maria Lopez", address: "12 Palm Way", city: "Henderson", email: "maria@example.com" }, blocks, response,
});

describe("buildDocumentPdf", () => {
  it("draws the company header, title, date, client block and body", async () => {
    const drawn = spyOnDrawText();
    await buildDocumentPdf(input([{ type: "heading", level: 2, inlines: [t("Scope")] }, { type: "paragraph", inlines: [t("Two shades.")] }]));
    const texts = drawn.map((d) => d.text);
    for (const expected of [business.legalName, "Service agreement - PSS-1048", "Sep 28, 2026", "Maria Lopez", "12 Palm Way",
      "Henderson", "maria@example.com", "Project PSS-1048", "Scope", "Two shades."]) expect(texts).toContain(expected);
    expect(drawn.find((d) => d.text === "Scope")!.font).toBe("Helvetica-Bold");
  });
  it("draws bold runs in the bold font and plain runs in the regular one", async () => {
    const drawn = spyOnDrawText();
    await buildDocumentPdf(input([{ type: "paragraph", inlines: [t("Pay "), t("50%", true), t(" now.")] }]));
    expect(drawn.find((d) => d.text === "50%")).toMatchObject({ font: "Helvetica-Bold" });
    expect(drawn.find((d) => d.text === "Pay ")).toMatchObject({ font: "Helvetica" });
  });
  it("draws a marker that is still a marker literally", async () => {
    const drawn = spyOnDrawText();
    await buildDocumentPdf(input([{ type: "paragraph", inlines: [t("Deposit "), { type: "field", key: "deposit", bold: false }] }]));
    expect(drawn.map((d) => d.text)).toContain("Deposit {{deposit}}");
  });
  it("wraps a bullet with a hanging indent", async () => {
    const drawn = spyOnDrawText();
    const long = "Give us clear access to every window, with furniture and fragile items moved away from the glass and the frames.";
    await buildDocumentPdf(input([{ type: "bullets", items: [[t(long)]] }]));
    const bullets = drawn.filter((d) => d.text === "•");
    expect(bullets).toHaveLength(1);
    expect(bullets[0].x).toBe(54 + 4);
    const lines = drawn.filter((d) => long.includes(d.text) && d.text.length > 3);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.x).toBe(54 + 16);
    expect(lines[0].y).toBe(bullets[0].y);
  });
  it("breaks onto new pages instead of drawing below the margin", async () => {
    const drawn = spyOnDrawText();
    const blocks: Block[] = Array.from({ length: 120 }, (_, i) => ({ type: "paragraph", inlines: [t(`Paragraph ${i} of the agreement text.`)] }));
    const doc = await PDFDocument.load(await buildDocumentPdf(input(blocks)));
    expect(doc.getPageCount()).toBeGreaterThan(1);
    for (const { y, text } of drawn) expect(y, text).toBeGreaterThanOrEqual(54);
  });
  it("never throws on characters WinAnsi cannot encode, and draws only encodable text", async () => {
    const drawn = spyOnDrawText();
    const odd = "→ 日本 🙂 ✓ Zoë “quoted” ½″ ";
    const bytes = await buildDocumentPdf({ ...input([{ type: "heading", level: 3, inlines: [t(odd, true)] }, { type: "bullets", items: [[t(odd)]] }]),
      title: odd, client: { name: odd, address: odd, city: odd, email: odd } });
    expect(bytes.length).toBeGreaterThan(0);
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    for (const { text } of drawn) expect(() => font.encodeText(text), text).not.toThrow();
  });
  it("ends a sign document with the signing line, and only a sign document", async () => {
    let drawn = spyOnDrawText();
    await buildDocumentPdf(input([{ type: "paragraph", inlines: [t("Body")] }], "sign"));
    expect(drawn.map((d) => d.text)).toContain(SIGN_CLOSING);
    vi.restoreAllMocks();
    drawn = spyOnDrawText();
    await buildDocumentPdf(input([{ type: "paragraph", inlines: [t("Body")] }], "acknowledge"));
    expect(drawn.map((d) => d.text)).not.toContain(SIGN_CLOSING);
  });
});

/** The drawn strings grouped by page, in drawing order. */
const byPage = (drawn: ReturnType<typeof spyOnDrawText>) => {
  const pages = new Map<PDFPage, typeof drawn>();
  for (const d of drawn) pages.set(d.page, [...(pages.get(d.page) ?? []), d]);
  return [...pages.values()];
};
const TOP = 792 - 54;
const filler = (n: number): Block[] =>
  Array.from({ length: n }, (_, i) => ({ type: "paragraph", inlines: [t(`Filler paragraph ${i}.`)] }));

describe("page breaks with headings and bullets", () => {
  it("never leaves a heading last on a page, and starts a moved heading at the top of the new page", async () => {
    let moved = 0;
    // Each extra filler paragraph shifts the heading 19pt down the page, so some run lands it at the foot.
    for (let n = 20; n < 70; n++) {
      vi.restoreAllMocks();
      const drawn = spyOnDrawText();
      await buildDocumentPdf(input([...filler(n), { type: "heading", level: 2, inlines: [t("Warranty")] },
        { type: "paragraph", inlines: [t("After the heading.")] }]));
      const pages = byPage(drawn);
      for (const page of pages) expect(page[page.length - 1].text, `n=${n}`).not.toBe("Warranty");
      pages.slice(1).forEach((page) => {
        if (page[0].text !== "Warranty") return;
        moved++;
        expect(page[0].y, `n=${n}`).toBe(TOP);
      });
    }
    expect(moved).toBeGreaterThan(0);
  });
  it("carries a bullet list across a page break intact", async () => {
    const drawn = spyOnDrawText();
    const items = Array.from({ length: 80 }, (_, i) => [t(`Bullet item ${i}`)]);
    await buildDocumentPdf(input([{ type: "bullets", items }]));
    const pages = byPage(drawn).filter((page) => page.some((d) => d.text === "•"));
    expect(pages.length).toBeGreaterThan(1);
    const bullets = drawn.filter((d) => d.text === "•");
    expect(bullets).toHaveLength(80);
    items.forEach(([item], i) => {
      const line = drawn.filter((d) => d.text === (item as { text: string }).text);
      expect(line, `item ${i}`).toHaveLength(1);
      // Its bullet sits on the same page and baseline, and nothing is drawn below the margin.
      expect(bullets[i].page === line[0].page, `item ${i} page`).toBe(true);
      expect(bullets[i].y).toBe(line[0].y);
      expect(line[0].y).toBeGreaterThanOrEqual(54);
    });
  });
});

describe("text drawn outside the wrapper", () => {
  it("maps a company name WinAnsi cannot encode instead of throwing", async () => {
    vi.resetModules();
    vi.doMock("@/content/business", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/content/business")>();
      return { business: { ...actual.business, legalName: "Premier → Shade 日" } };
    });
    try {
      const drawn = spyOnDrawText();
      const { buildDocumentPdf: build } = await import("@/lib/docs/pdf");
      await expect(build(input([{ type: "paragraph", inlines: [t("Body")] }]))).resolves.toBeInstanceOf(Uint8Array);
      expect(drawn.map((d) => d.text)).toContain("Premier ? Shade ?");
    } finally {
      vi.doUnmock("@/content/business");
      vi.resetModules();
    }
  });
});
