import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
  env[m[1]] = v;
}

const sql = neon(env.POSTGRES_URL ?? env.DATABASE_URL);
const rows = await sql`select * from leads order by created_at desc limit 5`;
console.log(`${rows.length} lead(s):\n`);
for (const r of rows) {
  console.log(JSON.stringify(r, null, 2));
}
