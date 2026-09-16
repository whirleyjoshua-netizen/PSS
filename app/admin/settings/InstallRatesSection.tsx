"use client";

import { useActionState } from "react";
import { TREATMENT_TYPES } from "@/lib/leads/treatment-types";
import { INSTALL_BASES, INSTALLABLE_TREATMENTS, basisLabel, type InstallRate, type InstallSettings } from "@/lib/admin/install-pricing";
import { saveInstallRatesAction, type InstallRatesFormState } from "./actions";

const LABEL = new Map(TREATMENT_TYPES.map((type) => [type.key, type.label]));
/** Cents to a plain form value: 2500 → "25", 2550 → "25.50", unset → "". */
const amount = (cents: number | null): string =>
  cents === null ? "" : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);

const field = "min-h-11 w-28 border border-rule px-2";

export function InstallRatesSection({ rates, settings }: { rates: InstallRate[]; settings: InstallSettings }) {
  const [state, action, pending] = useActionState<InstallRatesFormState, FormData>(saveInstallRatesAction, {});
  const byTreatment = new Map(rates.map((rate) => [rate.treatment, rate]));

  return (
    <section aria-labelledby="install-rates-heading" className="flex flex-col gap-3">
      <h2 id="install-rates-heading" className="text-lg font-semibold">Installation rates</h2>
      <p className="text-sm text-ink-soft">What PSS charges to install, before any Hunter Douglas product cost.</p>
      <form action={action} className="flex flex-col gap-4">
        <table className="text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.1em] text-ink-soft">
            <tr><th scope="col" className="py-2">Treatment</th><th scope="col">Priced by</th><th scope="col">Rate</th></tr>
          </thead>
          <tbody>
            {INSTALLABLE_TREATMENTS.map((treatment) => {
              const rate = byTreatment.get(treatment);
              const label = LABEL.get(treatment) ?? treatment;
              return (
                <tr key={treatment}>
                  <th scope="row" className="py-1 font-normal">{label}</th>
                  <td>
                    <label className="sr-only" htmlFor={`basis-${treatment}`}>{label} priced by</label>
                    <select id={`basis-${treatment}`} name={`basis-${treatment}`}
                      defaultValue={rate?.basis ?? "window"} className={field}>
                      {INSTALL_BASES.map((basis) => (
                        <option key={basis} value={basis}>{basisLabel(basis)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`rate-${treatment}`}>{label} rate</label>
                    <input id={`rate-${treatment}`} name={`rate-${treatment}`} inputMode="decimal"
                      defaultValue={amount(rate ? rate.rateCents : null)} placeholder="—" className={field} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Surcharges, per window</legend>
          <label className="flex items-center justify-between gap-3">
            Hard surface
            <input name="hardSurfaceCents" inputMode="decimal" defaultValue={amount(settings.hardSurfaceCents)} className={field} />
          </label>
          <label className="flex items-center justify-between gap-3">
            High ladder
            <input name="highLadderCents" inputMode="decimal" defaultValue={amount(settings.highLadderCents)} className={field} />
          </label>
          <label className="flex items-center justify-between gap-3">
            Motorized
            <input name="motorizedCents" inputMode="decimal" defaultValue={amount(settings.motorizedCents)} className={field} />
          </label>
        </fieldset>

        <label className="flex items-center justify-between gap-3 text-sm">
          Minimum job cost
          <input name="minimumCents" inputMode="decimal" defaultValue={amount(settings.minimumCents)} className={field} />
        </label>
        <p className="text-xs text-ink-soft">The minimum covers the trip. There is no separate trip charge.</p>

        {state.error ? <p role="alert" className="text-sm text-overdue">{state.error}</p> : null}
        {state.ok ? <p role="status" className="text-sm">Saved.</p> : null}
        <button type="submit" disabled={pending}
          className="min-h-11 self-start bg-charcoal px-4 text-sm text-ivory">
          {pending ? "Saving…" : "Save rates"}
        </button>
      </form>
    </section>
  );
}
