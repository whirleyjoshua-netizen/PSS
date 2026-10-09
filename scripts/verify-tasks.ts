/**
 * Behavioural proof of the task board's SQL in lib/admin/tasks.ts and removeAdmin in
 * lib/admin/admin-access.ts.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is a script you run by hand, it is in no
 * suite, and CI does not execute it. Nothing runs it for you. If you change
 * createTask, updateTask, setTaskStatus, claimReminder, releaseReminder,
 * listDigestTasks, removeAdmin or migration 032, run it yourself — and if you cannot,
 * say the task board rules are unverified rather than assuming they hold.
 *
 * Why it exists: the unit tests mock the database, so they pin the SQL *text*, which is
 * a tripwire, not a proof. Whether the assignee check really refuses a stranger, whether
 * the cooldown really holds, whether a release really restores the exact timestamp, and
 * whether the CHECK constraints really exist are things only the database can answer.
 * This script calls the real functions — no mocks.
 *
 * What it does, against a throwaway database, with ADMIN_EMAILS set to one fake owner:
 *   1. creates an unassigned task and one assigned to the owner;
 *   2. tries to assign someone who cannot sign in — "not-assignable", no row written;
 *   3. adds a guest to admin_access and assigns them an open task and a done task —
 *      the done one exists and has a completed_at date;
 *   4. done → done keeps completed_at; leaving done clears it;
 *   5. raw writes THROW tasks_status_check, tasks_title_check and tasks_completed_check —
 *      the database is a guard, not only our code;
 *   6. Remind now: the first claim wins, a second at once is refused "recent", a claim
 *      9 minutes after the last reminder is still refused "recent", after 11 minutes it
 *      claims again, a release restores the previous reminder exactly,
 *      and a release that doesn't match the current claim changes nothing;
 *   7. claimReminder refuses "unassigned", "done" and "missing";
 *   8. updateTask reports the previous assignee, and refuses a stranger without changing
 *      anything;
 *   9. listDigestTasks takes open, assigned tasks due on or before the given day only —
 *      a done task and an unassigned task, both overdue, are each left out;
 *  10. removeAdmin unassigns the guest's open task, keeps their name on the done one, and
 *      editing that done task with its assignee unchanged is still allowed;
 *  11. migration 032 re-runs without error.
 * Then it deletes its tasks and the guest's admin_access row, so repeated runs leave no
 * residue.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. Point it only at a Neon test branch.
 * It takes its connection from E2E_POSTGRES_URL alone — never POSTGRES_URL,
 * DATABASE_URL or .env.local, all of which may hold production credentials —
 * and it refuses to start if that URL looks like production (ep-cold-term).
 *
 * Usage (bash):
 *   E2E_POSTGRES_URL='<neon test branch url>' \
 *     npx vitest run --config scripts/verify-tasks.config.mts
 *
 * Usage (PowerShell):
 *   $env:E2E_POSTGRES_URL='<neon test branch url>'
 *   npx vitest run --config scripts/verify-tasks.config.mts
 *
 * To watch it fail (which is the only way to know it works), one at a time:
 *   - in claimReminder, delete `and (last_reminded_at is null or last_reminded_at < now() -
 *     make_interval(mins => ${REMIND_COOLDOWN_MINUTES}::int))` — step 6 "a second within
 *     10 minutes" must fail;
 *   - in lib/admin/task-rules.ts, set REMIND_COOLDOWN_MINUTES to 5 — step 6 "a claim
 *     9 minutes after the last is still refused" must fail;
 *   - in listDigestTasks, delete `status <> 'done' and ` — step 9 "the digest leaves out
 *     an overdue done task" must fail;
 *   - in listDigestTasks, delete `assignee_email is not null and ` — step 9 "the digest
 *     leaves out an overdue unassigned task" must fail;
 *   - in releaseReminder, delete `and last_reminded_at = ${claim.claimedAt}::timestamptz` —
 *     step 6 "a release that doesn't match" must fail;
 *   - in removeAdmin (lib/admin/admin-access.ts), delete the `unassigned` CTE — step 10
 *     "open task is unassigned" must fail;
 *   - in createTask, replace the `where …` line with `where true` — step 2 must fail;
 *   - in updateTask, delete `or ${a}::text is not distinct from (select assignee_email
 *     from prev)` — step 10 "keeps a removed assignee" must fail.
 * Put each back.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { test } from "vitest";
import {
  claimReminder, createTask, getTask, listDigestTasks, releaseReminder, setTaskStatus, updateTask,
} from "../lib/admin/tasks";
import { removeAdmin } from "../lib/admin/admin-access";
import { taskInputSchema } from "../lib/admin/task-schema";

/** Endpoints this script must never write to. Production is the whole point of the list. */
const FORBIDDEN_HOSTS = ["ep-cold-term"];

