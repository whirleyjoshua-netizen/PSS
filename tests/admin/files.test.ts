import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const put = vi.fn();
const get = vi.fn();
const del = vi.fn();
vi.mock("@vercel/blob", () => ({ put, get, del }));

const files = await import("@/lib/admin/files");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const row = {
  id: FILE, lead_id: LEAD, created_at: "2026-09-12T18:00:00Z", uploaded_by: "owner@example.com",
  kind: "document", name: "Quote.pdf", content_type: "application/pdf", size_bytes: 1200,
  blob_pathname: `jobs/${LEAD}/${FILE}-Quote.pdf`,
};

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  put.mockReset().mockResolvedValue({ pathname: "p" });
  get.mockReset();
  del.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createFile", () => {
  it("stores the blob privately under the job, then records the row and its event", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("select id from leads") ? [{ id: LEAD }] : [row],
    );

    const file = await files.createFile({
      leadId: LEAD, kind: "document", name: "Quote #3.pdf", contentType: "application/pdf",
      body: new Blob(["x"]), actor: "owner@example.com",
    });

    const [pathname, , options] = put.mock.calls[0];
    expect(pathname).toMatch(new RegExp(`^jobs/${LEAD}/[0-9a-f-]{36}-Quote-3.pdf$`));
    expect(options).toMatchObject({ access: "private", contentType: "application/pdf" });
    const insert = sql.mock.calls.find((c) => text(c).includes("insert into job_files"))!;
    expect(text(insert)).toContain("insert into job_events");
    expect(file?.name).toBe("Quote.pdf");
  });

  it("returns null for a missing job without storing anything", async () => {
    sql.mockResolvedValue([]);
    const file = await files.createFile({
      leadId: LEAD, kind: "photo", name: "a.jpg", contentType: "image/jpeg", body: new Blob(["x"]), actor: "o",
    });
    expect(file).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });

  it("returns null for a non-uuid job id without querying", async () => {
    const file = await files.createFile({
      leadId: "nope", kind: "photo", name: "a.jpg", contentType: "image/jpeg", body: new Blob(["x"]), actor: "o",
    });
    expect(file).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("removes the stored blob if the row cannot be saved", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      if (strings.join("?").includes("select id from leads")) return [{ id: LEAD }];
      throw new Error("db down");
    });
    await expect(files.createFile({
      leadId: LEAD, kind: "photo", name: "a.jpg", contentType: "image/jpeg", body: new Blob(["x"]), actor: "o",
    })).rejects.toThrow("db down");
    expect(del).toHaveBeenCalledOnce();
  });
});

describe("reading and deleting", () => {
  it("maps rows to files", async () => {
    sql.mockResolvedValue([row]);
    const [file] = await files.listFiles(LEAD);
    expect(file).toMatchObject({ id: FILE, kind: "document", sizeBytes: 1200 });
  });

  it("returns null for a non-uuid file id without querying", async () => {
    expect(await files.getFile("../x")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("reads a blob privately and returns null when it is gone", async () => {
    get.mockResolvedValue({ statusCode: 200, stream: "S", blob: { contentType: "application/pdf" } });
    const file = { ...row, id: FILE, leadId: LEAD, createdAt: new Date(), uploadedBy: "o", kind: "document" as const,
      contentType: "application/pdf", sizeBytes: 1, blobPathname: row.blob_pathname };
    expect(await files.readFile(file)).toEqual({ stream: "S", contentType: "application/pdf" });
    expect(get).toHaveBeenCalledWith(row.blob_pathname, { access: "private" });

    get.mockResolvedValue(null);
    expect(await files.readFile(file)).toBeNull();
  });

  it("deletes the row with its event, then the blob", async () => {
    sql.mockResolvedValue([{ blob_pathname: row.blob_pathname }]);
    expect(await files.deleteFile(FILE, "owner@example.com")).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("delete from job_files");
    expect(text(sql.mock.calls[0])).toContain("insert into job_events");
    expect(del).toHaveBeenCalledWith(row.blob_pathname);
  });

  it("reports false when the file does not exist", async () => {
    sql.mockResolvedValue([]);
    expect(await files.deleteFile(FILE, "o")).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });
});
