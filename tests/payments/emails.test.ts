import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/lib/leads/email", () => ({ ownerRecipients: () => ["owner@example.com"] }));
vi.mock("@/lib/admin/origin", () => ({ adminOrigin: () => "https://admin.example.com" }));
const jobs = { getJob: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const deposits = { depositState: vi.fn() };
vi.mock("@/lib/payments/deposits", () => deposits);

const { alertUnmatchedPayment, alertUnrecordedRefund, sendCancellationEmails, sendDepositReceipts } = await import("@/lib/payments/emails");

const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const job = { id: LEAD, name: "Maria Lopez", email: " Maria@Example.com ", projectNo: 1048 };
const paid = { id: "d1", method: "stripe", amountCents: 92417, paidAt: new Date("2026-09-29T17:00:00Z"), recordedBy: null };
// Signed Monday Sep 28 2026: the third business day after is Thursday Oct 1.
const state = { soldCents: 184833, amountCents: 92417, signedAt: new Date("2026-09-28T17:00:00Z"), paid };
const sent = () => send.mock.calls.map((call) => call[0] as { to: string | string[]; subject: string; text: string });

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "re_test");
  jobs.getJob.mockReset().mockResolvedValue(job);
  deposits.depositState.mockReset().mockResolvedValue(state);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendDepositReceipts", () => {
  it("sends the client a receipt with the figures on record, and tells the owners the job is Sold", async () => {
    await sendDepositReceipts(LEAD);
    const [client, owners] = sent();
    expect(client.to).toBe("maria@example.com");
    expect(client.subject).toBe("Payment received — PSS-1048");
    expect(client.text).toContain("Payment received — thank you.");
    expect(client.text).toContain("Contract total:   $1,848.33");
    expect(client.text).toContain("Deposit paid:     $924.17 by card on Sep 29, 2026");
    expect(client.text).toContain("Balance due at installation: $924.16");
    expect(client.text).toContain("You may cancel until the end of Oct 1, 2026");
    expect(owners.to).toEqual(["owner@example.com"]);
    expect(owners.subject).toBe("Deposit paid: PSS-1048 — $924.17");
    expect(owners.text).toContain("Maria Lopez paid the 50% deposit of $924.17 by card.");
    expect(owners.text).toContain(`https://admin.example.com/admin/jobs/${LEAD}?tab=quote`);
  });

  // The owner may record a different amount than the 50% (Payment received lets them type it).
  it("states the amount recorded, not 'the 50% deposit', when it differs from the 50%", async () => {
    deposits.depositState.mockResolvedValue({ ...state, paid: { ...paid, method: "check", amountCents: 50000, recordedBy: "owner@example.com" } });
    await sendDepositReceipts(LEAD);
    const owners = sent()[1];
    expect(owners.text).toContain("Maria Lopez paid a deposit of $500 by check. The 50% deposit is $924.17.");
    expect(owners.text).not.toContain("paid the 50% deposit");
    expect(owners.subject).toBe("Deposit paid: PSS-1048 — $500");
  });

  it("names the owner who recorded a hand payment", async () => {
    deposits.depositState.mockResolvedValue({ ...state, paid: { ...paid, method: "check", recordedBy: "owner@example.com" } });
    await sendDepositReceipts(LEAD);
    expect(sent()[1].text).toContain("Recorded by: owner@example.com");
    expect(sent()[0].text).toContain("$924.17 by check");
  });

  it("tells the owners the job was not in Signed, so they review it, when the payment landed on a job moved elsewhere (P11c)", async () => {
    await sendDepositReceipts(LEAD, { stageBefore: "lost" });
    const owners = sent()[1];
    expect(owners.text).toContain("The job was not in Signed (it was Lost), so its stage was not changed. Review this job");
    expect(owners.text).not.toContain("The job has moved to Sold");
    expect(sent()[0].text).toContain("Deposit paid:     $924.17 by card on Sep 29, 2026");
  });

  it("promises the client nothing when the job was not Signed: no confirmation, no measure, no cancel window (P12)", async () => {
    await sendDepositReceipts(LEAD, { stageBefore: "lost" });
    const client = sent()[0];
    expect(client.text).not.toContain("Your order is confirmed");
    expect(client.text).toContain("We received your deposit of $924.17 — Premier Shade Solutions will be in touch.");
    expect(client.text).not.toContain("final measure");
    expect(client.text).not.toContain("You may cancel");
  });

  it("says the job moved to Sold when it was Signed", async () => {
    await sendDepositReceipts(LEAD, { stageBefore: "signed" });
    expect(sent()[1].text).toContain("The job has moved to Sold. Book the official measure.");
  });

  it("sends nothing when nothing is paid, and never throws when an email fails", async () => {
    deposits.depositState.mockResolvedValue({ ...state, paid: null });
    await sendDepositReceipts(LEAD);
    expect(send).not.toHaveBeenCalled();
    deposits.depositState.mockResolvedValue(state);
    send.mockRejectedValue(new Error("resend down"));
    await expect(sendDepositReceipts(LEAD)).resolves.toBeUndefined();
  });
});

describe("alertUnmatchedPayment", () => {
  it("tells the owners what to look up in Stripe", async () => {
    await alertUnmatchedPayment({ sessionId: "cs_1", amountCents: 92417, depositId: "d1", reason: "Because." });
    const [alert] = sent();
    expect(alert.subject).toBe("A card payment needs checking in Stripe");
    for (const line of ["Because.", "Checkout Session: cs_1", "Amount:           $924.17", "Deposit:          d1"]) expect(alert.text).toContain(line);
  });
});

describe("alertUnrecordedRefund", () => {
  it("tells the owners the card was refunded but the cancellation is not recorded", async () => {
    await alertUnrecordedRefund({ job: job as never, depositId: "d1", amountCents: 92417 });
    const [alert] = sent();
    expect(alert.to).toEqual(["owner@example.com"]);
    expect(alert.subject).toBe("Refunded but not recorded: PSS-1048");
    for (const line of ["Maria Lopez's deposit of $924.17 was refunded to the card in Stripe", "Deposit: d1",
      "https://admin.example.com/admin/jobs/" + LEAD + "?tab=quote"]) expect(alert.text).toContain(line);
  });
});

describe("sendCancellationEmails", () => {
  it("tells the client their card refund is on its way and the owners who cancelled", async () => {
    await sendCancellationEmails({ job: job as never, amountCents: 92417, method: "stripe", inWindow: true, actor: "owner@example.com" });
    const [client, owners] = sent();
    expect(client.subject).toBe("Your order PSS-1048 is cancelled");
    expect(client.text).toContain("Your deposit of $924.17 is being refunded to your card in full.");
    expect(owners.subject).toBe("Cancelled and refunded: PSS-1048");
    expect(owners.text).toContain("cancelled by owner@example.com");
    expect(owners.text).toContain("Cancellation window: still open");
  });
  it("tells the client a recorded deposit will be returned, and the owners to return it", async () => {
    await sendCancellationEmails({ job: job as never, amountCents: 50000, method: "check", inWindow: false, actor: "o@x" });
    const [client, owners] = sent();
    expect(client.text).toContain("We will return your deposit of $500 to you in full.");
    expect(owners.text).toContain("Deposit:  $500 (check) — return it to the client");
    expect(owners.text).toContain("Cancellation window: closed");
  });
});
