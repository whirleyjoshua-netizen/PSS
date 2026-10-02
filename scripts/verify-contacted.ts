/**
 * Behavioural proof of the Contacted stage: addContact in lib/admin/jobs.ts, logCall in
 * lib/admin/calls.ts, leads_status_check, and migrations 011 and 033.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is a script you run by hand, it is in no
 * suite, and CI does not execute it. Nothing runs it for you. If you change addContact,
 * logCall, callStageMove, leads_status_check or migrations 011 / 033, run it yourself —
 * and if you cannot, say the Contacted stage rules are unverified rather than assuming they hold.
 *
 * Why it exists: the unit tests mock the database, so they pin the SQL *text*, which is
 * a tripwire, not a proof. Whether the check really accepts 'contacted', whether a contact
 * really moves only a New job, whether a second contact really logs no second stage event,
 * and whether re-running 011 really leaves Contacted jobs alone are things only the database
 * can answer. This script calls the real functions — no mocks.
 *
 * What it does, against a throwaway database, on leads of its own named "VERIFY Contacted <stamp>":
 *   1. a raw update to status 'contacted' succeeds — the check accepts it;
 *   2. addContact on a New lead returns true, moves it to contacted, logs one contact event
 *      and exactly one stage event new → contacted;
 *   3. addContact again: still contacted, two contact events, still one stage event;
 *   4. addContact on a Quoted lead: stays quoted, no stage event;
 *   5. logCall "talked" on a New lead moves it to contacted with one stage event;
 *   6. logCall "booked" with a visit on that Contacted lead moves it to visit_booked, with one
 *      stage event from contacted;
 *   7. logCall "no_answer" on a New lead leaves it new;
 *   8. every statement of 011 and 033 re-runs, and a Contacted lead is STILL contacted —
 *      the regression the 011 edit exists for;
 *   9. a raw update to the typo 'contactd' THROWS leads_status_check.
 * Then it deletes its job_events, appointments and leads, so repeated runs leave no residue.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. Point it only at a Neon test branch. Step 8 re-runs
 * two migrations against the whole branch.
 * It takes its connection from E2E_POSTGRES_URL alone — never POSTGRES_URL,
 * DATABASE_URL or .env.local, all of which may hold production credentials —
 * and it refuses to start if that URL looks like production (ep-cold-term).
 *
 * Usage (bash):
 *   E2E_POSTGRES_URL='<neon test branch url>' \
 *     npx vitest run --config scripts/verify-contacted.config.mts
 *
 * Usage (PowerShell):
 *   $env:E2E_POSTGRES_URL='<neon test branch url>'
 *   npx vitest run --config scripts/verify-contacted.config.mts
 *
 * To watch it fail (which is the only way to know it works), one at a time:
 *   - in addContact, delete `and status = 'new'` — step 3 "still exactly one stage event
 *     after the second contact" fails first; with that one check disabled, step 4
 *     "addContact leaves a quoted lead quoted" fails too;
 *   - in 011_stages_contact_log.sql, put back `update leads set status = 'new' where
 *     status = 'contacted';` above the first alter — step 8 must fail.
 * Put each back.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { test } from "vitest";
import { addContact } from "../lib/admin/jobs";
import { logCall } from "../lib/admin/calls";
import type { CallInput } from "../lib/admin/call";

/** Endpoints this script must never write to. Production is the whole point of the list. */
const FORBIDDEN_HOSTS = ["ep-cold-term"];

const BANNER = "\n================ verify-contacted REFUSED TO RUN ================\n";

function refuse(reason: string): never {
  // Printed as well as thrown: the thrown message is what sets the exit code,
  // the print is what a human actually reads in the terminal.
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-contacted refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse(
    "E2E_POSTGRES_URL is not set.\n\n" +
      "This script WRITES rows, so it will not fall back to POSTGRES_URL, DATABASE_URL\n" +
      "or .env.local — any of which may point at production. Give it a Neon test branch:\n\n" +
      "  E2E_POSTGRES_URL='<neon test branch url>' \\\n" +
      "    npx vitest run --config scripts/verify-contacted.config.mts\n\n" +
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
        "This script inserts and deletes rows and re-runs migrations. Running it there would\n" +
        "touch the owners' real data. Cut a Neon branch and point it at that instead.",
    );
  }
}

