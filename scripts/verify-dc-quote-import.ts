/**
 * Behavioural proof of the Direct Connect quote-import SQL (migration 024, lib/dc/store.ts,
 * lib/dc/import.ts, lib/dc/send.ts and the generated-contract branch of lib/portal/sign.ts).
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is a script you run by hand, it is in no suite, and CI
 * does not execute it. If you change importVersion, setLineOverride, setVersionChoices,
 * importDealerCopy, loadReview, sendContract's freeze statement, recordSignature's `version` /
 * `sold` CTEs, or migration 024's constraints, run it yourself — and if you cannot, call that SQL
 * unverified. This feature moves money.
 *
 * Why it exists: the unit tests mock db(), so they prove SQL *text* only. This script calls the
 * real functions against a real Postgres. The mocks are @vercel/blob (put/get/del, in memory —
 * there is no blob token here) and, for Send, the contract PDF builder and the client email
 * (neither touches the database). Every statement reaches the database for real.
 *
 * What it does, against a throwaway database:
 *   1. import: two leads A and B (project numbers from the sequence). importDealerCopy on the
 *      4-line fixture rewritten to A's PSS number creates version 1 as a draft with the 4 lines
 *      in exact cents and the fixture's options, one 'quote' event, and an unshared Dealer Copy
 *      file (doc_type dealer_copy) — through the real createFile. B gets no rows (release gate);
 *   2. idempotence: the same message again is "unchanged"; importVersion with that messageId is
 *      null; the same bytes under a new message are "unchanged", and so is a re-send whose only
 *      difference is DC's per-email tracking pixel (the hash is of the parsed quote). Still one
 *      version; the stored source_sha256 is quoteSha256 of the quote, and client_name is the DC Client;
 *   3. numbering: a Dealer Copy whose quote changed (a new Client name) under a new message creates
 *      version 2, which stores that name;
 *   4. draft-only edits: setLineOverride / setVersionChoices on v2 answer true; with v2 marked
 *      'sent' by hand they answer false and the rows are unchanged;
 *   5. races: sendContract on v2 while (a) another send marks it sent, (b) a line's % of MSRP
 *      changes, (c) waive-handling changes, (d) no-install changes — each between the review and
 *      the freeze (injected from inside the PDF build). Each answers "changed while you were
 *      sending", leaves no contract file, v2 still a draft with unpriced lines, A untouched;
 *   6. send: sendContract freezes v2 at priceVersion's figures (computed here independently),
 *      supersedes v1, shares the contract, sets A's quote_cents and moves A from visit_booked to
 *      quoted with one stage event. The client email is called once;
 *   7. a second send of v2 is refused and leaves exactly one contract file;
 *   8. after a markup rule change, loadReview of the sent v2 returns the frozen figures;
 *   9. a second 'sent' version on the same contract file violates the unique index (23505);
 *  10. sign: recordSignature on the contract signs v2, moves A to signed with sold_cents = the total;
 *  11. a raw `update job_files set shared_at = now()` on the Dealer Copy is a check violation;
 *  11b. a generated contract: listFiles marks v2's contract quoteContract; setDocType on it answers
 *      false; re-sharing the contract of a superseded version answers false and leaves it
 *      unshared, while unsharing it and sharing a plain document (positive control) answer true;
 *  12. deletes everything it wrote (leads by name prefix, their rows, its messages) and puts back
 *      the markup rules and dc_settings it changed, even on failure.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. Point it only at a Neon test branch. It takes its
 * connection from E2E_POSTGRES_URL alone — never POSTGRES_URL, DATABASE_URL or .env.local —
 * and it refuses to start if that URL looks like production. It changes markup_rules for the
 * fixture's four product lines and dc_settings.terms_file_pathname while it runs, and restores
 * both: never run it against a database the owners are using.
 *
 * Usage (bash):
 *   E2E_POSTGRES_URL='<neon test branch url>' \
 *     npx vitest run --config scripts/verify-dc-quote-import.config.mts
 *
 * Usage (PowerShell):
 *   $env:E2E_POSTGRES_URL='<neon test branch url>'
 *   npx vitest run --config scripts/verify-dc-quote-import.config.mts
 *
 * To watch it fail (which is the only way to know it works): delete `and status = 'draft'` from
 * the `frozen` CTE in sendContract (lib/dc/send.ts) and run it again. Step 5(a) must fail (the
 * freeze then re-sends a version another send already took). Put it back. Likewise the
 * `not exists (... pct_override is distinct from ...)` clause for 5(b) and the
 * `waive_handling = ...` comparison for 5(c).
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test, vi } from "vitest";

// The mocks: stored bytes kept in memory, and Send's two non-database side effects.
const blobs = vi.hoisted(() => new Map<string, Buffer>());
const hooks = vi.hoisted(() => ({
  /** Runs inside the PDF build: after sendContract's review, before its freeze. */
  duringBuild: null as null | (() => Promise<void>),
  emails: [] as string[],
}));
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
    return {
      statusCode: 200,
      stream: new Blob([new Uint8Array(bytes)]).stream(),
      blob: { contentType: "application/pdf" },
    };
  },
}));
vi.mock("../lib/dc/contract-pdf", () => ({
  renderContractPdf: async (input: { projectNo: string; version: number }) => {
    if (hooks.duringBuild) await hooks.duringBuild();
    return {
      bytes: new Uint8Array(Buffer.from(`%PDF-1.4 verify contract ${input.projectNo} v${input.version}`)),
      marks: { initials: [], signature: { page: 0, x: 154, y: 300 } },
    };
  },
}));
vi.mock("../lib/dc/send-contract-email", () => ({
  sendContractEmail: async (_job: unknown, fileName: string) => {
    hooks.emails.push(fileName);
  },
}));

