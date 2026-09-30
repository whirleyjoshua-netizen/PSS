import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const d = await import("@/lib/payments/deposits");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const values = (call: unknown[]) => call.slice(1);
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const VERSION = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const DEPOSIT = "5d1f6a2e-3b4c-4d5e-8f60-7a8b9c0d1e2f";
const row = (over: Record<string, unknown> = {}) => ({
  id: DEPOSIT, lead_id: LEAD, dc_quote_version_id: VERSION, amount_cents: 92417, method: "stripe", status: "pending",
  stripe_session_id: "cs_1", stripe_payment_intent_id: null, recorded_by: null,
  created_at: "2026-09-29T17:00:00Z", paid_at: null, refunded_at: null, ...over,
});
const versionRow = (over: Record<string, unknown> = {}) => ({
  version_id: VERSION, version: 2, version_status: "signed", client_total_cents: 184833,
  signed_at: "2026-09-28T17:00:00Z", job_status: "signed", ...row(), ...over,
});

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
});

describe("depositAmountCents", () => {
  it("is half the signed total, a half cent rounding up", () => {
    expect(d.depositAmountCents(184834)).toBe(92417);
    expect(d.depositAmountCents(184833)).toBe(92417);
    expect(d.depositAmountCents(1)).toBe(1);
    expect(d.depositAmountCents(2)).toBe(1);
  });
  it("matches the SQL rule (client_total_cents + 1) / 2 for every total", () => {
    for (let cents = 0; cents < 5000; cents += 1) expect(d.depositAmountCents(cents)).toBe(Math.floor((cents + 1) / 2));
    for (const cents of [2_147_483_646, 99_999_999, 123_456_789]) expect(d.depositAmountCents(cents)).toBe(Math.floor((cents + 1) / 2));
  });
});

describe("depositState", () => {
  it("reads the chosen signed version, its figures and each deposit by status", async () => {
    sql.mockResolvedValueOnce([versionRow({ id: "d-new", status: "pending" }), versionRow({ id: "d-old", status: "expired" })]);
    const state = await d.depositState(LEAD);
    expect(state).toMatchObject({
      jobStatus: "signed", versionId: VERSION, version: 2, versionStatus: "signed", soldCents: 184833, amountCents: 92417,
      signedAt: new Date("2026-09-28T17:00:00Z"), paid: null, refunded: null,
    });
    expect(state!.pending!.id).toBe("d-new");
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("v.status in ('signed','cancelled')");
    expect(s).toContain("v.client_total_cents is not null and v.signed_at is not null");
    expect(s).toContain("left join deposits d on d.dc_quote_version_id = v.id");
    expect(s).toContain("order by d.created_at desc nulls last");
  });
  it("a newer signed version without a deposit does not hide the paid deposit on the older version", async () => {
    // Ruling P5: a change order signed after the deposit was paid. The mocked db cannot hold two versions,
    // so the proof is that the ONE query picks the version by its deposits first, and by version only last.
    sql.mockResolvedValueOnce([versionRow({ version: 1, status: "paid", paid_at: "2026-09-28T18:00:00Z" })]);
    expect(await d.depositState(LEAD)).toMatchObject({ version: 1, paid: { id: DEPOSIT, status: "paid" }, pending: null });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "bool_or(d.status = 'paid') as has_paid", "bool_or(d.status = 'pending') as has_pending",
      "from deposits d where d.dc_quote_version_id = v.id",
      "order by coalesce(h.has_paid, false) desc, coalesce(h.has_pending, false) desc, v.version desc limit 1",
      "join chosen c on c.id = v.id",
    ]) expect(s).toContain(part);
    expect(s).not.toContain("select max(version)");
  });
  it("a newer signed version outranks an older version whose deposit was refunded", async () => {
    // Amended P5: cancelled and refunded, then re-signed — the new version is asked for a new deposit.
    // A refund never ranks a version; only paid, then pending, then the version number do.
    sql.mockResolvedValueOnce([versionRow({ version: 3, id: null, status: null, amount_cents: null })]);
    expect(await d.depositState(LEAD)).toMatchObject({ version: 3, paid: null, pending: null, refunded: null });
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("coalesce(h.has_pending, false) desc, v.version desc limit 1");
    expect(s).not.toContain("has_refunded");
  });
  it("still reports a refunded deposit on the chosen version", async () => {
    sql.mockResolvedValueOnce([versionRow({ version_status: "cancelled", status: "refunded", paid_at: "2026-09-28T18:00:00Z", refunded_at: "2026-09-29T09:00:00Z" })]);
    expect(await d.depositState(LEAD)).toMatchObject({
      versionStatus: "cancelled", paid: null, pending: null, refunded: { id: DEPOSIT, status: "refunded", refundedAt: new Date("2026-09-29T09:00:00Z") },
    });
  });
  it("is null without a signed version, and never queries for a malformed id", async () => {
    expect(await d.depositState(LEAD)).toBeNull();
    sql.mockClear();
    expect(await d.depositState("nope")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
  it("reads a version with no deposits as nothing paid, pending or refunded", async () => {
    sql.mockResolvedValueOnce([versionRow({ client_total_cents: 1000, id: null, status: null, amount_cents: null })]);
    expect(await d.depositState(LEAD)).toMatchObject({ amountCents: 500, paid: null, pending: null, refunded: null });
  });
});

describe("claimStripeDeposit", () => {
  it("in ONE statement inserts a pending card deposit only for a signed job and version at the stored half, or returns the open one", async () => {
    sql.mockResolvedValueOnce([row()]);
    const claimed = await d.claimStripeDeposit({ leadId: LEAD, versionId: VERSION, amountCents: 92417 });
    expect(claimed).toMatchObject({ id: DEPOSIT, amountCents: 92417, status: "pending", method: "stripe", stripeSessionId: "cs_1" });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "insert into deposits (id, lead_id, dc_quote_version_id, amount_cents, method, status)",
      "'stripe', 'pending'", "and v.status = 'signed' and l.status = 'signed'", "and (v.client_total_cents + 1) / 2 = ?",
      "not exists (select 1 from deposits d where d.dc_quote_version_id = v.id and d.status = 'paid')",
      "on conflict do nothing", "union all", "and status = 'pending' and method = 'stripe'", "not exists (select 1 from inserted)",
    ]) expect(s).toContain(part);
    expect(values(sql.mock.calls[0])).toContain(92417);
  });
  it("answers null when nothing may be claimed", async () => {
    expect(await d.claimStripeDeposit({ leadId: LEAD, versionId: VERSION, amountCents: 92417 })).toBeNull();
  });
});

