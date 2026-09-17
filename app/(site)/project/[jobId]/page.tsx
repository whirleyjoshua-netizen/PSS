import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/portal/session";
import { ProjectView } from "../ProjectView";

/** Only a job in the customer's own visible list. Anything else looks missing. */
export default async function ProjectJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams?: Promise<{ requested?: string }>;
}) {
  const { jobs } = await requireCustomer();
  const { jobId } = await params;
  const job = jobs.find((j) => j.id === jobId);
  if (!job) notFound();
  // Set by the service form's redirect; it names the new job's number, nothing more.
  const requested = searchParams ? ((await searchParams).requested ?? null) : null;
  return <ProjectView job={job} justRequested={requested} />;
}
