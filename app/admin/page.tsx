import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { listJobs } from "@/lib/admin/jobs";
import { requireAdmin } from "@/lib/admin/session";
import { signOut } from "./actions";
import { JobCard, groupByStage } from "./JobCard";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ lost?: string }>;
}) {
  const { email } = await requireAdmin();
  const includeLost = (await searchParams).lost === "1";
  const groups = groupByStage(await listJobs({ includeLost }), includeLost);
  const now = new Date();

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-light">Jobs</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={includeLost ? "/admin" : "/admin?lost=1"} className="underline underline-offset-4">
            {includeLost ? "Hide lost" : "Show lost"}
          </Link>
          <ButtonLink href="/admin/jobs/new">New job</ButtonLink>
          <form action={signOut}>
            <button type="submit" className="text-ink-soft underline underline-offset-4" title={email}>
              Sign out
            </button>
          </form>
        </div>
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
              group.jobs.map((job) => <JobCard key={job.id} job={job} now={now} />)
            ) : (
              <p className="text-sm text-ink-soft">Nothing here.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
