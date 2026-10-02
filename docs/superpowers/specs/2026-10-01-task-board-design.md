# Task board — design

Date: 2026-10-01 · Branch: `feat/task-board` · Migration: `032_tasks.sql`

## Goal

An internal task board in the admin. Anyone who can sign in (the owners and
anyone given access in Settings, e.g. Shade) can create a task, assign it to one
another, give it a due date, move it across a board, and email the assignee:
automatically on assignment, on demand with **Remind now**, and in a morning
digest of what is overdue or due soon.

Example: Joshua creates "Finish new flyers", assigns Shade, due Fri Oct 9, and
presses Remind now on Thursday.

## Out of scope

Start dates or ranges, links to jobs, drag and drop, per-task scheduled reminder
times, comments, attachments, multiple assignees, owner-only permissions.

## 1. Data

`db/migrations/032_tasks.sql`, safe to re-run (`create table if not exists`):

| Column | Type | Rule |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `title` | text not null | `length(btrim(title)) between 1 and 200` |
| `notes` | text null | |
| `status` | text not null default `'todo'` | check in (`todo`, `doing`, `done`) |
| `assignee_email` | text null | null = unassigned; check normalized (`= lower(btrim(...))`) when not null |
| `due_on` | date null | a calendar day in America/Los_Angeles |
| `created_by` | text not null | signed-in email |
| `created_at` / `updated_at` | timestamptz not null default now() | |
| `completed_at` | timestamptz null | set entering `done`, cleared leaving it |
| `last_reminded_at` | timestamptz null | last successful Remind now |
| `last_reminded_by` | text null | |

Index on `(status, due_on)`.

## 2. Who can do what

- Every signed-in admin can create, edit, reassign, move and delete any task.
- **Assignable people** = owners (`ADMIN_EMAILS`, via `parseAllowlist`) ∪
  `admin_access` emails. The server re-checks the chosen assignee with
  `isAllowed()` on every create/edit; an address that is not allowed is
  rejected with a form error, never saved. Exception: keeping a task's
  current assignee unchanged is always allowed, so a done task that still names
  someone who lost access can be edited without erasing that history.
- **Access removal unassigns.** `removeAdmin` (lib/admin/admin-access.ts) gains
  one more CTE step in its existing single statement:
  `update tasks set assignee_email = null, updated_at = now() where assignee_email in (select email from removed) and status <> 'done'`.
  Done tasks keep the name as history.

## 3. Emails

All plain text through Resend (`RESEND_API_KEY`), from
`${business.name} <LEAD_FROM_EMAIL>` like the follow-up digest. Every email
links to `${adminOrigin()}/admin/tasks/<id>`.

### 3.1 Assignment

Sent after a save when the assignee **changed to a non-null address that is not
the person saving** (create counts as a change from null). Editing other fields
never re-sends.

- Subject: `<Actor name> assigned you: <title>`
- Body: due date (`Due Fri, Oct 9` or `No due date`), notes if any, link.

Actor name comes from one helper, `displayName(email)`, that title-cases the
email's local part split on `.`/`_`/`-` ("joshua.whirley@…" → "Joshua
Whirley", "shade@…" → "Shade"). All three emails and the UI use it.

### 3.2 Remind now

Button on any task that has an assignee and is not done.

- Subject: `Reminder from <Actor name>: <title>`
- Body: due line (`Due Fri, Oct 9`, `Due today`, or `Overdue by 2 days`),
  notes, link.
- `replyTo` = the presser's email.
- **10-minute lock, enforced in SQL.** One statement claims the slot:
  `update tasks set last_reminded_at = now(), last_reminded_by = $actor where id = $id and assignee_email is not null and status <> 'done' and (last_reminded_at is null or last_reminded_at < now() - interval '10 minutes') returning ...`.
  No row returned → "Already reminded at 10:42 AM." ("That task is already
  done." / "Assign the task to someone first." / "That task was deleted.") and
  no email. If the send then fails, the claim is rolled
  back by restoring the previous `last_reminded_at`/`last_reminded_by` with a
  guarded update (`where id = $id and last_reminded_at = $claimedAt`), so the
  card never shows a reminder that was not delivered.
- Card shows `Reminded Thu, Oct 1, 10:42 AM` (`formatWhen`).

### 3.3 Morning digest

New cron route `app/api/cron/tasks/route.ts`, same `CRON_SECRET` bearer check
as `/api/cron/follow-ups`, added to `vercel.json` at `0 14 * * *` (7am PDT /
6am PST).

- Today/tomorrow computed in America/Los_Angeles.
- Selects tasks with `status <> 'done'`, `assignee_email is not null`,
  `due_on <= tomorrow`.
- Groups by assignee; one email each with sections **Overdue**, **Due today**,
  **Due tomorrow** (empty sections omitted). People with none get nothing.
- Subject: `Your tasks for Thu, Oct 1, 2026: 3` (`formatDay`, as the follow-up digest)
- Returns `{ sent, failed, error? }`; one person's failed send does not stop
  the others; status 500 when any failed.

### 3.4 Failures

- A task save never depends on email. If the assignment email fails the action
  returns a notice: "Saved, but the email to Shade didn't send."
- Missing `RESEND_API_KEY` is treated as a failed send with that same notice.
- Remind now failure: "The reminder didn't send. Try again." and the claim is
  undone (3.2).

## 4. Board UI

- Nav: **Tasks** link between Schedule and Documents in `app/admin/AdminNav.tsx`.
- `/admin/tasks`:
  - **Everyone / Mine** toggle in the URL (`?view=mine`); default Everyone.
  - Collapsed **New task** form: title, assignee (defaults to the signed-in
    person; includes "Unassigned"), due date, notes.
  - Columns **To do · In progress · Done**; stacked on phones.
  - Open columns sort: overdue first, then `due_on` ascending, then no date,
    ties by `created_at`. Done shows `completed_at` within the last 14 days,
    newest first.
  - Card: title, assignee initials or "Unassigned", due date (red when overdue,
    amber when due today), status `<select>` that saves on change
    (`SubmitOnChange` precedent), Remind button, last-reminded line.
- `/admin/tasks/[id]`: edit all fields, created by/at, last reminded, delete
  with a confirm step. Unknown or malformed id → `notFound()`.
- Server actions in `app/admin/tasks/actions.ts`, each re-checking the session;
  data access in `lib/admin/tasks.ts`; email in `lib/admin/task-emails.ts`;
  validation in `lib/admin/task-schema.ts` (zod, matching existing schemas).

## 5. Testing

- Unit (vitest): `displayName`; assignment/reminder/digest wording; digest
  grouping incl. Pacific-time edges (11:30pm PT the day before, DST change);
  "assigned to yourself sends nothing"; "editing title doesn't re-send";
  schema limits; board sort and 14-day Done cut-off.
- Real SQL on a Neon test branch: status check, title check, the 10-minute
  claim (second claim inside 10 minutes returns no row, after returns one),
  claim rollback, `removeAdmin` unassigning open but not done tasks, migration
  re-run is a no-op.
- E2E (against `next start` on 127.0.0.1 + test branch): create → assign →
  move to In progress → Remind now → second press shows "Already reminded".
- Test power: for each guard (self-assign skip, 10-minute lock, unassign on
  removal, overdue colouring) delete it and see the test go red.

## 6. Ship

Worktree `feat/task-board`. Migration proven twice on a branch, applied to
production (`ep-cold-term`) before pushing to main (push deploys). Commits
authored by whirleyjoshua@gmail.com.
