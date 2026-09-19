import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));

const settings = await import("@/lib/admin/lead-settings");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => sql.mockReset().mockResolvedValue([]));

describe("getDefaultAssignee", () => {
  it("returns the saved default", async () => {
    sql.mockResolvedValue([{ default_assignee: ID }]);
    expect(await settings.getDefaultAssignee()).toBe(ID);
    expect(text(sql.mock.calls[0])).toContain("from lead_settings");
  });

  it("is nobody without a row, with an empty default, or when the table is missing", async () => {
    expect(await settings.getDefaultAssignee()).toBeNull();
    sql.mockResolvedValue([{ default_assignee: null }]);
    expect(await settings.getDefaultAssignee()).toBeNull();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    sql.mockRejectedValueOnce(new Error('relation "lead_settings" does not exist'));
    expect(await settings.getDefaultAssignee()).toBeNull();
    error.mockRestore();
  });
});

describe("saveDefaultAssignee", () => {
  it("saves a team member with who saved it, in one statement that checks the member exists", async () => {
    sql.mockResolvedValue([{ member: 1, saved: 1 }]);
    expect(await settings.saveDefaultAssignee(ID, "owner@example.com")).toBe("ok");
    expect(sql).toHaveBeenCalledTimes(1);
    const call = sql.mock.calls[0];
    expect(call).toEqual(expect.arrayContaining([ID, "owner@example.com"]));
    expect(text(call)).toContain("from team_members");
    expect(text(call)).toContain("insert into lead_settings");
  });

  it("refuses an id that is not a team member", async () => {
    sql.mockResolvedValue([{ member: 0, saved: 0 }]);
    expect(await settings.saveDefaultAssignee(ID, "owner@example.com")).toBe("unknown-member");
  });

  it("refuses a non-uuid without touching the database", async () => {
    expect(await settings.saveDefaultAssignee("shade", "owner@example.com")).toBe("unknown-member");
    expect(sql).not.toHaveBeenCalled();
  });

  it("clears the default to nobody", async () => {
    sql.mockResolvedValue([{ member: 0, saved: 1 }]);
    expect(await settings.saveDefaultAssignee(null, "owner@example.com")).toBe("ok");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([null, "owner@example.com"]));
  });
});
