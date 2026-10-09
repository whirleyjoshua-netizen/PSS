import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = await import("@/lib/admin/task-files");

const TASK = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const FILE = "9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const RES = "5c4b3a29-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const PATH = `task-files/${TASK}/${FILE}/Headlines.pdf`;
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const upload = { id: FILE, name: "Headlines.pdf", contentType: "application/pdf", sizeBytes: 900, pathname: PATH };

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
});

describe("listTaskFiles", () => {
  it("lists uploads and links oldest first, a link with the library file's name, type and size", async () => {
    sql.mockResolvedValue([
      { id: FILE, task_id: TASK, resource_id: null, name: "Headlines.pdf", content_type: "application/pdf", size_bytes: "900", added_by: "a@x.com", created_at: "2026-10-09T15:00:00Z" },
      { id: RES, task_id: TASK, resource_id: RES, name: "Price guide.pdf", content_type: "application/pdf", size_bytes: "5000", added_by: "b@x.com", created_at: "2026-10-09T16:00:00Z" },
    ]);
    const files = await store.listTaskFiles(TASK);
    expect(files[0]).toEqual({ id: FILE, taskId: TASK, resourceId: null, name: "Headlines.pdf", contentType: "application/pdf", sizeBytes: 900, addedBy: "a@x.com", createdAt: new Date("2026-10-09T15:00:00Z") });
    expect(files[1].resourceId).toBe(RES);
    const query = text(sql.mock.calls[0]);
    expect(query).toContain("coalesce(f.name, r.name) as name");
    expect(query).toContain("from task_files f left join company_files r on r.id = f.resource_id");
    expect(query).toContain("where f.task_id = ? order by f.created_at, f.id");
  });
  it("answers nothing for a malformed id without querying", async () => {
    expect(await store.listTaskFiles("nope")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("getTaskFile", () => {
  it("answers the storage path for an upload and null for a link", async () => {
    sql.mockResolvedValue([{ id: FILE, task_id: TASK, resource_id: null, name: "Headlines.pdf", content_type: "application/pdf", size_bytes: 900, added_by: "a@x.com", created_at: "2026-10-09T15:00:00Z", blob_pathname: PATH }]);
    expect((await store.getTaskFile(FILE))?.pathname).toBe(PATH);
    sql.mockResolvedValue([{ id: FILE, task_id: TASK, resource_id: RES, name: "Guide.pdf", content_type: "application/pdf", size_bytes: 9, added_by: "a@x.com", created_at: "2026-10-09T15:00:00Z", blob_pathname: null }]);
    expect((await store.getTaskFile(FILE))?.pathname).toBeNull();
    expect(await store.getTaskFile("nope")).toBeNull();
  });
});

describe("addTaskUpload", () => {
  it("records the upload once: a repeat save changes nothing", async () => {
    sql.mockResolvedValue([{ id: FILE }]);
    expect(await store.addTaskUpload(TASK, upload, "a@x.com")).toBe("added");
    expect(text(sql.mock.calls[0])).toContain("insert into task_files (id, task_id, name, content_type, size_bytes, blob_pathname, added_by)");
    expect(text(sql.mock.calls[0])).toContain("on conflict do nothing");
    expect(sql.mock.calls[0].slice(1)).toEqual([FILE, TASK, "Headlines.pdf", "application/pdf", 900, PATH, "a@x.com"]);
    sql.mockResolvedValue([]);
    expect(await store.addTaskUpload(TASK, upload, "a@x.com")).toBe("exists");
  });
});

describe("linkResource", () => {
  it("links a Resources file once", async () => {
    sql.mockResolvedValue([{ id: "x" }]);
    expect(await store.linkResource(TASK, RES, "a@x.com")).toBe("added");
    expect(text(sql.mock.calls[0])).toContain("insert into task_files (id, task_id, resource_id, added_by) values (gen_random_uuid(), ?, ?, ?) on conflict do nothing");
    sql.mockResolvedValue([]);
    expect(await store.linkResource(TASK, RES, "a@x.com")).toBe("exists");
  });
});

describe("removeTaskFile", () => {
  it("deletes only that task's row and answers the path to remove", async () => {
    sql.mockResolvedValue([{ blob_pathname: PATH }]);
    expect(await store.removeTaskFile(TASK, FILE)).toEqual({ pathname: PATH });
    expect(text(sql.mock.calls[0])).toContain("delete from task_files where id = ? and task_id = ? returning blob_pathname");
    sql.mockResolvedValue([{ blob_pathname: null }]);
    expect(await store.removeTaskFile(TASK, FILE)).toEqual({ pathname: null });
    sql.mockResolvedValue([]);
    expect(await store.removeTaskFile(TASK, FILE)).toBeNull();
  });
});

describe("recordedPathnames", () => {
  it("answers which paths a row records, and asks nothing for none", async () => {
    expect(await store.recordedPathnames([])).toEqual(new Set());
    expect(sql).not.toHaveBeenCalled();
    sql.mockResolvedValue([{ blob_pathname: PATH }]);
    expect(await store.recordedPathnames([PATH, "task-files/other"])).toEqual(new Set([PATH]));
  });
});
