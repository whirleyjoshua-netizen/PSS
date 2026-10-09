import { beforeEach, describe, expect, it, vi } from "vitest";

const blob = { list: vi.fn(), del: vi.fn() };
vi.mock("@vercel/blob", () => blob);
const recordedPathnames = vi.fn();
vi.mock("@/lib/admin/task-files", () => ({ recordedPathnames }));
const { sweepTaskUploads } = await import("@/lib/admin/task-file-sweep");

const now = new Date("2026-10-10T14:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
const blobAt = (pathname: string, uploadedAt: Date) => ({ pathname, uploadedAt, size: 1, url: "u", downloadUrl: "d" });

beforeEach(() => {
  vi.resetAllMocks();
  blob.del.mockResolvedValue(undefined);
  recordedPathnames.mockResolvedValue(new Set());
});

describe("sweepTaskUploads", () => {
  it("deletes only task uploads over 24 hours old that no row records, across every page", async () => {
    blob.list
      .mockResolvedValueOnce({ blobs: [blobAt("task-files/a", hoursAgo(30)), blobAt("task-files/b", hoursAgo(25)), blobAt("task-files/young", hoursAgo(23))], cursor: "c2", hasMore: true })
      .mockResolvedValueOnce({ blobs: [blobAt("task-files/c", hoursAgo(48))], hasMore: false });
    recordedPathnames.mockImplementation(async (paths: string[]) => new Set(paths.filter((p) => p === "task-files/b")));
    expect(await sweepTaskUploads(now)).toEqual({ removed: 2 });
    expect(blob.list).toHaveBeenNthCalledWith(1, { prefix: "task-files/", cursor: undefined, limit: 1000 });
    expect(blob.list).toHaveBeenNthCalledWith(2, { prefix: "task-files/", cursor: "c2", limit: 1000 });
    expect(recordedPathnames).toHaveBeenNthCalledWith(1, ["task-files/a", "task-files/b"]);
    expect(blob.del).toHaveBeenNthCalledWith(1, ["task-files/a"]);
    expect(blob.del).toHaveBeenNthCalledWith(2, ["task-files/c"]);
  });

  it("deletes nothing when every old upload is recorded", async () => {
    blob.list.mockResolvedValue({ blobs: [blobAt("task-files/a", hoursAgo(30))], hasMore: false });
    recordedPathnames.mockResolvedValue(new Set(["task-files/a"]));
    expect(await sweepTaskUploads(now)).toEqual({ removed: 0 });
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("never throws: it reports what failed and what it had already removed", async () => {
    blob.list
      .mockResolvedValueOnce({ blobs: [blobAt("task-files/a", hoursAgo(30))], cursor: "c2", hasMore: true })
      .mockRejectedValueOnce(new Error("BlobServiceNotAvailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sweepTaskUploads(now)).toEqual({ removed: 1, error: "BlobServiceNotAvailable" });
  });
});
