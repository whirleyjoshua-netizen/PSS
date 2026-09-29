import { beforeEach, describe, expect, it, vi } from "vitest";
import { BODY_MAX } from "@/lib/docs/validate";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const getJob = vi.fn();
vi.mock("@/lib/admin/jobs", () => ({ getJob, isUuid: (id: string) => /^[0-9a-f-]{36}$/.test(id) }));
const buildDocumentPdf = vi.fn();
vi.mock("@/lib/docs/pdf", () => ({ buildDocumentPdf }));
const buildTermsPdf = vi.fn();
vi.mock("@/lib/dc/contract-pdf", () => ({ buildTermsPdf }));
const { POST } = await import("@/app/admin/documents/preview/route");
const { business } = await import("@/content/business");
const { formatShortDate } = await import("@/lib/admin/time");

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
  buildTermsPdf.mockReset().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
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
  it("renders terms as the contract prints them, filling only the terms fields with sample values", async () => {
    const response = await POST(post({ title: "Contract terms", kind: "terms", response: "view", jobId: JOB,
      body: "## Terms\n\n{{company_name}} ({{company_phone}}, {{company_email}}) and {{client_name}}, {{project_no}}, {{today}}. Pay {{deposit}} to {{client_email}}." }));
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(buildDocumentPdf).not.toHaveBeenCalled();
    expect(getJob).not.toHaveBeenCalled();
    expect(buildTermsPdf).toHaveBeenCalledTimes(1);
    const [text] = buildTermsPdf.mock.calls[0];
    // A form post carries CRLF line breaks, as a browser's does.
    expect(text.replace(/\r\n/g, "\n")).toBe(`## Terms\n\n${business.legalName} (${business.phone.display}, ${business.email}) and Client name, PSS-0000, ${formatShortDate(new Date())}. Pay {{deposit}} to {{client_email}}.`);
  });
  it("renders every other kind with the document renderer", async () => {
    await POST(post({ title: "SA", kind: "service_agreement", body: "x", response: "sign" }));
    expect(buildDocumentPdf).toHaveBeenCalledTimes(1);
    expect(buildTermsPdf).not.toHaveBeenCalled();
  });
  it("refuses text over the template limit", async () => {
    expect((await POST(post({ body: "x".repeat(BODY_MAX + 1) }))).status).toBe(413);
    expect(buildDocumentPdf).not.toHaveBeenCalled();
  });
});
