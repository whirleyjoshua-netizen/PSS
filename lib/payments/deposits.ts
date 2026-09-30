import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/ids";
import { formatCents } from "@/lib/admin/money";
import { isStage, type Stage } from "@/lib/admin/stages";

export type DepositMethod = "stripe" | "check" | "cash" | "other";
/** What an owner may record by hand. A card payment only ever arrives through the verified webhook. */
export const RECORDED_METHODS = ["check", "cash", "other"] as const;
export type RecordedMethod = (typeof RECORDED_METHODS)[number];
export const isRecordedMethod = (value: unknown): value is RecordedMethod =>
  typeof value === "string" && (RECORDED_METHODS as readonly string[]).includes(value);
export type DepositStatus = "pending" | "paid" | "refunded" | "expired";

export type Deposit = {
  id: string; leadId: string; versionId: string; amountCents: number; method: DepositMethod; status: DepositStatus;
  stripeSessionId: string | null; stripePaymentIntentId: string | null; recordedBy: string | null;
  createdAt: Date; paidAt: Date | null; refundedAt: Date | null;
};

/** The job's deposit-bearing (else newest) signed or cancelled DC version and its deposits. */
export type DepositState = {
  jobStatus: Stage; versionId: string; version: number; versionStatus: "signed" | "cancelled";
  soldCents: number; amountCents: number; signedAt: Date;
  paid: Deposit | null; pending: Deposit | null; refunded: Deposit | null;
};

/** Spec §4: half the signed total, a half cent rounding up. The SQL twin is (client_total_cents + 1) / 2. */
export const depositAmountCents = (soldCents: number): number => Math.round(soldCents / 2);

/** What markStripeDepositPaid applied. stageBefore is the job's stage before the write. */
export type StripePaid = { leadId: string; versionId: string; stageBefore: string | null; otherSessionIds: string[] };

/** Who a card payment's timeline entries name. */
export const STRIPE_ACTOR = "Stripe";
/** lost_reason, and the stage event's body, for a cancelled and refunded order. */
export const CANCEL_REASON = "Cancelled — deposit refunded";

const RECEIVED: Record<RecordedMethod, string> = { check: "by check", cash: "in cash", other: "by other means" };

const date = (value: unknown): Date | null => (value ? new Date(value as string) : null);

export const toDeposit = (row: Record<string, unknown>): Deposit => ({
  id: row.id as string, leadId: row.lead_id as string, versionId: row.dc_quote_version_id as string,
  amountCents: Number(row.amount_cents), method: row.method as DepositMethod, status: row.status as DepositStatus,
  stripeSessionId: (row.stripe_session_id as string | null) ?? null,
  stripePaymentIntentId: (row.stripe_payment_intent_id as string | null) ?? null,
  recordedBy: (row.recorded_by as string | null) ?? null,
  createdAt: new Date(row.created_at as string), paidAt: date(row.paid_at), refundedAt: date(row.refunded_at),
});

/**
 * The deposit picture for the portal and the Quote tab. Null until a DC contract is signed.
 * Anchored on the job's DEPOSIT, not blindly on the newest signed version (ruling P5, amended): a change
 * order signed after the deposit was paid must never hide that deposit. Among the signed or cancelled
 * versions, the one holding a paid deposit wins; else one holding a pending deposit; else the newest by
 * version. A refund never ranks a version: a job cancelled, refunded and re-signed is asked for a new
 * deposit on the new version. `refunded` still reports a refunded deposit on the chosen version.
 * (bool_or over no deposits is null, and desc sorts nulls first — hence the coalesce.)
 */
