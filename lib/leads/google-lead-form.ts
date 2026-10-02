import { z } from "zod";
import type { ServiceCity } from "@/content/business";
import { cityForZip } from "./zip-city";

/** Google sends its numeric ids (form, campaign, ...) as JSON numbers; accept either. */
const id = z.union([z.string(), z.number()]);

/**
 * Google Ads lead form webhook body. Unknown fields are allowed (loose object),
 * so a new field from Google never turns a lead away, and every optional field
 * accepts null, so a null from Google never rejects a real lead either.
 */
export const googleLeadPayloadSchema = z.looseObject({
  lead_id: z.string().trim().min(1),
  user_column_data: z
    .array(
      z.looseObject({
        column_id: z.string().nullish(),
        column_name: z.string().nullish(),
        string_value: z.string().nullish(),
      }),
    )
    .nullish(),
  api_version: z.string().nullish(),
  form_id: id.nullish(),
  campaign_id: id.nullish(),
  adgroup_id: id.nullish(),
  creative_id: id.nullish(),
  gcl_id: z.string().nullish(),
  google_key: z.string().nullish(),
  is_test: z.boolean().nullish(),
});

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
    // column_name is a label such as "Full Name"; normalise it to the FULL_NAME form.
    const key = (c.column_id || c.column_name || "").trim().toUpperCase().replace(/\s+/g, "_");
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
    },
  };
}
