import Link from "next/link";
import { Icon } from "@/components/admin/icons";
import { listFiles } from "@/lib/admin/files";
import { getJob, listJobs, SEARCH_MAX } from "@/lib/admin/jobs";
import { boardHref } from "@/lib/admin/links";
import { listMeasurements } from "@/lib/admin/measurements";
import { requireAdmin } from "@/lib/admin/session";
import { STAGE_STYLE } from "@/lib/admin/stages";
import { formatDay } from "@/lib/admin/time";
import { JobCard, groupByStage } from "./JobCard";
import { JobPanel } from "./JobPanel";

/** The panel's data, loaded only when a job is open. A missing job still gets a panel that says so. */
async function loadPanel(id: string) {
  const job = await getJob(id);
  if (!job) return { job: null, measurements: [], files: [] };
  const [measurements, files] = await Promise.all([listMeasurements(id), listFiles(id)]);
  return { job, measurements, files };
}

/** `?job=a&job=b` arrives as an array; treat it as the first value. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ lost?: string | string[]; job?: string | string[]; q?: string | string[] }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const includeLost = first(params.lost) === "1";
  const openId = first(params.job);
  const q = (first(params.q) ?? "").trim().slice(0, SEARCH_MAX);
  const [jobs, panel] = await Promise.all([
    listJobs({ includeLost, search: q }),
    openId ? loadPanel(openId) : Promise.resolve(null),
  ]);
  const groups = groupByStage(jobs, includeLost);
  const working = groups.filter((group) => group.stage !== "lost");
  const now = new Date();
  const here = { lost: includeLost, q };

  return (
    <div className="mx-auto flex max-w-[110rem] items-start gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-soft">PSS Operations</p>
            <h1 className="text-3xl font-semibold text-charcoal">Jobs</h1>
            <p className="text-sm text-ink-soft">Track every project from lead to installation.</p>
          </div>
          <p className="flex flex-col items-end text-sm text-charcoal">
            <span>{formatDay(now)}</span>
            <span className="text-ink-soft">Las Vegas, NV</span>
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <form role="search" action="/admin" className="flex min-w-[16rem] flex-1 items-center gap-2 rounded-lg border border-rule bg-ivory px-3 shadow-sm">
            <Icon name="search" className="size-4 text-ink-soft" />
            <label htmlFor="board-search" className="sr-only">Search jobs</label>
            <input
              id="board-search"
              type="search"
              name="q"
              defaultValue={q}
              maxLength={SEARCH_MAX}
              placeholder="Search jobs, customers, or addresses…"
              className="min-h-11 flex-1 bg-transparent text-sm outline-none"
            />
            {includeLost ? <input type="hidden" name="lost" value="1" /> : null}
            {openId ? <input type="hidden" name="job" value={openId} /> : null}
            <button type="submit" className="sr-only">Search</button>
          </form>
          <Link href={boardHref({ lost: !includeLost, q, job: openId })} className="text-sm underline underline-offset-4">
            {includeLost ? "Hide lost" : "Show lost"}
          </Link>
          <Link href="/admin/jobs/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-charcoal px-4 text-sm font-medium text-ivory">
            <Icon name="plus" className="size-4" />
            New Job
          </Link>
        </div>

        {q ? (
          <p className="text-sm text-ink-soft">
            {jobs.length === 0 ? `No jobs match "${q}"` : `${jobs.length} ${jobs.length === 1 ? "job matches" : "jobs match"} "${q}"`}
            {" · "}
            <Link href={boardHref({ lost: includeLost, job: openId })} className="underline underline-offset-4">Clear search</Link>
          </p>
        ) : null}

        <nav aria-label="Stages">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {working.map((group) => {
              const style = STAGE_STYLE[group.stage];
              return (
                <li key={group.stage}>
                  <Link
                    href={`${boardHref({ ...here, job: openId })}#stage-${group.stage}`}
                    className="flex items-center gap-3 rounded-xl border border-rule bg-ivory p-3 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <Icon name={style.icon} className={`size-6 shrink-0 ${style.tint}`} />
                    <span className="flex flex-1 flex-col">
                      <span className="text-xl font-semibold tabular-nums text-charcoal">{group.jobs.length}</span>
                      <span className="text-xs text-ink-soft">{group.label}</span>
                    </span>
                    <Icon name="chevron" className="size-4 text-ink-soft" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Stacked on phones; one scrolling row of columns from md up. */}
        <div className="flex flex-col gap-4 md:flex-row md:overflow-x-auto md:pb-4">
          {groups.map((group) => {
            const style = STAGE_STYLE[group.stage];
            return (
              <section
                key={group.stage}
                aria-labelledby={`stage-${group.stage}`}
                className={`flex flex-col gap-3 rounded-xl border border-rule border-t-[3px] ${style.edge} bg-sand/40 p-3 md:w-72 md:shrink-0`}
              >
                <h2 id={`stage-${group.stage}`} className="flex scroll-mt-6 items-center gap-2 text-sm font-semibold text-charcoal">
                  <Icon name={style.icon} className={`size-4 ${style.tint}`} />
                  {group.label} · {group.jobs.length}
                </h2>
                {group.jobs.length ? (
                  group.jobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      now={now}
                      href={boardHref({ ...here, job: job.id })}
                      selected={job.id === openId}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-ink-soft">
                    <Icon name={style.icon} className="size-8 opacity-40" />
                    <p>No jobs in this stage</p>
                  </div>
                )}
                {group.stage !== "lost" ? (
                  <Link
                    href={`/admin/jobs/new?stage=${group.stage}`}
                    className="mt-auto rounded-lg bg-ivory/80 py-2 text-center text-sm text-charcoal hover:bg-ivory"
                  >
                    {group.stage === "new" ? "+ Add lead" : "+ Add job"}
                  </Link>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>

      {panel ? (
        <JobPanel
          {...panel}
          now={now}
          closeHref={boardHref(here)}
          key={panel.job ? `${panel.job.id}:${panel.job.status}` : `missing:${openId}`}
        />
      ) : null}
    </div>
  );
}
