/**
 * Behavioural proof of the visible-signatures SQL:
 * - migration 029;
 * - createFile's sign_marks;
 * - sendJobDocument storing marks;
 * - signableContracts reading them;
 * - recordSignature's adoption columns, in all four adoption modes (typed with and without
 *   initials, drawn with and without an initials image), and its Blob cleanup;
 * - listBlobPathnames' signature images;
 * - the three new CHECK constraints.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand, is in no suite, and CI does not run it. If
 * you change any statement above, run it, and if you cannot, call that SQL unverified.
 *
 * Mocks: @vercel/blob, in memory. No blob store of any kind is written, and both blob tokens are
 * removed from the environment. lib/docs/emails is mocked too (no network). Every statement
 * reaches the database for real, and every PDF is really built.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. It takes its connection from E2E_POSTGRES_URL alone. It
 * refuses a URL that looks like production (cold-term), and refuses any host but the test-branch
 * endpoint named by E2E_TEST_ENDPOINT (an ep-… id), or ep-lingering-fog by default. Cleanup
 * deletes only the ids this run created.
 *
 * Usage (PowerShell, from the worktree root; loads the URL without printing it):
 *   Get-Content .env.test.local | ForEach-Object { if ($_ -match '^\s*E2E_POSTGRES_URL\s*=\s*(.*)$') { $env:E2E_POSTGRES_URL = $matches[1].Trim().Trim('"').Trim("'") } }
 *   npx vitest run --config scripts/verify-signatures.config.mts --silent=false --reporter=verbose
 * (Without those two flags vitest 4 hides a passing test's console: no `ok` lines and no cleanup count.)
 *
 * To watch it fail (the only way to know it works), make one change at a time, re-run, restore:
 *  - createFile: write `null` for sign_marks. Step 1's "the sign document's file carries its marks" fails.
 *  - lib/docs/workflow.ts: pass signMarks for every response. Step 2's "an acknowledge document's file has none" fails.
 *  - recordSignature: bind `null` for signature_image_pathname. The insert itself fails on contract_signatures_adoption_check (step 5).
 *  - recordSignature: delete the already-signed cleanup. Step 6's "the repeat's images are removed" fails.
 *  - listBlobPathnames: delete the union. Step 8 fails.
 */
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test, vi } from "vitest";

const blobs = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("@vercel/blob", () => ({
  put: async (pathname: string, body: Blob | Buffer) => {
    blobs.set(pathname, body instanceof Blob ? Buffer.from(await body.arrayBuffer()) : Buffer.from(body));
    return { pathname };
  },
  del: async (pathname: string) => {
    blobs.delete(pathname);
  },
  get: async (pathname: string) => {
    const bytes = blobs.get(pathname);
    if (!bytes) return null;
    return { statusCode: 200, stream: new Blob([new Uint8Array(bytes)]).stream(), blob: { contentType: "application/pdf" } };
  },
}));
vi.mock("../lib/docs/emails", () => ({
  sendDocumentEmail: async () => {},
  notifyOwnersOfDocumentAcknowledgement: async () => {},
}));

import { createFile, getFile, listBlobPathnames } from "../lib/admin/files";
import { createTemplate } from "../lib/docs/templates";
import { createDocumentFromTemplate, sendJobDocument } from "../lib/docs/workflow";
import { parseSignMarks } from "../lib/pdf/sign-marks";
import type { Adoption } from "../lib/portal/adoption";
import { recordSignature, signableContracts } from "../lib/portal/sign";
import { pngBytes } from "../tests/fixtures/png";

