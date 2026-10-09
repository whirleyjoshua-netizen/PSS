import "server-only";
import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { createFile, deleteFile } from "@/lib/admin/files";
import { getJob, type Job } from "@/lib/admin/jobs";
import { listInstallQuotes } from "@/lib/admin/install-quotes";
import { formatCents } from "@/lib/admin/money";
import { formatOptionNo } from "@/lib/portal/project-no";
import { fillFields, termsFieldValues } from "@/lib/docs/fill";
import { remainingMarkers } from "@/lib/docs/parse";
import { STARTER_TERMS } from "@/lib/docs/starter-terms";
import { liveTemplateOfKind, type DocumentTemplate } from "@/lib/docs/templates";
import type { ContractInput } from "./contract-layout";
import { renderContractPdf, type ContractTerms } from "./contract-pdf";
import { sellUnitCents } from "./money";
import { pickInstallQuote, priceVersion, pricingFingerprint, sendBlockers, type InstallChoice, type PricedVersion } from "./pricing";
import { buildQuotePdf } from "./quote-pdf";
import { sendContractEmail } from "./send-contract-email";
import { sendQuoteEmail } from "./send-quote-email";
import { getDcSettings, listMarkupRules, listVersions, type DcSettings, type StoredVersion } from "./store";

export type Review = { version: StoredVersion; priced: PricedVersion; blockers: string[]; fingerprint: string; install: InstallChoice | null; rules: Record<string, number>; olderVersions: StoredVersion[] };

const NEWER = "A newer version of this quote has arrived. Review that one.";
const RACE = "This quote changed while you were sending. Reload and try again.";
const NO_TERMS = "Add your contract terms on the Documents page first.";
const DRAFT_TERMS = "Your contract terms still carry the DRAFT line. Remove it on the Documents page.";
const TERMS_UNREADABLE = "Your contract terms file could not be read. Add your contract terms on the Documents page.";

/** Quote options spec §5: once one option is signed, changes are new versions of that option, never a switch. */
export const signedElsewhere = (option: string): string => `Option ${option} is signed. Make changes as a new version of Option ${option}.`;

/** Which option to review: by letter (the Quote tab, Preview), or by a version id (Send quote, Send contract). */
type Which = { option: string } | { versionId: string };

/**
 * An offered (or later) version's price as Send quote froze it: the per-line % and sell stored then, and the
 * stored totals. Three generations print exactly as they were sent: handling and installation as their own
 * lines (before 037); handling built in, installation its own line (037); both built in (038).
 */
function frozenPrice(version: StoredVersion): PricedVersion {
  const handlingFolded = version.handlingFoldedCents !== null;
  const installFolded = version.installFoldedCents !== null;
  const lines = version.lines.map((l) => {
    const sellExtendedCents = l.sellUnitCents === null ? null : l.sellUnitCents * l.qty;
    // With anything built in, the margin is on the markup price, as priceVersion showed it before Send.
    const marginBase = (handlingFolded || installFolded) && l.markupPct !== null ? sellUnitCents(l.msrpUnitCents, l.markupPct) * l.qty : sellExtendedCents;
    return {
      position: l.position, pct: l.markupPct, source: l.markupOverridden ? "override" as const : "rule" as const,
      sellUnitCents: l.sellUnitCents, sellExtendedCents,
      marginCents: marginBase === null ? null : marginBase - l.costExtendedCents,
    };
  });
  const installCents = version.installCents ?? 0;
  const installLineCents = installFolded ? 0 : installCents;
  const installFoldedCents = version.installFoldedCents ?? 0;
  const clientTotalCents = version.clientTotalCents;
  return {
    lines, productsCents: version.productsCents,
    handlingChargedCents: handlingFolded || version.waiveHandling ? 0 : version.handlingFeeCents,
    handlingFoldedCents: version.handlingFoldedCents ?? 0, oversizedCents: version.oversizedFeeCents,
    installCents, installFoldedCents, installLineCents, installQuoteId: version.installQuoteId, clientTotalCents, costCents: version.dealerTotalCents,
    // As priceVersion computes it: product margin, the installation charged excluded.
    marginCents: clientTotalCents === null ? null : clientTotalCents - installFoldedCents - installLineCents - version.dealerTotalCents,
    waiveHandling: version.waiveHandling, blockers: [],
  };
}

/**
 * Spec §8 (documents): the terms template filled for this job at `now`. Only TERMS_FIELDS are filled: any
 * other marker (a total, a deposit) stays and refuses, so terms never print a figure beside the contract's.
 */
