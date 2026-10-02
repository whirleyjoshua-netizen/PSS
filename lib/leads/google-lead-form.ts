import { z } from "zod";
import type { ServiceCity } from "@/content/business";
import { cityForZip } from "./zip-city";

/** Google sends its numeric ids (form, campaign, ...) as JSON numbers; accept either. */
const id = z.union([z.string(), z.number()]);

/**
 * Google Ads lead form webhook body. Unknown fields are allowed (passthrough),
 * so a new field from Google never turns a lead away.
 */
export const googleLeadPayloadSchema = z
  .object({
    lead_id: z.string().trim().min(1),
    user_column_data: z
      .array(
        z
          .object({
            column_id: z.string().optional(),
            column_name: z.string().optional(),
            string_value: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    api_version: z.string().optional(),
    form_id: id.optional(),
    campaign_id: id.optional(),
    adgroup_id: id.optional(),
    creative_id: id.optional(),
    gcl_id: z.string().optional(),
    google_key: z.string().optional(),
    is_test: z.boolean().optional(),
  })
  .passthrough();

export type GoogleLeadPayload = z.infer<typeof googleLeadPayloadSchema>;

export type GoogleLead = {
  googleLeadId: string;
  name: string;
  phone: string;
  email: string | null;
  zip: string | null;
  city: ServiceCity;
  gclid: string | null;
  notes: string;
  isTest: boolean;
  key: string | undefined;
};

export const ZIP_NOT_IN_AREA_NOTE = "ZIP not in the service-area list";

/** Turns a webhook body into a PSS lead. Never drops a lead for a missing field. */
export function parseGoogleLead(
  payload: unknown,
): { ok: true; lead: GoogleLead } | { ok: false; error: string } {
  const parsed = googleLeadPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") };
  }
  const p = parsed.data;

  const columns = new Map<string, string>();
  for (const c of p.user_column_data ?? []) {
    const key = (c.column_id ?? c.column_name ?? "").trim().toUpperCase();
    const value = (c.string_value ?? "").trim();
    if (key && value && !columns.has(key)) columns.set(key, value);
  }
  const column = (key: string): string | null => columns.get(key) ?? null;

  const extra: string[] = [];

  const first = column("FIRST_NAME");
  const last = column("LAST_NAME");
  const name = column("FULL_NAME") ?? ([first, last].filter(Boolean).join(" ") || "Google lead");

  const rawPhone = column("PHONE_NUMBER") ?? "";
  const digits = rawPhone.replace(/\D/g, "");
  const phone = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (phone.length !== 10) {
    extra.push(`Phone isn't 10 digits as received from Google: "${rawPhone}".`);
  }

  const zip = column("POSTAL_CODE");
  const zipCity = cityForZip(zip);
  if (!zipCity) extra.push(`${ZIP_NOT_IN_AREA_NOTE}${zip ? ` (${zip})` : " (no ZIP given)"}; city set to Las Vegas.`);

  const header = `Google lead form (form ${p.form_id ?? "?"}, campaign ${p.campaign_id ?? "?"})`;

  return {
    ok: true,
    lead: {
      googleLeadId: p.lead_id,
      name,
      phone,
      email: column("EMAIL"),
      zip,
      city: zipCity ?? "Las Vegas",
      gclid: p.gcl_id?.trim() || null,
      notes: [header, ...extra].join("\n"),
      isTest: p.is_test === true,
      key: p.google_key,
    },
  };
}
