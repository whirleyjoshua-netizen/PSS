# Designer notes per appointment, with the gate code, in Outlook — design

Date: 2026-10-01. Requested by Shade; approved by the owner (Joshua) in conversation the same day.
Branch `feat/designer-notes` from origin/main 105ecd2. Migration **035** (034 is held by the PSS Ops
session, pss-46).

## 1. Goal

When Shade schedules a client, she writes her designer notes in the scheduler pop-up, sees (and can
fix) the client's gate code there, and finds both in the Outlook calendar event, alongside the
existing "Open the job" link back to the client page.

## 2. Owner decisions

- Notes are **per appointment** (a consultation note and a measure note are separate).
- The gate code stays **per client** (`leads.gate_code`); every appointment's event shows the
  client's current gate code.
- **Edits after booking update Outlook**: changing an appointment's notes, or the client's gate
  code from any of its three edit points (job Details, the call form, the customer questionnaire),
  updates the confirmed appointments' Outlook events.
- The admin is the source of truth for notes: anything typed into the event body in Outlook is
  overwritten by the next admin-driven body update.
- The gate code may appear on the support@ calendar (owner accepted 2026-10-01). Events have no
  attendees, so nothing reaches the customer. It stays out of the customer portal, the activity log
  (`job_events` bodies) and customer emails, as today.
- Assumption (not confirmed by the owner): Shade sees the support@ calendar in her Outlook.

## 3. Behaviour

### Scheduler pop-up (`ScheduleDialog`)
- Shows the client's gate code in an editable field at the top (max 40 characters, the existing
  `gateCodeField` rules). Saving the booking saves a changed gate code to the client.
- New "Designer notes" textarea (optional, max 2000 characters) below the time fields.
- Booking a new appointment saves its notes. Rescheduling pre-fills and keeps the notes (still
  un-confirms, as today).

### Client page (`AppointmentsCard`)
- Each appointment row shows its designer notes (whitespace preserved) when present.
- An "Edit notes" control edits just the notes (and the gate code) **without** rescheduling and
  **without** un-confirming. A confirmed appointment's Outlook event updates.

### Outlook event body (confirmed appointments only, as today)
In this order, plain text:
1. `Gate code: <code>` — only when set.
2. `Designer notes:` then the notes — only when set.
3. A blank line, then today's lines unchanged: phone, email, interested in, blank line, `Open the
   job: <link>`.
Subject, location, timing and the one-event-per-kind model are unchanged.

### Keeping Outlook current without churn
- Each linked event stores a hash of the body the admin last wrote (`job_calendar_events.body_hash`).
- On every reconcile of a wanted, linked event: compute the body the admin wants; if its hash
  differs from the stored hash, PATCH the body (together with any time/subject PATCH), then store the
  new hash and the returned changeKey. Equal hash → no body PATCH. Events created before this
  feature (null hash) get one body PATCH on their next reconcile.
- The existing rule stays: when Outlook has a newer changeKey and the tracker pushed nothing in that
  pass, the tracker sends nothing back in that pass (Outlook wins the date). A body change waiting
  behind that is sent on the next pass that pushes (body or time), so it is never lost: the hash
  still differs.
- Triggers: the new notes action, the gate-code saves in job Details, the call form (already syncs)
  and the questionnaire all call the existing `syncJobCalendar` for the job's confirmed kinds.

## 4. Data

Migration `db/migrations/035_designer_notes.sql`, every statement re-runnable:
- `alter table appointments add column if not exists designer_notes text;` with a length check
  (`<= 2000`) added via drop-if-exists/add.
- `alter table job_calendar_events add column if not exists body_hash text;`
No data backfill; nothing existing changes meaning.

## 5. Out of scope

- Event length from `duration_minutes` / arrival windows (timed events stay 1 hour, as today).
- Per-designer calendars or a second mailbox.
- Showing notes in the customer portal or emails (never).
- Notes on the call page's quick booking (it books a consultation without the dialog; notes can be
  added afterwards with "Edit notes").

## 6. Testing

- Unit: event body content and order (with/without gate code and notes); body hash stable for equal
  input and different for any change; reconcile PATCHes the body only when the hash differs, stores
  hash + changeKey, sends nothing back when Outlook is newer and nothing was pushed, and PATCHes a
  null-hash legacy event once.
- Actions: booking saves notes and a changed gate code; reschedule keeps notes; "Edit notes" never
  un-confirms and triggers sync; Details/questionnaire gate-code saves trigger sync; gate code never
  enters `job_events` bodies.
- UI: dialog shows the gate code and notes, pre-fills on reschedule; card shows notes and the edit
  control.
- Real database: migration 035 applied twice to a Neon test branch; a verify script exercises the
  notes write/read and the hash column.
- No live Outlook in tests (Graph is mocked, as in tests/calendar/*). After deploy, the owner books
  and confirms one test appointment to see the event body in Outlook.
