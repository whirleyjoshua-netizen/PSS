import "server-only";
import { createHash } from "node:crypto";
import { createFile, deleteFile } from "@/lib/admin/files";
import { formatOptionNo } from "@/lib/portal/project-no";
import { DC_SUBJECT, IMPORT_ACTOR } from "./config";
import { htmlAttachments, listCandidateMessages } from "./mailbox";
import { importEmail, notifyOwners, staleFailuresEmail } from "./notify";
import { parseDealerCopy } from "./parse";
import { findJobByProjectNo, getDcSettings, importVersion, isProcessed, latestSha, quoteOptionExists, recordOutcome, setLastPolledAt } from "./store";
import type { DcQuote, ImportOutcome } from "./types";

type Result = { outcome: ImportOutcome; leadId: string | null; detail: string | null; version?: number };
const OVERLAP_MS = 60 * 60 * 1000;
/**
 * Only when last_polled_at is null. Migration 024 sets the mark when it creates the table, so the
 * first production run never reaches back to the Dealer Copies sent while testing; this short
 * window is the second line of defence if the mark is ever cleared.
 */
const FIRST_RUN_LOOKBACK_MS = 60 * 60 * 1000;
/** A message still failing this long after it arrived is worth a developer's look. */
const STALE_FAILURE_MS = 24 * 60 * 60 * 1000;

/**
 * The fingerprint of what DC quoted, not of the email's bytes: every Dealer Copy carries a
 * per-email tracking-pixel URL, so hashing the raw HTML would make every re-send look new.
 * Every field is named here in a fixed order, so the hash cannot drift with object key order.
 */
