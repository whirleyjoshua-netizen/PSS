// tests/db/migration-032.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const statements = readFileSync("db/migrations/032_tasks.sql", "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const all = statements.join("\n");

describe("migration 032", () => {
  it("is only re-runnable statements", () => {
    for (const s of statements) {
      expect(s).toMatch(/^(create table if not exists tasks|alter table tasks (drop constraint if exists|add constraint)|create index if not exists)/);
    }
  });
  it("drops each constraint before adding it", () => {
    for (const name of ["tasks_title_check", "tasks_status_check", "tasks_assignee_normalized_check", "tasks_completed_check", "tasks_reminded_check"]) {
      const drop = statements.findIndex((s) => s === `alter table tasks drop constraint if exists ${name}`);
      const add = statements.findIndex((s) => s.startsWith(`alter table tasks add constraint ${name} check`));
      expect(drop).toBeGreaterThanOrEqual(0);
      expect(add).toBeGreaterThan(drop);
    }
  });
  it("enforces the spec's rules in the database", () => {
    expect(all).toContain("check (char_length(btrim(title)) between 1 and 200)");
    expect(all).toContain("check (status in ('todo', 'doing', 'done'))");
    expect(all).toContain("check (assignee_email is null or assignee_email = lower(btrim(assignee_email)))");
    expect(all).toContain("check ((status = 'done') = (completed_at is not null))");
    expect(all).toContain("check ((last_reminded_at is null) = (last_reminded_by is null))");
    expect(all).toContain("due_on date");
    expect(all).toContain("status text not null default 'todo'");
  });
});
