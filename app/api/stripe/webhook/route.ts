import { after } from "next/server";
import type Stripe from "stripe";
import { isUuid } from "@/lib/admin/ids";
import { formatCents } from "@/lib/admin/money";
import { depositBySession, expireDeposit, markStripeDepositPaid } from "@/lib/payments/deposits";
import { alertUnmatchedPayment, sendDepositReceipts } from "@/lib/payments/emails";
import { closeCheckout, stripeClient, verifyWebhook } from "@/lib/payments/stripe";

/**
 * Stripe calls this for checkout.session.completed, .async_payment_succeeded and .expired (Rollout step 1).
 *
 * The body is read raw: the signature covers the exact bytes, and a body that does not verify is refused
 * with 400 before anything is read from it. Every write acts only on a pending (or, for its own session,
 * expired) deposit, so a duplicate or late delivery changes nothing twice (Review Focus 1). Emails and
 * Stripe calls run in after(), so Stripe gets its 2xx fast. A database failure answers 500, which makes
 * Stripe retry.
 */
export async function POST(request: Request) {
  // Ruling P13: without the secret nothing can verify. That is our misconfiguration, not a bad sender:
  // answer 500 so Stripe keeps retrying until it is set. The variable is named, its value never logged.
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return new Response("Webhook is not configured", { status: 500 });
  }
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = verifyWebhook(body, request.headers.get("stripe-signature"));
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await settle(event.data.object);
    } else if (event.type === "checkout.session.expired") {
      await expireDeposit(event.data.object.id);
    }
  } catch (error) {
    console.error(`Stripe event ${event.id} (${event.type}) could not be applied`, error);
    return new Response("Could not apply the event", { status: 500 });
  }
  return new Response(null, { status: 200 });
}

/**
 * A paid Checkout Session marks its deposit paid. Unpaid (a bank payment clearing) waits for
 * async_payment_succeeded. A paid session PSS cannot apply is never kept silently nor refunded
 * automatically: the owners are emailed to check it in Stripe (ruling P11b).
 */
async function settle(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") return;
  const depositId = session.metadata?.depositId ?? "";
  const amountCents = session.amount_total;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const alert = (reason: string) =>
    after(() => alertUnmatchedPayment({ sessionId: session.id, amountCents, depositId: isUuid(depositId) ? depositId : null, reason }).catch(console.error));

  if (!isUuid(depositId) || amountCents === null) {
    alert("The payment names no deposit PSS knows.");
    return;
  }
  const paid = await markStripeDepositPaid({ depositId, sessionId: session.id, paymentIntentId, amountCents });
  if (paid) {
    after(() => sendDepositReceipts(paid.leadId, { stageBefore: paid.stageBefore }).catch(console.error));
    // Ruling P11a: the other checkouts this payment expired are closed in Stripe too, so the client
    // cannot pay twice. Best-effort: closeCheckout logs its own failures, and one that completed
    // meanwhile arrives as its own event and is alerted below.
    if (paid.otherSessionIds.length > 0) {
      after(async () => {
        const stripe = stripeClient();
        if (!stripe) console.error("STRIPE_SECRET_KEY is not set: the other open checkouts of this deposit were not closed in Stripe");
        for (const other of paid.otherSessionIds) await closeCheckout(stripe, other).catch(console.error);
      });
    }
    return;
  }
  // depositBySession finds the row holding THIS session. Paid (or since refunded) means this very
  // payment is already recorded: a repeat delivery, the common case, and nothing to say.
  const existing = await depositBySession(session.id);
  if (existing?.status === "paid" || existing?.status === "refunded") return;
  if (!existing) alert("No deposit matched this payment.");
  else if (existing.amountCents !== amountCents) alert(`The card paid ${formatCents(amountCents)} but the deposit is ${formatCents(existing.amountCents)}.`);
  else alert(`This job's deposit was already paid when this card payment arrived — recorded by hand, or through another checkout (this checkout's deposit is ${existing.status}). Refund this card payment if it is a second payment.`);
}
