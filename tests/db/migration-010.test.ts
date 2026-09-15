import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const statements = readFileSync("db/migrations/010_questionnaire.sql", "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);

describe("migration 010", () => {
  it("is only re-runnable alter/create statements", () => {
    for (const s of statements) expect(s).toMatch(/^(alter table leads (add column if not exists|drop constraint if exists|add constraint)|create unique index if not exists)/);
  });
  it("adds every questionnaire column and the hash index", () => {
    const all = statements.join("\n");
    for (const column of ["window_count_exact smallint", "treatment_types text[] not null default '{}'", "motorized boolean not null default false",
      "gate_code text", "finish text", "questionnaire_token_hash text", "questionnaire_expires_at timestamptz"]) {
      expect(all).toContain(column);
    }
    expect(all).toContain("between 1 and 31");
    expect(all).toContain("char_length(gate_code) <= 40");
    expect(all).toMatch(/on leads \(questionnaire_token_hash\) where questionnaire_token_hash is not null/);
  });
});
