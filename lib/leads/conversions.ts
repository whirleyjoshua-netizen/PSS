import { GOOGLE_FORM_SOURCE } from "./schema";

/**
 * Google Ads offline conversion import: ties what happened to a lead after the
 * form (booked, sold) back to the ad click that produced it. Uploaded under
 * Goals → Conversions → Uploads, it lets the campaign bid toward searches that
 * turn into customers rather than toward clicks.
 *
 * The conversion names must match conversion actions created in Google Ads
 * with source "Import → Manual upload", spelled exactly as below.
 */
export const CONVERSIONS = {
  lead: "Consultation request",
  booked: "Appointment booked",
  sale: "Sale",
} as const;

export type ConversionRow = {
  gclid: string;
  /** The lead's stored source. A Google lead form lead's submit is already Google's own conversion. */
  source?: string;
  createdAt: Date;
  bookedAt: Date | null;
  soldAt: Date | null;
  soldCents: number | null;
};

const HEADER = "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency";

/** Google's accepted form: 2026-09-14 13:05:00+00:00. */
export const conversionTime = (at: Date) => `${at.toISOString().slice(0, 19).replace("T", " ")}+00:00`;

/** A gclid is URL-safe base64, but quoting keeps a hand-edited value from breaking the row. */
const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function conversionsCsv(rows: ConversionRow[]): string {
  const lines = [HEADER];
  for (const row of rows) {
    const add = (name: string, at: Date, value = "") =>
      lines.push([cell(row.gclid), name, conversionTime(at), value, value ? "USD" : ""].join(","));
    // Google counts a lead form submit as that form's conversion; uploading it again would double count.
    if (row.source !== GOOGLE_FORM_SOURCE) add(CONVERSIONS.lead, row.createdAt);
    if (row.bookedAt) add(CONVERSIONS.booked, row.bookedAt);
    // A sale with no amount entered still counts; Google then uses the action's default value.
    if (row.soldAt) add(CONVERSIONS.sale, row.soldAt, row.soldCents ? (row.soldCents / 100).toFixed(2) : "");
  }
  return lines.join("\n") + "\n";
}
