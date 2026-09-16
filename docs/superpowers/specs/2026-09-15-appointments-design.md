# Appointments, Confirmation and the Job Page Tidy-up — Design

**Date:** 2026-09-15
**Status:** Approved in conversation, pending the owner's review of this spec.
**Scope:**
- One **Schedule** button books every kind of appointment: Consultation, Measure, Install, Service.
- A booked appointment is **pending** until the owner presses **Confirm schedule**, which emails the customer.
- The job page's Visit and Install cards become information; Order becomes an information tile; the Money strip goes.

This builds on the job tracker, the Outlook calendar sync, the Completed stage and the team assignment work, all of which are live.

## 1. Purpose

**The problem.**
- Scheduling is scattered: "Book visit" writes one field, "Set install date" writes another, and the Schedule button in the header only jumps to a form field.
- Only two kinds of appointment can exist, so measures and service calls have nowhere to live.
- A date typed into the tracker is immediately real — there is no moment to check it before the customer is told.
- Money and order figures on the job page will be handled in Hunter Douglas's platform instead.

**The fix.**
- One dialog books any appointment: pick the date and time, then what it is for.
- Nothing reaches the shared calendar or the customer until **Confirm schedule** is pressed. Confirming emails the customer their appointment.
- The job page shows appointments as information with clear actions, and drops the figures that are moving to Hunter Douglas.

**Success means:**
- The owner books a measure for Tuesday, sees "Pending confirmation", presses Confirm schedule, and the customer gets an email saying when we are coming.
- A job can hold a consultation and an install at the same time, each its own colour.
- Nothing that already depends on the visit and install dates — the Schedule page, Outlook, review emails, the customer's progress page — changes behaviour.

## 2. Decisions made in conversation

- **Four kinds:** Consultation, Measure, Install, Service. Each has its own colour and icon in the admin.
- **One of each kind per job at a time.** Rescheduling replaces; it does not pile up.
- **Unconfirmed appointments stay off the shared calendar** and out of everything downstream. They exist only on the job page, marked "Pending confirmation".
- **Changing a confirmed appointment un-confirms it.** The owner confirms again and the customer gets an updated email.
- **All four kinds email the customer** on confirmation, with wording that fits the kind.
- **Money** leaves the job page. Quote, sold and deposit stay stored and editable under Job details, so nothing already entered is lost.
- **Order** becomes an information tile: the date ordered plus a link to the order paperwork in the job's files. Setting the date by hand stays in Job details. The Hunter Douglas integration replaces this later.
- **"Add measurement" stays a link**, not a button.

## 3. Data

Migration `db/migrations/014_appointments.sql`, idempotent, whole-line `--` comments only, no `;` inside comments:

