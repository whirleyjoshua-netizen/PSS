import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = await import("@/lib/docs/templates");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const ID = "11111111-1111-4111-8111-111111111111";
const row = { id: ID, name: "Terms", kind: "terms", response: "view", body: "## A", archived_at: null, created_by: "o@x.com",
  updated_by: "o@x.com", created_at: "2026-09-28T18:00:00Z", updated_at: "2026-09-28T19:00:00Z" };

beforeEach(() => sql.mockReset());

describe("template store", () => {
  it("lists live templates only, by kind then name, and maps the row", async () => {
    sql.mockResolvedValueOnce([row]);
    const [template] = await store.listTemplates();
    expect(text(sql.mock.calls[0])).toContain("where archived_at is null order by kind, lower(name)");
    expect(template).toEqual({ id: ID, name: "Terms", kind: "terms", response: "view", body: "## A", archivedAt: null,
      createdBy: "o@x.com", updatedBy: "o@x.com", createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) });
  });
  it("finds the live template of a singleton kind", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await store.liveTemplateOfKind("guide_care")).toBeNull();
    expect(text(sql.mock.calls[0])).toContain("where kind = ? and archived_at is null");
    expect(sql.mock.calls[0]).toContain("guide_care");
  });
  it("never queries for a malformed id", async () => {
    expect(await store.getTemplate("nope")).toBeNull();
    expect(await store.updateTemplate({ id: "nope", name: "a", response: "view", body: "b", actor: "o" })).toBe(false);
    expect(await store.archiveTemplate("nope", "o")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });
  it("creates with a trimmed name, forcing view for terms and guides", async () => {
    sql.mockResolvedValueOnce([]);
    const created = await store.createTemplate({ name: "  Terms ", kind: "terms", response: "sign", body: "x", actor: "o@x.com" });
    expect(created).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(text(sql.mock.calls[0])).toContain("insert into document_templates (id, name, kind, response, body, created_by, updated_by)");
    expect(sql.mock.calls[0].slice(1, 6)).toEqual([(created as { id: string }).id, "Terms", "terms", "view", "x"]);
  });
  it("keeps the chosen response for client documents", async () => {
    sql.mockResolvedValueOnce([]);
    await store.createTemplate({ name: "SA", kind: "service_agreement", response: "acknowledge", body: "x", actor: "o" });
    expect(sql.mock.calls[0][4]).toBe("acknowledge");
  });
  it("turns a second live singleton into a plain refusal", async () => {
    sql.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "23505" }));
    expect(await store.createTemplate({ name: "T2", kind: "terms", response: "view", body: "x", actor: "o" }))
      .toEqual({ error: "There is already a live Contract terms template. Edit that one instead." });
  });
  it("rethrows any other database error", async () => {
    sql.mockRejectedValueOnce(Object.assign(new Error("down"), { code: "57P01" }));
    await expect(store.createTemplate({ name: "T", kind: "other", response: "view", body: "x", actor: "o" })).rejects.toThrow("down");
  });
  it("updates only a live template, never its kind, keeping singletons view-only", async () => {
    sql.mockResolvedValueOnce([{ id: ID }]);
    expect(await store.updateTemplate({ id: ID, name: " New ", response: "sign", body: "b", actor: "o" })).toBe(true);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("where id = ? and archived_at is null");
    expect(s).toContain("case when kind in ('terms','guide_install','guide_care') then 'view' else ? end");
    expect(s).not.toContain("kind =");
    expect(sql.mock.calls[0]).toContain("New");
    sql.mockResolvedValueOnce([]);
    expect(await store.updateTemplate({ id: ID, name: "x", response: "view", body: "b", actor: "o" })).toBe(false);
  });
  it("archives a live template once", async () => {
    sql.mockResolvedValueOnce([{ id: ID }]).mockResolvedValueOnce([]);
    expect(await store.archiveTemplate(ID, "o")).toBe(true);
    expect(await store.archiveTemplate(ID, "o")).toBe(false);
    expect(text(sql.mock.calls[0])).toContain("set archived_at = now()");
    expect(text(sql.mock.calls[0])).toContain("where id = ? and archived_at is null");
  });
});
