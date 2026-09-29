import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage, StandardFonts } from "pdf-lib";
import { business } from "@/content/business";
import { SIGN_CLOSING, buildDocumentPdf, type DocumentPdfInput } from "@/lib/docs/pdf";
import type { Block, Inline } from "@/lib/docs/types";

/** Every string drawn, with where and in which font, captured before pdf-lib encodes it. */
function spyOnDrawText() {
  const drawn: { text: string; x: number; y: number; font: string }[] = [];
  const original = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    drawn.push({ text, x: options?.x ?? 0, y: options?.y ?? 0, font: options?.font?.name ?? "" });
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
