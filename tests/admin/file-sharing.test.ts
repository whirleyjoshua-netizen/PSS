import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { listSharedPhotos, setShared, toFile } = await import("@/lib/admin/files");
const actions = await import("@/app/admin/jobs/measure-actions");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
});

describe("toFile", () => {
  it("maps shared_at, and a missing column to null", () => {
    expect(toFile({ id: FILE, shared_at: "2026-09-13T10:00:00Z", size_bytes: "5" }).sharedAt).toEqual(new Date("2026-09-13T10:00:00Z"));
    expect(toFile({ id: FILE, size_bytes: "5" }).sharedAt).toBeNull();
  });
});

describe("setShared", () => {
  it("shares only a photo on that job, logging it in the same statement", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    expect(await setShared(JOB, FILE, true, "owner@example.com")).toBe(true);

    const call = sql.mock.calls[0];
    expect(text(call)).toContain("update job_files");
    expect(text(call)).toContain("kind = 'photo'");
    expect(text(call)).toContain("insert into job_events");
    expect(call).toEqual(expect.arrayContaining([JOB, FILE, true, "owner@example.com", "Shared photo ", " with customer"]));
  });

  it("logs stopping, with its own wording", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await setShared(JOB, FILE, false, "owner@example.com");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([false, "Stopped sharing photo ", ""]));
  });

  it("returns false for a document, another job's file, or a bad id", async () => {
    expect(await setShared(JOB, FILE, true, "owner@example.com")).toBe(false);
    expect(await setShared(JOB, "nope", true, "owner@example.com")).toBe(false);
  });
});

describe("listSharedPhotos", () => {
  it("returns only shared photos for the job, newest first", async () => {
    await listSharedPhotos(JOB);
    const t = text(sql.mock.calls[0]);
    expect(t).toContain("kind = 'photo'");
    expect(t).toContain("shared_at is not null");
    expect(t).toContain("order by created_at desc");
    expect(sql.mock.calls[0]).toContain(JOB);
  });

  it("returns nothing for a bad id without querying", async () => {
    expect(await listSharedPhotos("nope")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("setFileShared action", () => {
  it("checks the session first", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(actions.setFileShared(JOB, FILE, true)).rejects.toThrow("NEXT_REDIRECT");
    expect(sql).not.toHaveBeenCalled();
  });

  it("shares as the signed-in owner", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await actions.setFileShared(JOB, FILE, true);
    expect(sql.mock.calls[0]).toContain("owner@example.com");
  });
});
