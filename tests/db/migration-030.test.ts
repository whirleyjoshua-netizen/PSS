import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ALL_STAGES } from "@/lib/admin/stages";

const source = readFileSync("db/migrations/030_deposit_flow.sql", "utf8");
const statements = source.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const find = (text: string) => statements.find((s) => s.includes(text));
const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(",");
/** A migration file with comments removed and whitespace folded, so a list can be found whatever its line breaks. */
const flat = (file: string) => readFileSync(`db/migrations/${file}`, "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").replace(/\s+/g, " ");

const KINDS = ["stage", "note", "edit", "email", "reward", "measure", "file", "contact", "message", "service", "signature", "quote", "document", "payment"];
const STATUS_FILES = ["002_job_tracker.sql", "011_stages_contact_log.sql", "012_completed_stage.sql", "030_deposit_flow.sql"];
const KIND_FILES = ["003_measure_and_files.sql", "004_referrals_reviews.sql", "011_stages_contact_log.sql", "019_service_requests.sql",
  "021_contract_signing.sql", "024_dc_quote_import.sql", "026_documents.sql", "030_deposit_flow.sql"];
const VERSION_STATUSES = "status in ('draft','offered','sent','signed','superseded','cancelled')";

describe("migration 030", () => {
  it("never puts a semicolon inside a comment", () => {
    for (const line of source.split("\n")) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });

  it("is re-runnable: every statement creates if missing, adds a column if missing, or drops before it adds", () => {
    for (const s of statements) {
      expect(s).toMatch(/^(create table if not exists|create (unique )?index if not exists|alter table \w+ (drop constraint if exists|add constraint|add column if not exists))/);
    }
  });

  it("allows every stage the app has, in the app's order, in all four files that define the check", () => {
    expect(ALL_STAGES).toEqual(["new", "visit_booked", "quoted", "approved", "signed", "sold", "measure", "ordered", "installed", "completed", "lost"]);
    for (const file of STATUS_FILES) expect(flat(file), file).toContain(`status in (${list(ALL_STAGES)})`);
  });

  it("adds payment to the kind check in every file that lists the kinds, keeping document", () => {
    for (const file of KIND_FILES) expect(flat(file), file).toContain(`kind in (${list(KINDS)})`);
    // 002 declares it inline on the table; it only runs on an empty database, and still lists the whole set.
    expect(flat("002_job_tracker.sql")).toContain(`check (kind in (${list(KINDS)}))`);
  });

  it("lets a DC version be offered and cancelled, in 024's table and in 030's named check", () => {
    expect(flat("024_dc_quote_import.sql")).toContain(`check (${VERSION_STATUSES})`);
    const drop = statements.indexOf("alter table dc_quote_versions drop constraint if exists dc_quote_versions_status_check");
    const add = statements.indexOf(`alter table dc_quote_versions add constraint dc_quote_versions_status_check check ( ${VERSION_STATUSES} )`);
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  it("allows one offered version per job, checked when the statement commits", () => {
    const drop = statements.indexOf("alter table dc_quote_versions drop constraint if exists dc_quote_versions_one_offered");
    const add = statements.indexOf(
      "alter table dc_quote_versions add constraint dc_quote_versions_one_offered exclude using btree (lead_id with =) where (status = 'offered') deferrable initially deferred",
    );
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  it("adds the quote file and the offer, approval and cancellation stamps", () => {
    for (const column of [
      "quote_file_id uuid references job_files(id) on delete set null", "offered_at timestamptz", "offered_by text",
      "approved_at timestamptz", "approved_by text", "cancelled_at timestamptz",
    ]) expect(statements).toContain(`alter table dc_quote_versions add column if not exists ${column}`);
  });

  it("creates deposits with the spec's columns", () => {
    const table = find("create table if not exists deposits")!;
    for (const column of [
      "id uuid primary key default gen_random_uuid()", "lead_id uuid not null references leads(id) on delete cascade",
      "dc_quote_version_id uuid not null references dc_quote_versions(id)", "amount_cents integer not null",
      "method text not null", "status text not null", "stripe_session_id text unique", "stripe_payment_intent_id text",
      "recorded_by text", "created_at timestamptz not null default now()", "paid_at timestamptz", "refunded_at timestamptz",
    ]) expect(table).toContain(column);
  });

  it("names every deposits check and drops each before adding it", () => {
    const checks: Record<string, string> = {
      deposits_method_check: "check ( method in ('stripe','check','cash','other') )",
      deposits_status_check: "check ( status in ('pending','paid','refunded','expired') )",
      deposits_amount_check: "check ( amount_cents > 0 )",
      deposits_paid_at_check: "check ( status not in ('paid','refunded') or paid_at is not null )",
    };
    for (const [name, body] of Object.entries(checks)) {
      const drop = statements.indexOf(`alter table deposits drop constraint if exists ${name}`);
      const add = statements.indexOf(`alter table deposits add constraint ${name} ${body}`);
      expect(drop, name).toBeGreaterThanOrEqual(0);
      expect(add, name).toBeGreaterThan(drop);
    }
  });

  it("allows one paid and one pending deposit per version", () => {
    expect(statements).toContain("create unique index if not exists deposits_one_paid_per_version on deposits (dc_quote_version_id) where status = 'paid'");
    expect(statements).toContain("create unique index if not exists deposits_one_pending_per_version on deposits (dc_quote_version_id) where status = 'pending'");
  });
});