// The functions under test read the connection through lib/db's db(), at call time, from
// POSTGRES_URL. Set it from the vetted URL so the module under test cannot reach anything
// this script has not just checked.
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;

const sql = neon(url);
const STAMP = Date.now();
const LEAD_NAME = `VERIFY Contacted ${STAMP}`;
const ACTOR = "verify-contacted@example.com";
const leadIds: string[] = [];

const newLead = async (suffix: string, status = "new"): Promise<string> => {
  const rows = await sql`
    insert into leads (name, phone, email, city, source, status)
    values (${`${LEAD_NAME} ${suffix}`}, '7025550199', ${`verify-contacted-${STAMP}-${suffix}@example.com`},
            'Henderson', 'phone', ${status})
    returning id`;
  const id = rows[0].id as string;
  leadIds.push(id);
  return id;
};

const statusOf = async (lead: string): Promise<string | null> => {
  const rows = await sql`select status from leads where id = ${lead}`;
  return (rows[0]?.status as string | undefined) ?? null;
};

const countKind = async (lead: string, kind: string): Promise<number> => {
  const rows = await sql`select count(*)::int as n from job_events where lead_id = ${lead} and kind = ${kind}`;
  return Number(rows[0].n);
};

const stageEvents = async (lead: string): Promise<{ from: string; to: string }[]> => {
  const rows = await sql`
    select from_status as "from", to_status as "to" from job_events
    where lead_id = ${lead} and kind = 'stage' order by created_at, id`;
  return rows as { from: string; to: string }[];
};

const call = (over: Partial<CallInput>): CallInput => ({
  outcome: "talked", treatmentTypes: ["shutters"], motorized: false, windowCountExact: 6, gateCode: null,
  budgetTier: null, notes: null, visitAt: null, followUpAt: null, followUpNote: null, ...over,
});

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}

