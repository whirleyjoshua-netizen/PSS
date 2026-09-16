import { business } from "@/content/business";
import { docTypeLabel } from "@/lib/admin/doc-types";
import type { Job } from "@/lib/admin/jobs";
import { listSharedDocuments, listSharedPhotos } from "@/lib/admin/files";
import { formatDateOnly, formatShortDate } from "@/lib/admin/time";
import { toProject } from "@/lib/portal/access";
import { countReferred } from "@/lib/portal/project";
import { installAppointmentAt, lastMeasuredAt, stageDates } from "@/lib/portal/timeline";
import { ensureReferralCode } from "@/lib/referrals/db";
import { referralUrl } from "@/lib/referrals/codes";
import { signOutCustomer } from "./actions";
import { CopyLinkButton } from "./CopyLinkButton";
import { DetailsCard } from "./DetailsCard";
import { FilesTabs } from "./FilesTabs";
import { StatusBanner, STEP_NEXT } from "./StatusBanner";
import { StepTracker } from "./StepTracker";
import { UpdatesList } from "./UpdatesList";

const heading = "font-display text-xs uppercase tracking-[0.2em] text-champagne-ink";

/**
 * The customer's view of one job. It renders only from toProject(), the shared photos
 * and the shared documents, so nothing private can slip onto the page: no money, notes,
 * gate code or contact fields, and never the body of a job event.
 */
export async function ProjectView({ job }: { job: Job }) {
  const [photos, documents, code, referred, dates, measuredAt, installAt] = await Promise.all([
    listSharedPhotos(job.id),
    listSharedDocuments(job.id),
    ensureReferralCode(job.id),
    countReferred(job.id),
    stageDates(job.id),
    lastMeasuredAt(job.id),
    installAppointmentAt(job.id),
  ]);
  const project = toProject(job, {
    stageDates: dates,
    lastMeasuredAt: measuredAt,
    installAppointmentAt: installAt,
  });
  const place = [project.address, project.city].filter(Boolean).join(", ");

  const current =
    project.steps.find((step) => step.state === "current") ??
    [...project.steps].reverse().find((step) => step.state === "done") ??
    project.steps[0];
  const quote = documents.find((file) => file.docType === "quote");
  const installLabel = project.installOn
    ? formatDateOnly(project.installOn)
    : installAt
      ? formatShortDate(installAt)
      : "Not scheduled yet";

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-light">Hi {project.firstName}, your project is underway.</h1>
          <p className="text-ink-soft">{place}</p>
          {project.projectNo ? <p className="text-sm text-ink-soft">{project.projectNo}</p> : null}
        </div>
        <form action={signOutCustomer}>
          <button type="submit" className="min-h-11 px-3 text-sm underline underline-offset-4">Sign out</button>
        </form>
      </header>

      <StatusBanner step={current} quoteHref={quote ? `/project/files/${quote.id}` : null} />

      <section className="flex flex-col gap-4" aria-labelledby="progress-heading">
        <h2 id="progress-heading" className={heading}>Your project</h2>
        <StepTracker steps={project.steps} />
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="next-heading">
        <h2 id="next-heading" className={heading}>Next step</h2>
        {quote && current.key === "quote" ? (
          <p className="font-display text-xs uppercase tracking-[0.2em] text-charcoal">Action required</p>
        ) : null}
        <p>{STEP_NEXT[current.key]}</p>
      </section>

      <DetailsCard project={project} installLabel={installLabel} inProduction={current.key === "production"} />

      <UpdatesList steps={project.steps} />

      <section className="flex flex-col gap-4" aria-labelledby="files-heading">
        <h2 id="files-heading" className={heading}>Photos &amp; documents</h2>
        <FilesTabs
          photos={
            photos.length === 0 ? (
              <p className="text-ink-soft">Photos from your install will appear here.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((photo) => (
                  <li key={photo.id}>
                    <a href={`/project/files/${photo.id}`} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private files are streamed by our own route, not the image optimizer */}
                      <img src={`/project/files/${photo.id}`} alt="Photo of your project" className="aspect-square w-full max-w-full object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            )
          }
          documents={
            documents.length === 0 ? (
              <p className="text-ink-soft">Paperwork we share with you will appear here.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-rule border-t border-rule">
                {documents.map((file) => (
                  <li key={file.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                    <a
                      href={`/project/files/${file.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="min-h-11 break-all underline underline-offset-4"
                    >
                      {file.name}
                    </a>
                    <span className={heading}>{file.docType ? docTypeLabel(file.docType) : "Document"}</span>
                  </li>
                ))}
              </ul>
            )
          }
        />
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="contact-heading">
        <h2 id="contact-heading" className={heading}>Questions?</h2>
        <a href={business.phone.href} className="underline underline-offset-4">{business.phone.display}</a>
        <a href={`mailto:${business.email}`} className="underline underline-offset-4">{business.email}</a>
      </section>

      {code ? (
        <section className="flex flex-col gap-3 border border-rule bg-sand/50 p-6" aria-labelledby="refer-heading">
          <h2 id="refer-heading" className={heading}>Refer a friend</h2>
          <p>Know someone who needs new blinds? Share your link. When they buy, you get $100.</p>
          <p className="break-all font-semibold">{referralUrl(code)}</p>
          <CopyLinkButton link={referralUrl(code)} />
          <p className="text-sm text-ink-soft">Friends referred so far: {referred}</p>
        </section>
      ) : null}
    </div>
  );
}
