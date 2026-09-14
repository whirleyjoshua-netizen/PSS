import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("db/migrations/006_budget_tier.sql", "utf8");
const statements = sql.replace(/^\s*--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);

describe("migration 006", () => {
  it("adds the budget tier column and a check constraint, idempotently", () => {
    expect(statements).toEqual([
      "alter table leads add column if not exists budget_tier text",
      "alter table leads drop constraint if exists leads_budget_tier_check",
      "alter table leads add constraint leads_budget_tier_check check (budget_tier is null or budget_tier in ('value', 'mid', 'premium'))",
    ]);
  });
  it("has no semicolon inside a comment", () => {
    for (const line of sql.split(/\r?\n/)) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });
});