export function quoteSha256(q: DcQuote): string {
  const canonical = {
    quoteNo: q.quoteNo, poReference: q.poReference, projectNo: q.projectNo, clientName: q.clientName,
    lines: q.lines.map((l) => ({
      position: l.position, qty: l.qty, room: l.room, description: l.description, collection: l.collection,
      baseCents: l.baseCents, promotionCents: l.promotionCents, optionsCents: l.optionsCents,
      msrpUnitCents: l.msrpUnitCents, costFactor: l.costFactor, costUnitCents: l.costUnitCents,
      costExtendedCents: l.costExtendedCents, options: l.options.map(([label, value]) => [label, value]),
    })),
    subtotalCents: q.subtotalCents, handlingFeeCents: q.handlingFeeCents,
    oversizedFeeCents: q.oversizedFeeCents, dealerTotalCents: q.dealerTotalCents,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * `optionNo` is the printed number of the option the copy was imported onto (PSS-1042 or PSS-1042-B), null when none.
 * `missingOption` is the option letter when the PO named a real job's option that was never added, else null.
 */
async function tell(result: Result, dcQuoteNo: string | null, optionNo: string | null, missingOption: string | null = null) {
  const email = importEmail({ ...result, dcQuoteNo, projectNo: optionNo, jobId: result.leadId, missingOption });
  if (email) await notifyOwners(email).catch((error) => console.error("DC import email failed", error));
}

/** One Dealer Copy, already known to come from DC. Never throws for a bad document, only for I/O. */
export async function importDealerCopy(input: { internetMessageId: string; receivedAt: Date; html: string }): Promise<Result> {
  if (await isProcessed(input.internetMessageId)) return { outcome: "unchanged", leadId: null, detail: "already processed" };
  const base = { messageId: input.internetMessageId, receivedAt: input.receivedAt };

  const parsed = parseDealerCopy(input.html);
  if (!parsed.ok) {
    const result: Result = { outcome: parsed.refusal.outcome, leadId: null, detail: parsed.refusal.detail };
    const dcQuoteNo = parsed.refusal.quoteNo ?? null;
    await recordOutcome({ ...base, outcome: result.outcome, leadId: null, dcQuoteNo, detail: result.detail });
    await tell(result, dcQuoteNo, null);
    return result;
  }
  const quote = parsed.quote;
  // The release gate: the job is found by the exact PSS number in PO Reference, or not at all.
  // "Exact" is the printed text: PSS-01042 names 1042 as a number but is not job 1042's number.
  // Options B–Z (quote options spec §4) must also have been added on the job: a typo never creates one.
  const found = await findJobByProjectNo(quote.projectNo);
  const named = found && formatOptionNo(found.projectNo, quote.option) === quote.poReference ? found : null;
  const job = named && (await quoteOptionExists(named.id, quote.option)) ? named : null;
  if (!job) {
    const result: Result = { outcome: "no-match", leadId: null, detail: quote.poReference };
    await recordOutcome({ ...base, outcome: "no-match", leadId: null, dcQuoteNo: quote.quoteNo, detail: quote.poReference });
    // The job exists under exactly this number but the option was never added: say so, not "no job".
    await tell(result, quote.quoteNo, null, named ? quote.option : null);
    return result;
  }

  const sha256 = quoteSha256(quote);
  if ((await latestSha(job.id, quote.option)) === sha256) {
    await recordOutcome({ ...base, outcome: "unchanged", leadId: job.id, dcQuoteNo: quote.quoteNo, detail: null });
    return { outcome: "unchanged", leadId: job.id, detail: null };
  }

  const file = await createFile({
    leadId: job.id, kind: "document", name: `DEALER COPY ${quote.quoteNo}.html`, contentType: "text/html",
    body: new Blob([input.html], { type: "text/html" }), actor: IMPORT_ACTOR, docType: "dealer_copy",
  });
  if (!file) return { outcome: "no-match", leadId: null, detail: "job disappeared" };

  let imported: Awaited<ReturnType<typeof importVersion>>;
  try {
    imported = await importVersion({ ...base, leadId: job.id, quote, sourceFileId: file.id, sha256, actor: IMPORT_ACTOR });
  } catch (error) {
    // Nothing links to the copy yet: remove it, or every retry leaves another one on the job.
    await deleteFile(file.id, IMPORT_ACTOR).catch((cleanup) => console.error("Could not remove the unimported Dealer Copy", cleanup));
    throw error;
  }
  if (!imported) {
    // Another run recorded this message first: its version owns its own copy, so this one goes.
    await deleteFile(file.id, IMPORT_ACTOR);
    return { outcome: "unchanged", leadId: job.id, detail: "already processed" };
  }
  const result: Result = { outcome: "imported", leadId: job.id, detail: null, version: imported.version };
  await tell(result, quote.quoteNo, formatOptionNo(job.projectNo, quote.option));
  return result;
}

/** One run over support@. The mark advances only when every message was handled. */
export async function pollMailbox(now = new Date()): Promise<{ seen: number; results: { messageId: string; outcome: ImportOutcome }[] }> {
  const { lastPolledAt } = await getDcSettings();
  const since = new Date((lastPolledAt?.getTime() ?? now.getTime() - FIRST_RUN_LOOKBACK_MS) - OVERLAP_MS);
  const messages = await listCandidateMessages(since);
  const results: { messageId: string; outcome: ImportOutcome }[] = [];
  const stale: { quoteNo: string | null; receivedAt: Date }[] = [];
  let failed = false;
  for (const message of messages) {
    try {
      if (await isProcessed(message.internetMessageId)) continue;
      const attachments = await htmlAttachments(message.id);
      // Exactly one .html attachment, and that one within the size limit, or the message is unreadable.
      const bytes = attachments.length === 1 ? attachments[0].bytes : null;
      if (!bytes) {
        const detail = attachments.length === 1 ? "HTML attachment over 1 MB or empty" : `${attachments.length} HTML attachments`;
        await recordOutcome({ messageId: message.internetMessageId, receivedAt: message.receivedAt, outcome: "unreadable", leadId: null, dcQuoteNo: null, detail });
        results.push({ messageId: message.internetMessageId, outcome: "unreadable" });
        continue;
      }
      const { outcome } = await importDealerCopy({ internetMessageId: message.internetMessageId, receivedAt: message.receivedAt, html: bytes.toString("utf8") });
      results.push({ messageId: message.internetMessageId, outcome });
    } catch (error) {
      // Not recorded: the next run retries it. The mark does not advance past it.
      console.error(`DC import failed for ${message.internetMessageId}`, error);
      results.push({ messageId: message.internetMessageId, outcome: "failed" });
      failed = true;
      if (now.getTime() - message.receivedAt.getTime() > STALE_FAILURE_MS) {
        stale.push({ quoteNo: DC_SUBJECT.exec(message.subject)?.[1] ?? null, receivedAt: message.receivedAt });
      }
    }
  }
  if (stale.length > 0) {
    // One email per run, however many are stuck. Still not recorded, so each keeps being retried.
    await notifyOwners(staleFailuresEmail(stale)).catch((error) => console.error("DC import failure warning email failed", error));
  }
  if (!failed) await setLastPolledAt(now);
  return { seen: messages.length, results };
}
