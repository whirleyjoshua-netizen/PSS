import { z } from "zod";
import { business } from "@/content/business";

const cities: readonly string[] = business.serviceArea;

export const WINDOW_COUNTS = ["1-5", "6-10", "11-20", "20+"] as const;

/**
 * Shared by the client forms and the route handler, so a payload that passes
 * in the browser passes on the server. Validation lives in exactly one place.
 */
export const consultationSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),

  phone: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    // A US number pasted with its country code arrives as 11 digits.
    .transform((digits) => (digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits))
    .refine((digits) => digits.length === 10, "Please enter a 10-digit phone number"),

  email: z.string().trim().toLowerCase().email("Please enter a valid email address"),

  city: z
    .string()
    .refine((value) => cities.includes(value), "We currently serve the Las Vegas valley"),

  address: z.string().trim().max(200).optional(),
  treatments: z.array(z.string().max(40)).max(6).optional(),
  windowCount: z.enum(WINDOW_COUNTS).optional(),
  heardVia: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),

  source: z.enum(["hero", "contact"]),

  /**
   * Honeypot. The field is rendered offscreen and hidden from assistive
   * technology, so a human never fills it. Anything non-empty is a bot.
   */
  company: z.string().max(0, "Rejected").optional(),
});

export type ConsultationInput = z.infer<typeof consultationSchema>;

/** Ten stored digits into a display-formatted number for the notification email. */
export const formatPhone = (digits: string): string =>
  digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : digits;
