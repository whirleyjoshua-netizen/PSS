// @vitest-environment node
import { PDFArray, PDFDocument, PDFPage, PDFRawStream, StandardFonts, decodePDFRawStream } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatTime } from "@/lib/admin/time";
import { embedHandwriting } from "@/lib/pdf/handwriting";
import type { SignMarks } from "@/lib/pdf/sign-marks";
import { stampSignature } from "@/lib/portal/stamp";
import { corruptPng, pngBytes } from "../fixtures/png";

// The real formatter by default; one test swaps in what some Node/ICU builds emit.
vi.mock("@/lib/admin/time", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/time")>();
  return { ...actual, formatTime: vi.fn(actual.formatTime) };
});

const facts = {
  signedName: "Jane Doe",
  signedEmail: "jane@example.com",
  signedAt: new Date("2026-09-18T21:05:00Z"),
  sha256: "a".repeat(64),
  projectNo: "PSS-1012",
};
const TYPED = { method: "typed", initials: null } as const;

const onePage = async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  return Buffer.from(await pdf.save());
};

// Reads back the text drawn on the LAST page: decode its content streams and turn each
// hex string shown with Tj into the line that was drawn.
const drawnLines = async (bytes: Buffer): Promise<string[]> => {
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPage(pdf.getPageCount() - 1).node.Contents();
  const streams = contents instanceof PDFArray
    ? contents.asArray().map((ref) => pdf.context.lookup(ref))
    : [contents];
  const text = streams
    .map((stream) => Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("latin1"))
    .join(" ");
  return [...text.matchAll(/<([0-9A-Fa-f]*)> Tj/g)].map((m) => Buffer.from(m[1], "hex").toString("latin1"));
};

describe("stampSignature", () => {
  it("appends a signature page, and draws nothing on the original's pages when the file has no marks", async () => {
    const original = await onePage();
    const stamped = await stampSignature(original, facts, TYPED, null);
    expect(stamped).not.toBeNull();
    const reopened = await PDFDocument.load(stamped!);
    expect(reopened.getPageCount()).toBe(2);
  });

  it("writes who signed, the fingerprint and the project onto the new page", async () => {
    const stamped = await stampSignature(await onePage(), facts, TYPED, null);
    const lines = await drawnLines(stamped!);
    expect(lines[0]).toBe("ELECTRONIC SIGNATURE");
    expect(lines).toContain("Signed by:  Jane Doe");
    expect(lines).toContain("Account:    jane@example.com");
    expect(lines).toContain("Project:    PSS-1012");
    expect(lines).toContain("a".repeat(64));
    expect(lines).toContain("When:       Sep 18, 2026 at 2:05 PM");
  });

  it("leaves the project line out when there is no project number", async () => {
    const stamped = await stampSignature(await onePage(), { ...facts, projectNo: null }, TYPED, null);
    expect((await drawnLines(stamped!)).some((l) => l.startsWith("Project:"))).toBe(false);
  });

  it("draws the time with a plain space when ICU emits a narrow no-break space", async () => {
    vi.mocked(formatTime).mockReturnValueOnce("2:05\u202FPM");
    const stamped = await stampSignature(await onePage(), facts, TYPED, null);
    expect(stamped).not.toBeNull();
    expect(await drawnLines(stamped!)).toContain("When:       Sep 18, 2026 at 2:05 PM");
  });

  it("returns null for a name the standard font cannot draw, rather than throwing", async () => {
    expect(await stampSignature(await onePage(), { ...facts, signedName: "Nguyễn Văn" }, TYPED, null)).toBeNull();
  });

  it("returns null rather than throwing when the bytes are not a PDF", async () => {
    expect(await stampSignature(Buffer.from("not a pdf at all"), facts, TYPED, null)).toBeNull();
  });
});

afterEach(() => vi.restoreAllMocks());

const threePages = async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage(); pdf.addPage(); pdf.addPage();
  return Buffer.from(await pdf.save());
};
const pageRefs = async (bytes: Buffer) => (await PDFDocument.load(bytes)).getPages().map((page) => page.ref.toString());
const handName = async () => (await embedHandwriting(await PDFDocument.create())).hand.name;

/** Every text and image drawn, with the page it went on (by object reference, stable across load and save). */
function spyOnDrawing() {
  const texts: { text: string; x: number; y: number; size: number; font: string; page: string }[] = [];
  const images: { x: number; y: number; width: number; height: number; page: string }[] = [];
  const drawText = PDFPage.prototype.drawText;
  const drawImage = PDFPage.prototype.drawImage;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    texts.push({ text, x: options?.x ?? 0, y: options?.y ?? 0, size: options?.size ?? 0, font: options?.font?.name ?? "", page: this.ref.toString() });
    return drawText.call(this, text, options);
  });
  vi.spyOn(PDFPage.prototype, "drawImage").mockImplementation(function (this: PDFPage, image, options) {
    images.push({ x: options?.x ?? 0, y: options?.y ?? 0, width: options?.width ?? 0, height: options?.height ?? 0, page: this.ref.toString() });
    return drawImage.call(this, image, options);
  });
  return { texts, images };
}

const MARKS: SignMarks = {
  initials: [{ page: 0, x: 502, y: 700, section: "4" }, { page: 1, x: 502, y: 640, section: "5" }],
  signature: { page: 2, x: 154, y: 300 },
};

