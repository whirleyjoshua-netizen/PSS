import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import { formatCents } from "@/lib/admin/money";
import type { TreatmentType } from "@/lib/leads/treatment-types";
import type { Basis, PricedQuote } from "./install-pricing";

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

export type SavedInstallQuote = {
  id: string;
  kind: InstallQuoteKind;
  minimumCents: number;
  subtotalCents: number;
  totalCents: number;
  createdBy: string;
  createdAt: Date;
  lines: SavedInstallLine[];
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
  const [row] = await db()`insert into install_quotes
      (lead_id, kind, minimum_cents, subtotal_cents, total_cents, created_by)
    values (${leadId}, ${kind}, ${minimumCents}, ${priced.subtotalCents}, ${priced.totalCents}, ${actor})
    returning id`;
  const id = row.id as string;
  for (const [position, line] of priced.lines.entries()) {
    await db()`insert into install_quote_lines
        (install_quote_id, position, treatment, basis, quantity, rate_cents,
         hard_surface, high_ladder, motorized, amount_cents)
      values (${id}, ${position}, ${line.treatment}, ${line.basis}, ${line.quantity}, ${line.rateCents},
         ${line.hardSurface}, ${line.highLadder}, ${line.motorized}, ${line.amountCents})`;
  }
  const label = kind === "estimate" ? "Estimate" : "Final";
  await db()`insert into job_events (lead_id, actor, kind, body)
    values (${leadId}, ${actor}, 'edit', ${`${label} installation price: ${formatCents(priced.totalCents)}`})`;
  return id;
}

export async function listInstallQuotes(leadId: string): Promise<SavedInstallQuote[]> {
  if (!isUuid(leadId)) return [];
  const quoteRows = await db()`select id, kind, minimum_cents, subtotal_cents, total_cents, created_by, created_at
    from install_quotes where lead_id = ${leadId} order by created_at desc`;
  if (quoteRows.length === 0) return [];
  const ids = quoteRows.map((row) => row.id as string);
  const lineRows = await db()`select install_quote_id, treatment, basis, quantity, rate_cents,
      hard_surface, high_ladder, motorized, amount_cents
    from install_quote_lines where install_quote_id = any(${ids}) order by position`;
  return quoteRows.map((row) => ({
    id: row.id as string,
    kind: row.kind as InstallQuoteKind,
    minimumCents: Number(row.minimum_cents),
    subtotalCents: Number(row.subtotal_cents),
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
  }));
}
