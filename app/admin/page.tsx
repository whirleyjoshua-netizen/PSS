import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/admin/icons";
import { listDueFollowUps } from "@/lib/admin/follow-ups";
import { listJobs, SEARCH_MAX } from "@/lib/admin/jobs";
import { boardHref } from "@/lib/admin/links";
import { requireAdmin } from "@/lib/admin/session";
import { BOARD_STAGES, STAGE_STYLE, parseListFilter } from "@/lib/admin/stages";
import { formatDay } from "@/lib/admin/time";
import { FollowUpsDue } from "./FollowUpsDue";
import { JobCard, groupByStage } from "./JobCard";
import { JobList } from "./JobList";

/** `?job=a&job=b` arrives as an array; treat it as the first value. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string | string[]; job?: string | string[]; q?: string | string[] }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  // The board once opened a job beside it. That panel is gone, so an old ?job= link
  // — a bookmark, or an already-sent calendar invite — goes to the job's own page.
  const openId = first(params.job);
  if (openId) redirect(`/admin/jobs/${openId}`);
  const filter = parseListFilter(first(params.list));
  // Only a known stage is carried into links, so an unknown ?list drops out.
  const list = filter ?? undefined;
  const q = (first(params.q) ?? "").trim().slice(0, SEARCH_MAX);
  const now = new Date();
  const [jobs, followUps] = await Promise.all([
    listJobs({ search: q }),
    listDueFollowUps(now),
  ]);
  const groups = groupByStage(jobs, BOARD_STAGES);
  const listed = filter ? jobs.filter((job) => job.status === filter) : jobs;

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
            {list ? <input type="hidden" name="list" value={list} /> : null}
            <button type="submit" className="sr-only">Search</button>
          </form>
          <Link href="/admin/jobs/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-charcoal px-4 text-sm font-medium text-ivory">
            <Icon name="plus" className="size-4" />
            New Job
          </Link>
        </div>

        {q ? (
          <p className="text-sm text-ink-soft">
            {listed.length === 0 ? `No jobs match "${q}"` : `${listed.length} ${listed.length === 1 ? "job matches" : "jobs match"} "${q}"`}
            {" · "}
            <Link href={boardHref({ list })} className="underline underline-offset-4">Clear search</Link>
          </p>
        ) : null}

        <FollowUpsDue jobs={followUps} now={now} />

        <section aria-label="Board">
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
                      <JobCard key={job.id} job={job} now={now} />
                    ))
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-ink-soft">
                      <Icon name={style.icon} className="size-8 opacity-40" />
                      <p>No jobs in this stage</p>
                    </div>
                  )}
                  <Link
                    href={`/admin/jobs/new?stage=${group.stage}`}
                    className="mt-auto rounded-lg bg-ivory/80 py-2 text-center text-sm text-charcoal hover:bg-ivory"
                  >
                    {group.stage === "new" ? "+ Add lead" : "+ Add job"}
                  </Link>
                </section>
              );
            })}
          </div>
        </section>

        <JobList jobs={listed} now={now} filter={filter} q={q} />
      </div>

    </div>
  );
}
