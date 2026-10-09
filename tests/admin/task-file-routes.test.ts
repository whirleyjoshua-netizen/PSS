import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const getTaskFile = vi.fn();
vi.mock("@/lib/admin/task-files", () => ({ getTaskFile }));
const blob = { get: vi.fn() };
vi.mock("@vercel/blob", () => blob);
const handleUpload = vi.fn();
vi.mock("@vercel/blob/client", () => ({ handleUpload }));
const { GET } = await import("@/app/admin/tasks/files/[fileId]/route");
const { POST } = await import("@/app/admin/tasks/upload/route");

const TASK = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = "9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const RES = "5c4b3a29-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const PATH = `task-files/${TASK}/${FILE}/Headlines.pdf`;
const upload = (contentType: string, name = "Headlines.pdf") => ({
  id: FILE, taskId: TASK, resourceId: null, name, contentType, sizeBytes: 4, addedBy: "o", createdAt: new Date(0), pathname: PATH,
});
const open = () => GET(new Request("http://x"), { params: Promise.resolve({ fileId: FILE }) });

type Options = { onBeforeGenerateToken: (pathname: string, payload: string | null, multipart: boolean) => Promise<Record<string, unknown>>; onUploadCompleted?: unknown };
const tokenBody = { type: "blob.generate-client-token", payload: { pathname: PATH, clientPayload: null, multipart: true } };
const post = () => POST(new Request("http://x/admin/tasks/upload", { method: "POST", body: JSON.stringify(tokenBody) }));

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ email: "shade@example.com" });
  getTaskFile.mockResolvedValue(upload("application/pdf"));
  blob.get.mockImplementation(async () => ({ statusCode: 200, stream: new Response(new Uint8Array([37, 80, 68, 70])).body, blob: {} }));
  handleUpload.mockResolvedValue({ type: "blob.generate-client-token", clientToken: "tok" });
});

describe("GET /admin/tasks/files/[fileId]", () => {
  it("opens an uploaded PDF in the browser, privately, never cached", async () => {
    const response = await open();
    expect(blob.get).toHaveBeenCalledWith(PATH, { access: "private" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toMatch(/^inline; filename="Headlines.pdf"/);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Length")).toBe("4");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it.each(["text/html", "image/svg+xml"])("downloads %s instead of opening it", async (type) => {
    getTaskFile.mockResolvedValue(upload(type, "page.html"));
    const response = await open();
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="page.html"/);
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("sends a linked Resources file to the library's own route", async () => {
    getTaskFile.mockResolvedValue({ ...upload("application/pdf"), resourceId: RES, pathname: null });
    const response = await open();
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(`/admin/resources/${RES}`);
    expect(blob.get).not.toHaveBeenCalled();
  });

  it("is 404 for an unknown file or one missing from storage, and 502 when storage can't be read", async () => {
    getTaskFile.mockResolvedValueOnce(null);
    expect((await open()).status).toBe(404);
    blob.get.mockResolvedValueOnce(null);
    expect((await open()).status).toBe(404);
    blob.get.mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await open()).status).toBe(502);
  });

  it("is for signed-in admins only", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(open()).rejects.toThrow("NEXT_REDIRECT");
    expect(getTaskFile).not.toHaveBeenCalled();
  });
});

describe("POST /admin/tasks/upload", () => {
  it("issues a private, 200 MB, no-overwrite, six-hour token for a task file path, with no completion callback", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    const options = handleUpload.mock.calls[0][0] as Options;
    expect(options.onUploadCompleted).toBeUndefined();
    const before = Date.now();
    const { validUntil, ...rest } = await options.onBeforeGenerateToken(PATH, null, true);
    expect(rest).toEqual({ maximumSizeInBytes: 200 * 1024 * 1024, addRandomSuffix: false, allowOverwrite: false });
    expect(validUntil as number).toBeGreaterThanOrEqual(before + 6 * 3600_000);
  });

  it("refuses any other path", async () => {
    await post();
    const options = handleUpload.mock.calls[0][0] as Options;
    for (const bad of [`resources/${FILE}/a.pdf`, `task-files/${TASK}/a.pdf`, `task-files/${TASK}/${FILE}/..`]) {
      await expect(options.onBeforeGenerateToken(bad, null, true)).rejects.toThrow("That upload path is not allowed.");
    }
  });

  it("is for signed-in admins only", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(post()).rejects.toThrow("NEXT_REDIRECT");
    expect(handleUpload).not.toHaveBeenCalled();
  });
});
