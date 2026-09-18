import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FILE = "db/migrations/021_contract_signing.sql";

const source = readFileSync(FILE, "utf8");

const statements = source
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

const all = statements.join(" ");

describe("migration 021", () => {
  // The failure this pins is a NARROWED constraint: re-adding it without a doc type
  // an earlier migration allowed breaks writes on a live table.
  it("re-adds the doc_type check with every existing type plus contract", () => {
    const check = statements.find((s) => s.includes("add constraint job_files_doc_type_check"));
    expect(check).toBeDefined();
    for (const type of ["quote", "po", "invoice", "other", "contract"]) {
      expect(check).toContain(`'${type}'`);
    }
    expect(check).toContain("doc_type is null or");
  });

  // Same failure on the other constraint: 019's list is the floor, never the ceiling.
  it("re-adds the kind check with every existing kind plus signature", () => {
    const check = statements.find((s) => s.includes("add constraint job_events_kind_check"));
    expect(check).toBeDefined();
    for (const kind of [
      "stage", "note", "edit", "email", "reward", "measure", "file", "contact", "message", "service", "signature",
    ]) {
      expect(check).toContain(`'${kind}'`);
    }
  });

  it("drops each old constraint first, or the re-add fails on an existing database", () => {
    for (const name of ["job_files_doc_type_check", "job_events_kind_check"]) {
      expect(all).toContain(`drop constraint if exists ${name}`);
      const dropAt = statements.findIndex((s) => s.includes(`drop constraint if exists ${name}`));
      const addAt = statements.findIndex((s) => s.includes(`add constraint ${name}`));
      expect(dropAt).toBeGreaterThanOrEqual(0);
      expect(addAt).toBeGreaterThan(dropAt);
    }
  });

  it("creates contract_signatures with every column the evidence depends on", () => {
    const table = statements.find((s) => s.includes("create table if not exists contract_signatures"));
    expect(table).toBeDefined();
    expect(table).toContain("id uuid primary key");
    expect(table).toContain("lead_id uuid not null references leads(id) on delete cascade");
    expect(table).toContain("signed_name text not null");
    expect(table).toContain("signed_email text not null");
    expect(table).toContain("signed_at timestamptz not null default now()");
    expect(table).toContain("ip text");
    expect(table).toContain("user_agent text");
    // The fingerprint of the bytes served is what proves which version was agreed to.
    expect(table).toContain("doc_sha256 text not null");
    // Nullable: the signature stands even when stamping failed.
    expect(table).toMatch(/signed_file_id uuid references job_files\(id\)(?!.*not null)/);
  });

  // Without this, a double submission writes a second signature.
  it("makes one signature per contract file, by a unique file_id", () => {
    const table = statements.find((s) => s.includes("create table if not exists contract_signatures"));
    expect(table).toMatch(/file_id uuid not null references job_files\(id\)[^,]*unique/);
  });

  it("indexes lead_id, so a job's signatures do not scan", () => {
    expect(all).toContain("create index if not exists contract_signatures_lead_id_idx on contract_signatures (lead_id)");
  });

  it("is re-runnable", () => {
    for (const s of statements) {
      expect(s).toMatch(
        /^(create table if not exists|create index if not exists|alter table (job_files|job_events) (drop constraint if exists|add constraint))/,
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
