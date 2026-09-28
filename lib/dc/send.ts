import "server-only";
import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { createFile, deleteFile } from "@/lib/admin/files";
import { getJob, type Job } from "@/lib/admin/jobs";
import { listInstallQuotes } from "@/lib/admin/install-quotes";
import { formatCents } from "@/lib/admin/money";
import { formatProjectNo } from "@/lib/portal/project-no";
import { buildContractPdf } from "./contract-pdf";
import { pickInstallQuote, priceVersion, pricingFingerprint, sendBlockers, type InstallChoice, type PricedVersion } from "./pricing";
import { sendContractEmail } from "./send-contract-email";
import { getDcSettings, listMarkupRules, listVersions, type DcSettings, type StoredVersion } from "./store";

export type Review = { version: StoredVersion; priced: PricedVersion; blockers: string[]; fingerprint: string; install: InstallChoice | null; rules: Record<string, number>; olderVersions: StoredVersion[] };

/** A sent version's price as Send froze it: the per-line % and sell stored at send, and the stored totals. */
function frozenPrice(version: StoredVersion): PricedVersion {
  const lines = version.lines.map((l) => {
    const sellExtendedCents = l.sellUnitCents === null ? null : l.sellUnitCents * l.qty;
    return {
      position: l.position, pct: l.markupPct, source: l.markupOverridden ? "override" as const : "rule" as const,
      sellUnitCents: l.sellUnitCents, sellExtendedCents,
      marginCents: sellExtendedCents === null ? null : sellExtendedCents - l.costExtendedCents,
    };
  });
  const installCents = version.installCents ?? 0;
  const clientTotalCents = version.clientTotalCents;
  return {
    lines, productsCents: version.productsCents,
    handlingChargedCents: version.waiveHandling ? 0 : version.handlingFeeCents, oversizedCents: version.oversizedFeeCents,
    installCents, installQuoteId: version.installQuoteId, clientTotalCents, costCents: version.dealerTotalCents,
    // As priceVersion computes it: product margin, installation excluded.
    marginCents: clientTotalCents === null ? null : clientTotalCents - installCents - version.dealerTotalCents,
    waiveHandling: version.waiveHandling, blockers: [],
  };
}

/** The review plus the job and settings it was computed from, so Send uses the very same reads. */
async function review(jobId: string): Promise<{ review: Review; job: Job; settings: DcSettings } | null> {
  const [job, versions, rules, installs, settings] = await Promise.all([
    getJob(jobId), listVersions(jobId), listMarkupRules(), listInstallQuotes(jobId), getDcSettings(),
  ]);
  if (!job || versions.length === 0) return null;
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
    // Sent, signed or superseded: what was sent, never a re-price with today's markup or install price.
    install = version.installQuoteId ? choices.find((q) => q.id === version.installQuoteId) ?? null : null;
    priced = frozenPrice(version);
  }
  const blockers = sendBlockers(priced, {
    hasTerms: settings.termsPathname !== null, isLatest: true, versionStatus: version.status,
    jobStatus: job.status, customerEmail: job.email,
  });
  return { review: { version, priced, blockers, fingerprint: pricingFingerprint(priced), install, rules, olderVersions }, job, settings };
}

/** The latest version of a job's DC quote, priced exactly as Send would price it. */
export async function loadReview(jobId: string): Promise<Review | null> {
  return (await review(jobId))?.review ?? null;
}

/**
 * Recomputes the price, refuses anything the owner did not see (a blocker, a newer version, a
 * changed fingerprint), builds the contract, then freezes, shares and logs it in one statement.
 * The client email goes last: a failed email leaves the contract sent and answers emailed false.
 */
