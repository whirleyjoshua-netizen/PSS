# Google lead form webhook + Ads tag: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google lead form submissions become PSS leads with the usual email alert, and public pages load the Google Ads tag.

**Architecture:** A new route `app/api/ads/lead-form/route.ts` validates Google's webhook, maps it with pure helpers (`lib/leads/zip-city.ts`, `lib/leads/google-lead-form.ts`), and stores it with one idempotent insert (`lib/leads/google-lead-db.ts`, keyed by migration 039's `google_lead_id`). The conversion feed skips the Consultation row for these leads. `SiteAnalytics` adds the AW config on tracked pages.

**Tech Stack:** Next.js route handlers (read `node_modules/next/dist/docs/` for route handler and `next/script` conventions before writing code — this Next version has breaking changes), zod, Neon serverless SQL via `db()` from `@/lib/db`, vitest (run with `npx vitest run --maxWorkers=2 <paths>`).

**Spec:** `docs/superpowers/specs/2026-10-02-google-lead-webhook-design.md` — the source of truth for behaviour, values and ZIP lists.

## Global Constraints

- Endpoint: `POST /api/ads/lead-form`. Off (404) unless `ADS_LEADFORM_KEY` is set and ≥ 16 characters. Wrong/missing `google_key` → 403. Bad body → 400. `is_test: true` → 200, no insert, no email.
- Stored source: `google_form`; heard_via "Google lead form"; utm_source `google`, utm_medium `cpc`; admin shows "Google lead form".
- Migration number: **039**, file `db/migrations/039_google_lead_id.sql`, additive only.
- One SQL statement per write (`insert … on conflict (google_lead_id) do nothing returning id`); never separate `db()` calls for one write.
- Never lose a lead: insert fails + email sent → 200; both fail → 500.
- No customer confirmation email for Google leads.
- Ads tag id: `AW-18438614507`, public (tracked) pages only.
- Never print secrets. Commits authored as whirleyjoshua@gmail.com (already configured). Never push; never run migrations against production.

---

### Task 1: Pure helpers — ZIP → city and Google payload parsing

**Files:**
- Create: `lib/leads/zip-city.ts`, `lib/leads/google-lead-form.ts`
- Test: `tests/leads/zip-city.test.ts`, `tests/leads/google-lead-form.test.ts`

**Interfaces (produces):**
- `cityForZip(zip: string | null | undefined): ServiceCity | null` — `ServiceCity` from `@/content/business`. ZIP lists exactly as in the spec; input trimmed, first 5 digits used.
- `googleLeadPayloadSchema` (zod) for the payload fields in the spec; unknown fields allowed; `user_column_data` items `{ column_id?: string, column_name?: string, string_value?: string }`.
- `type GoogleLead = { googleLeadId: string; name: string; phone: string; email: string | null; zip: string | null; city: ServiceCity; gclid: string | null; notes: string; isTest: boolean; key: string | undefined }`
- `parseGoogleLead(payload: unknown): { ok: true; lead: GoogleLead } | { ok: false; error: string }` implementing spec Part A step 5 (name, phone, email, zip, city fallback "Las Vegas" + note, notes text).

- [ ] Step 1: Write failing tests: each service city's ZIPs, an 89101–89199 Las Vegas ZIP, an out-of-area ZIP (null), "89052-1234" → Henderson, blank → null; payload with FULL_NAME; FIRST_NAME+LAST_NAME; no name → "Google lead"; phone "+1 (702) 555-0123" → "7025550123"; short phone kept and noted; missing ZIP → Las Vegas + note; is_test passthrough; non-object → error.
- [ ] Step 2: Run them; expect failures (modules missing).
- [ ] Step 3: Implement.
- [ ] Step 4: Run; expect pass. Then delete one guarded line (e.g. the Henderson list) and confirm a test goes red; restore.
- [ ] Step 5: Commit `feat: helpers that map a Google lead form payload to a PSS lead, city from ZIP`.

### Task 2: Migration 039, idempotent insert, and the route

