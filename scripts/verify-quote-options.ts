/**
 * Behavioural proof of the quote options SQL: migration 040 (and 030 no longer defining the one-offered rule),
 * lib/dc/store.ts (addQuoteOption, latestSha, importVersion per option), the release gate in lib/dc/import.ts,
 * sendQuote and sendContract per option (lib/dc/send.ts), and approveDcQuote closing the other options
 * (lib/dc/approve.ts).
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand, it is in no suite, and CI does not execute it. If you change
 * any of that SQL, run it yourself, and if you cannot, call the SQL unverified. The unit tests mock db(): they
 * prove text only. The mocks here are @vercel/blob (in memory), the quote and contract PDF builders and the client
 * emails. None of them touches the database.
 *
 * What it does, against a throwaway database:
 *   1. import A: the 4-line fixture at J's number imports as option A version 1.
 *   2. the gate: the fixture at J's number with -B is no-match while J has no option B, and nothing is written on J.
 *   3. add: addQuoteOption gives J option B (one quote_options row, one 'quote' event naming PSS-…-B). A job that
 *      already holds B to Z is refused past Z; a Lost job, a job with no PSS number and an unknown id are refused,
 *      and no refusal stores an option or logs an event. Four real double-clicks (two calls in flight at once) never
 *      give a letter twice and leave exactly one event per stored option.
 *   4. import B and a change to A: B arrives as option B version 1 (its event names PSS-…-B). An unchanged A
 *      re-send is unchanged. A changed A is A version 2. A second B version 1 violates the per-option unique key.
 *   5. send A and B: both offered at once (the per-option one-offered rule), each under its own number, A v1
 *      superseded, quote_cents the last total sent. A second offered B version still fails at commit (23P01).
 *   6. re-apply every migration file, in order, with A and B both offered: no error, and the rules are still per option.
 *   7. approve B: A's offered version is superseded and its quote unshared, B's stays shared, J is approved with
 *      quote_cents = B's total, and the stage event names PSS-…-B.
 *   8. B's contract (Contract PSS-…-B v1.pdf) and signature: B signed, J signed, sold_cents = B's total.
 *   9. signed elsewhere: a changed A imports but cannot be sent (blocker and refusal, nothing written), and Add
 *      another quote is refused.
 *  10. the switch, on lead S: A approved and its contract sent. Re-sending B's unchanged Dealer Copy imports a new
 *      draft (B's newest had been closed), and sending it supersedes A, unshares A's quote and contract and puts
 *      S back to Quoted.
 *  10b. sendContract for B while A is signed: a signature landing mid-send is stopped by the frozen statement itself
 *      (race answer, no file left), and once A is signed the review refuses it ("Option A is signed").
 *  10c. approving B never unshares a superseded A quote that is tied to a signature.
 *  10d. a change order on the signed option: B v2 sent, approved with moved: false and a 'quote' event naming
 *      PSS-…-B version 2, quote_cents = its total, and its contract sent while B v1 is signed.
 *  10e. A and B approved at the same moment: exactly one wins; the other answers null or fails with 40P01.
 *  11. deletes everything it wrote and restores the markup rules and dc_settings, even on failure.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. Point it only at a Neon test branch already migrated with 040. It takes
 * its connection from E2E_POSTGRES_URL alone and refuses production (cold-term). Never print the URL.
 *
 * Usage (bash):
 *   E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" \
 *     npx vitest run --config scripts/verify-quote-options.config.mts --disableConsoleIntercept
 *
 * To watch it fail: put 030's old per-job one-offered statements back and run it. Step 6 must fail with
 * "could not create exclusion constraint". Then restore 030 and re-run scripts/migrate.mjs on the branch.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test, vi } from "vitest";

const blobs = vi.hoisted(() => new Map<string, Buffer>());
const hooks = vi.hoisted(() => ({
  emails: [] as string[],
  printed: [] as string[],
  owners: [] as string[],
  /** Runs inside the contract PDF build: after sendContract's review, before its freeze. */
  duringContract: null as null | (() => Promise<void>),
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
    return { statusCode: 200, stream: new Blob([new Uint8Array(bytes)]).stream(), blob: { contentType: "application/pdf" } };
  },
}));
vi.mock("../lib/dc/contract-pdf", () => ({
  renderContractPdf: async (input: { projectNo: string; version: number }) => {
    hooks.printed.push(`Contract ${input.projectNo} v${input.version}`);
    if (hooks.duringContract) await hooks.duringContract();
    return {
      bytes: new Uint8Array(Buffer.from(`%PDF-1.4 verify contract ${input.projectNo} v${input.version}`)),
      marks: { initials: [], signature: { page: 0, x: 154, y: 300 } },
    };
  },
}));
vi.mock("../lib/dc/quote-pdf", () => ({
  buildQuotePdf: async (input: { projectNo: string; version: number }) => {
    hooks.printed.push(`Quote ${input.projectNo} v${input.version}`);
    return new Uint8Array(Buffer.from(`%PDF-1.4 verify quote ${input.projectNo} v${input.version}`));
  },
}));
vi.mock("../lib/dc/send-quote-email", () => ({
  sendQuoteEmail: async (_job: unknown, fileName: string) => {
    hooks.emails.push(fileName);
  },
}));
vi.mock("../lib/dc/send-contract-email", () => ({
  sendContractEmail: async (_job: unknown, fileName: string) => {
    hooks.emails.push(fileName);
  },
}));
// The owners' import emails: recorded, never sent (RESEND_API_KEY is also deleted below).
vi.mock("../lib/dc/notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/dc/notify")>()),
  notifyOwners: async (email: { subject: string }) => {
    hooks.owners.push(email.subject);
  },
}));

