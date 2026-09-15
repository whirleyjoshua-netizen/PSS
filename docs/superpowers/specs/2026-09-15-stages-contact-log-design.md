# Stages, Automatic Booking and the Contact Log — Design

**Date:** 2026-09-15
**Status:** Approved in conversation, pending the owner's review of this spec.
**Scope:**
- Remove "Contacted" as a tracker stage.
- Move a New lead to Appointment booked automatically once a visit date is saved.
- Add a per-client contact log ("Mark contacted").
- Slim the job page's "•••" menu.
- Retire the Overview's Next action card.

This builds on the job tracker, the lead call flow, the call-back reminders and the job-page redesign, all of which are live.

## 1. Purpose

**The problem.** The owners felt the job page repeated stage controls:
- Next action "Move to Quoted" sat at the top.
- "Set stage" sat at the bottom of the menu.
- A separate Contacted stage cluttered the tracker.

**The fix.**
- The tracker shows real progress only: a lead is New until an appointment is on the calendar.
- Reaching out to a client is tracked on that client's page, not as a stage.

**Success means:**
- The board has no Contacted column. Saving a visit date on a New lead moves it to Appointment booked without anyone touching the stage.
- On a client's page, the owner can record "Contacted · Called, Texted — note" in two taps, and see when they last reached out.
- The "•••" menu has one purpose per section, with no duplicate stage controls.

## 2. Decisions made in conversation

- **Stages:** new → visit_booked → quoted → sold → ordered → installed, plus lost.
  - `visit_booked` keeps its database value; only its label changes to **Appointment booked**.
  - `contacted` is removed.
- **Existing Contacted jobs:** the two that existed were test data and were deleted from production on 2026-09-15, with the owner's approval. The migration also moves any Contacted job that appears before launch back to `new`. It never deletes.
- **Auto-booking source:** only a visit date saved in the tracker, either by booking on the call screen or via Schedule / Job details. Visits created or moved in Outlook do not move the stage.
- **Clearing a visit date** never moves a job backwards.
- **Menu stage control:** there is no Next action and no "Move to Quoted" button. The owner will say later how Quoted should work. Stage corrections use a small "Change stage…" disclosure holding the existing Set-stage list. Mark lost stays.
- **Contact log:**
  - It saves an activity entry and shows "Last contacted" under the client's name.
  - It never changes the stage, and it does not appear on the board.
  - Calls logged on the call screen count as contact.
- **Overdue rule for New:** flagged only when nothing (no contact and no call) has been logged within 1 day of the lead entering New. After that, call-backs handle the reminders.
- **Next action card:** removed from the Overview. The page already has buttons for measuring and so on.

## 3. Stages (lib/admin/stages.ts and everywhere that reads it)

- `STAGES` loses `contacted`, and `visit_booked`'s label becomes "Appointment booked". `WORKING_STAGES` loses `contacted`.
- The board columns, the new-job form's stage list, the Set-stage list and the stage stepper all follow automatically.
- `STAGE_STYLE` and the stepper's `FILL` lose their `contacted` entries. Every remaining stage keeps all four `STAGE_STYLE` fields; `left` is used by the Schedule and the calendar.
- The `--color-stage-contacted` token in globals.css is removed once nothing references it.
- `stageLabel` must still accept the legacy value `"contacted"`, returning "Contacted". Older activity entries such as "New lead → Contacted" still reference it and must render without crashing. `isStage` does not accept it for new writes.
- `OVERDUE_DAYS` loses `contacted`.
- `nextAction` loses its `contacted` case. The card goes (§6); remove any code that only the card used.
- The customer project page is unaffected. It only shows stages from Quoted onward.

## 4. Appointment booked automatically

- `updateDetails` (Job details and the Schedule button) books automatically only when all three hold:
  - this save actually edited the visit date (the existing `visitEdited` / `visitAtLoaded` check, the same signal that sets `visitChanged`);
  - the new visit date is not null;
  - the job's current status is `new`.

  When they do, the same statement sets `status = 'visit_booked'` and `stage_changed_at = now()`, and logs a `stage` event (`new → visit_booked`) next to the existing 'edit' event. A stale or untouched form never books, and neither does a date synced from Outlook.
- Call screen (`callStageMove`):
  - "booked" moves to `visit_booked` only from `new`.
  - "talked" and "no answer" never move the stage.
  - The existing forward-only guard stays.
- After an automatic move, Outlook sync runs as it does today for a changed visit date.

## 5. Contact log