const BANNER = "\n================ verify-signatures REFUSED TO RUN ================\n";
function refuse(reason: string): never {
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-signatures refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse("E2E_POSTGRES_URL is not set. This script WRITES rows, so it never falls back to POSTGRES_URL, DATABASE_URL or .env.local. It does not skip: no result means it did not run.");
}
// The same rule as playwright.config.ts: an optional named test endpoint, never production.
const endpoint = process.env.E2E_TEST_ENDPOINT ?? "ep-lingering-fog";
if (!endpoint.startsWith("ep-") || endpoint.includes("cold-term")) refuse("E2E_TEST_ENDPOINT must be a Neon test-branch endpoint (ep-…), never production.");
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return refuse("E2E_POSTGRES_URL is not a valid URL, so its host cannot be checked.");
  }
})();
// The messages name the pattern that failed, never the host: the host is part of a secret.
if (host.includes("cold-term")) refuse('E2E_POSTGRES_URL matches the production endpoint pattern "cold-term". Use a Neon test branch.');
if (!host.includes(endpoint)) refuse(`E2E_POSTGRES_URL does not match the test branch endpoint "${endpoint}".`);

// The modules under test read the connection through lib/db at call time: only the vetted URL.
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
delete process.env.RESEND_API_KEY;
// @vercel/blob is mocked; with no token either, nothing can reach a real store if the mock ever slipped.
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.E2E_BLOB_READ_WRITE_TOKEN;

const sql = neon(url);
const ACTOR = "verify-signatures@example.com";
const STAMP = Date.now();
const NAME_PREFIX = "VERIFY Signatures";
const BODY = "## 1. Scope\n\nTwo shades for {{client_name}}.\n\n## Notes\n\nNone.\n\n## 2. Payment\n\nOn install.";
// No numbered heading: the file's marks have a signature block and no initials, as a real one would.
const PLAIN_BODY = "## Scope\n\nTwo shades for {{client_name}}.\n\n## Payment\n\nOn install.";

