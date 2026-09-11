"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/forms/Field";
import { business } from "@/content/business";
import { HAND_SOURCES } from "@/lib/admin/schema";
import { addJob, type FormState } from "../actions";

export function NewJobForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addJob, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <TextField id="job-name" name="name" label="Name" required />
      <TextField id="job-phone" name="phone" label="Phone" type="tel" inputMode="tel" required />
      <TextField id="job-email" name="email" label="Email (optional)" type="email" />
      <SelectField id="job-city" name="city" label="City" options={business.serviceArea} defaultValue={business.serviceArea[0]} />
      <TextField id="job-address" name="address" label="Street address (optional)" />
      <SelectField id="job-source" name="source" label="How they reached us" options={HAND_SOURCES} defaultValue="phone" />
      <TextAreaField id="job-notes" name="notes" label="Notes (optional)" />
      {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="self-start">{pending ? "Adding…" : "Add job"}</Button>
    </form>
  );
}
