/**
 * Behavioural proof of the `and lead_id = ${jobId}` guard in setShared.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is a script you run by hand, it is in no
 * suite, and CI does not execute it. Nothing runs it for you. If you change
 * setShared's guard, run it yourself — and if you cannot, say the guard is
 * unverified rather than assuming it holds.
 *
 * Why it exists: tests/admin/file-sharing.test.ts:50 pins the SQL *text*, which
 * is a tripwire, not a proof. A string match survives a rewrite to a query
 * builder, a migration that drops lead_id, or a refactor that keeps the clause
 * but binds the wrong variable. This script is the only thing that checks what
 * the database actually does, by calling the real setShared — no mocks.
 *
 * What it does, against a throwaway database:
 *   1. inserts two leads and one document belonging to lead A;
 *   2. calls setShared(leadB, fileA, true) — the mismatched pair a caller must
 *      never get away with. It must return false and leave shared_at NULL;
 *   3. calls setShared(leadA, fileA, true) — the positive control, in the same
 *      run, so that "refused" cannot be confused with "the function is broken".
 *      It must return true and set shared_at;
 *   4. deletes its leads, job_files and the job_events setShared wrote, so
 *      repeated runs leave no residue.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. Point it only at a Neon test branch.
 * It takes its connection from E2E_POSTGRES_URL alone — never POSTGRES_URL,
 * DATABASE_URL or .env.local, all of which may hold production credentials —
 * and it refuses to start if that URL looks like production.
 *
 * Usage (bash):
 *   E2E_POSTGRES_URL='<neon test branch url>' \
 *     npx vitest run --config scripts/verify-share-guard.config.mts
 *
 * Usage (PowerShell):
 *   $env:E2E_POSTGRES_URL='<neon test branch url>'
 *   npx vitest run --config scripts/verify-share-guard.config.mts
 *
 * To watch it fail (which is the only way to know it works): delete
 * ` and lead_id = ${jobId}` from setShared in lib/admin/files.ts and run it
 * again. Step 2 must fail. Put the clause back.
 */
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test } from "vitest";
import { setShared } from "../lib/admin/files";

/** Endpoints this script must never write to. Production is the whole point of the list. */
const FORBIDDEN_HOSTS = ["ep-cold-term"];

const BANNER = "\n================ verify-share-guard REFUSED TO RUN ================\n";

function refuse(reason: string): never {
  // Printed as well as thrown: the thrown message is what sets the exit code,
  // the print is what a human actually reads in the terminal.
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-share-guard refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse(
    "E2E_POSTGRES_URL is not set.\n\n" +
      "This script WRITES rows, so it will not fall back to POSTGRES_URL, DATABASE_URL\n" +
      "or .env.local — any of which may point at production. Give it a Neon test branch:\n\n" +
      "  E2E_POSTGRES_URL='<neon test branch url>' \\\n" +
      "    npx vitest run --config scripts/verify-share-guard.config.mts\n\n" +
      "It does not skip. No result means it did not run, not that the guard holds.",
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

// setShared reads the connection through lib/db's db(), at call time, from
// POSTGRES_URL. Set it from the vetted URL so the module under test cannot
// reach anything this script has not just checked.
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;

const sql = neon(url);
const ACTOR = "verify-share-guard@example.com";
const STAMP = Date.now();
const LEAD_NAME = `VERIFY Share Guard ${STAMP}`;

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}

const sharedAtOf = async (fileId: string): Promise<string | null> => {
  const rows = await sql`select shared_at from job_files where id = ${fileId}`;
  return (rows[0]?.shared_at as string | null) ?? null;
};

const newLead = async (suffix: string): Promise<string> => {
  const rows = await sql`
    insert into leads (name, phone, email, city, source, status)
    values (${`${LEAD_NAME} ${suffix}`}, '7025550199', ${`verify-${STAMP}-${suffix}@example.com`},
            'Henderson', 'phone', 'quoted')
    returning id`;
  return rows[0].id as string;
};

test("setShared refuses a file belonging to another job, and shares the right one", async () => {
  console.log(`\nverify-share-guard: writing to ${host}\n`);

  const leadA = await newLead("A");
  const leadB = await newLead("B");
  const fileId = randomUUID();

  // Inserted directly rather than through createFile, which would upload a blob.
  // Every column here is NOT NULL with no default.
  await sql`
    insert into job_files (id, lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname)
    values (${fileId}, ${leadA}, ${ACTOR}, 'document', ${`verify-${STAMP}.pdf`},
            'application/pdf', 1024, ${`verify/${fileId}.pdf`})`;

  try {
    // 1. The mismatched pair: lead B's id carrying lead A's file.
    const refused = await setShared(leadB, fileId, true, ACTOR);
    check(refused === false, "the mismatched pair is refused", `setShared returned ${refused}, wanted false`);

    const afterAttempt = await sharedAtOf(fileId);
    check(
      afterAttempt === null,
      "the file is still private after the mismatched call",
      `shared_at is ${afterAttempt}, wanted NULL — A CROSS-JOB SHARE HAPPENED`,
    );

    // 2. The positive control: the same file under its own job must share, or
    //    step 1 proves nothing more than that the function does not work.
    const accepted = await setShared(leadA, fileId, true, ACTOR);
    check(accepted === true, "the correct pair is accepted", `setShared returned ${accepted}, wanted true`);

    const afterShare = await sharedAtOf(fileId);
    check(
      afterShare !== null,
      "the correct pair sets shared_at",
      `shared_at is still NULL — the control failed, so the refusal above means nothing`,
    );

    console.log(
      "\nPASSED: the lead_id guard refuses a file from another job and still shares the right one.\n" +
        "This was a manual run. It proves the guard as of now; it is not ongoing coverage.\n",
    );
  } finally {
    // Runs even on failure, so a red run leaves no residue either.
    await sql`delete from job_events where lead_id in (${leadA}, ${leadB})`;
    await sql`delete from job_files where lead_id in (${leadA}, ${leadB})`;
    await sql`delete from leads where id in (${leadA}, ${leadB})`;
  }
});
