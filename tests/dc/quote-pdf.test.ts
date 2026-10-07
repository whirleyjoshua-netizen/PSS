import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import type { ContractInput } from "@/lib/dc/contract-layout";
import { renderContractPdf } from "@/lib/dc/contract-pdf";
import { buildQuotePdf } from "@/lib/dc/quote-pdf";
import { MARGIN } from "@/lib/pdf/text";

const input: ContractInput = {
  projectNo: "PSS-1042", version: 1, date: new Date("2026-09-28T12:00:00Z"),
  client: { name: "Test Testt", address: "1 Main St", city: "Las Vegas", email: "t@example.com" },
  lines: [
    { room: "Primary Bedroom", description: "Hunter Douglas Silhouette PowerView Gen 3 Automation Bottom-Up",
      options: [["Control System", "PowerView"], ["Order Width", "48 1/2"], ["Order Height", "72 3/8"], ["Mount Type", "Inside Mount"]],
      qty: 1, sellUnitCents: 128150, sellExtendedCents: 128150 },
    { room: "", description: "Hunter Douglas PowerView Gateway", options: [["Collection", "Motorization"]], qty: 1, sellUnitCents: 20501, sellExtendedCents: 20501 },
  ],
  installCents: 25000, handlingChargedCents: 6600, oversizedCents: 0, clientTotalCents: 128150 + 20501 + 25000 + 6600,
};

/** Every string drawn, with where, captured before pdf-lib encodes it. */
function spyOnDrawText() {
  const drawn: { text: string; x: number; y: number }[] = [];
  const original = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    drawn.push({ text, x: options?.x ?? 0, y: options?.y ?? 0 });
    return original.call(this, text, options);
  });
  return drawn;
}

afterEach(() => vi.restoreAllMocks());

describe("buildQuotePdf", () => {
  it("prints the priced lines and totals under the title Quote, with no terms, initials or signature block", async () => {
    const drawn = spyOnDrawText();
    const bytes = await buildQuotePdf(input);
    const texts = drawn.map((d) => d.text);
    expect(texts).toContain("Quote PSS-1042 · Version 1");
    for (const figure of ["$1,281.50", "$205.01", "Installation", "$250", "Hunter Douglas handling", "$66", "Total", "$1,802.51"]) {
      expect(texts).toContain(figure);
    }
    for (const absent of ["Terms and Conditions", "Client signature", "Initials", "Signature"]) expect(texts).not.toContain(absent);
    expect(texts.some((t) => t.startsWith("Contract "))).toBe(false);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("leaves out the details line under each product, which the contract still prints", async () => {
    const quote = spyOnDrawText();
    await buildQuotePdf(input);
    vi.restoreAllMocks();
    const contract = spyOnDrawText();
    await renderContractPdf(input, { text: "## Terms\n\n1. Something." });
    const details = '48 1/2" W x 72 3/8" H · Inside Mount · PowerView';
    expect(contract.map((d) => d.text)).toContain(details);
    expect(quote.map((d) => d.text)).not.toContain(details);
    for (const absent of ['48 1/2"', "72 3/8", "Inside Mount"]) expect(quote.some((d) => d.text.includes(absent))).toBe(false);
  });

  it("prints the same rooms, products, quantities and money as page 1 of the contract", async () => {
    const quote = spyOnDrawText();
    await buildQuotePdf(input);
    vi.restoreAllMocks();
    const contract = spyOnDrawText();
    await renderContractPdf(input, { text: "## Terms\n\n1. Something." });
    const closing = "The terms and conditions on the following pages are part of this contract.";
    // The accessory's details line is empty, drawn as "": nothing to compare.
    const page1 = contract.slice(0, contract.findIndex((d) => d.text === closing) + 1).map((d) => d.text).filter(Boolean);
    const quoteTexts = quote.map((d) => d.text);
    expect(quoteTexts.filter((t) => !page1.includes(t))).toEqual([
      "Quote PSS-1042 · Version 1", "Approve this quote on your project page and we will send your contract to sign.",
    ]);
    expect(page1.filter((t) => !quoteTexts.includes(t))).toEqual([
      "Contract PSS-1042 · Version 1", '48 1/2" W x 72 3/8" H · Inside Mount · PowerView', closing,
    ]);
  });
});

describe("buildQuotePdf preview", () => {
  const PREVIEW = "PREVIEW · Not sent to the client";
  const many: ContractInput = { ...input, lines: Array.from({ length: 30 }, () => input.lines[0]) };

  it("marks every page as a preview, and nothing else changes", async () => {
    const drawn = spyOnDrawText();
    const bytes = await buildQuotePdf(many, { preview: true });
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    expect(pages).toBeGreaterThan(1);
    const marks = drawn.filter((d) => d.text === PREVIEW);
    expect(marks).toHaveLength(pages);
    // Below the margin, where the priced pages never draw.
    for (const m of marks) expect(m.y).toBeLessThan(MARGIN);
    expect(Math.min(...drawn.filter((d) => d.text !== PREVIEW).map((d) => d.y))).toBeGreaterThanOrEqual(MARGIN);
    vi.restoreAllMocks();
    const real = spyOnDrawText();
    await buildQuotePdf(many);
    expect(drawn.filter((d) => d.text !== PREVIEW)).toEqual(real);
  });

  it("is not marked when it is the real quote", async () => {
    const drawn = spyOnDrawText();
    await buildQuotePdf(many);
    expect(drawn.map((d) => d.text)).not.toContain(PREVIEW);
  });
});
