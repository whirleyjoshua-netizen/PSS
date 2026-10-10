/**
 * Behavioural proof of migration 044 (agents, agent_items, agent_replies, email_suppressions, agent_settings).
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand, is in no suite, and CI does not run it. If you
 * change migration 044, run it yourself, or say the agent tables' SQL is unverified.
 * The unit tests mock the database, so they pin the SQL's text only.
 *
 * What it does, against a throwaway database:
 *   1. applies migration 044, twice (re-runnable);
 *   2. Tara and Tobi are seeded, and there is exactly one settings row;
 *   3. raw writes THROW each check: slug, send cap, report status, report type, email fields,
 *      external id, report body size, suppression address case, and the unique (agent, external_id) index.
 *   4. runs lib/agents/store.ts on that database: upsert/lock, owner edits survive a push, a concurrent claim has one
 *      winner, pull-once for items and replies, the 2-minute poll claim (forced, and handed back), suppressions, cards
 *      and digest facts; and the send records: a retry learns its earlier attempt, a failed email can be declined,
 *      a send recorded without Sent Items ids gets them later, an email stuck mid-send shows in Needs you, and
 *      migration 044's indexes (agent_replies.item_id indexed, the unused conversation index dropped); and the owner's
 *      note on a report: answered, delivered once, a changed note delivered again, locked against a push.
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
 * To watch it fail: change agents_cap_check in migration 044 to `between 0 and 60` and run
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

test("agents: migration 044", async () => {
  await apply("044_agents.sql");
  await apply("044_agents.sql");
  check(true, "migration 044 applies, and re-applies", "");
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
  check(won[0]?.item.finalTo === "x@y.co" && won[0]?.item.finalBody === "Owner body", "the claim keeps the owner's edits", JSON.stringify(won[0]));
  check(won[0]?.earlierAttemptAt === null, "a first claim reports no earlier attempt", JSON.stringify(won[0]?.earlierAttemptAt));
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
  check((await store.listRecentReplies(SLUG, 50)).some((r) => r.itemId === id && !r.seen), "listRecentReplies shows it unseen", "");
  check((await store.listRecentReplies("tara", 50)).every((r) => r.agentSlug === "tara"), "listRecentReplies(slug) gives only that agent's replies", "");

  savedPoll = (await sql`select last_reply_poll_at::text as v from agent_settings`)[0].v;
  await sql`update agent_settings set last_reply_poll_at = null`;
  const firstPoll = await store.claimReplyPoll();
  check(firstPoll !== null && firstPoll.previous === null, "claimReplyPoll claims when nobody has, with no previous poll", JSON.stringify(firstPoll));
  check((await store.claimReplyPoll()) === null, "claimReplyPoll refuses inside 2 minutes", "");
  const forced = await store.claimReplyPoll(true);
  check(forced !== null && forced.previous?.getTime() === new Date(firstPoll!.claimedAt).getTime(), "a forced claim takes it anyway and answers the previous poll time", JSON.stringify({ forced, firstPoll }));
  await store.releaseReplyPoll(firstPoll!.claimedAt, new Date("2026-01-01T00:00:00Z"));
  const [{ v: notReleased }] = await sql`select last_reply_poll_at::text as v from agent_settings`;
  check(notReleased === forced!.claimedAt, "releaseReplyPoll leaves a newer claim alone", String(notReleased));
  await store.releaseReplyPoll(forced!.claimedAt, forced!.previous);
  const [{ v: released }] = await sql`select last_reply_poll_at::text as v from agent_settings`;
  check(new Date(released).getTime() === new Date(firstPoll!.claimedAt).getTime(), "releaseReplyPoll hands the window back to the previous poll time", String(released));

  await store.addSuppression(" A@B.co ", "test", "owner");
  check(await store.isSuppressed("a@b.co"), "addSuppression normalizes and isSuppressed finds it", "");

  const facts = await store.digestFacts(null);
  check(typeof facts.pending === "number" && facts.newReplies >= 1, "digestFacts runs", JSON.stringify({ pending: facts.pending, newReplies: facts.newReplies }));
  check(typeof (await store.needsYouCount()) === "number", "needsYouCount runs", "");
  await store.getAgentSettings();
  check((await store.listItems(SLUG)).length === 3 && (await store.listItems(SLUG, "daily")).length === 0, "listItems filters by report type", "");
});
test("agents: send records on a real database", async () => {
  const store = await import("@/lib/agents/store");
  const push = (external_id: string) => store.upsertItem(SLUG, { kind: "email", external_id, title: "t", email_to: "pat@example.com", email_subject: "s", email_body: "b" });
  const idOf = async (external_id: string) => (await sql`select id from agent_items where agent_slug = ${SLUG} and external_id = ${external_id}`)[0].id as string;

  // A send that fails, then a retry: the retry learns when the failed attempt was claimed.
  await push("mail-2");
  const m2 = await idOf("mail-2");
  await store.claimForSend(m2, "o@x.co");
  await store.setSendingBody(m2, "b + footer");
  await store.markFailed(m2, "Microsoft didn't answer");
  const failed = await store.getItem(m2);
  check(failed?.status === "failed" && failed.sentBody === "b + footer", "setSendingBody stores the text before the send, and markFailed fails the claimed row", JSON.stringify(failed));
  check((await store.claimForSend(m2, "o@x.co")) === null, "a failed email can't be claimed again within 15 minutes of its last attempt", "");
  // Pretend the last attempt was 16 minutes ago.
  await sql`update agent_items set decided_at = decided_at - interval '16 minutes' where id = ${m2}`;
  const lastAttempt = (await store.getItem(m2))?.decidedAt;
  const retry = await store.claimForSend(m2, "o@x.co");
  check(retry !== null && lastAttempt instanceof Date && retry.earlierAttemptAt?.getTime() === lastAttempt.getTime(),"after 15 minutes it can, and the claim answers when the last attempt was claimed", JSON.stringify({ retry: retry?.earlierAttemptAt, lastAttempt }));
  await store.markFailed(m2, "again");
  await sql`update agent_items set decided_at = decided_at - interval '16 minutes' where id = ${m2}`;
  const retries = await Promise.all([store.claimForSend(m2, "a@x.co"), store.claimForSend(m2, "b@x.co")]);
  check(retries.filter((c) => c !== null).length === 1, "a failed email claimed twice at once: exactly one wins", JSON.stringify(retries.map((c) => c !== null)));
  await store.markFailed(m2, "again");
  check(await store.decideItem(m2, { status: "declined", note: "never mind", by: "o@x.co" }), "decideItem declines a failed email", "");
  check((await store.getItem(m2))?.status === "declined", "the failed email is now declined", "");
  await push("mail-2b");
  const m2b = await idOf("mail-2b");
  await store.claimForSend(m2b, "o@x.co");
  await store.markFailed(m2b, "x");
  check(!(await store.decideItem(m2b, { status: "approved", note: null, by: "o@x.co" })), "decideItem never approves a failed email", "");

  // Sent, but Sent Items didn't show the copy yet: the ids are filled in later.
  await push("mail-3");
  const m3 = await idOf("mail-3");
  await store.claimForSend(m3, "o@x.co");
  await store.setSendingBody(m3, "kept body");
  await store.markSent(m3, { sentBody: null, graphMessageId: null, conversationId: null, internetMessageId: null });
  const sentNoIds = await store.getItem(m3);
  check(sentNoIds?.status === "sent" && sentNoIds.sentBody === "kept body" && sentNoIds.conversationId === null, "markSent with no ids is sent, and keeps the stored body", JSON.stringify(sentNoIds));
  check((await store.sentWithoutIds(60, 10)).some((r) => r.id === m3), "sentWithoutIds lists it", "");
  check((await store.sentWithoutIds(60, 0)).length === 0, "sentWithoutIds honours its row limit", "");
  await store.markFailed(m3, "late");
  check((await store.getItem(m3))?.status === "sent", "markFailed never touches a sent email", "");
  await store.setSentIds(m3, { graphMessageId: "g-3", conversationId: `conv3-${SLUG}`, internetMessageId: `<m3-${SLUG}@test>` });
  check((await store.getItem(m3))?.conversationId === `conv3-${SLUG}` && !(await store.sentWithoutIds(60, 10)).some((r) => r.id === m3), "setSentIds fills them in, and it leaves the list", "");

  // Claimed long ago and never recorded: status unknown.
  await push("mail-4");
  const m4 = await idOf("mail-4");
  await store.claimForSend(m4, "o@x.co");
  check(!(await store.listNeedsYou()).some((i) => i.id === m4), "a send in progress is not in Needs you", "");
  await sql`update agent_items set decided_at = now() - interval '14 minutes', updated_at = now() - interval '14 minutes' where id = ${m4}`;
  check(!(await store.listNeedsYou()).some((i) => i.id === m4) && !(await store.stuckApproved(15, 10)).some((r) => r.id === m4), "claimed 14 minutes ago: still sending, not in Needs you, not settled yet", "");
  await sql`update agent_items set decided_at = now() - interval '16 minutes', updated_at = now() - interval '16 minutes' where id = ${m4}`;
  check((await store.listNeedsYou()).some((i) => i.id === m4 && i.status === "approved"), "claimed 16 minutes ago: status unknown, in Needs you", "");
  const pending = (await store.listAgentCards()).find((c) => c.slug === SLUG)?.pending;
  check(pending === 3, "listAgentCards counts it (with d1, pending, and mail-2b, failed)", JSON.stringify(pending));
  check((await store.stuckApproved(15, 10)).some((r) => r.id === m4), "stuckApproved(15, 10) lists it", "");
  check(typeof (await store.needsYouCount()) === "number" && (await store.digestFacts(null)).pending >= 2, "needsYouCount and digestFacts run with the stuck condition", "");
  const runs = (await store.digestFacts(null)).agentRuns;
  check(Array.isArray(runs) && runs.every((r) => typeof r.agentName === "string"), "digestFacts lists agent runs", JSON.stringify(runs.map((r) => r.agentName)));

  const indexes = (await sql`select indexname from pg_indexes where tablename in ('agent_items', 'agent_replies')`).map((r) => r.indexname as string);
  check(indexes.includes("agent_replies_item_id_idx") && !indexes.includes("agent_items_conversation_idx"), "migration 044: agent_replies has its item_id index, and the unused conversation index is gone", JSON.stringify(indexes));
});
test("agents: the owner's note on a report", async () => {
  const store = await import("@/lib/agents/store");
  await store.upsertItem(SLUG, { kind: "report", external_id: "rep-1", title: "Daily", report_type: "daily", body_md: "# Hi" });
  const [{ id }] = await sql`select id from agent_items where agent_slug = ${SLUG} and external_id = 'rep-1'`;
  await store.markRead(id);
  check((await store.pullUpdates(SLUG)).every((i) => i.id !== id), "a read report with no note is never pulled", "");
  check(await store.noteOnReport(id, { note: "More on Henderson", by: "o@x.co" }), "noteOnReport saves a note on a report", "");
  const answered = await store.getItem(id);
  check(answered?.status === "answered" && answered.ownerNote === "More on Henderson" && answered.decidedBy === "o@x.co" && answered.decidedAt instanceof Date,
    "the report is answered, with the note, who and when", JSON.stringify({ status: answered?.status, note: answered?.ownerNote, by: answered?.decidedBy }));
  const first = await store.pullUpdates(SLUG);
  check(first.length === 1 && first[0].id === id && first[0].status === "answered" && first[0].ownerNote === "More on Henderson", "pullUpdates delivers the note", JSON.stringify(first.map((i) => [i.externalId, i.status, i.ownerNote])));
  check((await store.pullUpdates(SLUG)).length === 0, "pullUpdates delivers it only once", "");
  check(await store.noteOnReport(id, { note: "Actually, Summerlin", by: "o@x.co" }), "a second note replaces the first", "");
  const second = await store.pullUpdates(SLUG);
  check(second.length === 1 && second[0].ownerNote === "Actually, Summerlin", "the changed note is delivered again", JSON.stringify(second.map((i) => i.ownerNote)));
  check((await store.upsertItem(SLUG, { kind: "report", external_id: "rep-1", title: "Rewrite", report_type: "daily" })) === "locked", "an answered report is locked against a push", "");
  check((await store.listAgentCards()).find((c) => c.slug === SLUG)?.unreadReports === 0, "an answered report doesn't count as unread", "");
  const [{ id: decId }] = await sql`select id from agent_items where agent_slug = ${SLUG} and kind = 'decision' limit 1`;
  check(!(await store.noteOnReport(decId, { note: "x", by: "o@x.co" })), "noteOnReport refuses anything but a report", "");
  const raw = await throwsWith(() => sql`insert into agent_items (agent_slug, external_id, kind, title, report_type, status) values (${SLUG}, 'rep-raw', 'report', 't', 'daily', 'answered')`);
  check(raw === null, "migration 044 lets a report be answered", String(raw));
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
