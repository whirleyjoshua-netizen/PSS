"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import { addSuppressionAction, type FormState } from "./agent-actions";

function Result({ state, ok, errorId }: { state: FormState; ok: string; errorId?: string }) {
  if (state.error)
    return (
      <p id={errorId} role="alert" className="text-sm text-overdue">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p role="status" className="text-sm text-ink-soft">
        {ok}
      </p>
    );
  return null;
}

export function AddSuppressionForm() {
  const [state, action, adding] = useActionState<FormState, FormData>(addSuppressionAction, {});
  return (
    <>
      <form key={String(state.ok ?? "form")} action={action} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-2">
          <Label htmlFor="suppression-address">Address to block</Label>
          <input
            id="suppression-address"
            name="address"
            type="email"
            autoComplete="off"
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "suppression-address-error" : undefined}
            className={CONTROL}
          />
        </div>
        <Button type="submit" variant="outline" disabled={adding}>
          Add to list
        </Button>
      </form>
      <Result state={state} ok="Added to the do-not-contact list." errorId="suppression-address-error" />
    </>
  );
}
