// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const blob = { put: vi.fn(), del: vi.fn() };
vi.mock("@vercel/blob", () => blob);
const saveTermsPathname = vi.fn();
vi.mock("@/lib/dc/store", () => ({ saveTermsPathname }));

const { POST } = await import("@/app/admin/settings/terms/route");

const post = (file: File | null) => {
  const data = new FormData();
  if (file) data.append("file", file);
  return new Request("http://localhost/admin/settings/terms", { method: "POST", body: data });
};
const pdfBytes = async (pages: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  // addDefaultPage: false, or pdf-lib quietly gives an empty document one blank page.
  return doc.save({ useObjectStreams: false, addDefaultPage: false });
};
const pdf = (bytes: Uint8Array | string, type = "application/pdf") => new File([bytes as BlobPart], "Terms.pdf", { type });
const CANT_READ = "That PDF can't be read (is it password protected?).";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ email: "o@x.com" });
  blob.put.mockResolvedValue({});
  blob.del.mockResolvedValue(undefined);
  saveTermsPathname.mockResolvedValue(null);
});

describe("POST /admin/settings/terms", () => {
  it("stores a readable PDF privately and points the settings at it", async () => {
    const response = await POST(post(pdf(await pdfBytes(1))));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const [pathname, , options] = blob.put.mock.calls[0];
    expect(pathname).toMatch(/^settings\/contract-terms\/[0-9a-f-]{36}\.pdf$/);
    expect(options).toEqual({ access: "private", contentType: "application/pdf", addRandomSuffix: false });
    expect(saveTermsPathname).toHaveBeenCalledWith(pathname, "o@x.com");
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("removes the file it replaced, after the settings point at the new one", async () => {
    saveTermsPathname.mockResolvedValue("settings/contract-terms/old.pdf");
    expect((await POST(post(pdf(await pdfBytes(2))))).status).toBe(200);
    expect(blob.del).toHaveBeenCalledWith("settings/contract-terms/old.pdf");
    expect(saveTermsPathname.mock.invocationCallOrder[0]).toBeLessThan(blob.del.mock.invocationCallOrder[0]);
  });

  it("still succeeds when the old file can't be removed", async () => {
    saveTermsPathname.mockResolvedValue("settings/contract-terms/old.pdf");
    blob.del.mockRejectedValue(new Error("blob down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(post(pdf(await pdfBytes(1))))).status).toBe(200);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("removes the new file again when the settings can't be saved", async () => {
    saveTermsPathname.mockRejectedValue(new Error("db down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(POST(post(pdf(await pdfBytes(1))))).rejects.toThrow("db down");
    expect(blob.del).toHaveBeenCalledWith(blob.put.mock.calls[0][0]);
    error.mockRestore();
  });

  it.each(["", "application/octet-stream", "image/png"])("refuses a file of type %j, even with PDF bytes", async (type) => {
    const response = await POST(post(pdf(await pdfBytes(1), type)));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Upload a PDF file (its type must be application/pdf)." });
    expect(blob.put).not.toHaveBeenCalled();
  });

  it("refuses a request with no file", async () => {
    expect((await POST(post(null))).status).toBe(400);
    expect(blob.put).not.toHaveBeenCalled();
  });

  it("refuses an empty file and one over 10 MB", async () => {
    for (const file of [pdf(""), pdf(new Uint8Array(10 * 1024 * 1024 + 1))]) {
      const response = await POST(post(file));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "The PDF must be under 10 MB." });
    }
    expect(blob.put).not.toHaveBeenCalled();
  });

  it("refuses an encrypted PDF", async () => {
    const text = Buffer.from(await pdfBytes(1)).toString("latin1");
    expect(text).toContain("trailer\n<<");
    const encrypted = Buffer.from(text.replace("trailer\n<<", "trailer\n<<\n/Encrypt 1 0 R"), "latin1");
    const response = await POST(post(pdf(new Uint8Array(encrypted))));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: CANT_READ });
    expect(blob.put).not.toHaveBeenCalled();
  });

  it.each(["hello world", "%PDF-1.7 garbage"])("refuses unreadable bytes %j", async (bytes) => {
    const response = await POST(post(pdf(bytes)));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: CANT_READ });
    expect(blob.put).not.toHaveBeenCalled();
  });

  it("refuses a PDF with no pages", async () => {
    const response = await POST(post(pdf(await pdfBytes(0))));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: CANT_READ });
  });

  it("does nothing without a session", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(POST(post(pdf(await pdfBytes(1))))).rejects.toThrow("NEXT_REDIRECT");
    expect(blob.put).not.toHaveBeenCalled();
    expect(saveTermsPathname).not.toHaveBeenCalled();
  });
});
