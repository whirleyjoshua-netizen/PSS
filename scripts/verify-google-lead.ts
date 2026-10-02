/**
 * Behavioural proof of the Google lead form's SQL: insertGoogleLead (lib/leads/google-lead-db.ts) and
 * migration 039.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand, is in no suite, and CI does not run it. If you
 * change lib/leads/google-lead-db.ts or migration 039, run it yourself, or say the lead form's SQL is
 * unverified. The unit tests mock the database, so they pin the SQL's text only.
 *
 * What it does, against a throwaway database:
 *   1. applies migration 039, twice (re-runnable);
 *   2. insertGoogleLead with a fresh google_lead_id answers the id, and the stored row has
 *      source 'google_form', heard_via 'Google lead form', utm google/cpc, the google_lead_id, the
 *      gclid, the ZIP as the address, a null email and a click time;
 *   3. a second insertGoogleLead with the same google_lead_id (Google resending) answers null and
 *      stores no second row;
 *   4. a raw insert of a second row with that google_lead_id THROWS (the unique index);
 *   5. the index is partial (its definition carries WHERE google_lead_id IS NOT NULL), and two raw
 *      inserts with a NULL google_lead_id both succeed.
 * It deletes its rows, so repeated runs leave nothing behind.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. It takes its connection from E2E_POSTGRES_URL alone and
 * refuses production (ep-cold-term).
 *
 * Usage: E2E_POSTGRES_URL='<neon test branch url>' npx vitest run --config scripts/verify-google-lead.config.mts --disableConsoleIntercept
 *   (without the flag, vitest hides a passing test's "ok" lines)
 *
 * To watch it fail: delete the `on conflict ... do nothing` line in insertGoogleLead (step 3 throws
 * the unique-index error), or on a fresh branch delete the unique index from migration 039 (step 3
 * answers an id and step 4 fails), or drop its `where google_lead_id is not null` (step 5 fails).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { test } from "vitest";

const FORBIDDEN_HOSTS = ["ep-cold-term"];
function refuse(reason: string): never {
  console.error(`\n================ verify-google-lead REFUSED TO RUN ================\n${reason}\n`);
  throw new Error(`verify-google-lead refused to run: ${reason}`);
}
const url = process.env.E2E_POSTGRES_URL;
if (!url) refuse("E2E_POSTGRES_URL is not set. This script WRITES rows: give it a Neon test branch, never production.");
const host = (() => { try { return new URL(url).host; } catch { return refuse("E2E_POSTGRES_URL is not a valid URL."); } })();
for (const forbidden of FORBIDDEN_HOSTS) if (host.includes(forbidden)) refuse(`E2E_POSTGRES_URL points at production (${forbidden}).`);
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;

// Imported only after DATABASE_URL points at the test branch.
const { insertGoogleLead } = await import("../lib/leads/google-lead-db");

const sql = neon(url);
const RUN = `verify-google-lead-${Date.now()}`;

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
async function throwsWith(run: () => Promise<unknown>): Promise<string | null> {
  try { await run(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
}
async function migrate() {
  const statements = readFileSync("db/migrations/039_google_lead_id.sql", "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) await sql.query(statement);
}
const rawInsert = (id: string, googleLeadId: string | null) => sql`
  insert into leads (id, name, phone, city, source, google_lead_id)
  values (${id}, 'Verify Raw', '7025550100', 'Las Vegas', 'google_form', ${googleLeadId})`;

test("Google lead form insert against a real database", async () => {
  console.log(`\nverify-google-lead: writing to ${host}\n`);
  await migrate();
  await migrate();
  check(true, "migration 039 applies, and re-applies", "");
  const ids: string[] = [];
  try {
    const googleLeadId = `${RUN}-${randomUUID()}`;
    const gclid = `gclid-${randomUUID()}`;
    const a = randomUUID(); ids.push(a);
    const lead = {
      id: a, googleLeadId, name: "Verify Google Lead", phone: "7025550199", email: null, zip: "89052",
      city: "Henderson" as const, gclid, notes: "verify-google-lead", isTest: true, key: undefined,
    };
    const first = await insertGoogleLead(lead);
    check(first?.id === a, "insertGoogleLead with a fresh google_lead_id answers the id", JSON.stringify(first));

    const rows = await sql`
      select source, heard_via, utm_source, utm_medium, google_lead_id, gclid, address, email, ad_clicked_at
      from leads where id = ${a}`;
    const r = rows[0];
    check(rows.length === 1, "the row is stored", `got ${rows.length} rows`);
    check(r.source === "google_form", "source is google_form", JSON.stringify(r.source));
    check(r.heard_via === "Google lead form", "heard_via is 'Google lead form'", JSON.stringify(r.heard_via));
    check(r.utm_source === "google" && r.utm_medium === "cpc", "utm_source google, utm_medium cpc", JSON.stringify([r.utm_source, r.utm_medium]));
    check(r.google_lead_id === googleLeadId, "google_lead_id is Google's lead_id", JSON.stringify(r.google_lead_id));
    check(r.gclid === gclid, "gclid is stored", JSON.stringify(r.gclid));
    check(r.address === "89052", "the ZIP is the address", JSON.stringify(r.address));
    check(r.email === null, "email is null", JSON.stringify(r.email));
    check(r.ad_clicked_at !== null, "ad_clicked_at is set", JSON.stringify(r.ad_clicked_at));

    const b = randomUUID(); ids.push(b);
    const resend = await insertGoogleLead({ ...lead, id: b, name: "Resent" });
    check(resend === null, "a resend with the same google_lead_id answers null", JSON.stringify(resend));
    const count = await sql`select count(*)::int as n from leads where google_lead_id = ${googleLeadId}`;
    check(count[0].n === 1, "and stores no second row", `got ${count[0].n}`);
    const absent = await sql`select 1 from leads where id = ${b}`;
    check(absent.length === 0, "the resend's id is not stored", `got ${absent.length}`);

    const c = randomUUID(); ids.push(c);
    const dupe = await throwsWith(() => rawInsert(c, googleLeadId));
    check(dupe?.includes("leads_google_lead_id_key") ?? false, "a raw second row with that google_lead_id throws (leads_google_lead_id_key)", `got ${dupe}`);

    const index = await sql`select indexdef from pg_indexes where indexname = 'leads_google_lead_id_key'`;
    const def = String(index[0]?.indexdef ?? "");
    check(/UNIQUE/i.test(def) && /WHERE \(?google_lead_id IS NOT NULL\)?/i.test(def), "the unique index is partial", def);
    const d = randomUUID(); ids.push(d);
    const e = randomUUID(); ids.push(e);
    await rawInsert(d, null);
    await rawInsert(e, null);
    const nulls = await sql`select count(*)::int as n from leads where id = any(${[d, e]}::uuid[]) and google_lead_id is null`;
    check(nulls[0].n === 2, "two leads with a NULL google_lead_id both insert (the index is partial)", `got ${nulls[0].n}`);
  } finally {
    await sql`delete from leads where id = any(${ids}::uuid[])`;
  }
});