describe("attachSession / expireDeposit / expireStaleDeposits", () => {
  it("attaches a Checkout Session only to a pending deposit without another session", async () => {
    sql.mockResolvedValueOnce([{ id: DEPOSIT }]);
    expect(await d.attachSession(DEPOSIT, "cs_1")).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("where id = ? and status = 'pending' and (stripe_session_id is null or stripe_session_id = ?)");
  });
  it("expires only a pending deposit, so an expiry arriving after payment changes nothing", async () => {
    expect(await d.expireDeposit("cs_1")).toBe(false);
    expect(text(sql.mock.calls[0])).toContain("update deposits set status = 'expired' where stripe_session_id = ? and status = 'pending'");
  });
  it("expires a pending deposit older than 23 hours, inside Stripe's 24-hour session and idempotency windows", async () => {
    sql.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    expect(await d.expireStaleDeposits(VERSION)).toBe(2);
    expect(text(sql.mock.calls[0])).toContain("status = 'pending' and created_at < now() - interval '23 hours'");
  });
});

describe("markStripeDepositPaid", () => {
  const input = { depositId: DEPOSIT, sessionId: "cs_1", paymentIntentId: "pi_1", amountCents: 92417 };

  it("in ONE statement marks the pending deposit paid, writes deposit_cents, moves Signed to Sold and logs both", async () => {
    sql.mockResolvedValueOnce([{ lead_id: LEAD }]);
    expect(await d.markStripeDepositPaid(input)).toEqual({ leadId: LEAD });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "update deposits set status = 'paid', paid_at = now(), stripe_session_id = ?, stripe_payment_intent_id = ?",
      "where id = ? and method = 'stripe' and status = 'pending'",
      "and (stripe_session_id = ? or stripe_session_id is null)", "and amount_cents = ?",
      "not exists (select 1 from deposits d where d.dc_quote_version_id = deposits.dc_quote_version_id and d.status = 'paid')",
      "deposit_cents = (select amount_cents from paid)", "status = case when status = 'signed' then 'sold' else status end",
      "'payment'", "'stage', prev.status, 'sold', 'Deposit paid'", "where prev.status = 'signed'",
    ]) expect(s).toContain(part);
    expect(values(sql.mock.calls[0])).toEqual(expect.arrayContaining(["cs_1", "pi_1", DEPOSIT, 92417, "Stripe", "Deposit $924.17 paid by card"]));
  });
  it("answers null when no pending deposit matched (a duplicate delivery, or one recorded by hand)", async () => {
    expect(await d.markStripeDepositPaid(input)).toBeNull();
  });
  it("never queries for a malformed deposit id", async () => {
    expect(await d.markStripeDepositPaid({ ...input, depositId: "x" })).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
  it("records the payment on a job the owner moved on by hand, moving only a Signed job", async () => {
    await d.markStripeDepositPaid(input);
    const s = text(sql.mock.calls[0]);
    const moved = s.slice(s.indexOf("moved as ("), s.indexOf("payment_logged as ("));
    // deposit_cents is written whatever the stage; only the status and its event depend on Signed.
    expect(moved).toContain("where id = (select lead_id from paid)");
    expect(moved).not.toContain("and status = 'signed'");
  });
});

