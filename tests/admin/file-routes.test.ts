// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const files = { createFile: vi.fn(), getFile: vi.fn(), readFile: vi.fn() };
vi.mock("@/lib/admin/files", () => files);

const upload = await import("@/app/admin/jobs/[id]/files/route");
const view = await import("@/app/admin/files/[fileId]/route");
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const post = (file: File | null, kind = "document") => {
  const data = new FormData();
  if (file) data.append("file", file);
  data.append("kind", kind);
  return new Request(`http://localhost/admin/jobs/${LEAD}/files`, { method: "POST", body: data });
};
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

beforeEach(() => {
  Object.values(files).forEach((fn) => fn.mockReset());
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
});

describe("POST upload", () => {
  it("stores an allowed file and returns its id", async () => {
    files.createFile.mockResolvedValue({ id: FILE });
    const response = await upload.POST(post(new File(["%PDF"], "Quote.pdf", { type: "application/pdf" })), params({ id: LEAD }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: FILE });
    expect(files.createFile).toHaveBeenCalledWith(expect.objectContaining({
      leadId: LEAD, kind: "document", name: "Quote.pdf", contentType: "application/pdf", actor: "owner@example.com",
    }));
  });

  it("refuses a disallowed type before storing anything", async () => {
    const response = await upload.POST(post(new File(["x"], "a.zip", { type: "application/zip" })), params({ id: LEAD }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/PDF, JPG, or PNG/);
    expect(files.createFile).not.toHaveBeenCalled();
  });

  it("refuses a request with no file", async () => {
    const response = await upload.POST(post(null), params({ id: LEAD }));
    expect(response.status).toBe(400);
  });

  it("returns 404 for a missing job", async () => {
    files.createFile.mockResolvedValue(null);
    const response = await upload.POST(post(new File(["x"], "a.jpg", { type: "image/jpeg" }), "photo"), params({ id: LEAD }));
    expect(response.status).toBe(404);
  });

  it("does nothing without a session", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(upload.POST(post(new File(["x"], "a.pdf", { type: "application/pdf" })), params({ id: LEAD }))).rejects.toThrow("NEXT_REDIRECT");
    expect(files.createFile).not.toHaveBeenCalled();
  });
});

describe("GET view", () => {
  it("streams the file privately", async () => {
    files.getFile.mockResolvedValue({ id: FILE, name: "Quote.pdf" });
    files.readFile.mockResolvedValue({ stream: new Blob(["%PDF"]).stream(), contentType: "application/pdf" });
    const response = await view.GET(new Request("http://localhost"), params({ fileId: FILE }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toMatch(/^inline/);
  });

  it("returns 404 for an unknown file or a missing blob", async () => {
    files.getFile.mockResolvedValue(null);
    expect((await view.GET(new Request("http://localhost"), params({ fileId: FILE }))).status).toBe(404);
    files.getFile.mockResolvedValue({ id: FILE, name: "x" });
    files.readFile.mockResolvedValue(null);
    expect((await view.GET(new Request("http://localhost"), params({ fileId: FILE }))).status).toBe(404);
  });

  it("does nothing without a session", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(view.GET(new Request("http://localhost"), params({ fileId: FILE }))).rejects.toThrow("NEXT_REDIRECT");
    expect(files.getFile).not.toHaveBeenCalled();
  });
});
