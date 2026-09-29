import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage, StandardFonts, type PDFFont } from "pdf-lib";
import { contractRows, keyDetails, winAnsiSafe, type ContractInput } from "@/lib/dc/contract-layout";
import { buildContractPdf } from "@/lib/dc/contract-pdf";

const input: ContractInput = {
  projectNo: "PSS-1042", version: 1, date: new Date("2026-09-28T12:00:00Z"),
  client: { name: "Test Testt", address: "1 Main St", city: "Las Vegas", email: "t@example.com" },
  lines: [
    { room: "Primary Bedroom", description: "Hunter Douglas Silhouette PowerView Gen 3 Automation Bottom-Up",
      options: [["Location", "Primary Bedroom"], ["Collection", "Silhouette"], ["Control System", "PowerView"], ["Fabric Type", "A2 - Originale 3in"], ["Color", "104 - Cloud"], ["Order Width", "48 1/2"], ["Order Height", "72 3/8"], ["Mount Type", "Inside Mount"], ["Receiver Option", "Right RF Receiver"]],
      qty: 1, sellUnitCents: 128150, sellExtendedCents: 128150 },
    { room: "", description: "Hunter Douglas PowerView Gateway", options: [["Collection", "Motorization"]], qty: 1, sellUnitCents: 20501, sellExtendedCents: 20501 },
  ],
  installCents: 25000, handlingChargedCents: 6600, oversizedCents: 0, clientTotalCents: 128150 + 20501 + 25000 + 6600,
};

/** Options a DC line can carry that must never reach the client. */
const leakyOptions: [string, string][] = [
  ...input.lines[0].options,
  ["MSRP", "2,000.00"], ["Cost Factor", "0.45"], ["Dealer Cost", "900.00"], ["Discount", "55%"], ["Quote Number", "22250749"],
];
const FORBIDDEN = ["MSRP", "cost", "Cost", "%", "22250749", "Factor", "900.00", "2,000.00", "0.45"];

/** Every string the builder draws, captured before pdf-lib encodes it. */
function spyOnDrawText() {
  const drawn: { text: string; x: number; y: number; right: number }[] = [];
  const original = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    const x = options?.x ?? 0;
    const width = options?.font && options.size ? options.font.widthOfTextAtSize(text, options.size) : 0;
    drawn.push({ text, x, y: options?.y ?? 0, right: x + width });
    return original.call(this, text, options);
  });
  return drawn;
}

afterEach(() => vi.restoreAllMocks());

