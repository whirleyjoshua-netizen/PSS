import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Mirrors scripts/migrate.mjs's own parsing exactly: strip full comment
// lines, split on ";", trim, drop empties.
function parseStatements(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const sqlText = readFileSync(
  join(process.cwd(), "db/migrations/005_customer_portal.sql"),
  "utf8",
);

describe("005_customer_portal.sql: portal_auto_invite", () => {
  it("includes the five portal_auto_invite statements in order", () => {
    const statements = parseStatements(sqlText);
    const expected = [
      "alter table leads add column if not exists portal_auto_invite boolean",
      "update leads set portal_auto_invite = false where portal_auto_invite is null and status in ('quoted', 'sold', 'ordered', 'installed')",
      "update leads set portal_auto_invite = true where portal_auto_invite is null",
      "alter table leads alter column portal_auto_invite set default true",
      "alter table leads alter column portal_auto_invite set not null",
    ];
    const indices = expected.map((statement) => statements.indexOf(statement));
    for (const index of indices) expect(index).toBeGreaterThanOrEqual(0);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it("uses 'if not exists' on every added column", () => {
    const statements = parseStatements(sqlText);
    for (const statement of statements) {
      if (/^alter table .* add column/i.test(statement)) {
        expect(statement).toMatch(/add column if not exists/i);
      }
    }
  });

  it("has no comment line containing a semicolon", () => {
    const commentLines = sqlText
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("--"));
    for (const line of commentLines) expect(line).not.toContain(";");
  });
});
