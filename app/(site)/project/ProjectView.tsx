import { business } from "@/content/business";
import { DocText } from "@/components/docs/DocText";
import { storedDocTypeLabel } from "@/lib/admin/doc-types";
import type { Job } from "@/lib/admin/jobs";
import { listSharedDocuments, listSharedPhotos } from "@/lib/admin/files";
import { isUuid } from "@/lib/admin/ids";
import { isInstalled } from "@/lib/admin/stages";
import { formatDateOnly, formatMonthDay, formatShortDate, formatTime, lasVegasDate } from "@/lib/admin/time";
import { cancellationWindowLastDay } from "@/lib/docs/business-days";
import { parseDocText } from "@/lib/docs/parse";
import { liveTemplateOfKind } from "@/lib/docs/templates";
import { acknowledgeableDocuments, acknowledgementFor } from "@/lib/portal/acknowledge-document";
import { depositState } from "@/lib/payments/deposits";
import { toProject } from "@/lib/portal/access";
import { guidesToShow } from "@/lib/portal/guides";
import { currentStep } from "@/lib/portal/progress";
import { countReferred, listServiceRequests } from "@/lib/portal/project";
import { formatProjectNo } from "@/lib/portal/project-no";
import { listMessages } from "@/lib/portal/messages";
import { listSignatures, signableContracts } from "@/lib/portal/sign";
import { requireCustomer } from "@/lib/portal/session";
import { installAppointmentAt, lastMeasuredAt, stageDates } from "@/lib/portal/timeline";
import { ensureReferralCode } from "@/lib/referrals/db";
import { referralUrl } from "@/lib/referrals/codes";
import { signOutCustomer } from "./actions";
import { AcknowledgeDocument, DocumentAcknowledgedNotice } from "./AcknowledgeDocument";
import { AcknowledgeInstall, AcknowledgeNotice } from "./AcknowledgeInstall";
import { AfterWork } from "./AfterWork";
import { ApprovalNotice, ApproveQuote } from "./ApproveQuote";
import { CopyLinkButton } from "./CopyLinkButton";
import { DepositCard, DepositNotice } from "./DepositCard";
import { DetailsCard } from "./DetailsCard";
import { FilesTabs } from "./FilesTabs";
import { MessageForm } from "./MessageForm";
import { SignatureNotice, SignContract } from "./SignContract";
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
  justApproved,
  justAcknowledged,
  justSigned,
  justSignedFile,
  justDocAck,
  justDeposit,
}: {
  job: Job;
  /** Set only on the hop back from a service request, to name its new project number. */
  justRequested?: string | null;
  /**
   * The `?approved=` flag from the hop back after approving a quote. Unvalidated — see
   * ApprovalNotice, which checks it against the job's real status before saying anything.
   */
  justApproved?: string | null;
  /**
   * The `?acknowledged=` flag from the hop back after confirming an installation. Unvalidated
   * — see AcknowledgeNotice, which checks it against the job's real status first.
   */
  justAcknowledged?: string | null;
  /**
   * The `?signed=` flag from the hop back after signing a contract. Unvalidated — see
   * SignatureNotice, which checks it against the job's recorded signatures first.
   */
  justSigned?: string | null;
  /** The `?file=` the signing redirect names. Unvalidated: only a lookup key into this job's signatures. */
  justSignedFile?: string | null;
  /** The `?docAck=` flag from the hop back after acknowledging. Unvalidated: DocumentAcknowledgedNotice checks it. */
  justDocAck?: string | null;
  /** The `?deposit=` flag from the hop back from Stripe. Unvalidated — DepositNotice asks the database whether it is paid. */
  justDeposit?: string | null;
}) {
  // Request-cached, so this costs no extra round trip: the page's own guard already ran it.
  const { email } = await requireCustomer();
  const [photos, documents, code, referred, dates, measuredAt, installAt, messages, serviceAt, contracts, signatures, acknowledgeable, deposit] = await Promise.all([
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
    // The same helper the sign action re-derives from, so the page and the guard cannot drift.
    signableContracts(job.id),
    listSignatures(job.id),
    // The same helper the acknowledge action re-derives from.
    acknowledgeableDocuments(job.id),
    // The deposit picture: the card below and the notice after the hop back from Stripe.
    depositState(job.id),
  ]);
  // Only the guides this stage shows are loaded; the acknowledgement is looked up only on the
  // hop back, and only believed when it is this job's.
  const guides = guidesToShow(job, installAt);
  const [installGuide, careGuide, justAcknowledgement] = await Promise.all([
    guides.install ? liveTemplateOfKind("guide_install") : Promise.resolve(null),
    guides.care ? liveTemplateOfKind("guide_care") : Promise.resolve(null),
    justDocAck && justSignedFile && isUuid(justSignedFile) ? acknowledgementFor(justSignedFile) : Promise.resolve(null),
  ]);
  const acknowledgement = justAcknowledgement?.leadId === job.id ? justAcknowledgement : null;
  const project = toProject(job, {
    stageDates: dates,
    lastMeasuredAt: measuredAt,
    installAppointmentAt: installAt,
  });
  const place = [project.address, project.city].filter(Boolean).join(", ");

  const current = currentStep(project.steps);
  const quote = documents.find((file) => file.docType === "quote");
  // Spec §3: a Signed job owes its deposit until one is paid. The action re-checks every part of this.
  const depositDue = job.status === "signed" && deposit?.versionStatus === "signed" && deposit.jobStatus === "signed" && !deposit.paid ? deposit : null;
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

      {/* Spec §7: everything waiting on the customer, at the top. The two lists come from the same
          helpers the sign and acknowledge actions re-derive from, so the page and the guards agree. */}
      {contracts.length > 0 || acknowledgeable.length > 0 || depositDue ? (
        <section className="flex flex-col gap-4" aria-labelledby="attention-heading">
          <h2 id="attention-heading" className={heading}>Needs your attention</h2>
          {contracts.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">Documents to sign</h3>
              {contracts.map((file) => <SignContract key={file.id} jobId={job.id} file={file} />)}
            </div>
          ) : null}
          {acknowledgeable.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">Documents to acknowledge</h3>
              {acknowledgeable.map((doc) => <AcknowledgeDocument key={doc.id} jobId={job.id} document={doc} />)}
            </div>
          ) : null}
          {depositDue ? (
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">Deposit</h3>
              <DepositCard jobId={job.id} amountCents={depositDue.amountCents} lastCancellableDay={cancellationWindowLastDay(depositDue.signedAt)} />
            </div>
          ) : null}
        </section>
      ) : null}

      {/* The quote is already loaded above, so the approve control costs no extra query. It
          appears only when there is a quote to read and the job is still waiting on it; the
          action re-checks both regardless. */}
      {/* The acknowledgement keys on the job's RAW status, not the project's. toPortalStage
          folds `completed` into `installed` so the customer never reads the word Completed,
          which means project.status cannot tell a confirmed installation from an unconfirmed
          one — and asking a customer again whether the work is right, after they have already
          told us, is the one thing spec §5 says must not happen. */}
      <StatusBanner
        step={current}
        quoteHref={quote ? `/project/files/${quote.id}` : null}
        approve={quote && project.status === "quoted" ? <ApproveQuote jobId={job.id} /> : null}
        acknowledge={job.status === "installed" ? <AcknowledgeInstall jobId={job.id} /> : null}
      />
      {/* Sits under the banner it answers: the customer's eye is already there, and the banner
          beside it now reads Order Confirmed, which is the confirmation's own evidence. */}
      <ApprovalNotice approved={justApproved ?? null} status={project.status} />
      <AcknowledgeNotice acknowledged={justAcknowledged ?? null} status={job.status} />
      {/* The notice speaks about the one contract the redirect names, looked up among THIS job's
          signatures, so another contract's signature can neither confirm nor silence it. */}
      <SignatureNotice
        signed={justSigned ?? null}
        signature={signatures.find((signature) => signature.fileId === justSignedFile) ?? null}
      />
      <DocumentAcknowledgedNotice flag={justDocAck ?? null} acknowledgement={acknowledgement} />
      <DepositNotice flag={justDeposit ?? null} paid={Boolean(deposit?.paid)} />
      {/* A lasting record, not the one-time notice: only a recorded signature produces a line, and
          it still reads Signed when no stamped copy exists — the link appears only when one does. */}
      {signatures.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="signed-heading">
          <h2 id="signed-heading" className={heading}>Signed</h2>
          <ul className="flex flex-col gap-2">
            {signatures.map((signature) => (
              <li key={signature.fileId} className="flex flex-col gap-1">
                <p>
                  Signed on {formatShortDate(signature.signedAt)} at {formatTime(signature.signedAt)}:{" "}
                  <span className="break-all">
                    {signature.documentTitle ?? documents.find((file) => file.id === signature.fileId)?.name ?? "your contract"}
                  </span>
                </p>
                {signature.signedFileId ? (
                  <a
                    href={`/project/files/${signature.signedFileId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-11 break-all underline underline-offset-4"
                  >
                    Download the signed copy
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-4" aria-labelledby="progress-heading">
        <h2 id="progress-heading" className={heading}>Your project</h2>
        <StepTracker steps={project.steps} />
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="next-heading">
        <h2 id="next-heading" className={heading}>Next step</h2>
        {(quote && current.key === "quote") || depositDue ? (
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
      {installGuide ? (
        <section className="flex flex-col gap-3" aria-labelledby="guide-install-heading">
          <h2 id="guide-install-heading" className={heading}>Getting ready for your install</h2>
          <DocText blocks={parseDocText(installGuide.body)} />
        </section>
      ) : null}
      {careGuide ? (
        <section className="flex flex-col gap-3" aria-labelledby="guide-care-heading">
          <h2 id="guide-care-heading" className={heading}>Caring for your shades</h2>
          <DocText blocks={parseDocText(careGuide.body)} />
        </section>
      ) : null}

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
                    <span className={heading}>{file.docType ? storedDocTypeLabel(file.docType) : "Document"}</span>
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