import { getFile } from "../lib/admin/files";
import { approveDcQuote, offeredVersions } from "../lib/dc/approve";
import { importDealerCopy } from "../lib/dc/import";
import { loadReview, sendContract, sendQuote, signedElsewhere } from "../lib/dc/send";
import { addQuoteOption, OPTION_SIGNED, saveMarkupRule, setLineOverride } from "../lib/dc/store";
import { recordSignature } from "../lib/portal/sign";
import { formatOptionNo } from "../lib/portal/project-no";

const FORBIDDEN_HOSTS = ["cold-term"];
const BANNER = "\n================ verify-quote-options REFUSED TO RUN ================\n";

function refuse(reason: string): never {
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-quote-options refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse(
    "E2E_POSTGRES_URL is not set.\n\n" +
      "This script WRITES rows, so it will not fall back to POSTGRES_URL, DATABASE_URL or .env.local.\n" +
      "Give it a Neon test branch. It does not skip: no result means it did not run, not that the SQL holds.",
  );
}
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return refuse("E2E_POSTGRES_URL is not a valid URL, so its host cannot be checked.");
  }
})();
for (const forbidden of FORBIDDEN_HOSTS) {
  if (url.includes(forbidden)) refuse(`E2E_POSTGRES_URL points at ${host.split(".")[0]}, the production endpoint. Cut a Neon branch instead.`);
}
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
delete process.env.RESEND_API_KEY;

const sql = neon(url);
const ACTOR = "verify-quote-options@example.com";
const STAMP = Date.now();
const NAME_PREFIX = "VERIFY Quote Options";
const MESSAGE_PREFIX = `<verify-qo-${STAMP}`;
const message = (n: number) => `${MESSAGE_PREFIX}-${n}@example.com>`;
const FIXTURE = readFileSync("tests/fixtures/dc/dealer-copy-4-lines.html", "utf8");
const COLLECTIONS = ["Duette", "Silhouette", "Palm Beach Shutters", "Motorization"];
const RULES: Record<string, number> = { Duette: 200, Silhouette: 185.5, "Palm Beach Shutters": 150, Motorization: 120 };
const INSTALL_CENTS = 25000;

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const failure = (error: { code?: string; constraint?: string }) => `${error.code}:${error.constraint}`;

type Lead = { id: string; projectNo: number };
const newLead = async (suffix: string): Promise<Lead> => {
  const rows = await sql`
    insert into leads (name, phone, email, city, source, status)
    values (${`${NAME_PREFIX} ${STAMP} ${suffix}`}, '7025550199', ${`verify-qo-${STAMP}-${suffix}@example.com`}, 'Henderson', 'phone', 'visit_booked')
    returning id, project_no`;
  return { id: rows[0].id as string, projectNo: Number(rows[0].project_no) };
};
const installFor = (leadId: string) => sql`
  insert into install_quotes (id, lead_id, kind, minimum_cents, subtotal_cents, total_cents, created_by)
  values (${randomUUID()}, ${leadId}, 'final', 0, ${INSTALL_CENTS}, ${INSTALL_CENTS}, ${ACTOR})`;
const optionNo = (lead: Lead, letter: string) => formatOptionNo(lead.projectNo, letter)!;
/** The fixture as DC prints it with `po` in PO Reference and `client` as the Client (another client is a changed quote). */
const dealerCopy = (po: string, client = "Test") => {
  const html = FIXTURE.replace("<td>PSS-1042</td>", `<td>${po}</td>`).replace("<b>Client:</b></td><td>Test<", `<b>Client:</b></td><td>${client}<`);
  if (!html.includes(`<td>${po}</td>`) || !html.includes(`<td>${client}<`)) throw new Error(`setup: the fixture has no PO or Client cell for ${po}`);
  return html;
};
const importAs = (n: number, html: string) => importDealerCopy({ internetMessageId: message(n), receivedAt: new Date(), html });
const versionsOf = (leadId: string) => sql`
  select id, option, version, status, po_reference, client_total_cents, quote_file_id, contract_file_id, approved_at
  from dc_quote_versions where lead_id = ${leadId} order by option, version`;
const fileRow = async (id: unknown) =>
  (await sql`select name, doc_type, (shared_at is not null) as shared from job_files where id = ${id as string}`)[0];
