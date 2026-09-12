import { z } from "zod";
import { consultationSchema } from "@/lib/leads/schema";
import { MAX_EIGHTHS, REQUIREMENTS, toEighths, type Requirement } from "./measure-units";
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

const inches = z.preprocess(blank, z.coerce.number().int("Whole inches only").min(0).max(600).optional());
const eighth = z.coerce.number().int().min(0).max(7).default(0);
const requirementValues = REQUIREMENTS.map((r) => r.value) as [Requirement, ...Requirement[]];
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Unknown photo");

const dimension = (label: string, required: boolean) =>
  z.object({ in: inches, eighth }).transform((value, ctx) => {
    if (value.in === undefined && value.eighth === 0) {
      if (required) ctx.addIssue({ code: "custom", message: `Enter the ${label}` });
      return null;
    }
    const total = toEighths(value.in ?? 0, value.eighth);
    if (total <= 0) {
      ctx.addIssue({ code: "custom", message: `Enter the ${label}` });
      return z.NEVER;
    }
    if (total > MAX_EIGHTHS) {
      ctx.addIssue({ code: "custom", message: `The ${label} must be 600 inches or less` });
      return z.NEVER;
    }
    return total;
  });

export const measurementSchema = z
  .object({
    room: z.string().trim().min(1, "Pick or type a room").max(60),
    label: z.preprocess(blank, z.string().trim().max(80).optional()),
    widthIn: z.unknown(), widthEighth: z.unknown(),
    heightIn: z.unknown(), heightEighth: z.unknown(),
    depthIn: z.unknown(), depthEighth: z.unknown(),
    mount: z.enum(["inside", "outside"], { message: "Choose inside or outside mount" }),
    requirements: z.array(z.enum(requirementValues)).default([]),
    notes: z.preprocess(blank, z.string().trim().max(1000).optional()),
    photoFileId: z.preprocess(blank, uuid.optional()),
  })
  .transform((value, ctx) => {
    const width = dimension("width", true).safeParse({ in: value.widthIn, eighth: value.widthEighth });
    const height = dimension("height", true).safeParse({ in: value.heightIn, eighth: value.heightEighth });
    const depth = dimension("depth", false).safeParse({ in: value.depthIn, eighth: value.depthEighth });
    for (const part of [width, height, depth]) {
      if (!part.success) {
        ctx.addIssue({ code: "custom", message: part.error.issues[0].message });
        return z.NEVER;
      }
    }
    return {
      room: value.room,
      label: value.label ?? null,
      widthEighths: width.data as number,
      heightEighths: height.data as number,
      depthEighths: depth.data ?? null,
      mount: value.mount,
      requirements: value.requirements,
      notes: value.notes ?? null,
      photoFileId: value.photoFileId ?? null,
    };
  });

export type MeasurementInput = z.output<typeof measurementSchema>;

export type DetailsInput = z.output<typeof detailsSchema>;
export type NewJobInput = z.output<typeof newJobSchema>;
