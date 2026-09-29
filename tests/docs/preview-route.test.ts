import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const getJob = vi.fn();
vi.mock("@/lib/admin/jobs", () => ({ getJob, isUuid: (id: string) => /^[0-9a-f-]{36}$/.test(id) }));
const buildDocumentPdf = vi.fn();
vi.mock("@/lib/docs/pdf", () => ({ buildDocumentPdf }));
const { POST } = await import("@/app/admin/documents/preview/route");

const JOB = "11111111-1111-4111-8111-111111111111";
const post = (fields: Record<string, string>) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  return new Request("http://localhost/admin/documents/preview", { method: "POST", body });
};

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ email: "o@x.com" });
  getJob.mockReset().mockResolvedValue({ id: JOB, name: "Maria Lopez", address: "12 Palm Way", city: "Henderson", email: "m@x.com", projectNo: 1048 });
  buildDocumentPdf.mockReset().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});

describe("POST /admin/documents/preview", () => {
  it("checks the admin before reading the form", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const request = post({ body: "x" });
    const formData = vi.spyOn(request, "formData");
    await expect(POST(request)).rejects.toThrow("NEXT_REDIRECT");
    expect(formData).not.toHaveBeenCalled();
  });
  it("renders the posted text for a job as an inline PDF", async () => {
    const response = await POST(post({ title: "SA", body: "## Hi", response: "sign", jobId: JOB }));
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(buildDocumentPdf).toHaveBeenCalledWith(expect.objectContaining({ title: "SA", projectNo: "PSS-1048", response: "sign",
      client: { name: "Maria Lopez", address: "12 Palm Way", city: "Henderson", email: "m@x.com" },
      blocks: [{ type: "heading", level: 2, inlines: [{ type: "text", text: "Hi", bold: false }] }] }));
  });
  it("uses a sample client without a job, and view for an unknown response", async () => {
    await POST(post({ title: "", body: "x", response: "approve" }));
    expect(getJob).not.toHaveBeenCalled();
    expect(buildDocumentPdf).toHaveBeenCalledWith(expect.objectContaining({ title: "Untitled document", projectNo: null, response: "view",
      client: { name: "Client name", address: "Street address", city: "City", email: "client@example.com" } }));
  });
  it("refuses text over the template limit", async () => {
    expect((await POST(post({ body: "x".repeat(100_001) }))).status).toBe(413);
    expect(buildDocumentPdf).not.toHaveBeenCalled();
  });
});
