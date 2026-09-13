"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { business } from "@/content/business";
import { categories } from "@/content/products";
import { WINDOW_COUNTS } from "@/lib/leads/schema";
import { HEARD_VIA_OPTIONS, referralLabel } from "@/lib/leads/referral";
import { useConsultationForm } from "./useConsultationForm";
import {
  FormMessage,
  Honeypot,
  Label,
  SelectField,
  TextAreaField,
  TextField,
} from "./Field";

export function ConsultationForm() {
  const { state, error, submit } = useConsultationForm("contact");
  const [heardVia, setHeardVia] = useState("");
  const [referral, setReferral] = useState<{ code: string; by: string | null } | null>(null);

  // A printed QR code carries ?ref=flyer, which prefills this select so the
  // lead arrives attributed. A /r/<code> link additionally carries r= and by=,
  // identifying the friend who sent them. Read on mount rather than via
  // useSearchParams: this page is statically rendered, and useSearchParams
  // would opt it out.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const label = referralLabel(params.get("ref"));
    if (label) setHeardVia(label);
    const code = params.get("r");
    if (code) setReferral({ code: code.slice(0, 20), by: params.get("by")?.slice(0, 40) || null });
  }, []);

  return (
    <form onSubmit={submit} noValidate className="relative flex flex-col gap-6">
      <Honeypot />

      {referral ? (
        <>
          <input type="hidden" name="referralCode" value={referral.code} />
          {referral.by ? (
            <p className="border-l-2 border-champagne pl-4 text-sm text-ink-soft">{referral.by} sent you.</p>
          ) : null}
        </>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <TextField id="c-name" name="name" label="Name" autoComplete="name" required />
        <TextField
          id="c-phone"
          name="phone"
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
        />
      </div>

      <TextField
        id="c-email"
        name="email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <TextField
          id="c-address"
          name="address"
          label="Street address"
          autoComplete="street-address"
        />
        <SelectField
          id="c-city"
          name="city"
          label="City"
          options={business.serviceArea}
          defaultValue={business.serviceArea[0]}
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-display text-xs font-medium uppercase tracking-[0.16em] text-ink-soft">
          What are you interested in?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {categories.map((category) => (
            <label
              key={category.slug}
              htmlFor={`c-treat-${category.slug}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 border border-rule px-4 py-2 text-sm text-charcoal transition-colors hover:border-champagne-ink"
            >
              <input
                id={`c-treat-${category.slug}`}
                type="checkbox"
                name="treatments"
                value={category.name}
                className="size-4 accent-[var(--color-champagne-ink)]"
              />
              {category.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="c-windows">Approximate number of windows</Label>
          <select
            id="c-windows"
            name="windowCount"
            defaultValue=""
            className="min-h-11 w-full border border-rule bg-ivory px-4 py-3 text-charcoal focus:border-champagne-ink focus:outline-none"
          >
            <option value="">Not sure yet</option>
            {WINDOW_COUNTS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="c-heard">How did you hear about us?</Label>
          <select
            id="c-heard"
            name="heardVia"
            value={heardVia}
            onChange={(event) => setHeardVia(event.target.value)}
            className="min-h-11 w-full border border-rule bg-ivory px-4 py-3 text-charcoal focus:border-champagne-ink focus:outline-none"
          >
            <option value="">Select one</option>
            {HEARD_VIA_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <TextAreaField
        id="c-notes"
        name="notes"
        label="Anything else we should know?"
        rows={5}
        placeholder="Which rooms, which direction the windows face, whether glare or heat is the main problem…"
      />

      <FormMessage
        state={state}
        error={error}
        phone={business.phone}
        successTitle="Request received"
        successBody="We will reach out shortly to schedule your in-home consultation. If it is urgent, give us a call."
      />

      {state !== "success" ? (
        <Button type="submit" disabled={state === "submitting"} className="w-full sm:w-auto">
          {state === "submitting" ? "Sending…" : "Request Free Consultation"}
        </Button>
      ) : null}
    </form>
  );
}
