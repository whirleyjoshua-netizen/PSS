"use client";

import { Button } from "@/components/ui/Button";
import { business } from "@/content/business";
import { useConsultationForm } from "./useConsultationForm";
import { FormMessage, Honeypot, TextField } from "./Field";

/**
 * Three fields, no scrolling. Detail is collected on the phone call — every
 * extra field here costs conversions, and we already have enough to call back.
 */
export function HeroForm({ className }: { className?: string }) {
  const { state, error, submit } = useConsultationForm("hero");

  return (
    <div className={`bg-ivory p-6 shadow-xl sm:p-8 ${className ?? ""}`}>
      <h2 className="font-display text-xl font-light tracking-tight text-charcoal">
        Book a free in-home consultation
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        We measure, show you samples in your own light, and quote on the spot. No
        charge, no obligation.
      </p>

      <form onSubmit={submit} noValidate className="relative mt-6 flex flex-col gap-4">
        <Honeypot />
        <input type="hidden" name="city" value={business.serviceArea[0]} readOnly />

        <TextField id="hero-name" name="name" label="Name" autoComplete="name" required />
        <TextField
          id="hero-phone"
          name="phone"
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
        />
        <TextField
          id="hero-email"
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
            {state === "submitting" ? "Sending…" : "Request Consultation"}
          </Button>
        ) : null}
      </form>
    </div>
  );
}
