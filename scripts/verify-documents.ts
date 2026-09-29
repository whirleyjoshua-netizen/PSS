/**
 * Behavioural proof of the Documents SQL: migration 026, lib/docs/templates.ts,
 * lib/docs/job-documents.ts, lib/docs/workflow.ts, lib/portal/acknowledge-document.ts, the
 * `document` CTE in lib/portal/sign.ts, and the job-document clauses in lib/admin/files.ts.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand, is in no suite, and CI does not run it. If
 * you change any statement above, run it, and if you cannot, call that SQL unverified.
 *
 * Mocks: @vercel/blob (in memory: no blob store of any kind is written, and both blob tokens are
 * removed from the environment) and lib/docs/emails (no network). Every statement reaches the
 * database for real, and the PDF is really built.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. It takes its connection from E2E_POSTGRES_URL alone and
 * refuses a URL that looks like production. It archives any live terms or guide template for the
 * run (the singleton checks need a clean slate) and puts them back in `finally`.
 *
 * Usage (PowerShell, from the worktree root; loads the URL without printing it):
 *   Get-Content .env.test.local | ForEach-Object { if ($_ -match '^\s*E2E_POSTGRES_URL\s*=\s*(.*)$') { $env:E2E_POSTGRES_URL = $matches[1].Trim().Trim('"').Trim("'") } }
 *   npx vitest run --config scripts/verify-documents.config.mts
 *
 * To watch it fail (the only way to know it works), make one change at a time, re-run, restore:
 *  - markSent: delete `and title = ${input.title} and body = ${input.body}`: step 5's
 *    "a body other than the stored one is refused" fails.
 *  - voidDocument: delete `and status = 'sent'`: step 10's "voiding it again answers false" fails
 *    (step 11's "a completed view document cannot be voided" would fail next).
 *  - deleteFile: delete the `not exists (... job_documents ...)` clause: step 7's "nor delete it"
 *    fails with the job_documents_file_id_fkey violation instead of an answer.
 *  - acknowledgeableDocuments: delete `and d.status = 'sent'`: step 10's "a void document is not
 *    offered for acknowledgement" fails.
 *  - voidDocument: delete the `not exists (... document_acknowledgements ...)` line: step 10b fails;
 *    delete the `not exists (... contract_signatures ...)` line: step 12b fails.
 *  - recordAcknowledgement: delete `and d.status = 'sent'` from the `completed` update: step 10's
 *    "even with its file shared, a void document takes no acknowledgement" fails.
 */
import { createHash, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test, vi } from "vitest";

const blobs = vi.hoisted(() => new Map<string, Buffer>());
const emails = vi.hoisted(() => [] as string[]);
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
  sendDocumentEmail: async (_job: unknown, title: string) => {
    emails.push(title);
  },
  notifyOwnersOfDocumentAcknowledgement: async () => {},
}));

import { createFile, deleteFile, getFile, setDocType, setShared } from "../lib/admin/files";
import { discardDraft, insertDraft, markSent, updateDraft, voidDocument } from "../lib/docs/job-documents";
import { archiveTemplate, createTemplate, updateTemplate } from "../lib/docs/templates";
import { createDocumentFromTemplate, sendJobDocument } from "../lib/docs/workflow";
import { acknowledgeableDocuments, recordAcknowledgement } from "../lib/portal/acknowledge-document";
import { formatProjectNo } from "../lib/portal/project-no";
import { recordSignature } from "../lib/portal/sign";

const FORBIDDEN_HOSTS = ["cold-term"];
const BANNER = "\n================ verify-documents REFUSED TO RUN ================\n";
function refuse(reason: string): never {
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-documents refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse("E2E_POSTGRES_URL is not set. This script WRITES rows, so it never falls back to POSTGRES_URL, DATABASE_URL or .env.local. It does not skip: no result means it did not run.");
}
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return refuse("E2E_POSTGRES_URL is not a valid URL, so its host cannot be checked.");
  }
})();
for (const forbidden of FORBIDDEN_HOSTS) {
  if (url.includes(forbidden)) refuse(`E2E_POSTGRES_URL points at ${host}, which matches the production endpoint "${forbidden}". Use a Neon test branch.`);
}

