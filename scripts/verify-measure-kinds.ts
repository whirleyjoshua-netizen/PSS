/**
 * Behavioural proof of designer vs official measures in lib/admin/measurements.ts.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is a script you run by hand, it is in no
 * suite, and CI does not execute it. Nothing runs it for you. If you change
 * addMeasurement, setKeptOfficial, updateMeasurement, deleteMeasurement or
 * migration 031, run it yourself — and if you cannot, say the measure-kind rules
 * are unverified rather than assuming they hold.
 *
 * Why it exists: tests/admin/measurements.test.ts mocks the database, so it pins
 * the SQL *text*, which is a tripwire, not a proof. Whether the `allowed` CTE
 * really refuses an official window, whether re-ticking really changes nothing,
 * and whether the CHECK constraints really exist are things only the database
 * can answer. This script calls the real functions — no mocks.
 *
 * What it does, against a throwaway database, with one lead it inserts:
 *   1. adds a designer window — kind 'designer', event "Added window (designer): Kitchen";
 *   2. keeps the designer measure as official — "ok", who and when recorded, one event;
 *   3. keeps it again — "unchanged", still exactly one such event;
 *   4. adds an official window while kept — refused "kept", no official row, no event;
 *   5. reads the measure set — kept by the actor, one designer window;
 *   6. unkeeps — "ok", both columns null, event "Designer measure no longer kept as official";
 *   7. adds an official window "Den" and edits it — still 'official', event
 *      "Edited window (official): Den";
 *   8. tries to keep the designer measure now that an official window exists —
 *      "has-official", columns still null;
 *   9. deletes the official window — event "Deleted window (official): Den";
 *  10. a raw insert with kind 'final' THROWS window_measurements_kind_check, and a raw
 *      update setting designer_kept_official_at without _by THROWS
 *      leads_designer_kept_official_check — the database is a guard, not only our code;
 *  11. a lead that does not exist gives { refused: "missing" } and "missing".
 * Then it deletes its job_events, window_measurements and lead, so repeated runs
 * leave no residue.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. Point it only at a Neon test branch.
 * It takes its connection from E2E_POSTGRES_URL alone — never POSTGRES_URL,
 * DATABASE_URL or .env.local, all of which may hold production credentials —
 * and it refuses to start if that URL looks like production.
 *
 * Usage (bash):
 *   E2E_POSTGRES_URL='<neon test branch url>' \
 *     npx vitest run --config scripts/verify-measure-kinds.config.mts
 *
 * Usage (PowerShell):
 *   $env:E2E_POSTGRES_URL='<neon test branch url>'
 *   npx vitest run --config scripts/verify-measure-kinds.config.mts
 *
 * To watch it fail (which is the only way to know it works), in lib/admin/measurements.ts:
 *   - replace the whole `where …` of addMeasurement's `allowed` CTE with `where true` —
 *     step 4 must fail (deleting only `or designer_kept_official_at is null` refuses every
 *     official window, so step 4 would still pass);
 *   - delete the whole `and (not ${kept}::boolean or not exists (select 1 from official))`
 *     line from setKeptOfficial — step 8 must fail (deleting only the `not exists` part
 *     leaves invalid SQL, and step 2 fails instead);
 *   - delete `and (designer_kept_official_at is not null) <> ${kept}::boolean` from
 *     setKeptOfficial — step 3 must fail.
 * Put each back.
 */
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test } from "vitest";
import {
  addMeasurement,
  deleteMeasurement,
  getMeasureSet,
  setKeptOfficial,
  updateMeasurement,
} from "../lib/admin/measurements";
import { measurementSchema } from "../lib/admin/schema";

/** Endpoints this script must never write to. Production is the whole point of the list. */
const FORBIDDEN_HOSTS = ["ep-cold-term"];

const BANNER = "\n================ verify-measure-kinds REFUSED TO RUN ================\n";