**Saving a contact**
- A new `job_events.kind` value, `contact`.
- The body is `Contacted · <methods>` plus `— <note>` when a note is given. For example: `Contacted · Called, Texted — left details on price`.
- Methods, in this order and with these labels: `called` Called, `texted` Texted, `voicemail` Voicemail, `email` Email. Several can be picked.
- At least one method is required; the error reads "Pick how you reached them". The note is optional and at most 500 characters.
- A server action `logContact(jobId, prev, formData)`:
  - calls `requireAdmin()` before reading any input;
  - inserts the event with the owner as actor;
  - never touches the stage or the call-back.

**Last contacted**
- `Job` gains `lastContactAt?: Date | null`, computed in `JOB_COLUMNS` as the newest `job_events.created_at` for the job where the kind is `contact`, or the kind is `note` and the body starts with `Call:` (call-screen logs).
- The header shows it under the client's name: "Last contacted Tue 9/15" (Las Vegas day and short date), or nothing if never.
- The activity feed shows contact entries like notes. A small "Contacted" label is fine.

**Where it appears**
- The job page only. It is never on the board and never on customer pages.

## 6. The job page

The Overview no longer renders `NextActionCard`.

The header's "•••" menu contains, top to bottom, with dividers:
1. **Mark contacted.**
   - A checkbox "Mark contacted". Ticking it reveals method checkboxes (Called, Texted, Voicemail, Email), a Note field and a Save button.
   - After a save, the form closes and resets, and "Last contacted" updates.
2. **Call-back.** The existing `FollowUpBox`, unchanged.
3. **"Change stage…"** A small disclosure containing the existing Set-stage list (without Contacted), followed by the existing Mark lost form.

If the job's call-back is overdue, a small "Call-back overdue" tag shows beside the stage badge in the header.

The menu keeps the current `<details>` pattern and positioning.

## 7. Overdue for New leads

`isOverdue` for `new`: overdue when more than 1 day has passed since `stageChangedAt` **and** there is no `lastContactAt` at or after `stageChangedAt`.

The board passes `lastContactAt` through, since it is in `JOB_COLUMNS`. Other stages are unchanged.

## 8. Data

Migration `db/migrations/011_stages_contact_log.sql`. The number was confirmed with the Google sign-in work, which will use 012 if it needs a migration. It must be idempotent and follow the migrate.mjs rules: comments on whole lines only, and no `;` inside comments.

1. `update leads set status = 'new' where status = 'contacted'`. This keeps `stage_changed_at` so the day count isn't reset.
2. Replace `leads_status_check` with the list without `contacted`.
3. Replace `job_events_kind_check` with `('stage','note','edit','email','reward','measure','file','contact')`.
4. Also add `'contact'` to the kind lists in `003_measure_and_files.sql` and `004_referrals_reviews.sql`. migrate.mjs re-applies every file in order, so an older list without `contact` would fail on existing contact rows. The three lists must stay identical.

`002_job_tracker.sql`'s wider status list is left alone. The new migration narrows it on every run.

## 9. Error handling

- A contact save with no method gives an inline error, and what was typed stays in the form.
- A contact save for a job that no longer exists gives "That job no longer exists."
- Legacy `contacted` values in old events render as "Contacted". Nothing crashes.

## 10. Testing

**Unit (Vitest)**
- Stages list, labels (including the legacy label) and next-stage behavior.
- The stepper without Contacted.
- The overdue rule for New, with and without a contact since the stage change.
- `updateDetails` auto-books from `new` only, logs a stage event, and never books an untouched form or a job past New.
- `callStageMove`: "talked" doesn't move the job; "booked" moves it from new only.
- `logContact`:
  - requires admin first;
  - requires at least one method;
  - composes the exact body;
  - never touches the stage.
- `lastContactAt` mapping.
- The header shows "Last contacted" and the overdue call-back tag.
- The menu sections are present, and the Next action card is absent from the Overview.
- The migration parses under the migrate.mjs rules, and the three kind lists are identical.

**End-to-end (Neon test branch, production build, desktop)**
- Saving a visit date in Job details moves a New lead to Appointment booked.
- Mark contacted (Called + Texted + a note) shows in the activity feed and as "Last contacted", and the stage stays New.
- Update the existing specs that reference Contacted, the Next action card or "Visit booked" wording (admin, call, follow-ups).

## 11. Out of scope

- How Quoted is reached. The owner will explain later.
- Auto-booking from Outlook.
- Showing contact on the board.
- Texting or emailing from the log.
