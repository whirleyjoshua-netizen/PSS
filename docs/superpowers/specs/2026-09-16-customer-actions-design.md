# What a Customer Can Do From Their Project Page — Design

**Date:** 2026-09-16
**Status:** Approved in conversation, pending the owner's review of this spec.
**Scope:** The customer project page gains things a customer can *do*: send a message, request a service visit, and leave a review. Plus a fix to the multi-project list, which currently cannot tell two Las Vegas jobs apart.

**Deferred, specced later:** sharing a project to social media.
**Unbuilt from the previous spec:** "Approve quote" and "Acknowledge installation" (Phase 2 of the project page).

This builds on the customer project page, the job tracker, appointments, file sharing and the review-request cron, all of which are live.

## 1. Purpose

**The problem.** The project page tells a customer where their project stands, and then offers them nothing to do. A phone number and an email address are the only way to reach the owners, a repair request has no route at all, and a customer with several jobs sees a list of rows that may all read "Las Vegas".

**The fix.** Three actions, each appearing where it makes sense, and a list that names its projects properly.

**Success means:**
- A customer can send a message about their project without leaving the page, and the owners get it in email with the job it belongs to.
- A customer whose blinds break eighteen months later can tell the owners what is wrong, from which room, with a photo, and that becomes a job on the board.
- A customer who wants to leave a review can, without hunting for the email.
- A customer with three projects can tell them apart.

## 2. Decisions made in conversation

- **No sidebar.** The admin has one because the owners live in that app all day across many jobs. A customer opens this page a handful of times, on a phone, about one project. Actions sit where they are relevant instead: contact in the Contact block, service and review in an "after the work is done" section that appears only once the job is installed.
- **A service request creates a NEW job**, tagged as a service job and linked back to the original. A repair is its own visit, its own scheduling, possibly its own invoice — that is what a job is. If the board fills with callbacks, the answer is a board filter, not a different data model.
- **No messaging system.** A message emails both owners and is recorded on the job's timeline. There is no inbox to check: two people who already live in email do not need a second place to look.
- **Leave a review is a link** to the existing Google Business Profile in `content/business.ts`, the same destination the review-request email already uses.
- **Social sharing is deferred** — it is an image-generation problem, not a link, and it should not hold up the other three.

## 3. The security boundary

`lib/portal/access.ts`'s `toProject()` is a whitelist and `ProjectView` renders only from it. **Everything in this spec is a write path, which is new for the portal** — until now a customer could only read. Each write is constrained:

| Action | Constraint |
|---|---|
| Send a message | Only for a job in `visibleJobs()`. Body length-capped. Throttled. |
| Request a service | Only for a job in `visibleJobs()` that is installed or completed. |
| Upload a photo with a request | Size- and type-capped, stored private, attached only to the new job. |

Every action re-derives the caller's jobs from the session with `requireCustomer()` and refuses a `jobId` that is not among them — the same shape as the file route's ownership check. **A customer may never name a job id they do not own**, and a test asserts each action refuses a foreign id.

`ProjectSummary` gains **no new fields** for Phase A. Phase B adds `parentJobNo` (a display string) so a service job's page can say which project it came from.

## 4. Phase A — message, review, and the list

### 4.1 Send a message

In the Contact block, a `<form>` with a single textarea and a Send button.

- Server action `sendCustomerMessage(jobId, body)`: `requireCustomer()`, job-ownership check, then a `job_events` row of kind `message` with the customer's text as the body, and an email to `ADMIN_EMAILS` with the job's name, project number, and a link to the admin job page.
- **Limits:** 2000 characters, rejected above that with a clear message. One message per job per minute, enforced by checking the newest `message` event's `created_at` — a second send inside that window returns "We have your message — we will come back to you" rather than an error, so a double-click is not a failure.
- **The body is customer text and never reaches another customer.** It renders in the admin only. `toProject()` does not expose `job_events` bodies, and this does not change that.
- The customer sees their sent messages on their own page, newest first, under the Contact block — so they know it arrived. Their own text, their own job.

### 4.2 Leave a review

In the "after the work is done" section, shown when the job's portal status is installed:

> **Happy with the work?** A review helps two people running a small business more than you would think. — **Leave a review** → `content/business.ts` `googleBusinessProfile`

`review_opt_out` suppresses the *email*, not this link: a customer who opted out of being emailed has not asked to be prevented from reviewing. The link is `rel="noopener"` and opens in a new tab.

### 4.3 The project list

`app/(site)/project/page.tsx` currently renders `address, city` and falls back to "Your project", so two jobs in the same city are indistinguishable. Each row becomes:

> **PSS-1002** · 1724 Salem Ave, Las Vegas
> *Quote ready*

Project number, then address (city alone when there is no street), then the current step's label from `buildSteps`. The number alone distinguishes two otherwise identical rows.

## 5. Phase B — request a service

### 5.1 The form

At `/project/<jobId>/service`, reachable from the "after the work is done" section.

