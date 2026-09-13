import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/portal/session";
import { ProjectView } from "../ProjectView";

/** Only a job in the customer's own visible list. Anything else looks missing. */
export default async function ProjectJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobs } = await requireCustomer();
  const { jobId } = await params;
  const job = jobs.find((j) => j.id === jobId);
  if (!job) notFound();
  return <ProjectView job={job} />;
}