import { createFile, getFile, listFiles, setDocType, setShared } from "../lib/admin/files";
import { importDealerCopy, quoteSha256 } from "../lib/dc/import";
import { parseDealerCopy } from "../lib/dc/parse";
import { priceVersion } from "../lib/dc/pricing";
import { loadReview, sendContract } from "../lib/dc/send";
import { importVersion, listMarkupRules, listVersions, saveMarkupRule, setLineOverride, setVersionChoices } from "../lib/dc/store";
import { recordSignature } from "../lib/portal/sign";
import { formatProjectNo } from "../lib/portal/project-no";

/** Endpoints this script must never write to. Production is the whole point of the list. */
const FORBIDDEN_HOSTS = ["cold-term"];

const BANNER = "\n================ verify-dc-quote-import REFUSED TO RUN ================\n";

function refuse(reason: string): never {
  // Printed as well as thrown: the thrown message sets the exit code, the print is what a human reads.
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-dc-quote-import refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse(
    "E2E_POSTGRES_URL is not set.\n\n" +
      "This script WRITES rows, so it will not fall back to POSTGRES_URL, DATABASE_URL\n" +
      "or .env.local — any of which may point at production. Give it a Neon test branch:\n\n" +
      "  E2E_POSTGRES_URL='<neon test branch url>' \\\n" +
      "    npx vitest run --config scripts/verify-dc-quote-import.config.mts\n\n" +
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
// No real email leaves this script: the owner notification after an import throws (and is
// caught) without a key, and the client email is mocked above.
delete process.env.RESEND_API_KEY;

const sql = neon(url);
const ACTOR = "verify-dc-quote-import@example.com";
const STAMP = Date.now();
const NAME_PREFIX = "VERIFY DC Quote Import";
const LEAD_NAME = `${NAME_PREFIX} ${STAMP}`;
const MESSAGE_PREFIX = `<verify-dc-${STAMP}`;
const message = (n: number) => `${MESSAGE_PREFIX}-${n}@example.com>`;
const FIXTURE = readFileSync("tests/fixtures/dc/dealer-copy-4-lines.html", "utf8");
/** The four product lines the fixture uses: their rules are set for Send, then put back. */
const COLLECTIONS = ["Duette", "Silhouette", "Palm Beach Shutters", "Motorization"];
const RULES: Record<string, number> = { Duette: 200, Silhouette: 185.5, "Palm Beach Shutters": 150, Motorization: 120 };
const RACE = "This quote changed while you were sending. Reload and try again.";

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const newLead = async (suffix: string, status: string): Promise<{ id: string; projectNo: number }> => {
  const rows = await sql`
    insert into leads (name, phone, email, city, source, status)
    values (${`${LEAD_NAME} ${suffix}`}, '7025550199', ${`verify-${STAMP}-${suffix}@example.com`},
            'Henderson', 'phone', ${status})
    returning id, project_no`;
  return { id: rows[0].id as string, projectNo: Number(rows[0].project_no) };
};

/** Row counts a job owns, per table, so "B has no rows" and "nothing new" are one comparison. */
const footprint = async (leadId: string) => {
  const [row] = await sql`
    select (select count(*)::int from dc_quote_versions where lead_id = ${leadId}) as versions,
           (select count(*)::int from job_files where lead_id = ${leadId}) as files,
           (select count(*)::int from job_events where lead_id = ${leadId}) as events,
           (select count(*)::int from ingested_messages where lead_id = ${leadId}) as messages`;
  return row;
};

const versionRow = async (id: string) =>
  (await sql`select status, waive_handling, no_install, install_quote_id, install_cents, products_cents,
                    client_total_cents, contract_file_id, sent_at, sent_by, signed_at
             from dc_quote_versions where id = ${id}`)[0];

const lineRows = async (versionId: string) =>
  await sql`select position, pct_override, markup_pct, sell_unit_cents, markup_overridden
            from dc_quote_lines where version_id = ${versionId} order by position`;

const leadRow = async (id: string) =>
  (await sql`select status, quote_cents, sold_cents from leads where id = ${id}`)[0];

const contractFiles = async (leadId: string) =>
  await sql`select id, shared_at, doc_type from job_files where lead_id = ${leadId} and doc_type = 'contract'`;

const stageEvents = async (id: string) =>
  await sql`select from_status, to_status from job_events where lead_id = ${id} and kind = 'stage' order by created_at`;

/** Every lead this script (or an earlier, interrupted run of it) left behind. */
const scriptLeads = async () =>
  (await sql`select id from leads where name like ${`${NAME_PREFIX} %`}`).map((r) => r.id as string);

test("DC quote import: import, edit, send, sign and the Dealer Copy guard against a real database", async () => {
  console.log(`\nverify-dc-quote-import: writing to a test branch\n`);

  // What this script changes outside its own leads, read first so the finally block can put it back.
  const priorRules = await sql`
    select collection, pct_of_msrp, updated_by, updated_at from markup_rules
    where lower(collection) = any(${COLLECTIONS.map((c) => c.toLowerCase())})`;
  const [priorSettings] = await sql`select terms_file_pathname, terms_updated_by, terms_updated_at from dc_settings where id`;
  if (!priorSettings) throw new Error("setup: dc_settings has no row — is migration 024 applied?");

  const A = await newLead("A", "visit_booked");
  const B = await newLead("B", "visit_booked");

  try {
    console.log("step 1: import");
    const html = FIXTURE.replace("<td>PSS-1042</td>", `<td>${formatProjectNo(A.projectNo)}</td>`);
    check(html !== FIXTURE, "the fixture's PO Reference is rewritten to A's number", "no PSS-1042 cell found");
    const parsed = parseDealerCopy(html);
    if (!parsed.ok) throw new Error(`setup: the fixture no longer parses: ${JSON.stringify(parsed.refusal)}`);
    const quote = parsed.quote;
    check(quote.projectNo === A.projectNo && quote.lines.length === 4, "the fixture parses to A with 4 lines",
      `projectNo ${quote.projectNo}, ${quote.lines.length} lines`);
    const bBefore = await footprint(B.id);

    const first = await importDealerCopy({ internetMessageId: message(1), receivedAt: new Date(), html });
    check(first.outcome === "imported" && first.leadId === A.id && first.version === 1,
      "importDealerCopy imports version 1 onto A", `got ${JSON.stringify(first)}`);
    const v1rows = await sql`select * from dc_quote_versions where lead_id = ${A.id}`;
    check(v1rows.length === 1 && v1rows[0].version === 1 && v1rows[0].status === "draft",
      "one version, version 1, draft", `got ${JSON.stringify(v1rows.map((v) => [v.version, v.status]))}`);
    const v1 = v1rows[0].id as string;
    check(
      v1rows[0].dealer_subtotal_cents === quote.subtotalCents && v1rows[0].handling_fee_cents === quote.handlingFeeCents &&
        v1rows[0].oversized_fee_cents === quote.oversizedFeeCents && v1rows[0].dealer_total_cents === quote.dealerTotalCents &&
        v1rows[0].dc_quote_no === quote.quoteNo && v1rows[0].po_reference === quote.poReference &&
        v1rows[0].message_id === message(1),
      "the version's dealer totals, quote number, PO and message are the fixture's", `row ${JSON.stringify(v1rows[0])}`,
    );
    const stored = await sql`select * from dc_quote_lines where version_id = ${v1} order by position`;
    const want = quote.lines.map((l) => [l.position, l.qty, l.room, l.description, l.collection, l.baseCents,
      l.promotionCents, l.optionsCents, l.msrpUnitCents, l.costFactor === null ? null : Number(l.costFactor),
      l.costUnitCents, l.costExtendedCents, l.options]);
    const got = stored.map((l) => [l.position, l.qty, l.room, l.description, l.collection, l.base_cents,
      l.promotion_cents, l.options_cents, l.msrp_unit_cents, l.cost_factor === null ? null : Number(l.cost_factor),
      l.cost_unit_cents, l.cost_extended_cents, l.options]);
    check(stored.length === 4 && same(got, want), "4 lines with exact cents and the fixture's options JSON",
      `got ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
    const quoteEvents = await sql`select body from job_events where lead_id = ${A.id} and kind = 'quote'`;
    check(quoteEvents.length === 1 && (quoteEvents[0].body as string).includes(quote.quoteNo),
      "one 'quote' event naming the DC quote", `got ${JSON.stringify(quoteEvents)}`);
    const copies = await sql`select id, shared_at, doc_type, content_type from job_files where lead_id = ${A.id}`;
    check(copies.length === 1 && copies[0].id === v1rows[0].source_file_id && copies[0].doc_type === "dealer_copy" &&
        copies[0].shared_at === null && copies[0].content_type === "text/html",
      "one unshared dealer_copy file, the version's source", `got ${JSON.stringify(copies)}`);
    const dealerCopyId = copies[0].id as string;
    const msg1 = await sql`select outcome, lead_id from ingested_messages where message_id = ${message(1)}`;
    check(msg1.length === 1 && msg1[0].outcome === "imported" && msg1[0].lead_id === A.id,
      "the message is recorded as imported for A", `got ${JSON.stringify(msg1)}`);
    check(same(await footprint(B.id), bBefore), "B has no new rows (release gate)",
      `before ${JSON.stringify(bBefore)}, after ${JSON.stringify(await footprint(B.id))}`);

    console.log("step 2: idempotence");
    const replay = await importDealerCopy({ internetMessageId: message(1), receivedAt: new Date(), html });
    check(replay.outcome === "unchanged", "the same message again is unchanged", `got ${JSON.stringify(replay)}`);
    const direct = await importVersion({ messageId: message(1), receivedAt: new Date(), leadId: A.id, quote,
      sourceFileId: dealerCopyId, sha256: "0".repeat(64), actor: ACTOR });
    check(direct === null, "importVersion with the recorded messageId answers null", `got ${JSON.stringify(direct)}`);
    const resent = await importDealerCopy({ internetMessageId: message(2), receivedAt: new Date(), html });
    check(resent.outcome === "unchanged" && resent.leadId === A.id, "the same bytes under a new message are unchanged",
      `got ${JSON.stringify(resent)}`);
    const pixel = /awstrack\.me\/I0\/[^"']+/;
    const repixelled = html.replace(pixel, "awstrack.me/I0/010001a0ffffffff-00000000-0000-0000-0000-000000000000-000000/verify=473");
    check(pixel.test(html) && repixelled !== html, "setup: the fixture has a tracking pixel to change", "no awstrack URL");
    const pixelOnly = await importDealerCopy({ internetMessageId: message(4), receivedAt: new Date(), html: repixelled });
    check(pixelOnly.outcome === "unchanged" && pixelOnly.leadId === A.id,
      "a re-send differing only in DC's tracking pixel is unchanged", `got ${JSON.stringify(pixelOnly)}`);
    check(v1rows[0].source_sha256 === quoteSha256(quote) && v1rows[0].client_name === quote.clientName && quote.clientName === "Test",
      "v1 stores the parsed quote's hash and the DC Client name", `sha ${v1rows[0].source_sha256}, client ${v1rows[0].client_name}`);
    const afterReplay = await sql`select count(*)::int as n from dc_quote_versions where lead_id = ${A.id}`;
    const filesAfterReplay = await sql`select count(*)::int as n from job_files where lead_id = ${A.id}`;
    check(afterReplay[0].n === 1 && filesAfterReplay[0].n === 1, "still one version and one Dealer Copy",
      `versions ${afterReplay[0].n}, files ${filesAfterReplay[0].n}`);

    console.log("step 3: numbering");
    // A change DC would make to the quote itself: the client's name, which leaves every figure as it was.
    const html2 = html.replace("<b>Client:</b></td><td>Test<", "<b>Client:</b></td><td>Test Revised<");
    check(html2 !== html, "setup: the second Dealer Copy names another client", "no Client: Test cell found");
    const second = await importDealerCopy({ internetMessageId: message(3), receivedAt: new Date(), html: html2 });
    check(second.outcome === "imported" && second.version === 2, "a changed copy under a new message is version 2",
      `got ${JSON.stringify(second)}`);
    const versions = await listVersions(A.id);
    check(versions.length === 2 && versions[0].version === 2 && versions[1].version === 1 &&
        versions[0].status === "draft" && versions[0].lines.length === 4,
      "listVersions: v2 (draft, 4 lines) then v1", `got ${JSON.stringify(versions.map((v) => [v.version, v.status, v.lines.length]))}`);
    check(versions[0].clientName === "Test Revised" && versions[1].clientName === "Test",
      "listVersions reads each version's DC Client name back", `got ${JSON.stringify(versions.map((v) => v.clientName))}`);
    const v2 = versions[0].id;
    check(same(await footprint(B.id), bBefore), "B still has no new rows", "B changed");

    console.log("step 4: draft-only edits");
    check((await setLineOverride(A.id, v2, 1, 210, ACTOR)) === true, "setLineOverride on draft v2 answers true", "false");
    check((await setLineOverride(A.id, v2, 1, null, ACTOR)) === true, "clearing it answers true", "false");
    check((await setLineOverride(B.id, v2, 1, 210, ACTOR)) === false, "setLineOverride through another job answers false", "true");
    await sql`update dc_quote_versions set status = 'sent' where id = ${v2}`;
    const linesBefore = JSON.stringify(await lineRows(v2));
    const versionBefore = JSON.stringify(await versionRow(v2));
    check((await setLineOverride(A.id, v2, 1, 210, ACTOR)) === false, "setLineOverride on sent v2 answers false", "true");
    check((await setVersionChoices(A.id, v2, { waiveHandling: true, noInstall: true })) === false,
      "setVersionChoices on sent v2 answers false", "true");
    check(JSON.stringify(await lineRows(v2)) === linesBefore && JSON.stringify(await versionRow(v2)) === versionBefore,
      "the sent version and its lines are unchanged", "a row changed");
    await sql`update dc_quote_versions set status = 'draft' where id = ${v2}`;

    // What Send needs: terms, a rule per product line, and an installation price.
    const termsPathname = `verify/terms-${STAMP}.pdf`;
    blobs.set(termsPathname, Buffer.from("%PDF-1.4 verify terms"));
    await sql`update dc_settings set terms_file_pathname = ${termsPathname} where id`;
    for (const [collection, pct] of Object.entries(RULES)) await saveMarkupRule(collection, pct, ACTOR);
    const installQuoteId = randomUUID();
    await sql`
      insert into install_quotes (id, lead_id, kind, minimum_cents, subtotal_cents, total_cents, created_by)
      values (${installQuoteId}, ${A.id}, 'final', 0, 25000, 25000, ${ACTOR})`;

    const reviewed = await loadReview(A.id);
    if (!reviewed) throw new Error("setup: loadReview(A) is null");
    check(reviewed.version.id === v2 && reviewed.blockers.length === 0, "loadReview offers v2 with no blockers",
      `version ${reviewed.version.version}, blockers ${JSON.stringify(reviewed.blockers)}`);
    const unsent = { lead: JSON.stringify(await leadRow(A.id)), lines: JSON.stringify(await lineRows(v2)) };

    const race = async (label: string, change: () => Promise<void>, undo: () => Promise<void>) => {
      const fresh = await loadReview(A.id);
      hooks.duringBuild = change;
      let answer: Awaited<ReturnType<typeof sendContract>>;
      try {
        answer = await sendContract({ jobId: A.id, versionId: v2, fingerprint: fresh!.fingerprint, actor: ACTOR });
      } finally {
        hooks.duringBuild = null;
      }
      check("error" in answer && answer.error === RACE, `${label}: sendContract answers the race error`,
        `got ${JSON.stringify(answer)}`);
      const left = await contractFiles(A.id);
      check(left.length === 0, `${label}: no contract file is left`, `got ${JSON.stringify(left)}`);
      await undo();
      const row = await versionRow(v2);
      check(row.status === "draft" && row.contract_file_id === null && row.client_total_cents === null,
        `${label}: v2 is still an unfrozen draft`, `row ${JSON.stringify(row)}`);
      check(JSON.stringify(await lineRows(v2)) === unsent.lines, `${label}: v2's lines are unpriced`,
        JSON.stringify(await lineRows(v2)));
      check(JSON.stringify(await leadRow(A.id)) === unsent.lead && (await stageEvents(A.id)).length === 0,
        `${label}: A is untouched (status, quote_cents, no stage event)`, JSON.stringify(await leadRow(A.id)));
      check(hooks.emails.length === 0, `${label}: no client email`, `got ${JSON.stringify(hooks.emails)}`);
    };

    console.log("step 5: races between review and freeze");
    await race("(a) another send took it",
      async () => { await sql`update dc_quote_versions set status = 'sent' where id = ${v2}`; },
      async () => { await sql`update dc_quote_versions set status = 'draft' where id = ${v2}`; });
    await race("(b) a line's % of MSRP changed",
      async () => { if (!(await setLineOverride(A.id, v2, 1, 175, ACTOR))) throw new Error("setup: override refused"); },
      async () => { if (!(await setLineOverride(A.id, v2, 1, null, ACTOR))) throw new Error("setup: clear refused"); });
    await race("(c) waive-handling changed",
      async () => { if (!(await setVersionChoices(A.id, v2, { waiveHandling: true }))) throw new Error("setup: waive refused"); },
      async () => { if (!(await setVersionChoices(A.id, v2, { waiveHandling: false }))) throw new Error("setup: unwaive refused"); });
    await race("(d) no-install changed",
      async () => { if (!(await setVersionChoices(A.id, v2, { noInstall: true }))) throw new Error("setup: no-install refused"); },
      async () => { if (!(await setVersionChoices(A.id, v2, { noInstall: false }))) throw new Error("setup: install refused"); });

    console.log("step 6: send");
    // The expected figures, computed here from the stored lines and today's rules, not read from Send.
    const rulesNow = await listMarkupRules();
    const expected = priceVersion({
      lines: (await listVersions(A.id))[0].lines.map((l) => ({ position: l.position, qty: l.qty, collection: l.collection,
        msrpUnitCents: l.msrpUnitCents, costExtendedCents: l.costExtendedCents, pctOverride: l.pctOverride })),
      rules: rulesNow, handlingFeeCents: quote.handlingFeeCents, oversizedFeeCents: quote.oversizedFeeCents,
      dealerTotalCents: quote.dealerTotalCents, waiveHandling: false,
      install: { id: installQuoteId, kind: "final", totalCents: 25000, createdAt: new Date() }, noInstall: false,
    });
    check(expected.clientTotalCents !== null && expected.blockers.length === 0, "setup: priceVersion prices every line",
      JSON.stringify(expected.blockers));
    const fresh = await loadReview(A.id);
    const sent = await sendContract({ jobId: A.id, versionId: v2, fingerprint: fresh!.fingerprint, actor: ACTOR });
    check(same(sent, { ok: true, emailed: true }), "sendContract answers ok, emailed", `got ${JSON.stringify(sent)}`);
    const v2sent = await versionRow(v2);
    check(
      v2sent.status === "sent" && v2sent.client_total_cents === expected.clientTotalCents &&
        v2sent.products_cents === expected.productsCents && v2sent.install_cents === 25000 &&
        v2sent.install_quote_id === installQuoteId && v2sent.sent_at !== null && v2sent.sent_by === ACTOR,
      `v2 is sent, frozen at priceVersion's total ${expected.clientTotalCents}`,
      `row ${JSON.stringify(v2sent)}, expected ${JSON.stringify(expected)}`,
    );
    const frozenLines = (await lineRows(v2)).map((l) => [l.position, Number(l.markup_pct), l.sell_unit_cents, l.markup_overridden]);
    const expectedLines = expected.lines.map((l) => [l.position, l.pct, l.sellUnitCents, l.source === "override"]);
    check(same(frozenLines, expectedLines), "v2's lines hold priceVersion's % and sell price",
      `got ${JSON.stringify(frozenLines)}, want ${JSON.stringify(expectedLines)}`);
    check((await versionRow(v1)).status === "superseded", "v1 is superseded", JSON.stringify(await versionRow(v1)));
    const contracts = await contractFiles(A.id);
    check(contracts.length === 1 && contracts[0].id === v2sent.contract_file_id && contracts[0].shared_at !== null &&
        contracts[0].doc_type === "contract",
      "one shared contract file, the one v2 points at", `got ${JSON.stringify(contracts)}`);
    const contractId = contracts[0].id as string;
    const aSent = await leadRow(A.id);
    check(aSent.status === "quoted" && aSent.quote_cents === expected.clientTotalCents,
      "A is quoted with quote_cents = the client total", `row ${JSON.stringify(aSent)}`);
    const stages = await stageEvents(A.id);
    check(stages.length === 1 && stages[0].from_status === "visit_booked" && stages[0].to_status === "quoted",
      "one stage event, visit_booked -> quoted", `got ${JSON.stringify(stages)}`);
    check(hooks.emails.length === 1, "the client email was sent once", `got ${JSON.stringify(hooks.emails)}`);
    const dealerCopies = await sql`select shared_at from job_files where lead_id = ${A.id} and doc_type = 'dealer_copy'`;
    check(dealerCopies.length === 2 && dealerCopies.every((f) => f.shared_at === null),
      "both Dealer Copies are still unshared", `got ${JSON.stringify(dealerCopies)}`);

    console.log("step 7: a second send");
    // A fresh, matching fingerprint, so the only thing that can refuse it is the version being sent.
    const resend = await loadReview(A.id);
    const again = await sendContract({ jobId: A.id, versionId: v2, fingerprint: resend!.fingerprint, actor: ACTOR });
    check(same(again, { error: "This version has already been sent." }),
      "sending v2 again is refused: This version has already been sent.", `got ${JSON.stringify(again)}`);
    check((await contractFiles(A.id)).length === 1 && (await versionRow(v2)).contract_file_id === contractId,
      "still exactly one contract file, still v2's", JSON.stringify(await contractFiles(A.id)));
    check(hooks.emails.length === 1, "no second client email", `got ${JSON.stringify(hooks.emails)}`);

    console.log("step 8: a sent version keeps its figures when a rule changes");
    await saveMarkupRule("Duette", 300, ACTOR);
    const repriced = priceVersion({
      lines: (await listVersions(A.id))[0].lines.map((l) => ({ position: l.position, qty: l.qty, collection: l.collection,
        msrpUnitCents: l.msrpUnitCents, costExtendedCents: l.costExtendedCents, pctOverride: l.pctOverride })),
      rules: await listMarkupRules(), handlingFeeCents: quote.handlingFeeCents, oversizedFeeCents: quote.oversizedFeeCents,
      dealerTotalCents: quote.dealerTotalCents, waiveHandling: false,
      install: { id: installQuoteId, kind: "final", totalCents: 25000, createdAt: new Date() }, noInstall: false,
    });
    check(repriced.clientTotalCents !== expected.clientTotalCents, "setup: the new rule would change the total",
      `both ${repriced.clientTotalCents}`);
    const afterRule = await loadReview(A.id);
    const shown = afterRule!.priced;
    check(
      afterRule!.version.id === v2 && shown.clientTotalCents === expected.clientTotalCents &&
        shown.productsCents === expected.productsCents && shown.installCents === expected.installCents &&
        shown.handlingChargedCents === expected.handlingChargedCents && shown.oversizedCents === expected.oversizedCents &&
        shown.marginCents === expected.marginCents &&
        same(shown.lines.map((l) => [l.position, l.pct, l.sellUnitCents, l.sellExtendedCents]),
          expected.lines.map((l) => [l.position, l.pct, l.sellUnitCents, l.sellExtendedCents])),
      "loadReview of the sent v2 shows the frozen figures, not a re-price",
      `shown ${JSON.stringify(shown)}, frozen ${JSON.stringify(expected)}`,
    );

    console.log("step 9: one sent version per contract");
    const duplicate = await sql`
      insert into dc_quote_versions
        (id, lead_id, version, dc_quote_no, po_reference, source_file_id, source_sha256, status,
         dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents, contract_file_id)
      values (${randomUUID()}, ${A.id}, 3, ${quote.quoteNo}, ${quote.poReference}, ${dealerCopyId}, ${"0".repeat(64)},
              'sent', 1, 0, 0, 1, ${contractId})`
      .then(() => "inserted", (error: { code?: string; constraint?: string }) => `${error.code}:${error.constraint}`);
    check(duplicate === "23505:dc_quote_versions_sent_contract_key",
      "a second sent version on the same contract violates the unique index", `got ${duplicate}`);

    console.log("step 10: sign");
    const contract = await getFile(contractId);
    if (!contract) throw new Error("setup: the contract file is gone");
    const signed = await recordSignature({ jobId: A.id, file: contract, name: "Jane Doe", email: ACTOR, ip: null, userAgent: null, adoption: { method: "typed", initials: null } });
    check(signed === "signed", "recordSignature answers signed", `got ${signed}`);
    const v2signed = await versionRow(v2);
    check(v2signed.status === "signed" && v2signed.signed_at !== null, "v2 is signed with signed_at",
      `row ${JSON.stringify(v2signed)}`);
    const aSold = await leadRow(A.id);
    check(aSold.status === "signed" && aSold.sold_cents === expected.clientTotalCents,
      `A is signed with sold_cents = ${expected.clientTotalCents}`, `row ${JSON.stringify(aSold)}`);
    const soldStages = await stageEvents(A.id);
    check(soldStages.length === 2 && soldStages[1].from_status === "quoted" && soldStages[1].to_status === "signed",
      "one more stage event, quoted -> signed", `got ${JSON.stringify(soldStages)}`);

    console.log("step 11: the Dealer Copy can never be shared");
    const shareCopy = await sql`update job_files set shared_at = now() where id = ${dealerCopyId}`
      .then(() => "updated", (error: { code?: string; constraint?: string }) => `${error.code}:${error.constraint}`);
    check(shareCopy === "23514:job_files_dealer_copy_never_shared",
      "sharing the Dealer Copy is a check violation", `got ${shareCopy}`);

    console.log("step 11b: a generated contract is managed from the Quote tab");
    const listed = await listFiles(A.id);
    check(listed.find((f) => f.id === contractId)?.quoteContract === true &&
        listed.filter((f) => f.id !== contractId).every((f) => f.quoteContract === false),
      "listFiles marks v2's contract, and only it, as a quote contract", JSON.stringify(listed.map((f) => [f.name, f.quoteContract])));
    check((await setDocType(A.id, contractId, "other", ACTOR)) === false, "relabelling v2's contract answers false", "true");
    const oldContract = await createFile({ leadId: A.id, kind: "document", name: "Contract old.pdf", contentType: "application/pdf",
      body: new Blob(["%PDF-1.4 old"]), actor: ACTOR, docType: "contract" });
    if (!oldContract) throw new Error("setup: could not create the superseded contract file");
    await sql`
      insert into dc_quote_versions
        (id, lead_id, version, dc_quote_no, po_reference, source_file_id, source_sha256, status,
         dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents, contract_file_id)
      values (${randomUUID()}, ${A.id}, 3, ${quote.quoteNo}, ${quote.poReference}, ${dealerCopyId}, ${"0".repeat(64)},
              'superseded', 1, 0, 0, 1, ${oldContract.id})`;
    check((await setShared(A.id, oldContract.id, true, ACTOR)) === false, "re-sharing a superseded version's contract answers false", "true");
    const oldRow = (await sql`select shared_at, doc_type from job_files where id = ${oldContract.id}`)[0];
    check(oldRow.shared_at === null, "the superseded contract is still unshared", JSON.stringify(oldRow));
    check((await setShared(A.id, oldContract.id, false, ACTOR)) === true, "unsharing it is still allowed", "false");
    check((await setDocType(A.id, oldContract.id, "other", ACTOR)) === false, "relabelling it answers false", "true");
    const plain = await createFile({ leadId: A.id, kind: "document", name: "Plain.pdf", contentType: "application/pdf",
      body: new Blob(["%PDF-1.4 plain"]), actor: ACTOR, docType: "contract" });
    if (!plain) throw new Error("setup: could not create the plain file");
    check((await setShared(A.id, plain.id, true, ACTOR)) === true, "positive control: sharing a contract no version names answers true", "false");
    check(same(await footprint(B.id), bBefore), "B still has no new rows at the end", "B changed");

    console.log("\nPASSED: the DC quote import holds against a real database. Manual run, not coverage.\n");
  } finally {
    // Step 12. Runs even on failure, and never throws: a throw here would replace the failure
    // being reported. The shared rows (markup_rules, dc_settings) go back first, each on its own,
    // so a failed delete below cannot leave them changed. Also sweeps leads an interrupted
    // earlier run left behind.
    hooks.duringBuild = null;
    const attempt = async (label: string, work: () => Promise<unknown>) => {
      try {
        await work();
      } catch (error) {
        console.error(`step 12: cleanup could not ${label}:`, (error as Error).message);
      }
    };
    await attempt("restore the markup rules", async () => {
      await sql`delete from markup_rules where lower(collection) = any(${COLLECTIONS.map((c) => c.toLowerCase())})`;
      for (const rule of priorRules) {
        await sql`insert into markup_rules (collection, pct_of_msrp, updated_by, updated_at)
                  values (${rule.collection}, ${rule.pct_of_msrp}, ${rule.updated_by}, ${rule.updated_at})`;
      }
    });
    await attempt("restore dc_settings", () => sql`
      update dc_settings set terms_file_pathname = ${priorSettings.terms_file_pathname},
        terms_updated_by = ${priorSettings.terms_updated_by}, terms_updated_at = ${priorSettings.terms_updated_at}
      where id`);
    let leads = [A.id, B.id];
    await attempt("find leftover leads", async () => { leads = [...new Set([...leads, ...(await scriptLeads())])]; });
    await attempt("delete signatures", () => sql`delete from contract_signatures where lead_id = any(${leads})`);
    await attempt("delete versions", () => sql`delete from dc_quote_versions where lead_id = any(${leads})`);
    await attempt("delete messages",
      () => sql`delete from ingested_messages where lead_id = any(${leads}) or message_id like ${`<verify-dc-%`}`);
    await attempt("delete events", () => sql`delete from job_events where lead_id = any(${leads})`);
    await attempt("delete files", () => sql`delete from job_files where lead_id = any(${leads})`);
    await attempt("delete leads", () => sql`delete from leads where id = any(${leads})`);
    await attempt("report what is left", async () => {
      const residue = await sql`select count(*)::int as n from leads where name like ${`${NAME_PREFIX} %`}`;
      const rulesBack = await sql`
        select collection from markup_rules where lower(collection) = any(${COLLECTIONS.map((c) => c.toLowerCase())})`;
      const messagesLeft = await sql`select count(*)::int as n from ingested_messages where message_id like ${`<verify-dc-%`}`;
      const [settingsBack] = await sql`select terms_file_pathname, terms_updated_by, terms_updated_at from dc_settings where id`;
      console.log(
        `step 12: cleanup, ${residue[0].n} leads and ${messagesLeft[0].n} messages left, ` +
          `${rulesBack.length} fixture rules (was ${priorRules.length}), ` +
          `dc_settings ${same(settingsBack, priorSettings) ? "restored" : "NOT RESTORED"}`,
      );
    });
  }
});
