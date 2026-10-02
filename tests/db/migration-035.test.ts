import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("db/migrations/035_designer_notes.sql", "utf8");
const statements = source.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("migration 035", () => {
  it("never puts a semicolon inside a comment", () => {
    for (const line of source.split("\n")) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });

  it("is exactly the two columns and the notes length check, every statement re-runnable", () => {
    expect(statements).toEqual([
      "alter table appointments add column if not exists designer_notes text",
      "alter table appointments drop constraint if exists appointments_designer_notes_check",
      "alter table appointments add constraint appointments_designer_notes_check check ( designer_notes is null or char_length(designer_notes) <= 2000 )",
      "alter table job_calendar_events add column if not exists body_hash text",
    ]);
  });

  it("backfills nothing and changes no existing row", () => {
    expect(source).not.toMatch(/^\s*(update|insert|delete)\b/im);
  });
});
