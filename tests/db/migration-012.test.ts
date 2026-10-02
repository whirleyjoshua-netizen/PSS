import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const statements = (file: string) => readFileSync(`db/migrations/${file}`, "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);

const STATUSES = "status in ('new','contacted','visit_booked','quoted','approved','signed','sold','measure','ordered','installed','completed','lost')";
const statusList = (file: string) =>
  statements(file).find((s) => s.includes("leads_status_check check"))?.replace(/\s+/g, " ");

describe("migration 012", () => {
  const all = statements("012_completed_stage.sql");

  it("allows the completed status", () => {
    expect(statusList("012_completed_stage.sql")).toContain(STATUSES);
  });

  it("is re-runnable and changes no rows", () => {
    for (const s of all) expect(s).toMatch(/^alter table leads (drop constraint if exists|add constraint) leads_status_check/);
  });

  it("keeps completed in every status list, and 002, 011 and 012 identical", () => {
    for (const file of ["002_job_tracker.sql", "011_stages_contact_log.sql", "012_completed_stage.sql"]) {
      expect(statusList(file)).toContain(STATUSES);
    }
  });
});
