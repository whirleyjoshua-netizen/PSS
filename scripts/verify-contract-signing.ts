/**
 * Behavioural proof of the contract-signing SQL (migration 021, lib/portal/sign.ts and the
 * signature freeze in lib/admin/files.ts).
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is a script you run by hand, it is in no suite, and CI
 * does not execute it. If you change recordSignature, storeSignedCopy, signableContracts, the
 * `not exists` freeze clauses in deleteFile / setShared / setDocType, listFiles' `signed`
 * flag, or deleteJob, run it yourself — and if you cannot, call that SQL unverified.
 *
 * Why it exists: the unit tests mock db(), so they prove SQL *text* only. This script calls the
 * real functions against a real Postgres. The only mock is @vercel/blob (put/del/get), because
 * there is no blob token here; every statement reaches the database for real.
 *
 * What it does, against a throwaway database:
 *   1. inserts two leads (A, B); on A a shared contract and a shared plain document;
 *   2. signableContracts(A) offers the contract;
 *   3. recordSignature signs it: one row with the trimmed name and a sha256, one 'signature'
 *      event naming the document, never the typed name;
 *   4. signing again is "already-signed" and writes nothing;
 *   5. storeSignedCopy creates the shared "(signed)" contract and links it; a repeat is null;
 *   6. signableContracts(A) no longer offers the original or the copy;
 *   7. unshare, delete and relabel are refused on both frozen files, rows unchanged, and
 *      succeed on the plain document (the positive control); re-sharing is still allowed;
 *   8. listFiles(A) marks exactly the original and the copy signed;
 *   9. deleteJob(A) succeeds and takes its signatures and files with it;
 *  10. deletes everything it wrote, even on failure.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. Point it only at a Neon test branch. It takes its
 * connection from E2E_POSTGRES_URL alone — never POSTGRES_URL, DATABASE_URL or .env.local —
 * and it refuses to start if that URL looks like production.
 *
 * Usage (bash):
 *   E2E_POSTGRES_URL='<neon test branch url>' \
 *     npx vitest run --config scripts/verify-contract-signing.config.mts
 *
 * Usage (PowerShell):
 *   $env:E2E_POSTGRES_URL='<neon test branch url>'
 *   npx vitest run --config scripts/verify-contract-signing.config.mts
 *
 * To watch it fail (which is the only way to know it works): delete the `and not exists (...)`
 * clause from deleteFile in lib/admin/files.ts and run it again. Step 7 must fail (the foreign key
 * then throws instead of the function returning false). Put it back.
 */
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test, vi } from "vitest";

// The one mock: stored bytes, kept in memory. Everything else is the real code.
const blobs = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("@vercel/blob", () => ({
  put: async (pathname: string, body: Buffer) => {
    blobs.set(pathname, Buffer.from(body));
    return { pathname };
  },
  del: async (pathname: string) => {
    blobs.delete(pathname);
  },
  get: async (pathname: string) => {
    const bytes = blobs.get(pathname);
    if (!bytes) return null;
    return {
      statusCode: 200,
      stream: new Blob([new Uint8Array(bytes)]).stream(),
      blob: { contentType: "application/pdf" },
    };
  },
}));

import { deleteFile, getFile, listFiles, setDocType, setShared, type JobFile } from "../lib/admin/files";
import { deleteJob } from "../lib/admin/jobs";
import { recordSignature, signableContracts, storeSignedCopy } from "../lib/portal/sign";

/** Endpoints this script must never write to. Production is the whole point of the list. */
const FORBIDDEN_HOSTS = ["cold-term"];

const BANNER = "\n================ verify-contract-signing REFUSED TO RUN ================\n";