export async function sendContract(input: { jobId: string; versionId: string; fingerprint: string; actor: string }): Promise<{ ok: true; emailed: boolean } | { error: string }> {
  const loaded = await review(input.jobId);
  if (!loaded) return { error: "This job has no Direct Connect quote." };
  const { review: current, job, settings } = loaded;
  if (current.version.id !== input.versionId) return { error: "A newer version of this quote has arrived. Review that one." };
  if (current.blockers.length > 0) return { error: current.blockers[0] };
  if (current.fingerprint !== input.fingerprint) return { error: "Prices changed since you opened this page. Review them and send again." };

  const { priced, version } = current;
  const terms = await get(settings.termsPathname!, { access: "private" });
  if (!terms || terms.statusCode !== 200) return { error: "Your contract terms file could not be read. Upload it again in Settings." };
  const termsBytes = new Uint8Array(await new Response(terms.stream).arrayBuffer());

  const projectNo = formatProjectNo(job.projectNo) ?? "PSS";
  const name = `Contract ${projectNo} v${version.version}.pdf`;
  const pricedLine = (position: number) => priced.lines.find((x) => x.position === position)!;
  const pdf = await buildContractPdf({
    projectNo, version: version.version, date: new Date(),
    client: { name: job.name, address: job.address, city: job.city, email: job.email },
    lines: version.lines.map((l) => {
      const p = pricedLine(l.position);
      return { room: l.room, description: l.description, options: l.options, qty: l.qty, sellUnitCents: p.sellUnitCents!, sellExtendedCents: p.sellExtendedCents! };
    }),
    installCents: priced.installCents, handlingChargedCents: priced.handlingChargedCents,
    oversizedCents: priced.oversizedCents, clientTotalCents: priced.clientTotalCents!,
  }, termsBytes);

  const file = await createFile({ leadId: job.id, kind: "document", name, contentType: "application/pdf",
    body: new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), actor: input.actor, docType: "contract" });
  if (!file) return { error: "This job no longer exists." };

  const lineRows = JSON.stringify(version.lines.map((l) => {
    const p = pricedLine(l.position);
    return { position: l.position, override: l.pctOverride, pct: p.pct, sell_unit_cents: p.sellUnitCents, overridden: p.source === "override" };
  }));
  let rows: Record<string, unknown>[];
  try {
    // One statement: freeze this version (only if it is still the latest draft), price its lines,
    // supersede and unshare any earlier unsigned contract, share this one, record the quoted
    // amount, move New / Appointment booked to Quoted, and log both. All or nothing.
    // Every CTE sees the same snapshot, so `moved`'s case reads the status before this update.
    rows = await db()`
      with prev as (select status from leads where id = ${job.id}),
      frozen as (
        update dc_quote_versions set status = 'sent', install_quote_id = ${priced.installQuoteId}, install_cents = ${priced.installCents},
          products_cents = ${priced.productsCents}, client_total_cents = ${priced.clientTotalCents},
          contract_file_id = ${file.id}, sent_at = now(), sent_by = ${input.actor}
        where id = ${version.id} and lead_id = ${job.id} and status = 'draft'
          and version = (select max(version) from dc_quote_versions where lead_id = ${job.id})
          -- The inputs this price was computed from must be the ones still stored: a waive,
          -- no-install or per-line % saved after the review would otherwise sit beside a total
          -- that ignores it.
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
        from frozen, jsonb_to_recordset(${lineRows}::jsonb) as l(position int, pct numeric, sell_unit_cents int, overridden boolean)
        where dc_quote_lines.version_id = frozen.id and dc_quote_lines.position = l.position
        returning 1
      ),
      superseded as (
        update dc_quote_versions set status = 'superseded'
        where lead_id = ${job.id} and status in ('sent','draft') and id <> ${version.id} and exists (select 1 from frozen)
        returning contract_file_id
      ),
      unshared as (
        update job_files set shared_at = null
        where id in (select contract_file_id from superseded) and lead_id = ${job.id}
          and not exists (select 1 from contract_signatures s where s.file_id = job_files.id or s.signed_file_id = job_files.id)
        returning id
      ),
      shared as (
        update job_files set shared_at = now()
        where id = ${file.id} and lead_id = ${job.id} and exists (select 1 from frozen)
        returning id
      ),
      moved as (
        update leads set quote_cents = ${priced.clientTotalCents},
          status = case when status in ('new','visit_booked') then 'quoted' else status end,
          stage_changed_at = case when status in ('new','visit_booked') then now() else stage_changed_at end,
          updated_at = now()
        where id = ${job.id} and exists (select 1 from frozen)
        returning id
      ),
      stage_logged as (
        insert into job_events (lead_id, actor, kind, from_status, to_status, body)
        select ${job.id}, ${input.actor}, 'stage', prev.status, 'quoted', 'Contract sent' from prev, moved
        where prev.status in ('new','visit_booked')
      ),
      logged as (
        insert into job_events (lead_id, actor, kind, body)
        select ${job.id}, ${input.actor}, 'quote', ${`Sent ${name} for ${formatCents(priced.clientTotalCents)}`} from frozen
      )
      select id from frozen`;
  } catch (error) {
    // Nothing links to the contract yet: remove it, or every retry leaves another one on the job.
    await deleteFile(file.id, input.actor).catch((cleanup) => console.error("Could not remove the unsent contract", cleanup));
    throw error;
  }
  if (rows.length === 0) {
    // The version stopped being the latest draft (another send, or a newer import) after we read it.
    if (!(await deleteFile(file.id, input.actor))) console.error(`Could not remove the unsent contract ${file.id}`);
    return { error: "This quote changed while you were sending. Reload and try again." };
  }
  try {
    await sendContractEmail(job, name);
    return { ok: true, emailed: true };
  } catch (error) {
    console.error(`Contract ${name} sent but the client email failed`, error);
    return { ok: true, emailed: false };
  }
}