export async function depositState(leadId: string): Promise<DepositState | null> {
  if (!isUuid(leadId)) return null;
  const rows = await db()`
    with chosen as (
      select v.id
      from dc_quote_versions v
      left join lateral (
        select bool_or(d.status = 'paid') as has_paid,
               bool_or(d.status = 'pending') as has_pending
        from deposits d where d.dc_quote_version_id = v.id
      ) h on true
      where v.lead_id = ${leadId} and v.status in ('signed','cancelled')
        and v.client_total_cents is not null and v.signed_at is not null
      order by coalesce(h.has_paid, false) desc, coalesce(h.has_pending, false) desc, v.version desc
      limit 1
    )
    select v.id as version_id, v.version, v.status as version_status, v.client_total_cents, v.signed_at,
           l.status as job_status,
           d.id, d.lead_id, d.dc_quote_version_id, d.amount_cents, d.method, d.status, d.stripe_session_id,
           d.stripe_payment_intent_id, d.recorded_by, d.created_at, d.paid_at, d.refunded_at
    from dc_quote_versions v
    join chosen c on c.id = v.id
    join leads l on l.id = v.lead_id
    left join deposits d on d.dc_quote_version_id = v.id
    order by d.created_at desc nulls last`;
  const first = rows[0];
  if (!first || !isStage(first.job_status)) return null;
  const deposits = rows.filter((row) => row.id !== null).map(toDeposit);
  const soldCents = Number(first.client_total_cents);
  return {
    jobStatus: first.job_status, versionId: first.version_id as string, version: Number(first.version),
    versionStatus: first.version_status as "signed" | "cancelled", soldCents, amountCents: depositAmountCents(soldCents),
    signedAt: new Date(first.signed_at as string),
    paid: deposits.find((deposit) => deposit.status === "paid") ?? null,
    pending: deposits.find((deposit) => deposit.status === "pending") ?? null,
    refunded: deposits.find((deposit) => deposit.status === "refunded") ?? null,
  };
}

export async function depositById(id: string): Promise<Deposit | null> {
  if (!isUuid(id)) return null;
  const rows = await db()`select * from deposits where id = ${id}`;
  return rows[0] ? toDeposit(rows[0]) : null;
}

export async function depositBySession(sessionId: string): Promise<Deposit | null> {
  const rows = await db()`select * from deposits where stripe_session_id = ${sessionId}`;
  return rows[0] ? toDeposit(rows[0]) : null;
}

/**
 * A card checkout left pending for 23 hours is given up before Stripe's own 24-hour session expiry and
 * idempotency window end, so the next Pay starts a fresh session instead of replaying a dead one.
 */
export async function expireStaleDeposits(versionId: string): Promise<number> {
  if (!isUuid(versionId)) return 0;
  const rows = await db()`
    update deposits set status = 'expired'
    where dc_quote_version_id = ${versionId} and status = 'pending' and created_at < now() - interval '23 hours'
    returning id`;
  return rows.length;
}

/**
 * One statement: a pending card deposit for this version — inserted when the job and version are Signed,
 * nothing is paid and the amount is the stored half — or the pending one already there. The one-pending
 * index makes a second click's insert do nothing, so both clicks answer the same row (Review Focus 2).
 * The row's id is the Checkout Session's idempotency key.
 */
export async function claimStripeDeposit(input: { leadId: string; versionId: string; amountCents: number }): Promise<Deposit | null> {
  if (!isUuid(input.leadId) || !isUuid(input.versionId)) return null;
  // A $0 total has no deposit to take; deposits_amount_check would refuse the insert.
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return null;
  const rows = await db()`
    with inserted as (
      insert into deposits (id, lead_id, dc_quote_version_id, amount_cents, method, status)
      select ${randomUUID()}, v.lead_id, v.id, ${input.amountCents}, 'stripe', 'pending'
      from dc_quote_versions v join leads l on l.id = v.lead_id
      where v.id = ${input.versionId} and v.lead_id = ${input.leadId}
        and v.status = 'signed' and l.status = 'signed'
        and (v.client_total_cents + 1) / 2 = ${input.amountCents}
        and not exists (select 1 from deposits d where d.dc_quote_version_id = v.id and d.status = 'paid')
      on conflict do nothing
      returning *
    )
    select * from inserted
    union all
    select * from deposits
    where dc_quote_version_id = ${input.versionId} and lead_id = ${input.leadId}
      and status = 'pending' and method = 'stripe'
      and not exists (select 1 from inserted)
    limit 1`;
  return rows[0] ? toDeposit(rows[0]) : null;
}

/** The open card deposit, read in a fresh statement when a racing claim could not see it yet. */
export async function pendingStripeDeposit(versionId: string): Promise<Deposit | null> {
  if (!isUuid(versionId)) return null;
  const rows = await db()`
    select * from deposits where dc_quote_version_id = ${versionId} and status = 'pending' and method = 'stripe' limit 1`;
  return rows[0] ? toDeposit(rows[0]) : null;
}

export async function attachSession(depositId: string, sessionId: string): Promise<boolean> {
  if (!isUuid(depositId)) return false;
  const rows = await db()`
    update deposits set stripe_session_id = ${sessionId}
    where id = ${depositId} and status = 'pending' and (stripe_session_id is null or stripe_session_id = ${sessionId})
    returning id`;
  return rows.length > 0;
}

