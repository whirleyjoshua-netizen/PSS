import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer }));
vi.mock("@/lib/portal/login", () => ({ portalOrigin: () => "https://pss.test" }));
const deposits = {
  depositState: vi.fn(), claimStripeDeposit: vi.fn(), pendingStripeDeposit: vi.fn(), attachSession: vi.fn(),
  expireDeposit: vi.fn(), expireStaleDeposits: vi.fn(),
};
vi.mock("@/lib/payments/deposits", () => deposits);
const create = vi.fn();
const retrieve = vi.fn();
const stripeClient = vi.fn(() => ({ checkout: { sessions: { create, retrieve } } }) as unknown);
vi.mock("@/lib/payments/stripe", () => ({ stripeClient }));
const redirect = vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT ${path}`); });
vi.mock("next/navigation", () => ({ redirect }));

const { startDepositAction, startDepositFormAction } = await import("@/app/(site)/project/deposit-actions");

const MINE = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THEIRS = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const VERSION = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const DEPOSIT = "5d1f6a2e-3b4c-4d5e-8f60-7a8b9c0d1e2f";
const EMAIL = "maria@example.com";
// The clock is frozen so expires_at is exact.
const NOW = new Date("2026-09-30T17:00:00Z");
const EXPIRES_AT = Math.floor(NOW.getTime() / 1000) + 22 * 3600;
const job = { id: MINE, name: "Maria Lopez", projectNo: 1048, status: "signed" };
const state = { jobStatus: "signed", versionId: VERSION, version: 1, versionStatus: "signed", soldCents: 184833, amountCents: 92417,
  signedAt: new Date("2026-09-28T17:00:00Z"), paid: null, pending: null, refunded: null };
const pending = (over: Record<string, unknown> = {}) => ({ id: DEPOSIT, leadId: MINE, versionId: VERSION, amountCents: 92417,
  method: "stripe", status: "pending", stripeSessionId: null, stripePaymentIntentId: null, recordedBy: null,
  createdAt: new Date(), paidAt: null, refundedAt: null, ...over });
const open = { id: "cs_1", status: "open", url: "https://checkout.stripe.test/c/cs_1" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  for (const fn of [...Object.values(deposits), create, retrieve, redirect]) fn.mockClear();
  requireCustomer.mockReset().mockResolvedValue({ email: EMAIL, jobs: [job] });
  deposits.depositState.mockReset().mockResolvedValue(state);
  deposits.claimStripeDeposit.mockReset().mockResolvedValue(pending());
  deposits.pendingStripeDeposit.mockReset().mockResolvedValue(null);
  deposits.attachSession.mockReset().mockResolvedValue(true);
  deposits.expireDeposit.mockReset().mockResolvedValue(true);
  deposits.expireStaleDeposits.mockReset().mockResolvedValue(0);
  create.mockReset().mockResolvedValue(open);
  retrieve.mockReset().mockResolvedValue(open);
  stripeClient.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startDepositAction", () => {
  it("refuses a job the customer does not own before reading anything", async () => {
    expect(await startDepositAction(THEIRS)).toBe("not-found");
    expect(deposits.depositState).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a job that is not Signed, and one whose deposit is paid", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [{ ...job, status: "approved" }] });
    expect(await startDepositAction(MINE)).toBe("not-due");
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [job] });
    deposits.depositState.mockResolvedValue({ ...state, paid: pending({ status: "paid" }) });
    expect(await startDepositAction(MINE)).toBe("paid");
    expect(create).not.toHaveBeenCalled();
    expect(deposits.claimStripeDeposit).not.toHaveBeenCalled();
  });

  it("claims a pending deposit at the stored half and opens Checkout for exactly it", async () => {
    expect(await startDepositAction(MINE)).toEqual({ url: "https://checkout.stripe.test/c/cs_1" });
    expect(deposits.expireStaleDeposits).toHaveBeenCalledWith(VERSION);
    expect(deposits.claimStripeDeposit).toHaveBeenCalledWith({ leadId: MINE, versionId: VERSION, amountCents: 92417 });
    expect(create).toHaveBeenCalledWith({
      mode: "payment",
      customer_email: EMAIL,
      payment_method_types: ["card"],
      expires_at: EXPIRES_AT,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 92417, product_data: { name: "50% deposit — PSS-1048" } } }],
      metadata: { depositId: DEPOSIT, leadId: MINE },
      payment_intent_data: { metadata: { depositId: DEPOSIT, leadId: MINE } },
      success_url: `https://pss.test/project/${MINE}?deposit=done`,
      cancel_url: `https://pss.test/project/${MINE}`,
    }, { idempotencyKey: `deposit-${DEPOSIT}` });
    expect(deposits.attachSession).toHaveBeenCalledWith(DEPOSIT, "cs_1");
  });

  // Ruling P11(a): Stripe closes the session at 22 hours, before the 23-hour local stale cutoff, so a
  // row expireStaleDeposits gives up never still has a payable session behind it.
  it("closes the checkout 22 hours from now, in whole seconds, before the 23-hour stale cutoff", async () => {
    await startDepositAction(MINE);
    const params = create.mock.calls[0][0] as { expires_at: number };
    expect(params.expires_at).toBe(Math.floor(Date.now() / 1000) + 22 * 3600);
    expect(Number.isInteger(params.expires_at)).toBe(true);
    expect(params.expires_at).toBeLessThan(Math.floor(Date.now() / 1000) + 23 * 3600);
  });

  it("takes cards only (Apple Pay and Google Pay arrive as cards)", async () => {
    await startDepositAction(MINE);
    expect((create.mock.calls[0][0] as { payment_method_types: string[] }).payment_method_types).toEqual(["card"]);
  });

  it("reuses the open session of a pending deposit instead of creating another", async () => {
    deposits.claimStripeDeposit.mockResolvedValue(pending({ stripeSessionId: "cs_1" }));
    expect(await startDepositAction(MINE)).toEqual({ url: "https://checkout.stripe.test/c/cs_1" });
    expect(retrieve).toHaveBeenCalledWith("cs_1");
    expect(create).not.toHaveBeenCalled();
  });

  it("says processing, and opens nothing, when the pending checkout already completed", async () => {
    deposits.claimStripeDeposit.mockResolvedValue(pending({ stripeSessionId: "cs_1" }));
    retrieve.mockResolvedValue({ ...open, status: "complete" });
    expect(await startDepositAction(MINE)).toBe("processing");
  });

  it("gives up an expired checkout and opens a fresh one", async () => {
    deposits.claimStripeDeposit
      .mockResolvedValueOnce(pending({ stripeSessionId: "cs_old" }))
      .mockResolvedValueOnce(pending({ id: "6e2f7b3f-4c5d-4e6f-9a71-8b9c0d1e2f3a" }));
    retrieve.mockResolvedValue({ id: "cs_old", status: "expired", url: null });
    expect(await startDepositAction(MINE)).toEqual({ url: "https://checkout.stripe.test/c/cs_1" });
    expect(deposits.expireDeposit).toHaveBeenCalledWith("cs_old");
    expect(create).toHaveBeenCalledWith(expect.anything(), { idempotencyKey: "deposit-6e2f7b3f-4c5d-4e6f-9a71-8b9c0d1e2f3a" });
  });

  // Ruling P8: this proves only our half. That Stripe then opens a single session is Task 10's proof.
  it("sends two concurrent taps on one pending row with the same parameters and one idempotency key (deposit-<id>)", async () => {
    const [a, b] = await Promise.all([startDepositAction(MINE), startDepositAction(MINE)]);
    expect(a).toEqual(b);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
    expect(create.mock.calls[0][1]).toEqual({ idempotencyKey: `deposit-${DEPOSIT}` });
  });

  it("reads the pending row again when a racing claim could not see it", async () => {
    deposits.claimStripeDeposit.mockResolvedValue(null);
    deposits.pendingStripeDeposit.mockResolvedValue(pending());
    expect(await startDepositAction(MINE)).toEqual({ url: "https://checkout.stripe.test/c/cs_1" });
    expect(deposits.pendingStripeDeposit).toHaveBeenCalledWith(VERSION);
  });

  it("answers unavailable when Stripe is not configured or refuses", async () => {
    stripeClient.mockReturnValueOnce(null);
    expect(await startDepositAction(MINE)).toBe("unavailable");
    create.mockRejectedValueOnce(new Error("stripe down"));
    expect(await startDepositAction(MINE)).toBe("unavailable");
  });
});

describe("startDepositFormAction", () => {
  const form = (jobId: string) => { const data = new FormData(); data.set("jobId", jobId); return data; };
  it("sends the client to Stripe", async () => {
    await expect(startDepositFormAction(form(MINE))).rejects.toThrow("NEXT_REDIRECT https://checkout.stripe.test/c/cs_1");
  });
  it("brings a refusal back to the project page as a hint", async () => {
    stripeClient.mockReturnValueOnce(null);
    await expect(startDepositFormAction(form(MINE))).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?deposit=unavailable`);
  });
});
