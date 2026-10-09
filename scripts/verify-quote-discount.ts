/**
 * Behavioural proof of the quote discount SQL (migration 042, setVersionDiscount in lib/dc/store.ts, and the
 * discount in sendQuote's frozen statement in lib/dc/send.ts) against a real Postgres.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand, it is in no suite, and CI does not execute it. The unit
 * tests mock db(): they prove text only. The mocks here are @vercel/blob (in memory), the PDF builders (which
 * record what they were asked to print) and the client emails. None of them touches the database.
 *
 * What it does, against a throwaway database already migrated with 042:
 *   1. the discount check refuses both kinds at once, 0% and 100%, a zero amount, a label with no amount, an
 *      amount with no label and a blank label (23514), on a real draft.
 *   2. setVersionDiscount: 10% "Holiday special" is stored trimmed with one 'quote' event; on a version that
 *      is not a draft it changes nothing and logs nothing; null clears all three.
 *   3. send with 10% off: offered, discount_cents and client_total_cents as the review priced them, quote_cents
 *      the discounted total, the quote PDF given the discount, and the review of the sent version unchanged.
 *   4. approve, then the contract: quote_cents stays the discounted total and the contract is given the discount.
 *   5. a dollar discount ($200) sends with discount_cents 20000.
 *   6. the race: the label changes after Send read it (inside the PDF build). The frozen statement matches
 *      nothing, the version stays a draft, nothing is frozen and the quote file is removed.
 *   7. deletes everything it wrote and restores the markup rules and dc_settings, even on failure.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. It takes its connection from E2E_POSTGRES_URL alone and refuses
 * production (cold-term). Usage (bash):
 *   E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" npx vitest run --config scripts/verify-quote-discount.config.mts --disableConsoleIntercept
 *
 * To watch it fail: delete `and discount_label is not distinct from …` from sendQuote's offered CTE. Step 6 goes
 * red: the stale label is frozen. Put it back.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test, vi } from "vitest";

const blobs = vi.hoisted(() => new Map<string, Buffer>());
const hooks = vi.hoisted(() => ({
  quotes: [] as unknown[],
  contracts: [] as unknown[],
  /** Runs inside the quote PDF build: after sendQuote's review, before its freeze. */
  duringQuote: null as null | (() => Promise<void>),
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
  renderContractPdf: async (input: unknown) => {
    hooks.contracts.push(input);
    return { bytes: new Uint8Array(Buffer.from("%PDF-1.4 verify contract")), marks: { initials: [], signature: { page: 0, x: 154, y: 300 } } };
  },
}));
vi.mock("../lib/dc/quote-pdf", () => ({
  buildQuotePdf: async (input: unknown) => {
    hooks.quotes.push(input);
    if (hooks.duringQuote) await hooks.duringQuote();
    return new Uint8Array(Buffer.from("%PDF-1.4 verify quote"));
  },
}));
vi.mock("../lib/dc/send-quote-email", () => ({ sendQuoteEmail: async () => undefined }));
vi.mock("../lib/dc/send-contract-email", () => ({ sendContractEmail: async () => undefined }));
vi.mock("../lib/dc/notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/dc/notify")>()),
  notifyOwners: async () => undefined,
}));

import { approveDcQuote } from "../lib/dc/approve";
import { importDealerCopy } from "../lib/dc/import";
import { loadReview, sendQuote } from "../lib/dc/send";
import { saveMarkupRule, setVersionDiscount } from "../lib/dc/store";
import { formatOptionNo } from "../lib/portal/project-no";

