import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DOC_TYPES, docTypeLabel, isDocType } from "@/lib/admin/doc-types";

describe("document types", () => {
  it("offers the four types, in order, with their labels", () => {
    expect(DOC_TYPES.map((type) => type.value)).toEqual(["quote", "po", "invoice", "other"]);
    expect(DOC_TYPES.map((type) => type.label)).toEqual(["Quote", "PO", "Invoice", "Other"]);
  });

  it("recognises the four types and nothing else", () => {
    for (const type of DOC_TYPES) expect(isDocType(type.value)).toBe(true);
    expect(isDocType("receipt")).toBe(false);
    expect(isDocType(null)).toBe(false);
    expect(isDocType(undefined)).toBe(false);
  });

  it("labels each type", () => {
    expect(docTypeLabel("quote")).toBe("Quote");
    expect(docTypeLabel("po")).toBe("PO");
    expect(docTypeLabel("invoice")).toBe("Invoice");
    expect(docTypeLabel("other")).toBe("Other");
  });

  it("matches the values the database allows", () => {
    const sql = readFileSync("db/migrations/016_project_page.sql", "utf8");
    // Scoped to the check constraint itself: a bare toContain("'quote'") would
    // pass on any unrelated occurrence elsewhere in the migration.
    const constraint = /doc_type\s+is\s+null\s+or\s+doc_type\s+in\s*\(([^)]*)\)/i.exec(sql);
    expect(constraint).not.toBeNull();
    const allowed = constraint![1].split(",").map((value) => value.trim());
    expect(allowed).toEqual(DOC_TYPES.map((type) => `'${type.value}'`));
  });

  it("imports nothing server-only, so a client component may use it", () => {
    const source = readFileSync("lib/admin/doc-types.ts", "utf8");
    const imports = source.match(/^\s*import .*$/gm) ?? [];
    expect(imports.join("\n")).not.toMatch(/server-only|@\/lib\/db/);
  });
});
