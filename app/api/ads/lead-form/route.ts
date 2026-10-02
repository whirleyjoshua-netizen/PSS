import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { parseGoogleLead } from "@/lib/leads/google-lead-form";
import { GOOGLE_FORM_HEARD_VIA, GOOGLE_FORM_SOURCE, insertGoogleLead } from "@/lib/leads/google-lead-db";
import { sendLeadNotification } from "@/lib/leads/email";
import { geocodeLead } from "@/lib/routes/geocode";

/**
 * Google Ads lead form webhook (docs/superpowers/specs/2026-10-02-google-lead-webhook-design.md, Part A).
 * Each lead becomes a normal PSS lead with the usual owner notification email.
 *
 * Off unless ADS_LEADFORM_KEY is set to at least 16 characters: until then it
 * answers 404, as if the route did not exist. Google sends the key in the body
 * as google_key; a wrong or missing one is 403. Nothing here logs the key.
 *
 * Never lose a lead, as app/api/consultation/route.ts: a failed insert whose
 * email got out is still 200. Only when both fail is it 500, so Google retries.
 * A resend of a lead already stored is 200 with no second email.
 * No customer confirmation: there may be no email address, and Google's form
 * shows its own thank-you.
 */

const MIN_LENGTH = 16;

/** Hashing first gives equal-length buffers, so the comparison leaks neither content nor length. */
const sameSecret = (given: string, expected: string) =>
  timingSafeEqual(
    createHash("sha256").update(given).digest(),
    createHash("sha256").update(expected).digest(),
  );

const empty = (status: number) => new Response(null, { status });

export async function POST(request: Request) {
  const expected = process.env.ADS_LEADFORM_KEY ?? "";
  if (expected.length < MIN_LENGTH) return empty(404);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return empty(400);
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return empty(400);

  // The key is checked before the schema, so a caller without it learns nothing about the body Google sends.
  const given = (payload as { google_key?: unknown }).google_key;
  if (typeof given !== "string" || !sameSecret(given, expected)) return empty(403);

  const parsed = parseGoogleLead(payload);
  if (!parsed.ok) {
    console.error("Google lead form webhook body rejected", parsed.error);
    return empty(400);
  }
  const lead = parsed.lead;

  // Google's "Send test data" button: acknowledge, store and email nothing.
  if (lead.isTest) return Response.json({ ok: true });

  const id = randomUUID();
  let storedId: string | null = null;
  let storeFailed = false;
  try {
    const stored = await insertGoogleLead({ ...lead, id });
    // No row back: Google resent a lead already stored, and it was emailed then.
    if (!stored) return Response.json({ ok: true });
    storedId = stored.id;
  } catch (error) {
    storeFailed = true;
    console.error("Google lead database write failed", error);
  }

  let emailed = true;
  try {
    await sendLeadNotification(
      {
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        city: lead.city,
        address: lead.zip ?? undefined,
        heardVia: GOOGLE_FORM_HEARD_VIA,
        notes: lead.notes,
        source: GOOGLE_FORM_SOURCE,
        attribution: {
          gclid: lead.gclid ?? undefined,
          utmSource: "google",
          utmMedium: "cpc",
          clickedAt: new Date().toISOString(),
        },
      },
      id,
    );
  } catch (error) {
    emailed = false;
    console.error("Google lead notification email failed", error);
  }

  // Coordinates for the route planner. Never blocks or fails the response.
  if (storedId) {
    const geocodeId = storedId;
    after(() => geocodeLead(geocodeId));
  }

  if (storeFailed && !emailed) {
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true });
}
