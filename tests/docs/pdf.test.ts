import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage, StandardFonts } from "pdf-lib";
import { business } from "@/content/business";
import { buildDocumentPdf, renderDocumentPdf, type DocumentPdfInput } from "@/lib/docs/pdf";
import type { Block, Inline } from "@/lib/docs/types";

/** Every string drawn, with where and in which font, captured before pdf-lib encodes it. */
function spyOnDrawText() {
  const drawn: { text: string; x: number; y: number; size: number; font: string; page: PDFPage }[] = [];
  const original = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    drawn.push({ text, x: options?.x ?? 0, y: options?.y ?? 0, size: options?.size ?? 0, font: options?.font?.name ?? "", page: this });
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
  it("ends a sign document with the signature block, and only a sign document (spec §3)", async () => {
    let drawn = spyOnDrawText();
    await buildDocumentPdf(input([{ type: "paragraph", inlines: [t("Body")] }], "sign"));
    for (const label of ["Client signature", "Printed name", "Date"]) expect(drawn.filter((d) => d.text === label)).toHaveLength(1);
    expect(drawn.map((d) => d.text)).not.toContain("Signed electronically on the client's project page.");
    vi.restoreAllMocks();
    drawn = spyOnDrawText();
    await buildDocumentPdf(input([{ type: "paragraph", inlines: [t("Body")] }], "acknowledge"));
    expect(drawn.map((d) => d.text)).not.toContain("Client signature");
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

const INITIALS_X = 612 - 54 - 56;
/** The order pages were first drawn on is the order of the pages. */
const pageIndexOf = (drawn: ReturnType<typeof spyOnDrawText>, page: PDFPage) => [...new Set(drawn.map((d) => d.page))].indexOf(page);

describe("sign marks (spec §3)", () => {
  const numbered: Block[] = [
    { type: "heading", level: 2, inlines: [t("1. Scope")] },
    { type: "paragraph", inlines: [t("Two shades.")] },
    { type: "heading", level: 2, inlines: [t("Notes")] },
    { type: "heading", level: 3, inlines: [t("2.", true), t(" Payment")] },
    { type: "paragraph", inlines: [t("On install.")] },
  ];

  it("records an initials mark level with each numbered heading, and draws its empty box", async () => {
    const drawn = spyOnDrawText();
    const { marks } = await renderDocumentPdf(input(numbered, "sign"));
    expect(marks.initials.map((m) => m.section)).toEqual(["1", "2"]);
    for (const [mark, heading] of [[marks.initials[0], "1. Scope"], [marks.initials[1], "2. Payment"]] as const) {
      const line = drawn.find((d) => d.text === heading)!;
      expect(mark).toMatchObject({ page: pageIndexOf(drawn, line.page), x: INITIALS_X, y: line.y - 3 });
    }
    const captions = drawn.filter((d) => d.text === "Initials");
    expect(captions).toHaveLength(2);
    captions.forEach((caption, i) => expect(caption).toMatchObject({ x: INITIALS_X, y: marks.initials[i].y - 8, size: 6 }));
  });

  it("wraps a numbered heading 64pt narrower so it never runs under its box", async () => {
    const drawn = spyOnDrawText();
    const long = "7. Your Choices and Approvals of Every Fabric, Color, Mount and Control Before We Order";
    const { marks } = await renderDocumentPdf(input([{ type: "heading", level: 2, inlines: [t(long)] }], "sign"));
    const bold = await (await PDFDocument.create()).embedFont(StandardFonts.HelveticaBold);
    const lines = drawn.filter((d) => d.font === "Helvetica-Bold" && d.size === 13 && long.includes(d.text));
    expect(lines.length).toBeGreaterThan(1);
    // The box sits level with the heading's first line, not its last.
    expect(marks.initials[0].y).toBe(lines[0].y - 3);
    for (const line of lines) expect(line.x + bold.widthOfTextAtSize(line.text, 13)).toBeLessThanOrEqual(612 - 54 - 64);
  });

  it("records the signature block's mark at its signature line", async () => {
    const drawn = spyOnDrawText();
    const { marks } = await renderDocumentPdf(input(numbered, "sign"));
    const label = drawn.find((d) => d.text === "Client signature")!;
    expect(marks.signature).toEqual({ page: pageIndexOf(drawn, label.page), x: 54 + 100, y: label.y - 2 });
    expect(drawn.find((d) => d.text === "Printed name")!.y).toBe(label.y - 30);
    expect(drawn.find((d) => d.text === "Date")!.y).toBe(label.y - 60);
  });

  it("a sign document with no numbered sections has the block and no initials", async () => {
    const drawn = spyOnDrawText();
    const { marks } = await renderDocumentPdf(input([{ type: "heading", level: 2, inlines: [t("Change")] }, { type: "paragraph", inlines: [t("One more shade.")] }], "sign"));
    expect(marks.initials).toEqual([]);
    expect(marks.signature).not.toBeNull();
    expect(drawn.map((d) => d.text)).not.toContain("Initials");
  });

  it("an acknowledge or view document draws no boxes and records no marks, even with numbered sections", async () => {
    for (const response of ["acknowledge", "view"] as const) {
      vi.restoreAllMocks();
      const drawn = spyOnDrawText();
      const { marks } = await renderDocumentPdf(input(numbered, response));
      expect(marks).toEqual({ initials: [], signature: null });
      expect(drawn.map((d) => d.text)).not.toContain("Initials");
      expect(drawn.map((d) => d.text)).not.toContain("Client signature");
    }
  });

  it("a numbered heading pushed to the next page takes its box and its mark with it", async () => {
    let moved = 0;
    for (let n = 20; n < 70; n++) {
      vi.restoreAllMocks();
      const drawn = spyOnDrawText();
      const { marks } = await renderDocumentPdf(input([...filler(n), { type: "heading", level: 2, inlines: [t("3. Warranty")] },
        { type: "paragraph", inlines: [t("After the heading.")] }], "sign"));
      const heading = drawn.find((d) => d.text === "3. Warranty")!;
      const caption = drawn.find((d) => d.text === "Initials")!;
      expect(caption.page === heading.page, `n=${n}`).toBe(true);
      // A numbered heading, wrapped narrower, still never sits last on a page: its text follows it.
      expect(drawn.find((d) => d.text === "After the heading.")!.page === heading.page, `n=${n} next`).toBe(true);
      expect(marks.initials[0], `n=${n}`).toEqual({ page: pageIndexOf(drawn, heading.page), x: INITIALS_X, y: heading.y - 3, section: "3" });
      expect(caption.y, `n=${n}`).toBeGreaterThanOrEqual(54);
      if (pageIndexOf(drawn, heading.page) > 0 && heading.y === TOP) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it("keeps the whole signature block on one page, inside the margin, wherever the text ends", async () => {
    let newPage = 0;
    for (let n = 20; n < 70; n++) {
      vi.restoreAllMocks();
      const drawn = spyOnDrawText();
      const { marks } = await renderDocumentPdf(input(filler(n), "sign"));
      const block = ["Client signature", "Printed name", "Date"].map((label) => drawn.find((d) => d.text === label)!);
      expect(new Set(block.map((d) => d.page)).size, `n=${n}`).toBe(1);
      for (const d of block) expect(d.y, `n=${n}`).toBeGreaterThanOrEqual(54 + 2);
      expect(marks.signature!.page, `n=${n}`).toBe(pageIndexOf(drawn, block[0].page));
      if (drawn.filter((d) => d.page === block[0].page).length === 3) newPage++;
    }
    expect(newPage).toBeGreaterThan(0);
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