describe("stampSignature with sign marks (spec §5)", () => {
  it("types the initials in handwriting at every initials mark, and fills the signature block", async () => {
    const original = await threePages();
    const [p0, p1, p2] = await pageRefs(original);
    const hand = await handName();
    const { texts } = spyOnDrawing();
    const stamped = await stampSignature(original, facts, { method: "typed", initials: "JD" }, MARKS);
    expect(stamped).not.toBeNull();
    expect((await PDFDocument.load(stamped!)).getPageCount()).toBe(4);
    const initials = texts.filter((t) => t.text === "JD" && t.font === hand);
    expect(initials.filter((t) => t.page === p0 || t.page === p1).map((t) => [t.page, t.x, t.y])).toEqual([[p0, 504, 704], [p1, 504, 644]]);
    for (const t of initials) expect(t.size).toBeLessThanOrEqual(14);
    expect(texts.find((t) => t.page === p2 && t.font === hand)).toMatchObject({ text: "Jane Doe", x: 156, y: 305 });
    expect(texts.find((t) => t.page === p2 && t.font === "Helvetica" && t.text === "Jane Doe")).toMatchObject({ x: 158, y: 274, size: 11 });
    expect(texts.find((t) => t.page === p2 && t.text === "Sep 18, 2026")).toMatchObject({ x: 158, y: 244, font: "Helvetica" });
    // Nothing else is drawn on the original's pages.
    expect(texts.filter((t) => [p0, p1, p2].includes(t.page))).toHaveLength(2 + 3);
  });

  it("draws the PNGs scaled into the boxes when the adoption is drawn", async () => {
    const original = await threePages();
    const [p0, p1, p2] = await pageRefs(original);
    const { texts, images } = spyOnDrawing();
    const stamped = await stampSignature(original, facts,
      { method: "drawn", signaturePng: pngBytes(600, 200), initialsPng: pngBytes(200, 100) }, MARKS);
    expect(stamped).not.toBeNull();
    const onOriginal = images.filter((i) => [p0, p1, p2].includes(i.page));
    expect(onOriginal.map((i) => [i.page, i.x, i.y])).toEqual([[p0, 502, 701], [p1, 502, 641], [p2, 154, 301]]);
    // Proportions kept, inside the box: 200x100 into 56x16 is 32x16. 600x200 into 240x26 is 78x26.
    expect(onOriginal.map((i) => [Math.round(i.width), Math.round(i.height)])).toEqual([[32, 16], [32, 16], [78, 26]]);
    // The printed name and date are still typed, and no handwriting is drawn on the original's pages.
    expect(texts.filter((t) => [p0, p1, p2].includes(t.page)).map((t) => t.text)).toEqual(["Jane Doe", "Sep 18, 2026"]);
    // The signature page shows both adopted images.
    expect(images.filter((i) => ![p0, p1, p2].includes(i.page))).toHaveLength(2);
  });

  it("records the method and the initialed sections on the signature page", async () => {
    const stamped = await stampSignature(await threePages(), facts, { method: "typed", initials: "JD" }, MARKS);
    const lines = await drawnLines(stamped!);
    expect(lines).toContain("Method:     typed");
    expect(lines).toContain("Initialed sections: 4, 5");
    expect(lines).toContain("Adopted signature:");
    expect(lines).toContain("Adopted initials:");
  });

  it("says there were no numbered sections when the marks have none, and adopts no initials", async () => {
    const stamped = await stampSignature(await threePages(), facts, TYPED, { initials: [], signature: MARKS.signature });
    const lines = await drawnLines(stamped!);
    expect(lines).toContain("No numbered sections");
    expect(lines).not.toContain("Adopted initials:");
  });

  it("stamps a file with no marks exactly as before, plus the adoption on the signature page", async () => {
    const original = await threePages();
    const refs = await pageRefs(original);
    const { texts, images } = spyOnDrawing();
    const stamped = await stampSignature(original, facts, { method: "drawn", signaturePng: pngBytes(600, 200), initialsPng: null }, null);
    expect((await PDFDocument.load(stamped!)).getPageCount()).toBe(4);
    expect(texts.filter((t) => refs.includes(t.page))).toEqual([]);
    expect(images.filter((i) => refs.includes(i.page))).toEqual([]);
    const lines = await drawnLines(stamped!);
    expect(lines).toContain("Method:     drawn");
    expect(lines).toContain("No numbered sections");
    expect(images).toHaveLength(1);
  });

  it("wraps a long list of initialed sections inside the page", async () => {
    const many: SignMarks = { initials: Array.from({ length: 60 }, (_, i) => ({ page: 0, x: 502, y: 700, section: String(i + 1) })), signature: null };
    const { texts } = spyOnDrawing();
    await stampSignature(await threePages(), facts, { method: "typed", initials: "JD" }, many);
    const sectionLines = texts.filter((t) => /^(Initialed sections: )?\d+(, \d+)*,?$/.test(t.text));
    expect(sectionLines.length).toBeGreaterThan(1);
    const helvetica = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    for (const t of sectionLines) expect(t.x + helvetica.widthOfTextAtSize(t.text, 11)).toBeLessThanOrEqual(612 - 56);
  });

  it("skips a mark on a page the PDF does not have, and still stamps", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const stray: SignMarks = { initials: [{ page: 9, x: 502, y: 700, section: "4" }], signature: { page: 9, x: 154, y: 300 } };
    expect(await stampSignature(await threePages(), facts, { method: "typed", initials: "JD" }, stray)).not.toBeNull();
    expect(error).toHaveBeenCalled();
  });

  it("answers null, never throws, for a drawn PNG whose header is valid but whose data is corrupt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(stampSignature(await threePages(), facts, { method: "drawn", signaturePng: corruptPng(600, 200), initialsPng: null }, MARKS))
      .resolves.toBeNull();
  });
});