async function throwsWith(run: () => Promise<unknown>): Promise<string | null> {
  try { await run(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
}

const migrationStatements = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);

test("Contacted stage against a real database", async () => {
  console.log(`\nverify-contacted: writing to ${host}\n`);
  try {
    // 1. The check accepts 'contacted'.
    const raw = await newLead("raw");
    const rawError = await throwsWith(() => sql`update leads set status = 'contacted' where id = ${raw}`);
    check(rawError === null && (await statusOf(raw)) === "contacted", "a raw update to 'contacted' succeeds", `${rawError}`);

    // 2. addContact on a New lead: contacted, one contact event, one stage event new → contacted.
    const fresh = await newLead("contact");
    const added = await addContact(fresh, "Left a voicemail, then spoke", ACTOR);
    check(added === true, "addContact on a new lead returns true", `returned ${added}`);
    check((await statusOf(fresh)) === "contacted", "addContact moves a new lead to contacted", `status is ${await statusOf(fresh)}`);
    const contacts1 = await countKind(fresh, "contact");
    check(contacts1 === 1, "one contact event", `found ${contacts1}`);
    const stages1 = await stageEvents(fresh);
    check(JSON.stringify(stages1) === JSON.stringify([{ from: "new", to: "contacted" }]),
      "exactly one stage event, new → contacted", JSON.stringify(stages1));

    // 3. A second contact on the same lead logs the contact but no second stage event.
    check(await addContact(fresh, "Second contact", ACTOR), "a second addContact returns true", "returned false");
    check((await statusOf(fresh)) === "contacted", "a second addContact leaves it contacted", `status is ${await statusOf(fresh)}`);
    const contacts2 = await countKind(fresh, "contact");
    check(contacts2 === 2, "two contact events after the second", `found ${contacts2}`);
    const stages2 = await stageEvents(fresh);
    check(stages2.length === 1, "still exactly one stage event after the second contact", JSON.stringify(stages2));

    // 4. A contact never moves a job backwards.
    const quoted = await newLead("quoted", "quoted");
    check(await addContact(quoted, "Checking in on the quote", ACTOR), "addContact on a quoted lead returns true", "returned false");
    check((await statusOf(quoted)) === "quoted", "addContact leaves a quoted lead quoted", `status is ${await statusOf(quoted)}`);
    const quotedStages = await stageEvents(quoted);
    check(quotedStages.length === 0, "addContact on a quoted lead logs no stage event", JSON.stringify(quotedStages));

    // 5. A talked call moves a New lead to contacted.
    const talked = await newLead("talked");
    check(await logCall(talked, call({ outcome: "talked" }), ACTOR), "logCall talked returns true", "returned false");
    check((await statusOf(talked)) === "contacted", "a talked call moves a new lead to contacted", `status is ${await statusOf(talked)}`);
    const talkedStages = await stageEvents(talked);
    check(JSON.stringify(talkedStages) === JSON.stringify([{ from: "new", to: "contacted" }]),
      "one stage event new → contacted for the talked call", JSON.stringify(talkedStages));

    // 6. A booked call on that Contacted lead moves it on to visit_booked.
    const visitAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    check(await logCall(talked, call({ outcome: "booked", visitAt }), ACTOR), "logCall booked returns true", "returned false");
    check((await statusOf(talked)) === "visit_booked", "a booked call moves a contacted lead to visit_booked", `status is ${await statusOf(talked)}`);
    const bookedStages = await stageEvents(talked);
    check(JSON.stringify(bookedStages) === JSON.stringify([{ from: "new", to: "contacted" }, { from: "contacted", to: "visit_booked" }]),
      "one stage event contacted → visit_booked, after the new → contacted one", JSON.stringify(bookedStages));
    const visits = await sql`select count(*)::int as n from appointments where lead_id = ${talked} and kind = 'consultation'`;
    check(Number(visits[0].n) === 1, "the booked call books one consultation", `found ${visits[0].n}`);

    // 7. No answer never moves.
    const silent = await newLead("noanswer");
    check(await logCall(silent, call({ outcome: "no_answer" }), ACTOR), "logCall no_answer returns true", "returned false");
    check((await statusOf(silent)) === "new", "a no-answer call leaves a new lead new", `status is ${await statusOf(silent)}`);

    // 8. Re-running 011 and 033 leaves a Contacted lead contacted.
    check((await statusOf(raw)) === "contacted", "before the re-run the lead is contacted", `status is ${await statusOf(raw)}`);
    for (const file of ["db/migrations/011_stages_contact_log.sql", "db/migrations/033_contacted_stage.sql"]) {
      for (const statement of migrationStatements(file)) await sql.query(statement);
    }
    console.log("  ok  migrations 011 and 033 re-run without error");
    check((await statusOf(raw)) === "contacted", "after re-running 011 and 033 a contacted lead is still contacted",
      `status is ${await statusOf(raw)}`);

    // 9. A typo is refused by the database.
    const typo = await throwsWith(() => sql`update leads set status = 'contactd' where id = ${silent}`);
    check(typo?.includes("leads_status_check") ?? false, "status 'contactd' is refused by leads_status_check", `${typo}`);
  } finally {
    // job_events and appointments are independent, so both deletes run even if one throws;
    // leads go last because both reference them. The first failure is then rethrown.
    const cleanup = await Promise.allSettled([
      sql`delete from job_events where lead_id = any(${leadIds}::uuid[])`,
      sql`delete from appointments where lead_id = any(${leadIds}::uuid[])`,
    ]);
    cleanup.push(...(await Promise.allSettled([sql`delete from leads where id = any(${leadIds}::uuid[])`])));
    const failed = cleanup.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;
    const residue = await sql`
      select (select count(*)::int from leads where name like ${`${LEAD_NAME}%`})
           + (select count(*)::int from job_events where lead_id = any(${leadIds}::uuid[]))
           + (select count(*)::int from appointments where lead_id = any(${leadIds}::uuid[])) as n`;
    if (Number(residue[0].n) !== 0) throw new Error(`FAILED: cleanup left ${residue[0].n} rows behind`);
    console.log(`  ok  cleanup removed all ${leadIds.length} leads and their events and appointments`);
  }
});
