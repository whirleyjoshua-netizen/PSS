import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FILE = "db/migrations/016_project_page.sql";

const statements = readFileSync(FILE, "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

const all = statements.join(" ");

describe("migration 016", () => {
  it("creates the project number sequence starting at 1001, leaving an existing one alone", () => {
    expect(all).toContain("create sequence if not exists project_no_seq start with 1001");
  });

  it("adds project_no to leads", () => {
    expect(all).toContain("alter table leads add column if not exists project_no integer");
  });

  it("backfills only rows without a number, so a second run renumbers nothing", () => {
    const backfill = statements.find((s) => s.startsWith("update leads set project_no"));
    expect(backfill).toBe("update leads set project_no = nextval('project_no_seq') where project_no is null");
  });

  it("gives new rows their number by default", () => {
    expect(all).toContain("alter table leads alter column project_no set default nextval('project_no_seq')");
  });

  it("keeps project numbers unique", () => {
    expect(all).toContain("create unique index if not exists leads_project_no_key on leads (project_no)");
  });

  it("adds doc_type to job_files", () => {
    expect(all).toContain("alter table job_files add column if not exists doc_type text");
  });

  it("drops then re-adds the doc_type check, allowing null or the four labels", () => {
    expect(all).toContain("alter table job_files drop constraint if exists job_files_doc_type_check");
    expect(all).toContain("check ( doc_type is null or doc_type in ('quote','po','invoice','other') )");
    const dropAt = statements.findIndex((s) => s.includes("drop constraint if exists job_files_doc_type_check"));
    const addAt = statements.findIndex((s) => s.includes("add constraint job_files_doc_type_check"));
    expect(dropAt).toBeGreaterThanOrEqual(0);
    expect(addAt).toBeGreaterThan(dropAt);
  });

  it("adds the column before the backfill, and the default after it", () => {
    const addAt = statements.findIndex((s) => s.includes("add column if not exists project_no"));
    const seqAt = statements.findIndex((s) => s.includes("create sequence if not exists project_no_seq"));
    const fillAt = statements.findIndex((s) => s.startsWith("update leads set project_no"));
    const defaultAt = statements.findIndex((s) => s.includes("alter column project_no set default"));
    expect(seqAt).toBeLessThan(addAt);
    expect(addAt).toBeLessThan(fillAt);
    expect(fillAt).toBeLessThan(defaultAt);
  });

  it("is re-runnable", () => {
    for (const s of statements) {
      expect(s).toMatch(
        /^(create sequence if not exists|create unique index if not exists|alter table (leads|job_files) (add column if not exists|alter column|drop constraint if exists|add constraint)|update leads set project_no = nextval\('project_no_seq'\) where project_no is null)/,
      );
    }
  });

  it("keeps comments to whole lines, with no semicolons inside them", () => {
    for (const line of readFileSync(FILE, "utf8").split("\n")) {
      if (line.includes("--")) {
        expect(line.trim().startsWith("--")).toBe(true);
        expect(line).not.toContain(";");
      }
    }
  });
});