function fillTerms(template: DocumentTemplate, job: Job, now: Date): { text: string } | { error: string } {
  const filled = fillFields(template.body, termsFieldValues(job, now));
  const left = remainingMarkers(filled.text);
  if (left.length > 0) {
    return { error: `Your contract terms have ${left.join(", ")} with no value for this job. Fix the terms on the Documents page.` };
  }
  return { text: filled.text };
}

/** A line as it reads, ignoring bold marks and spacing, so un-bolding the banner doesn't sneak it past. */
const asRead = (line: string): string => line.replace(/\*/g, "").replace(/\s+/g, " ").trim();

/** The starter terms banner (their first line), which the owner deletes once an attorney has reviewed them. */
const STARTER_DRAFT_LINE = asRead(STARTER_TERMS.split("\n")[0]);

/** True while the terms still carry the starter DRAFT banner as one of their lines. */
function carriesDraftLine(body: string): boolean {
  return body.split("\n").some((line) => asRead(line) === STARTER_DRAFT_LINE);
}

/** The review plus the job and settings it was computed from, so Send quote and the contract use the very same reads. */
async function review(jobId: string, which: Which): Promise<{ review: Review; job: Job; settings: DcSettings; termsTemplate: DocumentTemplate | null; signedBlocker: string | null } | null> {
  const [job, all, rules, installs, settings, termsTemplate] = await Promise.all([
    getJob(jobId), listVersions(jobId), listMarkupRules(), listInstallQuotes(jobId), getDcSettings(), liveTemplateOfKind("terms"),
  ]);
  if (!job) return null;
  // A version id this job never had falls to option A, whose newest version is not it, so the caller answers NEWER.
  const option = "option" in which ? which.option : all.find((v) => v.id === which.versionId)?.option ?? "A";
  const versions = all.filter((v) => v.option === option);
  if (versions.length === 0) return null;
  const [version, ...olderVersions] = versions;
  const choices: InstallChoice[] = installs.map((q) => ({ id: q.id, kind: q.kind, totalCents: q.totalCents, createdAt: q.createdAt }));
  let install: InstallChoice | null;
  let priced: PricedVersion;
  if (version.status === "draft") {
    install = pickInstallQuote(choices);
    priced = priceVersion({
      lines: version.lines.map((l) => ({ position: l.position, qty: l.qty, collection: l.collection, msrpUnitCents: l.msrpUnitCents, costExtendedCents: l.costExtendedCents, pctOverride: l.pctOverride })),
      rules, handlingFeeCents: version.handlingFeeCents, oversizedFeeCents: version.oversizedFeeCents,
      dealerTotalCents: version.dealerTotalCents, waiveHandling: version.waiveHandling, install, noInstall: version.noInstall,
    });
  } else {
    // Offered, sent, signed, superseded or cancelled: what was sent, never a re-price with today's markup or install price.
    install = version.installQuoteId ? choices.find((q) => q.id === version.installQuoteId) ?? null : null;
    priced = frozenPrice(version);
  }
  const blockers = sendBlockers(priced, {
    hasTerms: termsTemplate !== null || settings.termsPathname !== null, isLatest: true, versionStatus: version.status,
    jobStatus: job.status, customerEmail: job.email,
  });
  const signed = all.find((v) => v.status === "signed" && v.option !== option);
  const signedBlocker = signed ? signedElsewhere(signed.option) : null;
  if (signedBlocker) blockers.push(signedBlocker);
  // Shown before Send quote; Send quote and the contract fill and check again with their own `now`.
  if (termsTemplate) {
    const filled = fillTerms(termsTemplate, job, new Date());
    if ("error" in filled) blockers.push(filled.error);
    if (carriesDraftLine(termsTemplate.body)) blockers.push(DRAFT_TERMS);
  }
  return { review: { version, priced, blockers, fingerprint: pricingFingerprint(priced), install, rules, olderVersions }, job, settings, termsTemplate, signedBlocker };
}

/** The latest version of one option of a job's DC quote (A unless named), priced exactly as Send quote would price it. */
export async function loadReview(jobId: string, option = "A"): Promise<Review | null> {
  return (await review(jobId, { option }))?.review ?? null;
}

/**
 * The terms the contract prints: the live terms template filled for this job at `now`, otherwise the
 * uploaded PDF's bytes. Send quote resolves them too and throws the result away (spec §2: nothing that
 * could stop the contract later is left unchecked).
 */
