import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("db/migrations/038_install_folded.sql", "utf8");
const statements = source
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("migration 038", () => {
  it("adds a nullable, non-negative install_folded_cents, re-runnably", () => {
    expect(statements).toEqual([
      "alter table dc_quote_versions add column if not exists install_folded_cents integer",
      "alter table dc_quote_versions drop constraint if exists dc_quote_versions_install_folded_check",
      "alter table dc_quote_versions add constraint dc_quote_versions_install_folded_check check ( install_folded_cents is null or install_folded_cents >= 0 )",
    ]);
    for (const line of source.split("\n")) if (line.includes("--")) expect(line.trim().startsWith("--")).toBe(true);
  });
});
