import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FILE = "db/migrations/019_service_requests.sql";

const source = readFileSync(FILE, "utf8");

const statements = source
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

const all = statements.join(" ");

describe("migration 019", () => {
  it("adds parent_job_id idempotently, as a real reference", () => {
    expect(all).toContain("alter table leads add column if not exists parent_job_id uuid references leads(id)");
  });

  it("indexes it, so the parent lookup does not scan", () => {
    expect(all).toContain("create index if not exists leads_parent_job_id_idx on leads (parent_job_id)");
  });

  // The failure this pins is a NARROWED constraint: re-adding it without a kind that an
  // earlier migration added breaks inserts on a live table.
  it("re-adds the kind check with every existing kind plus the two new ones", () => {
    const check = statements.find((s) => s.includes("add constraint job_events_kind_check"));
    expect(check).toBeDefined();
    for (const kind of ["stage", "note", "edit", "email", "reward", "measure", "file", "contact", "message", "service"]) {
      expect(check).toContain(`'${kind}'`);
    }
  });

  it("drops the old constraint first, or the re-add fails on an existing database", () => {
    expect(all).toContain("drop constraint if exists job_events_kind_check");
    const dropAt = statements.findIndex((s) => s.includes("drop constraint if exists job_events_kind_check"));
    const addAt = statements.findIndex((s) => s.includes("add constraint job_events_kind_check"));
    expect(dropAt).toBeGreaterThanOrEqual(0);
    expect(addAt).toBeGreaterThan(dropAt);
  });

  it("is re-runnable", () => {
    for (const s of statements) {
      expect(s).toMatch(
        /^(create index if not exists|alter table (leads|job_events) (add column if not exists|drop constraint if exists|add constraint))/,
      );
    }
  });

  it("keeps comments to whole lines, with no semicolons inside them", () => {
    for (const line of source.split("\n")) {
      if (line.includes("--")) {
        expect(line.trim().startsWith("--")).toBe(true);
        expect(line).not.toContain(";");
      }
    }
  });
});
