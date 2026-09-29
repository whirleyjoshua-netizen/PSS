"use client";

import { useFormStatus } from "react-dom";
import { ACTION_LINK } from "@/app/admin/jobs/[id]/ui";
import { startStarterTermsAction } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${ACTION_LINK} disabled:opacity-60`}>
      Start from the Premier Shade starter terms
    </button>
  );
}

/** Disabled while it runs, so a double click cannot start the terms twice. */
export function StarterTermsButton() {
  return (
    <form action={startStarterTermsAction}>
      <Submit />
    </form>
  );
}
