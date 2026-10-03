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
      "bool_or(d.status = 'paid') as has_paid",
      "from deposits d where d.dc_quote_version_id = v.id",
      "order by coalesce(h.has_paid, false) desc, v.signed_at desc, v.version desc limit 1",
      "join chosen c on c.id = v.id",
    ]) expect(s).toContain(part);
    expect(s).not.toContain("select max(version)");
  });
  it("a newer signed version without a deposit beats an older version holding only a stale pending deposit (ruling P20)", async () => {
    // A change order signed after the client opened card checkout on the old version: the new version
    // is the one to pay. Only a paid deposit outranks the version number; a pending one ranks nothing.
    sql.mockResolvedValueOnce([versionRow({ version: 2, id: null, status: null, amount_cents: null })]);
    expect(await d.depositState(LEAD)).toMatchObject({ version: 2, paid: null, pending: null });
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("order by coalesce(h.has_paid, false) desc, v.signed_at desc, v.version desc limit 1");
    expect(s).not.toContain("has_pending");
  });
  it("a newer signed version outranks an older version whose deposit was refunded", async () => {
    // Amended P5: cancelled and refunded, then re-signed — the new version is asked for a new deposit.
    // A refund never ranks a version; only paid, then the version number do (ruling P20).
    sql.mockResolvedValueOnce([versionRow({ version: 3, id: null, status: null, amount_cents: null })]);
    expect(await d.depositState(LEAD)).toMatchObject({ version: 3, paid: null, pending: null, refunded: null });
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("coalesce(h.has_paid, false) desc, v.signed_at desc, v.version desc limit 1");
    expect(s).not.toContain("has_refunded");
  });
  it("ranks by signing time before version number, since each quote option numbers its own versions from 1", async () => {
    // Option A v2 signed, refunded and cancelled (job Lost), the job reopened and option B v1 signed: B v1 is
    // the version asked for a deposit. Version numbers never compare across options; signed_at does, and within
    // one option a later version is always signed later.
    sql.mockResolvedValueOnce([versionRow({ version: 1, id: null, status: null, amount_cents: null })]);
    expect(await d.depositState(LEAD)).toMatchObject({ version: 1, versionStatus: "signed", paid: null, refunded: null });
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("order by coalesce(h.has_paid, false) desc, v.signed_at desc, v.version desc limit 1");
    expect(s.indexOf("v.signed_at desc")).toBeLessThan(s.indexOf("v.version desc"));
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
  it("answers null without a query for a zero, negative or fractional amount (a $0 total), never tripping deposits_amount_check", async () => {
    expect(await d.claimStripeDeposit({ leadId: LEAD, versionId: VERSION, amountCents: 0 })).toBeNull();
    expect(await d.claimStripeDeposit({ leadId: LEAD, versionId: VERSION, amountCents: -5 })).toBeNull();
    expect(await d.claimStripeDeposit({ leadId: LEAD, versionId: VERSION, amountCents: 10.5 })).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("expirePendingOnOtherVersions (ruling P20)", () => {
  const OTHER = "6e2f7b3f-4c5d-4e6f-9a71-8b9c0d1e2f3a";
  it("in ONE statement expires every pending deposit of the job's OTHER versions and answers their sessions", async () => {
    sql.mockResolvedValueOnce([{ stripe_session_id: "cs_old" }, { stripe_session_id: null }]);
    expect(await d.expirePendingOnOtherVersions(LEAD, VERSION)).toEqual(["cs_old"]);
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("update deposits set status = 'expired' where lead_id = ? and dc_quote_version_id <> ? and status = 'pending' returning stripe_session_id");
    expect(values(sql.mock.calls[0])).toEqual([LEAD, VERSION]);
  });
  it("answers nothing, without a query, for a malformed id", async () => {
    expect(await d.expirePendingOnOtherVersions("nope", OTHER)).toEqual([]);
    expect(await d.expirePendingOnOtherVersions(LEAD, "nope")).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
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
  it("gives up one pending deposit that never got a Checkout Session, and nothing else", async () => {
    sql.mockResolvedValueOnce([{ id: DEPOSIT }]);
    expect(await d.expireSessionlessDeposit(DEPOSIT)).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(text(sql.mock.calls[0])).toContain("update deposits set status = 'expired' where id = ? and status = 'pending' and stripe_session_id is null");
    expect(values(sql.mock.calls[0])).toEqual([DEPOSIT]);
    expect(await d.expireSessionlessDeposit("not-a-uuid")).toBe(false);
    expect(sql).toHaveBeenCalledTimes(1);
  });
});

describe("markStripeDepositPaid", () => {
  const input = { depositId: DEPOSIT, sessionId: "cs_1", paymentIntentId: "pi_1", amountCents: 92417 };

  it("in ONE statement marks the pending deposit paid, writes deposit_cents, moves Signed to Sold and logs both", async () => {
    sql.mockResolvedValueOnce([{ lead_id: LEAD, dc_quote_version_id: VERSION, stage_before: "signed", other_sessions: [] }]);
    expect(await d.markStripeDepositPaid(input)).toEqual({ leadId: LEAD, versionId: VERSION, stageBefore: "signed", otherSessionIds: [] });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "update deposits set status = 'paid', paid_at = now(), stripe_session_id = ?, stripe_payment_intent_id = ?",
      "where id = ? and method = 'stripe' and ((status = 'pending' and (stripe_session_id = ? or stripe_session_id is null)) or (status = 'expired' and stripe_session_id = ?))",
      "and amount_cents = ?",
      "not exists (select 1 from deposits d where d.dc_quote_version_id = deposits.dc_quote_version_id and d.status = 'paid')",
      "deposit_cents = (select amount_cents from paid)", "status = case when status = 'signed' then 'sold' else status end",
      "'payment'", "'stage', prev.status, 'sold', 'Deposit paid'", "where prev.status = 'signed'",
    ]) expect(s).toContain(part);
    expect(values(sql.mock.calls[0])).toEqual(expect.arrayContaining(["cs_1", "pi_1", DEPOSIT, 92417, "Stripe", "Deposit $924.17 paid by card"]));
  });
  it("marks paid an EXPIRED card deposit whose Checkout Session completed, so real money is never dropped (P11b)", async () => {
    sql.mockResolvedValueOnce([{ lead_id: LEAD, dc_quote_version_id: VERSION, stage_before: "signed", other_sessions: [] }]);
    expect(await d.markStripeDepositPaid(input)).toEqual({ leadId: LEAD, versionId: VERSION, stageBefore: "signed", otherSessionIds: [] });
    const s = text(sql.mock.calls[0]);
    const paid = s.slice(s.indexOf("with paid as ("), s.indexOf("others_expired as ("));
    // Only with the session Stripe completed: an expired row never takes a session it did not hold.
    expect(paid).toContain("or (status = 'expired' and stripe_session_id = ?)");
    expect(paid).toContain("returning lead_id, amount_cents, dc_quote_version_id");
    expect(values(sql.mock.calls[0]).filter((value) => value === "cs_1").length).toBe(3);
  });
  it("in the same statement expires every OTHER pending deposit of the JOB, on any version, so no open checkout outlives the payment (P23)", async () => {
    await d.markStripeDepositPaid(input);
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain(
      "others_expired as ( update deposits set status = 'expired' where lead_id = (select lead_id from paid) and status = 'pending' and id <> ? returning id, stripe_session_id )",
    );
    expect(s).not.toContain("where dc_quote_version_id = (select dc_quote_version_id from paid) and status = 'pending'");
    expect(values(sql.mock.calls[0]).filter((value) => value === DEPOSIT).length).toBe(2);
  });
  it("still refuses when the version already has a paid deposit, and never re-marks a paid row", async () => {
    expect(await d.markStripeDepositPaid(input)).toBeNull();
    const s = text(sql.mock.calls[0]);
    const paid = s.slice(s.indexOf("with paid as ("), s.indexOf("others_expired as ("));
    expect(paid).toContain("and not exists (select 1 from deposits d where d.dc_quote_version_id = deposits.dc_quote_version_id and d.status = 'paid')");
    // The accepted statuses are exactly pending and expired.
    expect(paid.match(/status = '(\w+)' and/g)).toEqual(["status = 'pending' and", "status = 'expired' and"]);
  });
  it("answers the version, the stage before and the other checkouts it expired, so the webhook can close them and word the receipt", async () => {
    sql.mockResolvedValueOnce([{ lead_id: LEAD, dc_quote_version_id: VERSION, stage_before: "lost", other_sessions: ["cs_2", "cs_3"] }]);
    expect(await d.markStripeDepositPaid(input)).toEqual({ leadId: LEAD, versionId: VERSION, stageBefore: "lost", otherSessionIds: ["cs_2", "cs_3"] });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("returning id, stripe_session_id )");
    expect(s).toContain(
      "select paid.lead_id, paid.dc_quote_version_id, (select status from prev) as stage_before, array(select stripe_session_id from others_expired where stripe_session_id is not null) as other_sessions from paid",
    );
  });
  it("accepts only a pending row, or an expired one holding this session, and never a refunded one (a replay after Cancel & refund)", async () => {
    expect(await d.markStripeDepositPaid(input)).toBeNull();
    const s = text(sql.mock.calls[0]);
    const paid = s.slice(s.indexOf("with paid as ("), s.indexOf("others_expired as ("));
    const where = paid.slice(paid.indexOf("where id = ?"), paid.indexOf("returning"));
    expect(where).toContain(
      "and ((status = 'pending' and (stripe_session_id = ? or stripe_session_id is null)) or (status = 'expired' and stripe_session_id = ?))",
    );
    // Every status the updated row itself may hold (the not-exists guard's d.status is another row), exactly these two.
    expect([...where.matchAll(/(?<![.\w])status (?:= '(\w+)'|in \(([^)]*)\))/g)].map((m) => m[1] ?? m[2])).toEqual(["pending", "expired"]);
    expect(where).not.toContain("refunded");
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
      "update leads set deposit_cents = null, status = 'lost', lost_reason = case when status <> 'lost' then ? else lost_reason end",
      "follow_up_at = case when status <> 'lost' then null else follow_up_at end",
      "'payment'", "'stage', prev.status, 'lost'", "where prev.status <> 'lost'",
    ]) expect(s).toContain(part);
    expect(values(sql.mock.calls[0])).toEqual(expect.arrayContaining(["Cancelled — deposit refunded", "Deposit $924.17 refunded to the client's card"]));
  });
  // P23: the cancelled version's quote PDF stops being shared, as sendQuote's `unshared` does for a superseded one.
  it("in the same statement unshares the cancelled version's quote PDF, never a signed file", async () => {
    sql.mockResolvedValueOnce([{ lead_id: LEAD }]);
    expect(await d.cancelDeposit({ leadId: LEAD, deposit: paid, actor: "o@x" })).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    expect(s).toContain(
      "unshared as ( update job_files set shared_at = null where lead_id = ? and id = (select v.quote_file_id from dc_quote_versions v join refunded r on v.id = r.dc_quote_version_id) and not exists (select 1 from contract_signatures s where s.file_id = job_files.id or s.signed_file_id = job_files.id) returning id )",
    );
    expect(s).not.toContain("contract_file_id");
  });
  it("clears deposit_cents on a job already Lost, in the same statement: the leads update is gated on the refunded row, not the stage", async () => {
    sql.mockResolvedValueOnce([{ lead_id: LEAD }]);
    expect(await d.cancelDeposit({ leadId: LEAD, deposit: paid, actor: "o@x" })).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    const lost = s.slice(s.indexOf("lost as ("), s.indexOf("payment_logged as ("));
    expect(lost).toContain("deposit_cents = null");
    expect(lost).toContain("where id = (select lead_id from refunded) returning id");
    expect(lost).not.toContain("and status <> 'lost'");
    // A Lost job keeps its own reason and stage date, and gets no second stage event.
    expect(lost).toContain("stage_changed_at = case when status <> 'lost' then now() else stage_changed_at end");
    expect(s.slice(s.indexOf("stage_logged as ("))).toContain("where prev.status <> 'lost'");
  });
  it("words a recorded deposit as one the owner returns", async () => {
    await d.cancelDeposit({ leadId: LEAD, deposit: { ...paid, method: "cash" }, actor: "o@x" });
    expect(values(sql.mock.calls[0])).toContain("Deposit $924.17 (cash) marked refunded — return it to the client");
  });
  it("answers false when the deposit was no longer paid", async () => {
    expect(await d.cancelDeposit({ leadId: LEAD, deposit: paid, actor: "o@x" })).toBe(false);
  });
});
