import "server-only";
import type Stripe from "stripe";
import type { Job } from "@/lib/admin/jobs";
import { normalizeEmail } from "@/lib/portal/access";
import { portalOrigin } from "@/lib/portal/login";
import { formatProjectNo } from "@/lib/portal/project-no";
import {
  attachSession, claimStripeDeposit, depositState, expireDeposit, expirePendingOnOtherVersions, expireSessionlessDeposit, expireStaleDeposits,
  pendingStripeDeposit, type Deposit,
} from "./deposits";
import { payPath } from "./pay-link";
import { closeCheckout, isMissingAtStripe, stripeClient } from "./stripe";

export type CheckoutJob = Pick<Job, "id" | "projectNo" | "status" | "email">;

/** "changed": the row was expired or the deposit recorded while the session opened (ruling P15); the page shows the truth. */
export type StartDepositResult = { url: string } | "not-found" | "not-due" | "paid" | "processing" | "unavailable" | "changed";

/** Stripe closes the session this long after the deposit row was created: before expireStaleDeposits' 23-hour cutoff (ruling P11a). */
const CHECKOUT_SECONDS = 22 * 3600;
/** Stripe refuses an expires_at under 30 minutes away; a row closer than this is replaced instead (ruling P14). */
const MIN_REMAINING_SECONDS = 35 * 60;

/**
 * Derived from the row, not the clock (ruling P14), so every tap for one row sends identical parameters
 * under its idempotency key: Stripe refuses a reused key with different parameters.
 */
const checkoutExpiresAt = (deposit: Deposit): number => Math.floor(deposit.createdAt.getTime() / 1000) + CHECKOUT_SECONDS;

/**
 * One deposit row, one Checkout Session: the same row always produces the same parameters. Cards only
 * (Apple Pay and Google Pay arrive as cards), and the session expires 22 hours after the row was created,
 * so a row the 23-hour stale cutoff gives up has no payable session left.
 */
function checkoutParams(job: CheckoutJob, deposit: Deposit, payPage: string): Stripe.Checkout.SessionCreateParams {
  const origin = portalOrigin();
  const projectNo = formatProjectNo(job.projectNo) ?? "PSS";
  const email = normalizeEmail(job.email);
  return {
    mode: "payment",
    ...(email ? { customer_email: email } : {}),
    payment_method_types: ["card"],
    expires_at: checkoutExpiresAt(deposit),
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: deposit.amountCents, product_data: { name: `50% deposit — ${projectNo}` } } }],
    metadata: { depositId: deposit.id, leadId: job.id },
    payment_intent_data: { metadata: { depositId: deposit.id, leadId: job.id } },
    // Both land on the pay page, whoever started the payment: the same row must send the same parameters
    // under its idempotency key. A signed-in client is sent on from there to their project page.
    success_url: `${origin}${payPage}?paid=1`,
    cancel_url: `${origin}${payPage}`,
  };
}

/**
 * Opens (or re-opens) Stripe Checkout for the 50% deposit (spec §4), for the client's project page and for the
 * pay link alike (owner 2026-11-04). The caller has settled who may pay: the portal by the session's own jobs,
 * the pay link by its signature.
 *
 * Settled here, none of it from the request: the stage
 * (Signed), the amount (the signed version's stored total, checked again in the claim statement) and
 * that nothing is paid. Paying is never believed here: only the verified webhook marks it paid.
 *
 * A second tap, a back button or a double click lands on the same checkout (Review Focus 2): the
 * pending row is claimed in one statement, its id is the idempotency key of the Session, and an
 * existing Session is re-read rather than re-created.
 */
export async function openDepositCheckout(job: CheckoutJob): Promise<Exclude<StartDepositResult, "not-found">> {
  const state = await depositState(job.id);
  if (state?.paid) return "paid";
  if (job.status !== "signed" || !state || state.versionStatus !== "signed" || state.jobStatus !== "signed") return "not-due";
  const stripe = stripeClient();
  const payPage = payPath(job.id);
  if (!stripe || !payPage) return "unavailable";

  // Ruling P20: a checkout opened on an older version (before a change order was signed) is given up and
  // closed in Stripe, so only this version's deposit can be paid. Closing is best-effort: a payment that
  // completes anyway reaches the webhook, which still records it.
  for (const sessionId of await expirePendingOnOtherVersions(job.id, state.versionId)) {
    try {
      await closeCheckout(stripe, sessionId);
    } catch (error) {
      console.error(`Could not close Checkout Session ${sessionId}`, error);
    }
  }
  await expireStaleDeposits(state.versionId);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const deposit = (await claimStripeDeposit({ leadId: job.id, versionId: state.versionId, amountCents: state.amountCents }))
      ?? (await pendingStripeDeposit(state.versionId));
    if (!deposit) return "not-due";
    // A row that never got a session and is too old for one to open: give it up and claim a fresh one.
    if (!deposit.stripeSessionId && checkoutExpiresAt(deposit) < Math.floor(Date.now() / 1000) + MIN_REMAINING_SECONDS) {
      await expireSessionlessDeposit(deposit.id);
      continue;
    }
    let session: Stripe.Checkout.Session;
    try {
      session = deposit.stripeSessionId
        ? await stripe.checkout.sessions.retrieve(deposit.stripeSessionId)
        : await stripe.checkout.sessions.create(checkoutParams(job, deposit, payPage), { idempotencyKey: `deposit-${deposit.id}` });
    } catch (error) {
      // A checkout opened under the other mode's key (test, before the switch to live): give the row up and claim a fresh one.
      if (deposit.stripeSessionId && isMissingAtStripe(error)) {
        await expireDeposit(deposit.stripeSessionId);
        continue;
      }
      console.error(`Could not open card checkout for deposit ${deposit.id}`, error);
      return "unavailable";
    }
    if (session.status === "complete") return "processing";
    if (session.status === "open" && session.url) {
      if (await attachSession(deposit.id, session.id)) return { url: session.url };
      // Ruling P15: the row stopped being pending meanwhile (expired, or the owner recorded the deposit).
      // Close this session so it can never take a second payment, and send the client nowhere near it.
      try {
        await closeCheckout(stripe, session.id);
      } catch (error) {
        console.error(`Could not close Checkout Session ${session.id}`, error);
      }
      return "changed";
    }
    // Expired at Stripe: give the row up and claim a fresh one.
    await expireDeposit(session.id);
  }
  return "unavailable";
}