async function resolveTerms(termsTemplate: DocumentTemplate | null, settings: DcSettings, job: Job, now: Date): Promise<ContractTerms | { error: string }> {
  if (termsTemplate) {
    if (carriesDraftLine(termsTemplate.body)) return { error: DRAFT_TERMS };
    return fillTerms(termsTemplate, job, now);
  }
  if (!settings.termsPathname) return { error: NO_TERMS };
  const stored = await get(settings.termsPathname, { access: "private" });
  if (!stored || stored.statusCode !== 200) return { error: TERMS_UNREADABLE };
  return { pdf: new Uint8Array(await new Response(stored.stream).arrayBuffer()) };
}

/** What the quote and the contract print, from the priced version the review computed or Send quote froze. */
function pricedInput(job: Job, version: StoredVersion, priced: PricedVersion, projectNo: string, date: Date): ContractInput {
  const pricedLine = (position: number) => priced.lines.find((x) => x.position === position)!;
  return {
    projectNo, version: version.version, date,
    client: { name: job.name, address: job.address, city: job.city, email: job.email },
    lines: version.lines.map((l) => {
      const p = pricedLine(l.position);
      return { room: l.room, description: l.description, options: l.options, qty: l.qty, sellUnitCents: p.sellUnitCents!, sellExtendedCents: p.sellExtendedCents! };
    }),
    // Only what prints as its own line: built-in installation and handling are inside the line prices.
    installCents: priced.installLineCents, handlingChargedCents: priced.handlingChargedCents,
    oversizedCents: priced.oversizedCents, clientTotalCents: priced.clientTotalCents!,
  };
}

/**
 * The quote PDF as Send quote would build it now, marked PREVIEW, for the owner's eyes only: nothing is
 * saved, shared or emailed. Refused only while the price is incomplete; Send's other blockers (no email,
 * the terms) don't change what the quote prints.
 */
export async function previewQuote(jobId: string, option = "A"): Promise<{ pdf: Uint8Array; name: string } | { error: string }> {
  const loaded = await review(jobId, { option });
  if (!loaded) return { error: "This job has no Direct Connect quote." };
  const { review: { version, priced }, job } = loaded;
  // Once sent, the real quote is in Files; a copy stamped "Not sent", dated today, would be false.
  if (version.status !== "draft") return { error: "This quote has been sent. Its PDF is in Files." };
  if (priced.blockers.length > 0) return { error: priced.blockers[0] };
  const optionNo = formatOptionNo(job.projectNo, version.option) ?? "PSS";
  const pdf = await buildQuotePdf(pricedInput(job, version, priced, optionNo, new Date()), { preview: true });
  return { pdf, name: `Quote ${optionNo} v${version.version} PREVIEW.pdf` };
}

/**
 * Spec §2, Send quote. Recomputes the price, refuses anything the owner did not see (a blocker, a newer
 * version, a changed fingerprint) and anything that would stop the contract later (the terms), builds the
 * quote PDF, then in ONE statement freezes the price (draft → offered), supersedes and unshares every other
 * unsigned version's quote and contract, shares the quote, records quote_cents, moves New / Appointment
 * booked / Approved to Quoted (an approval of a superseded price no longer stands), and logs it. Quote options
 * spec §5: everything is scoped to the version's option. The supersede set also takes any other option's
 * unsigned version the client approved (sending B after the client approved A is the switch), and the send is
 * refused while another option is signed. The client email goes last: a failed email leaves the quote sent and
 * answers emailed false.
 */
