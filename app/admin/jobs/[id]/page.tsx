import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPhone } from "@/lib/leads/schema";
import { getEvents, getJob } from "@/lib/admin/jobs";
import { listFiles } from "@/lib/admin/files";
import { mapsHref } from "@/lib/admin/links";
import { listMeasurements } from "@/lib/admin/measurements";
import { formatCents } from "@/lib/admin/money";
import { requireAdmin } from "@/lib/admin/session";
import { STAGES, stageLabel } from "@/lib/admin/stages";
import { formatWhen } from "@/lib/admin/time";
import { isPortalStage } from "@/lib/portal/progress";
import { listReferrals } from "@/lib/referrals/db";
import { DetailsForm } from "./DetailsForm";
import { InviteSection } from "./InviteSection";
import { JobFiles } from "./JobFiles";
import { NoteForm } from "./NoteForm";
import { ReferralSection } from "./ReferralSection";
import { ReferralsList } from "./ReferralsList";
import { ReviewSection } from "./ReviewSection";
import { StageControls } from "./StageControls";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const [events, referrals, referrer, measurements, files] = await Promise.all([
    getEvents(id),
    listReferrals(id),
    job.referredBy ? getJob(job.referredBy) : Promise.resolve(null),
    listMeasurements(id),
    listFiles(id),
  ]);
  const soldIndex = STAGES.findIndex((s) => s.value === "sold");
  const soldOrLater = STAGES.findIndex((s) => s.value === job.status) >= soldIndex;

  const mapHref = mapsHref(job.address, job.city);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <Link href="/admin" className="text-sm underline underline-offset-4">← All jobs</Link>

      <section className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-light">{job.name}</h1>
        <a href={`tel:+1${job.phone}`} className="text-lg underline-offset-4 hover:underline">{formatPhone(job.phone)}</a>
        {job.email ? <a href={`mailto:${job.email}`} className="underline-offset-4 hover:underline">{job.email}</a> : null}
        <a href={mapHref} className="text-ink-soft underline-offset-4 hover:underline">
          {[job.address, job.city].filter(Boolean).join(", ")}
        </a>
        <dl className="mt-2 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1 text-sm text-ink-soft">
          <dt>Interested in</dt><dd>{job.treatments.join(", ") || "—"}</dd>
          <dt>Windows</dt><dd>{job.windowCount ?? "—"}</dd>
          <dt>Heard about us</dt><dd>{job.heardVia ?? "—"}</dd>
          <dt>Came in via</dt><dd>{job.source}</dd>
          {referrer ? (
            <>
              <dt>Referred by</dt>
              <dd><Link href={`/admin/jobs/${referrer.id}`} className="underline underline-offset-4">{referrer.name}</Link></dd>
            </>
          ) : null}
          <dt>Quote / sold</dt><dd>{formatCents(job.quoteCents)} / {formatCents(job.soldCents)}</dd>
        </dl>
        {job.notes ? <p className="mt-2 whitespace-pre-line border-l-2 border-champagne pl-4 text-sm">{job.notes}</p> : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Stage</h2>
        <StageControls job={job} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Customer project page</h2>
        <InviteSection
          jobId={job.id}
          hasEmail={Boolean(job.email?.trim())}
          canInvite={isPortalStage(job.status)}
          invitedLabel={job.portalInvitedAt ? formatWhen(job.portalInvitedAt) : null}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Job details</h2>
        <DetailsForm job={job} />
      </section>

      {soldOrLater ? (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Review request</h2>
            <ReviewSection job={job} />
          </section>
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Referral link</h2>
            <ReferralSection job={job} />
          </section>
        </>
      ) : null}

      {referrals.length ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Referrals</h2>
          <ReferralsList referrerId={job.id} referrals={referrals} />
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Files</h2>
        <JobFiles jobId={job.id} measurements={measurements} files={files} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Activity</h2>
        <NoteForm jobId={job.id} />
        <ol className="flex flex-col gap-3 text-sm">
          {events.map((event) => (
            <li key={event.id} className="border-b border-rule pb-3">
              <p className="text-charcoal">
                {event.kind === "stage" && event.toStatus
                  ? `${event.fromStatus ? `${stageLabel(event.fromStatus)} → ` : ""}${stageLabel(event.toStatus)}`
                  : event.body}
              </p>
              {event.kind === "stage" && event.body ? <p className="text-ink-soft">{event.body}</p> : null}
              <p className="text-xs text-ink-soft">{event.actor} · {formatWhen(event.createdAt)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
