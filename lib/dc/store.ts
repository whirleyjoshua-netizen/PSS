import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import type { DcLine, DcQuote, ImportOutcome } from "./types";

export type StoredLine = DcLine & { pctOverride: number | null; markupPct: number | null; sellUnitCents: number | null; markupOverridden: boolean };
export type StoredVersion = {
  id: string; leadId: string; version: number; dcQuoteNo: string; poReference: string;
  sourceFileId: string; sourceSha256: string; status: "draft" | "sent" | "signed" | "superseded";
  subtotalCents: number; handlingFeeCents: number; oversizedFeeCents: number; dealerTotalCents: number;
  waiveHandling: boolean; noInstall: boolean;
  installQuoteId: string | null; installCents: number | null; productsCents: number | null; clientTotalCents: number | null;
  contractFileId: string | null; sentAt: Date | null; signedAt: Date | null; createdAt: Date; lines: StoredLine[];
};
export type DcSettings = { termsPathname: string | null; termsUpdatedAt: Date | null; lastPolledAt: Date | null };

/** 0.01–1000 with at most two decimals. A tolerance, because 64.1 * 100 is 6409.999999999999 in floating point. */
const validPct = (pct: number) =>
  Number.isFinite(pct) && pct > 0 && pct <= 1000 && Math.abs(pct * 100 - Math.round(pct * 100)) < 1e-6;

export async function isProcessed(messageId: string): Promise<boolean> {
  const rows = await db()`select 1 from ingested_messages where message_id = ${messageId}`;
  return rows.length > 0;
}

/** Records a non-imported outcome. A second record for the same message is a no-op. */
export async function recordOutcome(input: { messageId: string; receivedAt: Date; outcome: ImportOutcome; leadId: string | null; dcQuoteNo: string | null; detail: string | null }): Promise<void> {
  await db()`
    insert into ingested_messages (message_id, received_at, outcome, lead_id, dc_quote_no, detail)
    values (${input.messageId}, ${input.receivedAt}, ${input.outcome}, ${input.leadId}, ${input.dcQuoteNo}, ${input.detail})
    on conflict (message_id) do nothing`;
}

export async function findJobByProjectNo(projectNo: number): Promise<{ id: string; name: string; projectNo: number } | null> {
  const rows = await db()`select id, name, project_no from leads where project_no = ${projectNo}`;
  return rows[0] ? { id: rows[0].id as string, name: rows[0].name as string, projectNo: Number(rows[0].project_no) } : null;
}

export async function latestSha(leadId: string): Promise<string | null> {
  const rows = await db()`select source_sha256 from dc_quote_versions where lead_id = ${leadId} order by version desc limit 1`;
  return (rows[0]?.source_sha256 as string | undefined) ?? null;
}

/**
 * One statement: the message record, the version (numbered max+1 for the job), every line and
 * the timeline event. If the message was already recorded, `on conflict do nothing` returns no
 * row from `msg`, so nothing else is written and this answers null.
 */
