import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const source = readFileSync("db/migrations/040_quote_options.sql", "utf8");
const statements = source
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("migration 040", () => {
  it("has whole-line comments only, and never a semicolon in one", () => {
    for (const line of source.split("\n")) {
      if (line.trim().startsWith("--")) expect(line).not.toContain(";");
      else expect(line).not.toContain("--");
    }
  });

  it("is exactly these re-runnable statements, in this order", () => {
    expect(statements).toEqual([
      "create table if not exists quote_options ( lead_id uuid not null references leads(id) on delete cascade, letter text not null, created_by text not null, created_at timestamptz not null default now(), primary key (lead_id, letter) )",
      "alter table quote_options drop constraint if exists quote_options_letter_check",
      "alter table quote_options add constraint quote_options_letter_check check ( letter ~ '^[B-Z]$' )",
      "alter table dc_quote_versions add column if not exists option text not null default 'A'",
      "alter table dc_quote_versions drop constraint if exists dc_quote_versions_option_check",
      "alter table dc_quote_versions add constraint dc_quote_versions_option_check check ( option ~ '^[A-Z]$' )",
      "alter table dc_quote_versions drop constraint if exists dc_quote_versions_lead_id_version_key",
      "alter table dc_quote_versions drop constraint if exists dc_quote_versions_lead_option_version_key",
      "alter table dc_quote_versions add constraint dc_quote_versions_lead_option_version_key unique (lead_id, option, version)",
      "alter table dc_quote_versions drop constraint if exists dc_quote_versions_one_offered",
      "alter table dc_quote_versions add constraint dc_quote_versions_one_offered exclude using btree (lead_id with =, option with =) where (status = 'offered') deferrable initially deferred",
    ]);
  });

  it("is the only migration that defines the one-offered rule, so no older file can put the per-job rule back on a re-run", () => {
    const files = readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort();
    const defining = files.filter((file) => readFileSync(`db/migrations/${file}`, "utf8").split("\n")
      .some((line) => !line.trim().startsWith("--") && line.includes("dc_quote_versions_one_offered")));
    expect(defining).toEqual(["040_quote_options.sql"]);
  });
});
