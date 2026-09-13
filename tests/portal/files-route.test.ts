// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer }));
const files = { getFile: vi.fn(), readFile: vi.fn() };
vi.mock("@/lib/admin/files", () => files);

const { GET } = await import("@/app/(site)/project/files/[fileId]/route");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const call = () => GET(new Request("http://localhost"), { params: Promise.resolve({ fileId: FILE }) });
const photo = (over: Record<string, unknown> = {}) => ({
  id: FILE, leadId: JOB, kind: "photo", name: "Living room.jpg", sharedAt: new Date(), ...over,
});

beforeEach(() => {
  requireCustomer.mockReset().mockResolvedValue({ email: "maria@example.com", jobs: [{ id: JOB }] });
  files.getFile.mockReset().mockResolvedValue(photo());
  files.readFile.mockReset().mockResolvedValue({ stream: new Blob(["jpeg"]).stream(), contentType: "image/jpeg" });
});

describe("customer photo route", () => {
  it("streams a shared photo on the customer's job, privately", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toMatch(/^inline/);
  });

  it.each([
    ["an unshared photo", photo({ sharedAt: null })],
    ["a document", photo({ kind: "document" })],
    ["another customer's photo", photo({ leadId: "00000000-0000-4000-8000-000000000000" })],
    ["a missing file", null],
  ])("404s for %s, without reading the blob", async (_label, file) => {
    files.getFile.mockResolvedValue(file);
    const response = await call();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(files.readFile).not.toHaveBeenCalled();
  });

  it("404s when the blob is gone", async () => {
    files.readFile.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("does nothing without a customer session", async () => {
    requireCustomer.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(call()).rejects.toThrow("NEXT_REDIRECT");
    expect(files.getFile).not.toHaveBeenCalled();
  });
});
