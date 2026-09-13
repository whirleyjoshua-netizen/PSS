"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Job } from "@/lib/admin/jobs";
import { referralUrl } from "@/lib/referrals/codes";
import { createReferralLink, type FormState } from "../actions";

export function ReferralSection({ job }: { job: Job }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createReferralLink.bind(null, job.id), {});
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  if (!job.referralCode) {
    return (
      <form action={action} className="flex flex-wrap items-center gap-3 text-sm">
        <Button type="submit" variant="outline" disabled={pending}>Get referral link</Button>
        {state.error ? <p role="alert">{state.error}</p> : null}
      </form>
    );
  }

  const link = referralUrl(job.referralCode);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <code className="break-all border border-rule bg-ivory px-3 py-2">{link}</code>
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setCopyError(null);
          } catch {
            setCopyError("Couldn't copy. Select the link and copy it by hand.");
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
      {copyError ? <p role="alert">{copyError}</p> : null}
    </div>
  );
}
