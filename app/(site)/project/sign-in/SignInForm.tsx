"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/forms/Field";
import { requestCustomerSignInAction, type CustomerSignInState } from "./actions";

export function CustomerSignInForm({ expired = false }: { expired?: boolean }) {
  const [state, action, pending] = useActionState<CustomerSignInState, FormData>(
    requestCustomerSignInAction,
    { status: "idle" },
  );

  if (state.status === "sent") {
    return (
      <p role="status" className="border border-champagne bg-sand/60 p-5 text-sm">
        Check your email for a sign-in link. It works once and expires in 15 minutes.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {expired && state.status === "idle" ? (
        <p role="alert" className="border border-rule bg-sand/60 p-4 text-sm">
          This link expired or was already used. Enter your email for a new one.
        </p>
      ) : null}
      <TextField id="customer-email" name="email" label="Email" type="email" autoComplete="email" required />
      {state.status === "error" ? <p role="alert" className="text-sm text-charcoal">{state.message}</p> : null}
      <Button type="submit" variant="solid" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