const leadRow = async (id: string) => (await sql`select status, quote_cents, sold_cents from leads where id = ${id}`)[0];
const send = async (lead: Lead, letter: string) => {
  const review = await loadReview(lead.id, letter);
  if (!review) throw new Error(`setup: no review for option ${letter}`);
  return { review, answer: await sendQuote({ jobId: lead.id, versionId: review.version.id, fingerprint: review.fingerprint, actor: ACTOR }) };
};
/** Every migration file, in order, split exactly as scripts/migrate.mjs splits it. */
const reapplyMigrations = async () => {
  const dir = "db/migrations";
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const statements = readFileSync(join(dir, file), "utf8").replace(/^\s*--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) {
      try {
        await sql.query(statement);
      } catch (error) {
        throw new Error(`FAILED: re-applying ${file}: ${(error as Error).message}\n  ${statement.split("\n")[0]}`);
      }
    }
  }
};
const addedEvents = (leadId: string) => sql`select kind, body from job_events where lead_id = ${leadId} and body like 'Added quote option%'`;
const scriptLeads = async () => (await sql`select id from leads where name like ${`${NAME_PREFIX} %`}`).map((r) => r.id as string);

test("quote options: import, add, send two, approve one, sign, and switch against a real database", async () => {
  console.log("\nverify-quote-options: writing to a test branch\n");
  const priorRules = await sql`
    select collection, pct_of_msrp, updated_by, updated_at from markup_rules
    where lower(collection) = any(${COLLECTIONS.map((c) => c.toLowerCase())})`;
  const [priorSettings] = await sql`select terms_file_pathname, terms_updated_by, terms_updated_at from dc_settings where id`;
  if (!priorSettings) throw new Error("setup: dc_settings has no row — is migration 024 applied?");

  const J = await newLead("J");
  const K = await newLead("K");
  const S = await newLead("S");
  const extra: string[] = [];
  let nextMessage = 100;
  /** A job with option A and option B both sent (offered), B priced differently from A. */
  const twoOffered = async (suffix: string) => {
    const lead = await newLead(suffix);
    extra.push(lead.id);
    await installFor(lead.id);
    if ((await importAs(nextMessage++, dealerCopy(optionNo(lead, "A")))).outcome !== "imported") throw new Error(`setup: ${suffix}'s A did not import`);
    if (!same(await addQuoteOption(lead.id, ACTOR), { letter: "B" })) throw new Error(`setup: ${suffix} got no option B`);
    if ((await importAs(nextMessage++, dealerCopy(optionNo(lead, "B")))).outcome !== "imported") throw new Error(`setup: ${suffix}'s B did not import`);
    const [aDraft, bDraft] = (await versionsOf(lead.id)).map((r) => r.id as string);
    if (!(await setLineOverride(lead.id, bDraft, 1, 250, ACTOR))) throw new Error(`setup: ${suffix}'s B line not priced`);
    const a = await send(lead, "A");
    const b = await send(lead, "B");
    if (!("ok" in a.answer) || !("ok" in b.answer)) throw new Error(`setup: ${suffix}'s sends failed ${JSON.stringify([a.answer, b.answer])}`);
    const rows = await versionsOf(lead.id);
    if (!same(rows.map((r) => [r.option, r.status]), [["A", "offered"], ["B", "offered"]])) throw new Error(`setup: ${suffix} is not two offered ${JSON.stringify(rows)}`);
    return { lead, aId: aDraft, bId: bDraft, quoteA: rows[0].quote_file_id as string, quoteB: rows[1].quote_file_id as string,
      totalB: b.review.priced.clientTotalCents };
  };
  try {
    const termsPathname = `verify/terms-qo-${STAMP}.pdf`;
    blobs.set(termsPathname, Buffer.from("%PDF-1.4 verify terms"));
    await sql`update dc_settings set terms_file_pathname = ${termsPathname} where id`;
    for (const [collection, pct] of Object.entries(RULES)) await saveMarkupRule(collection, pct, ACTOR);
    await installFor(J.id);
    await installFor(S.id);

    console.log("step 1: import option A");
    const a1 = await importAs(1, dealerCopy(optionNo(J, "A")));
    check(a1.outcome === "imported" && a1.leadId === J.id && a1.version === 1, "option A imports as version 1", JSON.stringify(a1));
    let rows = await versionsOf(J.id);
    check(rows.length === 1 && rows[0].option === "A" && rows[0].po_reference === optionNo(J, "A"), "the version is option A, at J's own number", JSON.stringify(rows));

    console.log("step 2: the release gate");
    const early = await importAs(2, dealerCopy(optionNo(J, "B")));
    check(early.outcome === "no-match" && early.leadId === null && early.detail === optionNo(J, "B"),
      "PSS-…-B is no-match while J has no option B", JSON.stringify(early));
    const recorded = (await sql`select outcome, lead_id, detail from ingested_messages where message_id = ${message(2)}`)[0];
    check(recorded?.outcome === "no-match" && recorded.lead_id === null && recorded.detail === optionNo(J, "B"),
      "the message is recorded no-match with the PO it printed", JSON.stringify(recorded));
    const jFiles = (await sql`select count(*)::int as n from job_files where lead_id = ${J.id}`)[0].n;
    check((await versionsOf(J.id)).length === 1 && jFiles === 1, "nothing new on J: one version, one Dealer Copy", `files ${jFiles}`);

    console.log("step 3: Add another quote");
    check(same(await addQuoteOption(J.id, ACTOR), { letter: "B" }), "J gets option B", "");
    const stored = await sql`select letter, created_by from quote_options where lead_id = ${J.id}`;
    check(same(stored.map((r) => [r.letter, r.created_by]), [["B", ACTOR]]), "one quote_options row, B, by the owner", JSON.stringify(stored));
    const added = await sql`select kind, body from job_events where lead_id = ${J.id} and body like 'Added quote option%'`;
    check(same(added.map((e) => [e.kind, e.body]), [["quote", `Added quote option ${optionNo(J, "B")}`]]),
      "one 'quote' event names the new number", JSON.stringify(added));
    await sql`insert into quote_options (lead_id, letter, created_by) select ${K.id}, chr(c), ${ACTOR} from generate_series(66, 90) as c`;
    check(same(await addQuoteOption(K.id, ACTOR), { error: "This job already has options A to Z." }), "a job holding B to Z is refused past Z", "");
    check((await sql`select count(*)::int as n from quote_options where lead_id = ${K.id}`)[0].n === 25, "K still has 25 stored options", "");
    check((await addedEvents(K.id)).length === 0, "the refusal past Z logs no event", "");
    const lost = await newLead("L");
    extra.push(lost.id);
    await sql`update leads set status = 'lost' where id = ${lost.id}`;
    check(same(await addQuoteOption(lost.id, ACTOR), { error: "This job is marked Lost." }), "a Lost job is refused", "");
    const noPss = await newLead("N");
    extra.push(noPss.id);
    await sql`update leads set project_no = null where id = ${noPss.id}`;
    check(same(await addQuoteOption(noPss.id, ACTOR), { error: "This job has no PSS number yet." }), "a job with no PSS number is refused", "");
    check(same(await addQuoteOption(randomUUID(), ACTOR), { error: "This job no longer exists." }), "an unknown job is refused", "");
    const refusedRows = await sql`select count(*)::int as n from quote_options where lead_id = any(${[lost.id, noPss.id]})`;
    const refusedEvents = await sql`select count(*)::int as n from job_events where lead_id = any(${[lost.id, noPss.id]})`;
    check(refusedRows[0].n === 0 && refusedEvents[0].n === 0, "the Lost and no-number refusals store no option and log no event",
      `options ${refusedRows[0].n}, events ${refusedEvents[0].n}`);
    // A real double-click: two statements in flight at once. Whether they truly overlap is up to the network, so it
    // tries a few times. Either way, every stored option has exactly one event and no letter is given twice.
    const D = await newLead("D");
    extra.push(D.id);
    let raced = 0;
    for (let i = 0; i < 4; i++) {
      const pair = await Promise.all([addQuoteOption(D.id, ACTOR), addQuoteOption(D.id, ACTOR)]);
      const letters = pair.flatMap((r) => ("letter" in r ? [r.letter] : []));
      const errors = pair.flatMap((r) => ("error" in r ? [r.error] : []));
      check(letters.length >= 1 && new Set(letters).size === letters.length &&
          errors.every((e) => e === "Another quote option was just added. Reload and try again."),
        `double-click ${i + 1}: distinct letters, any loser told to reload`, JSON.stringify(pair));
      if (errors.length > 0) raced++;
    }
    const dRows = (await sql`select letter from quote_options where lead_id = ${D.id} order by letter`).map((r) => r.letter as string);
    const dEvents = (await addedEvents(D.id)).map((e) => e.body as string).sort();
    check(same(dEvents, dRows.map((l) => `Added quote option ${optionNo(D, l)}`)) && same(dRows, dRows.map((_, i) => String.fromCharCode(66 + i))),
      "every option stored by the double-clicks has exactly one event, letters from B with no gap", JSON.stringify({ dRows, dEvents }));
    console.log(`  ..  the double-clicks overlapped (one told to reload) ${raced} of 4 times`);

    console.log("step 4: import option B, and a change to option A");
    const b1 = await importAs(3, dealerCopy(optionNo(J, "B")));
    check(b1.outcome === "imported" && b1.leadId === J.id && b1.version === 1, "option B imports as version 1 once B exists", JSON.stringify(b1));
    const bEvent = await sql`select body from job_events where lead_id = ${J.id} and kind = 'quote' and body like ${`%arrived as ${optionNo(J, "B")} version 1`}`;
    check(bEvent.length === 1, "B's import event names PSS-…-B version 1", JSON.stringify(bEvent));
    const unchangedA = await importAs(4, dealerCopy(optionNo(J, "A")));
    check(unchangedA.outcome === "unchanged", "an unchanged A copy is unchanged (compared with option A only)", JSON.stringify(unchangedA));
    const a2 = await importAs(5, dealerCopy(optionNo(J, "A"), "Test Revised"));
    check(a2.outcome === "imported" && a2.version === 2, "a changed A copy is A version 2, numbered within A", JSON.stringify(a2));
    rows = await versionsOf(J.id);
    check(same(rows.map((r) => [r.option, r.version, r.status]), [["A", 1, "draft"], ["A", 2, "draft"], ["B", 1, "draft"]]),
      "A v1, A v2 and B v1, all drafts", JSON.stringify(rows));
    const [, a2Id, bId] = rows.map((r) => r.id as string);
    const dupe = await sql`
      insert into dc_quote_versions (id, lead_id, option, version, dc_quote_no, po_reference, source_file_id, source_sha256, status,
        dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents)
      select ${randomUUID()}, lead_id, 'B', 1, dc_quote_no, po_reference, source_file_id, ${"0".repeat(64)}, 'draft', 1, 0, 0, 1
      from dc_quote_versions where id = ${bId}`.then(() => "inserted", failure);
    check(dupe === "23505:dc_quote_versions_lead_option_version_key", "a second B version 1 violates the per-option unique key", dupe);

    console.log("step 5: send A and B");
    check(await setLineOverride(J.id, bId, 1, 250, ACTOR), "setup: B's line 1 is priced differently from A's", "refused");
    const sentA = await send(J, "A");
    check(same(sentA.answer, { ok: true, emailed: true }) && sentA.review.version.id === a2Id, "Send quote sends A version 2", JSON.stringify(sentA.answer));
    const sentB = await send(J, "B");
    check(same(sentB.answer, { ok: true, emailed: true }) && sentB.review.version.id === bId, "Send quote sends B version 1 while A is offered", JSON.stringify(sentB.answer));
    const totalA = sentA.review.priced.clientTotalCents;
    const totalB = sentB.review.priced.clientTotalCents;
    check(totalA !== null && totalB !== null && totalA !== totalB, "setup: A and B have different totals", `${totalA} ${totalB}`);
    rows = await versionsOf(J.id);
    check(same(rows.map((r) => [r.option, r.version, r.status, r.client_total_cents]),
      [["A", 1, "superseded", null], ["A", 2, "offered", totalA], ["B", 1, "offered", totalB]]),
      "A v1 superseded; A v2 and B v1 both offered at their own totals (the per-option one-offered rule)", JSON.stringify(rows));
    const quoteA = rows[1].quote_file_id;
    const quoteB = rows[2].quote_file_id;
    check(same(await fileRow(quoteA), { name: `Quote ${optionNo(J, "A")} v2.pdf`, doc_type: "quote", shared: true }) &&
        same(await fileRow(quoteB), { name: `Quote ${optionNo(J, "B")} v1.pdf`, doc_type: "quote", shared: true }),
      "each option's quote PDF is shared under its own number", JSON.stringify([await fileRow(quoteA), await fileRow(quoteB)]));
    check(same(hooks.printed, [`Quote ${optionNo(J, "A")} v2`, `Quote ${optionNo(J, "B")} v1`]), "each PDF is headed with its option's number", JSON.stringify(hooks.printed));
    check(same(await leadRow(J.id), { status: "quoted", quote_cents: totalB, sold_cents: null }), "J is Quoted at the last total sent, B's", JSON.stringify(await leadRow(J.id)));
    const second = await sql`
      insert into dc_quote_versions (id, lead_id, option, version, dc_quote_no, po_reference, source_file_id, source_sha256, status,
        dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents)
      select ${randomUUID()}, lead_id, 'B', 2, dc_quote_no, po_reference, source_file_id, ${"0".repeat(64)}, 'offered', 1, 0, 0, 1
      from dc_quote_versions where id = ${bId}`.then(() => "inserted", failure);
    check(second === "23P01:dc_quote_versions_one_offered", "a second offered B version still fails at commit", second);
    const offeredNow = await offeredVersions(J.id);
    check(same(offeredNow.map((v) => [v.option, v.id, v.clientTotalCents]), [["A", a2Id, totalA], ["B", bId, totalB]]),
      "offeredVersions lists A then B, with their totals", JSON.stringify(offeredNow));

    console.log("step 6: re-apply every migration with two options offered");
    await reapplyMigrations();
    console.log("  ok  every migration file re-applied in order");
    const constraints = await sql`
      select conname, pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'dc_quote_versions'::regclass
        and conname in ('dc_quote_versions_one_offered','dc_quote_versions_lead_option_version_key','dc_quote_versions_lead_id_version_key')`;
    const def = (name: string) => (constraints.find((c) => c.conname === name)?.def as string | undefined) ?? "";
    check(/\(lead_id WITH =, "?option"? WITH =\)/.test(def("dc_quote_versions_one_offered")) && def("dc_quote_versions_one_offered").includes("DEFERRABLE INITIALLY DEFERRED"),
      "the one-offered rule is still per option, and deferred", JSON.stringify(constraints));
    check(/UNIQUE \(lead_id, "?option"?, version\)/.test(def("dc_quote_versions_lead_option_version_key")) && def("dc_quote_versions_lead_id_version_key") === "",
      "versions are unique per (lead, option, version), and the per-job key is gone", JSON.stringify(constraints));
    check(same((await versionsOf(J.id)).map((r) => r.status), ["superseded", "offered", "offered"]), "the re-run changed no version", "");

    console.log("step 7: the client approves B");
    const approved = await approveDcQuote(J.id, bId, ACTOR);
    check(same(approved, { version: 1, option: "B", moved: true }), "approveDcQuote answers B version 1, and that J moved", JSON.stringify(approved));
    rows = await versionsOf(J.id);
    check(same(rows.map((r) => [r.option, r.version, r.status, r.approved_at !== null]),
      [["A", 1, "superseded", false], ["A", 2, "superseded", false], ["B", 1, "offered", true]]),
      "A's offered version is superseded in the same statement, and B is approved", JSON.stringify(rows));
    check((await fileRow(quoteA)).shared === false && (await fileRow(quoteB)).shared === true, "A's quote PDF is unshared, B's stays shared", "");
    check(same(await leadRow(J.id), { status: "approved", quote_cents: totalB, sold_cents: null }), "J is Approved at B's total", JSON.stringify(await leadRow(J.id)));
    const stages = await sql`select from_status, to_status, body from job_events where lead_id = ${J.id} and kind = 'stage' order by created_at`;
    check(same(stages.at(-1), { from_status: "quoted", to_status: "approved", body: `Approved ${optionNo(J, "B")} version 1` }),
      "the stage event names PSS-…-B version 1", JSON.stringify(stages));
    check((await approveDcQuote(J.id, a2Id, ACTOR)) === null, "approving the closed A answers null", "not null");
    const offeredAfter = await offeredVersions(J.id);
    check(offeredAfter.length === 1 && offeredAfter[0].id === bId && offeredAfter[0].approvedAt !== null, "only B is still offered, and approved", JSON.stringify(offeredAfter));

    console.log("step 8: B's contract and signature");
    check(same(await sendContract({ jobId: J.id, versionId: bId, actor: ACTOR }), { ok: true, emailed: true }), "sendContract sends B's contract", "");
    const bSent = (await versionsOf(J.id))[2];
    check(bSent.status === "sent" && bSent.contract_file_id !== null && bSent.client_total_cents === totalB, "B is sent at its total", JSON.stringify(bSent));
    check(same(await fileRow(bSent.contract_file_id), { name: `Contract ${optionNo(J, "B")} v1.pdf`, doc_type: "contract", shared: true }),
      "the contract is shared as Contract PSS-…-B v1.pdf", JSON.stringify(await fileRow(bSent.contract_file_id)));
    const contractFile = await getFile(bSent.contract_file_id as string);
    if (!contractFile) throw new Error("setup: B's contract file is gone");
    const signed = await recordSignature({ jobId: J.id, file: contractFile, name: "Jane Doe", email: ACTOR, ip: null, userAgent: null, adoption: { method: "typed", initials: null } });
    check(signed === "signed", "recordSignature answers signed", signed);
    check((await versionsOf(J.id))[2].status === "signed" && same(await leadRow(J.id), { status: "signed", quote_cents: totalB, sold_cents: totalB }),
      "B is signed, and J is Signed with sold_cents = B's total", JSON.stringify(await leadRow(J.id)));

    console.log("step 9: once B is signed, A cannot be sent and no option can be added");
    const a3 = await importAs(6, dealerCopy(optionNo(J, "A"), "Test Third"));
    check(a3.outcome === "imported" && a3.version === 3, "a changed A still imports, as A version 3", JSON.stringify(a3));
    const blocked = await loadReview(J.id, "A");
    check(blocked !== null && blocked.blockers.includes(signedElsewhere("B")), "A's review is blocked: Option B is signed", JSON.stringify(blocked?.blockers));
    const quotesBefore = (await sql`select count(*)::int as n from job_files where lead_id = ${J.id} and doc_type = 'quote'`)[0].n;
    const refused = await sendQuote({ jobId: J.id, versionId: blocked!.version.id, fingerprint: blocked!.fingerprint, actor: ACTOR });
    check(same(refused, { error: signedElsewhere("B") }), "Send quote on A is refused", JSON.stringify(refused));
    const quotesAfter = (await sql`select count(*)::int as n from job_files where lead_id = ${J.id} and doc_type = 'quote'`)[0].n;
    check((await versionsOf(J.id)).find((r) => r.option === "A" && r.version === 3)?.status === "draft" && quotesAfter === quotesBefore,
      "A v3 is still a draft and no quote file was made", `quote files ${quotesBefore} -> ${quotesAfter}`);
    check(same(await addQuoteOption(J.id, ACTOR), { error: OPTION_SIGNED }), "Add another quote is refused on a signed job", "");
    check((await addedEvents(J.id)).length === 1 && (await sql`select count(*)::int as n from quote_options where lead_id = ${J.id}`)[0].n === 1,
      "the signed refusal stores no option and logs no event", "");

    console.log("step 10: switching after approval");
    check((await importAs(7, dealerCopy(optionNo(S, "A")))).outcome === "imported", "setup: S's option A imports", "");
    check(same(await addQuoteOption(S.id, ACTOR), { letter: "B" }), "setup: S gets option B", "");
    const sB = dealerCopy(optionNo(S, "B"));
    check((await importAs(8, sB)).outcome === "imported", "setup: S's option B imports", "");
    const sA = await send(S, "A");
    check(same(sA.answer, { ok: true, emailed: true }), "setup: S's A is sent", JSON.stringify(sA.answer));
    const sAId = sA.review.version.id;
    check(same(await approveDcQuote(S.id, sAId, ACTOR), { version: 1, option: "A", moved: true }), "the client approves A", "");
    let sRows = await versionsOf(S.id);
    check(same(sRows.map((r) => [r.option, r.version, r.status]), [["A", 1, "offered"], ["B", 1, "superseded"]]),
      "approving A closed B's draft in the same statement", JSON.stringify(sRows));
    const sStages = await sql`select from_status, to_status, body from job_events where lead_id = ${S.id} and kind = 'stage' order by created_at`;
    check(same(sStages.at(-1), { from_status: "quoted", to_status: "approved", body: "Approved quote version 1" }),
      "option A's approval keeps the wording 'Approved quote version 1'", JSON.stringify(sStages));
    check(same(await sendContract({ jobId: S.id, versionId: sAId, actor: ACTOR }), { ok: true, emailed: true }), "A's contract is sent", "");
    const sARow = (await versionsOf(S.id))[0];
    check(sARow.status === "sent" && sARow.approved_at !== null && (await fileRow(sARow.contract_file_id)).shared === true,
      "setup: S's A is approved and SENT, its contract shared", JSON.stringify(sARow));
    const resent = await importAs(9, sB);
    check(resent.outcome === "imported" && resent.version === 2,
      "B's unchanged Dealer Copy, re-sent, comes back as B version 2 (its newest had been closed)", JSON.stringify(resent));
    const sBsend = await send(S, "B");
    check(same(sBsend.answer, { ok: true, emailed: true }), "Send quote sends B version 2", JSON.stringify(sBsend.answer));
    sRows = await versionsOf(S.id);
    check(same(sRows.map((r) => [r.option, r.version, r.status]), [["A", 1, "superseded"], ["B", 1, "superseded"], ["B", 2, "offered"]]),
      "sending B closed the approved A (contract sent, unsigned)", JSON.stringify(sRows));
    check((await fileRow(sARow.quote_file_id)).shared === false && (await fileRow(sARow.contract_file_id)).shared === false,
      "A's quote and unsigned contract are unshared", "");
    check(same(await leadRow(S.id), { status: "quoted", quote_cents: sBsend.review.priced.clientTotalCents, sold_cents: null }),
      "S is back to Quoted at B's total", JSON.stringify(await leadRow(S.id)));
    check(same((await offeredVersions(S.id)).map((v) => v.id), [sRows[2].id]), "only B version 2 is offered", "");

    console.log("step 10b: a contract for B while A is signed (the review's refusal, and the statement's own guard)");
    const R = await twoOffered("R");
    await sql`update dc_quote_versions set approved_at = now(), approved_by = ${ACTOR} where id = ${R.bId}`;
    const contractsOf = async (leadId: string) => (await sql`select count(*)::int as n from job_files where lead_id = ${leadId} and doc_type = 'contract'`)[0].n;
    // A signature on A lands after sendContract's review, before its freeze: only the frozen CTE can stop it.
    hooks.duringContract = async () => { await sql`update dc_quote_versions set status = 'signed' where id = ${R.aId}`; };
    let raceAnswer: unknown;
    try {
      raceAnswer = await sendContract({ jobId: R.lead.id, versionId: R.bId, actor: ACTOR });
    } finally {
      hooks.duringContract = null;
    }
    check(same(raceAnswer, { error: "This quote changed while you were sending. Reload and try again." }),
      "A signed mid-send: the freeze matches nothing and answers the race", JSON.stringify(raceAnswer));
    let rRows = await versionsOf(R.lead.id);
    check(same(rRows.map((r) => [r.option, r.status, r.contract_file_id]), [["A", "signed", null], ["B", "offered", null]]) && (await contractsOf(R.lead.id)) === 0,
      "B is still offered with no contract, and the unsent contract file is gone", JSON.stringify(rRows));
    const signedA = await sendContract({ jobId: R.lead.id, versionId: R.bId, actor: ACTOR });
    check(same(signedA, { error: signedElsewhere("A") }), "with A signed, B's contract is refused: Option A is signed", JSON.stringify(signedA));
    rRows = await versionsOf(R.lead.id);
    check(rRows[1].status === "offered" && (await contractsOf(R.lead.id)) === 0 &&
        (await sql`select count(*)::int as n from job_events where lead_id = ${R.lead.id} and body like 'Sent Contract%'`)[0].n === 0,
      "nothing written: B offered, no contract file, no contract event", JSON.stringify(rRows));

    console.log("step 10c: approving B closes A but never unshares a quote tied to a signature");
    const U = await twoOffered("U");
    await sql`insert into contract_signatures (id, lead_id, file_id, signed_name, signed_email, doc_sha256)
              values (${randomUUID()}, ${U.lead.id}, ${U.quoteA}, 'Verify', ${ACTOR}, ${"0".repeat(64)})`;
    check(same(await approveDcQuote(U.lead.id, U.bId, ACTOR), { version: 1, option: "B", moved: true }), "the client approves U's B", "");
    const uRows = await versionsOf(U.lead.id);
    check(same(uRows.map((r) => [r.option, r.status]), [["A", "superseded"], ["B", "offered"]]), "U's A is superseded", JSON.stringify(uRows));
    check((await fileRow(U.quoteA)).shared === true && (await fileRow(U.quoteB)).shared === true,
      "A's signature-tied quote stays shared (the unshare skips it), B's stays shared", JSON.stringify([await fileRow(U.quoteA), await fileRow(U.quoteB)]));
    check(same(await leadRow(U.lead.id), { status: "approved", quote_cents: U.totalB, sold_cents: null }), "U is Approved at B's total", JSON.stringify(await leadRow(U.lead.id)));

    console.log("step 10d: a change order on the signed option (J's B version 2)");
    const b2 = await importAs(nextMessage++, dealerCopy(optionNo(J, "B"), "Test Change"));
    check(b2.outcome === "imported" && b2.version === 2, "a changed B imports as B version 2 on the signed job", JSON.stringify(b2));
    const sentB2 = await send(J, "B");
    check(same(sentB2.answer, { ok: true, emailed: true }), "Send quote sends B version 2 (same option as the signature)", JSON.stringify(sentB2.answer));
    const b2Id = sentB2.review.version.id;
    const totalB2 = sentB2.review.priced.clientTotalCents;
    check(same(await approveDcQuote(J.id, b2Id, ACTOR), { version: 2, option: "B", moved: false }), "approving it past Quoted answers moved: false", "");
    check(same(await leadRow(J.id), { status: "signed", quote_cents: totalB2, sold_cents: totalB }), "J stays Signed, quote_cents = B v2's total, sold_cents unchanged",
      JSON.stringify(await leadRow(J.id)));
    const changeEvent = await sql`select kind, body from job_events where lead_id = ${J.id} and body like ${`Approved ${optionNo(J, "B")} version 2%`}`;
    check(same(changeEvent.map((e) => [e.kind, e.body]), [["quote", `Approved ${optionNo(J, "B")} version 2 from their project page`]]),
      "a 'quote' event (not a stage move) names PSS-…-B version 2 from their project page", JSON.stringify(changeEvent));
    check(same(await sendContract({ jobId: J.id, versionId: b2Id, actor: ACTOR }), { ok: true, emailed: true }),
      "sendContract sends B v2's contract while B v1 is signed (same option)", "");
    const jB2 = (await versionsOf(J.id)).find((r) => r.option === "B" && r.version === 2)!;
    check(jB2.status === "sent" && same(await fileRow(jB2.contract_file_id), { name: `Contract ${optionNo(J, "B")} v2.pdf`, doc_type: "contract", shared: true }),
      "B v2 is sent, its contract shared as Contract PSS-…-B v2.pdf", JSON.stringify(jB2));

    console.log("step 10e: approving A and B at the same moment (a real deadlock, if the timing allows)");
    let deadlocks = 0;
    for (let i = 0; i < 3 && deadlocks === 0; i++) {
      const V = await twoOffered(`V${i}`);
      const outcome = await Promise.all([V.aId, V.bId].map((id) => approveDcQuote(V.lead.id, id, ACTOR).then(
        (answer) => ({ answer, code: null as string | null }),
        (error: { code?: string; message?: string }) => ({ answer: null, code: error?.code ?? `no code: ${error?.message}` }),
      )));
      const won = outcome.filter((o) => o.answer !== null);
      check(won.length === 1 && outcome.every((o) => o.answer !== null || o.code === null || o.code === "40P01"),
        `pair ${i + 1}: exactly one approval wins, the other answers null or fails with 40P01`, JSON.stringify(outcome));
      const vRows = await versionsOf(V.lead.id);
      const winner = won[0].answer!.option;
      check(same(vRows.map((r) => [r.option, r.status, r.approved_at !== null]),
        [["A", winner === "A" ? "offered" : "superseded", winner === "A"], ["B", winner === "B" ? "offered" : "superseded", winner === "B"]]),
        `pair ${i + 1}: the winner is approved and offered, the loser superseded and unapproved`, JSON.stringify(vRows));
      if (outcome.some((o) => o.code === "40P01")) deadlocks++;
    }
    console.log(deadlocks > 0 ? "  ..  a real deadlock was forced: the error's .code is '40P01'" : "  ..  no deadlock in 3 tries: the approvals serialised, the loser answered null");

    console.log("\nPASSED: quote options hold against a real database. Manual run, not coverage.\n");
  } finally {
    const attempt = async (label: string, work: () => Promise<unknown>) => {
      try {
        await work();
      } catch (error) {
        console.error(`step 11: cleanup could not ${label}:`, (error as Error).message);
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
    let leads = [J.id, K.id, S.id, ...extra];
    await attempt("find leftover leads", async () => { leads = [...new Set([...leads, ...(await scriptLeads())])]; });
    await attempt("delete signatures", () => sql`delete from contract_signatures where lead_id = any(${leads})`);
    await attempt("delete versions", () => sql`delete from dc_quote_versions where lead_id = any(${leads})`);
    await attempt("delete messages", () => sql`delete from ingested_messages where lead_id = any(${leads}) or message_id like ${"<verify-qo-%"}`);
    await attempt("delete events", () => sql`delete from job_events where lead_id = any(${leads})`);
    await attempt("delete files", () => sql`delete from job_files where lead_id = any(${leads})`);
    await attempt("delete leads", () => sql`delete from leads where id = any(${leads})`);
    await attempt("report what is left", async () => {
      const residue = await sql`select count(*)::int as n from leads where name like ${`${NAME_PREFIX} %`}`;
      const options = await sql`select count(*)::int as n from quote_options where lead_id = any(${leads})`;
      console.log(`step 11: cleanup, ${residue[0].n} leads and ${options[0].n} quote options left`);
    });
  }
});
