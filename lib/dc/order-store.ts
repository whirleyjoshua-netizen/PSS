import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import { formatCents } from "@/lib/admin/money";
import type { HdOrder } from "./order-parse";

/** Only these stages move to Ordered on HD's confirmation: the order follows the contract. Never backwards, never from Lost. */
export const ORDERABLE_STAGES = ["signed", "sold", "measure"] as const;

export type StoredOrder = {
  id: string; leadId: string; option: string; poReference: string; hdOrderNo: string; orderDate: string;
  subtotalCents: number; oversizeCents: number; handlingCents: number; taxCents: number; totalCents: number;
  /** The option's dealer total (before tax) when the order arrived; null when the option had no quote. */
  quotedDealerTotalCents: number | null;
  fileId: string | null; receivedAt: Date;
};

export async function orderRecorded(hdOrderNo: string): Promise<boolean> {
  const rows = await db()`select 1 from dc_orders where hd_order_no = ${hdOrderNo}`;
  return rows.length > 0;
}

/**
 * One statement: the message record, the order, the job's move to Ordered (only from Signed, Sold or Official
 * measure), its order date when it has none, and the timeline entry. A job already at or past Ordered, or before
 * Signed, keeps its stage and gets a 'quote' entry instead. Null when the message or the order number was
 * already recorded, so nothing else is written.
 */
export async function recordOrder(input: { messageId: string; receivedAt: Date; leadId: string; order: HdOrder; fileId: string | null; actor: string }): Promise<{ fromStatus: string; toStatus: string; quotedDealerTotalCents: number | null } | null> {
  const o = input.order;
  const orderable: string[] = [...ORDERABLE_STAGES];
  const body = `HD order ${o.orderNo} confirmed for ${o.poReference}: ${formatCents(o.totalCents)} including ${formatCents(o.taxCents)} tax`;
  const rows = await db()`
    with msg as (
      insert into ingested_messages (message_id, received_at, outcome, lead_id, po_reference, detail)
      values (${input.messageId}, ${input.receivedAt}, 'ordered', ${input.leadId}, ${o.poReference}, ${`HD order ${o.orderNo}`})
      on conflict (message_id) do nothing
      returning message_id
    ),
    quoted as (
      select id, dealer_total_cents from dc_quote_versions
      where lead_id = ${input.leadId} and option = ${o.option} and status not in ('superseded', 'cancelled')
      order by (status = 'signed') desc, version desc
      limit 1
    ),
    placed as (
      insert into dc_orders (id, lead_id, option, po_reference, hd_order_no, order_date, subtotal_cents, oversize_cents,
        handling_cents, tax_cents, total_cents, quoted_dealer_total_cents, quote_version_id, file_id, message_id, received_at)
      select ${randomUUID()}, ${input.leadId}, ${o.option}, ${o.poReference}, ${o.orderNo}, ${o.orderDate}::date,
        ${o.subtotalCents}, ${o.oversizeCents}, ${o.handlingCents}, ${o.taxCents}, ${o.totalCents},
        (select dealer_total_cents from quoted), (select id from quoted), ${input.fileId}, msg.message_id, ${input.receivedAt}
      from msg
      on conflict (hd_order_no) do nothing
      returning lead_id
    ),
    prev as (select id, status from leads where id = ${input.leadId}),
    updated as (
      update leads set
        status = case when leads.status = any(${orderable}::text[]) then 'ordered' else leads.status end,
        stage_changed_at = case when leads.status = any(${orderable}::text[]) then now() else leads.stage_changed_at end,
        ordered_on = coalesce(leads.ordered_on, ${o.orderDate}::date),
        updated_at = now()
      from prev, placed
      where leads.id = prev.id and placed.lead_id = prev.id
      returning leads.id, prev.status as from_status, leads.status as to_status
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status, body)
      select id, ${input.actor},
        case when from_status <> to_status then 'stage' else 'quote' end,
        case when from_status <> to_status then from_status end,
        case when from_status <> to_status then to_status end,
        ${body}
      from updated
    )
    select updated.from_status, updated.to_status, (select dealer_total_cents from quoted) as quoted from updated`;
  const row = rows[0];
  return row ? { fromStatus: row.from_status as string, toStatus: row.to_status as string, quotedDealerTotalCents: row.quoted === null ? null : Number(row.quoted) } : null;
}

/** DC's receipt for a submitted order, matched to its job. A second record for the same message is a no-op. */
export async function recordReceipt(input: { messageId: string; receivedAt: Date; leadId: string; quoteNo: string; poReference: string }): Promise<void> {
  await db()`
    insert into ingested_messages (message_id, received_at, outcome, lead_id, dc_quote_no, po_reference)
    values (${input.messageId}, ${input.receivedAt}, 'receipt', ${input.leadId}, ${input.quoteNo}, ${input.poReference})
    on conflict (message_id) do nothing`;
}

export type StaleReceipt = { messageId: string; leadId: string; quoteNo: string | null; poReference: string; receivedAt: Date };

/**
 * Receipts received before `before` that no HD order email for the same PO has followed, and that the owners have
 * not been told about. Any HD order email counts, recorded or refused: a refusal already emailed the owners. Only
 * order mail stores a PO here. One counts when it arrived no more than an hour before the receipt.
 */
export async function staleReceipts(before: Date): Promise<StaleReceipt[]> {
  const rows = await db()`
    select m.message_id, m.lead_id, m.dc_quote_no, m.po_reference, m.received_at from ingested_messages m
    where m.outcome = 'receipt' and m.warned_at is null and m.lead_id is not null and m.received_at < ${before}
      and not exists (
        select 1 from ingested_messages x
        where x.po_reference = m.po_reference and x.outcome <> 'receipt' and x.received_at >= m.received_at - interval '1 hour'
      )
    order by m.received_at`;
  return rows.map((r) => ({
    messageId: r.message_id as string, leadId: r.lead_id as string, quoteNo: (r.dc_quote_no as string | null) ?? null,
    poReference: r.po_reference as string, receivedAt: new Date(r.received_at as string),
  }));
}

export async function markReceiptsWarned(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  await db()`update ingested_messages set warned_at = now() where message_id = any(${messageIds}) and outcome = 'receipt'`;
}

/** The job's HD orders, newest first. */
export async function listOrders(leadId: string): Promise<StoredOrder[]> {
  if (!isUuid(leadId)) return [];
  const rows = await db()`
    select id, lead_id, option, po_reference, hd_order_no, order_date::text as order_date, subtotal_cents, oversize_cents,
      handling_cents, tax_cents, total_cents, quoted_dealer_total_cents, file_id, received_at
    from dc_orders where lead_id = ${leadId} order by received_at desc`;
  return rows.map((r) => ({
    id: r.id as string, leadId: r.lead_id as string, option: r.option as string, poReference: r.po_reference as string,
    hdOrderNo: r.hd_order_no as string, orderDate: r.order_date as string,
    subtotalCents: Number(r.subtotal_cents), oversizeCents: Number(r.oversize_cents), handlingCents: Number(r.handling_cents),
    taxCents: Number(r.tax_cents), totalCents: Number(r.total_cents),
    quotedDealerTotalCents: r.quoted_dealer_total_cents === null ? null : Number(r.quoted_dealer_total_cents),
    fileId: (r.file_id as string | null) ?? null, receivedAt: new Date(r.received_at as string),
  }));
}
