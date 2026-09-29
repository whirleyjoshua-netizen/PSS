import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import { formatCents } from "@/lib/admin/money";
import type { TreatmentType } from "@/lib/leads/treatment-types";
import type { Basis, ExtraKind, PricedExtra, PricedQuote } from "./install-pricing";

export type InstallQuoteKind = "estimate" | "final";

export type SavedInstallLine = {
  treatment: TreatmentType;
  basis: Basis;
  quantity: number;
  rateCents: number;
  hardSurface: boolean;
  highLadder: boolean;
  motorized: boolean;
  amountCents: number;
};

export type SavedInstallExtra = PricedExtra;

export type SavedInstallQuote = {
  id: string;
  kind: InstallQuoteKind;
  minimumCents: number;
  subtotalCents: number;
  /** The measuring fee this price charged; 0 when the job was not charged for measuring. */
  measureCents: number;
  /** What this price charged in extras; 0 for prices saved before extras existed. */
  extrasCents: number;
  totalCents: number;
  createdBy: string;
  createdAt: Date;
  lines: SavedInstallLine[];
  extras: SavedInstallExtra[];
};

/**
 * A snapshot is written once and never edited. The rate and basis are copied onto
 * each line so raising a rate later cannot rewrite what was quoted.
 */
export async function saveInstallQuote(
  leadId: string,
  kind: InstallQuoteKind,
  priced: PricedQuote,
  minimumCents: number,
  actor: string,
): Promise<string> {
  if (!isUuid(leadId)) throw new Error("Not a job id");
  const lines = priced.lines;
  const label = kind === "estimate" ? "Estimate" : "Final";
  // One data-modifying statement, so the quote, its lines, its extras and its history event are saved all-or-nothing.
  const [row] = await db()`
    with quote as (
      insert into install_quotes (lead_id, kind, minimum_cents, subtotal_cents, measure_cents, extras_cents, total_cents, created_by)
      values (${leadId}, ${kind}, ${minimumCents}, ${priced.subtotalCents}, ${priced.measureCents}, ${priced.extrasCents}, ${priced.totalCents}, ${actor})
      returning id, lead_id
    ),
    lines as (
      insert into install_quote_lines
        (install_quote_id, position, treatment, basis, quantity, rate_cents,
         hard_surface, high_ladder, motorized, amount_cents)
      select quote.id, l.position, l.treatment, l.basis, l.quantity, l.rate_cents,
             l.hard_surface, l.high_ladder, l.motorized, l.amount_cents
      from quote, unnest(
        ${lines.map((_, position) => position)}::int[],
        ${lines.map((line) => line.treatment)}::text[],
        ${lines.map((line) => line.basis)}::text[],
        ${lines.map((line) => line.quantity)}::int[],
        ${lines.map((line) => line.rateCents)}::int[],
        ${lines.map((line) => line.hardSurface)}::boolean[],
        ${lines.map((line) => line.highLadder)}::boolean[],
        ${lines.map((line) => line.motorized)}::boolean[],
        ${lines.map((line) => line.amountCents)}::int[]
      ) as l(position, treatment, basis, quantity, rate_cents, hard_surface, high_ladder, motorized, amount_cents)
    ),
    extras as (
      insert into install_quote_extras (install_quote_id, position, kind, quantity, rate_cents, amount_cents)
      select quote.id, e.position, e.kind, e.quantity, e.rate_cents, e.amount_cents
      from quote, unnest(
        ${priced.extras.map((_, position) => position)}::int[],
        ${priced.extras.map((extra) => extra.kind)}::text[],
        ${priced.extras.map((extra) => extra.quantity)}::int[],
        ${priced.extras.map((extra) => extra.rateCents)}::int[],
        ${priced.extras.map((extra) => extra.amountCents)}::int[]
      ) as e(position, kind, quantity, rate_cents, amount_cents)
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'edit', ${`${label} installation price: ${formatCents(priced.totalCents)}`} from quote
    )
    select id from quote`;
  return row.id as string;
}

export async function listInstallQuotes(leadId: string): Promise<SavedInstallQuote[]> {
  if (!isUuid(leadId)) return [];
  const quoteRows = await db()`select id, kind, minimum_cents, subtotal_cents, measure_cents, extras_cents, total_cents, created_by, created_at
    from install_quotes where lead_id = ${leadId} order by created_at desc`;
  if (quoteRows.length === 0) return [];
  const ids = quoteRows.map((row) => row.id as string);
  const lineRows = await db()`select install_quote_id, treatment, basis, quantity, rate_cents,
      hard_surface, high_ladder, motorized, amount_cents
    from install_quote_lines where install_quote_id = any(${ids}) order by position`;
  const extraRows = await db()`select install_quote_id, kind, quantity, rate_cents, amount_cents
    from install_quote_extras where install_quote_id = any(${ids}) order by position`;
  return quoteRows.map((row) => ({
    id: row.id as string,
    kind: row.kind as InstallQuoteKind,
    minimumCents: Number(row.minimum_cents),
    subtotalCents: Number(row.subtotal_cents),
    measureCents: Number(row.measure_cents),
    extrasCents: Number(row.extras_cents),
    totalCents: Number(row.total_cents),
    createdBy: row.created_by as string,
    createdAt: new Date(row.created_at as string),
    lines: lineRows
      .filter((line) => line.install_quote_id === row.id)
      .map((line) => ({
        treatment: line.treatment as TreatmentType,
        basis: line.basis as Basis,
        quantity: Number(line.quantity),
        rateCents: Number(line.rate_cents),
        hardSurface: Boolean(line.hard_surface),
        highLadder: Boolean(line.high_ladder),
        motorized: Boolean(line.motorized),
        amountCents: Number(line.amount_cents),
      })),
    extras: extraRows
      .filter((extra) => extra.install_quote_id === row.id)
      .map((extra) => ({
        kind: extra.kind as ExtraKind,
        quantity: Number(extra.quantity),
        rateCents: Number(extra.rate_cents),
        amountCents: Number(extra.amount_cents),
      })),
  }));
}
