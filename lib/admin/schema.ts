import { z } from "zod";
import { consultationSchema } from "@/lib/leads/schema";
import { dollarsToCents } from "./money";
import { fromLocalInput } from "./time";

export const BRANDS = ["Superior Blinds MFG", "Alta Window Fashions", "Hunter Douglas"] as const;
export const HAND_SOURCES = ["phone", "referral", "walk-in", "other"] as const;

const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const cents = z
  .string()
  .optional()
  .transform((value, ctx) => {
    try {
      return dollarsToCents(value ?? "");
    } catch (error) {
      ctx.addIssue({ code: "custom", message: (error as Error).message });
      return z.NEVER;
    }
  });

const day = z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date").optional())
  .transform((value) => value ?? null);

export const detailsSchema = z
  .object({
    visitAt: z.preprocess(blank, z.string().optional()),
    quote: cents,
    sold: cents,
    deposit: cents,
    brands: z.array(z.enum(BRANDS)).default([]),
    orderedOn: day,
    installOn: day,
  })
  .transform(({ visitAt, quote, sold, deposit, ...rest }) => ({
    visitAt: visitAt ? fromLocalInput(visitAt) : null,
    quoteCents: quote,
    soldCents: sold,
    depositCents: deposit,
    ...rest,
  }));

export const noteSchema = z.object({ body: z.string().trim().min(1, "Write a note first").max(2000) });
export const lostSchema = z.object({ reason: z.string().trim().min(1, "Say why it was lost").max(200) });

// Reuses the website form's rules, so a hand-entered phone number is stored the same way.
const site = consultationSchema.shape;

export const newJobSchema = z.object({
  name: site.name,
  phone: site.phone,
  email: z.preprocess(blank, site.email.optional()),
  city: site.city,
  address: z.preprocess(blank, site.address),
  notes: z.preprocess(blank, site.notes),
  source: z.enum(HAND_SOURCES),
});

export type DetailsInput = z.output<typeof detailsSchema>;
export type NewJobInput = z.output<typeof newJobSchema>;
