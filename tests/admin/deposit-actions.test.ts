import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn(async () => ({ email: "owner@example.com" }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const afterCbs: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { afterCbs.push(cb); } }));
const jobs = { getJob: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const deposits = { depositState: vi.fn(), recordDepositPayment: vi.fn(), cancelDeposit: vi.fn(), isRecordedMethod: (v: unknown) => ["check", "cash", "other"].includes(v as string) };
vi.mock("@/lib/payments/deposits", () => deposits);
const stripe = { stripeClient: vi.fn(() => ({}) as unknown), closeCheckout: vi.fn(), refundPayment: vi.fn() };
vi.mock("@/lib/payments/stripe", () => stripe);
const emails = { sendDepositReceipts: vi.fn(), sendCancellationEmails: vi.fn(), alertUnrecordedRefund: vi.fn() };
vi.mock("@/lib/payments/emails", () => emails);

const { cancelDepositAction, recordDepositAction } = await import("@/app/admin/jobs/[id]/deposit-actions");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const VERSION = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const DEPOSIT = "5d1f6a2e-3b4c-4d5e-8f60-7a8b9c0d1e2f";
const job = { id: JOB, name: "Maria Lopez", status: "signed", email: "maria@example.com", projectNo: 1048 };
const paid = { id: DEPOSIT, leadId: JOB, versionId: VERSION, amountCents: 92417, method: "stripe", status: "paid",
  stripeSessionId: "cs_1", stripePaymentIntentId: "pi_1", recordedBy: null, createdAt: new Date(), paidAt: new Date(), refundedAt: null };
const state = { jobStatus: "signed", versionId: VERSION, version: 1, versionStatus: "signed", soldCents: 184833, amountCents: 92417,
  signedAt: new Date(), paid: null, pending: null, refunded: null };

beforeEach(() => {
  afterCbs.length = 0;
  requireAdmin.mockClear();
  jobs.getJob.mockReset().mockResolvedValue(job);
  deposits.depositState.mockReset().mockResolvedValue(state);
  deposits.recordDepositPayment.mockReset().mockResolvedValue({ depositId: "new" });
  deposits.cancelDeposit.mockReset().mockResolvedValue(true);
  stripe.stripeClient.mockClear();
  stripe.closeCheckout.mockReset().mockResolvedValue("closed");
  stripe.refundPayment.mockReset().mockResolvedValue(true);
  emails.sendDepositReceipts.mockReset().mockResolvedValue(undefined);
  emails.sendCancellationEmails.mockReset().mockResolvedValue(undefined);
  emails.alertUnrecordedRefund.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordDepositAction", () => {
  it("records the typed amount and method for a Signed job, then sends the receipts", async () => {
    expect(await recordDepositAction(JOB, "$924.00", "check")).toEqual({ ok: true });
    expect(deposits.recordDepositPayment).toHaveBeenCalledWith({ leadId: JOB, versionId: VERSION, amountCents: 92400, method: "check", actor: "owner@example.com" });
    for (const cb of afterCbs.splice(0)) await cb();
    expect(emails.sendDepositReceipts).toHaveBeenCalledWith(JOB);
  });

  it("closes an open card checkout before recording", async () => {
    deposits.depositState.mockResolvedValue({ ...state, pending: { ...paid, status: "pending", stripeSessionId: "cs_open" } });
    await recordDepositAction(JOB, "924.17", "cash");
    expect(stripe.closeCheckout).toHaveBeenCalledWith(expect.anything(), "cs_open");
    expect(deposits.recordDepositPayment).toHaveBeenCalled();
    expect(stripe.closeCheckout.mock.invocationCallOrder[0]).toBeLessThan(deposits.recordDepositPayment.mock.invocationCallOrder[0]);
  });

  it("refuses, recording nothing, while the client's card payment is in flight", async () => {
    deposits.depositState.mockResolvedValue({ ...state, pending: { ...paid, status: "pending", stripeSessionId: "cs_open" } });
    stripe.closeCheckout.mockResolvedValue("paid");
    expect(await recordDepositAction(JOB, "924.17", "cash")).toEqual({
      error: "The client is paying by card right now. Wait for that payment before recording another.",
    });
    stripe.closeCheckout.mockResolvedValue("unknown");
    expect(await recordDepositAction(JOB, "924.17", "cash")).toEqual({
      error: "Could not check the client's card payment with Stripe. Try again in a minute.",
    });
    expect(deposits.recordDepositPayment).not.toHaveBeenCalled();
  });

  it("refuses a bad method, a bad amount, more than the contract, a job not Signed, and a paid deposit", async () => {
    expect(await recordDepositAction(JOB, "924", "stripe")).toEqual({ error: "Choose check, cash or other." });
    expect(await recordDepositAction(JOB, "abc", "check")).toEqual({ error: "Enter an amount like 4500 or 4,500.00" });
    expect(await recordDepositAction(JOB, "", "check")).toEqual({ error: "Enter the amount received." });
    expect(await recordDepositAction(JOB, "1848.34", "check")).toEqual({ error: "That is more than the contract total of $1,848.33." });
    jobs.getJob.mockResolvedValue({ ...job, status: "sold" });
    expect(await recordDepositAction(JOB, "924", "check")).toEqual({ error: "A deposit is recorded once the contract is signed and before the job is Sold." });
    jobs.getJob.mockResolvedValue(job);
    deposits.depositState.mockResolvedValue({ ...state, paid });
    expect(await recordDepositAction(JOB, "924", "check")).toEqual({ error: "The deposit is already recorded." });
    expect(deposits.recordDepositPayment).not.toHaveBeenCalled();
  });

  it("refuses when the chosen version is not a signed contract", async () => {
    deposits.depositState.mockResolvedValue({ ...state, versionStatus: "cancelled" });
    expect(await recordDepositAction(JOB, "924", "check")).toEqual({ error: "This job has no signed contract." });
    deposits.depositState.mockResolvedValue(null);
    expect(await recordDepositAction(JOB, "924", "check")).toEqual({ error: "This job has no signed contract." });
    expect(deposits.recordDepositPayment).not.toHaveBeenCalled();
  });

  it("says so when the statement recorded nothing (the job moved meanwhile)", async () => {
    deposits.recordDepositPayment.mockResolvedValue(null);
    expect(await recordDepositAction(JOB, "924", "check")).toEqual({ error: "The deposit could not be recorded. Reload the page and check the job's stage." });
  });
});

describe("cancelDepositAction", () => {
  beforeEach(() => { deposits.depositState.mockResolvedValue({ ...state, paid }); });

  it("refunds a card deposit through Stripe first, then records the cancellation and emails both sides", async () => {
    expect(await cancelDepositAction(JOB, DEPOSIT)).toEqual({ ok: true });
    expect(stripe.refundPayment).toHaveBeenCalledWith(expect.anything(), "pi_1", DEPOSIT);
    expect(deposits.cancelDeposit).toHaveBeenCalledWith({ leadId: JOB, deposit: paid, actor: "owner@example.com" });
    expect(stripe.refundPayment.mock.invocationCallOrder[0]).toBeLessThan(deposits.cancelDeposit.mock.invocationCallOrder[0]);
    for (const cb of afterCbs.splice(0)) await cb();
    expect(emails.sendCancellationEmails).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 92417, method: "stripe", actor: "owner@example.com" }));
  });

  it("changes nothing when Stripe does not refund", async () => {
    stripe.refundPayment.mockResolvedValue(false);
    expect(await cancelDepositAction(JOB, DEPOSIT)).toEqual({
      error: "Stripe did not refund the card, so nothing was changed. Try again, or refund it in the Stripe dashboard first.",
    });
    expect(deposits.cancelDeposit).not.toHaveBeenCalled();
  });

  // Ruling P16: the card is refunded, so the owner is told exactly that, a line is logged and the owners are alerted.
  const REFUNDED_UNRECORDED = "The card was refunded in Stripe, but PSS could not record the cancellation. Reload and press Cancel & refund again — it will not refund twice.";

  it("says the card was refunded, logs and alerts the owners, when the cancellation records nothing", async () => {
    deposits.cancelDeposit.mockResolvedValue(false);
    expect(await cancelDepositAction(JOB, DEPOSIT)).toEqual({ error: REFUNDED_UNRECORDED });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(DEPOSIT), expect.anything());
    for (const cb of afterCbs.splice(0)) await cb();
    expect(emails.alertUnrecordedRefund).toHaveBeenCalledWith({ job, depositId: DEPOSIT, amountCents: 92417 });
    expect(emails.sendCancellationEmails).not.toHaveBeenCalled();
  });

  it("says the card was refunded, logs and alerts the owners, when the cancellation throws", async () => {
    deposits.cancelDeposit.mockRejectedValue(new Error("connection reset"));
    expect(await cancelDepositAction(JOB, DEPOSIT)).toEqual({ error: REFUNDED_UNRECORDED });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(DEPOSIT), expect.anything());
    for (const cb of afterCbs.splice(0)) await cb();
    expect(emails.alertUnrecordedRefund).toHaveBeenCalledWith({ job, depositId: DEPOSIT, amountCents: 92417 });
    expect(emails.sendCancellationEmails).not.toHaveBeenCalled();
  });

  it("marks a recorded deposit refunded without calling Stripe", async () => {
    deposits.depositState.mockResolvedValue({ ...state, paid: { ...paid, method: "check", stripePaymentIntentId: null } });
    expect(await cancelDepositAction(JOB, DEPOSIT)).toEqual({ ok: true });
    expect(stripe.refundPayment).not.toHaveBeenCalled();
  });

  it("refuses a job that is not Signed or Sold, and a deposit that is not the paid one", async () => {
    jobs.getJob.mockResolvedValue({ ...job, status: "ordered" });
    expect(await cancelDepositAction(JOB, DEPOSIT)).toEqual({ error: "Only a Signed or Sold job can be cancelled and refunded here." });
    jobs.getJob.mockResolvedValue(job);
    expect(await cancelDepositAction(JOB, "6e2f7b3f-4c5d-4e6f-9a71-8b9c0d1e2f3a")).toEqual({ error: "This deposit is no longer paid. Reload the page." });
    expect(stripe.refundPayment).not.toHaveBeenCalled();
    expect(deposits.cancelDeposit).not.toHaveBeenCalled();
  });
});
