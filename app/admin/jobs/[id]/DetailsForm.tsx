"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/forms/Field";
import type { Job } from "@/lib/admin/jobs";
import { BRANDS } from "@/lib/admin/schema";
import { toLocalInput } from "@/lib/admin/time";
import { saveDetails, type FormState } from "../actions";

const dollars = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));
const CONTROL = "min-h-11 w-full border border-rule bg-ivory px-4 py-3";

export function DetailsForm({ job }: { job: Job }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveDetails.bind(null, job.id), {});

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label htmlFor="visitAt" className="flex flex-col gap-2 text-sm">
        Visit date and time
        <input id="visitAt" name="visitAt" type="datetime-local" className={CONTROL}
          defaultValue={job.visitAt ? toLocalInput(job.visitAt) : ""} />
      </label>
      <Money id="quote" label="Quote" value={dollars(job.quoteCents)} />
      <Money id="sold" label="Sold amount" value={dollars(job.soldCents)} />
      <Money id="deposit" label="Deposit received" value={dollars(job.depositCents)} />
      <label htmlFor="orderedOn" className="flex flex-col gap-2 text-sm">
        Order date
        <input id="orderedOn" name="orderedOn" type="date" className={CONTROL} defaultValue={job.orderedOn ?? ""} />
      </label>
      <label htmlFor="installOn" className="flex flex-col gap-2 text-sm">
        Install date
        <input id="installOn" name="installOn" type="date" className={CONTROL} defaultValue={job.installOn ?? ""} />
      </label>
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="text-sm">Brands on this job</legend>
        <div className="flex flex-wrap gap-2">
          {BRANDS.map((brand) => (
            <label key={brand} htmlFor={`brand-${brand}`} className="flex min-h-11 items-center gap-2 border border-rule px-3 text-sm">
              <input id={`brand-${brand}`} type="checkbox" name="brands" value={brand}
                defaultChecked={job.brands.includes(brand)} />
              {brand}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-4 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save details"}</Button>
        {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
        {state.ok ? <p role="status" className="text-sm text-ink-soft">Saved</p> : null}
      </div>
    </form>
  );
}

function Money({ id, label, value }: { id: string; label: string; value: string }) {
  return <TextField id={id} name={id} label={label} inputMode="numeric" placeholder="$" defaultValue={value} />;
}
