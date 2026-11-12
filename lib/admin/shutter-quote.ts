import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createFile, deleteFile } from "@/lib/admin/files";
import { isUuid } from "@/lib/admin/jobs";
import { formatCents } from "@/lib/admin/money";
import { addQuoteOption, OPTION_SIGNED } from "@/lib/dc/store";
import { formatOptionNo } from "@/lib/portal/project-no";
import { guideInstallRate, priceQuote, type QuoteInput } from "./shutter-pricing";
import { getShutterRates } from "./shutter-rates";
import { buildShutterQuote, costSheetHtml, type ShutterQuoteVersion } from "./shutter-quote-lines";

export type QuotableJob = { id: string; name: string; projectNo: number };
export type MakeQuoteResult = { ok: true; jobId: string; option: string; version: number } | { error: string };

export const RATES_CHANGED = "The rates changed since this page loaded. Reload the page and price it again.";

/** Jobs a quote can go on: a PSS number, not Lost, nothing signed yet. Most recently moved first. */
export async function listQuotableJobs(): Promise<QuotableJob[]> {
  const rows = await db()`
    select id, name, project_no from leads
    where project_no is not null and status <> 'lost'
      and not exists (select 1 from dc_quote_versions v where v.lead_id = leads.id and v.status = 'signed')
    order by stage_changed_at desc
    limit 500`;
  return rows.map((r) => ({ id: r.id as string, name: (r.name as string) || "No name", projectNo: Number(r.project_no) }));
}

/**
 * Which option the quote goes on: the newest option whose latest version came from the guide (a re-quote is
 * its next version), else Option A while it has no quote, else a new option. A Direct Connect quote is never
 * replaced by a shutter quote.
 */
async function pickOption(leadId: string, actor: string): Promise<{ letter: string } | { error: string }> {
  const latest = await db()`
    select distinct on (option) option, source, created_at from dc_quote_versions
    where lead_id = ${leadId} order by option, version desc`;
  const guide = latest.filter((r) => r.source === "shutter_guide")
    .sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime())[0];
  if (guide) return { letter: guide.option as string };
  if (!latest.some((r) => r.option === "A")) return { letter: "A" };
  return addQuoteOption(leadId, actor);
}

/**
 * One statement: the version (numbered max+1 within its option), every line pinned at 100% of its price,
 * and the timeline event. Exported for scripts/verify-shutter-quote.ts, which runs it on a real database.
 */
export async function insertShutterVersion(input: {
  leadId: string; option: string; poReference: string; clientName: string; sourceFileId: string; sha256: string;
  built: ShutterQuoteVersion; actor: string;
}): Promise<{ versionId: string; version: number } | null> {
  const { built } = input;
  const lines = JSON.stringify(built.lines.map((l) => ({
    position: l.position, qty: l.qty, room: l.room, description: l.description, collection: l.collection,
    msrp_unit_cents: l.msrpUnitCents, cost_unit_cents: l.costUnitCents, cost_extended_cents: l.costExtendedCents, options: l.options,
  })));
  const saved = input.option === "A" ? "Shutter quote from the price guide saved as version " : `Shutter quote from the price guide saved as ${input.poReference} version `;
  const rows = await db()`
    with version as (
      insert into dc_quote_versions (id, lead_id, option, version, dc_quote_no, po_reference, client_name, source_file_id, source_sha256,
        message_id, status, dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents, no_install, source)
      select ${randomUUID()}, ${input.leadId}, ${input.option},
        coalesce((select max(version) from dc_quote_versions where lead_id = ${input.leadId} and option = ${input.option}), 0) + 1,
        '', ${input.poReference}, ${input.clientName}, ${input.sourceFileId}, ${input.sha256}, null, 'draft',
        ${built.dealerTotalCents}, 0, 0, ${built.dealerTotalCents}, true, 'shutter_guide'
      returning id, lead_id, version
    ),
    inserted as (
      insert into dc_quote_lines (version_id, position, qty, room, description, collection, base_cents, promotion_cents,
        options_cents, msrp_unit_cents, cost_factor, cost_unit_cents, cost_extended_cents, options, pct_override)
      select version.id, l.position, l.qty, l.room, l.description, l.collection, l.msrp_unit_cents, 0,
        0, l.msrp_unit_cents, null, l.cost_unit_cents, l.cost_extended_cents, l.options, 100
      from version, jsonb_to_recordset(${lines}::jsonb) as l(position int, qty int, room text, description text,
        collection text, msrp_unit_cents int, cost_unit_cents int, cost_extended_cents int, options jsonb)
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.actor}, 'quote', ${saved} || version from version
    )
    select id, version from version`;
  return rows[0] ? { versionId: rows[0].id as string, version: Number(rows[0].version) } : null;
}