/** pdf-lib's real Helvetica: its encodeText throws on anything the standard fonts cannot draw. */
async function helvetica(): Promise<PDFFont> {
  return (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
}
const encodes = (font: PDFFont, text: string) => { try { font.encodeText(text); return true; } catch { return false; } };

describe("contractRows", () => {
  it("shows room, product, key details, qty and client prices only", () => {
    const { rows, totals } = contractRows(input);
    expect(rows[0]).toEqual({ room: "Primary Bedroom", product: "Silhouette PowerView Gen 3 Automation Bottom-Up",
      details: '48 1/2" W x 72 3/8" H · Inside Mount · A2 - Originale 3in, 104 - Cloud · PowerView', qty: "1", unit: "$1,281.50", total: "$1,281.50" });
    expect(rows[1].room).toBe("Accessory");
    expect(totals).toEqual([["Installation", "$250"], ["Hunter Douglas handling", "$66"], ["Total", "$1,802.51"]]);
  });
  it("omits handling when waived and oversized when zero", () => {
    const { totals } = contractRows({ ...input, handlingChargedCents: 0, clientTotalCents: 173651 });
    expect(totals.map(([label]) => label)).toEqual(["Installation", "Total"]);
  });
  it("shows an oversize charge when there is one", () => {
    const { totals } = contractRows({ ...input, oversizedCents: 4500, clientTotalCents: 184451 });
    expect(totals).toContainEqual(["Oversize charge", "$45"]);
  });
  it("never contains cost, MSRP, a percentage or the DC quote number", () => {
    const flat = JSON.stringify(contractRows(input));
    for (const forbidden of ["MSRP", "cost", "Cost", "%", "22250749", "Factor"]) expect(flat).not.toContain(forbidden);
  });
  it("keeps cost, MSRP, discount and quote-number options out even when the DC line carries them", () => {
    const leaky = { ...input, lines: [{ ...input.lines[0], options: leakyOptions }] };
    const flat = JSON.stringify(contractRows(leaky));
    for (const forbidden of FORBIDDEN) expect(flat).not.toContain(forbidden);
  });
});

describe("keyDetails", () => {
  it("is empty-safe", () => expect(keyDetails([])).toBe(""));
  it("leaves the size out unless both width and height are known", () =>
    expect(keyDetails([["Order Width", "48"], ["Mount Type", "Outside Mount"]])).toBe("Outside Mount"));
});

describe("winAnsiSafe", () => {
  it("turns newlines, tabs and runs of whitespace into one space", () => {
    expect(winAnsiSafe("1 Main St\r\nApt 4\t\tUnit B")).toBe("1 Main St Apt 4 Unit B");
  });
  it("keeps the WinAnsi characters outside Latin-1, like the trade mark and euro, and still replaces an emoji", () => {
    expect(winAnsiSafe("Duette™ €5 • Œuvre 🙂")).toBe("Duette™ €5 • Œuvre ?");
  });
  // Walks all ~63k BMP characters, so it gets its own timeout: under a loaded single-worker run the
  // default 5s is not enough. Each character is encoded once, and failures are collected and asserted
  // once, so the loop does not pay for 130k expect() calls.
  it("agrees with pdf-lib's Helvetica on every character: keeps what it can encode, never returns what it cannot", async () => {
    const font = await helvetica();
    const chars: string[] = [];
    for (let cp = 0; cp <= 0xffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue; // lone surrogates are not characters
      chars.push(String.fromCodePoint(cp));
    }
    const encodable = new Set(chars.filter((ch) => encodes(font, ch)));
    const hex = (ch: string) => `U+${ch.codePointAt(0)!.toString(16)}`;
    const unencodableOutput: string[] = [];
    const lostEncodable: string[] = [];
    for (const ch of chars) {
      const safe = winAnsiSafe(ch);
      if (![...safe].every((c) => encodable.has(c))) unencodableOutput.push(`${hex(ch)} -> ${JSON.stringify(safe)}`);
      if (encodable.has(ch) && ch !== "?" && !/\s/.test(ch) && safe === "?") lostEncodable.push(hex(ch));
    }
    expect(encodable.size).toBeGreaterThan(200); // the set really came from the font
    expect(unencodableOutput).toEqual([]);
    expect(lostEncodable).toEqual([]);
  }, 60_000);
  it("keeps Latin-1, maps typographic marks, replaces the rest", () => {
    expect(winAnsiSafe("48½″ — Café “Den” 🚪")).toBe('48½" - Café "Den" ?');
  });
});

describe("buildContractPdf", () => {
  it("renders, then appends every terms page, even with characters the font cannot encode", async () => {
    const terms = await PDFDocument.create();
    terms.addPage(); terms.addPage();
    const bytes = await buildContractPdf({ ...input, client: { ...input.client, name: "Zoë 🙂 O’Neil" } }, { pdf: await terms.save() });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
  });
  it("draws only encodable text, whatever field carries the unencodable characters", async () => {
    // Half, double prime, em dash, curly quotes, an emoji, a narrow no-break space, a newline, a tab, trade mark.
    const odd = `½″—“x”🙂${String.fromCodePoint(0x202f)}\n\t™`;
    const drawn = spyOnDrawText();
    const everywhere: ContractInput = {
      ...input,
      projectNo: `PSS-1042 ${odd}`,
      client: { name: odd, address: odd, city: odd, email: odd },
      lines: [{ room: odd, description: `Hunter Douglas ${odd}`, qty: 1, sellUnitCents: 100, sellExtendedCents: 100,
        options: [["Order Width", odd], ["Order Height", odd], ["Mount Type", odd], ["Fabric Type", odd], ["Color", odd], ["Control System", odd]] }],
    };
    await expect(buildContractPdf(everywhere, { pdf: await (await PDFDocument.create()).save() })).resolves.toBeInstanceOf(Uint8Array);
    expect(drawn.length).toBeGreaterThan(0);
    const font = await helvetica();
    for (const { text } of drawn) expect(encodes(font, text), text).toBe(true);
    expect(drawn.map(({ text }) => text).join("")).not.toMatch(/[\n\t]/);
  });
  it("can draw every Latin-1 character winAnsiSafe keeps", async () => {
    const latin1 = Array.from({ length: 0xff - 0xa1 + 1 }, (_, i) => String.fromCharCode(0xa1 + i)).join("");
    expect(winAnsiSafe(latin1)).toBe(latin1);
    const bytes = await buildContractPdf({ ...input, client: { ...input.client, name: latin1 } }, { pdf: await (await PDFDocument.create()).save() });
    expect(bytes.length).toBeGreaterThan(0);
  });
  it("draws no cost, MSRP, percentage or DC quote number anywhere on the contract", async () => {
    const drawn = spyOnDrawText();
    const leaky = { ...input, lines: [{ ...input.lines[0], options: leakyOptions }, input.lines[1]] };
    await buildContractPdf(leaky, { pdf: await (await PDFDocument.create()).save() });
    const all = drawn.map(({ text }) => text).join("\n");
    expect(all).toContain("$1,802.51");
    for (const forbidden of FORBIDDEN) expect(all).not.toContain(forbidden);
  });
  it("keeps long unbroken words inside their column and the page", async () => {
    const drawn = spyOnDrawText();
    const [long, room, product, details] = ["W", "R", "P", "D"].map((ch) => ch.repeat(120));
    await buildContractPdf({
      ...input, projectNo: long,
      client: { name: long, address: long, city: long, email: long },
      lines: [{ ...input.lines[0], room, description: product, options: [["Mount Type", details]] }],
    }, { pdf: await (await PDFDocument.create()).save() });
    for (const { right } of drawn) expect(right).toBeLessThanOrEqual(612 - 54);
    const column = (ch: string) => drawn.filter(({ text }) => new RegExp(`^${ch}+$`).test(text));
    // Room column ends before Product starts (x 149); Product and details end 40pt before Qty (x 430).
    expect(column("R").length).toBeGreaterThan(1);
    for (const { x, right } of column("R")) { expect(x).toBe(54); expect(right).toBeLessThanOrEqual(54 + 95); }
    for (const ch of ["P", "D"]) {
      expect(column(ch).length).toBeGreaterThan(1);
      for (const { x, right } of column(ch)) { expect(x).toBe(54 + 95); expect(right).toBeLessThanOrEqual(390); }
    }
  });
  it("shows the version in the title, so a change order is told apart from the original", async () => {
    const drawn = spyOnDrawText();
    await buildContractPdf({ ...input, version: 2 }, { pdf: await (await PDFDocument.create()).save() });
    const all = drawn.map(({ text }) => text).join("\n");
    expect(all).toContain("Contract PSS-1042 · Version 2");
    expect(all).not.toContain("Version 1");
  });
  it("spills a long quote onto more pages instead of drawing off the page", async () => {
    const terms = await (await PDFDocument.create()).save();
    const many = { ...input, lines: Array.from({ length: 60 }, () => input.lines[0]) };
    const drawn = spyOnDrawText();
    const doc = await PDFDocument.load(await buildContractPdf(many, { pdf: terms }));
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(drawn.length).toBeGreaterThan(60 * 3);
    for (const { y, text } of drawn) expect(y, text).toBeGreaterThanOrEqual(54);
  });
  it("prints text terms on pages after the contract, headed, with bold runs", async () => {
    const drawn = spyOnDrawText();
    const bytes = await buildContractPdf(input, { text: "## 4. Your Right to Cancel\n\nCancel within **3 business days** of signing." });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    const texts = drawn.map(({ text }) => text);
    expect(texts).toContain("The terms and conditions on the following pages are part of this contract.");
    const heading = drawn.find(({ text }) => text === "Terms and Conditions")!;
    expect(heading.y).toBe(792 - 54);
    expect(texts).toContain("4. Your Right to Cancel");
    expect(texts).toContain("3 business days");
  });
  it("spills long text terms onto more pages inside the margins, drawing only encodable text", async () => {
    const drawn = spyOnDrawText();
    const long = Array.from({ length: 150 }, (_, i) => `## ${i}. Term\n\nText ½″ “quoted” 🙂 → ${"word ".repeat(30)}`).join("\n\n");
    const doc = await PDFDocument.load(await buildContractPdf(input, { text: long }));
    expect(doc.getPageCount()).toBeGreaterThan(3);
    const font = await helvetica();
    for (const { y, right, text } of drawn) {
      expect(y, text).toBeGreaterThanOrEqual(54);
      expect(right, text).toBeLessThanOrEqual(612 - 54 + 0.001);
      expect(encodes(font, text), text).toBe(true);
    }
  });
});
