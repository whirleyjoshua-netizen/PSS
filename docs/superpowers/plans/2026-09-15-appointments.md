# Appointments, Confirmation and the Job Page Tidy-up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Schedule button books Consultation / Measure / Install / Service appointments; each stays pending until **Confirm schedule**, which puts it on the shared calendar and emails the customer. The job page's Visit and Install cards become an Appointments card, Order becomes an information tile, and the Money strip goes.

**Architecture:** A new `appointments` table is the source of truth (one row per job per kind). `leads.visit_at` / `leads.install_on` remain as **mirrors of the confirmed** consultation and install, maintained by `mirrorToJob` in TypeScript, so the Schedule page, Outlook sync, review timing and the customer portal keep working untouched. The Outlook `Kind` union grows to the four appointment kinds; inbound Outlook edits write the appointment first, then mirror.

**Tech Stack:** Next.js App Router (this repo's version — read `node_modules/next/dist/docs/` before using any Next API), React server components + server actions with `useActionState`, zod, Tailwind v4 tokens, Neon Postgres via `db()`, Resend, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-appointments-design.md`

## Global Constraints

- Kinds and labels: `consultation` "Consultation", `measure` "Measure", `install` "Install", `service` "Service". Exactly one row per job per kind.
- A saved appointment is **always unconfirmed**. Only `confirmSchedule` sets `confirmed_at`.
- **Only confirmed** appointments mirror to `leads.visit_at` / `leads.install_on`, reach Outlook, move the stage, or reach the customer.
- Rescheduling a confirmed appointment clears its confirmation (and therefore its mirror and its Outlook event) until it is confirmed again.
- Activity bodies, exactly: `"<Kind> set for <when> — pending confirmation"`, `"<Kind> confirmed for <when>"`, `"<Kind> moved to <when> — pending confirmation"`, `"<Kind> cancelled"`, and for the email `"Appointment email sent to <email>"`.
- Every server action calls `requireAdmin()` before reading input.
- Tailwind class names are complete literals; never built by concatenation.
- Migrations: idempotent, whole-line `--` comments only, no `;` inside comments.
- Unit tests: `npx vitest run --maxWorkers=2 <paths>` — never alongside typecheck/lint/build (memory is tight; `measure-form` and `consultation-form` time out under load and pass alone). Typecheck `npm run typecheck` (run `npx next typegen` once first in a fresh worktree). Lint `npm run lint`. Build `npm run build`.
- Never run `scripts/migrate.mjs`, Playwright, or anything against a database: `.env.local` holds PRODUCTION credentials. The controller runs e2e against a Neon test branch.
- Never use `git stash`. Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JYGrNPPExoH7wwLxH3AEZk
  ```

## Cross-cutting note for every task

`lib/calendar/sync.ts` was being edited by another agent in the main checkout when this plan was written. Before editing it (Task 2), run `git log --oneline -3 -- lib/calendar/sync.ts` and read the current file; if it no longer matches the shape described here, report NEEDS_CONTEXT rather than guessing.

---

### Task 1: The appointments table and module

**Files:**
- Create: `db/migrations/014_appointments.sql`, `lib/admin/appointment-kinds.ts`, `lib/admin/appointments.ts`, `tests/db/migration-014.test.ts`, `tests/admin/appointments.test.ts`, `tests/admin/appointment-kinds.test.ts`
- Modify: `components/admin/icons.tsx` (add `ruler`), `app/globals.css` (four `--color-appt-*` tokens)

**Interfaces (Produces):**
- `appointment-kinds.ts` (client-safe, no server-only, no db): `APPOINTMENT_KINDS` (4 entries `{ value, label, icon }`), `type AppointmentKind`, `isAppointmentKind`, `kindLabel(kind)`, `APPOINTMENT_STYLE: Record<AppointmentKind, { icon: IconName; tint: string; edge: string; left: string }>` with complete literal classes.
- `appointments.ts` (`import "server-only"`): `type Appointment = { id: string; jobId: string; kind: AppointmentKind; startsAt: Date; allDay: boolean; confirmedAt: Date | null; confirmedBy: string | null }`; `listAppointments(jobId)`; `saveAppointment(jobId, kind, startsAt, allDay, actor): Promise<"ok" | "missing">`; `confirmAppointment(id, actor): Promise<Appointment | "missing" | "already">`; `cancelAppointment(id, actor): Promise<Appointment | "missing">`; `mirrorToJob(jobId): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`tests/db/migration-014.test.ts` — statements parse under the migrate.mjs rules (strip whole-line `--`, split on `;`); the table is `create table if not exists appointments`; `appointments_kind_check` is dropped then added with `kind in ('consultation','measure','install','service')`; a unique index `appointments_lead_kind_key` on `(lead_id, kind)` created `if not exists`; the two backfill inserts use `where not exists`, so re-running inserts nothing; every statement matches `/^(create table if not exists|create unique index if not exists|alter table appointments (drop constraint if exists|add constraint)|insert into appointments)/`.

`tests/admin/appointment-kinds.test.ts` — the four values/labels in order; `isAppointmentKind` accepts the four and rejects `"visit"`; every style has an icon and `text-`/`border-t-`/`border-l-` literals.

`tests/admin/appointments.test.ts` (copy the db mock shape from `tests/admin/jobs.test.ts`: `const sql = Object.assign(vi.fn(), { query: vi.fn() })`, helper `text(call)`, `beforeEach` resets both):
- `listAppointments` orders by `starts_at` and maps rows (including `confirmedAt: null`).
- `saveAppointment` upserts on `(lead_id, kind)`, always writes `confirmed_at = null`, and logs the exact "set for … — pending confirmation" body; a second save for the same kind replaces rather than inserting.
- `saveAppointment` returns `"missing"` for a non-UUID job id without touching the database.
- `confirmAppointment` sets `confirmed_at`/`confirmed_by`, returns the row; `"missing"` when no row; `"already"` when `confirmed_at` was set.
- `cancelAppointment` deletes and logs.
- `mirrorToJob` writes `visit_at` from the confirmed consultation and `install_on` from the confirmed install's Las Vegas date, and writes `null` for a kind that is absent or unconfirmed — assert the SQL names both columns and that an unconfirmed row does not reach them.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`db/migrations/014_appointments.sql`:
```sql
-- Appointments: one row per job per kind, pending until confirmed.
-- Every statement is safe to re-run. leads.visit_at and leads.install_on stay as mirrors of the confirmed rows.

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

alter table appointments drop constraint if exists appointments_kind_check;

alter table appointments add constraint appointments_kind_check check (
  kind in ('consultation','measure','install','service')
);

create unique index if not exists appointments_lead_kind_key on appointments (lead_id, kind);

-- Backfill the dates the tracker already holds, as confirmed appointments. Re-running inserts nothing.

insert into appointments (lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by)
select id, 'consultation', visit_at, false, now(), 'backfill' from leads l
 where visit_at is not null
   and not exists (select 1 from appointments a where a.lead_id = l.id and a.kind = 'consultation');

insert into appointments (lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by)
select id, 'install', (install_on::text || ' 08:00')::timestamp at time zone 'America/Los_Angeles', true, now(), 'backfill' from leads l
 where install_on is not null
   and not exists (select 1 from appointments a where a.lead_id = l.id and a.kind = 'install');
```

`lib/admin/appointment-kinds.ts` — follow `lib/admin/team-roles.ts` exactly in shape:
```ts
import type { IconName } from "@/components/admin/icons";

/** The kinds of appointment a job can hold, one of each at a time. Safe to import from client components. */
export const APPOINTMENT_KINDS = [
  { value: "consultation", label: "Consultation", icon: "calendar" },
  { value: "measure", label: "Measure", icon: "ruler" },
  { value: "install", label: "Install", icon: "wrench" },
  { value: "service", label: "Service", icon: "phone" },
] as const satisfies readonly { value: string; label: string; icon: IconName }[];

export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number]["value"];

export const isAppointmentKind = (value: unknown): value is AppointmentKind =>
  APPOINTMENT_KINDS.some((kind) => kind.value === value);

const KIND_LABELS: { [K in AppointmentKind]: Extract<(typeof APPOINTMENT_KINDS)[number], { value: K }>["label"] } = {
  consultation: "Consultation", measure: "Measure", install: "Install", service: "Service",
};
export const kindLabel = (kind: AppointmentKind): string => KIND_LABELS[kind];

/** Complete literal class names so Tailwind generates them; never build these by concatenation. */
export const APPOINTMENT_STYLE: Record<AppointmentKind, { icon: IconName; tint: string; edge: string; left: string }> = {
  consultation: { icon: "calendar", tint: "text-appt-consult", edge: "border-t-appt-consult", left: "border-l-appt-consult" },
  measure: { icon: "ruler", tint: "text-appt-measure", edge: "border-t-appt-measure", left: "border-l-appt-measure" },
  install: { icon: "wrench", tint: "text-appt-install", edge: "border-t-appt-install", left: "border-l-appt-install" },
  service: { icon: "phone", tint: "text-appt-service", edge: "border-t-appt-service", left: "border-l-appt-service" },
};
```

`app/globals.css` — beside the stage tokens: `--color-appt-consult: #5B8DB8;` `--color-appt-measure: #8A6A9E;` `--color-appt-install: #C98A2E;` `--color-appt-service: #3F7D6B;`

`components/admin/icons.tsx` — add to `PATHS`: `ruler: "M3 14l7-7 7 7-7 7zM8 9l2 2M11 6l2 2M14 9l2 2"` (a plain stroke ruler; adjust only if it renders badly at 16px).

`lib/admin/appointments.ts` — `import "server-only"`, `db()` from `@/lib/db`, `isUuid` from `@/lib/admin/jobs`, `lasVegasDate` from `@/lib/admin/time`. Each write logs a `job_events` row in the same statement (the `assignJob` pattern in `lib/admin/jobs.ts` is the model). `mirrorToJob`:
```ts
/** The one place leads.visit_at / leads.install_on are maintained: mirrors of the CONFIRMED rows. */
export async function mirrorToJob(jobId: string): Promise<void> {
  if (!isUuid(jobId)) return;
  await db()`
    update leads set
      visit_at = (select a.starts_at from appointments a
                   where a.lead_id = ${jobId} and a.kind = 'consultation' and a.confirmed_at is not null),
      install_on = (select (a.starts_at at time zone 'America/Los_Angeles')::date from appointments a
                     where a.lead_id = ${jobId} and a.kind = 'install' and a.confirmed_at is not null),
      updated_at = now()
    where id = ${jobId}`;
}
```

- [ ] **Step 4: Focused tests, then the full suite once, typecheck, lint.**
- [ ] **Step 5: Commit** — `feat: appointments table and module`

---

### Task 2: Outlook sync for four kinds

**Files:**
- Modify: `lib/calendar/events.ts`, `lib/calendar/sync.ts`, `lib/calendar/store.ts`, `tests/calendar/events.test.ts`, `tests/calendar/sync.test.ts`, `tests/calendar/store.test.ts`
- Test: also `tests/calendar/labels.test.ts` if it enumerates kinds

**Interfaces:**
- Consumes: `AppointmentKind`, `kindLabel` (Task 1).
- Produces: `Kind = AppointmentKind` in `lib/calendar/events.ts`; `newEventBody`/`movedTimes`/`trackerValue`/`sameValue` accept all four; `store.setJobDate` writes the **appointment** then mirrors.

**Read first:** `git log --oneline -3 -- lib/calendar/sync.ts` and the current file (another agent was editing it). If it differs from what follows, report NEEDS_CONTEXT.

- [ ] **Step 1: Write the failing tests**
- `events.test.ts`: `newEventBody("measure", …)` subject is `Measure · <name>`; `service` is timed one hour; an `allDay` install keeps midnight-to-next-midnight; a timed install is one hour.
- `sync.test.ts`: `reconcileJob` iterates all four kinds; a job with a confirmed measure creates an event with the measure subject; `isPast` treats a timed kind by instant and an all-day install by Las Vegas date.
- `store.test.ts`: `setJobDate("measure", …)` updates that job's measure appointment and does **not** touch `visit_at`/`install_on`; `setJobDate("consultation", …)` updates the appointment and then the mirror.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**
- `events.ts`: `export type Kind = AppointmentKind`. `newEventBody(kind, job, value, jobUrl, allDay)` — subject `${kindLabel(kind)} · ${job.name}`; timing chosen by `allDay` rather than by kind. `movedTimes`, `trackerValue` and `sameValue` branch on `allDay` instead of `kind === "install"`; keep their current behaviour for the all-day case.
- `sync.ts`: `const KINDS: Kind[] = APPOINTMENT_KINDS.map((k) => k.value)`; replace `LABEL` with `kindLabel`; replace the line-44 ternary with a lookup of that kind's **confirmed** appointment (fetch them once per job via `store.getCalendarJob`, extended to return its appointments); `isPast` branches on the appointment's `allDay`.
- `store.ts`: `getCalendarJob` also returns the job's confirmed appointments. `setJobDate(leadId, kind, value, note)` updates the matching appointment row (or deletes it when `value` is null) and then calls the same mirror SQL, so an Outlook edit cannot be overwritten by the next mirror. `reconcileTargets` gains `union select lead_id from appointments where starts_at >= now() - interval '30 days'`.
- Inbound Outlook edits are applied for every kind that has a link; the spec's limitation (measure/service are not read back) is satisfied naturally only if no link exists — do NOT special-case it, simply let the generic path work.

- [ ] **Step 4: Focused tests, full suite, typecheck, lint.**
- [ ] **Step 5: Commit** — `feat: Outlook events for every appointment kind`

---

### Task 3: The customer confirmation email

**Files:**
- Create: `lib/appointments/send.ts`, `tests/appointments/send.test.ts`
- Modify: none

**Interfaces:**
- Produces: `appointmentEmailText({ firstName, kind, startsAt, allDay, address }): string`; `sendAppointmentConfirmation(job: Job, appointment: Appointment): Promise<void>` (throws on missing config, missing email, or a rejected send).

- [ ] **Step 1: Write the failing tests** — model them on `tests/reviews/send.test.ts`:
- The text greets by first name, names the kind in customer words ("consultation", "measurement visit", "installation", "service visit"), shows the Las Vegas day and time ("Tuesday, October 14 at 2:00 PM"), and shows only the day for an all-day install.
- It includes the address and the business phone, and never includes internal words like "pending" or a job id.
- `sendAppointmentConfirmation` throws "This job has no email address" without an email, and throws when `RESEND_API_KEY` is missing.
- The Resend call uses `from: "<business name> <LEAD_FROM_EMAIL>"`, `replyTo: business.email`, and the subject `Your <kind word> is booked for <Day, Mon D>`.

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — copy the structure of `lib/reviews/send.ts` exactly (server-only, Resend, env guards, exported text builder).
- [ ] **Step 4: Focused tests, full suite, typecheck, lint.**
- [ ] **Step 5: Commit** — `feat: appointment confirmation email`

---

### Task 4: Actions — book, confirm, reschedule, cancel

**Files:**
- Create: `app/admin/jobs/appointment-actions.ts`, `tests/admin/appointment-actions.test.ts`
- Modify: `lib/admin/schema.ts` (`appointmentSchema`), `tests/admin/schema.test.ts`

**Interfaces:**
- Consumes: Task 1's module, Task 2's `syncJobCalendar`, Task 3's sender.
- Produces: `bookAppointment(jobId, prev, formData): Promise<FormState>`; `confirmSchedule(appointmentId, jobId): Promise<FormState>`; `cancelAppointmentAction(appointmentId, jobId): Promise<FormState>`.

- [ ] **Step 1: Write the failing tests** (mock `@/lib/admin/appointments`, `@/lib/appointments/send`, `@/lib/calendar/sync`, `@/lib/admin/jobs`, `next/cache`; follow `tests/admin/actions.test.ts` for the ordering-array trick):
- Each action calls `requireAdmin()` before anything else.
- `bookAppointment` validates with `appointmentSchema` ("Pick a date and time", "Pick what this is for"), saves as pending, mirrors, and does **not** email or sync.
- `confirmSchedule`: confirms, mirrors, syncs that kind, emails once, logs; a **consultation** confirmation moves a `new` job to `visit_booked` and nothing else does; an already-confirmed row returns without a second email.
- A job with no email address still confirms and returns `{ error: "This job has no email address." }`.
- A rejected send returns `{ error: "Confirmed, but the email could not be sent." }` and the confirmation stands (assert `confirmAppointment` was called and not rolled back).
- `cancelAppointmentAction` deletes, mirrors, and syncs so the Outlook event goes.

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — `appointmentSchema`: `startsAt` a non-empty `datetime-local` string parsed with `fromLocalInput`, `kind` a `z.enum` of the four values, `allDay` an optional checkbox. Actions mirror the shape of `app/admin/jobs/actions.ts` (`FormState`, `captureValues`, `refresh(id)`), and use `after()` for the Outlook sync exactly as `moveStage` does.
- [ ] **Step 4: Focused tests, full suite, typecheck, lint.**
- [ ] **Step 5: Commit** — `feat: book, confirm and cancel appointments`

---

### Task 5: The job page

**Files:**
- Create: `app/admin/jobs/[id]/ScheduleDialog.tsx`, `app/admin/jobs/[id]/AppointmentsCard.tsx`, `tests/admin/schedule-dialog.test.tsx`, `tests/admin/appointments-card.test.tsx`
- Modify: `app/admin/jobs/[id]/JobHeader.tsx`, `app/admin/jobs/[id]/OverviewTab.tsx`, `app/admin/jobs/[id]/OverviewCards.tsx` (`StatusCard` gains `children`), `app/admin/jobs/[id]/DetailsForm.tsx`, `app/admin/jobs/[id]/page.tsx` (load appointments), `lib/admin/jobs.ts` (`updateDetails` loses its visit auto-booking), `app/admin/jobs/actions.ts` (`saveDetails` no longer passes visit/install), `lib/admin/schema.ts` (`detailsSchema` loses `visitAt`/`installOn`)
- Delete: `app/admin/jobs/[id]/MoneyStrip.tsx`, `tests/admin/overview-money-next.test.tsx` (money half) — keep any non-money assertions by moving them
- Test: `tests/admin/job-header.test.tsx`, `tests/admin/overview-tab.test.tsx`, `tests/admin/job-page*.test.tsx`, `tests/admin/details-form.test.tsx`, `tests/admin/jobs.test.ts`, `tests/admin/actions.test.ts`

**This task removes the "typing a visit date books the appointment" rule** (spec §5: the stage now moves on confirmation). Delete that branch from `updateDetails`, its tests, and the `visitAtLoaded`/`installOnLoaded` hidden fields, since the form no longer owns those dates.

- [ ] **Step 1: Write the failing tests**
- `ScheduleDialog`: a **button** labelled "Schedule" (not a link); opening shows "Date and time" and a "What is this for?" group with the four kinds; the default kind is Consultation; submitting calls `bookAppointment`.
- `AppointmentsCard`: a pending appointment shows its coloured kind chip, the formatted time, "Pending confirmation", and buttons "Confirm schedule" and "Reschedule"; a confirmed one shows "Confirmed" with "Reschedule" and "Cancel" and no Confirm button; the empty state says "Nothing scheduled".
- `OverviewTab`: no element with the accessible name "Money"; the Order card has no button and shows "Ordered <date>" or "Not ordered"; Measurements still has the "Add measurement" link; the Appointments card is present.
- `DetailsForm`: no "Visit date and time" or "Install date" fields; Order date and the three money fields remain.
- `jobs.test.ts`: `updateDetails` no longer moves a `new` job to `visit_booked`.

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — `ScheduleDialog` is a client component using a native `<dialog>`; the trigger is a `<button>` styled with the existing `ACTION_LINK` classes so the header looks unchanged. Without JavaScript the dialog degrades to a `<details>` disclosure containing the same form. `AppointmentsCard` is a server component; its buttons post server actions bound to the appointment id. `StatusCard` gains an optional `children` rendered under the value.
- [ ] **Step 4: Focused tests, full suite, typecheck, lint, build.**
- [ ] **Step 5: Commit** — `feat: Schedule dialog, Appointments card, and a tidier Overview`

---

### Task 6: End-to-end and full verification

**Files:**
- Create: `e2e/appointments.spec.ts`
- Modify: `playwright.config.ts` (append `,e2e-appt-owner@example.com` to the e2e ADMIN_EMAILS; add `appointments` to the mobile `testIgnore`), `e2e/stages.spec.ts` (its first test books a visit through Job details — rewrite it to book and confirm a consultation through the Schedule dialog)

SCOPE: write the specs and run the local checks only. Do NOT run Playwright, migrations, or a deploy — the controller does that.

- [ ] **Step 1: Write the spec** — copy the helper shape from `e2e/stages.spec.ts` (serial, `E2E_POSTGRES_URL` skip, `signIn` asserting `{ name: "Jobs", exact: true }`, `lead()`, `afterAll` deleting by name prefix plus the owner's tokens and sessions; also delete `appointments` rows via the job cascade). One test: open a job, click **Schedule**, pick a date/time and **Measure**, save, see "Pending confirmation"; press **Confirm schedule**; see "Confirmed"; assert in SQL that `appointments.confirmed_at` is set. A second test: book and confirm a **Consultation** on a `new` lead and assert the stage moved to Appointment booked.
- [ ] **Step 2: Unit suite, typecheck, lint, build; `npx playwright test --list` shows the new desktop-only spec.**
- [ ] **Step 3: Commit** — `test: e2e for appointments and confirmation`
- [ ] **Step 4: E2E (controller):** Neon test branch, migrate, full desktop run, delete the branch.
- [ ] **Step 5: Release (owner approval required):** migrate production (014) **before** deploying, `vercel --prod`, then check the Schedule dialog and Confirm schedule on the live site.
