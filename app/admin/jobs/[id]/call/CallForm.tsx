"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BUDGET_OPTIONS, type BudgetTier } from "@/lib/admin/budget";
import { TREATMENT_NAMES } from "@/lib/admin/call";
import { toLocalInput } from "@/lib/admin/time";
import { WINDOW_COUNTS } from "@/lib/leads/schema";
import { logCallAction } from "../../call-actions";
import type { FormState } from "../../actions";

type CallJob = { id: string; treatments: string[]; windowCount: string | null; budgetTier?: BudgetTier | null; visitAt: Date | null };

const CHIP = "flex min-h-11 items-center gap-2 border border-rule px-3 text-sm";
const LEGEND = "text-sm font-semibold text-charcoal";

export function CallForm({ job }: { job: CallJob }) {
  const [state, action, pending] = useActionState<FormState, FormData>(logCallAction.bind(null, job.id), {});
  const values = state.values;
  const [booking, setBooking] = useState(values?.outcome === "booked");

  const text = (name: string, fallback: string) => (typeof values?.[name] === "string" ? (values[name] as string) : fallback);
  const checked = (name: string) => {
    const submitted = values?.treatments;
    if (submitted === undefined) return job.treatments.includes(name);
    return Array.isArray(submitted) ? submitted.includes(name) : submitted === name;
  };
  const windows = text("windowCount", job.windowCount ?? "");
  const budget = text("budget", job.budgetTier ?? "");

  return (
    <form key={values ? JSON.stringify(values) : "initial"} action={action} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className={LEGEND}>Interest</legend>
        <div className="flex flex-wrap gap-2">
          {TREATMENT_NAMES.map((name) => (
            <label key={name} htmlFor={`call-t-${name}`} className={CHIP}>
              <input id={`call-t-${name}`} type="checkbox" name="treatments" value={name} defaultChecked={checked(name)} />
              {name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={LEGEND}>Windows</legend>
        <div className="flex flex-wrap gap-2">
          {WINDOW_COUNTS.map((count) => (
            <label key={count} htmlFor={`call-w-${count}`} className={CHIP}>
              <input id={`call-w-${count}`} type="radio" name="windowCount" value={count} defaultChecked={windows === count} />
              {count}
            </label>
          ))}
          <label htmlFor="call-w-none" className={CHIP}>
            <input id="call-w-none" type="radio" name="windowCount" value="" defaultChecked={windows === ""} />
            Not sure
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={LEGEND}>Budget</legend>
        <div className="flex flex-wrap gap-2">
          {BUDGET_OPTIONS.map((option) => (
            <label key={option.value} htmlFor={`call-b-${option.value}`} className={CHIP}>
              <input id={`call-b-${option.value}`} type="radio" name="budget" value={option.value} defaultChecked={budget === option.value} />
              {option.label}
            </label>
          ))}
          <label htmlFor="call-b-none" className={CHIP}>
            <input id="call-b-none" type="radio" name="budget" value="" defaultChecked={budget === ""} />
            Not sure
          </label>
        </div>
      </fieldset>

      <label htmlFor="call-notes" className="flex flex-col gap-2 text-sm">
        Notes
        <textarea id="call-notes" name="notes" rows={3} maxLength={2000} defaultValue={text("notes", "")}
          className="w-full border border-rule bg-ivory px-4 py-3" />
      </label>

      {booking ? (
        <div className="flex flex-col gap-3">
          <label htmlFor="call-visit" className="flex flex-col gap-2 text-sm">
            Visit date and time
            <input id="call-visit" name="visitAt" type="datetime-local" required
              defaultValue={text("visitAt", job.visitAt ? toLocalInput(job.visitAt) : "")}
              className="min-h-11 w-full border border-rule bg-ivory px-4 py-3" />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" name="outcome" value="booked" variant="solid" disabled={pending}>Save booked visit</Button>
            <Button type="button" variant="outline" onClick={() => setBooking(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="solid" onClick={() => setBooking(true)}>Booked a visit</Button>
          <Button type="submit" name="outcome" value="talked" variant="outline" disabled={pending}>Talked, no visit yet</Button>
          <Button type="submit" name="outcome" value="no_answer" variant="outline" disabled={pending}>No answer</Button>
        </div>
      )}

      {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
    </form>
  );
}