const BANNER = "\n================ verify-tasks REFUSED TO RUN ================\n";

function refuse(reason: string): never {
  // Printed as well as thrown: the thrown message is what sets the exit code,
  // the print is what a human actually reads in the terminal.
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-tasks refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse(
    "E2E_POSTGRES_URL is not set.\n\n" +
      "This script WRITES rows, so it will not fall back to POSTGRES_URL, DATABASE_URL\n" +
      "or .env.local — any of which may point at production. Give it a Neon test branch:\n\n" +
      "  E2E_POSTGRES_URL='<neon test branch url>' \\\n" +
      "    npx vitest run --config scripts/verify-tasks.config.mts\n\n" +
      "It does not skip. No result means it did not run, not that the rules hold.",
  );
}

const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return refuse(`E2E_POSTGRES_URL is not a valid URL, so its host cannot be checked.`);
  }
})();

for (const forbidden of FORBIDDEN_HOSTS) {
  if (host.includes(forbidden)) {
    refuse(
      `E2E_POSTGRES_URL points at ${host}, which matches the production endpoint "${forbidden}".\n\n` +
        "This script inserts and deletes rows. Running it there would put junk in the\n" +
        "owners' real data. Cut a Neon branch and point it at that instead.",
    );
  }
}

// The functions under test read the connection through lib/db's db(), at call time, from
// POSTGRES_URL. Set it from the vetted URL so the module under test cannot reach anything
// this script has not just checked.
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
const OWNER = "verify-tasks-owner@example.com";
process.env.ADMIN_EMAILS = OWNER;

const sql = neon(url);
const STAMP = Date.now();
const GUEST = `verify-tasks-guest-${STAMP}@example.com`;
const STRANGER = `verify-tasks-stranger-${STAMP}@example.com`;

const input = (over: Record<string, string>) =>
  taskInputSchema.parse({ title: `VERIFY task ${STAMP}`, notes: "", assignee: "", dueOn: "", status: "todo", ...over });

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}

