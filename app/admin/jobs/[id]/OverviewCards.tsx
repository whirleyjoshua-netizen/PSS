import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { budgetLabel } from "@/lib/admin/budget";
import type { Job } from "@/lib/admin/jobs";
import { mapsHref } from "@/lib/admin/links";
import { formatPhone } from "@/lib/leads/schema";
import { CARD, HEADING, TEXT_LINK } from "./ui";

const DL = "grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm";

export function CustomerCard({ job, referrer }: { job: Job; referrer: Job | null }) {
  const place = [job.address, job.city].filter(Boolean).join(", ");
  return (
    <section aria-labelledby="customer-heading" className={CARD}>
      <h2 id="customer-heading" className={HEADING}>Customer</h2>
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg">{job.name}</p>
        <a href={`tel:+1${job.phone}`} className="underline-offset-4 hover:underline">{formatPhone(job.phone)}</a>
        {job.email ? <a href={`mailto:${job.email}`} className="break-all underline-offset-4 hover:underline">{job.email}</a> : null}
        {place ? <a href={mapsHref(job.address, job.city)} className="text-ink-soft underline-offset-4 hover:underline">{place}</a> : null}
      </div>
      <dl className={`${DL} border-t border-rule pt-4`}>
        <dt className="text-ink-soft">Heard about us</dt><dd>{job.heardVia ?? "—"}</dd>
        <dt className="text-ink-soft">Came in via</dt><dd>{job.source}</dd>
        {referrer ? (
          <>
            <dt className="text-ink-soft">Referred by</dt>
            <dd><Link href={`/admin/jobs/${referrer.id}`} className={TEXT_LINK}>{referrer.name}</Link></dd>
          </>
        ) : null}
      </dl>
    </section>
  );
}

export function ProjectCard({ job, editHref }: { job: Job; editHref: string }) {
  return (
    <section aria-labelledby="project-heading" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="project-heading" className={HEADING}>Project details</h2>
        <Link href={editHref} className={TEXT_LINK}>Edit</Link>
      </div>
      <dl className={DL}>
        <dt className="text-ink-soft">Interested in</dt>
        <dd className="flex flex-wrap gap-1.5">
          {job.treatments.length
            ? job.treatments.map((t) => <span key={t} className="border border-rule bg-sand px-2 py-0.5 text-xs">{t}</span>)
            : "—"}
        </dd>
        <dt className="text-ink-soft">Windows</dt><dd>{job.windowCount ?? "—"}</dd>
        <dt className="text-ink-soft">Budget</dt><dd>{budgetLabel(job.budgetTier)}</dd>
        <dt className="text-ink-soft">Brands</dt><dd>{job.brands.join(", ") || "—"}</dd>
      </dl>
      {job.notes ? <p className="whitespace-pre-line border-l-2 border-champagne pl-4 text-sm">{job.notes}</p> : null}
    </section>
  );
}

export function StatusCard({ title, value, detail, empty, actions }: {
  title: string;
  value: string | null;
  detail?: string;
  empty: string;
  actions: { label: string; href: string }[];
}) {
  const id = `status-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className={CARD}>
      <h2 id={id} className={HEADING}>{title}</h2>
      <div className="flex flex-1 flex-col gap-1 text-sm">
        {value ? <p className="font-display text-lg">{value}</p> : <p className="text-ink-soft">{empty}</p>}
        {detail ? <p className="text-xs text-ink-soft">{detail}</p> : null}
      </div>
      {actions.map((action) => (
        <ButtonLink key={action.label} href={action.href} variant="outline" className="w-full px-3">{action.label}</ButtonLink>
      ))}
    </section>
  );
}
