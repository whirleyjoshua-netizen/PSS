/**
 * Behavioural proof of designer notes and the event-body hash: migration 035, saveAppointment and
 * setAppointmentNotes in lib/admin/appointments.ts,
 * and getCalendarJob / saveLink / getLinks / getLinkByEvent in lib/calendar/store.ts.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is a script you run by hand, it is in no
 * suite, and CI does not execute it. Nothing runs it for you. If you change any of the
 * functions above or migration 035, run it yourself — and if you cannot, say the designer-notes
 * rules are unverified rather than assuming they hold.
 *
 * Why it exists: the unit tests mock the database, so they pin the SQL *text*, which is a tripwire,
 * not a proof. Whether a notes edit really leaves confirmed_at alone, whether the gate code really
 * stays out of job_events, whether the length check really exists and whether migration 035 really
 * re-runs are things only the database can answer. This script calls the real functions — no mocks.
 * It never calls Outlook.
 *
 * What it does, against a throwaway database, with one lead it inserts ("VERIFY Designer Notes <stamp>"):
 *   1. runs every statement of 035_designer_notes.sql twice — the second run must not throw;
 *   2. books a measure with notes and a gate code — "ok", the notes on the row, unconfirmed, the
 *      gate code on the lead, and no job_events body holding the gate code or the notes;
 *   3. listAppointments reads the notes back;
 *   4. confirms it, then setAppointmentNotes with new notes and a new gate code — "ok", the notes
 *      and gate code change, confirmed_at / confirmed_by / updated_at are exactly as before, one
 *      "Measure notes updated" event, and still no body holding the gate code or the notes;
 *   5. setAppointmentNotes without a gate code leaves the gate code alone;
 *   6. setAppointmentNotes with another job's id is "missing" and changes nothing;
 *   7. getCalendarJob returns the gate code and the confirmed measure's notes;
 *   8. saveLink stores a body hash, getLinks and getLinkByEvent read it back, a second saveLink
 *      replaces it, and a claim (claimLink) has a null hash;
 *   9. (removed 2026-10-01: Job details no longer edits the gate code)
 *  10. rescheduling (saveAppointment again) keeps the notes it is given and un-confirms; with
 *      keepNotes true it leaves the row's notes unchanged, with keepNotes false it sets them, and
 *      keepNotes on a kind with no row yet books it with no notes;
 *  11. a raw update setting 2001 characters of notes THROWS appointments_designer_notes_check.
 * Then it deletes its job_calendar_events, job_events, appointments and lead, so repeated runs leave
 * no residue.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. Point it only at a Neon test branch. Step 1 re-runs
 * migration 035 against the whole branch.
 * It takes its connection from E2E_POSTGRES_URL alone — never POSTGRES_URL,
 * DATABASE_URL or .env.local, all of which may hold production credentials —
 * and it refuses to start if that URL looks like production (ep-cold-term).
 *
 * Usage (bash):
 *   E2E_POSTGRES_URL='<neon test branch url>' \
 *     npx vitest run --config scripts/verify-designer-notes.config.mts --silent=false --reporter=verbose
 *
 * (--silent=false --reporter=verbose is what shows each "ok" line.)
 *
 * To watch it fail (which is the only way to know it works), one at a time:
 *   - in setAppointmentNotes, add `, confirmed_at = null` after `designer_notes = ${details.designerNotes}::text`
 *     — step 4 "confirmed_at is unchanged" must fail;
 *   - in setAppointmentNotes, change the log body to `'notes: ' || ${details.designerNotes}::text`
 *     — step 4 `one event "Measure notes updated"` must fail (it is the first check to see the
 *     changed body: no event has that exact text any more);
 *   - in saveAppointment, change the upsert to `designer_notes = excluded.designer_notes`
 *     — step 10 "keepNotes true leaves the row's notes unchanged" must fail;
 *   - in saveLink, drop `body_hash = excluded.body_hash, ` — step 8 "a second saveLink replaces the hash" must fail.
 * Put each back.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { test } from "vitest";
import { confirmAppointment, listAppointments, saveAppointment, setAppointmentNotes } from "../lib/admin/appointments";
import { claimLink, getCalendarJob, getLinkByEvent, getLinks, saveLink } from "../lib/calendar/store";

/** Endpoints this script must never write to. Production is the whole point of the list. */
const FORBIDDEN_HOSTS = ["ep-cold-term"];

