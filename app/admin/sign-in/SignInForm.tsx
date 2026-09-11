"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/forms/Field";
import { requestSignInAction, type SignInState } from "./actions";

export function SignInForm({ expired = false }: { expired?: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(
    requestSignInAction,
    { status: "idle" },
  );

  if (state.status === "sent") {
    return (
      <p role="status" className="border border-champagne bg-sand/60 p-5 text-sm">
        If that address has access, a sign-in link is on its way. It works once and
        expires in 15 minutes.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {expired && state.status === "idle" ? (
        <p role="alert" className="border border-rule bg-sand/60 p-4 text-sm">
          That link has expired or was already used. Request a new one.
        </p>
      ) : null}
      <TextField id="admin-email" name="email" label="Email" type="email" autoComplete="email" required />
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-charcoal">{state.message}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
