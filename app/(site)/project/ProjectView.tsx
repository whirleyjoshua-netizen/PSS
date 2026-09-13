import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import { listSharedPhotos } from "@/lib/admin/files";
import { toProject } from "@/lib/portal/access";
import { progressSteps } from "@/lib/portal/progress";
import { countReferred } from "@/lib/portal/project";
import { ensureReferralCode } from "@/lib/referrals/db";
import { referralUrl } from "@/lib/referrals/codes";
import { signOutCustomer } from "./actions";
import { CopyLinkButton } from "./CopyLinkButton";

const heading = "font-display text-xs uppercase tracking-[0.2em] text-champagne-ink";

/**
 * The customer's view of one job. It renders only from toProject(), which has
 * no money, notes or contact fields, so nothing private can slip onto the page.
 */
export async function ProjectView({ job }: { job: Job }) {
  const project = toProject(job);
  const [photos, code, referred] = await Promise.all([
    listSharedPhotos(project.id),
    ensureReferralCode(project.id),
    countReferred(project.id),
  ]);
  const steps = progressSteps(project.status, project.installOn);
  const place = [project.address, project.city].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-light">Hi {project.firstName}</h1>
          <p className="text-ink-soft">{place}</p>
        </div>
        <form action={signOutCustomer}>
          <button type="submit" className="min-h-11 px-3 text-sm underline underline-offset-4">Sign out</button>
        </form>
      </header>

      <section className="flex flex-col gap-4" aria-labelledby="progress-heading">
        <h2 id="progress-heading" className={heading}>Your project</h2>
        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.stage} aria-current={step.state === "current" ? "step" : undefined}
              className={`flex gap-3 border-l-2 pl-4 ${step.state === "upcoming" ? "border-rule text-ink-soft" : "border-charcoal"}`}>
              <span aria-hidden="true" className="w-4 shrink-0">{step.state === "done" ? "✓" : step.state === "current" ? "●" : "○"}</span>
              <div className="flex flex-col">
                <span className={step.state === "current" ? "font-semibold" : undefined}>{step.label}</span>
                <span className="sr-only">{step.state === "done" ? "(done)" : step.state === "current" ? "(current step)" : "(coming up)"}</span>
                {step.detail ? <span className="text-sm text-ink-soft">{step.detail}</span> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="photos-heading">
        <h2 id="photos-heading" className={heading}>Photos</h2>
        {photos.length === 0 ? (
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
        )}
      </section>

      {code ? (
        <section className="flex flex-col gap-3" aria-labelledby="refer-heading">
          <h2 id="refer-heading" className={heading}>Refer a friend</h2>
          <p>Know someone who needs new blinds? Share your link. When they buy, you get $100.</p>
          <p className="break-all font-semibold">{referralUrl(code)}</p>
          <CopyLinkButton link={referralUrl(code)} />
          <p className="text-sm text-ink-soft">Friends referred so far: {referred}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby="contact-heading">
        <h2 id="contact-heading" className={heading}>Questions?</h2>
        <a href={business.phone.href} className="underline underline-offset-4">{business.phone.display}</a>
        <a href={`mailto:${business.email}`} className="underline underline-offset-4">{business.email}</a>
      </section>
    </div>
  );
}
