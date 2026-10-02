import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const statements = (file: string) => readFileSync(`db/migrations/${file}`, "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);

const KINDS = "kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document','payment')";
const kindList = (file: string) =>
  statements(file).find((s) => s.includes("job_events_kind_check check"))?.replace(/\s+/g, " ");

describe("migration 011", () => {
  const all = statements("011_stages_contact_log.sql");

  it("changes no rows (migrate.mjs re-runs it), and its stage check lists the full set including Contacted", () => {
    expect(all.some((s) => /^update leads/.test(s))).toBe(false);
    const check = all.find((s) => s.includes("add constraint leads_status_check"));
    expect(check?.replace(/\s+/g, " ")).toContain("status in ('new','contacted','visit_booked','quoted','approved','signed','sold','measure','ordered','installed','completed','lost')");
  });

  it("is re-runnable", () => {
    for (const s of all) expect(s).toMatch(/^(alter table (leads|job_events) (drop constraint if exists|add constraint))/);
  });

  it("lists the full current kind set, identically in 003, 004 and 011", () => {
    for (const file of ["003_measure_and_files.sql", "004_referrals_reviews.sql", "011_stages_contact_log.sql"]) {
      expect(kindList(file)).toContain(KINDS);
    }
  });
});
