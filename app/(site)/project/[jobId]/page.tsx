import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/portal/session";
import { ProjectView } from "../ProjectView";

/** Only a job in the customer's own visible list. Anything else looks missing. */
export default async function ProjectJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams?: Promise<{ requested?: string; approved?: string; acknowledged?: string; signed?: string }>;
}) {
  const { jobs } = await requireCustomer();
  const { jobId } = await params;
  const job = jobs.find((j) => j.id === jobId);
  if (!job) notFound();
  // Set by the redirects the forms end in: `requested` names a new service job's number,
  // `approved` says an approval was just submitted, `acknowledged` an installation just
  // confirmed. Every one of them is checked against the job itself before anything is said.
  const query = searchParams ? await searchParams : {};
  return (
    <ProjectView
      job={job}
      justRequested={query.requested ?? null}
      justApproved={query.approved ?? null}
      justAcknowledged={query.acknowledged ?? null}
      justSigned={query.signed ?? null}
    />
  );
}
