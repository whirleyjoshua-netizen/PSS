// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const afterCbs: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { afterCbs.push(cb); } }));
const deposits = { markStripeDepositPaid: vi.fn(), expireDeposit: vi.fn(), depositBySession: vi.fn() };
vi.mock("@/lib/payments/deposits", () => deposits);
const emails = { sendDepositReceipts: vi.fn(), alertUnmatchedPayment: vi.fn() };
vi.mock("@/lib/payments/emails", () => emails);
// verifyWebhook stays real: the tests sign bodies. Only the calls that would reach Stripe are stubbed.
const stripeCalls = { closeCheckout: vi.fn(), stripeClient: vi.fn() };
vi.mock("@/lib/payments/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/stripe")>()),
  ...stripeCalls,
}));

const { POST } = await import("@/app/api/stripe/webhook/route");

const SECRET = "whsec_unit_test";
const DEPOSIT = "5d1f6a2e-3b4c-4d5e-8f60-7a8b9c0d1e2f";
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const VERSION = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const signer = new Stripe("sk_test_unit");
const session = (over: Record<string, unknown> = {}) => ({
  id: "cs_test_1", object: "checkout.session", payment_status: "paid", amount_total: 92417, payment_intent: "pi_test_1",
  metadata: { depositId: DEPOSIT, leadId: LEAD }, ...over,
});
const event = (type: string, object: object) => JSON.stringify({ id: `evt_${type}`, object: "event", type, data: { object } });
const signed = (body: string, secret = SECRET) => signer.webhooks.generateTestHeaderString({ payload: body, secret });
const post = (body: string, signature: string | null = signed(body)) =>
  POST(new Request("http://localhost/api/stripe/webhook", {
    method: "POST", body, headers: signature === null ? {} : { "stripe-signature": signature },
  }));
const runAfter = async () => { for (const cb of afterCbs.splice(0)) await cb(); };
const paidRow = { id: DEPOSIT, status: "paid", stripeSessionId: "cs_test_1", amountCents: 92417 };
const marked = (over: Record<string, unknown> = {}) => ({ leadId: LEAD, versionId: VERSION, stageBefore: "signed", otherSessionIds: [], ...over });
const STRIPE = { fake: "client" };

