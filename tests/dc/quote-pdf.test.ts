import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import type { ContractInput } from "@/lib/dc/contract-layout";
import { renderContractPdf } from "@/lib/dc/contract-pdf";
import { buildQuotePdf } from "@/lib/dc/quote-pdf";

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

  it("draws every line and total exactly where page 1 of the contract does", async () => {
    const quote = spyOnDrawText();
    await buildQuotePdf(input);
    vi.restoreAllMocks();
    const contract = spyOnDrawText();
    await renderContractPdf(input, { text: "## Terms\n\n1. Something." });
    const page1 = contract.slice(0, quote.length);
    expect(page1.map(({ x, y }) => [x, y])).toEqual(quote.map(({ x, y }) => [x, y]));
    const differing = page1.flatMap((d, i) => (d.text === quote[i].text ? [] : [[d.text, quote[i].text]]));
    expect(differing).toEqual([
      ["Contract PSS-1042 · Version 1", "Quote PSS-1042 · Version 1"],
      ["The terms and conditions on the following pages are part of this contract.",
        "Approve this quote on your project page and we will send your contract to sign."],
    ]);
  });
});
