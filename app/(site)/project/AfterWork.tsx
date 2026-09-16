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
 * The actions sit in their own wrapping row so a second one can join the first without
 * reshaping the section — Task 5's "Request a service" link lands there.
 */
export function AfterWork({ project }: { project: ProjectSummary }) {
  if (project.status !== "installed") return null;

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
      </div>
    </section>
  );
}
