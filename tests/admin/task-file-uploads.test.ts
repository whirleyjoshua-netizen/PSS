import { beforeEach, describe, expect, it, vi } from "vitest";

const blob = { head: vi.fn(), del: vi.fn() };
vi.mock("@vercel/blob", () => blob);
const { verifyTaskUpload } = await import("@/lib/admin/task-file-uploads");

const TASK = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const OTHER = "7d6c5b4a-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const FILE = "9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const PATH = `task-files/${TASK}/${FILE}/Headlines.pdf`;

beforeEach(() => {
  vi.clearAllMocks();
  blob.head.mockResolvedValue({ size: 900, contentType: "application/pdf" });
  blob.del.mockResolvedValue(undefined);
});

describe("verifyTaskUpload", () => {
  it("takes the size and type from storage, the id from the path, and the trimmed name", async () => {
    expect(await verifyTaskUpload(TASK, { pathname: PATH, name: "  Headlines.pdf " })).toEqual({
      upload: { id: FILE, name: "Headlines.pdf", contentType: "application/pdf", sizeBytes: 900, pathname: PATH },
    });
    expect(blob.head).toHaveBeenCalledWith(PATH);
  });

  it("refuses another task's path or a non-task path without touching storage", async () => {
    for (const pathname of [`task-files/${OTHER}/${FILE}/a.pdf`, `resources/${FILE}/a.pdf`]) {
      expect(await verifyTaskUpload(TASK, { pathname, name: "a.pdf" })).toEqual({ error: "That upload can't be saved." });
    }
    expect(blob.head).not.toHaveBeenCalled();
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("removes an upload that never arrived, is empty, or is over 200 MB", async () => {
    blob.head.mockRejectedValueOnce(new Error("BlobNotFoundError"));
    expect(await verifyTaskUpload(TASK, { pathname: PATH, name: "a" })).toEqual({ error: "The upload didn't finish. Try again." });
    blob.head.mockResolvedValueOnce({ size: 0, contentType: "application/pdf" });
    expect(await verifyTaskUpload(TASK, { pathname: PATH, name: "a" })).toEqual({ error: "That file is empty." });
    blob.head.mockResolvedValueOnce({ size: 200 * 1024 * 1024 + 1, contentType: "application/pdf" });
    expect(await verifyTaskUpload(TASK, { pathname: PATH, name: "a" })).toEqual({ error: "Files must be 200 MB or smaller." });
    expect(blob.del).toHaveBeenCalledTimes(3);
    expect(blob.del).toHaveBeenCalledWith(PATH);
  });

  it("names an unnamed file and types an untyped one", async () => {
    blob.head.mockResolvedValue({ size: 5, contentType: "" });
    expect(await verifyTaskUpload(TASK, { pathname: PATH, name: " " })).toEqual({
      upload: { id: FILE, name: "Untitled file", contentType: "application/octet-stream", sizeBytes: 5, pathname: PATH },
    });
  });
});
