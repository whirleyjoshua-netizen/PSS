# Contacted stage — design

Date: 2026-10-01 · Branch: `feat/contacted-stage` · Migration: `033_contacted_stage.sql`

## Goal

Bring back a **Contacted** stage between New lead and Appointment booked. Reaching a
new lead moves it to Contacted; booking it moves it to Appointment booked. The owners
removed this stage on 2026-09-15 (spec `2026-09-15-stages-contact-log-design.md`) and,
after walking the flow, want it back. That spec's "contact log never moves the stage"
rule is superseded here for New leads only.

## 1. Stage

- Order: `new` → `contacted` → `visit_booked` → `quoted` → … (the rest unchanged), plus `lost`.
- Label "Contacted". Color token `--color-stage-contacted: #6F8F72` (sage, as before; edges/dots
  only, never text). Icon `phone`.
- It is a board column (`BOARD_STAGES`), a working stage (`WORKING_STAGES`), in the stepper, the
  new-job form, the Change stage list and the job list filter (all follow `STAGES`).
- `RETIRED_LABELS` drops `contacted` (it is live again).

## 2. Database

- `033_contacted_stage.sql` redefines `leads_status_check` with the full list including
  `contacted`, in the app's order. 002, 011, 012 and 030 get the same full list (migrate.mjs
  re-applies every file; `migration-checks-consistent` requires identical definitions).
- **011's `update leads set status = 'new' where status = 'contacted'` is removed.** migrate.mjs
  re-runs it on every migration; left in, it would silently reset every Contacted client to New.
  Its comment is updated to say why it is gone.
- No data changes. No other table changes.

## 3. Ways in (only from `new`; never backwards)

- **Mark contacted** (`addContact`): one statement inserts the `contact` event and, when the job is
  `new`, moves it to `contacted` with the usual `stage` event (`from new to contacted`, no body).
  On any other stage it only logs the contact, as today.
- **Call logged "Talked, no visit yet"**: `callStageMove("talked")` → `{ to: "contacted", from: ["new"] }`.
  `no_answer` never moves.

## 4. Ways out

- **Booked** call: `callStageMove("booked")` → `{ to: "visit_booked", from: ["new", "contacted"] }`.
- **Confirming a consultation** (`confirmAppointmentAction`): moves to `visit_booked` when the job is
  `new` or `contacted`.
- **Quote sent** (`lib/dc/send.ts`) and **contract signed** (`lib/portal/sign.ts`): their "stages before"
  lists gain `contacted`, so a Contacted job jumps forward exactly as a New one does.
- Manual Change stage works as today.

## 5. Overdue

- `OVERDUE_DAYS.contacted = 3`.
- A Contacted job is not overdue while a call-back is set for later (`followUpAt > now`).
- `isOverdue`'s input gains `followUpAt`. New's rule is unchanged.

## 6. UI copy

- `ContactLog`'s doc comment: it moves a New lead to Contacted. After saving on a New lead the page
  shows the new stage (revalidation already covers `/admin` and the job page).

## 7. Unchanged

"Last contacted" line, call-back reminders and digest, Google Ads booked conversion
(`BOOKED_OR_LATER` starts at `visit_booked`), the client portal (shows Quoted onward), analytics.

## 8. Testing

- Unit: stage order and labels; migration files (033 shape, 011 has no reset, all five status
  lists identical and include contacted); `callStageMove`; `addContact` SQL text; appointment
  confirm from contacted; sign/send lists include contacted; overdue (3 days, call-back later
  suppresses, call-back passed does not).
- Real database (Neon test branch, `scripts/verify-contacted.ts`): migrate twice and a contacted
  row survives the re-run; `addContact` on New moves once with one stage event, on Contacted/Quoted
  logs only; `logCall` talked/booked moves as above; a raw `status='contacted'` insert is accepted.
- E2E: mark a New lead contacted → Contacted column; confirm its consultation → Appointment booked.

## 9. Ship

Migration 033 (and the edited 011) applied to production before the push. Prove on a branch twice
first. Commits authored whirleyjoshua@gmail.com.
