// @vitest-environment node
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { formatTime } from "@/lib/admin/time";
import { stampSignature } from "@/lib/portal/stamp";

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
  it("appends a page rather than overlaying the owner's own layout", async () => {
    const original = await onePage();
    const stamped = await stampSignature(original, facts);
    expect(stamped).not.toBeNull();
    const reopened = await PDFDocument.load(stamped!);
    expect(reopened.getPageCount()).toBe(2);
  });

  it("writes who signed, the fingerprint and the project onto the new page", async () => {
    const stamped = await stampSignature(await onePage(), facts);
    const lines = await drawnLines(stamped!);
    expect(lines[0]).toBe("ELECTRONIC SIGNATURE");
    expect(lines).toContain("Signed by:  Jane Doe");
    expect(lines).toContain("Account:    jane@example.com");
    expect(lines).toContain("Project:    PSS-1012");
    expect(lines).toContain("a".repeat(64));
    expect(lines).toContain("When:       Sep 18, 2026 at 2:05 PM");
  });

  it("leaves the project line out when there is no project number", async () => {
    const stamped = await stampSignature(await onePage(), { ...facts, projectNo: null });
    expect((await drawnLines(stamped!)).some((l) => l.startsWith("Project:"))).toBe(false);
  });

  it("draws the time with a plain space when ICU emits a narrow no-break space", async () => {
    vi.mocked(formatTime).mockReturnValueOnce("2:05\u202FPM");
    const stamped = await stampSignature(await onePage(), facts);
    expect(stamped).not.toBeNull();
    expect(await drawnLines(stamped!)).toContain("When:       Sep 18, 2026 at 2:05 PM");
  });

  it("returns null for a name the standard font cannot draw, rather than throwing", async () => {
    expect(await stampSignature(await onePage(), { ...facts, signedName: "Nguyễn Văn" })).toBeNull();
  });

  it("returns null rather than throwing when the bytes are not a PDF", async () => {
    expect(await stampSignature(Buffer.from("not a pdf at all"), facts)).toBeNull();
  });
});