export async function sendQuote(input: { jobId: string; versionId: string; fingerprint: string; actor: string }): Promise<{ ok: true; emailed: boolean } | { error: string }> {
  const loaded = await review(input.jobId, { versionId: input.versionId });
  if (!loaded) return { error: "This job has no Direct Connect quote." };
  const { review: current, job, settings, termsTemplate } = loaded;
  if (current.version.id !== input.versionId) return { error: NEWER };
  if (current.blockers.length > 0) return { error: current.blockers[0] };
  if (current.fingerprint !== input.fingerprint) return { error: "Prices changed since you opened this page. Review them and send again." };

  const { priced, version } = current;
  const now = new Date();
  const terms = await resolveTerms(termsTemplate, settings, job, now);
  if ("error" in terms) return terms;

  const optionNo = formatOptionNo(job.projectNo, version.option) ?? "PSS";
  const name = `Quote ${optionNo} v${version.version}.pdf`;
  const pdf = await buildQuotePdf(pricedInput(job, version, priced, optionNo, now));
  const file = await createFile({ leadId: job.id, kind: "document", name, contentType: "application/pdf",
    body: new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), actor: input.actor, docType: "quote" });
  if (!file) return { error: "This job no longer exists." };

  const lineRows = JSON.stringify(version.lines.map((l) => {
    const p = priced.lines.find((x) => x.position === l.position)!;
    return { position: l.position, override: l.pctOverride, pct: p.pct, sell_unit_cents: p.sellUnitCents, overridden: p.source === "override" };
  }));
  let rows: Record<string, unknown>[];
  try {
    // Every CTE sees the same snapshot, so `moved`'s case reads the status before this update.
    // dc_quote_versions_one_offered is deferred to commit, so offering this version while `superseded`
    // retires the old offered one, in the same statement, is allowed.
    rows = await db()`
      with prev as (select status from leads where id = ${job.id}),
      offered as (
        update dc_quote_versions set status = 'offered', install_quote_id = ${priced.installQuoteId}, install_cents = ${priced.installCents},
          products_cents = ${priced.productsCents}, client_total_cents = ${priced.clientTotalCents},
          handling_folded_cents = ${priced.handlingFoldedCents}, install_folded_cents = ${priced.installFoldedCents},
          quote_file_id = ${file.id}, offered_at = now(), offered_by = ${input.actor}
        where id = ${version.id} and lead_id = ${job.id} and status = 'draft'
          and version = (select max(version) from dc_quote_versions where lead_id = ${job.id} and option = ${version.option})
          -- Quote options spec §5: never while another option is signed.
          and not exists (select 1 from dc_quote_versions s where s.lead_id = ${job.id} and s.status = 'signed' and s.option <> ${version.option})
          -- The inputs this price was computed from must be the ones still stored.
          and waive_handling = ${version.waiveHandling} and no_install = ${version.noInstall}
          and not exists (
            select 1 from dc_quote_lines q
            join jsonb_to_recordset(${lineRows}::jsonb) as r(position int, override numeric) on q.position = r.position
            where q.version_id = ${version.id} and q.pct_override is distinct from r.override
          )
          -- The job-level blockers, rechecked where they are stored.
          and exists (select 1 from leads where id = ${job.id} and status <> 'lost' and nullif(trim(email), '') is not null)
        returning id
      ),
      priced_lines as (
        update dc_quote_lines set markup_pct = l.pct, sell_unit_cents = l.sell_unit_cents, markup_overridden = l.overridden
        from offered, jsonb_to_recordset(${lineRows}::jsonb) as l(position int, pct numeric, sell_unit_cents int, overridden boolean)
        where dc_quote_lines.version_id = offered.id and dc_quote_lines.position = l.position
        returning 1
      ),
      superseded as (
        update dc_quote_versions set status = 'superseded'
        where lead_id = ${job.id} and status in ('draft','offered','sent') and id <> ${version.id} and (option = ${version.option} or approved_at is not null) and exists (select 1 from offered)
        returning contract_file_id, quote_file_id
      ),
      unshared as (
        update job_files set shared_at = null
        where lead_id = ${job.id}
          and (id in (select contract_file_id from superseded) or id in (select quote_file_id from superseded))
          and not exists (select 1 from contract_signatures s where s.file_id = job_files.id or s.signed_file_id = job_files.id)
        returning id
      ),
      shared as (
        update job_files set shared_at = now()
        where id = ${file.id} and lead_id = ${job.id} and exists (select 1 from offered)
        returning id
      ),
      moved as (
        update leads set quote_cents = ${priced.clientTotalCents},
          status = case when status in ('new','contacted','visit_booked','approved') then 'quoted' else status end,
          stage_changed_at = case when status in ('new','contacted','visit_booked','approved') then now() else stage_changed_at end,
          updated_at = now()
        where id = ${job.id} and exists (select 1 from offered)
        returning id
      ),
      stage_logged as (
        insert into job_events (lead_id, actor, kind, from_status, to_status, body)
        select ${job.id}, ${input.actor}, 'stage', prev.status, 'quoted', 'Quote sent' from prev, moved
        where prev.status in ('new','contacted','visit_booked','approved')
      ),
      logged as (
        insert into job_events (lead_id, actor, kind, body)
        select ${job.id}, ${input.actor}, 'quote', ${`Sent ${name} for ${formatCents(priced.clientTotalCents)}`} from offered
      )
      select id from offered`;
  } catch (error) {
    // Nothing links to the quote yet: remove it, or every retry leaves another one on the job.
    await deleteFile(file.id, input.actor).catch((cleanup) => console.error("Could not remove the unsent quote", cleanup));
    throw error;
  }
  if (rows.length === 0) {
    // The version stopped being the latest draft (another send, or a newer import) after we read it.
    if (!(await deleteFile(file.id, input.actor))) console.error(`Could not remove the unsent quote ${file.id}`);
    return { error: RACE };
  }
  try {
    await sendQuoteEmail(job, name, pdf);
    return { ok: true, emailed: true };
  } catch (error) {
    console.error(`Quote ${name} sent but the client email failed`, error);
    return { ok: true, emailed: false };
  }
}