const BANNER = "\n================ verify-designer-notes REFUSED TO RUN ================\n";

function refuse(reason: string): never {
  // Printed as well as thrown: the thrown message is what sets the exit code,
  // the print is what a human actually reads in the terminal.
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-designer-notes refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse(
    "E2E_POSTGRES_URL is not set.\n\n" +
      "This script WRITES rows, so it will not fall back to POSTGRES_URL, DATABASE_URL\n" +
      "or .env.local — any of which may point at production. Give it a Neon test branch:\n\n" +
      "  E2E_POSTGRES_URL='<neon test branch url>' \\\n" +
      "    npx vitest run --config scripts/verify-designer-notes.config.mts\n\n" +
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
        "This script inserts and deletes rows and re-runs a migration. Running it there would\n" +
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
const LEAD_NAME = `VERIFY Designer Notes ${STAMP}`;
const ACTOR = "verify-designer-notes@example.com";
const GATE_1 = `#G1-${STAMP}`;
const GATE_2 = `#G2-${STAMP}`;
const NOTES_1 = `Side gate sticks ${STAMP}\nDog in the yard`;
const NOTES_2 = `Bring motorized samples ${STAMP}`;
const AT = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
const NO_TIMING = { windowStart: null, windowEnd: null, durationMinutes: null };

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}

const statements = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);

/** Timestamps as Postgres text, so "unchanged" is checked to the microsecond. */
const appointmentRow = async (lead: string) => {
  const rows = await sql`
    select id, designer_notes, confirmed_at::text as confirmed_at, confirmed_by, updated_at::text as updated_at
      from appointments where lead_id = ${lead} and kind = 'measure'`;
  return rows[0] as {
    id: string; designer_notes: string | null; confirmed_at: string | null; confirmed_by: string | null; updated_at: string;
  };
};

const gateOf = async (lead: string): Promise<string | null> => {
  const rows = await sql`select gate_code from leads where id = ${lead}`;
  return (rows[0]?.gate_code as string | null) ?? null;
};

/** Bodies of this lead's events that contain any of the given secrets. */
const leaking = async (lead: string, secrets: string[]): Promise<string[]> => {
  const rows = await sql`select coalesce(body, '') as body from job_events where lead_id = ${lead}`;
  return rows.map((row) => row.body as string).filter((body) => secrets.some((secret) => body.includes(secret)));
};

