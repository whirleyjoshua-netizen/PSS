import { describe, it, expect } from "vitest";
import { TEAM_ROLES, isTeamRole, roleLabel } from "@/lib/admin/team-roles";

describe("team roles", () => {
  it("labels each role", () => {
    expect(roleLabel("installer")).toBe("Installer");
    expect(roleLabel("designer")).toBe("Designer");
  });

  it("recognises only the two roles", () => {
    expect(isTeamRole("designer")).toBe(true);
    expect(isTeamRole("installer")).toBe(true);
    expect(isTeamRole("owner")).toBe(false);
    expect(isTeamRole(undefined)).toBe(false);
  });

  it("offers designer and installer in order", () => {
    expect(TEAM_ROLES.map((r) => r.value)).toEqual(["designer", "installer"]);
  });
});
