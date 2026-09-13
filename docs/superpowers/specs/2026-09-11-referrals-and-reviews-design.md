# Referrals and Review Requests (Client Portal, Step 2) — Design

**Date:** 2026-09-11
**Status:** Approved in conversation, pending spec review
**Scope:** Step 2 of the four-step client portal roadmap in the year-one business plan: a personal referral link for every customer, tracking of who referred whom and the $100 reward, and an automatic review request the day after installation. Builds on the job tracker (`2026-09-10-job-tracker-design.md`).

## 1. Purpose

Referrals and Google reviews are our cheapest lead sources. This step turns every installed job into one email that asks for both, and gives the owners a record of every referral and whether its reward has been paid.

Success means: every installed job with an email address gets exactly one review request the next morning without an owner lifting a finger; a friend who opens a referral link and books arrives in the tracker already linked to the customer who sent them; and the owners can see at a glance which rewards are owed.

## 2. Approach

Built inside the existing Next.js site on the same Neon database, Resend account, and Vercel project, as with step 1. The daily send runs as a Vercel Cron job calling a route handler.

Rejected:
- **Send when a job is marked Installed.** Simpler, but the plan calls for the day after, and owners sometimes mark a stage by mistake and move it back.
- **Resend scheduled sends.** Avoids a cron job, but a scheduled email must be cancelled whenever a job changes, which couples every stage change to Resend.
- **Text messages.** Higher open rates, but a new provider, per-message cost, and carrier registration. Email only for now.

## 3. Referral links

**Codes.** Each job may have one `referral_code`: 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O, 1/I), generated with a cryptographic random source. A code is created the first time it is needed (when the review request is built, or when an owner presses "Get referral link" on a job page) and never changes. A unique index guarantees no two jobs share one; on a collision, generation retries.

**The link.** `https://<domain>/r/<CODE>`, built from the production domain in `content/business.ts`.

**Opening a link** (`app/(site)/r/[code]/route.ts`, a route handler):
- The code is matched case-insensitively.
- If it matches a job, the handler sets a `pss_ref` cookie (the code; `httpOnly`, `sameSite=lax`, `secure`, 30 days) and redirects to `/contact?ref=friend&r=<CODE>&by=<First name>`.
- If it matches nothing, it redirects to `/contact` with no cookie. No error is shown.

**The consultation form.**
- The contact page is statically rendered, so the form reads the query string on mount, the same way it already reads `?ref=flyer`. With `ref=friend`, "How did you hear about us?" is preselected to "Referral from a friend", and with `by`, a short note reads "<First name> sent you." Only the referrer's first name is shown.
- The code travels in a hidden `referralCode` field. The API route also reads the `pss_ref` cookie, so a friend who books from the homepage hero form is still attributed. The body field wins over the cookie.
- The API resolves the code to the referring job's id and stores it in `referred_by`. An unknown code is ignored; the lead is still saved. A lead never refers itself.

## 4. Review requests

**The email** (plain text, like the existing emails, sent through Resend from `LEAD_FROM_EMAIL` with replies going to `business.email`):
- Thanks the customer by first name for the installation.
- A "Leave us a Google review" line with `GOOGLE_REVIEW_URL`.
- Their referral link, and the offer: $100 for each friend who books an installation, paid once that installation is done.
- Subject: `Thank you from Premier Shade Solutions, <First name>`.

**Who gets it.** The daily run selects jobs where all of the following hold:
- `status = 'installed'`
- `email` is present
- `review_requested_at` is null
- `review_opt_out` is false
- the install date is before today and no more than 14 days ago, where the install date is `install_on`, or the Las Vegas calendar date of `stage_changed_at` when `install_on` is empty, and "today" is the current date in `America/Los_Angeles`

The 14-day window stops the first run after launch from emailing every past customer.

**The daily run.**
- `app/api/cron/review-requests/route.ts`, a GET handler.
- It rejects any request whose `Authorization` header is not `Bearer <CRON_SECRET>`.
- Scheduled in `vercel.json` at `0 17 * * *` (UTC). `vercel.json` rather than `vercel.ts`, so one line of config does not add the `@vercel/config` dependency. That is 10 a.m. Las Vegas time in summer and 9 a.m. in winter.
- For each selected job, the handler claims the job first by setting `review_requested_at = now()` where it is still null, then sends. Two overlapping runs can never both send. If the send fails, it clears `review_requested_at` so the next run retries, and logs the error.
- Each send writes a `job_events` row: `kind = 'email'`, actor `system`, body `Review request sent`.
- It returns a JSON count of sent and failed emails.

**On the job page** (shown for jobs at Sold or later):
- **Review request:** the send date, or "Not sent".
  - A "Don't send a review request" checkbox (`review_opt_out`).
  - A "Send now" button, which ignores the date window but respects the opt-out and the missing-email check. The owner can use it to resend.
