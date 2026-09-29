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
 * A second case proves a Dealer Copy (doc_type 'dealer_copy', which shows dealer
 * cost) can never reach a customer, and that the DATABASE is the guard:
 *   1. setShared(lead, dealerCopy, true) returns false and shared_at stays NULL;
 *   2. a raw `update job_files set shared_at = now()` on it THROWS the
 *      job_files_dealer_copy_never_shared check violation — our code is not
 *      the only thing standing in the way;
 *   3. setDocType(lead, dealerCopy, 'other') returns false and the row keeps
 *      'dealer_copy', so it cannot be relabelled and then shared. A plain
 *      document still relabels, as the control;
 *   4. with a dc_quote_versions row naming the Dealer Copy as its source and a
 *      plain document as its contract, deleteFile refuses both (false, no
 *      exception); once that row is gone, deleteFile removes the plain one —
 *      the positive control.
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
 * again. Step 2 must fail. Put the clause back. For the Dealer Copy case, delete
 * `and doc_type is distinct from 'dealer_copy'` from setShared (step 1 then
 * throws the check violation) or from setDocType (step 3 then relabels), or the
 * dc_quote_versions `not exists` from deleteFile (step 4 then throws the foreign
 * key violation). Put each back.
 */
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test, vi } from "vitest";
import { deleteFile, setDocType, setShared } from "../lib/admin/files";

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

const docTypeOf = async (fileId: string): Promise<string | null> => {
  const rows = await sql`select doc_type from job_files where id = ${fileId}`;
  return (rows[0]?.doc_type as string | null) ?? null;
};

const fileExists = async (fileId: string): Promise<boolean> =>
  (await sql`select 1 from job_files where id = ${fileId}`).length > 0;

test("a Dealer Copy is never shared, never relabelled, and never deleted while a quote version names it", async () => {
  console.log(`\nverify-share-guard (Dealer Copy): writing to ${host}\n`);

  const lead = await newLead("DC");
  const dealerCopy = randomUUID();
  const plain = randomUUID();
  const versionId = randomUUID();

  // Inserted directly rather than through createFile, which would upload a blob.
  await sql`
    insert into job_files (id, lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname, doc_type)
    values (${dealerCopy}, ${lead}, ${ACTOR}, 'document', ${`DEALER COPY verify-${STAMP}.html`},
            'text/html', 1024, ${`verify/${dealerCopy}.html`}, 'dealer_copy'),
           (${plain}, ${lead}, ${ACTOR}, 'document', ${`verify-${STAMP}-contract.pdf`},
            'application/pdf', 1024, ${`verify/${plain}.pdf`}, null)`;

  try {
    // 1. Our code refuses to share it, without raising.
    const shared = await setShared(lead, dealerCopy, true, ACTOR);
    check(shared === false, "setShared refuses a Dealer Copy", `setShared returned ${shared}, wanted false`);
    const afterShare = await sharedAtOf(dealerCopy);
    check(afterShare === null, "the Dealer Copy is still private", `shared_at is ${afterShare} — A DEALER COPY WAS SHARED`);

    // 2. The database refuses it even when our code is bypassed.
    let rawError: unknown = null;
    try {
      await sql`update job_files set shared_at = now() where id = ${dealerCopy}`;
    } catch (error) {
      rawError = error;
    }
    const rawMessage = rawError instanceof Error ? rawError.message : String(rawError);
    check(
      rawError !== null && rawMessage.includes("job_files_dealer_copy_never_shared"),
      "a raw UPDATE sharing it throws the job_files_dealer_copy_never_shared check violation",
      rawError === null ? "the raw UPDATE succeeded — THE DATABASE DOES NOT GUARD IT" : `it threw something else: ${rawMessage}`,
    );
    const afterRaw = await sharedAtOf(dealerCopy);
    check(afterRaw === null, "the Dealer Copy is still private after the raw UPDATE", `shared_at is ${afterRaw}`);

    // 3. It cannot be relabelled into something shareable; a plain document still can.
    const relabelled = await setDocType(lead, dealerCopy, "other", ACTOR);
    check(relabelled === false, "setDocType refuses to relabel a Dealer Copy", `setDocType returned ${relabelled}, wanted false`);
    const typeAfter = await docTypeOf(dealerCopy);
    check(typeAfter === "dealer_copy", "the Dealer Copy keeps doc_type 'dealer_copy'", `doc_type is ${typeAfter}`);
    const control = await setDocType(lead, plain, "contract", ACTOR);
    check(control === true, "setDocType still labels a plain document (control)", `setDocType returned ${control}, wanted true`);

    // 4. A quote version naming the Dealer Copy (source) and the plain file (contract) keeps both.
    await sql`
      insert into dc_quote_versions (id, lead_id, version, dc_quote_no, po_reference, source_file_id, source_sha256,
                                     status, dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents,
                                     dealer_total_cents, contract_file_id)
      values (${versionId}, ${lead}, 1, ${`VERIFY-${STAMP}`}, ${`VERIFY-${STAMP}`}, ${dealerCopy}, 'verify',
              'draft', 0, 0, 0, 0, ${plain})`;
    const sourceDeleted = await deleteFile(dealerCopy, ACTOR);
    check(sourceDeleted === false, "deleteFile refuses a version's Dealer Copy (source_file_id)", `deleteFile returned ${sourceDeleted}`);
    check(await fileExists(dealerCopy), "the Dealer Copy row is still there", "the row is gone");
    const contractDeleted = await deleteFile(plain, ACTOR);
    check(contractDeleted === false, "deleteFile refuses a version's contract (contract_file_id)", `deleteFile returned ${contractDeleted}`);
    check(await fileExists(plain), "the contract row is still there", "the row is gone");

    // Positive control: with no version naming it, the same file deletes. Its blob does not
    // exist and no token is set, so deleteFile's logged blob error is expected and silenced.
    await sql`delete from dc_quote_versions where id = ${versionId}`;
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const freed = await deleteFile(plain, ACTOR).finally(() => quiet.mockRestore());
    check(freed === true, "deleteFile removes the file once no version names it (control)", `deleteFile returned ${freed}`);
    check(!(await fileExists(plain)), "the freed file's row is gone", "the row is still there");

    console.log(
      "\nPASSED: a Dealer Copy cannot be shared (the database refuses it too), relabelled, or deleted\n" +
        "while a quote version names it. This was a manual run, not ongoing coverage.\n",
    );
  } finally {
    // Versions first: their foreign keys to job_files have no on-delete action.
    await sql`delete from dc_quote_versions where lead_id = ${lead}`;
    await sql`delete from job_events where lead_id = ${lead}`;
    await sql`delete from job_files where lead_id = ${lead}`;
    await sql`delete from leads where id = ${lead}`;
  }
});