async function throwsWith(run: () => Promise<unknown>): Promise<string | null> {
  try { await run(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
}

/** A task with no files (migration 043): the form makes its id. scripts/verify-task-files.ts covers files. */
const create = (fields: Parameters<typeof createTask>[0], actor: string) => createTask(fields, actor, { id: randomUUID(), uploads: [], resourceIds: [] });

const idOf = (result: { id: string } | "not-assignable") => {
  if (result === "not-assignable") throw new Error("FAILED: expected a task to be created");
  return result.id;
};

test("task board against a real database", async () => {
  console.log(`\nverify-tasks: writing to ${host}\n`);
  try {
    // 1. Unassigned and owner-assigned tasks are created.
    const loose = idOf(await create(input({}), OWNER));
    check((await getTask(loose))?.assigneeEmail === null, "an unassigned task is created", "assignee not null");
    const mine = idOf(await create(input({ assignee: OWNER }), OWNER));
    check((await getTask(mine))?.assigneeEmail === OWNER, "an owner can be assigned", "assignee wrong");

    // 2. Someone who cannot sign in cannot be assigned, and nothing is written.
    const refused = await create(input({ assignee: STRANGER }), OWNER);
    const strays = await sql`select count(*)::int as n from tasks where assignee_email = ${STRANGER}`;
    check(refused === "not-assignable" && Number(strays[0].n) === 0, "a stranger is refused", `got ${JSON.stringify(refused)}, rows ${strays[0].n}`);

    // 3. An added admin can be assigned.
    await sql`insert into admin_access (email, added_by) values (${GUEST}, ${OWNER})`;
    const guestOpen = idOf(await create(input({ assignee: GUEST, dueOn: "2026-10-09" }), OWNER));
    const guestDone = idOf(await create(input({ assignee: GUEST, status: "done" }), OWNER));
    const guestDoneRow = await getTask(guestDone);
    check(guestDoneRow !== null && guestDoneRow.completedAt instanceof Date, "a task created as done has completed_at", JSON.stringify(guestDoneRow));

    // 4. Moving to done stamps completed_at and keeps it; moving back clears it.
    await setTaskStatus(mine, "done");
    const first = (await getTask(mine))?.completedAt;
    await setTaskStatus(mine, "done");
    const second = (await getTask(mine))?.completedAt;
    check(!!first && first.getTime() === second?.getTime(), "done → done keeps completed_at", `${first} vs ${second}`);
    await setTaskStatus(mine, "todo");
    check((await getTask(mine))?.completedAt === null, "leaving done clears completed_at", "not cleared");

    // 5. The database guards itself.
    const badStatus = await throwsWith(() => sql`insert into tasks (title, status, created_by) values ('x', 'blocked', ${OWNER})`);
    check(badStatus?.includes("tasks_status_check") ?? false, "status 'blocked' is refused by tasks_status_check", `${badStatus}`);
    const badTitle = await throwsWith(() => sql`insert into tasks (title, created_by) values ('   ', ${OWNER})`);
    check(badTitle?.includes("tasks_title_check") ?? false, "a blank title is refused by tasks_title_check", `${badTitle}`);
    const badDone = await throwsWith(() => sql`update tasks set completed_at = now() where id = ${loose}`);
    check(badDone?.includes("tasks_completed_check") ?? false, "completed_at without done is refused", `${badDone}`);

    // 6. Remind now: one claim per 10 minutes, and a release restores the exact previous value.
    const c1 = await claimReminder(guestOpen, OWNER);
    check("claim" in c1, "the first reminder claims", JSON.stringify(c1));
    const c2 = await claimReminder(guestOpen, OWNER);
    check("refused" in c2 && c2.refused === "recent" && c2.lastAt !== null, "a second within 10 minutes is refused as recent", JSON.stringify(c2));
    await sql`update tasks set last_reminded_at = now() - interval '9 minutes' where id = ${guestOpen}`;
    const c2b = await claimReminder(guestOpen, OWNER);
    check("refused" in c2b && c2b.refused === "recent", "a claim 9 minutes after the last is still refused as recent", JSON.stringify(c2b));
    await sql`update tasks set last_reminded_at = now() - interval '11 minutes' where id = ${guestOpen}`;
    const before = await sql`select last_reminded_at::text as t, last_reminded_by as b from tasks where id = ${guestOpen}`;
    const c3 = await claimReminder(guestOpen, "someone-else@example.com");
    check("claim" in c3, "after 10 minutes it claims again", JSON.stringify(c3));
    if (!("claim" in c3)) throw new Error("FAILED: expected a claim after 10 minutes");
    await releaseReminder(guestOpen, c3.claim);
    const after = await sql`select last_reminded_at::text as t, last_reminded_by as b from tasks where id = ${guestOpen}`;
    check(after[0].t === before[0].t && after[0].b === before[0].b, "release restores the previous reminder exactly", `${JSON.stringify(before[0])} → ${JSON.stringify(after[0])}`);
    // A stale release (someone reminded since) changes nothing.
    const THIRD = "verify-tasks-third@example.com";
    const c4 = await claimReminder(guestOpen, THIRD);
    if (!("claim" in c4)) throw new Error("FAILED: expected a claim after release");
    await releaseReminder(guestOpen, { ...c4.claim, claimedAt: before[0].t as string });
    const kept = await sql`select last_reminded_by as b from tasks where id = ${guestOpen}`;
    // Without the claimedAt guard this would restore c4's previousBy (OWNER).
    check(kept[0].b === THIRD, "a release that doesn't match the claim changes nothing", `by is ${kept[0].b}`);

    // 7. Refusal reasons.
    check(JSON.stringify(await claimReminder(loose, OWNER)) === JSON.stringify({ refused: "unassigned", lastAt: null }), "unassigned is refused", "");
    check(JSON.stringify(await claimReminder(guestDone, OWNER)) === JSON.stringify({ refused: "done", lastAt: null }), "done is refused", "");
    check(JSON.stringify(await claimReminder("00000000-0000-4000-8000-000000000000", OWNER)) === JSON.stringify({ refused: "missing", lastAt: null }), "missing is refused", "");

    // 8. updateTask reports the previous assignee, and a stranger is refused.
    const moved = await updateTask(loose, input({ assignee: OWNER }));
    check(JSON.stringify(moved) === JSON.stringify({ previousAssignee: null }), "update reports the previous assignee", JSON.stringify(moved));
    const strangerUpdate = await updateTask(loose, input({ assignee: STRANGER }));
    check(strangerUpdate === "not-assignable" && (await getTask(loose))?.assigneeEmail === OWNER, "update to a stranger is refused and nothing changes", JSON.stringify(strangerUpdate));

    // 9. Digest: due on or before the given day, open and assigned only.
    const yesterday = idOf(await create(input({ assignee: OWNER, dueOn: "2026-09-30" }), OWNER));
    const tomorrow = idOf(await create(input({ assignee: OWNER, dueOn: "2026-10-02" }), OWNER));
    const later = idOf(await create(input({ assignee: OWNER, dueOn: "2026-10-03" }), OWNER));
    const overdueDone = idOf(await create(input({ assignee: OWNER, dueOn: "2026-09-30", status: "done" }), OWNER));
    const overdueLoose = idOf(await create(input({ dueOn: "2026-09-30" }), OWNER));
    const digestIds = (await listDigestTasks("2026-10-02")).map((t) => t.id);
    check(digestIds.includes(yesterday) && digestIds.includes(tomorrow) && !digestIds.includes(later) && !digestIds.includes(guestDone),
      "the digest takes overdue to tomorrow, not later or done", JSON.stringify(digestIds));
    check(!digestIds.includes(overdueDone), "the digest leaves out an overdue done task", JSON.stringify(digestIds));
    check(!digestIds.includes(overdueLoose), "the digest leaves out an overdue unassigned task", JSON.stringify(digestIds));

    // 10. Removing access unassigns their open tasks; done ones keep the name.
    check(await removeAdmin(GUEST), "removeAdmin removes the guest", "false");
    check((await getTask(guestOpen))?.assigneeEmail === null, "the guest's open task is unassigned", "still assigned");
    check((await getTask(guestDone))?.assigneeEmail === GUEST, "the guest's done task keeps the name", "cleared");
    // …and editing that done task with its assignee unchanged is still allowed.
    const keepDone = await updateTask(guestDone, input({ assignee: GUEST, status: "done", notes: "history" }));
    check(JSON.stringify(keepDone) === JSON.stringify({ previousAssignee: GUEST }), "a done task keeps a removed assignee on edit", JSON.stringify(keepDone));

    // 11. The migration re-runs cleanly.
    const statements = readFileSync("db/migrations/032_tasks.sql", "utf8")
      .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
      .split(";").map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) await sql.query(statement);
    console.log("  ok  migration 032 re-runs without error");
  } finally {
    // Both deletes run even if one throws; the first failure is then rethrown.
    const cleanup = await Promise.allSettled([
      sql`delete from tasks where created_by = ${OWNER}`,
      sql`delete from admin_access where email = ${GUEST}`,
    ]);
    const failed = cleanup.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;
  }
});
