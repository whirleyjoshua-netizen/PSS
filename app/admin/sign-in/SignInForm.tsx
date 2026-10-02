"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label, TextField } from "@/components/forms/Field";
import { PasskeySignIn } from "../PasskeySignIn";
import {
  requestSignInAction,
  verifySignInCodeAction,
  type CodeState,
  type SignInState,
} from "./actions";

/**
 * Face ID leads when this browser has passkeys; the emailed code is the backup below it.
 * Each "Use a different email" remounts the email step, clearing its sent state.
 */
export function SignInForm({ expired = false }: { expired?: boolean }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <div className="flex flex-col gap-4">
      <PasskeySignIn />
      <EmailStep
        key={attempt}
        expired={expired && attempt === 0}
        onDifferentEmail={() => setAttempt((n) => n + 1)}
      />
    </div>
  );
}

function EmailStep({ expired, onDifferentEmail }: { expired: boolean; onDifferentEmail: () => void }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(
    requestSignInAction,
    { status: "idle" },
  );

  if (state.status === "sent") {
    return (
      <div className="flex flex-col gap-6">
        <p role="status" className="border border-champagne bg-sand/60 p-5 text-sm">
          If that address has access, a sign-in code and link are on their way. They work once and
          expire in 15 minutes.
        </p>
        <CodeForm email={state.email ?? ""} onDifferentEmail={onDifferentEmail} />
      </div>
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
      <Button type="submit" variant="solid" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}

function CodeForm({ email, onDifferentEmail }: { email: string; onDifferentEmail: () => void }) {
  const [state, action, pending] = useActionState<CodeState, FormData>(verifySignInCodeAction, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="email" value={email} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-code">6-digit code</Label>
        <input
          id="admin-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{3}\s?\d{3}"
          maxLength={7}
          required
          className={CONTROL}
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-charcoal">{state.error}</p>
      ) : null}
      <Button type="submit" variant="solid" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <button
        type="button"
        onClick={onDifferentEmail}
        className="self-start text-sm text-ink-soft underline underline-offset-4 hover:text-charcoal"
      >
        Use a different email
      </button>
    </form>
  );
}
