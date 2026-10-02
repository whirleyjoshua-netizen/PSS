import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("db/migrations/037_handling_folded.sql", "utf8");
const statements = source
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("migration 037", () => {
  it("adds a nullable, non-negative handling_folded_cents, re-runnably", () => {
    expect(statements).toEqual([
      "alter table dc_quote_versions add column if not exists handling_folded_cents integer",
      "alter table dc_quote_versions drop constraint if exists dc_quote_versions_handling_folded_check",
      "alter table dc_quote_versions add constraint dc_quote_versions_handling_folded_check check ( handling_folded_cents is null or handling_folded_cents >= 0 )",
    ]);
    for (const line of source.split("\n")) if (line.includes("--")) expect(line.trim().startsWith("--")).toBe(true);
  });
});