/**
 * Spec §4, the verified webhook's write. One statement, idempotent: it acts only on this card deposit,
 * for exactly the amount charged, while no deposit of the version is paid. The row may be pending, or
 * EXPIRED with the very session Stripe completed (ruling P11b): Stripe's verified completion is the
 * truth, so money actually taken is never dropped. Any OTHER pending card deposit of the version is
 * expired in the same statement. deposit_cents is written and a Signed job moves to Sold; a job the
 * owner moved elsewhere keeps its stage, and the payment is still recorded. A duplicate delivery finds
 * the row already paid, matches nothing and answers null.
 *
 * It answers the job's stage BEFORE the write (ruling P11c: the owners' receipt says when the job was not
 * in Signed, so they review it) and the Checkout Sessions of the pending rows it expired (ruling P11a: the
 * webhook closes them in Stripe, best-effort, so a second payment cannot follow).
 */
export async function markStripeDepositPaid(input: {
  depositId: string; sessionId: string; paymentIntentId: string | null; amountCents: number;
}): Promise<StripePaid | null> {
  if (!isUuid(input.depositId)) return null;
  const rows = await db()`
    with paid as (
      update deposits set status = 'paid', paid_at = now(), stripe_session_id = ${input.sessionId},
        stripe_payment_intent_id = ${input.paymentIntentId}
      where id = ${input.depositId} and method = 'stripe'
        and ((status = 'pending' and (stripe_session_id = ${input.sessionId} or stripe_session_id is null))
          or (status = 'expired' and stripe_session_id = ${input.sessionId}))
        and amount_cents = ${input.amountCents}
        and not exists (select 1 from deposits d where d.dc_quote_version_id = deposits.dc_quote_version_id and d.status = 'paid')
      returning lead_id, amount_cents, dc_quote_version_id
    ),
    others_expired as (
      update deposits set status = 'expired'
      where dc_quote_version_id = (select dc_quote_version_id from paid) and status = 'pending' and id <> ${input.depositId}
      returning id, stripe_session_id
    ),
    prev as (select l.status from leads l join paid on l.id = paid.lead_id),
    moved as (
      update leads set deposit_cents = (select amount_cents from paid),
        status = case when status = 'signed' then 'sold' else status end,
        stage_changed_at = case when status = 'signed' then now() else stage_changed_at end,
        updated_at = now()
      where id = (select lead_id from paid)
      returning id
    ),
    payment_logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${STRIPE_ACTOR}, 'payment', ${`Deposit ${formatCents(input.amountCents)} paid by card`} from paid
    ),
    stage_logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status, body)
      select moved.id, ${STRIPE_ACTOR}, 'stage', prev.status, 'sold', 'Deposit paid' from moved, prev
      where prev.status = 'signed'
    )
    select paid.lead_id, paid.dc_quote_version_id, (select status from prev) as stage_before,
      array(select stripe_session_id from others_expired where stripe_session_id is not null) as other_sessions
    from paid`;
  const row = rows[0];
  if (!row) return null;
  return {
    leadId: row.lead_id as string, versionId: row.dc_quote_version_id as string,
    stageBefore: (row.stage_before as string | null) ?? null,
    otherSessionIds: Array.isArray(row.other_sessions) ? (row.other_sessions as string[]) : [],
  };
}

/**
 * The owner's "Payment received": one statement inserts the paid row (Signed job and version, nothing
 * paid yet), expires any pending card checkout of the version, writes deposit_cents, moves Signed to
 * Sold and logs both. The caller closes the Stripe session first (closeCheckout).
 */