- **Referral link:** "Get referral link" creates the code if needed and shows the link with a copy button.

## 5. Referral tracking and rewards

**On the referred job's page:** "Referred by <name>", linking to the referrer's job.

**On the referrer's job page:** a Referrals list, one row per referred job: name, stage, and reward status:
- **Pending**: the referred job is not installed yet
- **$100 owed**: the referred job is installed and `referral_paid_at` is null, shown with a "Mark paid" button
- **Paid <date>**: `referral_paid_at` is set

A referred job marked Lost shows **No reward**.

**Mark paid** sets `referral_paid_at` on the referred job. It writes a `job_events` row on the referrer's job: `kind = 'reward'`, the owner as actor, and body `Referral reward paid for <name>`. The action is guarded by `requireAdmin()`. It refuses unless the referred job is installed and unpaid. How the reward is paid (cash, Venmo, gift card) is not recorded.

**On the board:** a "Referral" badge on the cards of referred jobs.

The reward amount ($100) is a constant in `lib/referrals/codes.ts`, not stored per job.

## 6. Data

Migration `004_referrals_reviews.sql`, safe to re-run like `002`:

**`leads`, altered**
- `referral_code text`, with a unique index where not null
- `referred_by uuid references leads (id) on delete set null`, with an index
- `referral_paid_at timestamptz`
- `review_requested_at timestamptz`
- `review_opt_out boolean not null default false`

**`job_events`**: widen the `kind` check to `('stage','note','edit','email','reward','measure','file')`.

## 7. Code layout

- `lib/referrals/codes.ts`: code alphabet, generation, normalization, and the reward constant. Pure, unit-tested.
- `lib/referrals/db.ts`: server-only. Ensure a job has a code, resolve a code to a job, list a job's referrals with reward status, and mark a reward paid (with its event).
- `lib/reviews/eligibility.ts`: the pure eligibility rule (which jobs are due on a given date), unit-tested apart from the database.
- `lib/reviews/db.ts`: server-only. Lists candidates; claims and releases a send; records a sent request; sets the opt-out; stamps and restores `review_requested_at` for a manual send.
- `lib/reviews/send.ts`: server-only. Build and send the review email, claim and release, write the event.
- `app/(site)/r/[code]/route.ts`: the referral link handler.
- `app/api/cron/review-requests/route.ts`: the daily run.
- `app/api/consultation/route.ts` and `lib/leads/*`: accept and store `referralCode`.
- `app/admin/jobs/[id]/…`: Review request, Referral link, Referred by, and Referrals sections, plus their Server Actions, each calling `requireAdmin()` first.
- `vercel.json`: the cron schedule.

## 8. Settings

- `GOOGLE_REVIEW_URL`: the "write a review" link from the Google Business Profile. If it is missing, the daily run sends nothing and logs an error, and "Send now" shows an error, so a review email is never sent without its main link.
- `CRON_SECRET`: a random string. Vercel sends it on cron requests automatically once it is set.

## 9. Errors

- **Unknown or malformed referral code:** redirect to `/contact` and save the lead unattributed.
- **Resend failure during the daily run:** the claim is released, the error is logged, and the next day's run retries while the job is still inside the 14-day window.
- **"Send now" failure:** an inline error on the job page, and the claim is released.
- **Cron request without the right secret:** 401. Nothing is read or sent.
- **Mark paid on a job that is not installed, or is already paid:** an inline error. Nothing changes.

## 10. Testing

- **Unit (Vitest):**
  - code generation: length, alphabet, no look-alike characters
  - normalization (case, whitespace)
  - the eligibility rule: date window, the Las Vegas date boundary, fallback to `stage_changed_at`, opt-out, missing email, already sent
  - reward status (pending, owed, paid, no reward)
  - the review email text contains the review URL and the referral link
- **Route tests:**
  - the cron route rejects a missing or wrong secret
  - the consultation route stores `referred_by` from the body field and from the cookie, and ignores an unknown code
  - leads without a code still insert with `status = 'new'`
- **Access:** the new Server Actions reject requests with no session, an expired session, or a removed email, as in step 1.
- **E2E (Playwright, against a Neon branch):** open `/r/<code>` for a seeded installed job, submit the consultation form, confirm the new job shows "Referred by" and appears in the referrer's Referrals list, move it to Installed, mark the reward paid, and see the event in the activity log.
- All existing tests continue to pass.

## 11. Out of scope

Customer logins and any customer-facing referral dashboard (step 4); text messages; photos; online payment; automatic reward payouts; a general promo or campaign code field (the `/r/` route is written so one could reuse it later); follow-up reminder emails; tracking whether a review was actually posted.
