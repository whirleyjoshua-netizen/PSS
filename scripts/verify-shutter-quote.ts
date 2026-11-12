/**
 * Behavioural proof of Make this a quote: lib/admin/shutter-quote.ts and migrations 050 and 051.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand and CI does not run it. If you change
 * lib/admin/shutter-quote.ts, insertShutterVersion's SQL or migration 051, run it yourself, or say the SQL is unverified.
 *
 * Against a throwaway database it:
 *   1. applies migrations 048 to 051 twice (re-runnable);
 *   2. saves made-up rates and makes a quote on a job: one draft version on Option A, sourced 'shutter_guide',
 *      no handling, install in the prices, every line at 100%, a cost sheet filed as a dealer copy, one event;
 *   3. prices that version the way review, Send and the contract do (loadReview) and gets exactly the guide's total;
 *   4. a second quote on the same job is version 2 of the same option;
 *   5. a job whose Option A is a Direct Connect quote gets the shutter quote as a new Option B;
 *   6. refuses a total that no longer matches, a Lost job and a job with a signed quote, writing nothing;
 *   7. keeps guide lines out of the markup rules' collection list, and the database refuses an unknown source.
 * Made-up numbers only: this repo is public. The cost sheet's blob upload is replaced by a plain job_files row.
 *
 * IT WRITES JOBS AND RATES. It takes E2E_POSTGRES_URL alone and refuses production (ep-cold-term).
 *
 * Usage: E2E_POSTGRES_URL='<neon test branch url>' npx vitest run --config scripts/verify-shutter-quote.config.mts --disableConsoleIntercept
 *
 * To watch it fail: drop `pct_override` from insertShutterVersion's line insert (step 3 prices from a missing
 * markup), or drop the shutter_guide check in pickOption (step 4 makes a new option instead of version 2).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { test, vi } from "vitest";

function refuse(reason: string): never {
  console.error(`\n================ verify-shutter-quote REFUSED TO RUN ================\n${reason}\n`);
  throw new Error(`verify-shutter-quote refused to run: ${reason}`);
}
const url = process.env.E2E_POSTGRES_URL;
if (!url) refuse("E2E_POSTGRES_URL is not set. This script WRITES jobs and rates: give it a Neon test branch, never production.");
const host = (() => { try { return new URL(url).host; } catch { return refuse("E2E_POSTGRES_URL is not a valid URL."); } })();
if (host.includes("ep-cold-term")) refuse("E2E_POSTGRES_URL points at production (ep-cold-term).");
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
const sql = neon(url);

// The cost sheet would go to blob storage: file it as a plain row instead.
vi.mock("@/lib/admin/files", () => ({
  createFile: async (input: { leadId: string; name: string; contentType: string; body: Blob; actor: string; docType?: string }) => {
    const id = randomUUID();
    await sql`insert into job_files (id, lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname, doc_type)
      values (${id}, ${input.leadId}, ${input.actor}, 'document', ${input.name}, ${input.contentType}, ${input.body.size}, ${`verify/${id}`}, ${input.docType ?? null})`;
    return { id };
  },
  deleteFile: async (id: string) => { await sql`delete from job_files where id = ${id}`; return true; },
}));

const { saveShutterRates, getShutterRates } = await import("../lib/admin/shutter-rates");
const { guideInstallRate, priceQuote } = await import("../lib/admin/shutter-pricing");
const { makeShutterQuote, RATES_CHANGED } = await import("../lib/admin/shutter-quote");
const { loadReview } = await import("../lib/dc/send");
const { listSeenCollections, listVersions, OPTION_SIGNED } = await import("../lib/dc/store");
type QuoteInput = import("../lib/admin/shutter-pricing").QuoteInput;

function check(condition: boolean, description: string, detail = ""): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
async function throws(run: () => Promise<unknown>): Promise<boolean> {
  try { await run(); return false; } catch { return true; }
}
async function apply() {
  for (const file of ["048_shutter_pricing.sql", "049_shutter_install_rate.sql", "050_shutter_client_rate.sql", "051_shutter_quotes.sql", "052_shutter_frame_allowance.sql"]) {
    const statements = readFileSync(`db/migrations/${file}`, "utf8")
      .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
      .split(";").map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) await sql.query(statement);
  }
}
const ACTOR = "verify@example.com";
async function newJob(name: string, status = "quoted"): Promise<string> {
  const id = randomUUID();
  const [src] = await sql`select source from leads limit 1`;
  await sql`insert into leads (id, name, phone, city, source, status) values (${id}, ${name}, '7025550100', 'Las Vegas', ${src?.source ?? "website"}, ${status})`;
  return id;
}
const counts = async (leadId: string) => (await sql`
  select (select count(*)::int from dc_quote_versions where lead_id = ${leadId}) as versions,
         (select count(*)::int from job_files where lead_id = ${leadId}) as files`)[0];

test("Make this a quote against a real database", async () => {
  console.log(`\nverify-shutter-quote: writing to ${host}\n`);
  await apply();
  await apply();
  const sourceCol = await sql`select column_default from information_schema.columns where table_name = 'dc_quote_versions' and column_name = 'source'`;
  check(sourceCol.length === 1, "051 applies twice and adds dc_quote_versions.source");

  await saveShutterRates({
    lines: [
      { supplier: "norman", name: "Alpha", costCentsPerSqft: 1000, minSqft: 8, clientCentsPerSqft: 2500, frameAddEighths: 0 },
      { supplier: "norman", name: "Beta", costCentsPerSqft: 1200, minSqft: 8, clientCentsPerSqft: null, frameAddEighths: 0 },
    ],
    options: [{ supplier: "norman", name: "Angle top", kind: "per_window", amount: 20_000 }],
    freight: [
      { supplier: "norman", firstCents: 7500, additionalCents: 2500, oversizeWidthEighths: 0, oversizeFirstCents: 0, oversizeAdditionalCents: 0, perSqftCents: 0, minSqft: 0 },
      { supplier: "onyx", firstCents: 0, additionalCents: 0, oversizeWidthEighths: 0, oversizeFirstCents: 0, oversizeAdditionalCents: 0, perSqftCents: 0, minSqft: 0 },
    ],
    markupHundredths: 190,
    installCentsPerSqft: 600,
  }, ACTOR);
  const rates = await getShutterRates();
  const alpha = rates.lines.find((l) => l.name === "Alpha")!.id;
  const beta = rates.lines.find((l) => l.name === "Beta")!.id;
  const shape = rates.options[0].id;
  const input: QuoteInput = {
    supplier: "norman",
    windows: [
      { room: "Kitchen", lineId: alpha, widthEighths: 36 * 8, heightEighths: 60 * 8, quantity: 1, panels: 2, options: { [shape]: 1 } },
      { room: "Den", lineId: alpha, widthEighths: 30 * 8, heightEighths: 48 * 8, quantity: 2, panels: 2, options: {} },
      { room: "Bath", lineId: beta, widthEighths: 24 * 8, heightEighths: 30 * 8, quantity: 1, panels: 2, options: {} },
    ],
    orderOptions: {},
  };
  const expected = priceQuote(rates, guideInstallRate(rates), input);
  const total = expected.priceCents!;

  // 2. First quote on a job.
  const job = await newJob("Verify Shutter Client");
  const made = await makeShutterQuote({ jobId: job, quote: input, expectedTotalCents: total, actor: ACTOR });
  check("ok" in made && made.option === "A" && made.version === 1, "the first quote is Option A version 1", JSON.stringify(made));
  const [v] = await sql`select * from dc_quote_versions where lead_id = ${job}`;
  check(v.source === "shutter_guide" && v.status === "draft" && v.no_install === true && Number(v.handling_fee_cents) === 0,
    "the version is a draft from the guide, install in the prices, no handling fee", JSON.stringify(v));
  check(Number(v.dealer_total_cents) === expected.supplierCostCents, "its cost is what the supplier bills");
  const [{ project_no }] = await sql`select project_no from leads where id = ${job}`;
  check(v.po_reference === `PSS-${String(project_no).padStart(4, "0")}`, "its number is the job's PSS number", String(v.po_reference));
  const lines = await sql`select * from dc_quote_lines where version_id = ${v.id} order by position`;
  check(lines.length === 3 && lines.every((l) => Number(l.pct_override) === 100), "three lines, each pinned at 100%", JSON.stringify(lines.map((l) => l.pct_override)));
  check(lines[0].description === "Norman Alpha shutters, Angle top" && lines[1].qty === 2, "lines carry the description and quantity", JSON.stringify(lines.map((l) => [l.description, l.qty])));
  const [file] = await sql`select doc_type, name from job_files where id = ${v.source_file_id}`;
  check(file.doc_type === "dealer_copy", "the cost sheet is filed as a dealer copy, which can never be shared", JSON.stringify(file));
  const events = await sql`select body from job_events where lead_id = ${job} and kind = 'quote'`;
  check(events.length === 1 && String(events[0].body) === "Shutter quote from the price guide saved as version 1", "one timeline event", JSON.stringify(events));

  // 3. Priced the way review, Send and the contract price it.
  const review = await loadReview(job, "A");
  check(review !== null && review.priced.clientTotalCents === total, "the official quote's total equals the guide's total", `${review?.priced.clientTotalCents} vs ${total}`);
  check(review!.priced.blockers.length === 0, "nothing blocks it from being priced", JSON.stringify(review!.priced.blockers));
  const stored = await listVersions(job);
  check(stored[0].source === "shutter_guide", "listVersions reads the source");

  // 4. A re-quote is the next version of the same option.
  const again = await makeShutterQuote({ jobId: job, quote: input, expectedTotalCents: total, actor: ACTOR });
  check("ok" in again && again.option === "A" && again.version === 2, "a second quote is Option A version 2", JSON.stringify(again));

  // 5. A job whose Option A came from Direct Connect.
  const dcJob = await newJob("Verify DC Client");
  const [dcFile] = await sql`insert into job_files (id, lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname, doc_type)
    values (${randomUUID()}, ${dcJob}, ${ACTOR}, 'document', 'DEALER COPY 1.html', 'text/html', 1, 'verify/dc', 'dealer_copy') returning id`;
  await sql`insert into dc_quote_versions (id, lead_id, option, version, dc_quote_no, po_reference, source_file_id, source_sha256, status,
      dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents)
    values (${randomUUID()}, ${dcJob}, 'A', 1, '12345678', 'PSS-0000', ${dcFile.id}, 'x', 'draft', 1000, 0, 0, 1000)`;
  const second = await makeShutterQuote({ jobId: dcJob, quote: input, expectedTotalCents: total, actor: ACTOR });
  check("ok" in second && second.option === "B" && second.version === 1, "beside a Direct Connect quote it becomes a new Option B", JSON.stringify(second));
  const [dcA] = await sql`select source, status from dc_quote_versions where lead_id = ${dcJob} and option = 'A'`;
  check(dcA.source === "direct_connect" && dcA.status === "draft", "the Direct Connect quote is untouched and reads as direct_connect");
  const [optB] = await sql`select count(*)::int as n from quote_options where lead_id = ${dcJob} and letter = 'B'`;
  check(optB.n === 1, "Option B is stored as a quote option");

  // 6. Refusals write nothing.
  const before = await counts(job);
  const stale = await makeShutterQuote({ jobId: job, quote: input, expectedTotalCents: total + 1, actor: ACTOR });
  check("error" in stale && stale.error === RATES_CHANGED, "a total that no longer matches is refused");
  const lost = await newJob("Verify Lost Client", "lost");
  const lostResult = await makeShutterQuote({ jobId: lost, quote: input, expectedTotalCents: total, actor: ACTOR });
  check("error" in lostResult && lostResult.error === "This job is marked Lost.", "a Lost job is refused");
  await sql`update dc_quote_versions set status = 'signed' where lead_id = ${job} and version = 2`;
  const signed = await makeShutterQuote({ jobId: job, quote: input, expectedTotalCents: total, actor: ACTOR });
  check("error" in signed && signed.error === OPTION_SIGNED, "a job with a signed quote is refused");
  const after = await counts(job);
  check(after.versions === before.versions && after.files === before.files, "refusals leave no version and no cost sheet behind", JSON.stringify({ before, after }));
  check((await counts(lost)).files === 0, "the Lost job got no cost sheet");

  // 7. Housekeeping.
  check(!(await listSeenCollections()).some((c) => c === "Norman Alpha"), "guide lines stay out of the markup rules' collection list");
  check(await throws(() => sql`update dc_quote_versions set source = 'other' where lead_id = ${job}`), "an unknown source is refused");
});
