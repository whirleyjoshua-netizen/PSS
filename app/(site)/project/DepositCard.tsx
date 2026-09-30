import { business } from "@/content/business";
import { formatCents } from "@/lib/admin/money";
import { formatDateOnly } from "@/lib/admin/time";
import { startDepositFormAction } from "./deposit-actions";
import { PayDepositButton } from "./PayDepositButton";

/**
 * Spec §3: after signing, the 50% deposit, its amount and the last day the client may cancel. A plain
 * form post, so it works with JavaScript off; the action re-derives the job, the stage and the amount.
 */
export function DepositCard({ jobId, amountCents, lastCancellableDay }: { jobId: string; amountCents: number; lastCancellableDay: string }) {
  return (
    <form action={startDepositFormAction} className="flex max-w-md flex-col gap-3 border border-rule bg-sand/50 p-4">
      <input type="hidden" name="jobId" value={jobId} />
      <p className="text-sm">
        Your contract is signed. A 50% deposit of {formatCents(amountCents)} confirms your order; the balance is due at installation.
      </p>
      <p className="text-sm text-ink-soft">
        You may cancel until the end of {formatDateOnly(lastCancellableDay)} and we will refund your deposit in full.
      </p>
      <PayDepositButton label={`Pay 50% deposit — ${formatCents(amountCents)}`} />
    </form>
  );
}

/**
 * What the client reads on the hop back from Stripe. `flag` is their own URL, so it only decides whether
 * to speak; whether the payment is received comes from the database (`paid`), never from the flag.
 */
export function DepositNotice({ flag, paid }: { flag: string | null; paid: boolean }) {
  if (flag === "done" || flag === "processing") {
    return (
      <p role="status" className="border border-champagne bg-sand/60 p-4 text-sm">
        {paid ? "Payment received — thank you." : "Processing — we will email your receipt as soon as your payment is confirmed."}
      </p>
    );
  }
  if (flag === "unavailable") {
    return (
      <p role="status" className="border border-champagne bg-sand/60 p-4 text-sm">
        Card payment is not available just now. Please call us on {business.phone.display} and we will take your deposit another way.
      </p>
    );
  }
  return null;
}
