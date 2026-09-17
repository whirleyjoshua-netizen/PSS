import "server-only";
import { db } from "@/lib/db";
import type { TreatmentType } from "@/lib/leads/treatment-types";
import type { Basis, InstallRate, InstallSettings } from "./install-pricing";

const ZERO: InstallSettings = {
  minimumCents: 0, hardSurfaceCents: 0, highLadderCents: 0, motorizedCents: 0, measureCents: 0,
};

/** Only treatments the owner has actually priced. A missing row is "not set yet". */
export async function listInstallRates(): Promise<InstallRate[]> {
  const rows = await db()`select treatment, basis, rate_cents from install_rates order by treatment`;
  return rows.map((row) => ({
    treatment: row.treatment as TreatmentType,
    basis: row.basis as Basis,
    rateCents: Number(row.rate_cents),
  }));
}

export async function getInstallSettings(): Promise<InstallSettings> {
  const rows = await db()`select minimum_cents, hard_surface_cents, high_ladder_cents, motorized_cents, measure_cents
    from install_settings where id = true`;
  const row = rows[0];
  if (!row) return ZERO;
  return {
    minimumCents: Number(row.minimum_cents),
    hardSurfaceCents: Number(row.hard_surface_cents),
    highLadderCents: Number(row.high_ladder_cents),
    motorizedCents: Number(row.motorized_cents),
    measureCents: Number(row.measure_cents),
  };
}

/**
 * Replaces the whole rate table in one statement: treatments missing from `rates` are deleted
 * (a missing row means "not priced"), the rest are upserted, and the settings row is updated.
 * `actor` is stored on the settings row as `updated_by`, so the last rate change has an author.
 */
export async function saveInstallRates(
  rates: InstallRate[],
  settings: InstallSettings,
  actor: string,
): Promise<void> {
  const treatments = rates.map((rate) => rate.treatment);
  const bases = rates.map((rate) => rate.basis);
  const cents = rates.map((rate) => rate.rateCents);
  await db()`
    with removed as (
      delete from install_rates where not (treatment = any(${treatments}::text[]))
    ),
    upserted as (
      insert into install_rates (treatment, basis, rate_cents, updated_at)
      select treatment, basis, rate_cents, now()
      from unnest(${treatments}::text[], ${bases}::text[], ${cents}::int[]) as incoming(treatment, basis, rate_cents)
      on conflict (treatment) do update
        set basis = excluded.basis, rate_cents = excluded.rate_cents, updated_at = now()
    )
    update install_settings set
      minimum_cents = ${settings.minimumCents},
      hard_surface_cents = ${settings.hardSurfaceCents},
      high_ladder_cents = ${settings.highLadderCents},
      motorized_cents = ${settings.motorizedCents},
      measure_cents = ${settings.measureCents},
      updated_by = ${actor},
      updated_at = now()
    where id = true`;
}