function refuse(reason: string): never {
  // Printed as well as thrown: the thrown message sets the exit code, the print is what a human reads.
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-contract-signing refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse(
    "E2E_POSTGRES_URL is not set.\n\n" +
      "This script WRITES rows, so it will not fall back to POSTGRES_URL, DATABASE_URL\n" +
      "or .env.local — any of which may point at production. Give it a Neon test branch:\n\n" +
      "  E2E_POSTGRES_URL='<neon test branch url>' \\\n" +
      "    npx vitest run --config scripts/verify-contract-signing.config.mts\n\n" +
      "It does not skip. No result means it did not run, not that the SQL holds.",
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
  if (url.includes(forbidden)) {
    refuse(
      `E2E_POSTGRES_URL points at ${host}, which matches the production endpoint "${forbidden}".\n\n` +
        "This script inserts and deletes rows. Running it there would put junk in the\n" +
        "owners' real data. Cut a Neon branch and point it at that instead.",
    );
  }
}

// The modules under test read the connection through lib/db's db(), at call time. Set it from
// the vetted URL so they cannot reach anything this script has not just checked.
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;

const sql = neon(url);
const ACTOR = "verify-contract-signing@example.com";
const STAMP = Date.now();
const LEAD_NAME = `VERIFY Contract Signing ${STAMP}`;

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

/** A shared document on the lead, inserted directly (createFile would log an upload). */
const newDocument = async (leadId: string, name: string, docType: string | null): Promise<string> => {
  const id = randomUUID();
  const pathname = `verify/${id}.pdf`;
  await sql`
    insert into job_files (id, lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname,
                           shared_at, doc_type)
    values (${id}, ${leadId}, ${ACTOR}, 'document', ${name}, 'application/pdf', 64, ${pathname},
            now(), ${docType})`;
  blobs.set(pathname, Buffer.from(`%PDF-1.4 verify ${name}`));
  return id;
};

const fileRow = async (id: string) =>
  (await sql`select id, lead_id, name, shared_at, doc_type from job_files where id = ${id}`)[0] ?? null;

const mustGet = async (id: string): Promise<JobFile> => {
  const file = await getFile(id);
  if (!file) throw new Error(`setup: file ${id} not found`);
  return file;
};

test("contract signing: record, stamp, freeze and cascade against a real database", async () => {
  console.log(`\nverify-contract-signing: writing to a test branch\n`);

  const leadA = await newLead("A");
  const leadB = await newLead("B");
  const leads = [leadA, leadB];

  try {
    console.log("step 1: setup");
    const contractId = await newDocument(leadA, `verify-contract-${STAMP}.pdf`, "contract");
    const plainId = await newDocument(leadA, `verify-plain-${STAMP}.pdf`, null);
    const contract = await mustGet(contractId);

    console.log("step 2");
    const before = await signableContracts(leadA);
    check(before.some((f) => f.id === contractId), "signableContracts(A) offers the contract",
      `got ${JSON.stringify(before.map((f) => f.id))}`);

    console.log("step 3");
    const first = await recordSignature({
      jobId: leadA, file: contract, name: "  Jane Doe  ", email: ACTOR, ip: "127.0.0.1", userAgent: "verify",
    });
    check(first === "signed", "recordSignature answers signed", `got ${first}`);
    const sigs = await sql`select * from contract_signatures where file_id = ${contractId}`;
    check(sigs.length === 1, "exactly one signature row", `got ${sigs.length}`);
    check(sigs[0].signed_name === "Jane Doe", "signed_name is trimmed", `got ${JSON.stringify(sigs[0].signed_name)}`);
    check(/^[0-9a-f]{64}$/.test(sigs[0].doc_sha256 as string), "doc_sha256 is 64 hex", `got ${sigs[0].doc_sha256}`);
    const events = await sql`select body from job_events where lead_id = ${leadA} and kind = 'signature'`;
    check(events.length === 1, "one signature event", `got ${events.length}`);
    const body = events[0].body as string;
    check(body.includes(contract.name) && !body.includes("Jane Doe"),
      "the event names the document, not the typed name", `body: ${body}`);

    console.log("step 4");
    const second = await recordSignature({
      jobId: leadA, file: contract, name: "Someone Else", email: ACTOR, ip: null, userAgent: null,
    });
    check(second === "already-signed", "a second signature is already-signed", `got ${second}`);
    const sigs2 = await sql`select count(*)::int as n from contract_signatures where file_id = ${contractId}`;
    const ev2 = await sql`select count(*)::int as n from job_events where lead_id = ${leadA} and kind = 'signature'`;
    check(sigs2[0].n === 1 && ev2[0].n === 1, "still one signature row and one event",
      `rows ${sigs2[0].n}, events ${ev2[0].n}`);

    console.log("step 5");
    const copyId = await storeSignedCopy({
      jobId: leadA, original: contract, bytes: Buffer.from("%PDF-1.4 stamped"), actor: ACTOR,
    });
    check(typeof copyId === "string", "storeSignedCopy returns the new file", `got ${copyId}`);
    const copy = await fileRow(copyId!);
    const expectedName = contract.name.replace(/\.pdf$/i, "") + " (signed).pdf";
    check(
      !!copy && copy.name === expectedName && copy.doc_type === "contract" && copy.shared_at !== null &&
        copy.lead_id === leadA,
      "the copy is a shared contract on lead A named (signed)", `row ${JSON.stringify(copy)}`,
    );
    const linked = await sql`select signed_file_id from contract_signatures where file_id = ${contractId}`;
    check(linked[0].signed_file_id === copyId, "the signature links the copy", `got ${linked[0].signed_file_id}`);
    const again = await storeSignedCopy({
      jobId: leadA, original: contract, bytes: Buffer.from("%PDF-1.4 stamped"), actor: ACTOR,
    });
    check(again === null, "a second storeSignedCopy is null", `got ${again}`);
    const signedRows = await sql`
      select count(*)::int as n from job_files where lead_id = ${leadA} and name like '%(signed).pdf'`;
    check(signedRows[0].n === 1, "no second (signed) row", `got ${signedRows[0].n}`);

    console.log("step 6");
    const after = await signableContracts(leadA);
    check(!after.some((f) => f.id === contractId || f.id === copyId),
      "signableContracts(A) offers neither the original nor the copy",
      `got ${JSON.stringify(after.map((f) => f.id))}`);

    console.log("step 7");
    for (const [label, id] of [["original", contractId], ["copy", copyId!]] as const) {
      const snapshot = JSON.stringify(await fileRow(id));
      check((await setShared(leadA, id, false, ACTOR)) === false, `unsharing the ${label} is refused`, "returned true");
      // Without the `not exists` clause the NO ACTION foreign key still stops the delete, but by
      // throwing — an error page for the owner, not a refusal. The contract is `false`.
      const deleted = await deleteFile(id, ACTOR).catch((error: Error) => `threw: ${error.message}`);
      check(deleted === false, `deleting the ${label} is refused (returns false)`, `got ${deleted}`);
      check((await setDocType(leadA, id, "other", ACTOR)) === false, `relabelling the ${label} is refused`, "returned true");
      const now = JSON.stringify(await fileRow(id));
      check(now === snapshot, `the ${label} row is unchanged`, `before ${snapshot}, after ${now}`);
    }
    check((await setShared(leadA, contractId, true, ACTOR)) === true, "re-sharing the original is allowed", "returned false");
    check((await setDocType(leadA, plainId, "other", ACTOR)) === true, "control: relabelling the plain doc works", "returned false");
    check((await setShared(leadA, plainId, false, ACTOR)) === true, "control: unsharing the plain doc works", "returned false");

    // Step 8 runs before the control delete, so "exactly" has an unsigned file to exclude.
    console.log("step 8");
    const listed = await listFiles(leadA);
    const signedIds = listed.filter((f) => f.signed === true).map((f) => f.id).sort();
    check(
      JSON.stringify(signedIds) === JSON.stringify([contractId, copyId!].sort()) &&
        listed.find((f) => f.id === plainId)?.signed === false,
      "listFiles marks exactly the original and the copy signed", `signed ${JSON.stringify(signedIds)}`,
    );

    console.log("step 7 (control delete)");
    check((await deleteFile(plainId, ACTOR)) === true, "control: deleting the plain doc works", "returned false");
    check((await fileRow(plainId)) === null, "control: the plain doc row is gone", "still there");

    console.log("step 9");
    const outcome = await deleteJob(leadA, ACTOR);
    check(outcome === "deleted", "deleteJob(A) succeeds", `got ${outcome}`);
    const leftSigs = await sql`select count(*)::int as n from contract_signatures where lead_id = ${leadA}`;
    const leftFiles = await sql`select count(*)::int as n from job_files where lead_id = ${leadA}`;
    check(leftSigs[0].n === 0 && leftFiles[0].n === 0, "its signatures and files are gone",
      `signatures ${leftSigs[0].n}, files ${leftFiles[0].n}`);

    console.log("\nPASSED: contract signing holds against a real database. Manual run, not coverage.\n");
  } finally {
    // Step 10. Runs even on failure. Signatures first: their file FKs are NO ACTION.
    await sql`delete from contract_signatures where lead_id = any(${leads})`;
    await sql`delete from job_events where lead_id = any(${leads})`;
    await sql`delete from job_files where lead_id = any(${leads})`;
    await sql`delete from leads where id = any(${leads})`;
    const residue = await sql`select count(*)::int as n from leads where id = any(${leads})`;
    console.log(`step 10: cleanup, ${residue[0].n} leads left`);
  }
});