// The modules under test read the connection through lib/db at call time: only the vetted URL.
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
delete process.env.RESEND_API_KEY;
// @vercel/blob is mocked; with no token either, nothing can reach a real store if the mock ever slipped.
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.E2E_BLOB_READ_WRITE_TOKEN;

const sql = neon(url);
const ACTOR = "verify-documents@example.com";
const STAMP = Date.now();
const NAME_PREFIX = "VERIFY Documents";
const SINGLETONS = ["terms", "guide_install", "guide_care"];
const NO_JOB = "00000000-0000-4000-8000-000000000000";

function check(condition: unknown, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const idOf = (result: { id: string } | { error: string }, what: string): string => {
  if (!("id" in result)) throw new Error(`setup: ${what}: ${result.error}`);
  return result.id;
};

const newLead = async (suffix: string): Promise<{ id: string; projectNo: number }> => {
  const [row] = await sql`
    insert into leads (name, phone, email, city, source, status)
    values (${`${NAME_PREFIX} ${STAMP} ${suffix}`}, '7025550199', ${`verify-docs-${STAMP}-${suffix}@example.com`}, 'Henderson', 'phone', 'sold')
    returning id, project_no`;
  return { id: row.id as string, projectNo: Number(row.project_no) };
};
const footprint = async (leadId: string) => (await sql`
  select (select count(*)::int from job_documents where lead_id = ${leadId}) as documents,
         (select count(*)::int from job_files where lead_id = ${leadId}) as files,
         (select count(*)::int from job_events where lead_id = ${leadId}) as events,
         (select count(*)::int from document_acknowledgements where lead_id = ${leadId}) as acknowledgements`)[0];
const docRow = async (id: string) =>
  (await sql`select status, file_id, title, body, sent_at, completed_at, voided_at from job_documents where id = ${id}`)[0];
const fileRow = async (id: string) =>
  (await sql`select shared_at, doc_type, name, blob_pathname from job_files where id = ${id}`)[0];
const documentEvents = async (leadId: string) =>
  (await sql`select body from job_events where lead_id = ${leadId} and kind = 'document' order by created_at`).map((r) => r.body as string);
const scriptLeads = async () => (await sql`select id from leads where name like ${`${NAME_PREFIX} %`}`).map((r) => r.id as string);

/** Creates a document from `templateId` on the job, replaces its text with `body`, sends it, answers its id and file. */
async function sendNew(jobId: string, templateId: string, body: string): Promise<{ id: string; fileId: string }> {
  const id = idOf(await createDocumentFromTemplate({ jobId, templateId, actor: ACTOR }), "create a document");
  const row = await docRow(id);
  if (!(await updateDraft({ leadId: jobId, documentId: id, title: row.title as string, body }))) throw new Error("setup: updateDraft");
  const sent = await sendJobDocument({ jobId, documentId: id, actor: ACTOR });
  if (!("ok" in sent)) throw new Error(`setup: send: ${sent.error}`);
  return { id, fileId: (await docRow(id)).file_id as string };
}

test("Documents: templates, drafts, send, acknowledge, void and sign against a real database", async () => {
  console.log("\nverify-documents: writing to a test branch\n");
  const prior = (await sql`select id from document_templates where archived_at is null and kind = any(${SINGLETONS})`).map((r) => r.id as string);
  if (prior.length > 0) await sql`update document_templates set archived_at = now() where id = any(${prior})`;
  const A = await newLead("A");
  const B = await newLead("B");

  try {
    console.log("step 1: templates and the singleton index");
    const terms = await createTemplate({ name: "VERIFY terms", kind: "terms", response: "sign", body: "For {{client_name}}", actor: ACTOR });
    const termsId = idOf(terms, "create terms");
    check((await sql`select response from document_templates where id = ${termsId}`)[0].response === "view",
      "terms are stored view-only whatever was asked", "not view");
    const second = await createTemplate({ name: "VERIFY terms 2", kind: "terms", response: "view", body: "x", actor: ACTOR });
    check("error" in second, "a second live terms template is refused by the unique index", JSON.stringify(second));
    idOf(await createTemplate({ name: "VERIFY install guide", kind: "guide_install", response: "view", body: "x", actor: ACTOR }), "guide");
    const secondGuide = await createTemplate({ name: "VERIFY install guide 2", kind: "guide_install", response: "view", body: "x", actor: ACTOR });
    check("error" in secondGuide, "a second live install guide is refused too", JSON.stringify(secondGuide));
    check((await archiveTemplate(termsId, ACTOR)) === true, "archiving the live terms answers true", "false");
    check((await archiveTemplate(termsId, ACTOR)) === false, "archiving it again answers false", "true");
    check((await updateTemplate({ id: termsId, name: "x", response: "view", body: "x", actor: ACTOR })) === false,
      "an archived template cannot be edited", "true");
    idOf(await createTemplate({ name: "VERIFY terms 3", kind: "terms", response: "view", body: "x", actor: ACTOR }), "terms 3");
    console.log("  ok  with the old terms archived, a new live one is allowed");
    const saId = idOf(await createTemplate({ name: "VERIFY Service agreement", kind: "service_agreement", response: "acknowledge",
      body: "## Scope\n\nHi {{client_first_name}}. Deposit {{deposit}}.", actor: ACTOR }), "service agreement");
    idOf(await createTemplate({ name: "VERIFY Service agreement 2", kind: "service_agreement", response: "acknowledge", body: "x", actor: ACTOR }), "sa 2");
    console.log("  ok  a client-document kind may have many live templates");

    console.log("step 2: a draft, filled from the job");
    const bBefore = await footprint(B.id);
    const d1 = idOf(await createDocumentFromTemplate({ jobId: A.id, templateId: saId, actor: ACTOR }), "create d1");
    const row1 = await docRow(d1);
    const title = `VERIFY Service agreement — ${formatProjectNo(A.projectNo)}`;
    check(row1.status === "draft" && row1.title === title && row1.body === "## Scope\n\nHi VERIFY. Deposit {{deposit}}.",
      "the draft is filled, the missing deposit left as a marker, titled with the PSS number", JSON.stringify(row1));
    check(same(await documentEvents(A.id), [`Drafted "${title}"`]), "one document event, Drafted", JSON.stringify(await documentEvents(A.id)));
    check((await insertDraft({ leadId: NO_JOB, templateId: null, title: "t", kind: "other", response: "view", body: "b", actor: ACTOR })) === null,
      "no draft is written for a job that does not exist", "an id");
    const aAfterDraft = await footprint(A.id);
    check((await insertDraft({ leadId: A.id, templateId: "not-a-uuid", title: "t", kind: "other", response: "view", body: "b", actor: ACTOR })) === null,
      "a malformed template id writes no draft", "an id");
    check((await insertDraft({ leadId: A.id, templateId: randomUUID(), title: "t", kind: "other", response: "view", body: "b", actor: ACTOR })) === null,
      "an unknown template id writes no draft", "an id");
    check(same(await footprint(A.id), aAfterDraft), "and neither wrote a row or an event", JSON.stringify(await footprint(A.id)));

    console.log("step 3: send is blocked while a marker remains");
    const blocked = await sendJobDocument({ jobId: A.id, documentId: d1, actor: ACTOR });
    check("error" in blocked && blocked.error === "Fill in {{deposit}} first.", "Send names the marker", JSON.stringify(blocked));
    check((await footprint(A.id)).files === 0, "and nothing was stored", "a file");

    console.log("step 4: draft edits");
    const finalBody = "## Scope\n\nHi VERIFY. Deposit $500.";
    check((await updateDraft({ leadId: B.id, documentId: d1, title, body: finalBody })) === false, "another job cannot edit the draft", "true");
    check((await updateDraft({ leadId: A.id, documentId: d1, title, body: finalBody })) === true, "the draft is edited", "false");

    console.log("step 5: markSent re-checks everything where it is stored");
    const scratch = await createFile({ leadId: A.id, kind: "document", name: "scratch.pdf", contentType: "application/pdf",
      body: new Blob(["%PDF-1.4 scratch"]), actor: ACTOR });
    if (!scratch) throw new Error("setup: scratch file");
    check((await markSent({ leadId: A.id, documentId: d1, fileId: scratch.id, title, body: "stale text", actor: ACTOR })) === false,
      "a body other than the stored one is refused", "true");
    check((await markSent({ leadId: A.id, documentId: d1, fileId: scratch.id, title: "stale title", body: finalBody, actor: ACTOR })) === false,
      "a title other than the stored one is refused", "true");
    await sql`update job_documents set body = 'Deposit {{deposit}}' where id = ${d1}`;
    check((await markSent({ leadId: A.id, documentId: d1, fileId: scratch.id, title, body: "Deposit {{deposit}}", actor: ACTOR })) === false,
      "a stored marker is refused by the database's own pattern", "true");
    await sql`update job_documents set body = ${finalBody} where id = ${d1}`;
    await sql`update leads set status = 'lost' where id = ${A.id}`;
    check((await markSent({ leadId: A.id, documentId: d1, fileId: scratch.id, title, body: finalBody, actor: ACTOR })) === false,
      "a Lost job is refused", "true");
    const lostSend = await sendJobDocument({ jobId: A.id, documentId: d1, actor: ACTOR });
    check("error" in lostSend && lostSend.error === "This job is marked Lost.", "and Send says so for a Lost job", JSON.stringify(lostSend));
    await sql`update leads set status = 'sold' where id = ${A.id}`;
    check((await docRow(d1)).status === "draft" && (await fileRow(scratch.id)).shared_at === null,
      "the draft is still a draft and the file still private", "changed");
    check((await sql`select count(*)::int as n from job_events where lead_id = ${A.id} and body like 'Sent %'`)[0].n === 0,
      "no Sent event was logged by any refusal", "an event");
    check((await deleteFile(scratch.id, ACTOR)) === true, "positive control: a file no document names deletes", "false");

    console.log("step 6: send");
    const sent = await sendJobDocument({ jobId: A.id, documentId: d1, actor: ACTOR });
    check("ok" in sent && sent.emailed === true, "sendJobDocument answers ok, emailed", JSON.stringify(sent));
    const row2 = await docRow(d1);
    check(row2.status === "sent" && row2.file_id && row2.sent_at && !row2.completed_at, "the document is sent and names its PDF", JSON.stringify(row2));
    const file1Id = row2.file_id as string;
    const file1 = await fileRow(file1Id);
    check(file1.shared_at !== null && file1.doc_type === "other" && file1.name === `${title}.pdf`,
      "its PDF is shared, typed other, named after the title", JSON.stringify(file1));
    check(blobs.get(file1.blob_pathname as string)?.subarray(0, 5).toString() === "%PDF-", "the stored bytes are a PDF", "not a PDF");
    check((await documentEvents(A.id)).includes(`Sent "${title}"`), "a Sent event is logged", JSON.stringify(await documentEvents(A.id)));
    check(same(emails, [title]), "the client email was sent once", JSON.stringify(emails));
    const resend = await sendJobDocument({ jobId: A.id, documentId: d1, actor: ACTOR });
    check("error" in resend && resend.error === "This document has already been sent.", "a second send is refused", JSON.stringify(resend));

    console.log("step 7: frozen once sent");
    check((await updateDraft({ leadId: A.id, documentId: d1, title, body: "changed" })) === false, "a sent document cannot be edited", "true");
    check((await discardDraft(A.id, d1, ACTOR)) === false, "nor discarded", "true");
    check((await setShared(A.id, file1Id, false, ACTOR)) === false, "the Files tab cannot unshare its PDF", "true");
    check((await setShared(A.id, file1Id, true, ACTOR)) === false, "nor share it", "true");
    check((await setDocType(A.id, file1Id, "quote", ACTOR)) === false, "nor relabel it", "true");
    check((await deleteFile(file1Id, ACTOR)) === false, "nor delete it (answered false, not a foreign-key error)", "true");
    const frozen = await fileRow(file1Id);
    check(frozen.shared_at !== null && frozen.doc_type === "other" && blobs.has(frozen.blob_pathname as string),
      "it is still shared, still typed other, and its bytes are still stored", JSON.stringify(frozen));

    console.log("step 8: acknowledge, and the release gate");
    const listA = await acknowledgeableDocuments(A.id);
    check(listA.length === 1 && listA[0].id === d1 && listA[0].file.id === file1Id, "A has the document to acknowledge", JSON.stringify(listA));
    check((await acknowledgeableDocuments(B.id)).length === 0, "B has nothing to acknowledge", "something");
    const gate = await recordAcknowledgement({ jobId: B.id, document: listA[0], name: "Mallory", email: "b@example.com", ip: null, userAgent: null });
    check(gate === "not-found", "acknowledging A's document as job B writes nothing", gate);
    check(same(await footprint(B.id), bBefore), "B has no new rows", JSON.stringify(await footprint(B.id)));
    check((await docRow(d1)).status === "sent", "and A's document is still sent", "changed");
    const ack = await recordAcknowledgement({ jobId: A.id, document: listA[0], name: "  Pat Client ", email: "pat@example.com", ip: "1.2.3.4", userAgent: "UA" });
    check(ack === "acknowledged", "the client acknowledges it", ack);
    const acks = await sql`select * from document_acknowledgements where file_id = ${file1Id}`;
    const expectedSha = createHash("sha256").update(blobs.get(file1.blob_pathname as string)!).digest("hex");
    check(acks.length === 1 && acks[0].doc_sha256 === expectedSha && acks[0].acknowledged_name === "Pat Client"
      && acks[0].acknowledged_email === "pat@example.com" && acks[0].lead_id === A.id && acks[0].ip === "1.2.3.4" && acks[0].user_agent === "UA",
      "one record, fingerprinting the stored bytes, trimmed name, session email, ip and agent", JSON.stringify(acks));
    check((await docRow(d1)).status === "completed", "the document is completed in the same statement", "not completed");
    const again = await recordAcknowledgement({ jobId: A.id, document: listA[0], name: "Pat", email: "pat@example.com", ip: null, userAgent: null });
    check(again === "already-acknowledged", "a repeat is a no-op", again);
    const ackEvents = (await documentEvents(A.id)).filter((body) => body.startsWith("Acknowledged"));
    check(same(ackEvents, [`Acknowledged "${title}" from their project page`]), "one Acknowledged event, naming the document not the typed name", JSON.stringify(ackEvents));
    check((await acknowledgeableDocuments(A.id)).length === 0, "nothing left to acknowledge", "something");
    check((await setShared(A.id, file1Id, false, ACTOR)) === false, "an acknowledged file cannot be unshared", "true");
    check((await deleteFile(file1Id, ACTOR)) === false, "nor deleted", "true");

    console.log("step 9: a completed document cannot be voided");
    check((await voidDocument(A.id, d1, ACTOR)) === false, "void refuses a completed, acknowledged document", "true");
    check((await fileRow(file1Id)).shared_at !== null && (await docRow(d1)).status === "completed", "and it stays completed and shared", "changed");

    console.log("step 10: void");
    const d2 = await sendNew(A.id, saId, finalBody);
    check((await voidDocument(B.id, d2.id, ACTOR)) === false, "another job cannot void it", "true");
    check((await docRow(d2.id)).status === "sent", "and it is still sent", "changed");
    check((await voidDocument(A.id, d2.id, ACTOR)) === true, "void answers true for a sent document", "false");
    const row3 = await docRow(d2.id);
    check(row3.status === "void" && row3.voided_at !== null && (await fileRow(d2.fileId)).shared_at === null,
      "it is void and its file unshared", JSON.stringify(row3));
    check((await documentEvents(A.id)).includes(`Voided "${title}"`), "a Voided event is logged", "no event");
    check((await voidDocument(A.id, d2.id, ACTOR)) === false, "voiding it again answers false", "true");
    check((await setShared(A.id, d2.fileId, true, ACTOR)) === false, "the Files tab cannot share a voided document again", "true");
    check((await deleteFile(d2.fileId, ACTOR)) === false, "nor delete its PDF", "true");
    const voidedFile = await getFile(d2.fileId);
    const aBeforeLate = await footprint(A.id);
    const late = await recordAcknowledgement({ jobId: A.id, document: { id: d2.id, title, file: voidedFile! }, name: "Pat", email: "pat@example.com", ip: null, userAgent: null });
    check(late === "not-found", "a voided document cannot be acknowledged", late);
    check(same(await footprint(A.id), aBeforeLate) && (await docRow(d2.id)).status === "void",
      "and nothing at all was written for it", JSON.stringify(await footprint(A.id)));
    // The same with the file shared: only the document's own status can refuse it now.
    await sql`update job_files set shared_at = now() where id = ${d2.fileId}`;
    check(!(await acknowledgeableDocuments(A.id)).some((doc) => doc.id === d2.id),
      "a void document is not offered for acknowledgement, even with its file shared", "offered");
    const lateShared = await recordAcknowledgement({ jobId: A.id, document: { id: d2.id, title, file: voidedFile! }, name: "Pat", email: "pat@example.com", ip: null, userAgent: null });
    check(lateShared === "not-found" && (await docRow(d2.id)).status === "void", "even with its file shared, a void document takes no acknowledgement", lateShared);
    await sql`update job_files set shared_at = null where id = ${d2.fileId}`;

    console.log("step 10b: void is refused when an acknowledgement row exists");
    const d6 = await sendNew(A.id, saId, finalBody);
    await sql`insert into document_acknowledgements (id, lead_id, file_id, acknowledged_name, acknowledged_email, doc_sha256)
      values (${randomUUID()}, ${A.id}, ${d6.fileId}, 'Pat Client', 'pat@example.com', 'verify')`;
    check((await voidDocument(A.id, d6.id, ACTOR)) === false, "void refuses a sent document whose PDF has an acknowledgement", "true");
    check((await docRow(d6.id)).status === "sent" && (await fileRow(d6.fileId)).shared_at !== null, "it stays sent and shared", "changed");

    console.log("step 11: a view document completes when sent");
    const viewId = idOf(await createTemplate({ name: "VERIFY Care notes", kind: "other", response: "view", body: "Dust weekly.", actor: ACTOR }), "view");
    const d3 = idOf(await createDocumentFromTemplate({ jobId: A.id, templateId: viewId, actor: ACTOR }), "create d3");
    const viewSent = await sendJobDocument({ jobId: A.id, documentId: d3, actor: ACTOR });
    const row4 = await docRow(d3);
    check("ok" in viewSent && row4.status === "completed" && row4.completed_at !== null, "a view document is completed on send", JSON.stringify(row4));
    check((await voidDocument(A.id, d3, ACTOR)) === false, "a completed view document cannot be voided", "true");
    check((await docRow(d3)).status === "completed", "and it stays completed", "changed");

    console.log("step 12: a sign document is signed through the contract path");
    const signTemplate = idOf(await createTemplate({ name: "VERIFY Change order", kind: "change_order", response: "sign",
      body: "## Change\n\nOne more shade for {{client_name}}.", actor: ACTOR }), "sign");
    const d4 = idOf(await createDocumentFromTemplate({ jobId: A.id, templateId: signTemplate, actor: ACTOR }), "create d4");
    const signSent = await sendJobDocument({ jobId: A.id, documentId: d4, actor: ACTOR });
    const signFileId = (await docRow(d4)).file_id as string;
    check("ok" in signSent && (await fileRow(signFileId)).doc_type === "contract", "a sign document's PDF is a contract", JSON.stringify(signSent));
    const signed = await recordSignature({ jobId: A.id, file: (await getFile(signFileId))!, name: "Pat Client", email: "pat@example.com", ip: null, userAgent: null });
    check(signed === "signed" && (await docRow(d4)).status === "completed", "signing completes the document in the same statement", signed);
    const [lead] = await sql`select status, sold_cents from leads where id = ${A.id}`;
    check(lead.status === "sold" && lead.sold_cents === null, "no Direct Connect version: the sale is untouched", JSON.stringify(lead));
    check((await voidDocument(A.id, d4, ACTOR)) === false, "a signed document cannot be voided", "true");

    console.log("step 12b: void is refused when a signature row exists");
    const d7 = await sendNew(A.id, signTemplate, "## Change\n\nOne more shade.");
    await sql`insert into contract_signatures (id, lead_id, file_id, signed_name, signed_email, doc_sha256)
      values (${randomUUID()}, ${A.id}, ${d7.fileId}, 'Pat Client', 'pat@example.com', 'verify')`;
    check((await voidDocument(A.id, d7.id, ACTOR)) === false, "void refuses a sent document whose PDF has a signature", "true");
    check((await docRow(d7.id)).status === "sent" && (await fileRow(d7.fileId)).shared_at !== null, "it stays sent and shared", "changed");

    console.log("step 13: discard a draft");
    const d5 = idOf(await createDocumentFromTemplate({ jobId: A.id, templateId: saId, actor: ACTOR }), "create d5");
    check((await voidDocument(A.id, d5, ACTOR)) === false, "a draft cannot be voided", "true");
    check((await discardDraft(B.id, d5, ACTOR)) === false, "another job cannot discard it", "true");
    check((await discardDraft(A.id, d5, ACTOR)) === true, "a draft is discarded", "false");
    check((await sql`select id from job_documents where id = ${d5}`).length === 0, "its row is gone", "still there");
    check((await documentEvents(A.id)).includes(`Discarded draft "${title}"`), "and the discard is logged", "no event");
    check(same(await footprint(B.id), bBefore), "B still has no new rows at the end", JSON.stringify(await footprint(B.id)));

    console.log("\nPASSED: the Documents SQL holds against a real database. Manual run, not coverage.\n");
  } finally {
    // Never throws: a throw here would replace the failure being reported.
    const attempt = async (label: string, work: () => Promise<unknown>) => {
      try {
        await work();
      } catch (error) {
        console.error(`cleanup could not ${label}:`, (error as Error).message);
      }
    };
    let leads = [A.id, B.id];
    await attempt("find leftover leads", async () => { leads = [...new Set([...leads, ...(await scriptLeads())])]; });
    await attempt("delete acknowledgements", () => sql`delete from document_acknowledgements where lead_id = any(${leads})`);
    await attempt("delete signatures", () => sql`delete from contract_signatures where lead_id = any(${leads})`);
    await attempt("delete documents", () => sql`delete from job_documents where lead_id = any(${leads})`);
    await attempt("delete events", () => sql`delete from job_events where lead_id = any(${leads})`);
    await attempt("delete files", () => sql`delete from job_files where lead_id = any(${leads})`);
    await attempt("delete leads", () => sql`delete from leads where id = any(${leads})`);
    await attempt("delete templates", () => sql`delete from document_templates where created_by = ${ACTOR}`);
    await attempt("restore the owners' live terms and guides",
      () => sql`update document_templates set archived_at = null where id = any(${prior})`);
    await attempt("report", async () => {
      const [left] = await sql`select
        (select count(*)::int from leads where name like ${`${NAME_PREFIX} %`} or id = any(${leads})) as leads,
        (select count(*)::int from document_templates where created_by = ${ACTOR}) as templates,
        (select count(*)::int from job_documents where lead_id = any(${leads})) as documents,
        (select count(*)::int from job_files where lead_id = any(${leads})) as files,
        (select count(*)::int from job_events where lead_id = any(${leads})) as events,
        (select count(*)::int from document_acknowledgements where lead_id = any(${leads})) as acknowledgements,
        (select count(*)::int from contract_signatures where lead_id = any(${leads})) as signatures,
        (select count(*)::int from document_templates where id = any(${prior}) and archived_at is null) as restored`;
      console.log(`cleanup: ${left.leads} leads and ${left.templates} templates left, ${left.restored} of ${prior.length} owner templates restored`);
      console.log(`cleanup: ${left.documents} documents, ${left.files} files, ${left.events} events, ${left.acknowledgements} acknowledgements, ${left.signatures} signatures left`);
    });
  }
});
