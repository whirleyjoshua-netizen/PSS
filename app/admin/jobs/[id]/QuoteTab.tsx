import type { Job } from "@/lib/admin/jobs";
import { loadReview } from "@/lib/dc/send";
import { cancellationWindowLastDay, inCancellationWindow } from "@/lib/docs/business-days";
import { depositState, type DepositState } from "@/lib/payments/deposits";
import { formatProjectNo } from "@/lib/portal/project-no";
import { CheckNowButton, DcButtons } from "./DcButtons";
import { DepositPanel, type DepositView } from "./DepositPanel";
import { QuoteReview } from "./QuoteReview";

/** The panel's props from the stored deposit state, the window computed on the server at `now`. */
export function toDepositView(state: DepositState, now: Date): DepositView {
  return {
    jobStatus: state.jobStatus, amountCents: state.amountCents, soldCents: state.soldCents,
    lastCancellableDay: cancellationWindowLastDay(state.signedAt), inWindow: inCancellationWindow(state.signedAt, now),
    paid: state.paid && state.paid.paidAt
      ? { id: state.paid.id, amountCents: state.paid.amountCents, method: state.paid.method, paidAt: state.paid.paidAt }
      : null,
    refunded: state.refunded && state.refunded.refundedAt
      ? { amountCents: state.refunded.amountCents, refundedAt: state.refunded.refundedAt }
      : null,
    cardPending: state.pending !== null,
  };
}

/**
 * Whether the Deposit panel has anything to say: a deposit paid or refunded, or a Signed job owing one.
 * A legacy job moved past Signed by hand with no deposit would otherwise show an empty heading.
 */
export const depositPanelShows = (view: DepositView): boolean =>
  view.paid !== null || view.refunded !== null || view.jobStatus === "signed";

export async function QuoteTab({ job }: { job: Pick<Job, "id" | "projectNo"> }) {
  const [review, deposit] = await Promise.all([loadReview(job.id), depositState(job.id)]);
  const projectNo = formatProjectNo(job.projectNo);
  const now = new Date();
  const depositView = deposit ? toDepositView(deposit, now) : null;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <DcButtons projectNo={projectNo} dcQuoteNo={review?.version.dcQuoteNo ?? null} />
        <CheckNowButton jobId={job.id} />
      </div>
      {review ? (
        <QuoteReview jobId={job.id} review={review} now={now} />
      ) : (
        <p className="text-sm">
          No Direct Connect quote yet. Put {projectNo ?? "the job's PSS number"} in PO Reference and email the Dealer Copy with Owner and Include dealer costs ticked.
        </p>
      )}
      {depositView && depositPanelShows(depositView) ? <DepositPanel jobId={job.id} view={depositView} /> : null}
    </div>
  );
}
