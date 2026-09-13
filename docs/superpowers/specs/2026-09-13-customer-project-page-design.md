# Customer Project Page (Client Portal, Step 3) — Design

**Date:** 2026-09-13
**Status:** Approved in conversation, pending spec review
**Scope:** Step 3 of the four-step client portal roadmap in the year-one business plan: a signed-in page where a customer follows their own job's progress, sees the photos the owners choose to share, and gets their referral link. Builds on the job tracker (`2026-09-10-job-tracker-design.md`), referrals and reviews (`2026-09-11-referrals-and-reviews-design.md`) and job files (`2026-09-11-measure-and-files-design.md`), all live on production.

## 1. Purpose

Customers call to ask "where is my order?" and never see the photos the owners take at install. This step gives every customer from the quote onward one page that answers that question and shows those photos. It also keeps their referral link in front of them.

Success means:
- A customer whose job reaches Quoted gets an email and can sign in from it without calling us.
- The page shows where their job is in words they understand, and the install date once it is set.
- A photo appears on the page only after an owner switches it on, and disappears the moment it is switched off.
- No customer can ever see another customer's job, any money figure, or anything in `/admin`.

## 2. Decisions made in conversation

- **Access by email sign-in link**, like the admin. No passwords and no private-link-only access.
- **Contents:** progress tracker, shared photos, referral link, contact. **No money of any kind**, because the owner does not want customers reminded of what they paid every time they check on their project.
- **Photos are shared one at a time** with a "Share with customer" switch, off by default.
- **Invite after the consultation:** the first time a job reaches Quoted or any later stage.
- **Approach:** a separate customer area with its own sign-in tables, sessions and cookie (option 1 of 3).

## 3. Approach

Built inside the existing Next.js site on the same Neon database, Resend account, Vercel Blob store and Vercel project.

Customer pages live under `/project`. Customer sign-in uses its own tables (`customer_login_tokens`, `customer_sessions`) and its own cookie (`pss_customer`), and reuses only `newToken`/`hashToken` from `lib/admin/tokens.ts`. New code lives in `lib/portal/`. Nothing under `/admin` reads the customer cookie, and nothing under `/project` reads the admin cookie.

Rejected:
- **One sign-in for owners and customers with a role flag.** Less code, but a single missed check lets a customer into the admin.
- **A sealed stateless cookie instead of database sessions.** No way to cut off access before the cookie expires.

## 4. Who can sign in

A **customer email** is the lowercased, trimmed `email` of a job. A job is **visible** to that email when all of these hold:
- its stage is `quoted`, `sold`, `ordered` or `installed` (not `new`, `contacted`, `visit_booked` or `lost`);
- its email, lowercased and trimmed, equals the session's email.

One query, `visibleJobs(email)` in `lib/portal/access.ts`, decides this. Every customer page, the photo route and sign-in itself call it. There is no second definition.

An email with no visible job cannot sign in. The request still shows the same "check your email" screen (§6).

## 5. Invite email

**When it is sent:**
- **Automatically:** when an owner moves a job to Quoted, Sold, Ordered or Installed, the job has an email, and `portal_invited_at` is null. It is sent in `after()` from the `moveStage` action, so a slow or failed email never blocks the stage change. It is also sent from the stage picker ("Set stage") path when that path sets one of those stages.
- **By hand:** a "Send portal invite" button on the job page (shown when the job is visible under §4 and has an email; labelled "Resend portal invite" once `portal_invited_at` is set). This covers lost emails and jobs that were already past Quoted when this ships. They are not invited automatically.
- A job with no email shows "Add an email to invite this customer to their project page" instead of the button.

**Claim before sending:** `portal_invited_at` is stamped with a conditional update (`where portal_invited_at is null`) before the automatic send, so two quick stage changes send one email. If Resend fails, the stamp is restored so the button offers a retry. The hand-sent path always sends and updates the stamp.

**The email** (plain text, from `LEAD_FROM_EMAIL`, replies to `business.email`):

