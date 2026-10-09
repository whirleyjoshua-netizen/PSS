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
 *   4. runs lib/agents/store.ts on that database: upsert/lock, owner edits survive a push, a concurrent claim has one
 *      winner, pull-once for items and replies, the 2-minute poll claim, suppressions, cards and digest facts.
 *   5. runs lib/agents/stats.ts businessCounts (7 and 28 days), read-only: the nine keys, numbers only.
 * It deletes its rows (agents named verify-*, cascading to their items and replies, and the a@b.co suppression),
 * and restores agent_settings.last_reply_poll_at, so repeated runs leave nothing behind.
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
let savedPoll: string | null | undefined;
test("agents: store SQL on a real database", async () => {
  const store = await import("@/lib/agents/store");
  const { lasVegasDate } = await import("@/lib/admin/time");
  const email = { kind: "email" as const, external_id: "mail-1", title: "Intro", email_to: "pat@example.com", email_subject: "Hello", email_body: "Hi" };
  check((await store.upsertItem(SLUG, email)) === "created", "upsertItem: a new email is created", "");
  check((await store.upsertItem(SLUG, email)) === "updated", "upsertItem: the same push again updates", "");
  const [{ id }] = await sql`select id from agent_items where agent_slug = ${SLUG} and external_id = 'mail-1'`;
  check(await store.saveEmailEdits(id, { to: "x@y.co", subject: "Edited", body: "Owner body" }), "saveEmailEdits saves", "");
  check((await store.upsertItem(SLUG, { ...email, email_body: "Agent rewrite" })) === "updated", "upsertItem after an owner edit still updates the proposal", "");
  const edited = await store.getItem(id);
  check(edited?.finalBody === "Owner body" && edited?.emailBody === "Agent rewrite", "a push never overwrites the owner's edit", JSON.stringify({ final: edited?.finalBody, proposal: edited?.emailBody }));

  await store.upsertItem(SLUG, { kind: "decision", external_id: "dec-1", title: "Which?" });
  const card = (await store.listAgentCards()).find((c) => c.slug === SLUG);
  check(card?.pending === 3, "listAgentCards counts the agent's pending items (d1 from the migration test, mail-1, dec-1)", JSON.stringify(card));
  check((await store.listNeedsYou()).filter((i) => i.agentSlug === SLUG).length === 3, "listNeedsYou lists them", "");

  const claims = await Promise.all([store.claimForSend(id, "a@x.co"), store.claimForSend(id, "b@x.co")]);
  const won = claims.filter((c) => c !== null);
  check(won.length === 1, "claimForSend twice at once: exactly one wins", `${won.length} won`);
  check(won[0]?.finalTo === "x@y.co" && won[0]?.finalBody === "Owner body", "the claim keeps the owner's edits", JSON.stringify(won[0]));
  await store.markSent(id, { sentBody: "Owner body + footer", graphMessageId: "g-1", conversationId: `conv-${SLUG}`, internetMessageId: `<sent-${SLUG}@test>` });
  check((await store.upsertItem(SLUG, email)) === "locked", "upsertItem on a sent email is locked", "");
  check((await store.sentTodayCount(SLUG, lasVegasDate(new Date()))) === 1, "sentTodayCount counts it on today's Las Vegas date", "");
  check((await store.sentConversations(30)).some((c) => c.id === id && c.conversationId === `conv-${SLUG}`), "sentConversations includes it", "");

  const firstPull = await store.pullUpdates(SLUG);
  check(firstPull.length === 1 && firstPull[0].id === id && firstPull[0].status === "sent", "pullUpdates returns the sent item", JSON.stringify(firstPull.map((i) => [i.externalId, i.status])));
  check((await store.pullUpdates(SLUG)).length === 0, "pullUpdates returns it only once", "");

  const [{ id: decId }] = await sql`select id from agent_items where agent_slug = ${SLUG} and external_id = 'dec-1'`;
  check(!(await store.decideItem(id, { status: "approved", note: null, by: "o@x.co" })), "decideItem refuses a sent email", "");
  check(await store.decideItem(decId, { status: "answered", note: "Go with A", by: "o@x.co" }), "decideItem answers a decision", "");
  const decided = await store.pullUpdates(SLUG);
  check(decided.length === 1 && decided[0].ownerNote === "Go with A", "pullUpdates delivers the answer", JSON.stringify(decided.map((i) => i.externalId)));

  const reply = { itemId: id, internetMessageId: `<reply-${SLUG}@test>`, from: " Pat@Example.com ", receivedAt: new Date(), subject: "Re: Hello", bodyText: "Sounds good" };
  check(await store.insertReply(reply), "insertReply stores a reply", "");
  check(!(await store.insertReply(reply)), "insertReply ignores the same message twice", "");
  check(!(await store.pullReplies("tara")).some((r) => r.external_id === "mail-1" && r.body_text === "Sounds good"), "pullReplies never gives another agent's reply", "");
  const replies = await store.pullReplies(SLUG);
  check(replies.length === 1 && replies[0].from === "pat@example.com" && replies[0].external_id === "mail-1", "pullReplies returns this agent's reply", JSON.stringify(replies));
  check((await store.pullReplies(SLUG)).length === 0, "pullReplies returns it only once", "");
  check((await store.listRecentReplies(50)).some((r) => r.itemId === id && !r.seen), "listRecentReplies shows it unseen", "");

  savedPoll = (await sql`select last_reply_poll_at::text as v from agent_settings`)[0].v;
  await sql`update agent_settings set last_reply_poll_at = null`;
  check(await store.claimReplyPoll(), "claimReplyPoll claims when nobody has", "");
  check(!(await store.claimReplyPoll()), "claimReplyPoll refuses inside 2 minutes", "");

  await store.addSuppression(" A@B.co ", "test", "owner");
  check(await store.isSuppressed("a@b.co"), "addSuppression normalizes and isSuppressed finds it", "");

  const facts = await store.digestFacts(null);
  check(typeof facts.pending === "number" && facts.newReplies >= 1, "digestFacts runs", JSON.stringify({ pending: facts.pending, newReplies: facts.newReplies }));
  check(typeof (await store.needsYouCount()) === "number", "needsYouCount runs", "");
  await store.getAgentSettings();
  check((await store.listItems(SLUG)).length === 3 && (await store.listItems(SLUG, "daily")).length === 0, "listItems filters by report type", "");
});
test("agents: business counts on a real database", async () => {
  const { businessCounts } = await import("@/lib/agents/stats");
  const c = await businessCounts(7);
  check(Object.keys(c).length === 9, "business counts run on a real database", JSON.stringify(Object.keys(c)));
  const c28 = await businessCounts(28);
  const numeric = (v: unknown) => typeof v === "number" ? Number.isFinite(v) : Object.values(v as Record<string, unknown>).every((n) => typeof n === "number" && Number.isFinite(n));
  check(Object.values(c28).every(numeric) && c28.window_days === 28, "business counts (28 days) are numbers only", JSON.stringify(Object.keys(c28)));
});
afterAll(async () => {
  await sql`delete from agents where slug like 'verify-%'`;
  await sql`delete from email_suppressions where address = 'a@b.co'`;
  if (savedPoll !== undefined) await sql`update agent_settings set last_reply_poll_at = ${savedPoll}::timestamptz`;
});
