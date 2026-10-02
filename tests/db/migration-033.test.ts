import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { ALL_STAGES } from "@/lib/admin/stages";

const flat = (file: string) => readFileSync(`db/migrations/${file}`, "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").replace(/\s+/g, " ");
const statements = (file: string) => flat(file).split(";").map((s) => s.trim()).filter(Boolean);
const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(",");
const STATUS_FILES = ["002_job_tracker.sql", "011_stages_contact_log.sql", "012_completed_stage.sql", "030_deposit_flow.sql", "033_contacted_stage.sql"];

describe("migration 033", () => {
  it("is only a re-runnable redefinition of the stage check", () => {
    const all = statements("033_contacted_stage.sql");
    expect(all).toEqual([
      "alter table leads drop constraint if exists leads_status_check",
      `alter table leads add constraint leads_status_check check ( status in (${list(ALL_STAGES)}) )`,
    ]);
  });
  it("puts contacted after new, and every file that defines the check lists the same full set", () => {
    expect(ALL_STAGES.slice(0, 3)).toEqual(["new", "contacted", "visit_booked"]);
    for (const file of STATUS_FILES) expect(flat(file), file).toContain(`status in (${list(ALL_STAGES)})`);
  });
  it("no migration rewrites any job's stage (migrate.mjs re-runs every file, so it would undo live moves)", () => {
    const files = readdirSync("db/migrations").filter((file) => file.endsWith(".sql"));
    expect(files).toEqual(expect.arrayContaining(STATUS_FILES));
    for (const file of files) expect(flat(file), file).not.toMatch(/update\s+leads\s+set\s+status\b/i);
  });
});
