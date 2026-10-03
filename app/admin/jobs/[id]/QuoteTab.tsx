import type { Job } from "@/lib/admin/jobs";
import { loadReview, type Review } from "@/lib/dc/send";
import { listQuoteOptions } from "@/lib/dc/store";
import { cancellationWindowLastDay, inCancellationWindow } from "@/lib/docs/business-days";
import { depositState, type DepositState } from "@/lib/payments/deposits";
import { formatOptionNo } from "@/lib/portal/project-no";
import { AddQuoteOptionButton, CheckNowButton, DcButtons } from "./DcButtons";
import { DepositPanel, type DepositView } from "./DepositPanel";
import { QuoteReview } from "./QuoteReview";
import { HEADING } from "./ui";

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

/**
 * One quote option's card (quote options spec §3): its Direct Connect button (copying that option's number), then
 * its review or how to start it. Headed "Option B · PSS-1042-B" only once the job has two or more options, so a
 * one-quote job reads exactly as before.
 */
function OptionCard({ jobId, letter, optionNo, review, now, labelled }: {
  jobId: string; letter: string; optionNo: string | null; review: Review | null; now: Date; labelled: boolean;
}) {
  const body = (
    <>
      <DcButtons projectNo={optionNo} dcQuoteNo={review?.version.dcQuoteNo ?? null} />
      {review ? (
        <QuoteReview jobId={jobId} review={review} now={now} />
      ) : (
        <p className="text-sm">
          No Direct Connect quote yet. Put {optionNo ?? "the job's PSS number"} in PO Reference and email the Dealer Copy with Owner and Include dealer costs ticked.
        </p>
      )}
    </>
  );
  if (!labelled) return <div className="flex flex-col gap-6">{body}</div>;
  const headingId = `quote-option-${letter}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6 border-t border-rule pt-6">
      <h2 id={headingId} className={HEADING}>Option {letter}{optionNo ? ` · ${optionNo}` : ""}</h2>
      {body}
    </section>
  );
}

export async function QuoteTab({ job }: { job: Pick<Job, "id" | "projectNo"> }) {
  const [letters, deposit] = await Promise.all([listQuoteOptions(job.id), depositState(job.id)]);
  const reviews = await Promise.all(letters.map((letter) => loadReview(job.id, letter)));
  const now = new Date();
  const depositView = deposit ? toDepositView(deposit, now) : null;
  const labelled = letters.length > 1;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-end gap-4">
        <CheckNowButton jobId={job.id} />
      </div>
      {letters.map((letter, i) => (
        <OptionCard key={letter} jobId={job.id} letter={letter} optionNo={formatOptionNo(job.projectNo, letter)}
          review={reviews[i]} now={now} labelled={labelled} />
      ))}
      <AddQuoteOptionButton jobId={job.id} />
      {depositView && depositPanelShows(depositView) ? <DepositPanel jobId={job.id} view={depositView} /> : null}
    </div>
  );
}
