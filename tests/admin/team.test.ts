import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const team = await import("@/lib/admin/team");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  sql.query.mockReset().mockResolvedValue([]);
});

describe("team", () => {
  it("lists people by name, ignoring case", async () => {
    sql.mockResolvedValue([{ id: ID, name: "Shade", role: "designer" }]);
    expect(await team.listTeam()).toEqual([{ id: ID, name: "Shade", role: "designer" }]);
    expect(text(sql.mock.calls[0])).toContain("order by lower(name)");
  });

  it("adds a person and returns the new id", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    expect(await team.addTeamMember("Shade", "designer")).toBe(ID);
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["Shade", "designer"]));
  });

  it("trims the name before it reaches the database", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await team.addTeamMember("  Shade  ", "designer");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["Shade", "designer"]));
    expect(sql.mock.calls[0]).not.toEqual(expect.arrayContaining(["  Shade  "]));
  });

  it("removes a person by id", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    expect(await team.removeTeamMember(ID)).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("delete from team_members");
  });

  it("refuses a bad id without touching the database", async () => {
    expect(await team.removeTeamMember("nope")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });

  it("says false when the person was already gone", async () => {
    sql.mockResolvedValue([]);
    expect(await team.removeTeamMember(ID)).toBe(false);
  });
});
