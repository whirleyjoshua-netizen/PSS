import { Reveal } from "@/components/ui/Reveal";

export const FAMILY_LINE =
  "Shade’ and Josh personally handle every step of your project, from design and measurements to ordering and installation. No call centers. No subcontractors. Just personalized, streamlined service from start to finish.";

/** The badges under the photo: what the consultation is, in three words or fewer each. */
export const PROMISES = ["Free consultation", "Family-run", "No obligation"];

/** Joins class names, skipping empty ones, so the uncentred row renders the same class strings BookingBlock always had. */
const classes = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/** The three promise badges on their own, for the homepage hero form card. */
export function PromiseBadges({ centered = false, className }: { centered?: boolean; className?: string }) {
  return (
    <ul aria-label="What you get" className={classes("flex flex-wrap gap-2", centered && "justify-center", className)}>
      {PROMISES.map((promise) => (
        <li
          key={promise}
          className="inline-flex items-center gap-2 border border-champagne/70 bg-ivory/70 px-3 py-1.5 font-display text-xs font-medium uppercase tracking-[0.14em] text-charcoal"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 fill-none stroke-champagne-ink stroke-[2.5]">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          {promise}
        </li>
      ))}
    </ul>
  );
}

/**
 * The three promise badges and a line under them, shared by BookingBlock and TreatmentHero's pages.
 * The line is the family line unless the page has its own: product and city pages pass their
 * `opening`, so they no longer all open with the same paragraph (SEO audit 2026-10-13).
 */
export function PromiseRow({
  className,
  centered = false,
  line = FAMILY_LINE,
}: {
  className?: string;
  centered?: boolean;
  line?: string;
}) {
  return (
    <Reveal className={classes("flex flex-col gap-5", centered && "items-center", className)}>
      <PromiseBadges centered={centered} />
      <p className={classes("text-lg leading-relaxed text-charcoal", centered && "max-w-3xl text-center")}>{line}</p>
    </Reveal>
  );
}
