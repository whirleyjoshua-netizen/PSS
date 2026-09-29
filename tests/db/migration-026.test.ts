import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CLIENT_DOC_KINDS, SINGLETON_KINDS, TEMPLATE_KINDS } from "@/lib/docs/kinds";

const source = readFileSync("db/migrations/026_documents.sql", "utf8");
const statements = source.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const find = (text: string) => statements.find((s) => s.includes(text));
const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(",");
const KINDS = "'stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document'";

describe("migration 026", () => {
  it("never puts a semicolon inside a comment", () => {
    for (const line of source.split("\n")) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });
  it("never puts a semicolon inside a string literal (every statement has balanced quotes)", () => {
    for (const s of statements) expect(s.split("'").length % 2, s).toBe(1);
  });
  it("is re-runnable: every statement creates if missing, or drops before it adds", () => {
    for (const s of statements) {
      expect(s).toMatch(/^(create table if not exists|create (unique )?index if not exists|alter table job_events (drop constraint if exists|add constraint))/);
    }
  });
  it("allows exactly the app's template kinds and responses, view-only for terms and guides", () => {
    const table = find("create table if not exists document_templates")!;
    expect(table).toContain(`kind in (${list(TEMPLATE_KINDS.map((k) => k.value))})`);
    expect(table).toContain("response in ('sign','acknowledge','view')");
    expect(table).toContain(`check (kind not in (${list(SINGLETON_KINDS)}) or response = 'view')`);
  });
  it("allows at most one live terms or guide template", () => {
    expect(find("document_templates_one_live_singleton")).toBe(
      `create unique index if not exists document_templates_one_live_singleton on document_templates (kind) where archived_at is null and kind in (${list(SINGLETON_KINDS)})`,
    );
  });
  it("keeps job documents to client kinds and four statuses, with a file once sent", () => {
    const table = find("create table if not exists job_documents")!;
    expect(table).toContain("lead_id uuid not null references leads(id) on delete cascade");
    expect(table).toContain("template_id uuid references document_templates(id) on delete set null");
    expect(table).toContain(`kind in (${list(CLIENT_DOC_KINDS)})`);
    expect(table).toContain("status in ('draft','sent','completed','void')");
    expect(table).toContain("check (status = 'draft' or file_id is not null)");
    expect(find("job_documents_file_key")).toBe(
      "create unique index if not exists job_documents_file_key on job_documents (file_id) where file_id is not null",
    );
  });
  it("keeps one fingerprinted acknowledgement per file", () => {
    const table = find("create table if not exists document_acknowledgements")!;
    expect(table).toContain("file_id uuid not null references job_files(id) unique");
    expect(table).toContain("doc_sha256 text not null");
    expect(table).toContain("lead_id uuid not null references leads(id) on delete cascade");
  });
  it("adds document to the kind check, keeping every earlier kind, after dropping it", () => {
    const drop = statements.indexOf("alter table job_events drop constraint if exists job_events_kind_check");
    const add = statements.findIndex((s) => s.startsWith("alter table job_events add constraint job_events_kind_check"));
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
    expect(statements[add]).toBe(`alter table job_events add constraint job_events_kind_check check ( kind in (${KINDS}) )`);
  });
  it("stores no money", () => expect(source).not.toMatch(/cents|numeric/));
});
