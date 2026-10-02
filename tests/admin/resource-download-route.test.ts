import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const getResource = vi.fn();
vi.mock("@/lib/admin/resources", () => ({ getResource }));
const blob = { get: vi.fn() };
vi.mock("@vercel/blob", () => blob);
const { GET } = await import("@/app/admin/resources/[id]/route");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const PATH = `resources/${ID}/W-9.pdf`;
const file = (contentType: string, name = "W-9.pdf") => ({ id: ID, name, category: "Licenses", contentType, sizeBytes: 4, uploadedBy: "o", createdAt: new Date(0), pathname: PATH });
const get = () => GET(new Request("http://x"), { params: Promise.resolve({ id: ID }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ email: "owner@example.com" });
  getResource.mockResolvedValue(file("application/pdf"));
  blob.get.mockImplementation(async () => ({ statusCode: 200, stream: new Response(new Uint8Array([37, 80, 68, 70])).body, blob: {} }));
});

describe("GET /admin/resources/[id]", () => {
  it("opens a PDF in the browser, privately, never cached", async () => {
    const response = await get();
    expect(blob.get).toHaveBeenCalledWith(PATH, { access: "private" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toMatch(/^inline; filename="W-9.pdf"/);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Length")).toBe("4");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("answers 502 when storage can't be read", async () => {
    blob.get.mockRejectedValue(new Error("BlobServiceNotAvailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await get()).status).toBe(502);
  });

  it.each(["text/html", "image/svg+xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])("downloads %s instead of opening it", async (type) => {
    getResource.mockResolvedValue(file(type, "Price sheet.xlsx"));
    const response = await get();
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="Price sheet.xlsx"/);
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("is 404 for an unknown file, or one missing from storage", async () => {
    getResource.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);
    blob.get.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);
  });

  it("is for signed-in owners only", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(get()).rejects.toThrow("NEXT_REDIRECT");
    expect(getResource).not.toHaveBeenCalled();
  });
});