async function throwsWith(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

test("designer notes and the event-body hash against a real database", async () => {
  console.log(`\nverify-designer-notes: writing to ${host}\n`);

  // 1. Migration 035, twice: every statement must be safe to re-run.
  for (let run = 1; run <= 2; run += 1) {
    for (const statement of statements("db/migrations/035_designer_notes.sql")) await sql.query(statement);
  }
  check(true, "migration 035 ran twice without an error", "");

  const rows = await sql`
    insert into leads (name, phone, email, city, source, status)
    values (${LEAD_NAME}, '7025550199', ${`verify-notes-${STAMP}@example.com`}, 'Henderson', 'phone', 'quoted')
    returning id`;
  const lead = rows[0].id as string;
  const eventId = `verify-notes-${STAMP}`;

  try {
    // 2. Book with notes and a gate code.
    const booked = await saveAppointment(lead, "measure", AT, false, NO_TIMING, ACTOR, { designerNotes: NOTES_1, keepNotes: false, gateCode: GATE_1 });
    check(booked === "ok", "booking a measure with notes and a gate code is accepted", `saveAppointment returned ${booked}`);
    const first = await appointmentRow(lead);
    check(first.designer_notes === NOTES_1, "the notes are on the appointment, line break kept", `designer_notes is ${JSON.stringify(first.designer_notes)}`);
    check(first.confirmed_at === null, "the booking is unconfirmed", `confirmed_at is ${first.confirmed_at}`);
    check((await gateOf(lead)) === GATE_1, "the gate code is on the client", `gate_code is ${await gateOf(lead)}`);
    const leak2 = await leaking(lead, [GATE_1, NOTES_1, `Side gate sticks ${STAMP}`]);
    check(leak2.length === 0, "no job_events body holds the gate code or the notes", `leaking bodies: ${JSON.stringify(leak2)}`);

    // 3. Read back through listAppointments.
    const listed = await listAppointments(lead);
    check(listed[0]?.designerNotes === NOTES_1, "listAppointments reads the notes", `designerNotes is ${JSON.stringify(listed[0]?.designerNotes)}`);

    // 4. Confirm, then edit the notes and the gate code: still confirmed, nothing else moved.
    const confirmed = await confirmAppointment(first.id, ACTOR);
    check(typeof confirmed === "object", "the measure is confirmed", `confirmAppointment returned ${JSON.stringify(confirmed)}`);
    const before = await appointmentRow(lead);
    const edited = await setAppointmentNotes(lead, first.id, { designerNotes: NOTES_2, gateCode: GATE_2 }, ACTOR);
    check(edited === "ok", "editing the notes is accepted", `setAppointmentNotes returned ${edited}`);
    const after = await appointmentRow(lead);
    check(after.designer_notes === NOTES_2, "the notes changed", `designer_notes is ${JSON.stringify(after.designer_notes)}`);
    check(
      after.confirmed_at === before.confirmed_at && after.confirmed_at !== null,
      "confirmed_at is unchanged — a notes edit never un-confirms",
      `before ${before.confirmed_at}, after ${after.confirmed_at} — NOTES EDIT TOUCHED THE CONFIRMATION`,
    );
    check(after.confirmed_by === ACTOR, "confirmed_by is unchanged", `confirmed_by is ${after.confirmed_by}`);
    check(after.updated_at === before.updated_at, "updated_at is unchanged (the route planner reads it)",
      `before ${before.updated_at}, after ${after.updated_at}`);
    check((await gateOf(lead)) === GATE_2, "the gate code changed on the client", `gate_code is ${await gateOf(lead)}`);
    const notesEvents = await sql`select count(*)::int as n from job_events where lead_id = ${lead} and body = 'Measure notes updated'`;
    check(Number(notesEvents[0].n) === 1, `one event "Measure notes updated"`, `found ${notesEvents[0].n}`);
    const leak4 = await leaking(lead, [GATE_1, GATE_2, NOTES_1, NOTES_2]);
    check(leak4.length === 0, "still no job_events body holds a gate code or notes", `leaking bodies: ${JSON.stringify(leak4)}`);

    // 5. Without a gate code, the gate code is left alone.
    await setAppointmentNotes(lead, first.id, { designerNotes: NOTES_2 }, ACTOR);
    check((await gateOf(lead)) === GATE_2, "a notes edit without a gate code leaves it alone", `gate_code is ${await gateOf(lead)}`);

    // 6. Another job's id finds nothing and changes nothing.
    const wrongJob = await setAppointmentNotes(randomUUID(), first.id, { designerNotes: "nope" }, ACTOR);
    check(wrongJob === "missing", "another job's id is \"missing\"", `setAppointmentNotes returned ${wrongJob}`);
    check((await appointmentRow(lead)).designer_notes === NOTES_2, "and the notes are untouched", "");

    // 7. The calendar's view of the job.
    const job = await getCalendarJob(lead);
    check(job?.gateCode === GATE_2, "getCalendarJob reads the gate code", `gateCode is ${job?.gateCode}`);
    check(
      job?.appointments.length === 1 && job.appointments[0].designerNotes === NOTES_2,
      "getCalendarJob reads the confirmed measure's notes",
      `appointments are ${JSON.stringify(job?.appointments)}`,
    );

    // 8. The body hash on the link.
    await saveLink({ leadId: lead, kind: "measure", eventId, changeKey: "ck1", bodyHash: "hash-1" });
    const links = await getLinks(lead);
    check(links[0]?.bodyHash === "hash-1", "getLinks reads the stored body hash", `links are ${JSON.stringify(links)}`);
    await saveLink({ leadId: lead, kind: "measure", eventId, changeKey: "ck2", bodyHash: "hash-2" });
    const byEvent = await getLinkByEvent(eventId);
    check(byEvent?.bodyHash === "hash-2" && byEvent.changeKey === "ck2", "a second saveLink replaces the hash and changeKey",
      `link is ${JSON.stringify(byEvent)}`);
    const claim = await claimLink(lead, "consultation");
    const claimed = (await getLinks(lead)).find((l) => l.kind === "consultation");
    check(claim !== null && claimed?.bodyHash === null, "a claim has no body hash", `claim link is ${JSON.stringify(claimed)}`);

    // 10. A reschedule keeps the notes the dialog sends, and un-confirms as before.
    const later = new Date(AT.getTime() + 24 * 60 * 60 * 1000);
    await saveAppointment(lead, "measure", later, false, NO_TIMING, ACTOR, { designerNotes: NOTES_2, keepNotes: false });
    const moved = await appointmentRow(lead);
    check(moved.designer_notes === NOTES_2, "a reschedule keeps the notes it was given", `designer_notes is ${JSON.stringify(moved.designer_notes)}`);
    check(moved.confirmed_at === null, "a reschedule still un-confirms", `confirmed_at is ${moved.confirmed_at}`);
    // A booking that is not that appointment's own Reschedule keeps its notes (keepNotes true).
    const kept = await saveAppointment(lead, "measure", AT, false, NO_TIMING, ACTOR, { designerNotes: null, keepNotes: true });
    check(kept === "ok", "a booking with keepNotes true is accepted", `saveAppointment returned ${kept}`);
    const keptRow = await appointmentRow(lead);
    check(keptRow.designer_notes === NOTES_2, "keepNotes true leaves the row's notes unchanged",
      `designer_notes is ${JSON.stringify(keptRow.designer_notes)} — A BOOKING WIPED THE NOTES`);
    await saveAppointment(lead, "measure", later, false, NO_TIMING, ACTOR, { designerNotes: NOTES_1, keepNotes: false });
    check((await appointmentRow(lead)).designer_notes === NOTES_1, "keepNotes false sets the notes it was given",
      `designer_notes is ${JSON.stringify((await appointmentRow(lead)).designer_notes)}`);
    await saveAppointment(lead, "install", later, true, NO_TIMING, ACTOR, { designerNotes: "ignored", keepNotes: true });
    const install = await sql`select designer_notes from appointments where lead_id = ${lead} and kind = 'install'`;
    check(install.length === 1 && install[0].designer_notes === null, "keepNotes on a kind with no row books it with no notes",
      `install rows are ${JSON.stringify(install)}`);

    // 11. The database itself caps the notes.
    const tooLong = await throwsWith(() => sql`update appointments set designer_notes = ${"x".repeat(2001)} where id = ${first.id}`);
    check(
      tooLong !== null && tooLong.includes("appointments_designer_notes_check"),
      "a raw update with 2001 characters of notes throws appointments_designer_notes_check",
      tooLong === null ? "the raw update succeeded — THE DATABASE DOES NOT CAP THE NOTES" : `it threw something else: ${tooLong}`,
    );

    console.log(
      "\nPASSED: designer notes and the body hash behave as designed against a real database.\n" +
        "This was a manual run. It proves the rules as of now; it is not ongoing coverage.\n",
    );
  } finally {
    // Runs even on failure, so a red run leaves no residue either.
    await sql`delete from job_calendar_events where lead_id = ${lead}`;
    await sql`delete from job_events where lead_id = ${lead}`;
    await sql`delete from appointments where lead_id = ${lead}`;
    await sql`delete from leads where id = ${lead}`;
  }
});
