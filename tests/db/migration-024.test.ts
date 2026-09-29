import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("db/migrations/024_dc_quote_import.sql", "utf8");
const statements = source.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const find = (text: string) => statements.find((s) => s.includes(text));

describe("migration 024", () => {
  it("never puts a semicolon inside a comment (migrate.mjs splits on ;)", () => {
    for (const line of source.split("\n")) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });
  it("adds dealer_copy to the doc_type check, keeping every earlier type", () => {
    const check = find("add constraint job_files_doc_type_check");
    for (const t of ["quote", "po", "invoice", "other", "contract", "dealer_copy"]) expect(check).toContain(`'${t}'`);
  });
  it("adds quote to the kind check, keeping every earlier kind", () => {
    const check = find("add constraint job_events_kind_check");
    for (const k of ["stage", "note", "edit", "email", "reward", "measure", "file", "contact", "message", "service", "signature", "quote"]) {
      expect(check).toContain(`'${k}'`);
    }
  });
  it("makes the database refuse to share a Dealer Copy", () => {
    expect(find("add constraint job_files_dealer_copy_never_shared")).toContain("doc_type is distinct from 'dealer_copy' or shared_at is null");
  });
  it("drops every constraint before re-adding it", () => {
    for (const name of ["job_files_doc_type_check", "job_events_kind_check", "job_files_dealer_copy_never_shared"]) {
      const drop = statements.findIndex((s) => s.includes(`drop constraint if exists ${name}`));
      const add = statements.findIndex((s) => s.includes(`add constraint ${name}`));
      expect(drop).toBeGreaterThanOrEqual(0);
      expect(add).toBeGreaterThan(drop);
    }
  });
  it("keys the message log on the RFC Message-ID and limits outcomes", () => {
    const table = find("create table if not exists ingested_messages");
    expect(table).toContain("message_id text primary key");
    expect(table).toContain("'imported','unchanged','no-po','no-match','no-costs','incomplete','unreadable','failed'");
  });
  it("numbers versions per job, uniquely", () => {
    expect(find("create table if not exists dc_quote_versions")).toContain("unique (lead_id, version)");
  });
  it("allows at most one sent version per contract file, keeping the plain lookup index", () => {
    expect(find("create unique index if not exists dc_quote_versions_sent_contract_key")).toBe(
      "create unique index if not exists dc_quote_versions_sent_contract_key on dc_quote_versions (contract_file_id) where status = 'sent' and contract_file_id is not null",
    );
    expect(find("create index if not exists dc_quote_versions_contract_idx")).toContain("(contract_file_id)");
  });
  it("stores money as integer cents", () => {
    const lines = find("create table if not exists dc_quote_lines")!;
    for (const c of ["msrp_unit_cents integer not null", "cost_unit_cents integer not null", "cost_extended_cents integer not null"]) {
      expect(lines).toContain(c);
    }
  });
  it("sets the poll mark when it seeds dc_settings, so the first run never imports older test copies", () => {
    const seed = statements.findIndex((s) => s.startsWith("insert into dc_settings"));
    const mark = statements.findIndex((s) => s === "update dc_settings set last_polled_at = now() where last_polled_at is null");
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(mark).toBe(seed + 1);
  });
  it("stores the DC client name on each version, also on a database that already has the table", () => {
    expect(find("create table if not exists dc_quote_versions")).toContain("client_name text not null default ''");
    expect(statements).toContain("alter table dc_quote_versions add column if not exists client_name text not null default ''");
  });
});
