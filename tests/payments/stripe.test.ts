// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const { closeCheckout, refundPayment, stripeApiOverride, stripeClient, verifyWebhook } = await import("@/lib/payments/stripe");

const signer = new Stripe("sk_test_unit");
const payload = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.expired", data: { object: { id: "cs_1", object: "checkout.session" } } });
const sign = (body: string, secret: string) => signer.webhooks.generateTestHeaderString({ payload: body, secret });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.unstubAllEnvs());

describe("stripeClient", () => {
  it("is null without a secret key", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(stripeClient()).toBeNull();
  });
  it("is a client with a key", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit");
    expect(stripeClient()).toBeInstanceOf(Stripe);
  });
});

describe("stripeApiOverride", () => {
  it("honours a local test server only", () => {
    vi.stubEnv("STRIPE_API_URL", "http://127.0.0.1:3198");
    expect(stripeApiOverride()).toEqual({ host: "127.0.0.1", port: 3198, protocol: "http" });
    vi.stubEnv("STRIPE_API_URL", "http://localhost:4000");
    expect(stripeApiOverride()).toEqual({ host: "localhost", port: 4000, protocol: "http" });
  });
  it("ignores anything else, so a stray variable can never send payments elsewhere", () => {
    vi.stubEnv("STRIPE_API_URL", "https://api.example.com");
    expect(stripeApiOverride()).toBeNull();
    vi.stubEnv("STRIPE_API_URL", "http://localhost@evil.com");
    expect(stripeApiOverride()).toBeNull();
    vi.stubEnv("STRIPE_API_URL", "http://127.0.0.1@evil.com:3198");
    expect(stripeApiOverride()).toBeNull();
    vi.stubEnv("STRIPE_API_URL", "not a url");
    expect(stripeApiOverride()).toBeNull();
    vi.stubEnv("STRIPE_API_URL", "");
    expect(stripeApiOverride()).toBeNull();
  });
});

describe("verifyWebhook", () => {
  it("returns the event for a body signed with the webhook secret", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_unit");
    expect(verifyWebhook(payload, sign(payload, "whsec_unit")).type).toBe("checkout.session.expired");
  });
  it("throws for another secret, a changed body, or no header", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_unit");
    expect(() => verifyWebhook(payload, sign(payload, "whsec_other"))).toThrow();
    expect(() => verifyWebhook(`${payload} `, sign(payload, "whsec_unit"))).toThrow();
    expect(() => verifyWebhook(payload, null)).toThrow();
  });
  it("refuses everything when the webhook secret is not set", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(() => verifyWebhook(payload, sign(payload, "whsec_unit"))).toThrow("STRIPE_WEBHOOK_SECRET is not set");
  });
});

/** Only the three calls these helpers make. */
function fakeStripe(session: { status: string } | Error, expire?: Error) {
  const retrieve = vi.fn(async (_id: string) => { if (session instanceof Error) throw session; return session; });
  const expireFn = vi.fn(async (_id: string) => { if (expire) throw expire; return { status: "expired" }; });
  const create = vi.fn(async (_params: unknown, _options: unknown) => ({ id: "re_1", status: "succeeded" }));
  const client = { checkout: { sessions: { retrieve, expire: expireFn } }, refunds: { create } };
  return { client: client as unknown as Stripe, retrieve, expire: expireFn, create };
}

describe("closeCheckout", () => {
  it("answers paid for a completed checkout, and leaves it alone", async () => {
    const fake = fakeStripe({ status: "complete" });
    expect(await closeCheckout(fake.client, "cs_1")).toBe("paid");
    expect(fake.expire).not.toHaveBeenCalled();
  });
  it("expires an open checkout", async () => {
    const fake = fakeStripe({ status: "open" });
    expect(await closeCheckout(fake.client, "cs_1")).toBe("closed");
    expect(fake.expire).toHaveBeenCalledWith("cs_1");
  });
  it("answers closed for one already expired", async () => {
    expect(await closeCheckout(fakeStripe({ status: "expired" }).client, "cs_1")).toBe("closed");
  });
  it("answers unknown when Stripe cannot be asked, or refuses to expire it (it completed meanwhile)", async () => {
    expect(await closeCheckout(null, "cs_1")).toBe("unknown");
    expect(await closeCheckout(fakeStripe(new Error("down")).client, "cs_1")).toBe("unknown");
    expect(await closeCheckout(fakeStripe({ status: "open" }, new Error("only open sessions")).client, "cs_1")).toBe("unknown");
  });
});

describe("refundPayment", () => {
  it("refunds the whole payment, once per deposit however often it is pressed", async () => {
    const fake = fakeStripe({ status: "complete" });
    expect(await refundPayment(fake.client, "pi_1", "d1")).toBe(true);
    expect(fake.create).toHaveBeenCalledWith({ payment_intent: "pi_1" }, { idempotencyKey: "refund-d1" });
  });
  it("answers false when Stripe refuses or is not configured", async () => {
    const fake = fakeStripe({ status: "complete" });
    fake.create.mockRejectedValueOnce(new Error("refused"));
    expect(await refundPayment(fake.client, "pi_1", "d1")).toBe(false);
    expect(await refundPayment(null, "pi_1", "d1")).toBe(false);
  });
  // Ruling P16: a retry after Stripe's 24-hour idempotency window finds the charge already refunded.
  it("answers true when Stripe says the charge is already refunded", async () => {
    const fake = fakeStripe({ status: "complete" });
    fake.create.mockRejectedValueOnce(new Stripe.errors.StripeInvalidRequestError({
      message: "Charge ch_1 has already been refunded.", code: "charge_already_refunded", type: "invalid_request_error",
    }));
    expect(await refundPayment(fake.client, "pi_1", "d1")).toBe(true);
    fake.create.mockRejectedValueOnce(new Stripe.errors.StripeInvalidRequestError({
      message: "No such payment_intent", code: "resource_missing", type: "invalid_request_error",
    }));
    expect(await refundPayment(fake.client, "pi_1", "d1")).toBe(false);
  });
});