export async function importVersion(input: { messageId: string; receivedAt: Date; leadId: string; quote: DcQuote; sourceFileId: string; sha256: string; actor: string }): Promise<{ versionId: string; version: number } | null> {
  const q = input.quote;
  const lines = JSON.stringify(q.lines.map((l) => ({
    position: l.position, qty: l.qty, room: l.room, description: l.description, collection: l.collection,
    base_cents: l.baseCents, promotion_cents: l.promotionCents, options_cents: l.optionsCents,
    msrp_unit_cents: l.msrpUnitCents, cost_factor: l.costFactor, cost_unit_cents: l.costUnitCents,
    cost_extended_cents: l.costExtendedCents, options: l.options,
  })));
  const rows = await db()`
    with msg as (
      insert into ingested_messages (message_id, received_at, outcome, lead_id, dc_quote_no)
      values (${input.messageId}, ${input.receivedAt}, 'imported', ${input.leadId}, ${q.quoteNo})
      on conflict (message_id) do nothing
      returning message_id
    ),
    version as (
      insert into dc_quote_versions (id, lead_id, version, dc_quote_no, po_reference, source_file_id, source_sha256,
        message_id, status, dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents)
      select ${randomUUID()}, ${input.leadId},
        coalesce((select max(version) from dc_quote_versions where lead_id = ${input.leadId}), 0) + 1,
        ${q.quoteNo}, ${q.poReference}, ${input.sourceFileId}, ${input.sha256}, msg.message_id, 'draft',
        ${q.subtotalCents}, ${q.handlingFeeCents}, ${q.oversizedFeeCents}, ${q.dealerTotalCents}
      from msg
      returning id, lead_id, version
    ),
    inserted as (
      insert into dc_quote_lines (version_id, position, qty, room, description, collection, base_cents, promotion_cents,
        options_cents, msrp_unit_cents, cost_factor, cost_unit_cents, cost_extended_cents, options)
      select version.id, l.position, l.qty, l.room, l.description, l.collection, l.base_cents, l.promotion_cents,
        l.options_cents, l.msrp_unit_cents, l.cost_factor, l.cost_unit_cents, l.cost_extended_cents, l.options
      from version, jsonb_to_recordset(${lines}::jsonb) as l(position int, qty int, room text, description text,
        collection text, base_cents int, promotion_cents int, options_cents int, msrp_unit_cents int,
        cost_factor numeric, cost_unit_cents int, cost_extended_cents int, options jsonb)
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.actor}, 'quote', ${`Direct Connect quote ${q.quoteNo} arrived as version `} || version from version
    )
    select id, version from version`;
  return rows[0] ? { versionId: rows[0].id as string, version: Number(rows[0].version) } : null;
}

const toLine = (r: Record<string, unknown>): StoredLine => ({
  position: Number(r.position), qty: Number(r.qty), room: r.room as string, description: r.description as string,
  collection: r.collection as string, baseCents: Number(r.base_cents), promotionCents: Number(r.promotion_cents),
  optionsCents: Number(r.options_cents), msrpUnitCents: Number(r.msrp_unit_cents),
  costFactor: r.cost_factor === null ? null : String(r.cost_factor), costUnitCents: Number(r.cost_unit_cents),
  costExtendedCents: Number(r.cost_extended_cents), options: r.options as [string, string][],
  pctOverride: r.pct_override === null ? null : Number(r.pct_override),
  markupPct: r.markup_pct === null ? null : Number(r.markup_pct),
  sellUnitCents: r.sell_unit_cents === null ? null : Number(r.sell_unit_cents),
  markupOverridden: r.markup_overridden === true,
});

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const date = (v: unknown) => (v ? new Date(v as string) : null);

/** Every version of the job, newest first, each with its lines in printed order. */
export async function listVersions(leadId: string): Promise<StoredVersion[]> {
  if (!isUuid(leadId)) return [];
  const versions = await db()`select * from dc_quote_versions where lead_id = ${leadId} order by version desc`;
  if (versions.length === 0) return [];
  const ids = versions.map((v) => v.id as string);
  const lines = await db()`select * from dc_quote_lines where version_id = any(${ids}) order by position`;
  return versions.map((v) => ({
    id: v.id as string, leadId: v.lead_id as string, version: Number(v.version), dcQuoteNo: v.dc_quote_no as string,
    poReference: v.po_reference as string, sourceFileId: v.source_file_id as string, sourceSha256: v.source_sha256 as string,
    status: v.status as StoredVersion["status"], subtotalCents: Number(v.dealer_subtotal_cents),
    handlingFeeCents: Number(v.handling_fee_cents), oversizedFeeCents: Number(v.oversized_fee_cents),
    dealerTotalCents: Number(v.dealer_total_cents), waiveHandling: v.waive_handling === true, noInstall: v.no_install === true,
    installQuoteId: (v.install_quote_id as string | null) ?? null, installCents: num(v.install_cents),
    productsCents: num(v.products_cents), clientTotalCents: num(v.client_total_cents),
    contractFileId: (v.contract_file_id as string | null) ?? null, sentAt: date(v.sent_at), signedAt: date(v.signed_at),
    createdAt: new Date(v.created_at as string),
    lines: lines.filter((l) => l.version_id === v.id).map(toLine),
  }));
}

