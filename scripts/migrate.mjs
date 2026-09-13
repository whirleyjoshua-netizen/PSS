/**
 * Applies db/migrations/*.sql to the database in DATABASE_URL.
 *
 * Reads .env.local directly rather than relying on `node --env-file`, whose
 * parser mishandles the quoted connection strings Vercel writes.
 *
 * MIGRATE_DATABASE_URL, if set in the real environment, overrides everything
 * else — use it to target a branch database without touching .env.local:
 *   MIGRATE_DATABASE_URL=<branch url> node scripts/migrate.mjs
 *
 * Usage: node scripts/migrate.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

function loadEnv(file = ".env.local") {
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

// MIGRATE_DATABASE_URL always wins, so it can never silently fall through to
// production. Otherwise .env.local is read before process.env — see
// lib/db.ts for why a machine-wide DATABASE_URL must not win.
const env = loadEnv();
let url = process.env.MIGRATE_DATABASE_URL;
let source = "MIGRATE_DATABASE_URL";
if (!url) {
  url = env.DATABASE_URL ?? process.env.DATABASE_URL;
  source = ".env.local";
}
if (!url) throw new Error("DATABASE_URL not found in .env.local");

console.log(`Using ${source} -> ${new URL(url).host}`);

const sql = neon(url);
const dir = "db/migrations";

for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  // Strip comments before splitting, so a stray line never leads a statement.
  const statements = readFileSync(join(dir, file), "utf8")
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.query(statement);
    console.log(`  ${file}: ${statement.split("\n")[0].slice(0, 66)}`);
  }
}

const columns = await sql`
  select column_name, data_type
  from information_schema.columns
  where table_name = 'leads'
  order by ordinal_position`;

console.log("\nleads table:");
for (const column of columns) {
  console.log(`  ${column.column_name.padEnd(14)} ${column.data_type}`);
}
