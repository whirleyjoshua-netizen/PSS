/**
 * Behavioural proof of migration 042 (agents, agent_items, agent_replies, email_suppressions, agent_settings).
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand, is in no suite, and CI does not run it. If you
 * change migration 042, run it yourself, or say the agent tables' SQL is unverified.
 * The unit tests mock the database, so they pin the SQL's text only.
 *
 * What it does, against a throwaway database:
 *   1. applies migration 042, twice (re-runnable);
 *   2. Tara and Tobi are seeded, and there is exactly one settings row;
 *   3. raw writes THROW each check: slug, send cap, report status, report type, email fields,
 *      external id, report body size, suppression address case, and the unique (agent, external_id) index.
 * It deletes its rows (agents named verify-*, cascading to their items), so repeated runs leave nothing behind.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. It takes its connection from E2E_POSTGRES_URL alone and
 * refuses production (ep-cold-term).
 *
 * Usage: E2E_POSTGRES_URL='<neon test branch url>' npx vitest run --config scripts/verify-agents.config.mts --disableConsoleIntercept
 *   (without the flag, vitest hides a passing test's "ok" lines)
 *
 * To watch it fail: change agents_cap_check in migration 042 to `between 0 and 60` and run
 * ("refuses a cap of 51" fails), then put 50 back and run again (the re-apply restores the check).
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { afterAll, test } from "vitest";

const FORBIDDEN_HOSTS = ["ep-cold-term"];
function refuse(reason: string): never {
  console.error(`\n================ verify-agents REFUSED TO RUN ================\n${reason}\n`);
  throw new Error(`verify-agents refused to run: ${reason}`);
}
const url = process.env.E2E_POSTGRES_URL;
if (!url) refuse("E2E_POSTGRES_URL is not set. This script WRITES rows: give it a Neon test branch, never production.");
const host = (() => { try { return new URL(url).host; } catch { return refuse("E2E_POSTGRES_URL is not a valid URL."); } })();
for (const forbidden of FORBIDDEN_HOSTS) if (host.includes(forbidden)) refuse(`E2E_POSTGRES_URL points at production (${forbidden}).`);
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;

const sql = neon(url);
const SLUG = `verify-${Date.now().toString(36)}`;

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
async function throwsWith(run: () => Promise<unknown>): Promise<string | null> {
  try { await run(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
}
async function apply(file: string) {
  const statements = readFileSync(`db/migrations/${file}`, "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) await sql.query(statement);
}

test("agents: migration 042", async () => {
  await apply("042_agents.sql");
  await apply("042_agents.sql");
  check(true, "migration 042 applies, and re-applies", "");
  const seeded = await sql`select slug, stats_access from agents where slug in ('tara','tobi') order by slug`;
  check(seeded.length === 2 && seeded[0].stats_access === true && seeded[1].stats_access === false, "Tara and Tobi seeded", JSON.stringify(seeded));
  check((await sql`select count(*)::int as n from agent_settings`)[0].n === 1, "one settings row", "");
  await sql`insert into agents (slug, name) values (${SLUG}, 'Verify')`;
  const bad = async (label: string, run: () => Promise<unknown>) => check((await throwsWith(run)) !== null, `refuses ${label}`, "");
  await bad("a bad slug", () => sql`insert into agents (slug, name) values ('Bad Slug', 'x')`);
  await bad("a cap of 51", () => sql`update agents set daily_send_cap = 51 where slug = ${SLUG}`);
  await bad("a report with status pending", () => sql`insert into agent_items (agent_slug, external_id, kind, title, report_type, status) values (${SLUG}, 'r1', 'report', 't', 'daily', 'pending')`);
  await bad("a report without a type", () => sql`insert into agent_items (agent_slug, external_id, kind, title, status) values (${SLUG}, 'r2', 'report', 't', 'unread')`);
  await bad("an email without a body", () => sql`insert into agent_items (agent_slug, external_id, kind, title, status, email_to, email_subject) values (${SLUG}, 'e1', 'email', 't', 'pending', 'a@b.co', 's')`);
  await bad("an external id with a space", () => sql`insert into agent_items (agent_slug, external_id, kind, title, status) values (${SLUG}, 'a b', 'decision', 't', 'pending')`);
  await bad("a 201 KB report", () => sql`insert into agent_items (agent_slug, external_id, kind, title, report_type, status, body_md) values (${SLUG}, 'r3', 'report', 't', 'daily', 'unread', ${"x".repeat(205_000)})`);
  await bad("an upper-case suppression", () => sql`insert into email_suppressions (address, source) values ('A@B.CO', 'owner')`);
  await sql`insert into agent_items (agent_slug, external_id, kind, title, status) values (${SLUG}, 'd1', 'decision', 't', 'pending')`;
  await bad("a duplicate (agent, external_id)", () => sql`insert into agent_items (agent_slug, external_id, kind, title, status) values (${SLUG}, 'd1', 'decision', 't', 'pending')`);
});
afterAll(async () => { await sql`delete from agents where slug like 'verify-%'`; });
