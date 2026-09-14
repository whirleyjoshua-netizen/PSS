# Outlook Calendar Sync and Schedule Tab: Design

**Date:** 2026-09-14
**Status:** Approved in conversation (approach A, "defaults are fine"). Waiting on spec review.
**Scope:** Two-way sync between the job tracker's visit and install dates and one shared Outlook calendar in the business's Microsoft 365 tenant, plus a Schedule tab in the admin that shows that calendar as a week view.

## 1. Purpose

The owners already live in Outlook. Today, when a visit or install date is set in the tracker, someone has to type it into Outlook separately. When a customer reschedules and an owner drags the appointment in Outlook, the tracker goes stale.

Success means:
- A visit time or install date saved in the tracker appears on the shared "PSS Jobs" calendar within seconds.
- Moving or deleting that appointment in Outlook updates or clears the date on the job within a few minutes.
- The admin has a Schedule tab showing the week's appointments, with job appointments linking to the job.
- If Microsoft is unreachable or the feature isn't configured, the tracker keeps working exactly as it does today.

## 2. Decisions made in conversation

- **Both ways.** The tracker writes to Outlook, and Outlook changes flow back.
- **Microsoft 365 Business, one shared business calendar.** Not each owner's personal calendar.
- **Outlook edits update the job to match.** Outlook wins when an owner moves an appointment there.
- **Week view** for the Schedule tab.
- **Approach A:** a Microsoft Graph app registration with app-only access (client credentials), scoped to the shared mailbox only. Change notifications (webhooks), plus a daily cron that keeps the subscription alive and catches anything missed.

## 3. Verified platform facts (Microsoft Graph docs, checked 2026-09-14)

- **Subscription lifetime.** An Outlook `event` subscription lasts at most 10,080 minutes (under 7 days) without resource data. A daily renewal leaves six days of margin. Vercel Hobby cron runs once a day within ±59 minutes, which is enough.
- **Validating the webhook URL.** Graph sends `POST <notificationUrl>?validationToken=…`. The endpoint must reply within 10 seconds with `200`, `Content-Type: text/plain`, and the URL-decoded token as the body.
- **Receiving notifications.** The endpoint must answer with a 2xx within 3 seconds, or Graph retries for up to 4 hours and eventually throttles or drops the endpoint. `clientState` (at most 128 characters) is echoed in every notification and must be checked.
- **Duplicate subscriptions.** Creating a second subscription with the same `resource` and `changeType` fails with `409`.
- **Limiting access to one mailbox.** Exchange Online "RBAC for Applications" replaces Application Access Policies. The app is given the Exchange role `Application Calendars.ReadWrite` limited by a management scope that matches only the shared mailbox. The app must **not** also be granted `Calendars.ReadWrite` in Entra, because the two grants add up and the Entra grant would cover every mailbox.
- **Delta query.** In v1.0, delta for events works only on a `calendarView` with a fixed date window. This design doesn't use delta; see §7.

## 4. Microsoft 365 setup (done by the owner, with a guided checklist)

The implementation plan ends with a step-by-step checklist. These steps are not automated.

1. Create a shared mailbox, for example `jobs@<domain>`, named "PSS Jobs". Give both owners Full Access so its calendar appears in their Outlook.
2. In Entra, create an app registration called "PSS Tracker" (single tenant) and a client secret with a 24-month expiry. Record the tenant ID, client ID and secret. Grant it **no** Graph API permissions.
3. In Exchange Online PowerShell:
   - Run `New-ServicePrincipal` using the Enterprise Application's App ID and Object ID.
   - Run `New-ManagementScope -Name "PSS Jobs only" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'jobs@<domain>'"`.
   - Run `New-ManagementRoleAssignment -App <objectId> -Role "Application Calendars.ReadWrite" -CustomResourceScope "PSS Jobs only"`.
   - Check the setup with `Test-ServicePrincipalAuthorization -Identity <objectId> -Resource jobs@<domain>`. It should show `InScope = True`.
   - Allow 30 minutes to 2 hours for the permission to take effect.
