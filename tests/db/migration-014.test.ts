import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const statements = readFileSync("db/migrations/014_appointments.sql", "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

const all = statements.join(" ");

describe("migration 014", () => {
  it("creates the appointments table if missing", () => {
    expect(statements[0]).toMatch(/^create table if not exists appointments \(/);
    expect(statements[0]).toContain("id uuid primary key default gen_random_uuid()");
    expect(statements[0]).toContain("lead_id uuid not null references leads(id) on delete cascade");
    expect(statements[0]).toContain("starts_at timestamptz not null");
    expect(statements[0]).toContain("all_day boolean not null default false");
    expect(statements[0]).toContain("confirmed_at timestamptz");
    expect(statements[0]).toContain("confirmed_by text");
  });

  it("drops then re-adds the kind check with the four kinds", () => {
    expect(all).toContain("alter table appointments drop constraint if exists appointments_kind_check");
    expect(all).toContain("check ( kind in ('consultation','measure','install','service') )");
    const dropAt = statements.findIndex((s) => s.includes("drop constraint if exists appointments_kind_check"));
    const addAt = statements.findIndex((s) => s.includes("add constraint appointments_kind_check"));
    expect(dropAt).toBeGreaterThanOrEqual(0);
    expect(addAt).toBeGreaterThan(dropAt);
  });

  it("allows one appointment per job per kind", () => {
    expect(all).toContain("create unique index if not exists appointments_lead_kind_key on appointments (lead_id, kind)");
  });

  it("backfills the visit and install dates as confirmed appointments, inserting nothing on a re-run", () => {
    const inserts = statements.filter((s) => s.startsWith("insert into appointments"));
    expect(inserts).toHaveLength(2);
    for (const insert of inserts) {
      expect(insert).toContain("not exists (select 1 from appointments a where a.lead_id = l.id");
      expect(insert).toContain("confirmed_at");
    }
    expect(inserts[0]).toContain("'consultation'");
    expect(inserts[0]).toContain("visit_at is not null");
    expect(inserts[1]).toContain("'install'");
    expect(inserts[1]).toContain("install_on is not null");
    expect(inserts[1]).toContain("America/Los_Angeles");
  });

  it("is re-runnable", () => {
    for (const s of statements) {
      expect(s).toMatch(
        /^(create table if not exists|create unique index if not exists|alter table appointments (drop constraint if exists|add constraint)|insert into appointments)/,
      );
    }
  });

  it("keeps comments to whole lines, with no semicolons inside them", () => {
    for (const line of readFileSync("db/migrations/014_appointments.sql", "utf8").split("\n")) {
      if (line.includes("--")) {
        expect(line.trim().startsWith("--")).toBe(true);
        expect(line).not.toContain(";");
      }
    }
  });
});
