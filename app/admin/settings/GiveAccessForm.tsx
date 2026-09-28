"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import { giveAccess, type AccessFormState } from "./actions";

export function GiveAccessForm() {
  const [state, action, giving] = useActionState<AccessFormState, FormData>(giveAccess, {});

  return (
    <form
      // Remount so a rejected address comes back as the default and a success clears the box.
      key={state.email ?? state.ok ?? "form"}
      action={action}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex min-w-56 flex-1 flex-col gap-2">
        <Label htmlFor="access-email">Email</Label>
        <input
          id="access-email"
          name="email"
          type="email"
          autoComplete="off"
          defaultValue={state.email ?? ""}
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "access-email-error" : undefined}
          className={CONTROL}
        />
      </div>
      <Button type="submit" variant="outline" disabled={giving}>
        Give access
      </Button>
      {state.error ? (
        <p id="access-email-error" role="alert" className="w-full text-sm text-overdue">
          {state.error}
        </p>
      ) : state.ok ? (
        <p role="status" className="w-full text-sm text-ink-soft">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