export async function recordDepositPayment(input: {
  leadId: string; versionId: string; amountCents: number; method: RecordedMethod; actor: string;
}): Promise<{ depositId: string } | null> {
  if (!isUuid(input.leadId) || !isUuid(input.versionId) || !isRecordedMethod(input.method)) return null;
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return null;
  const rows = await db()`
    with paid as (
      insert into deposits (id, lead_id, dc_quote_version_id, amount_cents, method, status, recorded_by, paid_at)
      select ${randomUUID()}, v.lead_id, v.id, ${input.amountCents}, ${input.method}, 'paid', ${input.actor}, now()
      from dc_quote_versions v join leads l on l.id = v.lead_id
      where v.id = ${input.versionId} and v.lead_id = ${input.leadId}
        and v.status = 'signed' and l.status = 'signed'
        and not exists (select 1 from deposits d where d.dc_quote_version_id = v.id and d.status = 'paid')
      returning id, lead_id, amount_cents
    ),
    expired as (
      update deposits set status = 'expired'
      where dc_quote_version_id = ${input.versionId} and status = 'pending' and exists (select 1 from paid)
      returning id
    ),
    prev as (select l.status from leads l join paid on l.id = paid.lead_id),
    moved as (
      update leads set deposit_cents = (select amount_cents from paid),
        status = case when status = 'signed' then 'sold' else status end,
        stage_changed_at = case when status = 'signed' then now() else stage_changed_at end,
        updated_at = now()
      where id = (select lead_id from paid)
      returning id
    ),
    payment_logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.actor}, 'payment',
        ${`Deposit ${formatCents(input.amountCents)} received ${RECEIVED[input.method]}`} from paid
    ),
    stage_logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status, body)
      select moved.id, ${input.actor}, 'stage', prev.status, 'sold', 'Deposit recorded' from moved, prev
      where prev.status = 'signed'
    )
    select id from paid`;
  return rows[0] ? { depositId: rows[0].id as string } : null;
}

/**
 * Gives up one pending deposit that never got a Checkout Session: the portal's replacement for a row
 * too old for its session to open (ruling P14). A row that has a session is left to expireDeposit.
 */
export async function expireSessionlessDeposit(depositId: string): Promise<boolean> {
  if (!isUuid(depositId)) return false;
  const rows = await db()`
    update deposits set status = 'expired' where id = ${depositId} and status = 'pending' and stripe_session_id is null
    returning id`;
  return rows.length > 0;
}

/** checkout.session.expired: only a pending deposit expires, so an expiry after payment changes nothing. */
export async function expireDeposit(sessionId: string): Promise<boolean> {
  const rows = await db()`
    update deposits set status = 'expired' where stripe_session_id = ${sessionId} and status = 'pending'
    returning id`;
  return rows.length > 0;
}

/**
 * Cancel & refund (spec §4), after any Stripe refund succeeded. One statement: the paid deposit →
 * refunded (only at the amount the owner saw), its version signed → cancelled, the job → Lost with
 * deposit_cents cleared, and a 'payment' and a 'stage' event. The leads update is gated on the refunded
 * row only, so a job the owner had already moved to Lost still has deposit_cents cleared; it keeps its
 * own lost reason, follow-up and stage date, and gets no second stage event. (One update, not two
 * CTEs on the same row: Postgres applies only one of two updates to a row in one statement.)
 */
export async function cancelDeposit(input: { leadId: string; deposit: Deposit; actor: string }): Promise<boolean> {
  if (!isUuid(input.leadId) || !isUuid(input.deposit.id)) return false;
  const amount = formatCents(input.deposit.amountCents);
  const body = input.deposit.method === "stripe"
    ? `Deposit ${amount} refunded to the client's card`
    : `Deposit ${amount} (${input.deposit.method}) marked refunded — return it to the client`;
  const rows = await db()`
    with refunded as (
      update deposits set status = 'refunded', refunded_at = now()
      where id = ${input.deposit.id} and lead_id = ${input.leadId} and status = 'paid' and amount_cents = ${input.deposit.amountCents}
      returning lead_id, dc_quote_version_id
    ),
    cancelled as (
      update dc_quote_versions set status = 'cancelled', cancelled_at = now()
      where id = (select dc_quote_version_id from refunded) and status = 'signed'
      returning id
    ),
    prev as (select l.status from leads l join refunded r on l.id = r.lead_id),
    lost as (
      update leads set deposit_cents = null, status = 'lost',
        lost_reason = case when status <> 'lost' then ${CANCEL_REASON} else lost_reason end,
        follow_up_at = case when status <> 'lost' then null else follow_up_at end,
        follow_up_note = case when status <> 'lost' then null else follow_up_note end,
        stage_changed_at = case when status <> 'lost' then now() else stage_changed_at end,
        updated_at = now()
      where id = (select lead_id from refunded)
      returning id
    ),
    payment_logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.actor}, 'payment', ${body} from refunded
    ),
    stage_logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status, body)
      select lost.id, ${input.actor}, 'stage', prev.status, 'lost', ${CANCEL_REASON} from lost, prev
      where prev.status <> 'lost'
    )
    select lead_id from refunded`;
  return rows.length > 0;
}