describe("recordDepositPayment", () => {
  it("in ONE statement inserts a paid row, expires any open card checkout, moves Signed to Sold and logs both", async () => {
    sql.mockResolvedValueOnce([{ id: "new" }]);
    expect(await d.recordDepositPayment({ leadId: LEAD, versionId: VERSION, amountCents: 92400, method: "check", actor: "owner@example.com" }))
      .toEqual({ depositId: "new" });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "insert into deposits (id, lead_id, dc_quote_version_id, amount_cents, method, status, recorded_by, paid_at)",
      "'paid', ?, now()", "and v.status = 'signed' and l.status = 'signed'",
      "not exists (select 1 from deposits d where d.dc_quote_version_id = v.id and d.status = 'paid')",
      "update deposits set status = 'expired' where dc_quote_version_id = ? and status = 'pending' and exists (select 1 from paid)",
      "status = case when status = 'signed' then 'sold' else status end", "'Deposit recorded'",
    ]) expect(s).toContain(part);
    expect(values(sql.mock.calls[0])).toEqual(expect.arrayContaining([92400, "check", "owner@example.com", "Deposit $924 received by check"]));
  });
  it("refuses a card method, a bad amount or a malformed id without a query", async () => {
    const base = { leadId: LEAD, versionId: VERSION, actor: "o@x" };
    expect(await d.recordDepositPayment({ ...base, amountCents: 1, method: "stripe" as never })).toBeNull();
    expect(await d.recordDepositPayment({ ...base, amountCents: 0, method: "cash" })).toBeNull();
    expect(await d.recordDepositPayment({ ...base, amountCents: 10.5, method: "cash" })).toBeNull();
    expect(await d.recordDepositPayment({ ...base, amountCents: 100, method: "cash", versionId: "x" })).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("cancelDeposit", () => {
  const paid: import("@/lib/payments/deposits").Deposit = {
    id: DEPOSIT, leadId: LEAD, versionId: VERSION, amountCents: 92417, method: "stripe", status: "paid",
    stripeSessionId: "cs_1", stripePaymentIntentId: "pi_1", recordedBy: null, createdAt: new Date(), paidAt: new Date(), refundedAt: null,
  };

  it("in ONE statement refunds the paid deposit, cancels the version, loses the job, clears deposit_cents and logs both", async () => {
    sql.mockResolvedValueOnce([{ lead_id: LEAD }]);
    expect(await d.cancelDeposit({ leadId: LEAD, deposit: paid, actor: "owner@example.com" })).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "update deposits set status = 'refunded', refunded_at = now() where id = ? and lead_id = ? and status = 'paid' and amount_cents = ?",
      "update dc_quote_versions set status = 'cancelled', cancelled_at = now()", "and status = 'signed'",
      "status = 'lost', lost_reason = ?, deposit_cents = null", "follow_up_at = null", "and status <> 'lost'",
      "'payment'", "'stage', prev.status, 'lost'",
    ]) expect(s).toContain(part);
    expect(values(sql.mock.calls[0])).toEqual(expect.arrayContaining(["Cancelled — deposit refunded", "Deposit $924.17 refunded to the client's card"]));
  });
  it("words a recorded deposit as one the owner returns", async () => {
    await d.cancelDeposit({ leadId: LEAD, deposit: { ...paid, method: "cash" }, actor: "o@x" });
    expect(values(sql.mock.calls[0])).toContain("Deposit $924.17 (cash) marked refunded — return it to the client");
  });
  it("answers false when the deposit was no longer paid", async () => {
    expect(await d.cancelDeposit({ leadId: LEAD, deposit: paid, actor: "o@x" })).toBe(false);
  });
});
