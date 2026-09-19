import Link from "next/link";
import { toProject } from "@/lib/portal/access";
import { currentStep } from "@/lib/portal/progress";
import { requireCustomer } from "@/lib/portal/session";
import { confirmedInstallAppointments } from "@/lib/portal/timeline";
import { ProjectView } from "./ProjectView";

/**
 * The customer's projects, when they have more than one. A single job goes straight to
 * ProjectView, so this list is only ever the choosing screen.
 *
 * Every row is built from toProject() — the portal's whitelist — never from the job row,
 * so nothing private can reach a label. A row names the project number, the place and the
 * step the job is on, because the place alone does not identify a project: a job with no
 * street address falls back to its city, and the owner's own two Las Vegas jobs read
 * identically until the number and the step tell them apart.
 *
 * Cost: one query for the whole list, whatever N is. The steps need only the job row plus
 * a confirmed install appointment, and those are fetched for every job at once. The dates
 * behind the other steps (stage history, measurements) are deliberately not loaded — they
 * would be N queries each, and a list row shows no dates. Neither can change which step
 * reads as current: they gate only Measurements and Ready to Install, and Measurements can
 * never be the furthest step for a job a customer can see (Quote Ready always sits above it).
 */
// The default matters: Next calls a page with props, but a direct call (and a test) need not
// pass any, and destructuring undefined would throw before the page ever rendered.
export default async function ProjectHome({
  searchParams,
}: {
  searchParams?: Promise<{ requested?: string; approved?: string; acknowledged?: string; signed?: string }>;
} = {}) {
  const { jobs } = await requireCustomer();
  // A customer with one job lands here after a service request, an approval or an installation
  // acknowledgement, so every confirmation must survive the hop: this page is the one that
  // renders their project.
  const params = searchParams ? await searchParams : {};
  if (jobs.length === 1) {
    return (
      <ProjectView
        job={jobs[0]}
        justRequested={params.requested ?? null}
        justApproved={params.approved ?? null}
        justAcknowledged={params.acknowledged ?? null}
        justSigned={params.signed ?? null}
      />
    );
  }

  const installs = await confirmedInstallAppointments(jobs.map((job) => job.id));
  const projects = jobs.map((job) =>
    toProject(job, { installAppointmentAt: installs.get(job.id) ?? null }),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-light">Your projects</h1>
      <ul aria-label="Your projects" className="flex flex-col divide-y divide-rule border border-rule">
        {projects.map((project) => (
          <li key={project.id}>
            <Link
              href={`/project/${project.id}`}
              className="flex min-h-11 flex-col gap-1 p-4 underline-offset-4 hover:underline"
            >
              <span>{[project.address, project.city].filter(Boolean).join(", ") || "Your project"}</span>
              <span className="text-sm text-ink-soft">
                {project.projectNo ? `${project.projectNo} · ` : ""}
                {currentStep(project.steps).label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
