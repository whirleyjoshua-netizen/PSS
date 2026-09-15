"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/forms/Field";
import { BUDGET_OPTIONS } from "@/lib/admin/budget";
import type { Job } from "@/lib/admin/jobs";
import { BRANDS } from "@/lib/admin/schema";
import { toLocalInput } from "@/lib/admin/time";
import { saveDetails, type FormState } from "../actions";

const dollars = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));
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

  return (
    <form
      // Remount with a fresh key each failed submit so fields pick up the
      // echoed values as new defaults, instead of React 19's post-action reset.
      key={values ? JSON.stringify(values) : "initial"}
      action={action}
      className="grid gap-4 sm:grid-cols-2"
    >
      {/* What the dates were when this form was rendered, so an untouched date never overwrites an Outlook move. */}
      <input type="hidden" name="visitAtLoaded" defaultValue={job.visitAt ? toLocalInput(job.visitAt) : ""} />
      <input type="hidden" name="installOnLoaded" defaultValue={job.installOn ?? ""} />
      <label htmlFor="visitAt" className="flex flex-col gap-2 text-sm">
        Visit date and time
        <input id="visitAt" name="visitAt" type="datetime-local" className={CONTROL}
          defaultValue={field("visitAt", job.visitAt ? toLocalInput(job.visitAt) : "")} />
      </label>
      <Money id="quote" label="Quote" value={field("quote", dollars(job.quoteCents))} />
      <Money id="sold" label="Sold amount" value={field("sold", dollars(job.soldCents))} />
      <Money id="deposit" label="Deposit received" value={field("deposit", dollars(job.depositCents))} />
      <label htmlFor="orderedOn" className="flex flex-col gap-2 text-sm">
        Order date
        <input id="orderedOn" name="orderedOn" type="date" className={CONTROL} defaultValue={field("orderedOn", job.orderedOn ?? "")} />
      </label>
      <label htmlFor="installOn" className="flex flex-col gap-2 text-sm">
        Install date
        <input id="installOn" name="installOn" type="date" className={CONTROL} defaultValue={field("installOn", job.installOn ?? "")} />
      </label>
      <label htmlFor="budget" className="flex flex-col gap-2 text-sm">
        Budget
        <select id="budget" name="budget" className={CONTROL} defaultValue={field("budget", job.budgetTier ?? "")}>
          <option value="">—</option>
          {BUDGET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
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

function Money({ id, label, value }: { id: string; label: string; value: string }) {
  return <TextField id={id} name={id} label={label} inputMode="decimal" placeholder="$" defaultValue={value} />;
}
