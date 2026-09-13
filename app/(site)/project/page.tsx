import Link from "next/link";
import { requireCustomer } from "@/lib/portal/session";
import { ProjectView } from "./ProjectView";

export default async function ProjectHome() {
  const { jobs } = await requireCustomer();
  if (jobs.length === 1) return <ProjectView job={jobs[0]} />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-light">Your projects</h1>
      <ul className="flex flex-col divide-y divide-rule border border-rule">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link href={`/project/${job.id}`} className="block min-h-11 p-4 underline-offset-4 hover:underline">
              {[job.address, job.city].filter(Boolean).join(", ") || "Your project"}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