/**
 * Spec §2, the contract for an approved quote: called on the client's approval, or by the owner's Send
 * contract when that failed. Builds from the price Send quote froze (no fingerprint: nothing can have
 * moved), with 029's sign marks stored in createFile's statement, then in ONE statement moves the
 * version offered → sent (approved, still the newest of its option, no other option signed, job not Lost and with an email), shares the
 * contract and logs it. A second call matches nothing, removes its file and says so.
 */
export async function sendContract(input: { jobId: string; versionId: string; actor: string }): Promise<{ ok: true; emailed: boolean } | { error: string }> {
  const loaded = await review(input.jobId, { versionId: input.versionId });
  if (!loaded) return { error: "This job has no Direct Connect quote." };
  const { review: current, job, settings, termsTemplate, signedBlocker } = loaded;
  const { version, priced } = current;
  if (version.id !== input.versionId) return { error: NEWER };
  if (version.status !== "offered") return { error: "This quote's contract has already been sent, or the quote was never sent." };
  if (!version.approvedAt) return { error: "The client has not approved this quote yet." };
  if (job.status === "lost") return { error: "This job is marked Lost." };
  if (!job.email?.trim()) return { error: "Add the client's email address to the job first." };
  // Quote options spec §5: once another option is signed, this one never gets a contract.
  if (signedBlocker) return { error: signedBlocker };

  const now = new Date();
  const terms = await resolveTerms(termsTemplate, settings, job, now);
  if ("error" in terms) return terms;

  const optionNo = formatOptionNo(job.projectNo, version.option) ?? "PSS";
  const name = `Contract ${optionNo} v${version.version}.pdf`;
  const rendered = await renderContractPdf(pricedInput(job, version, priced, optionNo, now), terms);
  // The marks go in with the file, in createFile's one statement (visible signatures spec §3).
  const file = await createFile({ leadId: job.id, kind: "document", name, contentType: "application/pdf",
    body: new Blob([new Uint8Array(rendered.bytes)], { type: "application/pdf" }), actor: input.actor, docType: "contract",
    signMarks: rendered.marks });
  if (!file) return { error: "This job no longer exists." };

  let rows: Record<string, unknown>[];
  try {
    rows = await db()`
      with frozen as (
        update dc_quote_versions set status = 'sent', contract_file_id = ${file.id}, sent_at = now(), sent_by = ${input.actor}
        where id = ${version.id} and lead_id = ${job.id} and status = 'offered' and approved_at is not null
          and version = (select max(version) from dc_quote_versions where lead_id = ${job.id} and option = ${version.option})
          -- Quote options spec §5: never while another option is signed (a signature landing after the review).
          and not exists (select 1 from dc_quote_versions s where s.lead_id = ${job.id} and s.status = 'signed' and s.option <> ${version.option})
          and exists (select 1 from leads where id = ${job.id} and status <> 'lost' and nullif(trim(email), '') is not null)
        returning id
      ),
      shared as (
        update job_files set shared_at = now()
        where id = ${file.id} and lead_id = ${job.id} and exists (select 1 from frozen)
        returning id
      ),
      logged as (
        insert into job_events (lead_id, actor, kind, body)
        select ${job.id}, ${input.actor}, 'quote', ${`Sent ${name} for ${formatCents(priced.clientTotalCents)}`} from frozen
      )
      select id from frozen`;
  } catch (error) {
    await deleteFile(file.id, input.actor).catch((cleanup) => console.error("Could not remove the unsent contract", cleanup));
    throw error;
  }
  if (rows.length === 0) {
    if (!(await deleteFile(file.id, input.actor))) console.error(`Could not remove the unsent contract ${file.id}`);
    return { error: RACE };
  }
  try {
    await sendContractEmail(job, name);
    return { ok: true, emailed: true };
  } catch (error) {
    console.error(`Contract ${name} sent but the client email failed`, error);
    return { ok: true, emailed: false };
  }
}
