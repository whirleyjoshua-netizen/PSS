"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { Referral } from "@/lib/referrals/db";
import { stageLabel } from "@/lib/admin/stages";
import { formatWhen } from "@/lib/admin/time";
import { payReferral, type FormState } from "../actions";

export function ReferralsList({ referrerId, referrals }: { referrerId: string; referrals: Referral[] }) {
  return (
    <ul className="flex flex-col gap-3 text-sm">
      {referrals.map((referral) => (
        <li key={referral.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule pb-3">
          <Link href={`/admin/jobs/${referral.id}`} className="font-display text-charcoal underline-offset-4 hover:underline">
            {referral.name}
          </Link>
          <span className="text-ink-soft">{stageLabel(referral.status)}</span>
          <Reward referrerId={referrerId} referral={referral} />
        </li>
      ))}
    </ul>
  );
}

function Reward({ referrerId, referral }: { referrerId: string; referral: Referral }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    payReferral.bind(null, referral.id, referrerId),
    {},
  );

  if (referral.reward === "pending") return <span>Pending</span>;
  if (referral.reward === "none") return <span>No reward</span>;
  if (referral.reward === "paid") return <span>Paid {formatWhen(referral.referralPaidAt!)}</span>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <span>$100 owed</span>
      <Button type="submit" variant="outline" disabled={pending}>Mark paid</Button>
      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
