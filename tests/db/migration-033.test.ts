import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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
  it("no migration resets Contacted jobs any more (migrate.mjs re-runs every file)", () => {
    for (const file of STATUS_FILES) expect(flat(file), file).not.toMatch(/update leads set status = 'new' where status = 'contacted'/);
  });
});
