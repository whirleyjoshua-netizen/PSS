import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const statements = readFileSync("db/migrations/013_team.sql", "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("migration 013", () => {
  it("creates the team table if missing", () => {
    expect(statements[0]).toMatch(/^create table if not exists team_members \(/);
    expect(statements[0]).toContain("id uuid primary key default gen_random_uuid()");
  });

  it("allows only designer and installer, and a 1-60 character name", () => {
    expect(statements.join(" ")).toContain("check ( role in ('designer','installer') )");
    expect(statements.join(" ")).toContain("check ( length(trim(name)) between 1 and 60 )");
  });

  it("adds assigned_to that clears when a person is removed", () => {
    expect(statements.join(" ")).toContain(
      "alter table leads add column if not exists assigned_to uuid references team_members(id) on delete set null",
    );
  });

  it("is re-runnable", () => {
    for (const s of statements) {
      expect(s).toMatch(/^(create table if not exists|alter table (team_members|leads) (drop constraint if exists|add constraint|add column if not exists))/);
    }
  });
});
