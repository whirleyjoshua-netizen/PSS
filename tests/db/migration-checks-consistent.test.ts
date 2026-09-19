import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

// scripts/migrate.mjs re-applies EVERY migration file, in order, on every run. If an older
// file defines a check with a shorter list than a newer one, re-running it fails as soon as
// the table holds a row with a newer value. So every definition of a named check constraint,
// in every file, must be identical.
const DIR = "db/migrations";

const definitions = new Map<string, { file: string; body: string }[]>();
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = readFileSync(`${DIR}/${file}`, "utf8")
    .split(/\r?\n/).filter((line) => !line.trim().startsWith("--")).join("\n");
  for (const statement of sql.split(";")) {
    const match = /add\s+constraint\s+(\w+)\s+check\s*\(([\s\S]*)\)\s*$/i.exec(statement.trim());
    if (!match) continue;
    const [, name, body] = match;
    const list = definitions.get(name) ?? [];
    list.push({ file, body: body.replace(/\s+/g, " ").trim() });
    definitions.set(name, list);
  }
}

describe("check constraints defined in more than one migration", () => {
  it("finds the constraints this guard exists for", () => {
    expect(definitions.get("job_events_kind_check")?.length).toBeGreaterThan(1);
    expect(definitions.get("job_files_doc_type_check")?.length).toBeGreaterThan(1);
  });

  for (const [name, defs] of definitions) {
    if (defs.length < 2) continue;
    it(`${name} is identical in every file that defines it`, () => {
      const latest = defs[defs.length - 1];
      for (const d of defs) expect({ file: d.file, body: d.body }).toEqual({ file: d.file, body: latest.body });
    });
  }
});
