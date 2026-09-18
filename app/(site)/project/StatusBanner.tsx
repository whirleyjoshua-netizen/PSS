import type { ReactNode } from "react";
import type { ProjectStep, StepKey } from "@/lib/portal/progress";

/**
 * One fixed sentence per step. These are the only words the banner and the Next step
 * block can say — no job_events body ever reaches the customer's page.
 */
export const STEP_BLURB: Record<StepKey, string> = {
  consultation: "We are coming out to look at your windows with you.",
  measurements: "We are measuring every window so your treatments fit exactly.",
  quote: "Your quote is ready for you to look over.",
  order: "Your order is confirmed. Thank you for choosing us.",
  production: "Your treatments are being made for you right now.",
  ready: "Your treatments are in, and your installation is being booked.",
  installed: "Your installation is complete. Enjoy your new windows.",
};

export const STEP_NEXT: Record<StepKey, string> = {
  consultation: "We will see you at your consultation.",
  measurements: "Once measuring is done we will put your quote together.",
  quote: "Look over your quote and call us with any questions.",
  order: "We place your order with the workroom next.",
  production: "We will call you to book your installation as soon as your order arrives.",
  ready: "We will confirm your installation date with you.",
  installed: "Nothing to do — call us any time if anything needs adjusting.",
};

/**
 * Where the project stands, with the actions the page offers on it: reviewing a shared
 * quote, and — when the caller decides the job is at that point — approving it. The banner
 * renders whatever is handed to `approve` and decides nothing about it itself.
 */
export function StatusBanner({
  step,
  quoteHref,
  approve,
}: {
  step: ProjectStep;
  quoteHref: string | null;
  /** The approve control, or null when there is nothing to approve. */
  approve?: ReactNode;
}) {
  return (
    <section aria-label="Where your project stands" className="border border-rule bg-sand/50 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-light text-charcoal">{step.label}</h2>
          <p className="text-ink-soft">{STEP_BLURB[step.key]}</p>
        </div>
        {quoteHref || approve ? (
          <div className="flex flex-wrap items-start gap-3">
            {quoteHref ? (
              <a
                href={quoteHref}
                className="inline-flex min-h-11 items-center border border-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-charcoal hover:bg-charcoal hover:text-ivory"
              >
                Review quote
              </a>
            ) : null}
            {approve}
          </div>
        ) : null}
      </div>
    </section>
  );
}
