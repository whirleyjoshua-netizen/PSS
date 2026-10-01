"use server";

import { after } from "next/server";
import { getJob } from "@/lib/admin/jobs";
import { dollarsToCents, formatCents } from "@/lib/admin/money";
import { requireAdmin } from "@/lib/admin/session";
import { isRefundableStage } from "@/lib/admin/stages";
import { inCancellationWindow } from "@/lib/docs/business-days";
import { cancelDeposit, depositById, depositState, isRecordedMethod, recordDepositPayment } from "@/lib/payments/deposits";
import { alertUnrecordedRefund, sendCancellationEmails, sendDepositReceipts } from "@/lib/payments/emails";
import { closeCheckout, refundPayment, stripeClient } from "@/lib/payments/stripe";
import { MISSING, refresh } from "../form-state";

/** Postgres unique_violation: on the paid insert only deposits_one_paid_per_version can raise it. */
const UNIQUE_VIOLATION = "23505";

/**
 * "Payment received" (spec §4): the owner records a check, cash or other deposit on a Signed job.
 * An open card checkout is closed at Stripe first; if Stripe says the client already paid by card,
 * nothing is recorded (Review Focus 3).
 */
export async function recordDepositAction(jobId: string, amount: string, method: string): Promise<{ error?: string; ok?: boolean }> {
  const admin = await requireAdmin();
  if (!isRecordedMethod(method)) return { error: "Choose check, cash or other." };
  let amountCents: number | null;
  try {
    amountCents = dollarsToCents(typeof amount === "string" ? amount : "");
  } catch (error) {
    return { error: (error as Error).message };
  }
  if (amountCents === null || amountCents <= 0) return { error: "Enter the amount received." };
  const job = await getJob(jobId);
  if (!job) return MISSING;
  if (job.status !== "signed") return { error: "A deposit is recorded once the contract is signed and before the job is Sold." };
  const state = await depositState(job.id);
  if (!state || state.versionStatus !== "signed") return { error: "This job has no signed contract." };
  if (state.paid) return { error: "The deposit is already recorded." };
  if (amountCents > state.soldCents) return { error: `That is more than the contract total of ${formatCents(state.soldCents)}.` };
  if (state.pending?.stripeSessionId) {
    const closed = await closeCheckout(stripeClient(), state.pending.stripeSessionId);
    if (closed === "paid") return { error: "The client is paying by card right now. Wait for that payment before recording another." };
    if (closed === "unknown") return { error: "Could not check the client's card payment with Stripe. Try again in a minute." };
  }
  let recorded: { depositId: string } | null;
  try {
    recorded = await recordDepositPayment({ leadId: job.id, versionId: state.versionId, amountCents, method, actor: admin.email });
  } catch (error) {
    // Two owners pressed Record payment together: the other insert won the one-paid-per-version index.
    if ((error as { code?: string } | null)?.code === UNIQUE_VIOLATION) return { error: "This deposit is already recorded." };
    throw error;
  }
  if (!recorded) return { error: "The deposit could not be recorded. Reload the page and check the job's stage." };
  after(() => sendDepositReceipts(job.id));
  refresh(job.id);
  return { ok: true };
}

/**
 * "Cancel & refund" (spec §4) on a job with a paid deposit, at any stage before Ordered or at Lost (ruling P21). A card deposit is refunded
 * in full through Stripe first (one idempotency key per deposit); only then is the cancellation
 * recorded, in one statement. A recorded deposit is marked refunded and the owner returns the money.
 */
export async function cancelDepositAction(jobId: string, depositId: string): Promise<{ error?: string; ok?: boolean }> {
  const admin = await requireAdmin();
  const job = await getJob(jobId);
  if (!job) return MISSING;
  if (!isRefundableStage(job.status)) return { error: "Materials are ordered, so this job cannot be cancelled and refunded here." };
  const state = await depositState(job.id);
  const deposit = state?.paid;
  if (!state || !deposit || deposit.id !== depositId) return { error: "This deposit is no longer paid. Reload the page." };
  const card = deposit.method === "stripe";
  if (card) {
    const refunded = deposit.stripePaymentIntentId !== null
      && await refundPayment(stripeClient(), deposit.stripePaymentIntentId, deposit.id);
    if (!refunded) return { error: "Stripe did not refund the card, so nothing was changed. Try again, or refund it in the Stripe dashboard first." };
  }
  let recorded = false;
  let threw = false;
  let failure: unknown = "the statement matched no paid deposit";
  try {
    recorded = await cancelDeposit({ leadId: job.id, deposit, actor: admin.email });
  } catch (error) {
    threw = true;
    failure = error;
  }
  if (!recorded) {
    // Two tabs: the other press recorded this very cancellation first, so this statement RETURNED false.
    // The deposit is refunded on record — the owner's outcome — so nothing is wrong and nobody is alerted.
    // A statement that THREW proves nothing (ruling P23): it keeps the P16 message and alert below.
    const now = threw ? null : await depositById(deposit.id).catch(() => null);
    if (now?.status === "refunded") {
      refresh(job.id);
      return { ok: true };
    }
    console.error(`Deposit ${deposit.id}: the cancellation was not recorded${card ? " after Stripe refunded the card" : ""}`, failure);
    if (!card) return { error: "The cancellation could not be recorded. Reload the page." };
    // Ruling P16: the money has gone back, so say so. Pressing again refunds nothing more (the idempotency
    // key, or Stripe's charge_already_refunded, which refundPayment counts as refunded).
    after(() => alertUnrecordedRefund({ job, depositId: deposit.id, amountCents: deposit.amountCents })
      .catch((error: unknown) => console.error(`Could not alert the owners about deposit ${deposit.id}`, error)));
    return { error: "The card was refunded in Stripe, but PSS could not record the cancellation. Reload and press Cancel & refund again — it will not refund twice." };
  }
  const inWindow = inCancellationWindow(state.signedAt, new Date());
  after(() => sendCancellationEmails({ job, amountCents: deposit.amountCents, method: deposit.method, inWindow, actor: admin.email }));
  refresh(job.id);
  return { ok: true };
}
