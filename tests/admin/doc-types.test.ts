import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DOC_TYPES, docTypeLabel, isDocType } from "@/lib/admin/doc-types";

describe("document types", () => {
  it("offers the five types, in order, with their labels", () => {
    expect(DOC_TYPES.map((type) => type.value)).toEqual(["quote", "po", "invoice", "contract", "other"]);
    expect(DOC_TYPES.map((type) => type.label)).toEqual(["Quote", "PO", "Invoice", "Contract", "Other"]);
  });

  it("recognises the five types and nothing else", () => {
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

  it("offers Contract as a document type", () => {
    expect(DOC_TYPES.map((type) => type.value)).toContain("contract");
    expect(docTypeLabel("contract")).toBe("Contract");
    expect(isDocType("contract")).toBe(true);
  });

  it("matches the values the database allows", () => {
    // 021 is the LAST migration to define this constraint, so it is the one the
    // database ends up with; 016 defined the narrower earlier version.
    const sql = readFileSync("db/migrations/021_contract_signing.sql", "utf8");
    // Scoped to the check constraint itself: a bare toContain("'quote'") would
    // pass on any unrelated occurrence elsewhere in the migration.
    const constraint = /doc_type\s+is\s+null\s+or\s+doc_type\s+in\s*\(([^)]*)\)/i.exec(sql);
    expect(constraint).not.toBeNull();
    const allowed = constraint![1].split(",").map((value) => value.trim());
    // Compared as sets: the migration lists the values in the order they were added
    // to the database, DOC_TYPES in the order an owner should see them in the menu.
    expect([...allowed].sort()).toEqual(DOC_TYPES.map((type) => `'${type.value}'`).sort());
  });

  it("imports nothing server-only, so a client component may use it", () => {
    const source = readFileSync("lib/admin/doc-types.ts", "utf8");
    const imports = source.match(/^\s*import .*$/gm) ?? [];
    expect(imports.join("\n")).not.toMatch(/server-only|@\/lib\/db/);
  });
});