function refuse(reason: string): never {
  // Printed as well as thrown: the thrown message is what sets the exit code,
  // the print is what a human actually reads in the terminal.
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-measure-kinds refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse(
    "E2E_POSTGRES_URL is not set.\n\n" +
      "This script WRITES rows, so it will not fall back to POSTGRES_URL, DATABASE_URL\n" +
      "or .env.local — any of which may point at production. Give it a Neon test branch:\n\n" +
      "  E2E_POSTGRES_URL='<neon test branch url>' \\\n" +
      "    npx vitest run --config scripts/verify-measure-kinds.config.mts\n\n" +
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

const sql = neon(url);
const ACTOR = "verify-measure-kinds@example.com";
const STAMP = Date.now();
const LEAD_NAME = `VERIFY Measure Kinds ${STAMP}`;

// A valid window as the form would send it. No label, so the event reads "…: Kitchen".
const input = measurementSchema.parse({
  room: "Kitchen", label: "", widthIn: "35", widthEighth: "5", heightIn: "48", heightEighth: "0",
  depthIn: "", depthEighth: "0", mount: "inside", requirements: [], notes: "", photoFileId: "",
});

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}

const newLead = async (suffix: string): Promise<string> => {
  const rows = await sql`
    insert into leads (name, phone, email, city, source, status)
    values (${`${LEAD_NAME} ${suffix}`}, '7025550199', ${`verify-${STAMP}-${suffix}@example.com`},
            'Henderson', 'phone', 'quoted')
    returning id`;
  return rows[0].id as string;
};

const eventCount = async (lead: string, body: string): Promise<number> => {
  const rows = await sql`select count(*)::int as n from job_events where lead_id = ${lead} and body = ${body}`;
  return Number(rows[0].n);
};

const kindOf = async (windowId: string): Promise<string | null> => {
  const rows = await sql`select kind from window_measurements where id = ${windowId}`;
  return (rows[0]?.kind as string | undefined) ?? null;
};

const keptOf = async (lead: string): Promise<{ at: unknown; by: unknown }> => {
  const rows = await sql`select designer_kept_official_at as at, designer_kept_official_by as by from leads where id = ${lead}`;
  return { at: rows[0].at, by: rows[0].by };
};

async function throwsWith(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

test("measure kinds against a real database", async () => {
  console.log(`\nverify-measure-kinds: writing to ${host}\n`);

  const lead = await newLead("MK");

  try {
    // 1. A designer window, labelled as such in the row and the event.
    const designer = await addMeasurement(lead, "designer", input, ACTOR);
    check("id" in designer, "a designer window is added", `addMeasurement returned ${JSON.stringify(designer)}`);
    const designerId = (designer as { id: string }).id;
    const designerKind = await kindOf(designerId);
    check(designerKind === "designer", "the row's kind is 'designer'", `kind is ${designerKind}`);
    const addedDesigner = await eventCount(lead, "Added window (designer): Kitchen");
    check(addedDesigner === 1, `one event "Added window (designer): Kitchen"`, `found ${addedDesigner}`);

    // 2. Keep the designer measure as official: who and when, one event.
    const kept = await setKeptOfficial(lead, true, ACTOR);
    check(kept === "ok", "keeping the designer measure as official is accepted", `setKeptOfficial returned ${kept}`);
    const afterKeep = await keptOf(lead);
    check(
      afterKeep.by === ACTOR && afterKeep.at !== null,
      "designer_kept_official_by is the actor and _at is set",
      `by is ${afterKeep.by}, at is ${afterKeep.at}`,
    );
    const keptEvents = await eventCount(lead, "Designer measure kept as official");
    check(keptEvents === 1, `one event "Designer measure kept as official"`, `found ${keptEvents}`);

    // 3. Asking again changes nothing and logs nothing.
    const again = await setKeptOfficial(lead, true, ACTOR);
    check(again === "unchanged", "keeping it again is \"unchanged\"", `setKeptOfficial returned ${again}`);
    const keptEventsAgain = await eventCount(lead, "Designer measure kept as official");
    check(keptEventsAgain === 1, "still exactly one \"kept as official\" event", `found ${keptEventsAgain} — RE-TICKING LOGGED AGAIN`);

    // 4. While kept, an official window is refused: no row, no event.
    const refusedOfficial = await addMeasurement(lead, "official", input, ACTOR);
    check(
      "refused" in refusedOfficial && refusedOfficial.refused === "kept",
      "an official window is refused while the designer measure is kept",
      `addMeasurement returned ${JSON.stringify(refusedOfficial)} — TWO OFFICIAL LISTS`,
    );
    const officialRows = await sql`select count(*)::int as n from window_measurements where lead_id = ${lead} and kind = 'official'`;
    check(Number(officialRows[0].n) === 0, "there is no official row", `found ${officialRows[0].n}`);
    const officialEvents = await sql`select count(*)::int as n from job_events where lead_id = ${lead} and body like '%(official)%'`;
    check(Number(officialEvents[0].n) === 0, "there is no \"(official)\" event", `found ${officialEvents[0].n}`);

    // 5. The measure set reads back what was stored.
    const set = await getMeasureSet(lead);
    check(set.kept?.by === ACTOR, "getMeasureSet says it is kept, by the actor", `kept is ${JSON.stringify(set.kept)}`);
    check(
      set.windows.length === 1 && set.windows[0].kind === "designer",
      "getMeasureSet has the one designer window",
      `windows are ${JSON.stringify(set.windows.map((w) => w.kind))}`,
    );

    // 6. Unkeep: both columns cleared together, with its event.
    const unkept = await setKeptOfficial(lead, false, ACTOR);
    check(unkept === "ok", "unkeeping is accepted", `setKeptOfficial returned ${unkept}`);
    const afterUnkeep = await keptOf(lead);
    check(
      afterUnkeep.at === null && afterUnkeep.by === null,
      "both kept columns are null",
      `at is ${afterUnkeep.at}, by is ${afterUnkeep.by}`,
    );
    const unkeptEvents = await eventCount(lead, "Designer measure no longer kept as official");
    check(unkeptEvents === 1, `one event "Designer measure no longer kept as official"`, `found ${unkeptEvents}`);

    // 7. Now an official window goes in, and editing it keeps its kind.
    const den = { ...input, room: "Den" };
    const official = await addMeasurement(lead, "official", den, ACTOR);
    check("id" in official, "an official window is added once not kept", `addMeasurement returned ${JSON.stringify(official)}`);
    const officialId = (official as { id: string }).id;
    const edited = await updateMeasurement(lead, officialId, den, ACTOR);
    check(edited === true, "the official window is edited", `updateMeasurement returned ${edited}`);
    const officialKind = await kindOf(officialId);
    check(officialKind === "official", "the edited row is still 'official'", `kind is ${officialKind}`);
    const editRows = await sql`select body from job_events where lead_id = ${lead} and body like 'Edited %'`;
    check(
      editRows.length === 1 && editRows[0].body === "Edited window (official): Den",
      `the edit event reads exactly "Edited window (official): Den"`,
      `edit events are ${JSON.stringify(editRows.map((row) => row.body))}`,
    );

    // 8. With an official window present, the designer measure cannot be kept.
    const blocked = await setKeptOfficial(lead, true, ACTOR);
    check(blocked === "has-official", "keeping is refused while an official window exists", `setKeptOfficial returned ${blocked} — TWO OFFICIAL LISTS`);
    const afterBlocked = await keptOf(lead);
    check(
      afterBlocked.at === null && afterBlocked.by === null,
      "the kept columns are still null",
      `at is ${afterBlocked.at}, by is ${afterBlocked.by}`,
    );

    // 9. Deleting the official window names its kind.
    const deleted = await deleteMeasurement(lead, officialId, ACTOR);
    check(deleted === true, "the official window is deleted", `deleteMeasurement returned ${deleted}`);
    const deletedEvents = await eventCount(lead, "Deleted window (official): Den");
    check(deletedEvents === 1, `one event "Deleted window (official): Den"`, `found ${deletedEvents}`);

    // 10. The database itself refuses an unknown kind and a half-recorded keep.
    const badKind = await throwsWith(() => sql`
      insert into window_measurements (lead_id, measured_by, position, room, width_eighths, height_eighths, mount, kind)
      values (${lead}, ${ACTOR}, 99, 'Bad', 8, 8, 'inside', 'final')`);
    check(
      badKind !== null && badKind.includes("window_measurements_kind_check"),
      "a raw insert with kind 'final' throws window_measurements_kind_check",
      badKind === null ? "the raw insert succeeded — THE DATABASE DOES NOT GUARD KIND" : `it threw something else: ${badKind}`,
    );
    const halfKept = await throwsWith(() => sql`update leads set designer_kept_official_at = now() where id = ${lead}`);
    check(
      halfKept !== null && halfKept.includes("leads_designer_kept_official_check"),
      "a raw update setting _at without _by throws leads_designer_kept_official_check",
      halfKept === null ? "the raw update succeeded — THE DATABASE DOES NOT GUARD WHO AND WHEN" : `it threw something else: ${halfKept}`,
    );

    // 11. A lead that does not exist is "missing", not "kept" and not a crash.
    const ghostAdd = await addMeasurement(randomUUID(), "designer", input, ACTOR);
    check(
      "refused" in ghostAdd && ghostAdd.refused === "missing",
      "adding to a lead that does not exist is refused as missing",
      `addMeasurement returned ${JSON.stringify(ghostAdd)}`,
    );
    const ghostKeep = await setKeptOfficial(randomUUID(), true, ACTOR);
    check(ghostKeep === "missing", "keeping on a lead that does not exist is \"missing\"", `setKeptOfficial returned ${ghostKeep}`);

    console.log(
      "\nPASSED: designer and official measures behave as designed against a real database.\n" +
        "This was a manual run. It proves the rules as of now; it is not ongoing coverage.\n",
    );
  } finally {
    // Runs even on failure, so a red run leaves no residue either.
    await sql`delete from job_events where lead_id = ${lead}`;
    await sql`delete from window_measurements where lead_id = ${lead}`;
    await sql`delete from leads where id = ${lead}`;
  }
});