```
Subject: Your Premier Shade Solutions project page

Hi <First name>,

Thanks for having us out. You can follow your project, from quote to install, on your own page:

<sign-in link>

This link works for 7 days. After that, sign in any time at <domain>/project with this email address.

Questions? Call us at <phone> or just reply to this email.

<business name>
```

The sign-in link in the invite is a normal customer sign-in token with a **7-day** expiry (customers don't open email right away). Links requested from the sign-in page expire in **15 minutes**, like the admin.

**Activity:** each invite adds a `kind = 'email'` event to the job: "Portal invite sent to <email>". No change to the `job_events_kind_check` constraint.

## 6. Customer sign-in

Pages:
- `/project/sign-in`: email field and "Email me a sign-in link". After submit, always "Check your email for a sign-in link" whatever the email.
- `/project/auth?token=…`: shows a "Sign in" button. Only pressing it uses the token (email link scanners open links without pressing buttons).

Rules, mirroring `lib/admin/login.ts`:
- `requestCustomerSignIn(email)` returns immediately and does all work in `after()`: check `visibleJobs(email)` is non-empty, rate-limit to **5 links per email per hour**, store only the token's SHA-256 hash, send the email. Every error is caught and logged. None of it can change the response.
- `consumeCustomerSignIn(token)` marks the token used in one conditional update (unused and unexpired) and returns its email, or null. It then re-checks `visibleJobs`; an email with no visible job gets no session.
- A session row lasts **30 days**. The `pss_customer` cookie is `httpOnly`, `secure` in production, `sameSite=lax`, `path=/project`.
- `getCustomer()` (cached per request) looks up the session and returns `{ email }` only if the email still has a visible job. `requireCustomer()` redirects to `/project/sign-in` otherwise. It is called by every customer page, action and route; `proxy.ts` may redirect early as a courtesy but is never relied on.
- "Sign out" deletes the session row and the cookie.
- Old rows are cleaned up opportunistically, as in the admin: tokens a day past expiry and expired sessions are deleted on the next request that creates one.

The sign-in link's origin comes from `ADMIN_BASE_URL` (falling back to `business.domain`), never the request's Host header.

## 7. The project page

`/project`: if the email has one visible job, show it. If more than one, list them by address and link each to `/project/<jobId>`. `/project/<jobId>` checks the job is in `visibleJobs(email)`; otherwise it shows the same "not found" page as a missing job.

Sections, top to bottom:

**Header.** Logo, "Hi <First name>", the job's address and city (when present), "Sign out".

**Progress.** Four steps, using customer wording from one map in `lib/portal/progress.ts`:

| Stage | Step shown | Extra line |
|---|---|---|
| quoted | Quote ready | "We've put together your quote." |
| sold | Order confirmed | — |
| ordered | In production | "Install scheduled: Tue, Oct 14" when `install_on` is set |
| installed | Installed | "Installed Tue, Oct 14" when `install_on` is set |

Steps before the current one are shown done, the current one is highlighted, later ones are shown upcoming. The map is the only place these words live, and it has a test.

**Photos.** Only this job's files with `kind = 'photo'` and `shared_at` set, newest first, in a grid. Tapping one opens it full size. Empty state: "Photos from your install will appear here."

**Refer a friend.** "Know someone who needs new blinds? Share your link. When they buy, you get $100." The link comes from `ensureReferralCode(jobId)` and `referralUrl(code)` (creating the code if needed), with a "Copy link" button. Below it: "Friends referred so far: N", where N is the number of jobs whose `referred_by` is this job. No reward status and no amounts beyond the $100 offer.

**Contact.** Tap-to-call and email links from `content/business.ts`.

**Not shown anywhere:** quote, sold, deposit or balance amounts; measurements; notes; the activity log; documents; brands; lost reason; anything editable.

**Lost jobs and removed access:** the job is no longer visible, so the customer is sent to sign-in. If they had only that job, sign-in shows the usual message and they get no link.

## 8. Sharing photos (owner side)

- **Add photo.** Today the only photos on a job come from the measuring screen; "Upload file" stores images as documents. `JobFiles` gains an "Add photo" button (any image, resized on the phone to a 2000 px JPEG like measuring photos, stored as `kind = 'photo'`) and a "Photos" list of the job's photos that are not attached to a measured window. This is how install and before/after photos get onto a job. (Added while planning: without it, the page could only ever show measuring photos.)
- `JobFiles` (used on the job page and in the board's client panel) gets a "Share with customer" switch on each photo, both in the Photos list and on measured windows that have one. Documents have no switch.
- Server action `setFileShared(jobId, fileId, shared)` sets or clears `job_files.shared_at`, only when the file belongs to that job and is a photo, and adds a `kind = 'file'` event: "Shared photo <name> with customer" / "Stopped sharing photo <name>".
- A shared photo shows a small "Shared" label in the owner's list.
- Deleting a file removes it from the customer page as well (the row is gone).

## 9. Customer photo route

`GET /project/files/<fileId>`:
1. `requireCustomer()`.
2. Load the file; confirm `kind = 'photo'`, `shared_at` is set, and its job is in `visibleJobs(email)`.
3. Anything else, including a missing file: 404, the same response for every case.
4. Stream it with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` and `Content-Disposition: inline` via the existing `contentDisposition` helper.

It reuses `readFile` from `lib/admin/files.ts`. The admin route `/admin/files/<id>` is unchanged and still admin-only.

## 10. Data changes

One new migration, `db/migrations/005_customer_portal.sql`:
- `alter table job_files add column if not exists shared_at timestamptz` (null = not shared).
- `alter table leads add column if not exists portal_invited_at timestamptz`.
- `create table if not exists customer_login_tokens (token_hash text primary key, email text not null, created_at timestamptz not null default now(), expires_at timestamptz not null, used_at timestamptz)` plus an index on `(email, created_at)`.
- `create table if not exists customer_sessions (token_hash text primary key, email text not null, created_at timestamptz not null default now(), expires_at timestamptz not null)`.
- An index on `lower(trim(email))` for leads, for `visibleJobs`.

No change to `job_events_kind_check`. Like the other migrations, every statement is safe to re-run.

## 11. Error handling

- Invite send fails: logged, the stamp is restored, and the job page offers "Send portal invite" again. The stage change itself always succeeds.
- Sign-in email fails: logged; the customer sees the usual message and can ask again.
- Blob read fails for a shared photo: the route returns 404; the page itself still loads.
- A used or expired link: "This link expired or was already used" with a button back to `/project/sign-in`.

## 12. Testing

Unit and route tests (Vitest), all using mocked `db`/Resend/Blob as the existing tests do:
- `visibleJobs`: each stage in and out, lost, email case and whitespace, and a different customer's email.
- Sign-in: no visible job sends nothing; rate limit; token hashing; single use; expiry; the 7-day invite token vs 15-minute page token; the response never differs.
- `getCustomer`: expired session, deleted session, and a job going Lost after sign-in.
- Photo route: shared photo 200; unshared, document, another customer's job, lost job, no session, missing file all 404.
- Progress map: every stage's wording and the install-date lines.
- Invite: automatic on first move into each qualifying stage, not on a later move, not without an email, restored stamp on failure, hand-sent resend.
- `setFileShared`: wrong job, document, and the activity event.
- Pages render with no amounts: the project page's output contains no `$` figure other than the $100 offer.

End-to-end (Playwright, Neon test branch only, skipped without `E2E_POSTGRES_URL`): an owner shares a photo on a Quoted job; the customer signs in with a token inserted by the test; sees "Quote ready", the photo and the referral link; the owner switches the photo off and it is gone on reload. The photo part is skipped unless `E2E_BLOB_READ_WRITE_TOKEN` is set.

## 13. Out of scope

Customer passwords or accounts beyond email sign-in (step 4); money, invoices or online payment; customer uploads, messages or comments; text messages; editing contact details; documents on the customer page; notifications when a photo is shared or a stage changes (only the one invite email); showing referral reward status; a "coming soon" preview of step 4.
