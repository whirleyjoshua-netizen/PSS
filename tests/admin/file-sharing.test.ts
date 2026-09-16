import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { listSharedDocuments, listSharedPhotos, setDocType, setShared, toFile } = await import("@/lib/admin/files");
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

  it("maps doc_type, and a missing column to null", () => {
    expect(toFile({ id: FILE, doc_type: "quote", size_bytes: "5" }).docType).toBe("quote");
    expect(toFile({ id: FILE, size_bytes: "5" }).docType).toBeNull();
  });
});

describe("setShared", () => {
  it("shares a photo or a document on that job, logging it in the same statement", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    expect(await setShared(JOB, FILE, true, "owner@example.com")).toBe(true);

    const call = sql.mock.calls[0];
    expect(text(call)).toContain("update job_files");
    expect(text(call)).toContain("kind in ('photo','document')");
    expect(text(call)).toContain("insert into job_events");
    expect(call).toEqual(expect.arrayContaining([JOB, FILE, true, "owner@example.com"]));
  });

  it("keeps the lead_id guard, so one job's file cannot be shared onto another", async () => {
    sql.mockResolvedValue([]);
    expect(await setShared(JOB, FILE, true, "owner@example.com")).toBe(false);
    const call = sql.mock.calls[0];
    expect(text(call)).toContain("where id = ? and lead_id = ?");
    // The job id is bound immediately after the file id, so the guard compares
    // lead_id against this job and not some value the caller controls.
    expect(call.indexOf(JOB)).toBe(call.indexOf(FILE) + 1);
  });

  it("names the file in the log without calling a document a photo", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await setShared(JOB, FILE, true, "owner@example.com");
    const call = sql.mock.calls[0];
    expect(text(call)).toContain("|| name ||");
    expect(call).toEqual(expect.arrayContaining(["Shared ", " with customer"]));
    // `call` is the array of template values, so this checks that no bound value
    // IS the string "Shared photo " — not that it contains it as a substring.
    expect(call.filter((value) => value === "Shared photo ")).toEqual([]);
  });

  it("logs stopping, with its own wording, and clears shared_at", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await setShared(JOB, FILE, false, "owner@example.com");
    expect(text(sql.mock.calls[0])).toContain("else null end");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([false, "Stopped sharing ", ""]));
    // Again an element check, not a substring one: no bound value equals this.
    expect(sql.mock.calls[0].filter((value) => value === "Stopped sharing photo ")).toEqual([]);
  });

  it("returns false for another job's file, or a bad id", async () => {
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

describe("setDocType", () => {
  it("labels the file on that job and logs it, without touching shared_at", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    expect(await setDocType(JOB, FILE, "quote", "owner@example.com")).toBe(true);

    const call = sql.mock.calls[0];
    expect(text(call)).toContain("update job_files");
    expect(text(call)).toContain("doc_type =");
    expect(text(call)).toContain("where id = ? and lead_id = ?");
    expect(text(call)).toContain("insert into job_events");
    expect(text(call)).not.toContain("shared_at");
    expect(call).toEqual(expect.arrayContaining([JOB, FILE, "quote", "owner@example.com"]));
  });

  it("labels documents only, so a photo cannot carry a document type", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await setDocType(JOB, FILE, "quote", "owner@example.com");
    expect(text(sql.mock.calls[0])).toContain("kind = 'document'");
  });

  it("writes the log body wording, naming the file and its label", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await setDocType(JOB, FILE, "quote", "owner@example.com");
    expect(text(sql.mock.calls[0])).toContain("|| name ||");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["Labelled ", " as Quote"]));

    sql.mockClear();
    await setDocType(JOB, FILE, "po", "owner@example.com");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([" as PO"]));

    sql.mockClear();
    await setDocType(JOB, FILE, null, "owner@example.com");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["Removed the type label from ", ""]));
  });

  it("clears the label", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    expect(await setDocType(JOB, FILE, null, "owner@example.com")).toBe(true);
    expect(sql.mock.calls[0]).toContain(null);
    expect(text(sql.mock.calls[0])).not.toContain("shared_at");
  });

  it("returns false when nothing matched, or for a bad id without querying", async () => {
    sql.mockResolvedValue([]);
    expect(await setDocType(JOB, FILE, "po", "owner@example.com")).toBe(false);
    sql.mockClear();
    expect(await setDocType(JOB, "nope", "po", "owner@example.com")).toBe(false);
    expect(await setDocType("nope", FILE, "po", "owner@example.com")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("listSharedDocuments", () => {
  it("returns only shared documents for the job, newest first", async () => {
    await listSharedDocuments(JOB);
    const t = text(sql.mock.calls[0]);
    expect(t).toContain("kind = 'document'");
    expect(t).toContain("shared_at is not null");
    expect(t).toContain("order by created_at desc");
    expect(sql.mock.calls[0]).toContain(JOB);
  });

  it("returns nothing for a bad id without querying", async () => {
    expect(await listSharedDocuments("nope")).toEqual([]);
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

describe("setFileDocType action", () => {
  it("checks the session first", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(actions.setFileDocType(JOB, FILE, "quote")).rejects.toThrow("NEXT_REDIRECT");
    expect(sql).not.toHaveBeenCalled();
  });

  it("labels as the signed-in owner, and never touches shared_at", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await actions.setFileDocType(JOB, FILE, "quote");
    expect(sql.mock.calls[0]).toContain("owner@example.com");
    expect(sql.mock.calls[0]).toContain("quote");
    expect(text(sql.mock.calls[0])).not.toContain("shared_at");
  });

  it("clears the label", async () => {
    sql.mockResolvedValue([{ lead_id: JOB }]);
    await actions.setFileDocType(JOB, FILE, null);
    expect(sql.mock.calls[0]).toContain(null);
  });
});
