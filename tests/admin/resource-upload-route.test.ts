import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const handleUpload = vi.fn();
vi.mock("@vercel/blob/client", () => ({ handleUpload }));
const { POST } = await import("@/app/admin/resources/upload/route");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const body = { type: "blob.generate-client-token", payload: { pathname: `resources/${ID}/a.pdf`, clientPayload: null, multipart: true } };
const post = () => POST(new Request("http://x/admin/resources/upload", { method: "POST", body: JSON.stringify(body) }));

type Options = { onBeforeGenerateToken: (pathname: string, payload: string | null, multipart: boolean) => Promise<Record<string, unknown>>; onUploadCompleted?: unknown; body: unknown };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ email: "owner@example.com" });
  handleUpload.mockResolvedValue({ type: "blob.generate-client-token", clientToken: "tok" });
});

describe("POST /admin/resources/upload", () => {
  it("issues a private, 200 MB, no-overwrite token for a well-formed resources path, and takes no completion callback", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: "blob.generate-client-token", clientToken: "tok" });
    const options = handleUpload.mock.calls[0][0] as Options;
    expect(options.body).toEqual(body);
    expect(options.onUploadCompleted).toBeUndefined();
    const before = Date.now();
    const { validUntil, ...rest } = await options.onBeforeGenerateToken(`resources/${ID}/a.pdf`, null, true);
    expect(rest).toEqual({ maximumSizeInBytes: 200 * 1024 * 1024, addRandomSuffix: false, allowOverwrite: false });
    // Six hours: a 200 MB upload on a slow connection still finishes inside the token.
    expect(validUntil as number).toBeGreaterThanOrEqual(before + 6 * 3600_000);
  });

  it("refuses any other path", async () => {
    await post();
    const options = handleUpload.mock.calls[0][0] as Options;
    for (const bad of [`jobs/${ID}/a.pdf`, `resources/${ID}/../x`, "resources/x/a.pdf"]) {
      await expect(options.onBeforeGenerateToken(bad, null, true)).rejects.toThrow("That upload path is not allowed.");
    }
  });

  it("is for signed-in owners only: nothing is issued otherwise", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(post()).rejects.toThrow("NEXT_REDIRECT");
    expect(handleUpload).not.toHaveBeenCalled();
  });

  it("answers 400 to a body that isn't JSON", async () => {
    const response = await POST(new Request("http://x/admin/resources/upload", { method: "POST", body: "not json" }));
    expect(response.status).toBe(400);
    expect(handleUpload).not.toHaveBeenCalled();
  });

  it("answers 400 with the reason when the token can't be issued", async () => {
    handleUpload.mockRejectedValue(new Error("That upload path is not allowed."));
    const response = await post();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "That upload path is not allowed." });
  });
});
