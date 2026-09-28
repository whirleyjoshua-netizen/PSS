import "server-only";
import { createHash } from "node:crypto";
import { createFile, deleteFile } from "@/lib/admin/files";
import { formatProjectNo } from "@/lib/portal/project-no";
import { IMPORT_ACTOR } from "./config";
import { htmlAttachments, listCandidateMessages } from "./mailbox";
import { importEmail, notifyOwners } from "./notify";
import { parseDealerCopy } from "./parse";
import { findJobByProjectNo, getDcSettings, importVersion, isProcessed, latestSha, recordOutcome, setLastPolledAt } from "./store";
import type { ImportOutcome } from "./types";

type Result = { outcome: ImportOutcome; leadId: string | null; detail: string | null; version?: number };
const OVERLAP_MS = 60 * 60 * 1000;
const FIRST_RUN_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

async function tell(result: Result, dcQuoteNo: string | null, projectNo: number | null) {
  const email = importEmail({ ...result, dcQuoteNo, projectNo: formatProjectNo(projectNo), jobId: result.leadId });
  if (email) await notifyOwners(email).catch((error) => console.error("DC import email failed", error));
}

/** One Dealer Copy, already known to come from DC. Never throws for a bad document, only for I/O. */
export async function importDealerCopy(input: { internetMessageId: string; receivedAt: Date; html: string }): Promise<Result> {
  if (await isProcessed(input.internetMessageId)) return { outcome: "unchanged", leadId: null, detail: "already processed" };
  const base = { messageId: input.internetMessageId, receivedAt: input.receivedAt };

  const parsed = parseDealerCopy(input.html);
  if (!parsed.ok) {
    const result: Result = { outcome: parsed.refusal.outcome, leadId: null, detail: parsed.refusal.detail };
    await recordOutcome({ ...base, outcome: result.outcome, leadId: null, dcQuoteNo: null, detail: result.detail });
    await tell(result, null, null);
    return result;
  }
  const quote = parsed.quote;
  // The release gate: the job is found by the exact PSS number in PO Reference, or not at all.
  const job = await findJobByProjectNo(quote.projectNo);
  if (!job) {
    const result: Result = { outcome: "no-match", leadId: null, detail: quote.poReference };
    await recordOutcome({ ...base, outcome: "no-match", leadId: null, dcQuoteNo: quote.quoteNo, detail: quote.poReference });
    await tell(result, quote.quoteNo, null);
    return result;
  }

  const sha256 = createHash("sha256").update(input.html).digest("hex");
  if ((await latestSha(job.id)) === sha256) {
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
  await tell(result, quote.quoteNo, job.projectNo);
  return result;
}

/** One run over support@. The mark advances only when every message was handled. */
export async function pollMailbox(now = new Date()): Promise<{ seen: number; results: { messageId: string; outcome: ImportOutcome }[] }> {
  const { lastPolledAt } = await getDcSettings();
  const since = new Date((lastPolledAt?.getTime() ?? now.getTime() - FIRST_RUN_LOOKBACK_MS) - OVERLAP_MS);
  const messages = await listCandidateMessages(since);
  const results: { messageId: string; outcome: ImportOutcome }[] = [];
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
    }
  }
  if (!failed) await setLastPolledAt(now);
  return { seen: messages.length, results };
}
