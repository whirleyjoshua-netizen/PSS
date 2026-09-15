import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("db/migrations/009_follow_ups.sql", "utf8");
const statements = sql.replace(/^\s*--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);

describe("migration 009", () => {
  it("adds the follow-up columns, a length check and a partial index, idempotently", () => {
    expect(statements).toEqual([
      "alter table leads add column if not exists follow_up_at timestamptz",
      "alter table leads add column if not exists follow_up_note text",
      "alter table leads drop constraint if exists leads_follow_up_note_check",
      "alter table leads add constraint leads_follow_up_note_check check (follow_up_note is null or char_length(follow_up_note) <= 200)",
      "create index if not exists leads_follow_up_at_idx on leads (follow_up_at) where follow_up_at is not null",
    ]);
  });
  it("has no semicolon inside a comment", () => {
    for (const line of sql.split(/\r?\n/)) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });
});
