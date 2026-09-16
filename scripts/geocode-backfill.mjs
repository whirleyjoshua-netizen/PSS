/**
 * Geocodes every job that has never been geocoded, storing only lat, lng,
 * geocode_status and geocoded_at. Addresses are never rewritten.
 *
 * Run once after deploying migration 017: `node scripts/geocode-backfill.mjs`. Re-running only touches jobs never geocoded.
 *
 * Env loading matches scripts/migrate.mjs: MIGRATE_DATABASE_URL wins, then .env.local.
 * GOOGLE_GEOCODING_KEY is read from .env.local, then the real environment.
 */
import { readFileSync } from "node:fs";
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

const env = loadEnv();
let url = process.env.MIGRATE_DATABASE_URL;
let source = "MIGRATE_DATABASE_URL";
if (!url) {
  url = env.DATABASE_URL ?? process.env.DATABASE_URL;
  source = ".env.local";
}
if (!url) throw new Error("DATABASE_URL not found in .env.local");
const key = env.GOOGLE_GEOCODING_KEY || process.env.GOOGLE_GEOCODING_KEY;
if (!key) throw new Error("GOOGLE_GEOCODING_KEY not found in .env.local");

console.log(`Using ${source} -> ${new URL(url).host}`);

const sql = neon(url);

const rows = await sql`select id, address, city from leads where geocoded_at is null order by created_at`;
console.log(`${rows.length} jobs to geocode`);
let ok = 0, notFound = 0, failed = 0;
for (const row of rows) {
  let status = "not_found", lat = null, lng = null;
  if (row.address?.trim()) {
    // Same request as geocodeAddress in lib/routes/geocode.ts; a .mjs script cannot import TS, so keep the two in step.
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", `${row.address.trim()}, ${row.city.trim()}, NV`);
    url.searchParams.set("components", "country:US");
    url.searchParams.set("key", key);
    try {
      const body = await (await fetch(url, { signal: AbortSignal.timeout(15_000) })).json();
      if (body.status === "OK" && body.results[0]) {
        ({ lat, lng } = body.results[0].geometry.location);
        status = "ok";
      } else if (body.status !== "ZERO_RESULTS") status = "error";
    } catch { status = "error"; }
  }
  await sql`update leads set lat = ${lat}, lng = ${lng}, geocode_status = ${status}, geocoded_at = now() where id = ${row.id}`;
  if (status === "ok") ok++;
  else if (status === "not_found") notFound++;
  else failed++;
  await new Promise((r) => setTimeout(r, 60));
}
console.log(`ok ${ok}, not found ${notFound}, errors ${failed}`);
