import Link from "next/link";
import type { JobFile } from "@/lib/admin/files";
import type { Job } from "@/lib/admin/jobs";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { mapsHref } from "@/lib/admin/links";
import { formatCents } from "@/lib/admin/money";
import { daysInStage, isOverdue } from "@/lib/admin/overdue";
import { formatWhen } from "@/lib/admin/time";
import { formatPhone } from "@/lib/leads/schema";
import { JobFiles } from "./jobs/[id]/JobFiles";
import { StageControls } from "./jobs/[id]/StageControls";

const PANEL =
  "fixed inset-0 z-40 flex flex-col gap-8 overflow-y-auto bg-ivory p-4 md:sticky md:inset-auto md:top-6 md:z-auto md:max-h-[calc(100vh-3rem)] md:w-[28rem] md:shrink-0 md:border md:border-rule md:p-6";
const HEADING = "font-display text-xs uppercase tracking-[0.2em] text-champagne-ink";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `panel-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className={HEADING}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-charcoal">{value}</dd>
    </>
  );
}

export function JobPanel({ job, measurements, files, now, closeHref }: {
  job: Job | null;
  measurements: WindowMeasurement[];
  files: JobFile[];
  now: Date;
  closeHref: string;
}) {
  if (!job) {
    return (
      <aside aria-label="Job not found" className={PANEL}>
        <p>That job no longer exists.</p>
        <Link href={closeHref} className="text-sm underline underline-offset-4">Close</Link>
      </aside>
    );
  }

  const days = daysInStage(job.stageChangedAt, now);
  const balance = job.soldCents !== null && job.depositCents !== null ? job.soldCents - job.depositCents : null;

  return (
    <aside aria-label={`${job.name} details`} className={PANEL}>
      <header className="flex items-start justify-between gap-4">
        <h2 className="font-display text-2xl font-light">{job.name}</h2>
        <nav className="flex shrink-0 gap-4 text-sm">
          <Link href={`/admin/jobs/${job.id}`} className="underline underline-offset-4">Full page</Link>
          <Link href={closeHref} className="underline underline-offset-4">Close</Link>
        </nav>
      </header>

      <Section title="Contact">
        <div className="flex flex-col gap-1">
          <a href={`tel:+1${job.phone}`} className="underline-offset-4 hover:underline">{formatPhone(job.phone)}</a>
          {job.email ? <a href={`mailto:${job.email}`} className="underline-offset-4 hover:underline">{job.email}</a> : null}
          <a href={mapsHref(job.address, job.city)} className="text-ink-soft underline-offset-4 hover:underline">
            {[job.address, job.city].filter(Boolean).join(", ")}
          </a>
        </div>
      </Section>

      <Section title="Money">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <Row label="Quote" value={formatCents(job.quoteCents)} />
          <Row label="Sold" value={formatCents(job.soldCents)} />
          <Row label="Deposit" value={formatCents(job.depositCents)} />
          <Row label="Balance due" value={formatCents(balance)} />
        </dl>
      </Section>

      <Section title="Stage and dates">
        <StageControls job={job} />
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <Row label="Visit" value={job.visitAt ? formatWhen(job.visitAt) : "—"} />
          <Row label="Order" value={job.orderedOn ?? "—"} />
          <Row label="Install" value={job.installOn ?? "—"} />
        </dl>
        <p className="font-display text-xs uppercase tracking-[0.12em] text-champagne-ink">
          {days === 1 ? "1 day" : `${days} days`} in stage
          {isOverdue(job, now) ? <strong className="ml-2 text-charcoal">· Overdue</strong> : null}
        </p>
      </Section>

      <Section title="Measurements and files">
        <JobFiles jobId={job.id} measurements={measurements} files={files} />
      </Section>
    </aside>
  );
}
