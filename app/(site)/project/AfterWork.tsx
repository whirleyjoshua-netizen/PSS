import { business } from "@/content/business";
import type { ProjectSummary } from "@/lib/portal/access";

/**
 * What a customer can do once their treatments are up.
 *
 * It renders only for a finished job: `toPortalStage` folds `completed` into `installed`,
 * so `installed` is the only status a finished job can reach this component with, and
 * keying on it covers both. Before that the section stays away entirely — a review asked
 * for while the work is still in production would be asking about nothing.
 *
 * The review link deliberately ignores `review_opt_out`. That flag suppresses the
 * automated review *email*; a customer who asked us not to email them has not asked to be
 * stopped from leaving a review of their own accord, on a page they opened themselves.
 *
 * The actions sit in their own wrapping row, so the review link and the service link wrap
 * rather than overflow on a narrow phone.
 *
 * The service link is offered on the same terms as the review link, and for the same reason:
 * before the work is installed there is nothing to come back out to. The line beneath it is
 * the only trace of a request the customer sees here — the service job itself is a job on the
 * owners' board, and does not reach the portal until it is quoted like any other.
 */
export function AfterWork({
  project,
  serviceRequests = [],
  justRequested,
}: {
  project: ProjectSummary;
  /** Every service they have asked for, newest first, each date already formatted as "Sep 16". */
  serviceRequests?: { on: string; projectNo: string | null }[];
  /**
   * The project number of a request just filed, for the confirmation. Null the rest of the time.
   * It comes off the query string unvalidated, so it is only believed when it matches one of
   * `serviceRequests` — see the guard below.
   */
  justRequested?: string | null;
}) {
  if (project.status !== "installed") return null;

  // `justRequested` arrives from the query string, so it is the customer's browser talking, not
  // ours. A crafted /project/<id>?requested=PSS-9999 would otherwise confirm a request that does
  // not exist and hand them a reference number that reaches nothing when they phone it in. The
  // requests we just loaded are the only truth about what they have asked for, so the
  // confirmation renders only when the URL names one of them. Anything else renders nothing:
  // there is no true thing to say about a request that was never filed, and an error would be
  // louder than the nudge deserves — a customer who simply mistyped a link is not in trouble.
  const confirmed =
    justRequested && serviceRequests.some((request) => request.projectNo === justRequested)
      ? justRequested
      : null;

  return (
    <section className="flex flex-col gap-3 border border-rule bg-sand/50 p-6" aria-labelledby="after-work-heading">
      <h2 id="after-work-heading" className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">
        After the work is done
      </h2>
      <p>Happy with the work? A review helps two people running a small business more than you would think.</p>
      <div className="flex flex-wrap gap-3">
        <a
          href={business.socials.googleBusinessProfile}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-11 border border-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-charcoal hover:bg-charcoal hover:text-ivory"
        >
          Leave a review
        </a>
        <a
          href={`/project/${project.id}/service`}
          className="min-h-11 border border-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-charcoal hover:bg-charcoal hover:text-ivory"
        >
          Request a service
        </a>
      </div>
      {confirmed ? (
        <p role="status" className="border border-champagne bg-sand/60 p-4 text-sm">
          Thanks — we have your request and will be in touch. Quote {confirmed} when you call
          us about it.
        </p>
      ) : null}
      {serviceRequests.map((request) => (
        <p key={`${request.on}-${request.projectNo ?? ""}`} className="text-sm text-ink-soft">
          Service requested on {request.on}
          {request.projectNo ? ` (${request.projectNo})` : ""} — we will be in touch.
        </p>
      ))}
    </section>
  );
}
