import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = await import("@/lib/admin/resources");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const PATH = `resources/${ID}/W-9.pdf`;
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const values = (call: unknown[]) => call.slice(1);
const row = {
  id: ID, name: "W-9.pdf", category: "Licenses", content_type: "application/pdf", size_bytes: "52341",
  uploaded_by: "owner@example.com", created_at: "2026-10-02T15:00:00Z", blob_pathname: PATH,
};
const resource = {
  id: ID, name: "W-9.pdf", category: "Licenses", contentType: "application/pdf", sizeBytes: 52341,
  uploadedBy: "owner@example.com", createdAt: new Date("2026-10-02T15:00:00Z"),
};

beforeEach(() => { sql.mockReset().mockResolvedValue([]); });

describe("reading", () => {
  it("lists every file, size as a number", async () => {
    sql.mockResolvedValue([{ ...row, task_count: 3 }]);
    expect(await store.listResources()).toEqual([{ ...resource, taskCount: 3 }]);
    expect(text(sql.mock.calls[0])).toContain("from company_files");
    expect(text(sql.mock.calls[0])).toContain("(select count(*) from task_files t where t.resource_id = company_files.id)::int as task_count");
  });

  it("lists every category with its file count, empty ones included", async () => {
    sql.mockResolvedValue([{ name: "Licenses", file_count: 2 }, { name: "Tax", file_count: "0" }]);
    expect(await store.listCategories()).toEqual([{ name: "Licenses", fileCount: 2 }, { name: "Tax", fileCount: 0 }]);
    expect(text(sql.mock.calls[0])).toContain("from resource_categories c left join company_files f on f.category = c.name group by c.name");
  });

  it("gets one file with its storage path, and nothing for a non-uuid", async () => {
    sql.mockResolvedValue([row]);
    expect(await store.getResource(ID)).toEqual({ ...resource, pathname: PATH });
    expect(await store.getResource("nope")).toBeNull();
    expect(sql).toHaveBeenCalledTimes(1);
  });
});

describe("writing", () => {
  it("creates the row with the id its path names", async () => {
    sql.mockResolvedValue([row]);
    const created = await store.createResource({ id: ID, name: "W-9.pdf", category: "Licenses", contentType: "application/pdf", sizeBytes: 52341, pathname: PATH, uploadedBy: "owner@example.com" });
    expect(created).toEqual(resource);
    expect(text(sql.mock.calls[0])).toContain("insert into company_files (id, name, category, content_type, size_bytes, blob_pathname, uploaded_by)");
    expect(values(sql.mock.calls[0])).toEqual([ID, "W-9.pdf", "Licenses", "application/pdf", 52341, PATH, "owner@example.com"]);
    expect(text(sql.mock.calls[0])).toContain("on conflict do nothing");
  });

  it("answers null when that upload was already saved", async () => {
    sql.mockResolvedValue([]);
    expect(await store.createResource({ id: ID, name: "W-9.pdf", category: "Licenses", contentType: "application/pdf", sizeBytes: 52341, pathname: PATH, uploadedBy: "owner@example.com" })).toBeNull();
  });

  it("renames and recategorises one row, answering whether it existed", async () => {
    sql.mockResolvedValueOnce([{ id: ID }]).mockResolvedValueOnce([]);
    expect(await store.renameResource(ID, "Form W-9.pdf")).toBe(true);
    expect(await store.recategorizeResource(ID, "Tax")).toBe(false);
    expect(text(sql.mock.calls[0])).toContain("update company_files set name = ?, updated_at = now() where id = ? returning id");
    expect(text(sql.mock.calls[1])).toContain("update company_files set category = ?, updated_at = now() where id = ? returning id");
    expect(await store.renameResource("nope", "x")).toBe(false);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("adds a category, answering false when the name is taken", async () => {
    sql.mockResolvedValueOnce([{ name: "Tax" }]).mockResolvedValueOnce([]);
    expect(await store.createCategory("Tax")).toBe(true);
    expect(await store.createCategory("tax")).toBe(false);
    expect(text(sql.mock.calls[0])).toContain("insert into resource_categories (name) values (?) on conflict do nothing returning name");
    expect(values(sql.mock.calls[0])).toEqual(["Tax"]);
  });

  it("renames and deletes a category, never Uncategorized", async () => {
    sql.mockResolvedValueOnce([{ name: "Taxes" }]).mockResolvedValueOnce([{ name: "Tax" }]);
    expect(await store.renameCategory("Tax", "Taxes")).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("update resource_categories set name = ? where name = ? and name <> ? returning name");
    expect(values(sql.mock.calls[0])).toEqual(["Taxes", "Tax", "Uncategorized"]);
    expect(await store.deleteCategory("Tax")).toBe(true);
    expect(text(sql.mock.calls[1])).toContain("delete from resource_categories where name = ? and name <> ? returning name");
    expect(values(sql.mock.calls[1])).toEqual(["Tax", "Uncategorized"]);
    expect(await store.deleteCategory("Gone")).toBe(false);
  });

  it("deletes the row and answers its storage path, or null when it was already gone", async () => {
    sql.mockResolvedValueOnce([{ blob_pathname: PATH }]).mockResolvedValueOnce([]);
    expect(await store.deleteResource(ID)).toBe(PATH);
    expect(await store.deleteResource(ID)).toBeNull();
    expect(text(sql.mock.calls[0])).toContain("delete from company_files where id = ? returning blob_pathname");
  });
});
