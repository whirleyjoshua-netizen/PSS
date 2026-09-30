import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("db/migrations/029_visible_signatures.sql", "utf8");
const statements = source.split(/\r?\n/).filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const find = (text: string) => statements.find((s) => s.includes(text));

describe("migration 029", () => {
  it("never puts a semicolon inside a comment", () => {
    for (const line of source.split(/\r?\n/)) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });
  it("never puts a semicolon inside a string literal (every statement has balanced quotes)", () => {
    for (const s of statements) expect(s.split("'").length % 2, s).toBe(1);
  });
  it("is re-runnable: every column is added if missing, every check is dropped right before it is added", () => {
    for (const s of statements) {
      expect(s).toMatch(/^alter table (job_files|contract_signatures) (add column if not exists|drop constraint if exists|add constraint) /);
    }
    for (const name of ["job_files_sign_marks_check", "contract_signatures_signature_method_check", "contract_signatures_adoption_check"]) {
      const drop = statements.findIndex((s) => s.endsWith(`drop constraint if exists ${name}`));
      const add = statements.findIndex((s) => s.includes(`add constraint ${name} check`));
      expect(drop, name).toBeGreaterThanOrEqual(0);
      expect(add, name).toBe(drop + 1);
    }
  });
  it("adds the nullable columns, none with a default", () => {
    expect(find("sign_marks jsonb")).toBe("alter table job_files add column if not exists sign_marks jsonb");
    for (const column of ["signature_method", "signed_initials", "signature_image_pathname", "initials_image_pathname"]) {
      expect(find(`if not exists ${column} `)).toBe(`alter table contract_signatures add column if not exists ${column} text`);
    }
  });
  it("keeps sign marks an object when present", () => {
    expect(find("add constraint job_files_sign_marks_check")).toBe(
      "alter table job_files add constraint job_files_sign_marks_check check ( sign_marks is null or jsonb_typeof(sign_marks) = 'object' )");
  });
  it("allows only typed or drawn, and null for signatures made before adoption existed", () => {
    expect(find("add constraint contract_signatures_signature_method_check")).toBe(
      "alter table contract_signatures add constraint contract_signatures_signature_method_check check ( signature_method is null or signature_method in ('typed','drawn') )");
  });
  it("ties the stored adoption to its method", () => {
    expect(find("add constraint contract_signatures_adoption_check")).toBe(
      "alter table contract_signatures add constraint contract_signatures_adoption_check check ( " +
      "(signature_method is null and signed_initials is null and signature_image_pathname is null and initials_image_pathname is null) " +
      "or (signature_method = 'typed' and signature_image_pathname is null and initials_image_pathname is null) " +
      "or (signature_method = 'drawn' and signature_image_pathname is not null and signed_initials is null) )");
  });
  it("redefines neither shared kind check", () => {
    expect(source).not.toMatch(/job_events_kind_check|job_files_doc_type_check/);
  });
});
