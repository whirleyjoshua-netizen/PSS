import "server-only";
import { createFile, deleteFile } from "@/lib/admin/files";
import { formatOptionNo } from "@/lib/portal/project-no";
import { IMPORT_ACTOR } from "./config";
import { notifyOwners, orderEmail, orderRefusalEmail } from "./notify";
import { parseOrderConfirmation, parseOrderReceipt } from "./order-parse";
import { orderRecorded, recordOrder, recordReceipt } from "./order-store";
import { findJobByProjectNo, isProcessed, quoteOptionExists, recordOutcome } from "./store";
import type { ImportOutcome } from "./types";

type Result = { outcome: ImportOutcome; leadId: string | null; detail: string | null };

/** The job a PO names, by the same release gate as a Dealer Copy: the exact printed number, and an option that was added. */
async function jobFor(poReference: string, projectNo: number, option: string): Promise<{ id: string } | null> {
  const found = await findJobByProjectNo(projectNo);
  if (!found || formatOptionNo(found.projectNo, option) !== poReference) return null;
  return (await quoteOptionExists(found.id, option)) ? found : null;
}

const tell = (email: { subject: string; text: string }) =>
  notifyOwners(email).catch((error) => console.error("DC order email failed", error));

/**
 * HD's order confirmation: recorded on the PO's job, which moves to Ordered from Signed, Sold or Official measure.
 * Never throws for a bad email, only for I/O. `pdf` is HD's printable copy, filed on the job when there is one.
 */
export async function importOrderConfirmation(input: { internetMessageId: string; receivedAt: Date; html: string; pdf: { name: string; bytes: Buffer } | null }): Promise<Result> {
  if (await isProcessed(input.internetMessageId)) return { outcome: "unchanged", leadId: null, detail: "already processed" };
  const base = { messageId: input.internetMessageId, receivedAt: input.receivedAt };

  const parsed = parseOrderConfirmation(input.html);
  if (!parsed.ok) {
    await recordOutcome({ ...base, outcome: parsed.outcome, leadId: null, dcQuoteNo: null, detail: parsed.detail, poReference: parsed.poReference ?? null });
    await tell(orderRefusalEmail({ outcome: parsed.outcome, orderNo: parsed.orderNo ?? null, detail: parsed.detail }));
    return { outcome: parsed.outcome, leadId: null, detail: parsed.detail };
  }
  const order = parsed.order;
  const job = await jobFor(order.poReference, order.projectNo, order.option);
  if (!job) {
    await recordOutcome({ ...base, outcome: "no-match", leadId: null, dcQuoteNo: null, detail: order.poReference, poReference: order.poReference });
    await tell(orderRefusalEmail({ outcome: "no-match", orderNo: order.orderNo, detail: order.poReference }));
    return { outcome: "no-match", leadId: null, detail: order.poReference };
  }
  if (await orderRecorded(order.orderNo)) {
    // The same order again (HD re-sent it, or it was copied to another folder): nothing to change, nothing to say.
    await recordOutcome({ ...base, outcome: "unchanged", leadId: job.id, dcQuoteNo: null, detail: `HD order ${order.orderNo}`, poReference: order.poReference });
    return { outcome: "unchanged", leadId: job.id, detail: null };
  }

  const file = input.pdf
    ? await createFile({
      leadId: job.id, kind: "document", name: `HD ORDER ${order.orderNo}.pdf`, contentType: "application/pdf",
      body: new Blob([new Uint8Array(input.pdf.bytes)], { type: "application/pdf" }), actor: IMPORT_ACTOR, docType: "hd_order",
    })
    : null;
  // The job was deleted between the match and the upload. Fail the run so the next one sees no job and says so.
  if (input.pdf && !file) throw new Error(`Job for ${order.poReference} disappeared while recording HD order ${order.orderNo}`);

  let recorded: Awaited<ReturnType<typeof recordOrder>>;
  try {
    recorded = await recordOrder({ ...base, leadId: job.id, order, fileId: file?.id ?? null, actor: IMPORT_ACTOR });
  } catch (error) {
    // Nothing links to the PDF yet: remove it, or every retry leaves another one on the job.
    if (file) await deleteFile(file.id, IMPORT_ACTOR).catch((cleanup) => console.error("Could not remove the unrecorded order PDF", cleanup));
    throw error;
  }
  if (!recorded) {
    // Another run recorded this message or order first: its row owns its own PDF, so this one goes.
    if (file) await deleteFile(file.id, IMPORT_ACTOR);
    return { outcome: "unchanged", leadId: job.id, detail: "already processed" };
  }
  await tell(orderEmail({ order, jobId: job.id, fromStatus: recorded.fromStatus, toStatus: recorded.toStatus, quotedCents: recorded.quotedDealerTotalCents }));
  return { outcome: "ordered", leadId: job.id, detail: `HD order ${order.orderNo}` };
}

/**
 * DC's receipt for a submitted order. Kept quietly so a submission HD never confirms can be flagged a day later.
 * A receipt that names no job is recorded without an email: HD's confirmation for it will say so.
 */
export async function importOrderReceipt(input: { internetMessageId: string; receivedAt: Date; html: string }): Promise<Result> {
  if (await isProcessed(input.internetMessageId)) return { outcome: "unchanged", leadId: null, detail: "already processed" };
  const base = { messageId: input.internetMessageId, receivedAt: input.receivedAt };
  const parsed = parseOrderReceipt(input.html);
  if (!parsed.ok) {
    await recordOutcome({ ...base, outcome: parsed.outcome, leadId: null, dcQuoteNo: null, detail: parsed.detail });
    return { outcome: parsed.outcome, leadId: null, detail: parsed.detail };
  }
  const r = parsed.receipt;
  const job = await jobFor(r.poReference, r.projectNo, r.option);
  if (!job) {
    await recordOutcome({ ...base, outcome: "no-match", leadId: null, dcQuoteNo: r.quoteNo, detail: r.poReference });
    return { outcome: "no-match", leadId: null, detail: r.poReference };
  }
  await recordReceipt({ ...base, leadId: job.id, quoteNo: r.quoteNo, poReference: r.poReference });
  return { outcome: "receipt", leadId: job.id, detail: null };
}
