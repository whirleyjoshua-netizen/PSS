import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const previewQuote = vi.fn();
vi.mock("@/lib/dc/send", () => ({ previewQuote }));
const { GET } = await import("@/app/admin/jobs/[id]/quote-preview/route");

const J = "11111111-1111-4111-8111-111111111111";
const get = () => GET(new Request("http://x"), { params: Promise.resolve({ id: J }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ email: "owner@example.com" });
  previewQuote.mockResolvedValue({ pdf: new Uint8Array([37, 80, 68, 70]), name: "Quote PSS-1042 v1 PREVIEW.pdf" });
});

describe("GET quote preview", () => {
  it("opens the preview PDF in the browser, never cached", async () => {
    const response = await get();
    expect(previewQuote).toHaveBeenCalledWith(J);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toMatch(/^inline; filename="Quote PSS-1042 v1 PREVIEW.pdf"/);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("says why when there is nothing to preview", async () => {
    previewQuote.mockResolvedValue({ error: "Set a markup for Duette first." });
    const response = await get();
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("Set a markup for Duette first.");
  });

  it("is for signed-in owners only", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(get()).rejects.toThrow("NEXT_REDIRECT");
    expect(previewQuote).not.toHaveBeenCalled();
  });
});
