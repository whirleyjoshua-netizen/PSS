import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const statements = (file: string) => readFileSync(`db/migrations/${file}`, "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);

const KINDS = "kind in ('stage','note','edit','email','reward','measure','file','contact')";
const kindList = (file: string) =>
  statements(file).find((s) => s.includes("job_events_kind_check check"))?.replace(/\s+/g, " ");

describe("migration 011", () => {
  const all = statements("011_stages_contact_log.sql");

  it("moves any Contacted job back to New before narrowing the stage check", () => {
    const move = all.findIndex((s) => /update leads set status = 'new' where status = 'contacted'/.test(s));
    const check = all.findIndex((s) => s.includes("add constraint leads_status_check"));
    expect(move).toBeGreaterThanOrEqual(0);
    expect(check).toBeGreaterThan(move);
    expect(all[check]).toContain("status in ('new','visit_booked','quoted','sold','ordered','installed','completed','lost')");
    expect(all[check]).not.toContain("contacted");
  });

  it("is re-runnable", () => {
    for (const s of all) expect(s).toMatch(/^(update leads set|alter table (leads|job_events) (drop constraint if exists|add constraint))/);
  });

  it("allows the contact kind, identically in 003, 004 and 011", () => {
    for (const file of ["003_measure_and_files.sql", "004_referrals_reviews.sql", "011_stages_contact_log.sql"]) {
      expect(kindList(file)).toContain(KINDS);
    }
  });
});
