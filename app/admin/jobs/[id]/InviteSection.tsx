"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { sendPortalInviteNow, type FormState } from "../actions";

export function InviteSection({ jobId, hasEmail, canInvite, invitedLabel }: {
  jobId: string;
  hasEmail: boolean;
  /** The job is in a portal stage (Quoted or later, not Lost). */
  canInvite: boolean;
  /** Preformatted time of the last invite, or null if never invited. */
  invitedLabel: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(sendPortalInviteNow.bind(null, jobId), {});

  if (!hasEmail) return <p className="text-sm text-ink-soft">Add an email to invite this customer to their project page.</p>;
  if (!canInvite) return <p className="text-sm text-ink-soft">The customer can be invited once the job is Quoted.</p>;

  return (
    <form action={action} className="flex flex-col gap-2">
      {invitedLabel ? <p className="text-sm text-ink-soft">Invite sent {invitedLabel}.</p> : null}
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {pending ? "Sending…" : invitedLabel ? "Resend portal invite" : "Send portal invite"}
      </Button>
      {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm">Invite sent.</p> : null}
    </form>
  );
}