function check(condition: unknown, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
const idOf = (result: { id: string } | { error: string }, what: string): string => {
  if (!("id" in result)) throw new Error(`setup: ${what}: ${result.error}`);
  return result.id;
};
/** The database's own words for a refused statement: its message, never its connection. */
const refusal = async (work: () => Promise<unknown>): Promise<string> => {
  try {
    await work();
    return "";
  } catch (error) {
    return (error as Error).message;
  }
};
const adoptionRow = async (fileId: string) => (await sql`
  select signature_method, signed_initials, signature_image_pathname, initials_image_pathname
  from contract_signatures where file_id = ${fileId}`)[0];

test("visible signatures: marks, adoption and cleanup against a real database", async () => {
  console.log("\nverify-signatures: writing to a test branch\n");
  // Declared out here, filled inside the try: whatever setup managed before a failure is undone.
  const leadIds: string[] = [];
  const templateIds: string[] = [];
  try {
    const newLead = async (suffix: string) => {
      const [row] = await sql`insert into leads (name, phone, email, city, source, status)
        values (${`${NAME_PREFIX} ${STAMP} ${suffix}`}, '7025550198', ${`verify-sig-${STAMP}-${suffix}@example.com`}, 'Henderson', 'phone', 'sold')
        returning id`;
      leadIds.push(row.id as string);
      return row.id as string;
    };
    const A = await newLead("A");
    const B = await newLead("B");
    const sendNew = async (templateId: string) => {
      const documentId = idOf(await createDocumentFromTemplate({ jobId: A, templateId, actor: ACTOR }), "create");
      const sent = await sendJobDocument({ jobId: A, documentId, actor: ACTOR });
      if (!("ok" in sent)) throw new Error(`setup: send: ${sent.error}`);
      return (await sql`select file_id from job_documents where id = ${documentId}`)[0].file_id as string;
    };
    const sign = async (fileId: string, adoption: Adoption) => {
      const file = await getFile(fileId);
      if (!file) throw new Error("setup: getFile");
      return recordSignature({ jobId: A, file, name: "Pat Client", email: "pat@example.com", ip: null, userAgent: null, adoption });
    };
    const newTemplate = async (name: string, response: "sign" | "acknowledge", body: string) => {
      const id = idOf(await createTemplate({ name: `${name} ${STAMP}`, kind: "service_agreement", response, body, actor: ACTOR }), name);
      templateIds.push(id);
      return id;
    };
    const signTemplate = await newTemplate("VERIFY SA", "sign", BODY);
    const plainTemplate = await newTemplate("VERIFY SA plain", "sign", PLAIN_BODY);
    const ackTemplate = await newTemplate("VERIFY ACK", "acknowledge", BODY);

    console.log("step 1: a sign document's file is born with its marks");
    const signed1 = await sendNew(signTemplate);
    const [row1] = await sql`select sign_marks, jsonb_typeof(sign_marks) as type from job_files where id = ${signed1}`;
    const marks1 = parseSignMarks(row1.sign_marks);
    check(row1.type === "object" && marks1 !== null, "the sign document's file carries its marks", JSON.stringify(row1));
    check(JSON.stringify(marks1!.initials.map((m) => m.section)) === '["1","2"]', "one initials mark per numbered section, in order", JSON.stringify(marks1));
    check(marks1!.signature !== null, "and the signature block's mark", JSON.stringify(marks1));
    const plain1 = await sendNew(plainTemplate);
    const plainMarks = parseSignMarks((await sql`select sign_marks from job_files where id = ${plain1}`)[0].sign_marks);
    check(plainMarks !== null && plainMarks.initials.length === 0 && plainMarks.signature !== null,
      "a sign document with no numbered section has a signature mark and no initials", JSON.stringify(plainMarks));

    console.log("step 2: an acknowledge document's file has none");
    const ack = await sendNew(ackTemplate);
    check((await sql`select sign_marks from job_files where id = ${ack}`)[0].sign_marks === null, "an acknowledge document's file has none", "not null");

    console.log("step 3: signableContracts reads the marks from the database");
    const offeredAll = await signableContracts(A);
    const offered = offeredAll.find((file) => file.id === signed1);
    check(JSON.stringify(offered?.signMarks) === JSON.stringify(marks1), "the signable file carries exactly the stored marks", JSON.stringify(offered?.signMarks));
    check(JSON.stringify(offeredAll.find((file) => file.id === plain1)?.signMarks) === JSON.stringify(plainMarks),
      "and the plain one carries its own", "differs");
    check((await signableContracts(B)).every((file) => file.id !== signed1), "another job is never offered it", "offered to B");

    console.log("step 4: a typed adoption with initials is recorded in the one statement");
    const typed = await sign(signed1, { method: "typed", initials: "PC" });
    const sig1 = await adoptionRow(signed1);
    check(typed === "signed" && sig1.signature_method === "typed" && sig1.signed_initials === "PC"
      && sig1.signature_image_pathname === null && sig1.initials_image_pathname === null, "typed with initials: method and initials stored, no images", JSON.stringify(sig1));

    console.log("step 4b: a typed adoption without initials");
    const blobsBeforeTyped = blobs.size;
    const typedPlain = await sign(plain1, { method: "typed", initials: null });
    const sig1b = await adoptionRow(plain1);
    check(typedPlain === "signed" && sig1b.signature_method === "typed" && sig1b.signed_initials === null
      && sig1b.signature_image_pathname === null && sig1b.initials_image_pathname === null, "typed without initials: method stored, initials and images null", JSON.stringify(sig1b));
    check(blobs.size === blobsBeforeTyped, "and a typed adoption stores no image", `${blobs.size} vs ${blobsBeforeTyped}`);

    console.log("step 5: a drawn adoption's PNGs are stored and named");
    const signed2 = await sendNew(signTemplate);
    const SIG = pngBytes(600, 200);
    const INI = pngBytes(200, 100);
    const before = blobs.size;
    const drawn = await sign(signed2, { method: "drawn", signaturePng: SIG, initialsPng: INI });
    const sig2 = await adoptionRow(signed2);
    check(drawn === "signed" && sig2.signature_method === "drawn" && sig2.signed_initials === null, "drawn with initials: method stored, no typed initials", JSON.stringify(sig2));
    check(new RegExp(`^jobs/${A}/signatures/[0-9a-f-]{36}-signature\\.png$`).test(sig2.signature_image_pathname as string)
      && new RegExp(`^jobs/${A}/signatures/[0-9a-f-]{36}-initials\\.png$`).test(sig2.initials_image_pathname as string),
      "both pathnames are under the job's signatures folder", JSON.stringify(sig2));
    check(blobs.get(sig2.signature_image_pathname as string)?.equals(SIG) === true && blobs.get(sig2.initials_image_pathname as string)?.equals(INI) === true,
      "the stored bytes are the drawn PNGs", String(blobs.size - before));

    console.log("step 5b: a drawn adoption without an initials image");
    const plain2 = await sendNew(plainTemplate);
    const beforePlain = blobs.size;
    const drawnPlain = await sign(plain2, { method: "drawn", signaturePng: SIG, initialsPng: null });
    const sig2p = await adoptionRow(plain2);
    check(drawnPlain === "signed" && sig2p.signature_method === "drawn" && sig2p.signed_initials === null
      && sig2p.initials_image_pathname === null
      && new RegExp(`^jobs/${A}/signatures/[0-9a-f-]{36}-signature\\.png$`).test(sig2p.signature_image_pathname as string),
      "drawn without initials: the signature image is named, the initials image is null", JSON.stringify(sig2p));
    check(blobs.size === beforePlain + 1 && blobs.get(sig2p.signature_image_pathname as string)?.equals(SIG) === true,
      "and exactly one image, the signature, is stored", `${blobs.size - beforePlain} stored`);

    console.log("step 6: a repeat post writes nothing and leaves no images behind");
    const count = blobs.size;
    const again = await sign(signed2, { method: "drawn", signaturePng: SIG, initialsPng: INI });
    check(again === "already-signed", "the repeat answers already-signed", again);
    check(blobs.size === count, "the repeat's images are removed", `${blobs.size} vs ${count}`);
    const sig2b = await adoptionRow(signed2);
    check(sig2b.signature_image_pathname === sig2.signature_image_pathname && sig2b.initials_image_pathname === sig2.initials_image_pathname
      && blobs.has(sig2.signature_image_pathname as string) && blobs.has(sig2.initials_image_pathname as string),
      "and the first signature's images are untouched", JSON.stringify(sig2b));

    console.log("step 7: the database refuses an adoption that does not match its method");
    const scratch = async () => (await createFile({ leadId: A, kind: "document", name: "scratch.pdf", contentType: "application/pdf",
      body: new Blob(["%PDF-1.4"]), actor: ACTOR }))!.id;
    const insert = (fileId: string, method: string | null, initials: string | null, image: string | null) => () => sql`
      insert into contract_signatures (id, lead_id, file_id, signed_name, signed_email, doc_sha256, signature_method, signed_initials, signature_image_pathname)
      values (${randomUUID()}, ${A}, ${fileId}, 'x', 'x@example.com', 'verify', ${method}, ${initials}, ${image})`;
    // Postgres tests CHECKs in name order, and 'scribbled' also fails the adoption check, which sorts first: either name proves the refusal.
    const unknown = await refusal(insert(await scratch(), "scribbled", null, null));
    check(unknown.includes("contract_signatures_signature_method_check") || unknown.includes("contract_signatures_adoption_check"), "an unknown method is refused", unknown || "accepted");
    const drawnNoImage = await refusal(insert(await scratch(), "drawn", null, null));
    check(drawnNoImage.includes("contract_signatures_adoption_check"), "drawn without an image is refused", drawnNoImage || "accepted");
    const typedImage = await refusal(insert(await scratch(), "typed", "PC", "jobs/x.png"));
    check(typedImage.includes("contract_signatures_adoption_check"), "typed with an image is refused", typedImage || "accepted");
    const preAdoption = await refusal(insert(await scratch(), null, null, null));
    check(preAdoption === "", "a pre-adoption row (all null) is still accepted", preAdoption);
    const notObject = await refusal(() => sql`update job_files set sign_marks = '[]'::jsonb where id = ${ack}`);
    check(notObject.includes("job_files_sign_marks_check"), "sign marks that are not an object are refused", notObject || "accepted");

    console.log("step 8: deleting the job would remove the drawn images too");
    const pathnames = await listBlobPathnames(A);
    check(pathnames.includes(sig2.signature_image_pathname as string) && pathnames.includes(sig2.initials_image_pathname as string)
      && pathnames.includes(sig2p.signature_image_pathname as string),
      "listBlobPathnames names every drawn image", JSON.stringify(pathnames.filter((p) => p.includes("/signatures/"))));
    check(pathnames.filter((p) => p.includes("/signatures/")).length === 3, "and no null or typed adoption adds a path", JSON.stringify(pathnames.filter((p) => p.includes("/signatures/"))));
    // B holds a file of its own, so "never another job's" is tested against a non-empty list.
    await createFile({ leadId: B, kind: "document", name: "b.pdf", contentType: "application/pdf", body: new Blob(["%PDF-1.4"]), actor: ACTOR });
    const pathnamesB = await listBlobPathnames(B);
    check(pathnamesB.length === 1 && pathnamesB.every((p) => !p.includes(A)), "and never another job's", JSON.stringify(pathnamesB.length));

    console.log("step 9: createFile stores marks it is given, and null otherwise");
    const given = { initials: [{ page: 0, x: 502, y: 700, section: "7" }], signature: { page: 0, x: 154, y: 300 } };
    const withMarks = (await createFile({ leadId: A, kind: "document", name: "marked.pdf", contentType: "application/pdf",
      body: new Blob(["%PDF-1.4"]), actor: ACTOR, signMarks: given }))!.id;
    check(JSON.stringify(parseSignMarks((await sql`select sign_marks from job_files where id = ${withMarks}`)[0].sign_marks)) === JSON.stringify(given),
      "createFile stores the marks it is given", "differs");
    const without = await scratch();
    check((await sql`select sign_marks from job_files where id = ${without}`)[0].sign_marks === null, "and null when given none", "not null");

    console.log("\nPASSED: the visible-signatures SQL holds against a real database. Manual run, not coverage.\n");
  } finally {
    // Never throws: a throw here would replace the failure being reported.
    const attempt = async (label: string, work: () => Promise<unknown>) => {
      try {
        await work();
      } catch (error) {
        console.error(`cleanup could not ${label}:`, (error as Error).message);
      }
    };
    await attempt("delete signatures", () => sql`delete from contract_signatures where lead_id = any(${leadIds})`);
    await attempt("delete documents", () => sql`delete from job_documents where lead_id = any(${leadIds})`);
    await attempt("delete events", () => sql`delete from job_events where lead_id = any(${leadIds})`);
    await attempt("delete files", () => sql`delete from job_files where lead_id = any(${leadIds})`);
    await attempt("delete leads", () => sql`delete from leads where id = any(${leadIds})`);
    await attempt("delete templates", () => sql`delete from document_templates where id = any(${templateIds})`);
    await attempt("report", async () => {
      const [left] = await sql`select
        (select count(*)::int from leads where id = any(${leadIds})) as leads,
        (select count(*)::int from document_templates where id = any(${templateIds})) as templates,
        (select count(*)::int from job_documents where lead_id = any(${leadIds})) as documents,
        (select count(*)::int from job_files where lead_id = any(${leadIds})) as files,
        (select count(*)::int from job_events where lead_id = any(${leadIds})) as events,
        (select count(*)::int from contract_signatures where lead_id = any(${leadIds})) as signatures`;
      console.log(`cleanup: ${left.leads} of ${leadIds.length} leads and ${left.templates} of ${templateIds.length} templates left`);
      console.log(`cleanup: ${left.documents} documents, ${left.files} files, ${left.events} events, ${left.signatures} signatures left`);
    });
  }
});
