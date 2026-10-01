import Link from "next/link";
import { notFound } from "next/navigation";
import { describe as describeWindow, listWorkingWindows } from "@/lib/admin/measurements";
import { oneOf } from "@/lib/admin/measure-units";
import { isInstalled } from "@/lib/admin/stages";
import { isFromAcknowledgement } from "@/lib/portal/acknowledgement";
import { requireCustomer } from "@/lib/portal/session";
import { ServiceForm } from "./ServiceForm";

/**
 * Only a job in the customer's own visible list, and only once its work is installed.
 * Anything else looks missing — the same answer either way, so the page tells a caller
 * nothing about what exists.
 */
export default async function ServiceRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams?: Promise<{ from?: string | string[] }>;
}) {
  const { jobs } = await requireCustomer();
  const { jobId } = await params;
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job || !isInstalled(job.status)) notFound();

  // Matched against the one known value and passed on as a boolean — never rendered, and it
  // chooses no status. All it selects is which action the form posts to, which is how the
  // server, and not the post, decides where this request came from.
  //
  // But the marker alone is not enough to believe, because it is the customer's own URL. It is
  // therefore re-derived against the job's RAW status, the rule every sentence on these pages
  // follows: isInstalled() admits `completed`, so a customer who has already answered
  // "everything looks great" can still open this page, and on the marker alone would be told we
  // are sorry it is not right about a job they themselves confirmed — and handed the muting
  // action, opting their own finished job out of the owners' review request. `installed` is the
  // only status where there is an acknowledgement still to give, so it is the only one where
  // either the wording or the mute is offered; anything else falls back to the ordinary form
  // and says nothing about an acknowledgement. Not project.status, which folds the two together.
  const query = searchParams ? await searchParams : {};
  const fromAcknowledgement = isFromAcknowledgement(query.from) && job.status === "installed";

  // The customer picks a window from the measure we ordered from (official, else the designer's),
  // rather than typing a room name that may match nothing. With no measurements the picker is
  // just the text box.
  const windows = (await listWorkingWindows(jobId)).map((window) => ({
    id: window.id,
    label: describeWindow(window) + oneOf(window.quantity),
  }));

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-6">
      <h1 className="font-display text-3xl font-light">Request a service</h1>
      <p className="text-ink-soft">
        {fromAcknowledgement
          ? "We are sorry it is not right. Tell us which window and what is happening, and we will come back out. You do not need to know what the part is called."
          : "Tell us which window and what is happening, and we will get back to you to arrange a visit. You do not need to know what the part is called."}
      </p>
      <ServiceForm jobId={jobId} windows={windows} fromAcknowledgement={fromAcknowledgement} />
      <Link href={`/project/${jobId}`} className="min-h-11 underline underline-offset-4">
        Back to your project
      </Link>
    </div>
  );
}
