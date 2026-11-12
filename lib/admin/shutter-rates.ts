import "server-only";
import { db } from "@/lib/db";
import type { Basis } from "./install-pricing";
import {
  NO_FREIGHT, SUPPLIERS, type OptionKind, type RatesInput, type ShutterInstallRate, type ShutterRates, type Supplier,
} from "./shutter-pricing";

export async function getShutterRates(): Promise<ShutterRates> {
  const sql = db();
  const [lines, options, freight, settings] = await Promise.all([
    sql`select id, supplier, name, cost_cents_per_sqft, min_sqft from shutter_lines order by supplier, position, name`,
    sql`select id, supplier, name, kind, amount from shutter_options order by supplier, position, name`,
    sql`select * from shutter_freight`,
    sql`select markup_hundredths from shutter_settings where id = true`,
  ]);
  const freightBySupplier = new Map(freight.map((row) => [row.supplier as Supplier, row]));
  return {
    lines: lines.map((row) => ({
      id: String(row.id), supplier: row.supplier as Supplier, name: String(row.name),
      costCentsPerSqft: Number(row.cost_cents_per_sqft), minSqft: Number(row.min_sqft),
    })),
    options: options.map((row) => ({
      id: String(row.id), supplier: row.supplier as Supplier, name: String(row.name),
      kind: row.kind as OptionKind, amount: Number(row.amount),
    })),
    freight: SUPPLIERS.map((supplier) => {
      const row = freightBySupplier.get(supplier);
      if (!row) return NO_FREIGHT(supplier);
      return {
        supplier,
        firstCents: Number(row.first_cents),
        additionalCents: Number(row.additional_cents),
        oversizeWidthEighths: Number(row.oversize_width_eighths),
        oversizeFirstCents: Number(row.oversize_first_cents),
        oversizeAdditionalCents: Number(row.oversize_additional_cents),
        perSqftCents: Number(row.per_sqft_cents),
        minSqft: Number(row.min_sqft),
      };
    }),
    markupHundredths: settings[0]?.markup_hundredths == null ? null : Number(settings[0].markup_hundredths),
  };
}

/** The shutter row of Settings → Installation rates, the one place the install charge is set. */
export async function getShutterInstallRate(): Promise<ShutterInstallRate> {
  const rows = await db()`select basis, rate_cents from install_rates where treatment = 'shutters'`;
  const row = rows[0];
  return row ? { basis: row.basis as Basis, rateCents: Number(row.rate_cents) } : null;
}

/**
 * Replaces every rate in one statement. Nothing references these rows (quotes are not
 * saved), so delete-and-insert is safe, and position keeps the order as entered.
 */
export async function saveShutterRates(rates: RatesInput, actor: string): Promise<void> {
  const { lines, options, freight } = rates;
  await db()`
    with removed_lines as (delete from shutter_lines),
    removed_options as (delete from shutter_options),
    added_lines as (
      insert into shutter_lines (supplier, name, cost_cents_per_sqft, min_sqft, position)
      select supplier, name, cost, min_sqft, ord - 1
      from unnest(${lines.map((l) => l.supplier)}::text[], ${lines.map((l) => l.name)}::text[],
        ${lines.map((l) => l.costCentsPerSqft)}::int[], ${lines.map((l) => l.minSqft)}::int[])
        with ordinality as incoming(supplier, name, cost, min_sqft, ord)
    ),
    added_options as (
      insert into shutter_options (supplier, name, kind, amount, position)
      select supplier, name, kind, amount, ord - 1
      from unnest(${options.map((o) => o.supplier)}::text[], ${options.map((o) => o.name)}::text[],
        ${options.map((o) => o.kind)}::text[], ${options.map((o) => o.amount)}::int[])
        with ordinality as incoming(supplier, name, kind, amount, ord)
    ),
    freight_rows as (
      insert into shutter_freight (supplier, first_cents, additional_cents, oversize_width_eighths,
        oversize_first_cents, oversize_additional_cents, per_sqft_cents, min_sqft)
      select * from unnest(${freight.map((f) => f.supplier)}::text[], ${freight.map((f) => f.firstCents)}::int[],
        ${freight.map((f) => f.additionalCents)}::int[], ${freight.map((f) => f.oversizeWidthEighths)}::int[],
        ${freight.map((f) => f.oversizeFirstCents)}::int[], ${freight.map((f) => f.oversizeAdditionalCents)}::int[],
        ${freight.map((f) => f.perSqftCents)}::int[], ${freight.map((f) => f.minSqft)}::int[])
      on conflict (supplier) do update set
        first_cents = excluded.first_cents, additional_cents = excluded.additional_cents,
        oversize_width_eighths = excluded.oversize_width_eighths, oversize_first_cents = excluded.oversize_first_cents,
        oversize_additional_cents = excluded.oversize_additional_cents, per_sqft_cents = excluded.per_sqft_cents,
        min_sqft = excluded.min_sqft
    )
    update shutter_settings set markup_hundredths = ${rates.markupHundredths}, updated_by = ${actor}, updated_at = now()
    where id = true`;
}
