"use client";

import { Button } from "@/components/ui/Button";
import { business, type ServiceCity } from "@/content/business";
import type { LeadSource } from "@/lib/leads/schema";
import { useConsultationForm } from "./useConsultationForm";
import { FormMessage, Honeypot, TextField } from "./Field";

/**
 * Three fields, no scrolling. Detail is collected on the phone call — every
 * extra field here costs conversions, and we already have enough to call back.
 *
 * Used by the homepage hero and by the booking block on product, category,
 * city and reviews pages. `idPrefix` keeps field ids unique if two ever share
 * a page; `city` is the page's city so a Henderson lead is not filed as Las Vegas.
 * `treatment` is the page's category name (the value the /contact checkbox
 * sends), so a booking from /shutters/plantation-shutters arrives as "Shutters".
 * `introOnPhone={false}` hides the intro under the heading below sm, where TreatmentHero needs
 * the room to keep Invite Us Over above a 390×844 fold.
 * `notes` rides along as the lead's notes (the holiday page names its offer there).
 */
export function HeroForm({
  className,
  idPrefix = "hero",
  source = "hero",
  city = business.serviceArea[0],
  treatment,
  introOnPhone = true,
  notes,
}: {
  className?: string;
  idPrefix?: string;
  source?: LeadSource;
  city?: ServiceCity;
  treatment?: string;
  introOnPhone?: boolean;
  notes?: string;
}) {
  const { state, error, submit } = useConsultationForm(source);

  return (
    <div className={`bg-ivory p-6 shadow-xl sm:p-8 ${className ?? ""}`}>
      <h2 className="font-display text-xl font-light tracking-tight text-charcoal">
        Free in-home consultation
      </h2>
      <p className={`mt-2 text-sm text-ink-soft ${introOnPhone ? "" : "hidden sm:block"}`}>
        We bring the samples, measure every window and send you a written quote. No
        charge, no obligation.
      </p>

      <form onSubmit={submit} noValidate className="relative mt-6 flex flex-col gap-4">
        <Honeypot />
        <input type="hidden" name="city" value={city} readOnly />
        {treatment ? <input type="hidden" name="treatments" value={treatment} readOnly /> : null}
        {notes ? <input type="hidden" name="notes" value={notes} readOnly /> : null}

        <TextField id={`${idPrefix}-name`} name="name" label="Name" autoComplete="name" required />
        <TextField
          id={`${idPrefix}-phone`}
          name="phone"
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
        />
        <TextField
          id={`${idPrefix}-email`}
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
        />

        <FormMessage
          state={state}
          error={error}
          phone={business.phone}
          successTitle="Request received"
          successBody="We will reach out shortly to schedule your in-home consultation."
        />

        {state !== "success" ? (
          <Button type="submit" disabled={state === "submitting"} className="w-full">
            {state === "submitting" ? "Sending…" : "Invite Us Over"}
          </Button>
        ) : null}
      </form>
    </div>
  );
}
