# Job Tracker (Client Portal, Step 1) — Design

**Date:** 2026-09-10
**Status:** Approved in conversation, pending spec review
**Scope:** The owner-side job tracker at `/admin`. Step 1 of the four-step client portal roadmap in the year-one business plan. Nothing in this step is visible to customers.

## 1. Purpose

Give the owners one place to see every lead and move each job from first contact to installation. Every later portal step (referral links, review requests, the customer project page, the full portal) reads from the data this step creates.

Success means: every website lead appears on the board without re-typing, a job can be advanced from a phone in the field in two taps, and every stage change is recorded with who made it and when.

## 2. Approach

Built inside the existing Next.js site as an `/admin` area, on the same Neon database, Resend account, and Vercel project. The existing `leads` table becomes the jobs table; its `status` column was left unconstrained in `001_leads.sql` for exactly this.

Rejected: a separate admin app (two codebases and deploys for two users), and an off-the-shelf CRM (monthly cost, and the customer portal would not be ours to shape).

## 3. Sign-in and access

**Flow.** `/admin/sign-in` takes an email address. If it is on the allowlist, a one-time sign-in link is emailed through Resend. The link expires after 15 minutes and works once. Following it opens a short confirm page with a "Sign in" button; pressing the button uses the token, creates a session, and lands on `/admin`. Opening the link alone uses nothing, because email security scanners open links automatically and would otherwise spend a single-use token before the owner taps it.

**Link origin.** The sign-in link is built from `ADMIN_BASE_URL` (default: the production domain from `content/business.ts`), never from the request's `Host` header, so a forged request cannot make the site email an owner a link to another domain.

**Allowlist.** The `ADMIN_EMAILS` environment variable, comma-separated, compared case-insensitively after trimming. Initial value: `whirleyjoshua@gmail.com`. A non-allowlisted address sees the same "check your email" confirmation and no email is sent, so the form never reveals who has access.

**Tokens.** Sign-in tokens and session tokens are 32 random bytes, base64url-encoded. The database stores only a SHA-256 hash of each, so a database leak does not yield usable tokens.

**Sessions.** Stored in an `admin_sessions` table and referenced by an `httpOnly`, `secure`, `sameSite=lax` cookie named `pss_admin`, lasting 30 days. Signing out deletes the row and the cookie. Deleting a row revokes that device.

**Enforcement.** Authorization lives in one server-only data access module (`lib/admin/session.ts`, `import "server-only"`). Every admin page and every Server Action calls `requireAdmin()`, which looks up the session by token hash, checks that it has not expired, and that the email is still on the allowlist. Removing an address from `ADMIN_EMAILS` locks it out on its next request. `proxy.ts` performs only an optimistic check (cookie present, otherwise redirect to sign-in) and is never the sole guard.

**Rate limiting.** At most 5 sign-in emails per address per hour, counted from `admin_login_tokens`.

**Indexing.** `/admin` is disallowed in `robots.ts`, and admin pages send `noindex`.

## 4. The tracker

### Stages

`new` → `contacted` → `visit_booked` → `quoted` → `sold` → `ordered` → `installed`, plus `lost`, reachable from any stage. Display labels: New lead, Contacted, Visit booked, Quoted, Sold, Ordered, Installed, Lost.

Stages are defined once in `lib/admin/stages.ts` (value, label, order) and enforced in the database by a check constraint. Existing leads keep `status = 'new'` and so appear as New lead.

### The board — `/admin`

- Desktop: one column per stage, New lead through Installed. Lost is hidden behind a "Show lost" toggle.
- Phone (below 768px): the same jobs as a list grouped by stage.
- Each card: name, city, treatments, and days in the current stage.
- A count per stage along the top.
- A "New job" button.

### The job page — `/admin/jobs/[id]`

- **Contact:** name, phone (tap to call), email (tap to email), address (tap to open in maps), and everything submitted on the website form.
- **Stage:** a primary button that advances to the next stage ("Move to Visit booked"), a menu to set any stage, and "Mark lost", which asks for a short reason.
- **Details**, all optional and editable at any stage: visit date and time, quote amount, sold amount, deposit received, brands on the job (Superior Blinds MFG, Alta Window Fashions, Hunter Douglas; multi-select), order date, install date.
- **Activity log:** newest first. Stage changes are logged automatically with the actor's email and time. Owners can add free-text notes.

