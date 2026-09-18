import { business } from "@/content/business";
import { docTypeLabel } from "@/lib/admin/doc-types";
import type { Job } from "@/lib/admin/jobs";
import { listSharedDocuments, listSharedPhotos } from "@/lib/admin/files";
import { isInstalled } from "@/lib/admin/stages";
import { formatDateOnly, formatMonthDay, formatShortDate, lasVegasDate } from "@/lib/admin/time";
import { toProject } from "@/lib/portal/access";
import { currentStep } from "@/lib/portal/progress";
import { countReferred, listServiceRequests } from "@/lib/portal/project";
import { formatProjectNo } from "@/lib/portal/project-no";
import { listMessages } from "@/lib/portal/messages";
import { requireCustomer } from "@/lib/portal/session";
import { installAppointmentAt, lastMeasuredAt, stageDates } from "@/lib/portal/timeline";
import { ensureReferralCode } from "@/lib/referrals/db";
import { referralUrl } from "@/lib/referrals/codes";
import { signOutCustomer } from "./actions";
import { AfterWork } from "./AfterWork";
import { ApproveQuote } from "./ApproveQuote";
import { CopyLinkButton } from "./CopyLinkButton";
import { DetailsCard } from "./DetailsCard";
import { FilesTabs } from "./FilesTabs";
import { MessageForm } from "./MessageForm";
import { StatusBanner, STEP_NEXT } from "./StatusBanner";
import { StepTracker } from "./StepTracker";
import { UpdatesList } from "./UpdatesList";

const heading = "font-display text-xs uppercase tracking-[0.2em] text-champagne-ink";

/**
 * The customer's view of one job. It renders only from toProject(), the shared photos
 * and the shared documents, so nothing private can slip onto the page: no money, notes,
 * gate code or contact fields, and no job event body except the customer's own messages,
 * which are the words they themselves sent from this page.
 */
export async function ProjectView({
  job,
  justRequested,
}: {
  job: Job;
  /** Set only on the hop back from a service request, to name its new project number. */
  justRequested?: string | null;
}) {
  // Request-cached, so this costs no extra round trip: the page's own guard already ran it.
  const { email } = await requireCustomer();
  const [photos, documents, code, referred, dates, measuredAt, installAt, messages, serviceAt] = await Promise.all([
    listSharedPhotos(job.id),
    listSharedDocuments(job.id),
    ensureReferralCode(job.id),
    countReferred(job.id),
    stageDates(job.id),
    lastMeasuredAt(job.id),
    installAppointmentAt(job.id),
    listMessages(job.id, email),
    // Only a finished job can show the lines, so an unfinished one does not pay for the query.
    isInstalled(job.status) ? listServiceRequests(job.id) : Promise.resolve([]),
  ]);
  const project = toProject(job, {
    stageDates: dates,
    lastMeasuredAt: measuredAt,
    installAppointmentAt: installAt,
  });
  const place = [project.address, project.city].filter(Boolean).join(", ");

  const current = currentStep(project.steps);
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

      {/* The quote is already loaded above, so the approve control costs no extra query. It
          appears only when there is a quote to read and the job is still waiting on it; the
          action re-checks both regardless. */}
      <StatusBanner
        step={current}
        quoteHref={quote ? `/project/files/${quote.id}` : null}
        approve={quote && project.status === "quoted" ? <ApproveQuote jobId={job.id} /> : null}
      />

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

      <section className="flex flex-col gap-2" aria-labelledby="install-heading">
        <h2 id="install-heading" className={heading}>Installation</h2>
        {/* A finished job is finished: its install_on is in the past, and telling a customer whose
            blinds are already up that we will call to confirm the date would contradict the banner
            on this same page. toPortalStage folds completed into installed, so this covers both. */}
        {project.status === "installed" ? (
          <p>
            {project.installOn
              ? `Your installation was completed on ${formatDateOnly(project.installOn)}.`
              : "Your installation is complete."}{" "}
            If anything needs adjusting, call us and we will come back out.
          </p>
        ) : project.installOn || installAt ? (
          <p>Your installation is booked for {installLabel}. We will be in touch to confirm the details.</p>
        ) : (
          <p>
            Your installation is not booked yet. We will call you to arrange a day as soon as your
            treatments arrive, and you will get an email once it is on the calendar.
          </p>
        )}
      </section>

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

      <AfterWork
        project={project}
        serviceRequests={serviceAt.map((request) => ({
          on: formatMonthDay(lasVegasDate(request.at)),
          projectNo: formatProjectNo(request.projectNo),
        }))}
        justRequested={justRequested ?? null}
      />

      <section className="flex flex-col gap-4" aria-labelledby="contact-heading">
        <h2 id="contact-heading" className={heading}>Questions?</h2>
        <div className="flex flex-col gap-2">
          <a href={business.phone.href} className="underline underline-offset-4">{business.phone.display}</a>
          <a href={`mailto:${business.email}`} className="underline underline-offset-4">{business.email}</a>
        </div>
        <MessageForm
          jobId={job.id}
          messages={messages.map((message) => ({ body: message.body, at: formatShortDate(message.createdAt) }))}
        />
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