4. Add Vercel production environment variables (each one confirmed with the owner before it's set):
   - `MS_TENANT_ID`
   - `MS_CLIENT_ID`
   - `MS_CLIENT_SECRET`
   - `CALENDAR_MAILBOX` (the shared mailbox address)
   - `CALENDAR_CLIENT_STATE` (a random string of 32 or more characters)
   - The existing `CRON_SECRET` is reused.

**Feature switch.** The calendar feature is on only when all five `MS_*`/`CALENDAR_*` variables are set. Otherwise:
- Every sync call does nothing.
- The Schedule tab shows tracker dates only, with a note: "Outlook isn't connected yet."
- The webhook route returns 404.

The client secret's expiry date is written in the checklist. The admin Settings page shows "Outlook connected" and the subscription's expiry time, or the last sync error, so a lapsed secret is noticed.

## 5. Data model: migration `007_outlook_calendar.sql`

```sql
create table job_calendar_events (
  lead_id     uuid not null references leads(id) on delete cascade,
  kind        text not null check (kind in ('visit','install')),
  event_id    text not null unique,         -- Graph event id
  change_key  text not null,                -- Graph changeKey when we last synced
  synced_at   timestamptz not null default now(),
  primary key (lead_id, kind)
);

create table calendar_sync_state (
  id               int primary key default 1 check (id = 1),  -- single row
  subscription_id  text,
  expires_at       timestamptz,
  last_error       text,
  last_error_at    timestamptz,
  updated_at       timestamptz not null default now()
);
```

The ID type of `leads.id` must match the existing schema. The plan checks the actual column type.

- Each job has at most one visit event and one install event.
- The "Visit booked" stage is not tied to the event. Only the dates are synced.

## 6. Tracker to Outlook

**Entry point:** `syncJobCalendar(leadId: string): Promise<void>` in `lib/calendar/sync.ts`.
- It reads the job's current `visit_at`, `install_on`, status and contact details.
- It reconciles each kind:

| Tracker has | Link exists | Action |
|---|---|---|
| a date | no | Create the event, then store the link and changeKey |
| a date | yes | PATCH the event if its start differs, then update the changeKey |
| no date (or the job is lost) | yes | DELETE the event (a 404 counts as done), then remove the link |
| no date | no | Nothing |

- It never throws. On failure it writes `calendar_sync_state.last_error` and returns. The job save has already succeeded.

**Call sites** (after the database write succeeds, awaited but wrapped so errors are swallowed):
- `saveDetails` in `app/admin/jobs/actions.ts`
- `markLost`, and any action that reopens a lost job
- `logCallAction` in `app/admin/jobs/call-actions.ts` (pss-5d's call flow, which also sets `visit_at`)
- `createJob`, when the new job has dates

**Event content:**
- **Visit:**
  - Subject: `Visit · <customer name>`.
  - A timed event lasting 1 hour, in `Pacific Standard Time` (Las Vegas).
  - Location: the job's address.
  - Plain-text body: phone, email, interests, and the admin job link `<ADMIN_BASE_URL>/admin?job=<id>`.
- **Install:**
  - Subject: `Install · <customer name>`.
  - All-day (`isAllDay: true`, start at midnight on the date, end at midnight the next day).
  - Same location and body.
- **Keeping Outlook's length.** When a visit is moved from the tracker, the event keeps whatever length it currently has in Outlook. The start moves; the duration isn't reset to 1 hour.
- **Owner-edited text.** Subject and body are written when the event is created and refreshed on PATCH only when the customer's name or address changed. Notes an owner typed into the Outlook event body are otherwise left alone.

**Requests:**
- Every Graph request sends `Prefer: outlook.timezone="Pacific Standard Time"`.
- Times are converted with the existing Las Vegas helpers in `lib/admin/time.ts`.

## 7. Outlook to Tracker

### Webhook: `app/api/calendar/notifications/route.ts`

- **Validation:** if `validationToken` is present, reply `200 text/plain` with the token, and nothing else.
- **Otherwise:**
  1. Parse the JSON body.
  2. Drop any notification whose `clientState` doesn't match `CALENDAR_CLIENT_STATE` (compared in constant time) or whose `subscriptionId` doesn't match the stored subscription.
  3. Reply `202` immediately.
  4. Do the work inside Next's `after()`, so the 3-second deadline is always met.
- **Work per notification:**
  1. Look up `job_calendar_events` by the event id in `resourceData.id`. If it's not a job event, ignore it.
  2. If the change type is `deleted`, or GET returns 404: clear the job's date (`visit_at` or `install_on` becomes null), delete the link, and log a `job_events` note: "Visit removed in Outlook" / "Install removed in Outlook".
  3. Otherwise GET the event. If its `changeKey` equals the stored one, this is our own write echoing back: stop.
  4. Otherwise compute the new date:
     - Visit: the start time, as a Las Vegas timestamptz.
     - Install: the start date. If an owner turned it into a timed event, use that event's date.
  5. If the new date differs from the job's date, update the job and log "Visit moved in Outlook to <Sat, Sep 20, 10:00 AM>" (or the install equivalent).
  6. Store the new changeKey either way.
- **Lifecycle notifications:** the subscription's `lifecycleNotificationUrl` points to the same route.
  - `reauthorizationRequired` renews the subscription.
  - `subscriptionRemoved` re-creates it.
  - `missed` runs the reconcile from the daily cron.

**Stage moves.** Clearing a visit in Outlook does not move the job's stage. The owner decides that. The board's overdue flag already highlights a visit-booked job with no upcoming visit.

### Daily cron: `app/api/cron/calendar/route.ts`

The cron runs daily at `0 16 * * *`, one hour before the review-request cron. It's protected by `CRON_SECRET` the same way the review cron is.

1. **Subscription:**
   - If none is stored, or it expires within 3 days: PATCH it to now + 6 days 23 hours.
   - If the PATCH returns 404: create it with resource `users/<CALENDAR_MAILBOX>/events` and changeType `created,updated,deleted`.
   - If the create returns 409: list the subscriptions, adopt the matching one, and store it.
2. **Reconcile.** For every non-lost job with a visit or install date from 30 days ago onward, plus every existing link:
   - Link exists, and Outlook's changeKey differs from the stored one → Outlook changed it and we missed the notification. Pull it (same logic as the webhook).
   - Link exists, changeKey matches, but the tracker's date differs → our earlier push failed. Push it.
   - A date with no link → create the event.
   - A link whose event returns 404 → Outlook deleted it. Clear the date (same as the webhook).
3. Clear `last_error` if everything succeeded.

The cron catches anything the webhook missed, without delta tokens. At the business's size (dozens of dated jobs, not thousands), GETting each linked event once a day is cheap.

**Conflict rule:** the changeKey tells us which side changed. If Outlook's changeKey moved, Outlook wins; otherwise the tracker wins. This matches the conversation's "update the job to match".

## 8. Schedule tab

**Navigation:**
- A "Schedule" link with a calendar icon goes in the sidebar between Jobs and New job, added to the existing `Icon` set.
- It is active on `/admin/schedule`.

**Page:** `app/admin/schedule/page.tsx`. It calls `requireAdmin()` first.
- **Week:** `?week=YYYY-MM-DD` (any date inside the week). The week runs Sunday to Saturday in Las Vegas time. It defaults to the current week. A malformed value falls back to the current week.
- **Header:**
  - The "PSS OPERATIONS" eyebrow, then "Schedule".
  - The date range, for example "Sep 13 – 19, 2026".
  - Previous week / This week / Next week links.
- **Data:**
  - One Graph `calendarView` request for the week on the shared calendar, with `$select` of subject, start, end, isAllDay, location and id, and `$top=200`.
  - These events are merged with `job_calendar_events` to find which ones are jobs.
  - Graph data is never stored beyond the link table.
- **Layout:**
  - On `md` and up: seven day columns. Each has an all-day row at the top, then timed events in time order (a list, not an hour-by-hour grid). Today's column is highlighted.
  - On phones: one stacked list per day.
- **Job events:**
  - A card with the stage color's left edge, the time (or "All day"), "Visit" or "Install", the customer name and the city.
  - Each is a link to `/admin?job=<id>`.
- **Other Outlook events:** shown greyed with time and subject only. They're not links.
- **Degraded mode:** if Outlook isn't connected or the Graph call fails, the page shows the week's visits and installs from the tracker database. It shows one line explaining why: "Outlook isn't connected yet", or "Couldn't reach Outlook, showing tracker dates only".
- **Empty week:** "Nothing scheduled this week."

## 9. Code layout

- `lib/calendar/config.ts`: reads the env vars and exposes `calendarEnabled()`.
- `lib/calendar/graph.ts`:
  - Gets and caches the client-credentials token at `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token` with scope `https://graph.microsoft.com/.default`, until 5 minutes before expiry.
  - Provides a small `graphFetch` with the timezone header, a 10-second timeout, and one retry on 429/503 that honors `Retry-After`.
  - Uses plain `fetch` with no SDK dependency.
- `lib/calendar/events.ts`: pure functions that build the event bodies for visits and installs and turn Graph start/end values into tracker dates. They're unit-tested without the network.
- `lib/calendar/sync.ts`: `syncJobCalendar`, the inbound handler `applyOutlookChange(eventId, changeType)`, and `reconcileCalendar()`.
- `lib/calendar/subscription.ts`: `ensureSubscription()`.
- `lib/calendar/week.ts`: `getWeek(weekParam)` returns the days and merged events for the Schedule page.
- The routes and the page described above.
- `db/migrations/007_outlook_calendar.sql`.
- `vercel.json`: the second cron entry.
- The Settings page gets an "Outlook calendar" status line.

## 10. Errors and edge cases

- **Graph down or credentials wrong:** the save still succeeds, `last_error` is recorded, and the cron retries daily. The Settings page shows the error.
- **A job event's owner edits only the subject or body in Outlook:** the changeKey moves but the date is the same. We store the new changeKey and change nothing else.
- **An owner creates an appointment in Outlook by hand:** it isn't linked, so it appears greyed in Schedule and isn't imported as a job.
- **An owner turns a job event into a recurring series:** we use the series master's start date, then ignore the recurrence.
- **Job deleted:** the link row cascades away. Deleting the Outlook event is best effort in the same action if a delete path exists. The daily cron doesn't touch unlinked events.
- **Echo loops:** our own PATCH produces a notification whose changeKey we already stored, so it stops at step 3 of the webhook work.
- **Two quick edits race:** the date comparison in step 5 and the cron's reconcile settle on the last state.

## 11. Out of scope

- Personal calendars, per-owner calendars, and invites to customers (no attendees are added).
- Creating jobs from Outlook appointments.
- Drag-and-drop or editing in the Schedule tab. The owner edits in Outlook or in the job panel.
- An hour-by-hour grid, a month view, and Google Calendar.
- Storing Outlook events other than the link table.

## 12. Testing

**Unit (Vitest):**
- `events.ts`:
  - The visit and install body shapes.
  - Converting Las Vegas time in both directions, including a DST boundary.
  - The all-day end date.
  - Keeping duration on a move.
- The `syncJobCalendar` decision table with a mocked `graphFetch` and `db`: create, patch, delete, lost, a 404 on delete, and a Graph failure that records `last_error` and doesn't throw.
- `applyOutlookChange`: moved, deleted, echo (same changeKey), not a job event, and a text-only edit.
- `reconcileCalendar`: its four cases.
- The webhook route:
  - The validation echo is plain text.
  - A bad clientState is dropped.
  - It returns 202.
  - It's a 404 when disabled.
- `ensureSubscription`: renew, the 404 path to create, and the 409 path to adopt.
- The cron route: rejects a missing secret.
- `getWeek`:
  - The Sunday–Saturday range in Las Vegas time.
  - The malformed `week` fallback.
  - Merging job and non-job events.
  - Degraded mode.

**Components:**
- The Schedule page renders the day columns, job links and greyed events, and shows the degraded note.
- The sidebar shows Schedule with `aria-current`.

**E2E (Playwright, production build and a Neon test branch):**
- The feature is disabled in e2e (no MS env vars). The Schedule tab shows the week's tracker dates from the database, the not-connected note, and a job link that opens the panel.
- A live Graph test is not automated. After setup, the owner runs a scripted manual check: set a visit, see it in Outlook, move it in Outlook, and see the job update.
