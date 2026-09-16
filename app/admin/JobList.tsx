import Link from "next/link";
import type { Job } from "@/lib/admin/jobs";
import { boardHref } from "@/lib/admin/links";
import { LIST_FILTERS, STAGE_STYLE, stageLabel, type Stage } from "@/lib/admin/stages";
import { roleLabel } from "@/lib/admin/team-roles";
import { DaysInStage } from "./DaysInStage";
import { SubmitOnChange } from "./SubmitOnChange";

/** The archive under the board: every job, filtered by one stage or none. */
export function JobList({ jobs, now, filter, q, openId }: {
  jobs: Job[];
  now: Date;
  filter: Stage | null;
  q: string;
  openId: string | undefined;
}) {
  return (
    <section aria-labelledby="job-list" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="job-list" className="text-lg font-semibold text-charcoal">All jobs · {jobs.length}</h2>
        <form action="/admin" className="flex items-center gap-2">
          <label htmlFor="list-stage" className="text-sm text-ink-soft">Stage</label>
          <SubmitOnChange id="list-stage" name="list" defaultValue={filter ?? ""}>
            {LIST_FILTERS.map((option) => (
              <option key={option.value || "all"} value={option.value}>{option.label}</option>
            ))}
          </SubmitOnChange>
          {q ? <input type="hidden" name="q" value={q} /> : null}
          {openId ? <input type="hidden" name="job" value={openId} /> : null}
          <button type="submit" className="sr-only">Show</button>
        </form>
      </div>

      {jobs.length ? (
        <div className="overflow-x-auto rounded-xl border border-rule bg-ivory shadow-sm">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-rule text-xs uppercase tracking-[0.1em] text-ink-soft">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                <th scope="col" className="px-4 py-3 font-medium">City</th>
                <th scope="col" className="px-4 py-3 font-medium">Assigned to</th>
                <th scope="col" className="px-4 py-3 font-medium">Stage</th>
                <th scope="col" className="px-4 py-3 font-medium">In stage</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const style = STAGE_STYLE[job.status];
                const selected = job.id === openId;
                return (
                  <tr key={job.id} className={`relative border-b border-rule last:border-0 ${selected ? "bg-sand/60" : "hover:bg-sand/30"}`}>
                    <td className="px-4 py-3">
                      {/* One link per row, and its overlay makes the whole row clickable. Two of them,
                          one per breakpoint: the panel is desktop-only, so phones open the full page. */}
                      <Link
                        href={`/admin/jobs/${job.id}`}
                        className="font-semibold text-charcoal underline-offset-4 after:absolute after:inset-0 hover:underline lg:hidden"
                      >
                        {job.name}
                      </Link>
                      <Link
                        href={boardHref({ q, list: filter, job: job.id })}
                        aria-current={selected ? "true" : undefined}
                        className="hidden font-semibold text-charcoal underline-offset-4 after:absolute after:inset-0 hover:underline lg:inline"
                      >
                        {job.name}
                      </Link>
                      {job.referredBy ? (
                        <span className="ml-2 rounded border border-champagne-ink px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-champagne-ink">
                          Referral
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{job.city}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {job.assignedName && job.assignedRole ? `${job.assignedName} · ${roleLabel(job.assignedRole)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block border-l-[3px] ${style.left} pl-2 font-medium ${style.tint}`}>
                        {stageLabel(job.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs uppercase tracking-[0.1em] text-ink-soft">
                      <span className="inline-flex items-center gap-1.5">
                        <DaysInStage job={job} now={now} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-rule bg-ivory p-6 text-center text-sm text-ink-soft">
          {q ? "No jobs match" : filter ? "No jobs in this stage" : "No jobs yet"}
        </p>
      )}
    </section>
  );
}
