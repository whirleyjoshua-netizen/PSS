import Link from "next/link";
import type { JobFile } from "@/lib/admin/files";
import type { Job, JobEvent } from "@/lib/admin/jobs";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { editDetailsHref } from "@/lib/admin/next-action";
import { STAGES } from "@/lib/admin/stages";
import { formatDateOnly, formatWhen } from "@/lib/admin/time";
import { isPortalStage } from "@/lib/portal/progress";
import type { listReferrals } from "@/lib/referrals/db";
import { DetailsForm } from "./DetailsForm";
import { EventList } from "./EventList";
import { InviteSection } from "./InviteSection";
import { MoneyStrip } from "./MoneyStrip";
import { NextActionCard } from "./NextActionCard";
import { CustomerCard, ProjectCard, StatusCard } from "./OverviewCards";
import { ReferralSection } from "./ReferralSection";
import { ReferralsList } from "./ReferralsList";
import { ReviewSection } from "./ReviewSection";
import { tabHref } from "./tabs";
import { CARD, HEADING, TEXT_LINK } from "./ui";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function OverviewTab({ job, editing, now, measurements, files, events, referrals, referrer }: {
  job: Job;
  editing: boolean;
  now: Date;
  measurements: WindowMeasurement[];
  files: JobFile[];
  events: JobEvent[];
  referrals: Awaited<ReturnType<typeof listReferrals>>;
  referrer: Job | null;
}) {
  const edit = editDetailsHref(job.id);
  const stageIndex = STAGES.findIndex((s) => s.value === job.status);
  const soldOrLater = stageIndex >= STAGES.findIndex((s) => s.value === "sold");
  const photos = files.filter((file) => file.kind === "photo").slice(0, 6);
  const documents = files.filter((file) => file.kind === "document").length;
  const lastMeasured = measurements.reduce<Date | null>(
    (latest, m) => (!latest || m.updatedAt > latest ? m.updatedAt : latest), null,
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <CustomerCard job={job} referrer={referrer} />
      <ProjectCard job={job} editHref={edit} />
      <NextActionCard job={job} measurementCount={measurements.length} />

      {editing ? (
        <section aria-labelledby="edit-heading" className={`${CARD} lg:col-span-3`}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="edit-heading" className={HEADING}>Job details</h2>
            <Link href={tabHref(job.id, "overview")} className={TEXT_LINK}>Done</Link>
          </div>
          <DetailsForm job={job} />
        </section>
      ) : (
        <>
          <div className="lg:col-span-3"><MoneyStrip job={job} editHref={edit} /></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
            <StatusCard title="Visit" value={job.visitAt ? formatWhen(job.visitAt) : null} empty="No visit booked"
              actions={job.visitAt ? [] : [{ label: "Book visit", href: editDetailsHref(job.id, "visitAt") }]} />
            <StatusCard title="Measurements" value={measurements.length ? plural(measurements.length, "window") : null}
              detail={lastMeasured ? `Updated ${formatWhen(lastMeasured)}` : undefined} empty="No windows measured yet"
              actions={[
                { label: "Add measurement", href: `/admin/jobs/${job.id}/measure` },
                ...(measurements.length ? [{ label: "View all", href: tabHref(job.id, "measurements") }] : []),
              ]} />
            <StatusCard title="Order" value={job.orderedOn ? formatDateOnly(job.orderedOn) : null} empty="Not ordered"
              actions={job.orderedOn ? [] : [{ label: "Set order date", href: edit }]} />
            <StatusCard title="Install" value={job.installOn ? formatDateOnly(job.installOn) : null} empty="Not scheduled"
              actions={job.installOn ? [] : [{ label: "Set install date", href: edit }]} />
          </div>
        </>
      )}

      <section aria-labelledby="portal-heading" className={CARD}>
        <h2 id="portal-heading" className={HEADING}>Customer project page</h2>
        <InviteSection
          jobId={job.id}
          hasEmail={Boolean(job.email?.trim())}
          canInvite={isPortalStage(job.status)}
          invitedLabel={job.portalInvitedAt ? formatWhen(job.portalInvitedAt) : null}
        />
      </section>
      {soldOrLater ? (
        <>
          <section aria-labelledby="review-heading" className={CARD}>
            <h2 id="review-heading" className={HEADING}>Review request</h2>
            <ReviewSection job={job} />
          </section>
          <section aria-labelledby="referral-heading" className={CARD}>
            <h2 id="referral-heading" className={HEADING}>Referral link</h2>
            <ReferralSection job={job} />
          </section>
        </>
      ) : null}
      {referrals.length ? (
        <section aria-labelledby="referrals-heading" className={`${CARD} lg:col-span-3`}>
          <h2 id="referrals-heading" className={HEADING}>Referrals</h2>
          <ReferralsList referrerId={job.id} referrals={referrals} />
        </section>
      ) : null}

      <section aria-labelledby="recent-heading" className={`${CARD} lg:col-span-2`}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="recent-heading" className={HEADING}>Recent activity</h2>
          <div className="flex gap-4">
            <Link href={tabHref(job.id, "activity")} className={TEXT_LINK}>Add note</Link>
            <Link href={tabHref(job.id, "activity")} className={TEXT_LINK}>All activity</Link>
          </div>
        </div>
        <EventList events={events.slice(0, 5)} now={now} />
      </section>

      <section aria-labelledby="files-heading" className={CARD}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="files-heading" className={HEADING}>Files and photos</h2>
          {files.length ? <Link href={tabHref(job.id, "files")} className={TEXT_LINK}>Files</Link> : null}
        </div>
        {files.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No files yet. <Link href={tabHref(job.id, "files")} className={TEXT_LINK}>Upload</Link>
          </p>
        ) : (
          <>
            {photos.length ? (
              <ul className="grid grid-cols-3 gap-2">
                {photos.map((file) => (
                  <li key={file.id}>
                    <a href={`/admin/files/${file.id}`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private files are streamed by our own route, not the image optimizer */}
                      <img src={`/admin/files/${file.id}`} alt={file.name} className="aspect-square w-full object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-sm text-ink-soft">{plural(documents, "document")}</p>
          </>
        )}
      </section>
    </div>
  );
}