const BANNER = "\n================ verify-quote-discount REFUSED TO RUN ================\n";
function refuse(reason: string): never {
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-quote-discount refused to run: ${reason}`);
}
const url = process.env.E2E_POSTGRES_URL;
if (!url) refuse("E2E_POSTGRES_URL is not set. It never falls back to POSTGRES_URL, DATABASE_URL or .env.local.");
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return refuse("E2E_POSTGRES_URL is not a valid URL, so its host cannot be checked.");
  }
})();
if (url.includes("cold-term")) refuse(`E2E_POSTGRES_URL points at ${host.split(".")[0]}, the production endpoint. Cut a Neon branch instead.`);
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
delete process.env.RESEND_API_KEY;

const sql = neon(url);
const ACTOR = "verify-quote-discount@example.com";
const STAMP = Date.now();
const NAME_PREFIX = "VERIFY Quote Discount";
const FIXTURE = readFileSync("tests/fixtures/dc/dealer-copy-4-lines.html", "utf8");
const COLLECTIONS = ["Duette", "Silhouette", "Palm Beach Shutters", "Motorization"];
const RULES: Record<string, number> = { Duette: 200, Silhouette: 185.5, "Palm Beach Shutters": 150, Motorization: 120 };

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Lead = { id: string; projectNo: number };
let nextMessage = 1;
const newLead = async (suffix: string): Promise<{ lead: Lead; draft: string }> => {
  const rows = await sql`
    insert into leads (name, phone, email, city, source, status)
    values (${`${NAME_PREFIX} ${STAMP} ${suffix}`}, '7025550197', ${`verify-qd-${STAMP}-${suffix}@example.com`}, 'Henderson', 'phone', 'visit_booked')
    returning id, project_no`;
  const lead = { id: rows[0].id as string, projectNo: Number(rows[0].project_no) };
  await sql`
    insert into install_quotes (id, lead_id, kind, minimum_cents, subtotal_cents, total_cents, created_by)
    values (${randomUUID()}, ${lead.id}, 'final', 0, 25000, 25000, ${ACTOR})`;
  const po = formatOptionNo(lead.projectNo, "A")!;
  const html = FIXTURE.replace("<td>PSS-1042</td>", `<td>${po}</td>`);
  const imported = await importDealerCopy({ internetMessageId: `<verify-qd-${STAMP}-${nextMessage++}@example.com>`, receivedAt: new Date(), html });
  if (imported.outcome !== "imported") throw new Error(`setup: ${suffix} did not import (${imported.outcome})`);
  const [v] = await sql`select id from dc_quote_versions where lead_id = ${lead.id}`;
  return { lead, draft: v.id as string };
};
const versionRow = async (id: string) => (await sql`
  select status, discount_pct, discount_amount_cents, discount_label, discount_cents, client_total_cents, products_cents, quote_file_id
  from dc_quote_versions where id = ${id}`)[0];
const quoteEvents = async (leadId: string) =>
  (await sql`select body from job_events where lead_id = ${leadId} and kind = 'quote' order by created_at`).map((r) => r.body as string);
const scriptLeads = async () => (await sql`select id from leads where name like ${`${NAME_PREFIX} %`}`).map((r) => r.id as string);

test("the quote discount's SQL holds against a real database", async () => {
  const priorRules = await sql`
    select collection, pct_of_msrp, updated_by, updated_at from markup_rules
    where lower(collection) = any(${COLLECTIONS.map((c) => c.toLowerCase())})`;
  const [priorSettings] = await sql`select terms_file_pathname, terms_updated_by, terms_updated_at from dc_settings where id`;
  try {
    const termsPathname = `verify/terms-qd-${STAMP}.pdf`;
    blobs.set(termsPathname, Buffer.from("%PDF-1.4 verify terms"));
    await sql`update dc_settings set terms_file_pathname = ${termsPathname} where id`;
    for (const [collection, pct] of Object.entries(RULES)) await saveMarkupRule(collection, pct, ACTOR);

    console.log("step 1: the discount check");
    const { lead: L, draft: vL } = await newLead("L");
    const refused = async (label: string, work: () => Promise<unknown>) => {
      try {
        await work();
        check(false, `${label} is refused`, "it was accepted");
      } catch (error) {
        const e = error as { code?: string; constraint?: string };
        check(e.code === "23514" && e.constraint === "dc_quote_versions_discount_check", `${label} is refused (23514)`, `${e.code}:${e.constraint}`);
      }
    };
    await refused("a percent and an amount together", () => sql`update dc_quote_versions set discount_pct = 10, discount_amount_cents = 100, discount_label = 'x' where id = ${vL}`);
    await refused("0%", () => sql`update dc_quote_versions set discount_pct = 0, discount_label = 'x' where id = ${vL}`);
    await refused("100%", () => sql`update dc_quote_versions set discount_pct = 100, discount_label = 'x' where id = ${vL}`);
    await refused("a zero amount", () => sql`update dc_quote_versions set discount_amount_cents = 0, discount_label = 'x' where id = ${vL}`);
    await refused("a label with no amount", () => sql`update dc_quote_versions set discount_label = 'x' where id = ${vL}`);
    await refused("an amount with no label", () => sql`update dc_quote_versions set discount_pct = 10 where id = ${vL}`);
    await refused("a blank label", () => sql`update dc_quote_versions set discount_pct = 10, discount_label = '   ' where id = ${vL}`);

    console.log("step 2: setVersionDiscount");
    check(await setVersionDiscount(L.id, vL, null, ACTOR), "null on a draft with none still answers true", "false");
    check(await setVersionDiscount(L.id, vL, { pct: 12.5, amountCents: null, label: "  Trial  " }, ACTOR), "12.5% is set", "false");
    check(same(Object.values(await versionRow(vL)).slice(1, 4), ["12.50", null, "Trial"]), "stored as 12.50, no amount, the label trimmed",
      JSON.stringify(await versionRow(vL)));
    check(await setVersionDiscount(L.id, vL, null, ACTOR), "null clears it", "false");
    check(same(Object.values(await versionRow(vL)).slice(1, 4), [null, null, null]), "all three cleared", JSON.stringify(await versionRow(vL)));
    check(await setVersionDiscount(L.id, vL, { pct: 10, amountCents: null, label: "Holiday special" }, ACTOR), "10% Holiday special is set", "false");
    const events = await quoteEvents(L.id);
    check(same(events.slice(-4), ["Discount removed", "Discount: Trial, 12.5% off", "Discount removed", "Discount: Holiday special, 10% off"]),
      "each change logged one 'quote' event", JSON.stringify(events));
    check(!(await setVersionDiscount(randomUUID(), vL, null, ACTOR)), "another job's id changes nothing", "true");

    console.log("step 3: send with 10% off");
    const review = (await loadReview(L.id))!;
    const { priced } = review;
    check(priced.discountCents === Math.round(priced.productsCents! * 0.1) && priced.discountCents > 0,
      "the review takes 10% off the products", JSON.stringify([priced.productsCents, priced.discountCents]));
    const sent = await sendQuote({ jobId: L.id, versionId: vL, fingerprint: review.fingerprint, actor: ACTOR });
    check("ok" in sent, "Send quote succeeds", JSON.stringify(sent));
    const row = await versionRow(vL);
    check(row.status === "offered" && row.discount_cents === priced.discountCents && row.client_total_cents === priced.clientTotalCents
      && row.products_cents === priced.productsCents && row.client_total_cents === row.products_cents - row.discount_cents + priced.oversizedCents,
      "offered with discount_cents and the client total after it, as the review priced them", JSON.stringify(row));
    const [lead] = await sql`select status, quote_cents from leads where id = ${L.id}`;
    check(lead.status === "quoted" && lead.quote_cents === priced.clientTotalCents, "the job is Quoted at the discounted total", JSON.stringify(lead));
    check(same((hooks.quotes.at(-1) as { discount: unknown; clientTotalCents: number }).discount,
      { label: "Holiday special", pct: 10, cents: priced.discountCents }), "the quote PDF was given the discount", JSON.stringify(hooks.quotes.at(-1)));
    check(!(await setVersionDiscount(L.id, vL, null, ACTOR)), "the discount of a sent version can't be changed", "true");
    check((await versionRow(vL)).discount_label === "Holiday special", "and is still there", "");
    const frozen = (await loadReview(L.id))!.priced;
    check(frozen.discountCents === priced.discountCents && frozen.clientTotalCents === priced.clientTotalCents && frozen.discountLabel === "Holiday special",
      "the sent version reviews with the discount it was sent with", JSON.stringify(frozen));

    console.log("step 4: approve and the contract");
    const approved = await approveDcQuote(L.id, vL, ACTOR);
    check(approved !== null, "the client's approval is recorded", "null");
    const [after] = await sql`select status, quote_cents from leads where id = ${L.id}`;
    check(after.quote_cents === priced.clientTotalCents, "quote_cents is the discounted total after approval", JSON.stringify(after));
    const { sendContract } = await import("../lib/dc/send");
    const contract = await sendContract({ jobId: L.id, versionId: vL, actor: ACTOR });
    check("ok" in contract, "the contract is sent", JSON.stringify(contract));
    check(same((hooks.contracts.at(-1) as { discount: unknown }).discount, { label: "Holiday special", pct: 10, cents: priced.discountCents })
      && (hooks.contracts.at(-1) as { clientTotalCents: number }).clientTotalCents === priced.clientTotalCents,
      "the contract was given the same discount and total", JSON.stringify(hooks.contracts.at(-1)));

    console.log("step 5: a dollar discount");
    const { lead: D, draft: vD } = await newLead("D");
    check(await setVersionDiscount(D.id, vD, { pct: null, amountCents: 20000, label: "Thank you" }, ACTOR), "$200 is set", "false");
    const reviewD = (await loadReview(D.id))!;
    check("ok" in (await sendQuote({ jobId: D.id, versionId: vD, fingerprint: reviewD.fingerprint, actor: ACTOR })), "Send quote succeeds", "");
    const rowD = await versionRow(vD);
    check(rowD.discount_cents === 20000 && rowD.client_total_cents === reviewD.priced.clientTotalCents && rowD.discount_amount_cents === 20000,
      "frozen with discount_cents 20000", JSON.stringify(rowD));

    console.log("step 6: the label changes after Send read it");
    const { lead: R, draft: vR } = await newLead("R");
    await setVersionDiscount(R.id, vR, { pct: 10, amountCents: null, label: "Holiday special" }, ACTOR);
    const reviewR = (await loadReview(R.id))!;
    hooks.duringQuote = async () => {
      await sql`update dc_quote_versions set discount_label = 'Changed meanwhile' where id = ${vR}`;
    };
    const raced = await sendQuote({ jobId: R.id, versionId: vR, fingerprint: reviewR.fingerprint, actor: ACTOR });
    hooks.duringQuote = null;
    check("error" in raced, "Send quote answers the race", JSON.stringify(raced));
    const rowR = await versionRow(vR);
    check(rowR.status === "draft" && rowR.discount_cents === null && rowR.client_total_cents === null && rowR.quote_file_id === null,
      "the version is still a draft with nothing frozen", JSON.stringify(rowR));
    const files = await sql`select count(*)::int as n from job_files where lead_id = ${R.id} and doc_type = 'quote'`;
    check(files[0].n === 0, "the unsent quote file was removed", JSON.stringify(files));

    console.log("\nPASSED: the quote discount holds against a real database. Manual run, not coverage.\n");
  } finally {
    const attempt = async (label: string, work: () => Promise<unknown>) => {
      try {
        await work();
      } catch (error) {
        console.error(`step 7: cleanup could not ${label}:`, (error as Error).message);
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
    let leads: string[] = [];
    await attempt("find the leads", async () => { leads = await scriptLeads(); });
    await attempt("delete signatures", () => sql`delete from contract_signatures where lead_id = any(${leads})`);
    await attempt("delete versions", () => sql`delete from dc_quote_versions where lead_id = any(${leads})`);
    await attempt("delete messages", () => sql`delete from ingested_messages where lead_id = any(${leads}) or message_id like ${"<verify-qd-%"}`);
    await attempt("delete events", () => sql`delete from job_events where lead_id = any(${leads})`);
    await attempt("delete files", () => sql`delete from job_files where lead_id = any(${leads})`);
    await attempt("delete leads", () => sql`delete from leads where id = any(${leads})`);
    await attempt("report what is left", async () => {
      const residue = await sql`select count(*)::int as n from leads where name like ${`${NAME_PREFIX} %`}`;
      console.log(`step 7: cleanup, ${residue[0].n} leads left`);
    });
  }
});
