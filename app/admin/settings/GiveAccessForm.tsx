"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import { giveAccess, type AccessFormState } from "./actions";

/** `added` is who has access now, so a result about someone since removed stops showing. */
export function GiveAccessForm({ added }: { added: string[] }) {
  const [state, action, giving] = useActionState<AccessFormState, FormData>(giveAccess, {});
  // The result outlives a Remove; once that address is gone, "Access given to ..." would be false.
  const stale = state.given !== undefined && !added.some((email) => email.trim().toLowerCase() === state.given);
  const error = stale ? undefined : state.error;
  const ok = stale ? undefined : state.ok;

  return (
    <>
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
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "access-email-error" : undefined}
            className={CONTROL}
          />
        </div>
        <Button type="submit" variant="outline" disabled={giving}>
          Give access
        </Button>
      </form>
      {error ? (
        <p id="access-email-error" role="alert" className="text-sm text-overdue">
          {error}
        </p>
      ) : ok ? (
        <p role="status" className="text-sm text-ink-soft">
          {ok}
        </p>
      ) : null}
    </>
  );
}
