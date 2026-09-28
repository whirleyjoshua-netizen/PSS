import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));

const { listAddedAdmins, addAdmin, removeAdmin } = await import("@/lib/admin/admin-access");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
});

describe("admin access store", () => {
  it("lists added admins oldest first", async () => {
    sql.mockResolvedValue([{ email: "a@x.com", added_by: "owner@x.com", created_at: "2026-09-28T15:00:00Z" }]);
    expect(await listAddedAdmins()).toEqual([
      { email: "a@x.com", addedBy: "owner@x.com", addedAt: new Date("2026-09-28T15:00:00Z") },
    ]);
    expect(text(sql.mock.calls[0])).toMatch(/order by created_at/);
  });

  it("adds once, reporting a repeat as false", async () => {
    sql.mockResolvedValueOnce([{ email: "a@x.com" }]).mockResolvedValueOnce([]);
    expect(await addAdmin("a@x.com", "owner@x.com")).toBe(true);
    expect(await addAdmin("a@x.com", "owner@x.com")).toBe(false);
    expect(text(sql.mock.calls[0])).toContain("on conflict (email) do nothing");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["a@x.com", "owner@x.com"]));
  });

  it("removes the row, their sessions and unused links in one statement", async () => {
    sql.mockResolvedValue([{ email: "a@x.com" }]);
    expect(await removeAdmin("a@x.com")).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
    const query = text(sql.mock.calls[0]);
    expect(query).toContain("delete from admin_access");
    expect(query).toContain("delete from admin_sessions");
    expect(query).toMatch(/delete from admin_login_tokens[\s\S]*used_at is null/);
    // Scoped to the removed address: an unscoped delete here would sign everyone out.
    const flat = query.replace(/\s+/g, " ");
    expect(flat).toMatch(/delete from admin_sessions where email in \(select email from removed\)/);
    expect(flat).toMatch(/delete from admin_login_tokens where used_at is null and email in \(select email from removed\)/);
    expect(flat).toMatch(/delete from admin_access where email = \?/);
    expect(sql.mock.calls[0]).toContain("a@x.com");
  });

  it("reports removing an unknown address as false", async () => {
    expect(await removeAdmin("nobody@x.com")).toBe(false);
  });
});
