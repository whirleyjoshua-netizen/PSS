# Call-Back Reminders — Design

**Date:** 2026-09-14
**Status:** Approved in conversation, pending spec review
**Scope:** Each job can carry one next call-back (a date and time plus a short reason). The owners set it from the call screen or the job page, see what's due in a "Follow-ups due" list on the board, and get one morning email listing the day's call-backs. Builds on the lead call flow (`2026-09-14-lead-call-flow-design.md`, live) and fits around two parallel efforts: the Outlook calendar sync (owns `CallForm.tsx`'s booking block and adds `DaySchedule`) and the job page redesign (rewrites `app/admin/jobs/[id]/page.tsx`).

## 1. Purpose

A lead who says "call me Friday" or doesn't pick up is easy to lose. This gives every such lead a dated reminder that shows up where the owners already look (the board) and in their inbox each morning, without a separate to-do app.

Success means:
- Setting a call-back takes one tap on a quick pick, or one date-time field, during the call-logging step.
- Every call-back that is due today or overdue appears on the board and in that morning's email until it is done or replaced.
- No lead with a call-back in the past is silently dropped.

## 2. Decisions made in conversation

- **Where reminders show:** a "Follow-ups due" list on the board plus one email each morning to both owners. No push notifications.
- **One follow-up per job at a time.** Setting a new one replaces it.
- **The call screen offers an optional "Call back on"** after "Talked, no visit yet" or "No answer".
- **Both owners receive the morning email** (the `LEAD_NOTIFICATION_EMAIL` list, now support@premiershadesolutions.com and shade.m102@gmail.com).

## 3. Approach

Two nullable columns on `leads` (`follow_up_at`, `follow_up_note`), set and cleared by the existing call save and by a small job-page control. A board query lists due ones; a Vercel Cron route sends the morning email through Resend, the same way the daily review requests work.

Rejected:
- **A separate `follow_ups` table.** Only needed for several per job, which the owners didn't want.
- **Push notifications.** Needs the tracker installed as a home-screen app and service-worker setup; the email reaches both phones already.

## 4. Data

Migration `db/migrations/009_follow_ups.sql` (007 is the calendar's, 008 is reserved by the job page redesign):
- `alter table leads add column if not exists follow_up_at timestamptz`
- `alter table leads add column if not exists follow_up_note text`
- a check constraint `follow_up_note is null or char_length(follow_up_note) <= 200`, added idempotently (drop if exists, then add)
- `create index if not exists leads_follow_up_at_idx on leads (follow_up_at) where follow_up_at is not null`

`Job` gains optional `followUpAt?: Date | null` and `followUpNote?: string | null`; `JOB_COLUMNS` and `toJob` include them (missing → `null`). Like 005 and 006, 009 must be applied to production before the code that reads it is deployed.

## 5. Setting and clearing

**A follow-up is:** a time (`follow_up_at`, stored as an instant, entered in Las Vegas time) and an optional reason (up to 200 characters).

**Valid times:** any valid date-time up to one year ahead. A time in the past is allowed (it shows as overdue), so an owner can record "should have called yesterday".

**On the call screen** (`CallForm.tsx`, the block with "Talked, no visit yet" and "No answer" — not the booking block, which belongs to the calendar work):
- An optional "Call back on" section: quick-pick buttons **Later today 4 PM** (hidden after 3 PM Las Vegas time), **Tomorrow 10 AM**, **In 2 days 10 AM**, **Next week 10 AM**, which fill a `datetime-local` input (`callBackAt`); and a "Reason" text input (`callBackNote`, ≤ 200).
- When the calendar work is on main, the chosen call-back day also shows that day's schedule by rendering the existing `DaySchedule` component (`app/admin/jobs/[id]/call/DaySchedule.tsx`) with `slotStart` set to the chosen time. If `DaySchedule` isn't on main when this is built, this line is left out.
- Saving the call:
  - `talked` / `no_answer` with a call-back time → sets `follow_up_at` and `follow_up_note`.
  - `talked` / `no_answer` with no call-back time → clears both (the call just happened, so the old reminder is done).
  - `booked` → clears both.
- The call's activity line gains the call-back, e.g. `Call: no answer · Call back Fri 10/16, 10:00 AM · checking with husband`. No separate event.

**On the job page** — a self-contained `FollowUpBox` (`app/admin/jobs/[id]/FollowUpBox.tsx`, props `{ job }` only, no page-level data):
- Shows "Next call-back: Fri 10/16, 10:00 AM · checking with husband", with the overdue styling if it is in the past, or "No call-back set".
- **Set / Change** opens the same quick picks, date-time and reason; saving calls `setFollowUp`.
- **Done** clears it.
- Each change writes one `kind = 'note'` event: `Follow-up set: Fri 10/16, 10:00 AM · checking with husband` / `Follow-up done`.
- Placement: on today's job page, directly under `StageControls`. The job page redesign moves it into `NextActionCard.tsx`, under the primary button and above the "Move to …" control, whichever branch merges second.

**Marking a job Lost clears its follow-up** (in `setStage`, when the new stage is `lost`). Other stage moves keep it.

Server actions (`app/admin/jobs/follow-up-actions.ts`, each calling `requireAdmin()` first): `saveFollowUp(jobId, formData)` and `clearFollowUp(jobId)`. Data functions in `lib/admin/follow-ups.ts` (server-only): `setFollowUp(jobId, at, note, actor)`, `clearFollowUp(jobId, actor)`, `listDueFollowUps(now)`. Each set/clear is one statement with its event, as elsewhere in `lib/admin/jobs.ts`.

## 6. The board list

At the top of the board (`app/admin/page.tsx`), above the columns, a "Follow-ups due" section:
- **Due:** jobs not Lost whose `follow_up_at` is before the end of today in Las Vegas time, soonest first. Anything before now is **overdue**.
- Each row: name, "Overdue · Wed 10/14, 4:00 PM" (overdue text uses the existing overdue color token) or "Today · 2:00 PM", the reason, and a **Call** link to `/admin/jobs/<id>/call`. The name links to the job.
- Hidden when nothing is due. Shows at most 20 rows, then "and N more".
- The board page's search, if a term is active, does not filter this list.

## 7. The morning email

- Vercel Cron: `{ "path": "/api/cron/follow-ups", "schedule": "0 14 * * *" }` in `vercel.json` (7 AM Las Vegas in summer, 6 AM in winter), next to the existing review-requests and calendar entries.
- Route `app/api/cron/follow-ups/route.ts`: refuses anything without `Authorization: Bearer <CRON_SECRET>` before reading data, exactly like the review-requests route.
- It sends one plain-text email to every address in `LEAD_NOTIFICATION_EMAIL` (comma-separated), from `LEAD_FROM_EMAIL`, subject `Call-backs for <Wed Oct 14>: N`. Body: overdue first, then today's, one block each:

```
Overdue
- Maria Lopez · Wed 10/14, 4:00 PM · checking with husband
  (702) 555-0100 · Open in tracker: https://premiershadesolutions.com/admin/jobs/<id>

Today
- …
```

- Nothing is sent when nothing is due. A Resend error fails the cron run (500) so it isn't missed.
- The email builder is a pure function (`followUpEmailText(items, today)`) so it can be tested.

## 8. Error handling

- Invalid call-back time or a reason over 200 characters: the call screen / Follow-up box shows the message and keeps what was typed.
- A job deleted meanwhile: "That job no longer exists."
- Cron misconfigured (no `RESEND_API_KEY` or no recipients): 500 with a logged error.
- Impossible dates (e.g. `2026-13-45T25:99`) are rejected by validation, never thrown, the same way the call flow does.

## 9. Testing

Unit (Vitest, mocked db and Resend):
- Schema: call-back time optional; valid, past and one-year-ahead limits; impossible date; reason ≤ 200.
- Quick picks: each pick's Las Vegas time, "Later today" hidden after 3 PM, across a DST date.
- `logCall`: sets the follow-up on talked/no answer with a time, clears it without one, clears on booked; the activity line includes the call-back.
- `setFollowUp` / `clearFollowUp`: one statement each with the event; bad id → false.
- `setStage` to lost clears the follow-up; other moves don't.
- `listDueFollowUps`: excludes Lost, includes overdue and today, excludes tomorrow, sorted.
- Board list rendering: overdue vs today, Call link, hidden when empty, 20-row cap.
- `FollowUpBox`: shows, sets, clears.
- Email builder and cron route: auth refusal, no email when empty, both recipients, 500 on Resend error.
- Migration 009 parses under `migrate.mjs`'s rules.

End-to-end (Neon test branch, production build, desktop): log a "No answer" call with "Tomorrow 10 AM" and a reason → the job page shows the call-back; set one in the past from the Follow-up box → it appears as overdue in the board list; tap Done → it disappears.

## 10. Out of scope

Several follow-ups per job; push or text notifications; assigning a follow-up to one owner; snooze buttons; recurring reminders; adding follow-ups to Outlook (the calendar sync covers visits and installs only); customer-facing anything.
