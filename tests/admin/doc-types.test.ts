import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DEALER_COPY, DOC_TYPES, docTypeLabel, isDocType, storedDocTypeLabel } from "@/lib/admin/doc-types";

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
    // 024 is the LAST migration to define this constraint, so it is the one the
    // database ends up with (every earlier definition is kept identical to it).
    const sql = readFileSync("db/migrations/024_dc_quote_import.sql", "utf8");
    // Scoped to the check constraint itself: a bare toContain("'quote'") would
    // pass on any unrelated occurrence elsewhere in the migration.
    const constraint = /doc_type\s+is\s+null\s+or\s+doc_type\s+in\s*\(([^)]*)\)/i.exec(sql);
    expect(constraint).not.toBeNull();
    const allowed = constraint![1].split(",").map((value) => value.trim());
    // Compared as sets: the migration lists the values in the order they were added
    // to the database, DOC_TYPES in the order an owner should see them in the menu.
    // The database also allows the Dealer Copy, which only the import ever stores.
    const stored = [...DOC_TYPES.map((type) => type.value), DEALER_COPY];
    expect([...allowed].sort()).toEqual(stored.map((value) => `'${value}'`).sort());
  });

  it("never offers the Dealer Copy in the owner's menu, but labels it as internal", () => {
    expect(isDocType(DEALER_COPY)).toBe(false);
    expect(DOC_TYPES.map((type) => type.value)).not.toContain(DEALER_COPY);
    expect(storedDocTypeLabel(DEALER_COPY)).toBe("Dealer copy (internal)");
    expect(storedDocTypeLabel("quote")).toBe("Quote");
  });

  it("imports nothing server-only, so a client component may use it", () => {
    const source = readFileSync("lib/admin/doc-types.ts", "utf8");
    const imports = source.match(/^\s*import .*$/gm) ?? [];
    expect(imports.join("\n")).not.toMatch(/server-only|@\/lib\/db/);
  });
});
