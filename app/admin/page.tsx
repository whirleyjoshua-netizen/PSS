import Link from "next/link";
import { listFiles } from "@/lib/admin/files";
import { getJob, listJobs } from "@/lib/admin/jobs";
import { boardHref } from "@/lib/admin/links";
import { listMeasurements } from "@/lib/admin/measurements";
import { requireAdmin } from "@/lib/admin/session";
import { JobCard, groupByStage } from "./JobCard";
import { JobPanel } from "./JobPanel";

/** The panel's data, loaded only when a job is open. A missing job still gets a panel that says so. */
async function loadPanel(id: string) {
  const job = await getJob(id);
  if (!job) return { job: null, measurements: [], files: [] };
  const [measurements, files] = await Promise.all([listMeasurements(id), listFiles(id)]);
  return { job, measurements, files };
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ lost?: string; job?: string }>;
}) {
  await requireAdmin();
  const { lost, job: openId } = await searchParams;
  const includeLost = lost === "1";
  const [jobs, panel] = await Promise.all([
    listJobs({ includeLost }),
    openId ? loadPanel(openId) : Promise.resolve(null),
  ]);
  const groups = groupByStage(jobs, includeLost);
  const now = new Date();

  return (
    <div className="mx-auto flex max-w-[110rem] items-start gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Jobs</h1>
          <Link href={boardHref({ lost: !includeLost, job: openId })} className="text-sm underline underline-offset-4">
            {includeLost ? "Hide lost" : "Show lost"}
          </Link>
        </header>

        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft" aria-label="Jobs per stage">
          {groups.map((group) => (
            <li key={group.stage}>
              {group.label} <span className="font-display tabular-nums text-charcoal">{group.jobs.length}</span>
            </li>
          ))}
        </ul>

        {/* Stacked on phones; one scrolling row of columns from md up. */}
        <div className="flex flex-col gap-6 md:flex-row md:gap-4 md:overflow-x-auto md:pb-4">
          {groups.map((group) => (
            <section key={group.stage} aria-labelledby={`stage-${group.stage}`} className="flex flex-col gap-3 md:w-64 md:shrink-0">
              <h2 id={`stage-${group.stage}`} className="font-display text-xs font-medium uppercase tracking-[0.18em] text-champagne-ink">
                {group.label} · {group.jobs.length}
              </h2>
              {group.jobs.length ? (
                group.jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    now={now}
                    href={boardHref({ lost: includeLost, job: job.id })}
                    selected={job.id === openId}
                  />
                ))
              ) : (
                <p className="text-sm text-ink-soft">Nothing here.</p>
              )}
            </section>
          ))}
        </div>
      </div>

      {panel ? <JobPanel {...panel} now={now} closeHref={boardHref({ lost: includeLost })} /> : null}
    </div>
  );
}
