"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/forms/Field";
import { business } from "@/content/business";
import { HAND_SOURCES } from "@/lib/admin/schema";
import { STAGES, type WorkingStage } from "@/lib/admin/stages";
import { addJob, type FormState } from "../actions";

const field = (values: FormState["values"], name: string, fallback = "") => {
  const value = values?.[name];
  return typeof value === "string" ? value : fallback;
};

export function NewJobForm({ defaultStage = "new" }: { defaultStage?: WorkingStage }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addJob, {});
  const values = state.values;

  return (
    <form
      // Remount with a fresh key each failed submit so the fields pick up the
      // echoed values as new defaults, instead of React 19's post-action reset.
      key={values ? JSON.stringify(values) : "initial"}
      action={action}
      className="flex flex-col gap-5"
    >
      <TextField id="job-name" name="name" label="Name" required defaultValue={field(values, "name")} />
      <TextField id="job-phone" name="phone" label="Phone" type="tel" inputMode="tel" required defaultValue={field(values, "phone")} />
      <TextField id="job-email" name="email" label="Email (optional)" type="email" defaultValue={field(values, "email")} />
      <SelectField id="job-city" name="city" label="City" options={business.serviceArea} defaultValue={field(values, "city", business.serviceArea[0])} />
      <TextField id="job-address" name="address" label="Street address (optional)" defaultValue={field(values, "address")} />
      <SelectField id="job-source" name="source" label="How they reached us" options={HAND_SOURCES} defaultValue={field(values, "source", "phone")} />
      <label htmlFor="job-stage" className="flex flex-col gap-2 text-sm">
        Stage
        <select
          id="job-stage"
          name="stage"
          defaultValue={field(values, "stage", defaultStage)}
          className="min-h-11 rounded-md border border-rule bg-ivory px-3"
        >
          {STAGES.map((stage) => (
            <option key={stage.value} value={stage.value}>{stage.label}</option>
          ))}
        </select>
      </label>
      <TextAreaField id="job-notes" name="notes" label="Notes (optional)" defaultValue={field(values, "notes")} />
      {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
      <Button type="submit" variant="solid" disabled={pending} className="self-start">{pending ? "Adding…" : "Add job"}</Button>
    </form>
  );
}