/**
 * The guide's Make this a quote. The windows are priced again here from the saved rates; the quote is made only
 * when that total equals the one the screen showed (saved figure equals screen), then filed on the job as a
 * draft for the usual review and Send.
 */
export async function makeShutterQuote(input: { jobId: string; quote: QuoteInput; expectedTotalCents: number; actor: string }): Promise<MakeQuoteResult> {
  if (!isUuid(input.jobId)) return { error: "Pick a job." };
  const rates = await getShutterRates();
  let priced;
  try {
    priced = priceQuote(rates, guideInstallRate(rates), input.quote);
  } catch (error) {
    return { error: (error as Error).message };
  }
  if (priced.windows.length === 0) return { error: "Add at least one window." };
  if (priced.priceCents === null) return { error: "Every window needs a client price. Set a markup or the line's client price on the Rates screen." };
  if (priced.priceCents !== input.expectedTotalCents) return { error: RATES_CHANGED };
  const built = buildShutterQuote(priced, input.quote.supplier, rates.options);

  const [job] = await db()`
    select id, name, project_no, status,
      exists (select 1 from dc_quote_versions v where v.lead_id = leads.id and v.status = 'signed') as signed
    from leads where id = ${input.jobId}`;
  if (!job) return { error: "That job no longer exists." };
  if (job.project_no === null) return { error: "This job has no PSS number yet." };
  if (job.status === "lost") return { error: "This job is marked Lost." };
  if (job.signed === true) return { error: OPTION_SIGNED };

  const option = await pickOption(input.jobId, input.actor);
  if ("error" in option) return option;
  const poReference = formatOptionNo(Number(job.project_no), option.letter) ?? "";
  const sha256 = createHash("sha256").update(JSON.stringify({ supplier: input.quote.supplier, built })).digest("hex");
  const at = new Date();
  const html = costSheetHtml({ quote: priced, supplier: input.quote.supplier, jobLabel: `${job.name} (${poReference})`, actor: input.actor, at, formatCents });
  const file = await createFile({
    leadId: input.jobId, kind: "document", name: `SHUTTER COST SHEET ${poReference}.html`, contentType: "text/html",
    body: new Blob([html], { type: "text/html" }), actor: input.actor, docType: "dealer_copy",
  });
  if (!file) return { error: "That job no longer exists." };

  let saved: Awaited<ReturnType<typeof insertShutterVersion>>;
  try {
    saved = await insertShutterVersion({ leadId: input.jobId, option: option.letter, poReference, clientName: String(job.name ?? ""), sourceFileId: file.id, sha256, built, actor: input.actor });
  } catch (error) {
    // Nothing links to the cost sheet yet: remove it so a retry doesn't leave a second one.
    await deleteFile(file.id, input.actor).catch((cleanup) => console.error("Could not remove the unused cost sheet", cleanup));
    console.error("Could not save the shutter quote", error);
    return { error: "The quote could not be saved. Try again." };
  }
  if (!saved) {
    await deleteFile(file.id, input.actor).catch(() => undefined);
    return { error: "The quote could not be saved. Try again." };
  }
  return { ok: true, jobId: input.jobId, option: option.letter, version: saved.version };
}