**Files:**
- Create: `db/migrations/039_google_lead_id.sql`, `lib/leads/google-lead-db.ts`, `app/api/ads/lead-form/route.ts`
- Test: `tests/api/lead-form.test.ts` (follow the mocking style of existing tests under `tests/api/` for `@/lib/db` and email)

**Interfaces:**
- Consumes: `parseGoogleLead`, `GoogleLead` (Task 1); `sendLeadNotification` from `@/lib/leads/email` (read its signature; pass what it needs, with email possibly null — adapt the call, not the email module's contract, unless it truly requires a non-null email, in which case make the email module accept null and say so in the report); `geocodeLead` from `@/lib/routes/geocode`; `after` from `next/server`.
- Produces: `insertGoogleLead(lead: GoogleLead & { id: string }): Promise<{ id: string } | null>` — null means duplicate `google_lead_id`. Assigns `assigned_to` from `lead_settings` in the same statement, exactly as `lib/leads/db.ts` does.

- [ ] Step 1: Write the migration: `alter table leads add column if not exists google_lead_id text;` and `create unique index if not exists leads_google_lead_id_key on leads (google_lead_id) where google_lead_id is not null;` with a header comment in the style of 038.
- [ ] Step 2: Write failing route tests for every case in the spec's Testing section (route list).
- [ ] Step 3: Implement `insertGoogleLead` (one statement with `on conflict (google_lead_id) where google_lead_id is not null do nothing returning id`) and the route (constant-time key compare via `crypto.timingSafeEqual` on equal-length buffers).
- [ ] Step 4: Run tests; pass. Guard check: remove the is_test branch → a test goes red; restore.
- [ ] Step 5: Commit `feat: /api/ads/lead-form turns Google lead form submissions into PSS leads (migration 039)`.

### Task 3: Conversion feed, admin label, Ads tag

**Files:**
- Modify: `lib/leads/conversions-feed.ts` (select `l.source`), `lib/leads/conversions.ts` (a `skipLead` or `source` field on `ConversionRow`; no Consultation row for `google_form`), every admin place that renders a lead's source (grep `source` in `app/admin`, `lib/leads/email.ts`) so `google_form` reads "Google lead form", `components/analytics/SiteAnalytics.tsx` (AW config on tracked pages).
- Test: extend existing tests for conversions and SiteAnalytics (find them under `tests/`).

- [ ] Step 1: Failing tests: CSV for a `google_form` row has Appointment/Sale rows but no Consultation row; a website row still has all three; SiteAnalytics on a public path renders the AW config, on `/admin` does not.
- [ ] Step 2: Implement. For the tag, keep GA4 as is and add the AW config after it (e.g. `next/script` inline `gtag('config','AW-18438614507')` that reuses the `dataLayer`/`gtag` GA4 set up). Check the Next docs for `next/script` strategy.
- [ ] Step 3: Run the full related tests; pass. Guard check on the skip.
- [ ] Step 4: Commit `feat: Google lead form leads skip the Consultation upload; admin labels them; public pages load the Ads tag`.

### Task 4: Real SQL verification

**Files:** Create `scripts/verify-google-lead.ts` + `scripts/verify-google-lead.config.mts` following `scripts/verify-resources.ts` and its config.

- [ ] Step 1: Script applies 039 (via the same path `scripts/migrate.mjs` uses) on a **Neon test branch** connection from `VERIFY_DATABASE_URL` (refuse to run if the host matches the production endpoint `ep-cold-term`), runs `insertGoogleLead` twice with the same `google_lead_id` (first returns an id, second null), runs the migration a second time (idempotent), and cleans up its row.
- [ ] Step 2: Run it if a test-branch URL is available; otherwise report BLOCKED-ON-OWNER with the exact command. Never print the URL.
- [ ] Step 3: Commit `test: verify-google-lead proves migration 039 and the idempotent insert on a real branch`.

### After the tasks (controller + owner)
- Full `npx vitest run --maxWorkers=2`, `npx tsc --noEmit`, `next build`.
- Owner: apply 039 to production, push to main, set `ADS_LEADFORM_KEY`, paste URL + key into the lead form, send test data.
