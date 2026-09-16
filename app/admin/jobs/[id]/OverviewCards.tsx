import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import type { Job } from "@/lib/admin/jobs";
import { mapsHref } from "@/lib/admin/links";
import { formatPhone } from "@/lib/leads/schema";
import { finishBudgetLabel } from "@/lib/leads/finish";
import { treatmentTypeLabels } from "@/lib/leads/treatment-types";
import { windowCountLabel } from "@/lib/leads/window-count";
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
        <dt className="text-ink-soft">Exact windows</dt>
        <dd>{job.windowCountExact ? windowCountLabel(job.windowCountExact) : "—"}</dd>
        <dt className="text-ink-soft">Treatment types</dt>
        <dd className="flex flex-wrap gap-1.5">
          {job.treatmentTypes?.length
            ? treatmentTypeLabels(job.treatmentTypes).map((label) => (
                <span key={label} className="border border-rule bg-sand px-2 py-0.5 text-xs">{label}</span>
              ))
            : "—"}
        </dd>
        <dt className="text-ink-soft">Motorized</dt><dd>{job.motorized ? "Yes" : "No"}</dd>
        <dt className="text-ink-soft">Gate code</dt><dd>{job.gateCode ?? "—"}</dd>
        <dt className="text-ink-soft">Budget</dt><dd>{finishBudgetLabel(job.finish, job.budgetTier)}</dd>
      </dl>
      {job.notes ? <p className="whitespace-pre-line border-l-2 border-champagne pl-4 text-sm">{job.notes}</p> : null}
    </section>
  );
}

export function StatusCard({ title, value, detail, empty, actions = [], children }: {
  title: string;
  value: string | null;
  detail?: string;
  /** What to say instead of a value. Left out when the card fills the space itself. */
  empty?: string;
  actions?: { label: string; href: string }[];
  /** Controls or a list under the value, for a card that does more than link somewhere. */
  children?: React.ReactNode;
}) {
  const id = `status-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className={CARD}>
      <h2 id={id} className={HEADING}>{title}</h2>
      <div className="flex flex-1 flex-col gap-3 text-sm">
        {value ? <p className="font-display text-lg">{value}</p> : null}
        {!value && empty ? <p className="text-ink-soft">{empty}</p> : null}
        {detail ? <p className="text-xs text-ink-soft">{detail}</p> : null}
        {children}
      </div>
      {actions.map((action) => (
        <ButtonLink key={action.label} href={action.href} variant="outline" className="w-full px-3">{action.label}</ButtonLink>
      ))}
    </section>
  );
}
