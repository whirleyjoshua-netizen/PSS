import { z } from "zod";
import { leadCities } from "@/content/business";
import { attributionSchema } from "./attribution";

const cities: readonly string[] = leadCities;

export const WINDOW_COUNTS = ["1-5", "6-10", "11-20", "20+"] as const;

/** Every public form that creates a lead. The lead email and the admin show which one. */
export const LEAD_SOURCES = ["hero", "contact", "booking", "holiday"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** A lead that came through a Google Ads lead form (app/api/ads/lead-form), not a site form. */
export const GOOGLE_FORM_SOURCE = "google_form";

/**
 * A name-and-email sign-up from the offer pop-up (app/api/offer): not a consultation request yet, so it has no phone
 * or city (stored empty) and is never counted as a lead conversion.
 */
export const OFFER_SOURCE = "offer";

/** How the admin and the lead email name where a lead came in: the stored code, except Google's form and the pop-up. */
export function leadSourceLabel(source: string): string {
  if (source === GOOGLE_FORM_SOURCE) return "Google lead form";
  if (source === OFFER_SOURCE) return "Offer pop-up";
  return source;
}

/**
 * Shared by the client forms and the route handler, so a payload that passes
 * in the browser passes on the server. Validation lives in exactly one place.
 */
export const consultationSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),

  phone: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    // A US number pasted with its country code arrives as 11 digits.
    .transform((digits) => (digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits))
    .refine((digits) => digits.length === 10, "Please enter a 10-digit phone number."),

  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),

  city: z
    .string()
    .refine((value) => cities.includes(value), "We serve the Las Vegas valley, Pahrump and Mesquite."),

  address: z.string().trim().max(200).optional(),
  treatments: z.array(z.string().max(40)).max(6).optional(),
  windowCount: z.enum(WINDOW_COUNTS).optional(),
  heardVia: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),

  /**
   * A customer's referral code, from a /r/<code> link. Resolved on the
   * server; an overlong or malformed value never fails the whole lead.
   */
  referralCode: z.string().trim().max(20).optional().catch(undefined),

  source: z.enum(LEAD_SOURCES),

  /**
   * The consultation time the visitor picked in the home form's pop-up, as an ISO instant. The
   * server books it only if it is still open; a malformed value is dropped, never fails the lead.
   */
  slot: z.iso.datetime().optional().catch(undefined),

  /** The ad click that brought the visitor, if any. Malformed never fails the lead. */
  attribution: attributionSchema.optional().catch(undefined),

  /**
   * Honeypot. The field is rendered offscreen and hidden from assistive
   * technology, so a human never fills it. Anything non-empty is a bot.
   */
  company: z.string().max(0, "Rejected").optional(),
}).superRefine((value, ctx) => {
  // A booked visit needs somewhere to go.
  if (value.slot && !value.address) {
    ctx.addIssue({ code: "custom", path: ["address"], message: "Please enter the street address for your visit." });
  }
});

export type ConsultationInput = z.infer<typeof consultationSchema>;

/** The offer pop-up's sign-up: a name and an email, so we can send the offer and follow up. */
export const offerSignupSchema = z.object({
  name: consultationSchema.shape.name,
  email: consultationSchema.shape.email,
  attribution: attributionSchema.optional().catch(undefined),
  company: z.string().max(0, "Rejected").optional(),
});

export type OfferSignupInput = z.infer<typeof offerSignupSchema>;

/** Ten stored digits into a display-formatted number for the notification email. */
export const formatPhone = (digits: string): string =>
  digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : digits;