```
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  kind text not null,
  starts_at timestamptz not null,
  all_day boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
- `appointments_kind_check`: `kind in ('consultation','measure','install','service')`, dropped and re-added.
- `appointments_lead_kind_key`: unique index on `(lead_id, kind)` — one of each kind per job.
- Index on `(lead_id)` is covered by that unique index.

**Backfill, once, idempotently:**
- Each job with `visit_at` and no consultation row gets a **confirmed** consultation at that time (`all_day` false).
- Each job with `install_on` and no install row gets a **confirmed** install at 08:00 Las Vegas on that date, `all_day` true — legacy installs were all-day and must keep rendering that way.
- `confirmed_by` is `'backfill'`.

`leads.visit_at` and `leads.install_on` stay. They are now **mirrors of the confirmed consultation and install**, maintained in TypeScript (this repo uses no triggers). Everything downstream keeps reading them unchanged: the Schedule week and month views, Outlook sync, `updateDetails`'s auto-booking, review timing, and the customer's progress page.

## 4. The appointment module (`lib/admin/appointments.ts`, server-only)

- `APPOINTMENT_KINDS` in `lib/admin/appointment-kinds.ts` (client-safe, the `team-roles.ts` pattern): `[{ value: "consultation", label: "Consultation", icon: "calendar" }, { value: "measure", label: "Measure", icon: "ruler" }, { value: "install", label: "Install", icon: "wrench" }, { value: "service", label: "Service", icon: "phone" }]`, plus `AppointmentKind`, `isAppointmentKind`, `kindLabel`, and `APPOINTMENT_STYLE` (a `Record<AppointmentKind, { icon, tint, edge, left }>` of complete literal Tailwind classes, mirroring `STAGE_STYLE`). New colour tokens `--color-appt-*` in `app/globals.css`. A new `ruler` icon in `components/admin/icons.tsx`.
- `type Appointment = { id, jobId, kind, startsAt, allDay, confirmedAt, confirmedBy }`.
- `listAppointments(jobId): Promise<Appointment[]>` — ordered by `starts_at`.
- `saveAppointment(jobId, kind, startsAt, allDay, actor)` — inserts or replaces that job's appointment of that kind, always leaving it **unconfirmed** (`confirmed_at = null`), and logs an `edit` activity entry ("Consultation set for Tue, Oct 14 2:00 PM — pending confirmation"). Returns `"ok" | "missing"`.
- `confirmAppointment(id, actor)` — sets `confirmed_at`/`confirmed_by`, returns the appointment. Returns `"missing"` when it no longer exists, `"already"` when already confirmed.
- `cancelAppointment(id, actor)` — deletes it and logs.
- `mirrorToJob(jobId)` — after any change, writes `leads.visit_at` from the **confirmed** consultation (or null) and `leads.install_on` from the **confirmed** install's Las Vegas date (or null). This is the single place the legacy columns are maintained.

## 5. Confirming

The server action `confirmSchedule(appointmentId)`:
1. `requireAdmin()` first.
2. Confirms the row.
3. Mirrors to the job's legacy columns.
4. Moves a `new` job to `visit_booked` when a **consultation** is confirmed — the automatic booking rule now fires on confirmation rather than on typing a date.
5. Syncs Outlook for that kind (`after()`, never throws, exactly as today).
6. Sends the customer email, and logs an `email` activity entry.
7. Refreshes the job page and the board.

Errors surface inline on the job page:
- No email address: "This job has no email address." The appointment is still confirmed and on the calendar; only the email is skipped, and the activity entry says so.
- Send rejected: "Confirmed, but the email could not be sent." The confirmation stands.

## 6. The customer email (`lib/appointments/send.ts`)

Plain text, same shape as the review email, using `RESEND_API_KEY`, `LEAD_FROM_EMAIL`, `from: "<business name> <from>"`, `replyTo: business.email`.

- Subject: `Your <kind> is booked for <Day, Mon D>` — for example "Your installation is booked for Tue, Oct 14".
- Body: greeting by first name, the date and time in Las Vegas ("Tuesday, October 14 at 2:00 PM", or just the date for an all-day install), the address we are coming to, one line per kind ("we'll take final measurements", "your installation", "we'll take a look at your treatments"), how to reach us to change it, and the business sign-off.
- `appointmentEmailText(input)` is exported separately so the wording is unit-tested without sending.

## 7. Calendar

- `Kind` in `lib/calendar/events.ts` becomes the four appointment kinds. `job_calendar_events` is already unique on `(lead_id, kind)`, so each kind gets its own Outlook event.
- Subjects: "Consultation · Name", "Measure · Name", "Install · Name", "Service · Name".
- Timed kinds are one hour by default and keep their Outlook length when moved, as visits do today. An `all_day` install stays all-day.
- `reconcileTargets` and the inbound Outlook sync keep working off `visit_at`/`install_on` for consultation and install. **Measure and Service sync outward only** in this change: an edit made in Outlook to those two is not read back. This is stated as a limitation rather than silently left ambiguous.

## 8. The job page

**Header.** The Schedule link becomes a **Schedule** button opening a dialog:
- "Date and time" (`datetime-local`), a "What is this for?" group of the four kinds with their icons, and Save.
- Saving books the appointment as pending and closes the dialog.
- The dialog is a `<dialog>` element driven by a small client component; the form posts a server action, so it works without JavaScript by falling back to a details/summary disclosure.

**Overview.** The four-card row becomes:
1. **Appointments** (spanning two columns) — one line per appointment: a coloured kind chip with its icon, the date and time, and the status. A pending one shows **Confirm schedule** and **Reschedule**; a confirmed one shows **Reschedule** and **Cancel**. Empty state: "Nothing scheduled" with a Schedule button.
2. **Measurements** — unchanged, keeping the "Add measurement" link and "View all".
3. **Order** — information only: "Ordered Tue, Oct 14" or "Not ordered", plus a link to the order paperwork when a document is attached to the job, and a note that this fills in automatically once Hunter Douglas is connected. No button; the date is still editable under Job details.

The **Money** strip is removed from the Overview. `MoneyStrip.tsx` is deleted. Quote, sold and deposit stay in `DetailsForm` and in the database.

`StatusCard` keeps its link-style actions for Measurements and gains an optional `children` slot so the Appointments card can render buttons.

## 9. Error handling

- Booking a date in the past is allowed (the owners sometimes record what already happened) but the dialog warns "That date has passed".
- Rescheduling a confirmed appointment clears its confirmation, removes it from Outlook and the legacy column until it is confirmed again, and logs "Install moved to … — pending confirmation".
- Confirming an appointment that was deleted in another tab: "That appointment no longer exists."
- The customer email failing never rolls back the confirmation.

## 10. Testing

**Unit (Vitest)**
- Migration 014 parses under the migrate.mjs rules, is re-runnable, has the kind check and the unique index, and its backfill is idempotent.
- `appointment-kinds.ts`: the four kinds, labels, guard, and complete literal styles.
- `saveAppointment`: replaces the same kind, always leaves it unconfirmed, logs the exact body.
- `confirmAppointment`: sets the stamp, refuses a missing row, is a no-op when already confirmed.
- `mirrorToJob`: only confirmed rows reach `visit_at`/`install_on`; clearing a confirmation clears the column.
- `confirmSchedule`: admin first; moves `new` → `visit_booked` only for a consultation; emails once; a missing email address confirms without sending; a send failure still leaves it confirmed.
- `appointmentEmailText`: per-kind wording, the Las Vegas date and time, all-day phrasing.
- The Schedule dialog: the four options, the default kind, and the pending state after saving.
- The Overview: no Money section, the Order tile has no button, Measurements keeps its link, and the Appointments card shows Confirm schedule only when pending.
- Calendar: subjects per kind, one-hour default, all-day install.

**End-to-end (Neon test branch, production build, desktop)**
- Book a consultation from the Schedule button, see "Pending confirmation", press Confirm schedule, see it confirmed, and see the stage move to Appointment booked.
- Update the existing specs that book a visit through Job details.

## 11. Out of scope

- The Hunter Douglas integration and reading order details from email.
- Removing the Money section from the board's side panel (that file is being changed in parallel; it follows separately).
- Mobile behaviour of the board tiles.
- Reading Measure and Service changes back from Outlook.
- More than one appointment of the same kind on a job.
