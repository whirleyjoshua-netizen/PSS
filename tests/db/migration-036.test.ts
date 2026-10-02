import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("db/migrations/036_company_files.sql", "utf8");
const statements = source
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const all = statements.join("\n");

describe("migration 036", () => {
  it("is only re-runnable statements, with whole-line comments", () => {
    for (const s of statements) {
      expect(s).toMatch(/^(create table if not exists company_files|alter table company_files (drop constraint if exists|add constraint)|create (unique )?index if not exists)/);
    }
    for (const line of source.split("\n")) if (line.includes("--")) expect(line.trim().startsWith("--")).toBe(true);
  });

  it("drops each constraint before adding it", () => {
    for (const name of ["company_files_name_check", "company_files_category_check", "company_files_size_check", "company_files_pathname_check"]) {
      const drop = statements.findIndex((s) => s === `alter table company_files drop constraint if exists ${name}`);
      const add = statements.findIndex((s) => s.startsWith(`alter table company_files add constraint ${name} check`));
      expect(drop).toBeGreaterThanOrEqual(0);
      expect(add).toBeGreaterThan(drop);
    }
  });

  it("enforces the library's rules in the database", () => {
    expect(all).toContain("check ( name = btrim(name) and char_length(name) between 1 and 200 )");
    expect(all).toContain("check ( category = btrim(category) and char_length(category) between 1 and 60 )");
    expect(all).toContain("check (size_bytes between 1 and 209715200)");
    expect(all).toContain("split_part(blob_pathname, '/', 2) = id::text");
    expect(all).toContain("create unique index if not exists company_files_pathname_idx on company_files (blob_pathname)");
  });
});