/** Sets or clears one line's % of MSRP, only on a draft of this job, and logs it in the same statement. */
export async function setLineOverride(leadId: string, versionId: string, position: number, pct: number | null, actor: string): Promise<boolean> {
  if (!isUuid(leadId) || !isUuid(versionId) || !Number.isInteger(position)) return false;
  if (pct !== null && !validPct(pct)) return false;
  const rows = await db()`
    with changed as (
      update dc_quote_lines set pct_override = ${pct}
      where version_id = ${versionId} and position = ${position}
        and version_id in (select id from dc_quote_versions where id = ${versionId} and lead_id = ${leadId} and status = 'draft')
      returning position
    )
    insert into job_events (lead_id, actor, kind, body)
    select ${leadId}, ${actor}, 'quote', ${pct === null ? `Line ${position}: back to the Settings markup` : `Line ${position}: ${pct}% of MSRP`} from changed
    returning id`;
  return rows.length > 0;
}

/** Waive-handling and no-install choices; an omitted choice keeps its value. Drafts of this job only. */
export async function setVersionChoices(leadId: string, versionId: string, choices: { waiveHandling?: boolean; noInstall?: boolean }): Promise<boolean> {
  if (!isUuid(leadId) || !isUuid(versionId)) return false;
  const rows = await db()`
    update dc_quote_versions set
      waive_handling = coalesce(${choices.waiveHandling ?? null}::boolean, waive_handling),
      no_install = coalesce(${choices.noInstall ?? null}::boolean, no_install)
    where id = ${versionId} and lead_id = ${leadId} and status = 'draft'
    returning id`;
  return rows.length > 0;
}

export async function listMarkupRules(): Promise<Record<string, number>> {
  const rows = await db()`select collection, pct_of_msrp from markup_rules order by lower(collection), collection`;
  return Object.fromEntries(rows.map((r) => [r.collection as string, Number(r.pct_of_msrp)]));
}

/**
 * Every product line any imported quote has used, plus every ruled one, once each ignoring case
 * ("Duette" and "DUETTE" are one line), spelled as its rule is when it has one, sorted.
 */
export async function listSeenCollections(): Promise<string[]> {
  const rows = await db()`
    select collection from (
      select distinct on (lower(collection)) collection from (
        select collection, 0 as ruled_first from markup_rules
        union all select trim(collection), 1 from dc_quote_lines
      ) seen
      order by lower(collection), ruled_first, collection
    ) folded
    order by lower(collection), collection`;
  return rows.map((r) => r.collection as string);
}

export async function saveMarkupRule(collection: string, pct: number | null, actor: string): Promise<void> {
  const name = collection.trim();
  if (!name) throw new Error("A product line needs a name");
  if (pct === null) {
    await db()`delete from markup_rules where lower(collection) = lower(${name})`;
    return;
  }
  if (!validPct(pct)) throw new Error("Enter a percentage between 0.01 and 1000");
  // One statement: other-case spellings of this line go, so exactly one rule prices it.
  await db()`
    with gone as (
      delete from markup_rules where lower(collection) = lower(${name}) and collection <> ${name}
    )
    insert into markup_rules (collection, pct_of_msrp, updated_by, updated_at)
    values (${name}, ${pct}, ${actor}, now())
    on conflict (collection) do update set pct_of_msrp = excluded.pct_of_msrp, updated_by = excluded.updated_by, updated_at = now()`;
}

export async function getDcSettings(): Promise<DcSettings> {
  const [row] = await db()`select terms_file_pathname, terms_updated_at, last_polled_at from dc_settings where id`;
  return {
    termsPathname: (row?.terms_file_pathname as string | null) ?? null,
    termsUpdatedAt: date(row?.terms_updated_at), lastPolledAt: date(row?.last_polled_at),
  };
}

/** Points the terms at a new stored file and answers the pathname it replaced. */
export async function saveTermsPathname(pathname: string, actor: string): Promise<string | null> {
  const rows = await db()`
    with prev as (select terms_file_pathname from dc_settings where id)
    update dc_settings set terms_file_pathname = ${pathname}, terms_updated_by = ${actor}, terms_updated_at = now()
    where id returning (select terms_file_pathname from prev) as previous`;
  return (rows[0]?.previous as string | null) ?? null;
}

export async function setLastPolledAt(at: Date): Promise<void> {
  await db()`update dc_settings set last_polled_at = ${at} where id`;
}