beforeEach(() => {
  afterCbs.length = 0;
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit");
  for (const fn of [...Object.values(deposits), ...Object.values(emails), ...Object.values(stripeCalls)]) fn.mockReset();
  deposits.markStripeDepositPaid.mockResolvedValue(marked());
  deposits.expireDeposit.mockResolvedValue(true);
  deposits.depositBySession.mockResolvedValue(null);
  emails.sendDepositReceipts.mockResolvedValue(undefined);
  emails.alertUnmatchedPayment.mockResolvedValue(undefined);
  stripeCalls.stripeClient.mockReturnValue(STRIPE);
  stripeCalls.closeCheckout.mockResolvedValue("closed");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/stripe/webhook", () => {
  it("refuses a body that does not verify with 400 and applies nothing", async () => {
    const body = event("checkout.session.completed", session());
    const refusals = [
      await post(body, signed(body, "whsec_someone_else")),
      await post(body, null),
      await post(body, "t=1,v1=deadbeef"),
      await post(body.replace("92417", "1"), signed(body)),
    ];
    for (const response of refusals) expect(response.status).toBe(400);
    expect(deposits.markStripeDepositPaid).not.toHaveBeenCalled();
    expect(deposits.expireDeposit).not.toHaveBeenCalled();
  });

  it("answers 500 without verifying or writing when STRIPE_WEBHOOK_SECRET is not set, naming only the variable (P13)", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const body = event("checkout.session.completed", session());
    expect((await post(body, signed(body))).status).toBe(500);
    expect(deposits.markStripeDepositPaid).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("STRIPE_WEBHOOK_SECRET is not set");
  });

  it("logs the missing STRIPE_SECRET_KEY instead of silently skipping the close of other checkouts", async () => {
    stripeCalls.stripeClient.mockReturnValue(null);
    deposits.markStripeDepositPaid.mockResolvedValue(marked({ otherSessionIds: ["cs_other_1"] }));
    expect((await post(event("checkout.session.completed", session()))).status).toBe(200);
    await runAfter();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("STRIPE_SECRET_KEY is not set"));
    expect(emails.sendDepositReceipts).toHaveBeenCalledTimes(1);
  });

  it("marks the deposit paid for a completed, paid checkout, then sends the receipts after answering", async () => {
    const response = await post(event("checkout.session.completed", session()));
    expect(response.status).toBe(200);
    expect(deposits.markStripeDepositPaid).toHaveBeenCalledWith({
      depositId: DEPOSIT, sessionId: "cs_test_1", paymentIntentId: "pi_test_1", amountCents: 92417,
    });
    expect(emails.sendDepositReceipts).not.toHaveBeenCalled();
    await runAfter();
    expect(emails.sendDepositReceipts).toHaveBeenCalledWith(LEAD, { stageBefore: "signed" });
    expect(stripeCalls.closeCheckout).not.toHaveBeenCalled();
  });

  it("tells the receipts the job was not in Signed when the payment lands on a job moved elsewhere (P11c)", async () => {
    deposits.markStripeDepositPaid.mockResolvedValue(marked({ stageBefore: "lost" }));
    expect((await post(event("checkout.session.completed", session()))).status).toBe(200);
    await runAfter();
    expect(emails.sendDepositReceipts).toHaveBeenCalledWith(LEAD, { stageBefore: "lost" });
    expect(emails.alertUnmatchedPayment).not.toHaveBeenCalled();
  });

  it("closes, after answering, every other open checkout the payment expired on the version (P11a)", async () => {
    deposits.markStripeDepositPaid.mockResolvedValue(marked({ otherSessionIds: ["cs_other_1", "cs_other_2"] }));
    expect((await post(event("checkout.session.completed", session()))).status).toBe(200);
    expect(stripeCalls.closeCheckout).not.toHaveBeenCalled();
    await runAfter();
    expect(stripeCalls.closeCheckout).toHaveBeenCalledWith(STRIPE, "cs_other_1");
    expect(stripeCalls.closeCheckout).toHaveBeenCalledWith(STRIPE, "cs_other_2");
    expect(stripeCalls.closeCheckout).not.toHaveBeenCalledWith(STRIPE, "cs_test_1");
    expect(emails.sendDepositReceipts).toHaveBeenCalledTimes(1);
  });

  it("never fails the payment or the receipts when closing another checkout fails", async () => {
    deposits.markStripeDepositPaid.mockResolvedValue(marked({ otherSessionIds: ["cs_other_1", "cs_other_2"] }));
    stripeCalls.closeCheckout.mockRejectedValueOnce(new Error("stripe down"));
    expect((await post(event("checkout.session.completed", session()))).status).toBe(200);
    await expect(runAfter()).resolves.toBeUndefined();
    expect(stripeCalls.closeCheckout).toHaveBeenCalledTimes(2);
    expect(emails.sendDepositReceipts).toHaveBeenCalledWith(LEAD, { stageBefore: "signed" });
  });

  it("waits on a completed checkout whose bank payment has not cleared", async () => {
    expect((await post(event("checkout.session.completed", session({ payment_status: "unpaid" })))).status).toBe(200);
    expect(deposits.markStripeDepositPaid).not.toHaveBeenCalled();
  });

  it("marks it paid when the delayed payment succeeds", async () => {
    await post(event("checkout.session.async_payment_succeeded", session()));
    expect(deposits.markStripeDepositPaid).toHaveBeenCalledTimes(1);
  });

  it("expires the pending deposit of an expired checkout, and nothing else", async () => {
    expect((await post(event("checkout.session.expired", session({ payment_status: "unpaid" })))).status).toBe(200);
    expect(deposits.expireDeposit).toHaveBeenCalledWith("cs_test_1");
    expect(deposits.markStripeDepositPaid).not.toHaveBeenCalled();
  });

  it("changes nothing and emails nobody for a duplicate delivery of a payment already applied", async () => {
    deposits.markStripeDepositPaid.mockResolvedValue(null);
    deposits.depositBySession.mockResolvedValue(paidRow);
    expect((await post(event("checkout.session.completed", session()))).status).toBe(200);
    await runAfter();
    expect(deposits.depositBySession).toHaveBeenCalledWith("cs_test_1");
    expect(emails.sendDepositReceipts).not.toHaveBeenCalled();
    expect(emails.alertUnmatchedPayment).not.toHaveBeenCalled();
    expect(stripeCalls.closeCheckout).not.toHaveBeenCalled();
  });

  it("emails nobody for a late delivery of a payment already recorded and since refunded", async () => {
    deposits.markStripeDepositPaid.mockResolvedValue(null);
    deposits.depositBySession.mockResolvedValue({ ...paidRow, status: "refunded" });
    expect((await post(event("checkout.session.completed", session()))).status).toBe(200);
    await runAfter();
    expect(emails.alertUnmatchedPayment).not.toHaveBeenCalled();
    expect(emails.sendDepositReceipts).not.toHaveBeenCalled();
  });

  it("alerts the owners when a card payment lands on a deposit already recorded by hand", async () => {
    deposits.markStripeDepositPaid.mockResolvedValue(null);
    deposits.depositBySession.mockResolvedValue({ ...paidRow, status: "expired" });
    expect((await post(event("checkout.session.completed", session()))).status).toBe(200);
    await runAfter();
    expect(emails.alertUnmatchedPayment).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "cs_test_1", amountCents: 92417, depositId: DEPOSIT, reason: expect.stringContaining("recorded by hand"),
    }));
    expect(emails.sendDepositReceipts).not.toHaveBeenCalled();
  });

  it("alerts the owners to refund a second payment when the version is already paid and this checkout's row is still pending (P11b)", async () => {
    deposits.markStripeDepositPaid.mockResolvedValue(null);
    deposits.depositBySession.mockResolvedValue({ ...paidRow, status: "pending" });
    await post(event("checkout.session.completed", session()));
    await runAfter();
    expect(emails.alertUnmatchedPayment).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "cs_test_1", reason: expect.stringContaining("Refund this card payment"),
    }));
  });

  it("alerts the owners when the amount charged is not the deposit", async () => {
    deposits.markStripeDepositPaid.mockResolvedValue(null);
    deposits.depositBySession.mockResolvedValue({ ...paidRow, status: "pending", amountCents: 90000 });
    await post(event("checkout.session.completed", session()));
    await runAfter();
    expect(emails.alertUnmatchedPayment).toHaveBeenCalledWith(expect.objectContaining({
      reason: "The card paid $924.17 but the deposit is $900.",
    }));
  });

  it("alerts the owners when no deposit row holds this checkout", async () => {
    deposits.markStripeDepositPaid.mockResolvedValue(null);
    await post(event("checkout.session.completed", session()));
    await runAfter();
    expect(emails.alertUnmatchedPayment).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "cs_test_1", depositId: DEPOSIT, reason: "No deposit matched this payment.",
    }));
  });

  it("alerts, without writing, when a paid checkout names no deposit", async () => {
    await post(event("checkout.session.completed", session({ metadata: {} })));
    await runAfter();
    expect(deposits.markStripeDepositPaid).not.toHaveBeenCalled();
    expect(emails.alertUnmatchedPayment).toHaveBeenCalledWith(expect.objectContaining({ depositId: null }));
  });

  it("still answers 200 when the alert email fails", async () => {
    deposits.markStripeDepositPaid.mockResolvedValue(null);
    emails.alertUnmatchedPayment.mockRejectedValue(new Error("resend down"));
    expect((await post(event("checkout.session.completed", session()))).status).toBe(200);
    await expect(runAfter()).resolves.toBeUndefined();
  });

  it("answers 500 when the database fails, so Stripe retries", async () => {
    deposits.markStripeDepositPaid.mockRejectedValue(new Error("db down"));
    expect((await post(event("checkout.session.completed", session()))).status).toBe(500);
  });

  it("acknowledges an event it does not handle", async () => {
    expect((await post(event("payment_intent.succeeded", { id: "pi_1", object: "payment_intent" }))).status).toBe(200);
    expect(deposits.markStripeDepositPaid).not.toHaveBeenCalled();
    expect(deposits.expireDeposit).not.toHaveBeenCalled();
  });
});