**The form is deliberately shallow.** The owners' supplier portal (CDI) asks for line numbers, part numbers, quantity, a resolution and "why it cannot be repaired" — that is a trade form for ordering against a purchase order, filled in by the installer *after* seeing the problem. A homeowner knows none of it. The customer's only job here is to get the owners' attention and tell them roughly what and where; the owners open the CDI case themselves once they have looked. Anything this form asks that the customer cannot confidently answer costs a submission and gains nothing.

| Field | Type | Required |
|---|---|---|
| Which window | picker of the windows measured on this job, plus "somewhere else" with a text box | yes |
| What is happening | select: will not go up or down / crooked or uneven / damaged or broken / remote or motor not working / something else | yes |
| Anything else we should know | textarea, 2000 chars | no |
| A photo | one image, ≤ 10 MB | no |

Two required fields and two optional ones. No dates, no counts, no part numbers, no severity scale.

**The picker comes from the job's own measurements.** `window_measurements` carries `room` (not null) and an optional `label` per window, and `lib/admin/measurements.ts` already has a `describe()` helper rendering them as `"Dining Room, left window"`. Reuse it: the customer picks the actual window the owners measured — *"Dining Room, left window"* — rather than typing a room name that may match nothing. The stored answer records the measurement's id alongside its text, so the owners know exactly which window without interpreting prose.

When the job has no measurements, the picker is a plain text box. "Somewhere else" is always offered, because a customer may be reporting something that was never measured.

**The photo is optional but encouraged**, with one line saying why: a photo usually means the owners can bring the right part the first time. It is never required — a customer whose submission failed because their photo was too large will call instead, or not at all.

### 5.2 What it creates

**It must go through `createJob()` in `lib/admin/jobs.ts`, not a direct insert into `leads`.** Work hangs off that function — validation, the opening event, and (from the route-creator branch) geocoding via `after()`. A service job that bypassed it would carry a real address the owners must drive to and never be geocoded, sitting in "Needs address" forever. If `createJob`'s signature cannot express a service job, widen it; do not route around it.

A new row in `leads`:

- `source = 'service'`, status `new`, name / email / phone / address / city copied from the parent job
- `parent_job_id` = the original job
- The answers written as the job's opening `note`, formatted as a short block, plus a `job_events` row of kind `service` recording the request
- A photo, when given, stored private through the existing blob path and attached to the NEW job as a `job_files` row of kind `photo`, unshared

Both owners are emailed: what broke, which room, the customer's words, the original project number, and a link to the new job.

The customer sees a confirmation naming the new project number and telling them the owners will be in touch. Their original project page shows a line under the service section: *"Service requested on Sep 16 — we will be in touch."*

### 5.3 Data

Migration `db/migrations/019_service_requests.sql`, idempotent, whole-line `--` comments only:

1. `alter table leads add column if not exists parent_job_id uuid references leads(id)` — null for every ordinary job.
2. An index on `parent_job_id`.
3. No new table. A service job is a job.

`source` is `text not null` with **no check constraint** (verified against `001_leads.sql` and every later migration), so `'service'` needs no schema change. Existing values set in code include `outlook` and `tracker`.

### 5.4 On the admin side

- The board shows a service job like any other. Its card carries a **Service** marker so the owners can see at a glance what it is.
- The job page shows *"Service request for PSS-1002"* linking to the original job.
- Nothing else changes. Scheduling, quoting and invoicing a service job work exactly as they already do, which is the point of making it a job.

## 6. Error handling

- A message or request against a job the customer does not own: refused, and the response is the same as for a job that does not exist — no information about which jobs exist.
- Email failure must NOT lose the customer's words: the `job_events` row is written first, in the same statement where possible, and the email is sent after. A failed email is logged, and the request still exists on the board.
- A photo that fails to upload does not fail the request — the job is created and the failure is noted, because a customer whose repair request vanished because an image was too large will simply not try again.
- Every form works with JavaScript off; they are plain `<form>` posts to server actions.

## 7. Testing

**Unit**
- Each action refuses a job id the customer does not own, and refuses when signed out.
- The message throttle: a second send inside the window is accepted silently, not errored.
- Length caps reject over-long input with a readable message.
- A service request creates a job with `parent_job_id` set, `source = 'service'`, and the answers in the note; the parent job is unchanged.
- The list renders the project number, the address, and the current step; two jobs in one city are distinguishable.
- `toProject()` leak test extended: no `job_events` body, no message text from any other job.

**End-to-end (Neon test branch, production build)**
- A customer sends a message; it appears on the job in the admin.
- A customer requests a service; a new job appears on the board linked to the original; the original page shows the requested line.
- **A service request naming another customer's job id is refused** — the same release-gate shape as the file-sharing guard, and it must be *watched failing* with the ownership check removed before it is trusted.

## 8. Out of scope

- Social sharing (deferred, its own spec).
- Approve quote and Acknowledge installation (Phase 2 of the project page, still unbuilt).
- Any inbox, thread, or reply-from-the-app messaging.
- Customer-visible money, in any form.
- Customers uploading documents.
