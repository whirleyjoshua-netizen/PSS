import type { Job } from "@/lib/admin/jobs";
import { loadReview } from "@/lib/dc/send";
import { formatProjectNo } from "@/lib/portal/project-no";
import { CheckNowButton, DcButtons } from "./DcButtons";
import { QuoteReview } from "./QuoteReview";

export async function QuoteTab({ job }: { job: Pick<Job, "id" | "projectNo"> }) {
  const review = await loadReview(job.id);
  const projectNo = formatProjectNo(job.projectNo);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <DcButtons projectNo={projectNo} dcQuoteNo={review?.version.dcQuoteNo ?? null} />
        <CheckNowButton jobId={job.id} />
      </div>
      {review ? (
        <QuoteReview jobId={job.id} review={review} now={new Date()} />
      ) : (
        <p className="text-sm">
          No Direct Connect quote yet. Put {projectNo ?? "the job's PSS number"} in PO Reference and email the Dealer Copy with Owner and Include dealer costs ticked.
        </p>
      )}
    </div>
  );
}
