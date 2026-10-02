# Google lead form → PSS, and the Google Ads tag

**Date:** 2026-10-02 · **Status:** approved by the owner (city from ZIP lookup)

## Why

The Search campaign now has a Google lead form asset ("Free In-Home Consultation": Full name, Phone, ZIP). Its leads stay inside Google Ads, and this account offers no email alert, so a lead can sit unseen. Separately, the site loads only the GA4 tag; Data Manager flags the Google Ads tag `AW-18438614507` as URGENT because it never fires.

## Part A: webhook endpoint

`POST /api/ads/lead-form` receives Google's lead form webhook and turns each lead into a normal PSS lead with the usual notification email.

**Google's payload** (JSON, documented by Google Ads "lead form webhook"): `lead_id`, `user_column_data` (array of `{ column_id, column_name, string_value }`, e.g. `FULL_NAME`, `FIRST_NAME`, `LAST_NAME`, `PHONE_NUMBER`, `POSTAL_CODE`, `EMAIL`), `api_version`, `form_id`, `campaign_id`, `adgroup_id`, `creative_id`, `gcl_id`, `google_key`, `is_test`. Unknown fields are ignored.

**Behaviour**
1. Off unless env `ADS_LEADFORM_KEY` is set and at least 16 characters: otherwise respond 404 (same switch as the conversions feed, `ADS_FEED_*`).
2. `google_key` must equal `ADS_LEADFORM_KEY` (constant-time compare). Wrong or missing key → 403, nothing stored.
3. Body that isn't JSON or doesn't match the schema → 400, nothing stored.
4. `is_test: true` → 200, nothing stored, nothing emailed (Google's "Send test data" button).
5. Otherwise build the lead:
   - name: `FULL_NAME`, else `FIRST_NAME` + `LAST_NAME`, else "Google lead".
   - phone: digits only; an 11-digit number starting with 1 drops the 1. Stored as-is even if not 10 digits (never lose a lead); the note says so.
   - email: `EMAIL` if present, else null (the column is nullable since migration 002).
   - address: the ZIP (`POSTAL_CODE`), else null.
   - city: from the ZIP via the lookup below; an unknown or missing ZIP uses "Las Vegas" and the note says "ZIP not in the service-area list".
   - source: `google_form`. heard_via: "Google lead form".
   - gclid: `gcl_id`. utm_source `google`, utm_medium `cpc`. ad_clicked_at: now.
   - google_lead_id: `lead_id`.
   - notes: "Google lead form (form <form_id>, campaign <campaign_id>)" plus any notes above.
   - assigned_to: the Settings default, as for website leads.
6. One insert statement with `on conflict (google_lead_id) where google_lead_id is not null do nothing returning id` (the `where` must repeat the partial unique index predicate, or Postgres cannot infer the index). No row returned → it is a resend: respond 200, send no email.
7. New lead → send the same owner notification email as website leads, and geocode it after the response (as the consultation route does). No customer confirmation email (there may be no email address, and the Google form shows its own thank-you).
8. Never-lose rule, same as the consultation route: if the insert fails but the email goes out, respond 200; if both fail, respond 500 so Google retries.

**ZIP → city** (`lib/leads/zip-city.ts`), the service area's ZIPs:
- Henderson: 89002, 89011, 89012, 89014, 89015, 89044, 89052, 89074
- North Las Vegas: 89030, 89031, 89032, 89081, 89084, 89085, 89086
- Summerlin: 89134, 89135, 89138, 89144, 89145
- Las Vegas: every other ZIP from 89101 to 89199
- Anything else → null (caller uses "Las Vegas" and notes it).

**Migration 039** (`db/migrations/039_google_lead_id.sql`): `leads.google_lead_id text` plus a unique index on it where not null. Additive only.

**Conversion feed:** a `google_form` lead gets no "Consultation request" row (Google already counts the form submit as its own lead form conversion, so uploading it would double count). Its "Appointment booked" and "Sale" rows are still sent from its gclid.

**Admin display:** wherever a lead's source is shown, `google_form` reads "Google lead form".

## Part B: Google Ads tag

On tracked (public) pages only, alongside GA4, configure `AW-18438614507` (`gtag('config', 'AW-18438614507')`) so Google sees the Ads tag. Untracked paths (`/admin`, `/project`) stay untouched, as today.

The conversions themselves are set up in Google Ads by the owner (no code): import GA4 `phone_click` as a primary conversion and `generate_lead` as secondary.

## Owner steps after deploy
1. Set `ADS_LEADFORM_KEY` in Vercel production (a generated key saved to a file in the owner's Documents; never printed in chat).
2. In the lead form: Export leads → Other data integration options → Webhook: URL `https://premiershadesolutions.com/api/ads/lead-form`, the key. Click "Send test data" (expects success, stores nothing).

## Testing
- Unit (vitest): ZIP lookup; payload parsing (full name, first+last, missing fields, phone normalising); the route (no env → 404, wrong key → 403, bad body → 400, test → 200 with no insert, new → insert + email, resend → no email, insert fails + email ok → 200, both fail → 500); the feed skipping the Consultation row for `google_form`.
- Real SQL: migration 039 and the insert statement run on a Neon test branch, twice (idempotent), including the conflict path.
- Each new test is checked to fail when the thing it guards is removed.
