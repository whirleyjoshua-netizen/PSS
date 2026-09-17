"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/forms/Field";
import { business } from "@/content/business";
import { BUDGET_OPTIONS } from "@/lib/admin/budget";
import type { Job } from "@/lib/admin/jobs";
import { BRANDS } from "@/lib/admin/schema";
import { TREATMENT_TYPES } from "@/lib/leads/treatment-types";
import { WINDOW_EXACT_OPTIONS } from "@/lib/leads/window-count";
import { saveDetails, type FormState } from "../actions";

const CONTROL = "min-h-11 w-full border border-rule bg-ivory px-4 py-3";

export function DetailsForm({ job }: { job: Job }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveDetails.bind(null, job.id), {});
  const values = state.values;

  const field = (name: string, fallback: string) => {
    const value = values?.[name];
    return typeof value === "string" ? value : fallback;
  };
  const brandsChecked = (brand: string) => {
    const submitted = values?.brands;
    if (submitted === undefined) return job.brands.includes(brand);
    return Array.isArray(submitted) ? submitted.includes(brand) : submitted === brand;
  };
  const typeChecked = (key: string) => {
    const submitted = values?.treatmentTypes;
    if (!values) return (job.treatmentTypes ?? []).some((type) => type === key);
    return Array.isArray(submitted) ? submitted.includes(key) : submitted === key;
  };
  // A job's city outside today's list stays selectable, so the select never silently swaps it for another city.
  const cityOptions: readonly string[] = (business.serviceArea as readonly string[]).includes(job.city)
    ? business.serviceArea
    : [job.city, ...business.serviceArea];
  const motorized = values ? values.motorized === "on" : Boolean(job.motorized);

  return (
    <form
      // Remount with a fresh key each failed submit so fields pick up the
      // echoed values as new defaults, instead of React 19's post-action reset.
      key={values ? JSON.stringify(values) : "initial"}
      action={action}
      className="grid gap-4 sm:grid-cols-2"
    >
      {/* Appointment dates are not edited here: the Schedule button owns them.
          Money is not either: pricing lives on the Install tab. */}
      <TextField id="address" name="address" label="Address" defaultValue={field("address", job.address ?? "")} />
      <SelectField id="city" name="city" label="City" options={cityOptions} defaultValue={field("city", job.city)} />
      <label htmlFor="orderedOn" className="flex flex-col gap-2 text-sm">
        Order date
        <input id="orderedOn" name="orderedOn" type="date" className={CONTROL} defaultValue={field("orderedOn", job.orderedOn ?? "")} />
      </label>
      <label htmlFor="budget" className="flex flex-col gap-2 text-sm">
        Budget
        <select id="budget" name="budget" className={CONTROL} defaultValue={field("budget", job.budgetTier ?? "")}>
          <option value="">—</option>
          {BUDGET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label htmlFor="windowCountExact" className="flex flex-col gap-2 text-sm">
        Exact windows
        <select id="windowCountExact" name="windowCountExact" className={CONTROL}
          defaultValue={field("windowCountExact", job.windowCountExact ? String(job.windowCountExact) : "")}>
          <option value="">—</option>
          {WINDOW_EXACT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <TextField id="gateCode" name="gateCode" label="Gate code" defaultValue={field("gateCode", job.gateCode ?? "")} />
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="text-sm">Treatment types</legend>
        <div className="flex flex-wrap gap-2">
          {TREATMENT_TYPES.map((type) => (
            <label key={type.key} htmlFor={`type-${type.key}`} className="flex min-h-11 items-center gap-2 border border-rule px-3 text-sm">
              <input id={`type-${type.key}`} type="checkbox" name="treatmentTypes" value={type.key} defaultChecked={typeChecked(type.key)} />
              {type.label}
            </label>
          ))}
          <label htmlFor="motorized" className="flex min-h-11 items-center gap-2 border border-rule px-3 text-sm">
            <input id="motorized" type="checkbox" name="motorized" defaultChecked={motorized} />
            Motorized
          </label>
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="text-sm">Brands on this job</legend>
        <div className="flex flex-wrap gap-2">
          {BRANDS.map((brand) => (
            <label key={brand} htmlFor={`brand-${brand}`} className="flex min-h-11 items-center gap-2 border border-rule px-3 text-sm">
              <input id={`brand-${brand}`} type="checkbox" name="brands" value={brand}
                defaultChecked={brandsChecked(brand)} />
              {brand}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-4 sm:col-span-2">
        <Button type="submit" variant="solid" disabled={pending}>{pending ? "Saving…" : "Save details"}</Button>
        {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
        {state.ok ? <p role="status" className="text-sm text-ink-soft">Saved</p> : null}
      </div>
    </form>
  );
}
