import { z } from "zod";

/**
 * The service request form's shape. Client-safe on purpose: no `server-only`, no db import,
 * so the form component and the server action validate against the very same rules.
 *
 * The form is deliberately shallow — two required answers and two optional ones. The owners'
 * supplier portal asks for line numbers, part numbers and a resolution; a homeowner knows none
 * of it, and anything asked here that they cannot confidently answer costs a submission and
 * gains nothing. Do not add fields.
 */
export const ISSUES = [
  { value: "wont-move", label: "Will not go up or down" },
  { value: "crooked", label: "Crooked or uneven" },
  { value: "damaged", label: "Damaged or broken" },
  { value: "motor", label: "Remote or motor not working" },
  { value: "other", label: "Something else" },
] as const;

export type Issue = (typeof ISSUES)[number]["value"];

/** The customer's words for what is wrong, for the note and the owners' email. */
export const issueLabel = (value: string): string =>
  ISSUES.find((issue) => issue.value === value)?.label ?? value;

export const WINDOW_TEXT_MAX = 120;
export const DETAILS_MAX = 2000;

/** One image, at most 10 MB. The number is stated in the form's copy from this constant. */
export const PHOTO_MAX_MB = 10;
export const PHOTO_MAX_BYTES = PHOTO_MAX_MB * 1024 * 1024;

/**
 * A phone photo is still a photo when the browser cannot name its type.
 *
 * These customers are photographing a broken blind on a phone, and an iPhone's HEIC often
 * arrives with an empty or unrecognised MIME type depending on the browser. Rejecting it for
 * its container would turn a good photo into no photo, so the file name settles it when the
 * type does not.
 */
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?)$/i;

export const looksLikeImage = (name: string, type: string): boolean =>
  type.trim().toLowerCase().startsWith("image/") || (type.trim() === "" && IMAGE_EXTENSIONS.test(name));

export const serviceRequestSchema = z
  .object({
    windowId: z.string().optional(), // a measurement id, when picked from the list
    windowText: z.string().max(WINDOW_TEXT_MAX).optional(), // "somewhere else"
    issue: z.enum(ISSUES.map((i) => i.value) as [string, ...string[]], { error: "Tell us what is happening." }),
    details: z.string().max(DETAILS_MAX).optional(),
  })
  .refine((v) => v.windowId || v.windowText?.trim(), { error: "Tell us which window.", path: ["windowText"] });

export type ServiceRequestInput = z.output<typeof serviceRequestSchema>;