### Adding a job by hand — `/admin/jobs/new`

For phone, referral, and walk-in leads. Name and phone required; email optional; city from the service area list. `source` records how the lead arrived: `phone`, `referral`, `walk-in`, or `other`.

## 5. Data

Migration `002_job_tracker.sql`:

**`leads`, altered**
- `status`: add a check constraint for the eight stage values.
- `email`: drop `not null`, since hand-entered jobs may not have one.
- `source`: unchanged type. Website rows keep `hero` and `contact`; hand-entered rows use the values above.
- New columns: `stage_changed_at timestamptz not null default now()`, `visit_at timestamptz`, `quote_cents integer`, `sold_cents integer`, `deposit_cents integer`, `brands text[] not null default '{}'`, `ordered_on date`, `install_on date`, `lost_reason text`, `updated_at timestamptz not null default now()`.
- Dollar amounts are stored as whole cents in integers and entered as dollars.

**`job_events`**: `id uuid pk`, `lead_id uuid not null references leads on delete cascade`, `created_at timestamptz not null default now()`, `actor text not null` (an email), `kind text not null check (kind in ('stage','note','edit'))`, `from_status text`, `to_status text`, `body text`. Index on `(lead_id, created_at desc)`.

**`admin_login_tokens`**: `token_hash text pk`, `email text not null`, `created_at timestamptz not null default now()`, `expires_at timestamptz not null`, `used_at timestamptz`. Index on `(email, created_at desc)` for rate limiting.

**`admin_sessions`**: `token_hash text pk`, `email text not null`, `created_at timestamptz not null default now()`, `expires_at timestamptz not null`.

Expired tokens and sessions are removed opportunistically on sign-in. No scheduled job is needed.

## 6. Code layout

- `lib/admin/stages.ts`: stage list, labels, `nextStage()`.
- `lib/admin/session.ts`: server-only; `requireAdmin()`, `createSession()`, `destroySession()`.
- `lib/admin/login.ts`: server-only; token issue and verify, allowlist, rate limit, sign-in email.
- `lib/admin/jobs.ts`: server-only; queries and mutations for jobs and events. Every mutation writes its `job_events` row in the same statement batch.
- `lib/admin/schema.ts`: zod schemas for the forms.
- `app/admin/…`: pages and Server Actions, each calling `requireAdmin()` first.
- `proxy.ts`: optimistic cookie check for `/admin/:path*`, excluding `/admin/sign-in`.

Admin pages reuse the site's design tokens and form components (`components/forms/Field.tsx`, `components/ui/Button.tsx`).

## 7. Errors

- Expired, used, or unknown sign-in link: the sign-in page with "That link has expired or was already used. Request a new one."
- Sign-in email fails to send: the error is logged only. The page shows the same "check your email" confirmation as always, because any visible difference would reveal which addresses have access (§3). The allowlist check, rate limit, token, and email all run after the response, via `after()` from `next/server`, so every address gets the same answer at the same speed. An owner whose email never arrives requests another link.
- A Server Action with no valid session: redirect to sign-in. No data is returned.
- Validation errors appear inline, using the same messages as the zod schemas.
- A job id that does not exist: the admin not-found page.

## 8. Testing

- **Unit (Vitest):** stage order and `nextStage()`; token hashing; allowlist parsing; rate limit; the zod form schemas; the cents conversion.
- **Access:** every Server Action and admin page rejects a request with no session, with an expired session, and with a session whose email has been removed from the allowlist.
- **E2E (Playwright):** sign-in by inserting a login token directly into the test database and opening its link (no test-only code path exists in the app), the board rendering jobs by stage, advancing a job, adding a note, and creating a job by hand. Tests run against a Neon branch, never the production database.
- The existing tests continue to pass, including the consultation route, which must keep inserting leads with `status = 'new'`.

## 9. Out of scope

Anything customer-facing; customer emails; referral links; review requests; photos; payments; drag-and-drop; roles or permissions beyond the allowlist; editing or deleting website-submitted form fields.
