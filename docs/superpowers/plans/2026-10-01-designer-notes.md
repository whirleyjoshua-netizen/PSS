# Designer Notes in Outlook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shade writes designer notes per appointment (and sees and fixes the client's gate code) in the scheduler, and both appear in the confirmed appointment's Outlook event body, kept current by later edits without churning Outlook.

**Architecture:** A new `appointments.designer_notes` column (per appointment) and the existing `leads.gate_code` (per client) are written by the booking statement and by a new notes-only statement that never un-confirms. The Outlook event body becomes `eventText()` in `lib/calendar/events.ts` (gate code, designer notes, then today's lines). The reconcile in `lib/calendar/sync.ts` PATCHes the body only when `bodyHash(eventText(...))` differs from `job_calendar_events.body_hash`, which it stores with the returned changeKey. Every gate-code edit point and the new "Edit notes" action call the existing `syncJobCalendar`.

**Tech Stack:** Next.js 16 App Router (server actions, `after()`), React 19 (`useActionState`), Neon Postgres through `db()` tagged templates, zod 4, Vitest + Testing Library, Playwright, Microsoft Graph (mocked in unit tests).

**Spec:** `docs/superpowers/specs/2026-10-01-designer-notes-design.md`

## Global Constraints

- Work only in `/Users/jenniferjordan/pss/.claude/worktrees/designer-notes` (branch `feat/designer-notes`). Before editing, confirm `git rev-parse --show-toplevel` prints that path.
- Migration file is exactly `db/migrations/035_designer_notes.sql` (034 belongs to another session). Every statement is re-runnable: `add column if not exists`; a check is `drop constraint if exists` then `add constraint`. Whole-line `--` comments only, and no semicolons in comments (`scripts/migrate.mjs` splits on `;` and re-runs every file).
- No data backfill. Nothing existing changes meaning.
- Notes are **per appointment** (`appointments.designer_notes`, optional, max 2000 characters). The gate code stays **per client** (`leads.gate_code`, the existing `gateCodeField` rules: trimmed, max 40, blank is null).
- A multi-table write is ONE data-modifying CTE per statement. Never two `db()` calls for one write, never `sql.transaction()`.
- `lib/admin/appointments.ts` must never import from `lib/calendar` (pinned by `tests/admin/appointments.test.ts` "module boundaries").
- Only confirmed appointments reach Outlook (unchanged).
- Event body, plain text, in this order: `Gate code: <code>` (only when set); `Designer notes:` then the notes (only when set); a blank line; then today's lines unchanged (phone, email, interested in, blank line, `Open the job: <link>`). Subject, location, timing and one-event-per-kind are unchanged.
- Body change detection uses `job_calendar_events.body_hash` = sha256 hex (`node:crypto`) of the exact text body we send. Never compare the body Graph returns (it may be HTML).
- The Outlook-newer rule stays: when Outlook has a newer changeKey and the tracker pushed nothing in that pass, the tracker sends nothing back in that pass. A pending body change goes on a later pass because its hash still differs.
- Editing notes never un-confirms an appointment. Rescheduling still un-confirms (as today) and keeps the notes the dialog sends.
- The gate code and the designer notes never go into `job_events` bodies, the customer portal or customer emails.
- Unit tests: `npx vitest run --maxWorkers=2 <files>`. Typecheck: `npx tsc --noEmit` (if the only errors are in generated Next types, such as `Cannot find name 'LayoutProps'`, run `npx next typegen` first). Lint changed files by path: `npx eslint <files>`.
- Never print a connection string (`E2E_POSTGRES_URL`, `DATABASE_URL`, `POSTGRES_URL`). Name endpoints by their `ep-…` id only.
- Commits use the repo identity (`git config user.email` is `whirleyjoshua@gmail.com`). Every commit message ends with a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (the `git commit -m "<subject>" -m "Co-Authored-By: …"` form in each task does this).
- This is Next.js 16 (see `AGENTS.md`). The plan only reuses patterns already in the repo (server actions with `useActionState`, `after()` from `next/server`); if you need any other Next API, read `node_modules/next/dist/docs/` first.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `db/migrations/035_designer_notes.sql` (new) | `appointments.designer_notes` + length check, `job_calendar_events.body_hash` | 1 |
| `lib/admin/appointments.ts` | `Appointment.designerNotes`, `AppointmentDetails`, `saveAppointment` saves notes + gate code, new `setAppointmentNotes` | 1 |
| `lib/calendar/events.ts` | `EventJob.gateCode`, `eventText()`, `bodyHash()`, `newEventBody(…, designerNotes)` | 2 |
| `lib/calendar/store.ts` | `getCalendarJob` reads gate code + per-kind notes (Task 2); `Link.bodyHash` read/write (Task 3) | 2, 3 |
| `lib/calendar/sync.ts` | create stores the body hash; reconcile PATCHes the body when the hash differs | 3 |
| `lib/admin/schema.ts` | `designerNotesField`, `appointmentSchema` carries notes + gate code, `appointmentNotesSchema` | 4 |
| `app/admin/jobs/appointment-actions.ts` | `bookAppointment` passes notes + gate code; new `updateAppointmentNotes` | 4 |
| `lib/admin/jobs.ts` | `updateDetails` reports `gateCodeChanged` | 4 |
| `app/admin/jobs/actions.ts` | `saveDetails` syncs when the gate code changed | 4 |
| `app/(site)/thank-you/actions.ts` | the questionnaire syncs after a save | 4 |
| `app/admin/jobs/[id]/modal.ts` (new) | shared `<dialog>` open/close helpers | 5 |
| `app/admin/jobs/[id]/ScheduleDialog.tsx` | gate code field at the top, designer notes textarea, reschedule prefill | 5 |
| `app/admin/jobs/[id]/JobHeader.tsx`, `OverviewTab.tsx` | pass the client's gate code down | 5 |
| `app/admin/jobs/[id]/AppointmentsCard.tsx` | passes gate code + notes to the dialogs (Task 5); shows notes, Edit notes (Task 6) | 5, 6 |
| `app/admin/jobs/[id]/NotesDialog.tsx` (new) | "Edit notes" modal | 6 |
| `scripts/verify-designer-notes.ts` + `.config.mts` (new) | manual real-database proof | 7 |
| `e2e/appointments.spec.ts` | one journey: book with notes + gate code, confirm, Edit notes stays confirmed | 7 |

## Review Focus

The riskiest behaviours. Every reviewer checks these:

1. **Body churn.** The reconcile must PATCH the body only when `bodyHash(eventText(job, notes, jobUrl(job.id)))` differs from the stored `link.bodyHash`. It must never compare the body Graph returns. An up-to-date event must produce exactly one GET and no PATCH (see `tests/calendar/sync.test.ts` "sends no body when the stored hash matches"). A null-hash legacy event gets exactly one body PATCH, then none.
2. **Un-confirm on a notes edit.** `setAppointmentNotes` must not touch `confirmed_at`/`confirmed_by` (or `appointments.updated_at`, which the route planner's `SAVE_GUARD` in `lib/routes/day.ts` reads). `updateAppointmentNotes` must not call `saveAppointment`, `mirrorToJob` or the email.
3. **The gate code leaking.** It must not appear in any `job_events` body (booking, notes edit, Details, questionnaire), the portal or customer emails. `confirmAppointment`/`cancelAppointment` still return rows without notes, and the email uses explicit fields only (`lib/appointments/send.ts`).
4. **The Outlook-newer path.** When `event.changeKey !== link.changeKey` and the kind is not pushed, the reconcile must still send nothing, and must save the link with its OLD `bodyHash`, so the body goes on the next pass (`tests/calendar/sync.test.ts` "sends nothing back when Outlook is newer…", and `tests/calendar/sync-inbound.test.ts` "stores the new changeKey but keeps the date for a text-only edit").
5. **A missing gate code field never clears the code.** A form without a `gateCode` field leaves `leads.gate_code` alone (`formData.has("gateCode")`). Only a field that is present and blank clears it.
6. **Deploy order.** Production code selects `designer_notes` and `body_hash`, so migration 035 must be on production before the code is (Task 8).

---
### Task 1: Migration 035 and the appointments data layer

**Files:**
- Create: `db/migrations/035_designer_notes.sql`, `tests/db/migration-035.test.ts`
- Modify: `lib/admin/appointments.ts` (type at lines 14-22, `toAppointment` 24-37, `listAppointments` 43-51, `saveAppointment` 55-90; add `setAppointmentNotes` after it)
- Test: `tests/admin/appointments.test.ts`
- Fixture-only (so `npx tsc --noEmit` stays clean, since `Appointment.designerNotes` is required): `tests/appointments/send.test.ts:24-28`, `tests/admin/appointments-card.test.tsx:27-30`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `Appointment` gains `designerNotes: string | null` (read by `listAppointments`; `confirmAppointment`/`cancelAppointment` rows map it to `null`).
  - `export type AppointmentDetails = { designerNotes: string | null; gateCode?: string | null }` — `gateCode` undefined leaves `leads.gate_code` alone, `null` clears it.
  - `saveAppointment(jobId, kind, startsAt, allDay, timing, actor, details: AppointmentDetails = { designerNotes: null }): Promise<SaveResult>` — still always un-confirms.
  - `setAppointmentNotes(jobId: string, appointmentId: string, details: AppointmentDetails, actor: string): Promise<SaveResult>` — `"ok" | "missing"`, never touches `confirmed_at`.
  - DB columns: `appointments.designer_notes text` (check `appointments_designer_notes_check`), `job_calendar_events.body_hash text`.

- [ ] **Step 1: Write the failing migration test**

Create `tests/db/migration-035.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("db/migrations/035_designer_notes.sql", "utf8");
const statements = source.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("migration 035", () => {
  it("never puts a semicolon inside a comment", () => {
    for (const line of source.split("\n")) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });

  it("is exactly the two columns and the notes length check, every statement re-runnable", () => {
    expect(statements).toEqual([
      "alter table appointments add column if not exists designer_notes text",
      "alter table appointments drop constraint if exists appointments_designer_notes_check",
      "alter table appointments add constraint appointments_designer_notes_check check ( designer_notes is null or char_length(designer_notes) <= 2000 )",
      "alter table job_calendar_events add column if not exists body_hash text",
    ]);
  });

  it("backfills nothing and changes no existing row", () => {
    expect(source).not.toMatch(/^\s*(update|insert|delete)\b/im);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/db/migration-035.test.ts`
Expected: FAIL with `ENOENT: no such file or directory, open 'db/migrations/035_designer_notes.sql'`.

- [ ] **Step 3: Write the migration**

Create `db/migrations/035_designer_notes.sql`:

```sql
-- Designer notes per appointment, and the hash of the Outlook event body the admin last wrote
-- (docs/superpowers/specs/2026-10-01-designer-notes-design.md).
-- Every statement is safe to re-run: the migrate script applies all files.
-- Whole-line comments only, and no semicolons in comments.

alter table appointments add column if not exists designer_notes text;

alter table appointments drop constraint if exists appointments_designer_notes_check;

alter table appointments add constraint appointments_designer_notes_check check (
  designer_notes is null or char_length(designer_notes) <= 2000
);

alter table job_calendar_events add column if not exists body_hash text;
```

- [ ] **Step 4: Run the migration tests**

Run: `npx vitest run --maxWorkers=2 tests/db/migration-035.test.ts tests/db/migration-checks-consistent.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing data-layer tests**

In `tests/admin/appointments.test.ts`:

(a) In `describe("listAppointments")`, replace:

```ts
    expect(appointment).toEqual({
      id: APPT, jobId: JOB, kind: "consultation", startsAt: new Date("2026-09-20T17:00:00Z"),
      allDay: false, confirmedAt: null, confirmedBy: null, windowStart: null, windowEnd: null, durationMinutes: null,
    });
    expect(flat(sql.mock.calls[0])).toContain("order by starts_at");
```

with:

```ts
    expect(appointment).toEqual({
      id: APPT, jobId: JOB, kind: "consultation", startsAt: new Date("2026-09-20T17:00:00Z"),
      allDay: false, confirmedAt: null, confirmedBy: null, designerNotes: null,
      windowStart: null, windowEnd: null, durationMinutes: null,
    });
    expect(flat(sql.mock.calls[0])).toContain("order by starts_at");
    expect(flat(sql.mock.calls[0])).toContain("confirmed_by, designer_notes,");
```

(b) In the same describe, add before `it("maps the arrival window as clock times and the length in minutes"`:

```ts
  it("maps the designer notes", async () => {
    sql.mockResolvedValue([{ ...row, designer_notes: "Bring the motorized samples.\nDog in the yard." }]);
    const [appointment] = await appointments.listAppointments(JOB);
    expect(appointment.designerNotes).toBe("Bring the motorized samples.\nDog in the yard.");
  });

```

(c) `describe("saveAppointment")` ends with the test "returns missing for a non-uuid job id, without touching the database" and then the describe's closing `});`. Replace that closing `});` line with the block below — three more `saveAppointment` tests, the describe's closing `});`, and the new `describe("setAppointmentNotes")`:

```ts
  it("saves the designer notes, and a reschedule replaces them with what the dialog sent", async () => {
    sql.mockResolvedValue([{ job: 1 }]);
    await appointments.saveAppointment(JOB, "measure", STARTS, false, NO_TIMING, ACTOR, { designerNotes: "Bring samples" });
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("duration_minutes, designer_notes, confirmed_at, confirmed_by)");
    expect(statement).toMatch(/on conflict \(lead_id, kind\) do update set[^;]*designer_notes = excluded\.designer_notes/);
    expect(sql.mock.calls[0]).toContain("Bring samples");
  });

  it("saves a changed gate code to the client in the same statement, and keeps it out of the log line", async () => {
    sql.mockResolvedValue([{ job: 1 }]);
    await appointments.saveAppointment(JOB, "consultation", STARTS, false, NO_TIMING, ACTOR, { designerNotes: null, gateCode: "#4321" });
    expect(sql).toHaveBeenCalledOnce();
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("update leads set gate_code = ?::text, updated_at = now() where id = ? and ?::boolean and gate_code is distinct from ?::text");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["#4321", true]));
    // Only the job_events insert, never the gate code, reaches the activity log.
    const log = statement.slice(statement.indexOf("insert into job_events"));
    expect(log).not.toMatch(/gate/);
    const bodies = sql.mock.calls[0].filter((v: unknown) => typeof v === "string" && v.includes("pending confirmation"));
    for (const body of bodies) expect(body).not.toContain("#4321");
  });

  it("leaves the gate code alone when none was sent", async () => {
    sql.mockResolvedValue([{ job: 1 }]);
    await appointments.saveAppointment(JOB, "consultation", STARTS, false, NO_TIMING, ACTOR, { designerNotes: null });
    // The value bound just before "::boolean and gate_code" is the flag: false, so the leads update matches no row.
    const at = text(sql.mock.calls[0]).split("?").findIndex((part) => part.startsWith("::boolean and gate_code"));
    expect(at).toBeGreaterThan(0);
    expect(sql.mock.calls[0][at]).toBe(false);
  });
});

describe("setAppointmentNotes", () => {
  it("writes the notes on this job's appointment without un-confirming it, in one statement", async () => {
    sql.mockResolvedValue([{ found: 1 }]);
    expect(await appointments.setAppointmentNotes(JOB, APPT, { designerNotes: "Side gate sticks" }, ACTOR)).toBe("ok");
    expect(sql).toHaveBeenCalledOnce();
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("update appointments set designer_notes = ?::text where id = ? and lead_id = ?");
    expect(statement).not.toContain("confirmed_at");
    expect(statement).not.toContain("confirmed_by");
    // A newer updated_at tells the route planner the day changed; notes do not change a route.
    const update = statement.slice(statement.indexOf("update appointments"), statement.indexOf("returning lead_id, kind"));
    expect(update).not.toContain("updated_at");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["Side gate sticks", APPT, JOB, ACTOR]));
  });

  it("logs that the notes changed, naming the kind but never the notes or the gate code", async () => {
    sql.mockResolvedValue([{ found: 1 }]);
    await appointments.setAppointmentNotes(JOB, APPT, { designerNotes: "Side gate sticks", gateCode: "#4321" }, ACTOR);
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("insert into job_events");
    expect(statement).toContain("initcap(kind) || ' notes updated' from noted");
    const log = statement.slice(statement.indexOf("insert into job_events"));
    expect(log).not.toMatch(/gate|designer_notes/);
  });

  it("saves a changed gate code to the appointment's client in the same statement", async () => {
    sql.mockResolvedValue([{ found: 1 }]);
    await appointments.setAppointmentNotes(JOB, APPT, { designerNotes: null, gateCode: "#4321" }, ACTOR);
    const statement = flat(sql.mock.calls[0]);
    expect(statement).toContain("update leads set gate_code = ?::text, updated_at = now() where id = (select lead_id from noted) and ?::boolean and gate_code is distinct from ?::text");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(["#4321", true]));
  });

  it("reports an appointment that is gone or belongs to another job", async () => {
    sql.mockResolvedValue([{ found: 0 }]);
    expect(await appointments.setAppointmentNotes(JOB, APPT, { designerNotes: "x" }, ACTOR)).toBe("missing");
  });

  it("refuses a non-uuid id without touching the database", async () => {
    expect(await appointments.setAppointmentNotes("../etc", APPT, { designerNotes: "x" }, ACTOR)).toBe("missing");
    expect(await appointments.setAppointmentNotes(JOB, "../etc", { designerNotes: "x" }, ACTOR)).toBe("missing");
    expect(sql).not.toHaveBeenCalled();
  });
});
```

(d) In `describe("logConfirmation")`, the three literal `Appointment` objects need the new field. Run:

```bash
sed -i '' 's/confirmedBy: ACTOR, \.\.\.NO_TIMING }/confirmedBy: ACTOR, designerNotes: null, ...NO_TIMING }/g' tests/admin/appointments.test.ts
grep -c "designerNotes: null, ...NO_TIMING" tests/admin/appointments.test.ts
```

Expected: `3`.

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/appointments.test.ts`
Expected: FAIL — `listAppointments` lacks `designerNotes`, the statement has no `designer_notes`, and `appointments.setAppointmentNotes is not a function`. The "module boundaries" test still passes.

- [ ] **Step 7: Implement the data layer**

In `lib/admin/appointments.ts`:

Replace the `Appointment` type:

```ts
export type Appointment = {
  id: string;
  jobId: string;
  kind: AppointmentKind;
  startsAt: Date;
  allDay: boolean;
  confirmedAt: Date | null;
  confirmedBy: string | null;
} & AppointmentTiming;
```

with:

```ts
export type Appointment = {
  id: string;
  jobId: string;
  kind: AppointmentKind;
  startsAt: Date;
  allDay: boolean;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  /** The designer's own notes for this visit. Owner-only: never in the portal, emails or job_events. */
  designerNotes: string | null;
} & AppointmentTiming;

/**
 * What a booking or a notes edit writes besides the time. gateCode undefined leaves the client's
 * gate code alone; null clears it. The gate code is per client (leads.gate_code), the notes per appointment.
 */
export type AppointmentDetails = { designerNotes: string | null; gateCode?: string | null };
```

In `toAppointment`, after `confirmedBy: (row.confirmed_by as string | null) ?? null,` add:

```ts
    designerNotes: (row.designer_notes as string | null) ?? null,
```

In `listAppointments`, replace the first select line:

```ts
    select id, lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by,
```

with:

```ts
    select id, lead_id, kind, starts_at, all_day, confirmed_at, confirmed_by, designer_notes,
```

Replace the whole of `saveAppointment` (its doc comment through its closing `}`, lines 55-90) with `saveAppointment` and the new `setAppointmentNotes`:

```ts
/**
 * Books or moves one appointment and logs it, in one statement. A saved appointment is always
 * unconfirmed: only the confirm path sets confirmed_at, and only a confirmed row mirrors to the job.
 * The same statement saves the designer notes and, when details.gateCode is given and differs, the
 * client's gate code. Neither goes into the log line.
 */
export async function saveAppointment(
  jobId: string, kind: AppointmentKind, startsAt: Date, allDay: boolean, timing: AppointmentTiming, actor: string,
  details: AppointmentDetails = { designerNotes: null },
): Promise<SaveResult> {
  if (!isUuid(jobId)) return "missing";
  const when = whenLabel(startsAt, allDay);
  const setBody = `${kindLabel(kind)} set for ${when} — pending confirmation`;
  const movedBody = `${kindLabel(kind)} moved to ${when} — pending confirmation`;
  const setGate = details.gateCode !== undefined;
  const gateCode = details.gateCode ?? null;
  const [result] = await db()`
    with target as (select id from leads where id = ${jobId}),
    prev as (select id from appointments where lead_id = ${jobId} and kind = ${kind}),
    gate as (
      update leads set gate_code = ${gateCode}::text, updated_at = now()
       where id = ${jobId} and ${setGate}::boolean and gate_code is distinct from ${gateCode}::text
      returning id
    ),
    saved as (
      insert into appointments (lead_id, kind, starts_at, all_day, window_start, window_end, duration_minutes, designer_notes, confirmed_at, confirmed_by)
      select id, ${kind}, ${startsAt}::timestamptz, ${allDay}::boolean,
             ${timing.windowStart}::time, ${timing.windowEnd}::time, ${timing.durationMinutes}::integer,
             ${details.designerNotes}::text, null, null
        from target
      on conflict (lead_id, kind) do update set
        starts_at = excluded.starts_at, all_day = excluded.all_day, designer_notes = excluded.designer_notes,
        window_start = excluded.window_start, window_end = excluded.window_end,
        duration_minutes = excluded.duration_minutes,
        confirmed_at = null, confirmed_by = null, updated_at = now()
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select ${jobId}, ${actor}, 'edit',
        case when exists (select 1 from prev) then ${movedBody} else ${setBody} end
      from saved
      returning id
    )
    select (select count(*) from target)::int as job`;
  return result?.job ? "ok" : "missing";
}

/**
 * Edits one appointment's designer notes, and the client's gate code when details.gateCode is given,
 * in one statement. Unlike saveAppointment it never touches confirmed_at: a notes edit is not a
 * re-booking. It leaves appointments.updated_at alone too, because the route planner reads a newer
 * updated_at as "this day changed" (SAVE_GUARD in lib/routes/day.ts) and notes do not move a route.
 * The log line names the kind only: the notes and the gate code never go into job_events.
 */
export async function setAppointmentNotes(
  jobId: string, appointmentId: string, details: AppointmentDetails, actor: string,
): Promise<SaveResult> {
  if (!isUuid(jobId) || !isUuid(appointmentId)) return "missing";
  const setGate = details.gateCode !== undefined;
  const gateCode = details.gateCode ?? null;
  const [result] = await db()`
    with noted as (
      update appointments set designer_notes = ${details.designerNotes}::text
       where id = ${appointmentId} and lead_id = ${jobId}
      returning lead_id, kind
    ),
    gate as (
      update leads set gate_code = ${gateCode}::text, updated_at = now()
       where id = (select lead_id from noted) and ${setGate}::boolean and gate_code is distinct from ${gateCode}::text
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${actor}, 'edit', initcap(kind) || ' notes updated' from noted
      returning id
    )
    select (select count(*) from noted)::int as found`;
  return result?.found ? "ok" : "missing";
}
```

Notes on this SQL, for the implementer and the reviewer:
- `designer_notes = excluded.designer_notes` is placed after `all_day` on purpose: an existing test pins `window_start = … duration_minutes = excluded.duration_minutes, confirmed_at = null` as one run.
- The `gate` CTE runs even though nothing references it: Postgres executes every data-modifying CTE (see `addContact` in `lib/admin/jobs.ts`).
- `initcap(kind)` matches `kindLabel` for every kind today (see the comment in `lib/admin/appointment-kinds.ts`, and `cancelAppointment`).

- [ ] **Step 8: Update the two typed `Appointment` fixtures**

In `tests/appointments/send.test.ts`, replace:

```ts
  confirmedAt: new Date(), confirmedBy: "owner@example.com", windowStart: null, windowEnd: null, durationMinutes: null,
```

with:

```ts
  confirmedAt: new Date(), confirmedBy: "owner@example.com", designerNotes: null, windowStart: null, windowEnd: null, durationMinutes: null,
```

In `tests/admin/appointments-card.test.tsx`, replace:

```ts
  confirmedAt: null, confirmedBy: null, windowStart: null, windowEnd: null, durationMinutes: null, ...over,
```

with:

```ts
  confirmedAt: null, confirmedBy: null, designerNotes: null, windowStart: null, windowEnd: null, durationMinutes: null, ...over,
```

- [ ] **Step 9: Run the tests, typecheck and lint**

Run: `npx vitest run --maxWorkers=2 tests/admin/appointments.test.ts tests/appointments/send.test.ts tests/admin/appointments-card.test.tsx tests/db/migration-035.test.ts tests/db/migration-checks-consistent.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx eslint lib/admin/appointments.ts tests/admin/appointments.test.ts tests/db/migration-035.test.ts tests/appointments/send.test.ts tests/admin/appointments-card.test.tsx`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add db/migrations/035_designer_notes.sql tests/db/migration-035.test.ts lib/admin/appointments.ts tests/admin/appointments.test.ts tests/appointments/send.test.ts tests/admin/appointments-card.test.tsx
git commit -m "feat: designer notes per appointment, saved without un-confirming (migration 035)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The event body text, its hash, and what the calendar reads

**Files:**
- Modify: `lib/calendar/events.ts` (imports line 1, `EventJob` 17-20, `newEventBody` 57-80)
- Modify: `lib/calendar/store.ts` (`JobAppointment` line 9, `getCalendarJob` 22-46)
- Test: `tests/calendar/events.test.ts`, `tests/calendar/store.test.ts`

**Interfaces:**
- Consumes: migration 035's `appointments.designer_notes` (Task 1); `leads.gate_code` (existing).
- Produces:
  - `EventJob` gains `gateCode: string | null` (so `CalendarJob` has it).
  - `JobAppointment` gains `designerNotes: string | null`.
  - `export function eventText(job: EventJob, designerNotes: string | null, jobUrl: string): string` — the exact text body.
  - `export const bodyHash = (text: string): string` — sha256 hex.
  - `newEventBody(kind, job, value, jobUrl, allDay, designerNotes: string | null = null): EventBody` — its `body.content` is `eventText(job, designerNotes, jobUrl)`.

- [ ] **Step 1: Write the failing tests**

In `tests/calendar/events.test.ts`, replace the import line:

```ts
import { newEventBody, movedTimes, trackerValue, sameValue, eventSubject, type GraphEvent } from "@/lib/calendar/events";
```

with:

```ts
import {
  newEventBody, movedTimes, trackerValue, sameValue, eventSubject, eventText, bodyHash, type GraphEvent,
} from "@/lib/calendar/events";
```

In the `job` fixture, replace `treatments: ["Shades"],` with `treatments: ["Shades"], gateCode: null,` so it reads:

```ts
const job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", name: "Dana Reyes", phone: "7025550134",
  email: "dana@example.com", address: "12 Elm St", city: "Henderson", treatments: ["Shades"], gateCode: null,
};
```

Add these two describes before `describe("movedTimes", () => {`:

```ts
describe("eventText", () => {
  const CONTACT = `Phone: (702) 555-0134\nEmail: dana@example.com\nInterested in: Shades\n\nOpen the job: ${URL_}`;

  it("is exactly today's contact lines and link when there is no gate code and no notes", () => {
    expect(eventText(job, null, URL_)).toBe(CONTACT);
  });

  it("leads with the gate code, then a blank line", () => {
    expect(eventText({ ...job, gateCode: "#4321" }, null, URL_)).toBe(`Gate code: #4321\n\n${CONTACT}`);
  });

  it("leads with the designer notes, kept line for line, when there is no gate code", () => {
    expect(eventText(job, "Bring motorized samples\nDog in the yard", URL_))
      .toBe(`Designer notes:\nBring motorized samples\nDog in the yard\n\n${CONTACT}`);
  });

  it("puts the gate code before the designer notes", () => {
    expect(eventText({ ...job, gateCode: "#4321" }, "Side gate sticks", URL_))
      .toBe(`Gate code: #4321\nDesigner notes:\nSide gate sticks\n\n${CONTACT}`);
  });

  it("is what a new event's body carries", () => {
    const body = newEventBody("measure", { ...job, gateCode: "#4321" }, new Date("2026-09-20T17:00:00Z"), URL_, false, "Side gate sticks");
    expect(body.body).toEqual({ contentType: "text", content: eventText({ ...job, gateCode: "#4321" }, "Side gate sticks", URL_) });
    expect(newEventBody("measure", job, new Date("2026-09-20T17:00:00Z"), URL_, false).body.content).toBe(CONTACT);
  });
});

describe("bodyHash", () => {
  it("is a stable sha256 hex digest for equal text", () => {
    expect(bodyHash(eventText(job, "a", URL_))).toBe(bodyHash(eventText(job, "a", URL_)));
    expect(bodyHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("changes with the gate code, the notes, or any character of the text", () => {
    const base = bodyHash(eventText(job, "Side gate sticks", URL_));
    expect(bodyHash(eventText({ ...job, gateCode: "#4321" }, "Side gate sticks", URL_))).not.toBe(base);
    expect(bodyHash(eventText(job, "Side gate sticks!", URL_))).not.toBe(base);
    expect(bodyHash(eventText(job, null, URL_))).not.toBe(base);
    expect(bodyHash(eventText(job, "Side gate sticks", URL_) + " ")).not.toBe(base);
  });
});
```

In `tests/calendar/store.test.ts`, in the test "returns the job's confirmed appointments, and only those", replace the expectation:

```ts
    expect(job?.appointments).toEqual([
      { kind: "measure", startsAt: new Date("2026-09-20T17:00:00Z"), allDay: false },
      { kind: "install", startsAt: new Date("2026-10-02T15:00:00Z"), allDay: true },
    ]);
```

with:

```ts
    expect(job?.appointments).toEqual([
      { kind: "measure", startsAt: new Date("2026-09-20T17:00:00Z"), allDay: false, designerNotes: null },
      { kind: "install", startsAt: new Date("2026-10-02T15:00:00Z"), allDay: true, designerNotes: null },
    ]);
```

and add these tests before `it("maps a Date starts_at the driver may hand back instead of a string"`:

```ts
  it("reads the client's gate code and each confirmed appointment's designer notes for the event body", async () => {
    sql
      .mockResolvedValueOnce([{ id: ID, name: "Dana", phone: "7025550134", email: null, address: null, city: "Henderson",
        treatments: [], gate_code: "#4321", status: "quoted", visit_at: null, install_on: null }])
      .mockResolvedValueOnce([{ kind: "measure", starts_at: "2026-09-20T17:00:00Z", all_day: false, designer_notes: "Side gate sticks" }]);
    const job = await store.getCalendarJob(ID);
    expect(job?.gateCode).toBe("#4321");
    expect(job?.appointments[0].designerNotes).toBe("Side gate sticks");
    expect(text(sql.mock.calls[0])).toMatch(/treatments, gate_code, status/);
    expect(text(sql.mock.calls[1])).toMatch(/select kind, starts_at, all_day, designer_notes from appointments/);
  });

  it("maps a missing gate code to null", async () => {
    sql.mockResolvedValueOnce([{ id: ID, name: "Dana", phone: "7025550134", email: null, address: null, city: "Henderson",
      treatments: [], status: "quoted", visit_at: null, install_on: null }]);
    expect((await store.getCalendarJob(ID))?.gateCode).toBeNull();
  });

```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/calendar/events.test.ts tests/calendar/store.test.ts`
Expected: FAIL — `eventText`/`bodyHash` are not exported (`is not a function`), `designerNotes` and `gateCode` are missing from `getCalendarJob`.

- [ ] **Step 3: Implement `events.ts`**

Add as the first import of `lib/calendar/events.ts`:

```ts
import { createHash } from "node:crypto";
```

(`events.ts` is only imported by server modules — `sync.ts`, `store.ts`, `week.ts`, all `server-only` — so `node:crypto` is safe here.)

Replace `EventJob`:

```ts
export type EventJob = {
  id: string; name: string; phone: string; email: string | null;
  address: string | null; city: string; treatments: string[];
};
```

with:

```ts
export type EventJob = {
  id: string; name: string; phone: string; email: string | null;
  address: string | null; city: string; treatments: string[];
  /** The client's gate code. Owner-only, but allowed on the support@ calendar: its events have no attendees. */
  gateCode: string | null;
};
```

Replace `newEventBody` with its doc comment:

```ts
/**
 * The Graph body for a new appointment's event. `allDay` decides the shape — a whole day, or one
 * hour from `value` — so any kind can be booked either way; the kind only names it.
 */
export function newEventBody(
  kind: Kind, job: EventJob, value: Date | string, jobUrl: string, allDay: boolean,
): EventBody {
  const lines = [
    `Phone: ${formatPhone(job.phone)}`,
    job.email ? `Email: ${job.email}` : null,
    job.treatments.length ? `Interested in: ${job.treatments.join(", ")}` : null,
    "",
    `Open the job: ${jobUrl}`,
  ].filter((line) => line !== null);
  const timing = allDay
    ? { isAllDay: true, start: midnight(value as string), end: midnight(nextDay(value as string)) }
    : { isAllDay: false, start: local(value as Date), end: local(new Date((value as Date).getTime() + HOUR)) };
  return {
    subject: eventSubject(kind, job),
    ...timing,
    location: { displayName: job.address ? `${job.address}, ${job.city}` : job.city },
    body: { contentType: "text", content: lines.join("\n") },
  };
}
```

with `eventText`, `bodyHash` and the new `newEventBody`:

```ts
/**
 * The plain-text body of an appointment's event: the gate code and the designer notes first, when
 * there are any, then the contact lines and the link back to the job. The reconcile hashes exactly
 * this text to decide whether Outlook needs the body again, so the create and every later update
 * must both take it from here.
 */
export function eventText(job: EventJob, designerNotes: string | null, jobUrl: string): string {
  const head = [
    job.gateCode ? `Gate code: ${job.gateCode}` : null,
    designerNotes ? `Designer notes:\n${designerNotes}` : null,
  ].filter((line) => line !== null);
  const contact = [
    `Phone: ${formatPhone(job.phone)}`,
    job.email ? `Email: ${job.email}` : null,
    job.treatments.length ? `Interested in: ${job.treatments.join(", ")}` : null,
    "",
    `Open the job: ${jobUrl}`,
  ].filter((line) => line !== null);
  return [...(head.length ? [...head, ""] : []), ...contact].join("\n");
}

/**
 * sha256 of the exact text body sent to Outlook. Graph may hand an event's body back as HTML, so the
 * reconcile compares this stored hash, never the body Outlook returns.
 */
export const bodyHash = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/**
 * The Graph body for a new appointment's event. `allDay` decides the shape — a whole day, or one
 * hour from `value` — so any kind can be booked either way; the kind only names it.
 */
export function newEventBody(
  kind: Kind, job: EventJob, value: Date | string, jobUrl: string, allDay: boolean, designerNotes: string | null = null,
): EventBody {
  const timing = allDay
    ? { isAllDay: true, start: midnight(value as string), end: midnight(nextDay(value as string)) }
    : { isAllDay: false, start: local(value as Date), end: local(new Date((value as Date).getTime() + HOUR)) };
  return {
    subject: eventSubject(kind, job),
    ...timing,
    location: { displayName: job.address ? `${job.address}, ${job.city}` : job.city },
    body: { contentType: "text", content: eventText(job, designerNotes, jobUrl) },
  };
}
```

- [ ] **Step 4: Implement the reads in `store.ts`**

Replace:

```ts
/** A confirmed appointment, the only kind that reaches Outlook. */
export type JobAppointment = { kind: Kind; startsAt: Date; allDay: boolean };
```

with:

```ts
/** A confirmed appointment, the only kind that reaches Outlook. Its notes go into its event's body. */
export type JobAppointment = { kind: Kind; startsAt: Date; allDay: boolean; designerNotes: string | null };
```

Replace the whole of `getCalendarJob`:

```ts
export async function getCalendarJob(leadId: string): Promise<CalendarJob | null> {
  if (!isUuid(leadId)) return null;
  const rows = await db()`
    select id, name, phone, email, address, city, treatments, gate_code, status, visit_at, install_on::text as install_on
    from leads where id = ${leadId}`;
  const row = rows[0];
  if (!row) return null;
  // Unconfirmed appointments are invisible to Outlook, so they are never read back here.
  const appointments = await db()`
    select kind, starts_at, all_day, designer_notes from appointments
    where lead_id = ${leadId} and confirmed_at is not null order by starts_at`;
  return {
    id: row.id as string, name: row.name as string, phone: row.phone as string,
    email: (row.email as string | null) ?? null, address: (row.address as string | null) ?? null,
    city: row.city as string, treatments: (row.treatments as string[]) ?? [],
    gateCode: (row.gate_code as string | null) ?? null,
    status: row.status as Stage,
    visitAt: row.visit_at ? new Date(row.visit_at as string) : null,
    installOn: (row.install_on as string | null) ?? null,
    appointments: appointments.map((a) => ({
      kind: a.kind as Kind,
      startsAt: new Date(a.starts_at as string | Date),
      allDay: a.all_day === true,
      designerNotes: (a.designer_notes as string | null) ?? null,
    })),
  };
}
```

- [ ] **Step 5: Run the calendar tests**

Run: `npx vitest run --maxWorkers=2 tests/calendar`
Expected: PASS (all calendar files; `sync.test.ts` is unaffected because `newEventBody`'s new parameter defaults to `null` and the sync does not read the hash yet).

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit` — expected: no errors.
Run: `npx eslint lib/calendar/events.ts lib/calendar/store.ts tests/calendar/events.test.ts tests/calendar/store.test.ts` — expected: no output.

- [ ] **Step 7: Commit**

```bash
git add lib/calendar/events.ts lib/calendar/store.ts tests/calendar/events.test.ts tests/calendar/store.test.ts
git commit -m "feat: Outlook event body leads with the gate code and the designer notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Keep the Outlook body current with the stored hash

**Files:**
- Modify: `lib/calendar/store.ts` (`Link` line 13-14, `toLink` 16-20, `getLinks` 48-52, `getLinkByEvent` 54-57, `saveLink` 59-65)
- Modify: `lib/calendar/sync.ts` (import line 6, `reconcileJob` 38-142)
- Test: `tests/calendar/store.test.ts`, `tests/calendar/sync.test.ts`, `tests/calendar/sync-inbound.test.ts`

**Interfaces:**
- Consumes: `eventText`, `bodyHash`, `newEventBody(…, designerNotes)`, `JobAppointment.designerNotes`, `EventJob.gateCode` (Task 2); `job_calendar_events.body_hash` (Task 1).
- Produces: `Link` gains `bodyHash: string | null` (required). `saveLink` writes it; `getLinks`/`getLinkByEvent` read it; `claimLink` leaves it null. `reconcileJob` behaviour:
  - create: POSTs `newEventBody(…, notes)` and saves the link with `bodyHash(body.body.content)`;
  - linked + wanted + (pushed or same changeKey): PATCH `{ …times if moved, subject if stale, body if hash differs }` in ONE request; save `{ ...link, changeKey, bodyHash: staleBody ? hash : link.bodyHash }`;
  - linked + Outlook newer + not pushed: unchanged — no PATCH, `saveLink({ ...link, changeKey })` keeps the old hash.

- [ ] **Step 1: Write the failing store tests**

In `tests/calendar/store.test.ts`, replace:

```ts
  it("upserts a link on (lead_id, kind)", async () => {
    await store.saveLink({ leadId: ID, kind: "consultation", eventId: "e1", changeKey: "ck" });
    expect(text(sql.mock.calls[0])).toMatch(/on conflict \(lead_id, kind\) do update/);
  });
```

with:

```ts
  it("upserts a link on (lead_id, kind), body hash included", async () => {
    await store.saveLink({ leadId: ID, kind: "consultation", eventId: "e1", changeKey: "ck", bodyHash: "h1" });
    const q = flat(sql.mock.calls[0]);
    expect(q).toMatch(/on conflict \(lead_id, kind\) do update/);
    expect(q).toContain("(lead_id, kind, event_id, change_key, body_hash, synced_at)");
    expect(q).toContain("body_hash = excluded.body_hash");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([ID, "consultation", "e1", "ck", "h1"]));
  });

  it("reads each link's body hash, null for a link written before it existed", async () => {
    sql.mockResolvedValueOnce([{ lead_id: ID, kind: "measure", event_id: "e3", change_key: "ck", body_hash: "h1" }]);
    expect(await store.getLinkByEvent("e3")).toEqual({ leadId: ID, kind: "measure", eventId: "e3", changeKey: "ck", bodyHash: "h1" });
    expect(text(sql.mock.calls[0])).toMatch(/change_key, body_hash from job_calendar_events/);
    sql.mockResolvedValueOnce([{ lead_id: ID, kind: "measure", event_id: "e3", change_key: "ck", body_hash: null }]);
    expect((await store.getLinks(ID))[0].bodyHash).toBeNull();
    expect(text(sql.mock.calls[1])).toMatch(/change_key, body_hash, synced_at/);
  });
```

and in the test "reads each link's synced_at so an abandoned claim can be spotted", replace the expected link:

```ts
      { leadId: ID, kind: "consultation", eventId: "pending:x", changeKey: "", syncedAt: new Date("2026-09-14T10:00:00Z") },
```

with:

```ts
      { leadId: ID, kind: "consultation", eventId: "pending:x", changeKey: "", bodyHash: null, syncedAt: new Date("2026-09-14T10:00:00Z") },
```

- [ ] **Step 2: Write the failing sync tests**

In `tests/calendar/sync.test.ts`:

Replace `const { eventSubject } = await import("@/lib/calendar/events");` with:

```ts
const { bodyHash, eventSubject, eventText } = await import("@/lib/calendar/events");
```

Replace the fixtures from `const appt = …` through `const job = jobWith(appt("consultation", CONSULT_AT));`:

```ts
const appt = (kind: string, startsAt: Date, allDay = false) => ({ kind, startsAt, allDay });
const jobWith = (...appointments: ReturnType<typeof appt>[]) => ({
  id: ID, name: "Dana Reyes", phone: "7025550134", email: null, address: null, city: "Henderson", treatments: [],
  status: "visit_booked", visitAt: null, installOn: null, appointments,
});
const job = jobWith(appt("consultation", CONSULT_AT));
```

with:

```ts
const appt = (kind: string, startsAt: Date, allDay = false, designerNotes: string | null = null) =>
  ({ kind, startsAt, allDay, designerNotes });
const jobWith = (...appointments: ReturnType<typeof appt>[]) => ({
  id: ID, name: "Dana Reyes", phone: "7025550134", email: null, address: null, city: "Henderson", treatments: [],
  gateCode: null as string | null, status: "visit_booked", visitAt: null, installOn: null, appointments,
});
const job = jobWith(appt("consultation", CONSULT_AT));
const JOB_URL = `https://pss.example/admin/jobs/${ID}`;
/** The hash of the body this job's events carry with no gate code and no notes: what an up-to-date link holds. */
const HASH = bodyHash(eventText(job, null, JOB_URL));
```

Replace `const link = { leadId: ID, kind: "consultation", eventId: "e1", changeKey: "ck1" };` with:

```ts
const link = { leadId: ID, kind: "consultation", eventId: "e1", changeKey: "ck1", bodyHash: HASH };
```

Two create expectations name the link literally; give them the hash:

```ts
    expect(store.saveLink).toHaveBeenCalledWith({ leadId: ID, kind: "measure", eventId: "e5", changeKey: "ck5", bodyHash: HASH });
```

```ts
    expect(store.saveLink).toHaveBeenCalledWith({ leadId: ID, kind: "install", eventId: "e2", changeKey: "c", bodyHash: HASH });
```

(Every other existing expectation already spreads `link`, so it now carries `bodyHash: HASH` and stays correct: an up-to-date link sends no body.)

Append this describe at the end of the file:

```ts
describe("the event body: gate code and designer notes", () => {
  const NOTES = "Side gate sticks\nBring motorized samples";
  const gated = (notes: string | null = NOTES) => ({ ...jobWith(appt("consultation", CONSULT_AT, false, notes)), gateCode: "#4321" });
  const wantedText = (notes: string | null = NOTES) => eventText(gated(notes), notes, JOB_URL);
  const patches = () => graphFetch.mock.calls.filter(([, init]) => init?.method === "PATCH").map(([, init]) => init.body);

  it("creates the event with the gate code and the appointment's notes, and stores that body's hash", async () => {
    store.getCalendarJob.mockResolvedValue(gated());
    graphFetch.mockResolvedValue(Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    const sent = graphFetch.mock.calls[0][1].body.body;
    expect(sent).toEqual({ contentType: "text", content: wantedText() });
    expect(sent.content.startsWith("Gate code: #4321\nDesigner notes:\nSide gate sticks\nBring motorized samples\n\nPhone:")).toBe(true);
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, bodyHash: bodyHash(wantedText()) });
  });

  it("PATCHes only the body when the notes changed, then stores the new hash and changeKey", async () => {
    store.getLinks.mockResolvedValue([link]); // holds the hash of the body without notes
    store.getCalendarJob.mockResolvedValue(gated());
    graphFetch.mockResolvedValueOnce(Response.json(event())).mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck2" }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1", "PATCH users/jobs@example.com/events/e1"]);
    expect(patches()).toEqual([{ body: { contentType: "text", content: wantedText() } }]);
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck2", bodyHash: bodyHash(wantedText()) });
  });

  it("sends no body when the stored hash matches, whatever Outlook's copy of the body says", async () => {
    store.getLinks.mockResolvedValue([{ ...link, bodyHash: bodyHash(wantedText()) }]);
    store.getCalendarJob.mockResolvedValue(gated());
    // Graph can return the body as HTML; it is never compared, so this changes nothing.
    graphFetch.mockResolvedValueOnce(Response.json(event({ body: { contentType: "html", content: "<html>typed in Outlook</html>" } })));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1"]);
    expect(store.saveLink).not.toHaveBeenCalled();
  });

  it("writes the body once to an event created before the hash existed", async () => {
    store.getLinks.mockResolvedValue([{ ...link, bodyHash: null }]);
    graphFetch.mockResolvedValueOnce(Response.json(event())).mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck2" }));
    await sync.syncJobCalendar(ID);
    expect(patches()).toEqual([{ body: { contentType: "text", content: eventText(job, null, JOB_URL) } }]);
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck2", bodyHash: HASH });

    // The next pass finds the hash it stored and sends nothing.
    graphFetch.mockReset();
    store.saveLink.mockReset();
    store.getLinks.mockResolvedValue([{ ...link, changeKey: "ck2" }]);
    graphFetch.mockResolvedValueOnce(Response.json(event({ changeKey: "ck2" })));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1"]);
    expect(store.saveLink).not.toHaveBeenCalled();
  });

  it("moves the time and replaces the body in one PATCH", async () => {
    store.getLinks.mockResolvedValue([link]);
    store.getCalendarJob.mockResolvedValue({ ...gated(), appointments: [appt("consultation", new Date("2026-09-21T16:00:00Z"), false, NOTES)] });
    graphFetch.mockResolvedValueOnce(Response.json(event())).mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck2" }));
    await sync.syncJobCalendar(ID, ["consultation"]);
    expect(patches()).toHaveLength(1);
    expect(patches()[0]).toMatchObject({ start: { dateTime: "2026-09-21T09:00:00" }, body: { contentType: "text", content: wantedText() } });
  });

  it("sends nothing back when Outlook is newer and nothing was pushed, keeping the old hash so the body goes next time", async () => {
    store.getLinks.mockResolvedValue([link]);
    store.getCalendarJob.mockResolvedValue(gated());
    graphFetch.mockResolvedValueOnce(Response.json(event({ changeKey: "ck9" })));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1"]);
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck9" }); // bodyHash still the old HASH

    // Next pass: the changeKeys agree, the hash still differs, so the body goes out.
    graphFetch.mockReset();
    store.saveLink.mockReset();
    store.getLinks.mockResolvedValue([{ ...link, changeKey: "ck9" }]);
    graphFetch.mockResolvedValueOnce(Response.json(event({ changeKey: "ck9" }))).mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck10" }));
    await sync.syncJobCalendar(ID);
    expect(patches()).toEqual([{ body: { contentType: "text", content: wantedText() } }]);
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck10", bodyHash: bodyHash(wantedText()) });
  });

  it("gives each kind its own notes", async () => {
    store.getCalendarJob.mockResolvedValue({
      ...jobWith(appt("consultation", CONSULT_AT, false, "Consult note"), appt("measure", CONSULT_AT, false, "Measure note")),
      gateCode: null,
    });
    graphFetch.mockImplementation(async () => Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    const bodies = graphFetch.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => init.body.body.content as string);
    expect(bodies[0]).toContain("Designer notes:\nConsult note");
    expect(bodies[0]).not.toContain("Measure note");
    expect(bodies[1]).toContain("Designer notes:\nMeasure note");
  });
});
```

In `tests/calendar/sync-inbound.test.ts`:

After `const sync = await import("@/lib/calendar/sync");` add:

```ts
const { bodyHash, eventText } = await import("@/lib/calendar/events");
```

Replace the fixtures from `const appt = …` through `const job = jobWith(appt("consultation", new Date("2026-09-20T17:00:00Z")));` with:

```ts
const appt = (kind: string, startsAt: Date, allDay = false, designerNotes: string | null = null) =>
  ({ kind, startsAt, allDay, designerNotes });
const jobWith = (...appointments: ReturnType<typeof appt>[]) => ({
  id: ID, name: "Dana Reyes", phone: "7025550134", email: null, address: null, city: "Henderson", treatments: [],
  gateCode: null as string | null, status: "visit_booked", visitAt: null, installOn: null, appointments,
});
const job = jobWith(appt("consultation", new Date("2026-09-20T17:00:00Z")));
/** The hash of the body this job's events carry with no gate code and no notes: what an up-to-date link holds. */
const HASH = bodyHash(eventText(job, null, `https://pss.example/admin/jobs/${ID}`));
```

Replace `const link = { leadId: ID, kind: "consultation", eventId: "e1", changeKey: "ck1" };` with:

```ts
const link = { leadId: ID, kind: "consultation", eventId: "e1", changeKey: "ck1", bodyHash: HASH };
```

Add before `it("stores the new changeKey but keeps the date for a text-only edit"` (the test pinned in the spec's survey — leave it as it is):

```ts
  it("ignores a body typed in Outlook while the admin's body is unchanged (the hash is ours, not Outlook's)", async () => {
    graphFetch.mockResolvedValueOnce(Response.json(event({ changeKey: "ck3", body: { contentType: "html", content: "<p>typed in Outlook</p>" } })));
    await sync.applyOutlookChange("e1");
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck3" });
    expect(calls()).not.toContain("PATCH users/jobs@example.com/events/e1");
  });

```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/calendar`
Expected: FAIL — about 13 tests: store tests (no `body_hash` in the SQL), the create expectations (no `bodyHash` saved), and the new body tests (no body PATCH).

- [ ] **Step 4: Implement the store's link hash**

In `lib/calendar/store.ts`, replace the `Link` type and its comment:

```ts
/** eventId starts with "pending:" while a sync holds the claim to create that event (see claimLink). */
export type Link = { leadId: string; kind: Kind; eventId: string; changeKey: string; syncedAt?: Date };
```

with:

```ts
/**
 * eventId starts with "pending:" while a sync holds the claim to create that event (see claimLink).
 * bodyHash is the bodyHash() of the text body the admin last wrote to the event; null for a claim
 * and for an event created before the hash existed, which therefore gets its body written once.
 */
export type Link = { leadId: string; kind: Kind; eventId: string; changeKey: string; bodyHash: string | null; syncedAt?: Date };
```

In `toLink`, after `eventId: row.event_id as string, changeKey: row.change_key as string,` add:

```ts
  bodyHash: (row.body_hash as string | null) ?? null,
```

Replace `getLinks`, `getLinkByEvent` and `saveLink` with:

```ts
export async function getLinks(leadId: string): Promise<Link[]> {
  const rows = await db()`
    select lead_id, kind, event_id, change_key, body_hash, synced_at from job_calendar_events where lead_id = ${leadId}`;
  return rows.map(toLink);
}

export async function getLinkByEvent(eventId: string): Promise<Link | null> {
  const rows = await db()`select lead_id, kind, event_id, change_key, body_hash from job_calendar_events where event_id = ${eventId}`;
  return rows[0] ? toLink(rows[0]) : null;
}

export async function saveLink(link: Link): Promise<void> {
  await db()`
    insert into job_calendar_events (lead_id, kind, event_id, change_key, body_hash, synced_at)
    values (${link.leadId}, ${link.kind}, ${link.eventId}, ${link.changeKey}, ${link.bodyHash}, now())
    on conflict (lead_id, kind) do update
      set event_id = excluded.event_id, change_key = excluded.change_key, body_hash = excluded.body_hash, synced_at = now()`;
}
```

`claimLink` is unchanged: its placeholder row gets `body_hash` null by default.

- [ ] **Step 5: Implement the reconcile**

In `lib/calendar/sync.ts`, replace the events import:

```ts
import { eventSubject, movedTimes, newEventBody, sameValue, trackerValue, type GraphEvent, type Kind } from "./events";
```

with:

```ts
import {
  bodyHash, eventSubject, eventText, movedTimes, newEventBody, sameValue, trackerValue, type GraphEvent, type Kind,
} from "./events";
```

In `reconcileJob`, after `const wanted = job && job.status !== "lost" ? current : null;` add:

```ts
    const notes = appointment?.designerNotes ?? null;
```

In `create`, replace:

```ts
      let created: { id: string; changeKey: string };
      try {
        const response = await expectOk(
          await graphFetch(events, { method: "POST", body: newEventBody(kind, job, wanted, jobUrl(job.id), allDay) }), "create",
        );
        created = (await response.json()) as { id: string; changeKey: string };
      } catch (error) {
        await store.deleteLink(leadId, kind, pendingId).catch((e) => console.error("Calendar claim release failed", e));
        throw error;
      }
      try {
        await store.saveLink({ leadId, kind, eventId: created.id, changeKey: created.changeKey });
```

with:

```ts
      let created: { id: string; changeKey: string };
      const body = newEventBody(kind, job, wanted, jobUrl(job.id), allDay, notes);
      try {
        const response = await expectOk(await graphFetch(events, { method: "POST", body }), "create");
        created = (await response.json()) as { id: string; changeKey: string };
      } catch (error) {
        await store.deleteLink(leadId, kind, pendingId).catch((e) => console.error("Calendar claim release failed", e));
        throw error;
      }
      try {
        await store.saveLink({
          leadId, kind, eventId: created.id, changeKey: created.changeKey, bodyHash: bodyHash(body.body.content),
        });
```

In the Outlook-newer branch, replace the comment:

```ts
      // Deliberately no subject check here: we just accepted Outlook's change, so we send nothing back
      // in the same pass. A stale subject on this event is corrected by the next reconcile.
```

with:

```ts
      // Deliberately no subject or body check here: we just accepted Outlook's change, so we send nothing
      // back in the same pass. The link keeps its old body hash, so a body the admin changed meanwhile
      // still differs and goes out on the next reconcile, as does a stale subject.
```

Replace the tail of the loop, from `const subject = job ? eventSubject(kind, job) : null;` to the end of the `if (moved || staleSubject) { … }` block:

```ts
    const subject = job ? eventSubject(kind, job) : null;
    const staleSubject = subject !== null && event.subject !== subject;
    const moved = !sameValue(allDay, trackerValue(allDay, event), wanted);

    if (moved || staleSubject) {
      const body = {
        ...(moved ? movedTimes(allDay, wanted, event) : {}),
        ...(staleSubject ? { subject } : {}),
      };
      const patched = await expectOk(
        await graphFetch(eventPath, { method: "PATCH", body }), "update",
      );
      const { changeKey } = (await patched.json()) as { changeKey: string };
      await store.saveLink({ ...link, changeKey });
    }
```

with:

```ts
    const subject = job ? eventSubject(kind, job) : null;
    const staleSubject = subject !== null && event.subject !== subject;
    const moved = !sameValue(allDay, trackerValue(allDay, event), wanted);
    // The body is compared by the hash of the text we last sent, never against Outlook's copy, which
    // Graph may return as HTML. A null hash (an event from before the hash existed) differs once.
    const text = job ? eventText(job, notes, jobUrl(job.id)) : null;
    const hash = text === null ? null : bodyHash(text);
    const staleBody = hash !== null && hash !== link.bodyHash;

    if (moved || staleSubject || staleBody) {
      const body = {
        ...(moved ? movedTimes(allDay, wanted, event) : {}),
        ...(staleSubject ? { subject } : {}),
        ...(staleBody ? { body: { contentType: "text", content: text } } : {}),
      };
      const patched = await expectOk(
        await graphFetch(eventPath, { method: "PATCH", body }), "update",
      );
      const { changeKey } = (await patched.json()) as { changeKey: string };
      await store.saveLink({ ...link, changeKey, bodyHash: staleBody ? hash : link.bodyHash });
    }
```

- [ ] **Step 6: Run the calendar tests**

Run: `npx vitest run --maxWorkers=2 tests/calendar`
Expected: PASS.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit` — expected: no errors (every `saveLink` call now passes `bodyHash`).
Run: `npx eslint lib/calendar/store.ts lib/calendar/sync.ts tests/calendar/store.test.ts tests/calendar/sync.test.ts tests/calendar/sync-inbound.test.ts` — expected: no output.

- [ ] **Step 8: Commit**

```bash
git add lib/calendar/store.ts lib/calendar/sync.ts tests/calendar/store.test.ts tests/calendar/sync.test.ts tests/calendar/sync-inbound.test.ts
git commit -m "feat: reconcile rewrites an Outlook event body only when its stored hash differs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Actions — booking saves notes and gate code, Edit notes, and the gate-code sync triggers

**Files:**
- Modify: `lib/admin/schema.ts` (after `optionalHours` line 66; `appointmentSchema` 73-97)
- Modify: `app/admin/jobs/appointment-actions.ts` (imports 4-9; `bookAppointment` 19-46; append `updateAppointmentNotes`)
- Modify: `lib/admin/jobs.ts` (`updateDetails` 244-281)
- Modify: `app/admin/jobs/actions.ts` (`saveDetails` 82-86)
- Modify: `app/(site)/thank-you/actions.ts` (imports line 6; after line 52)
- Test: `tests/admin/schema.test.ts`, `tests/admin/appointment-actions.test.ts`, `tests/admin/jobs.test.ts`, `tests/admin/actions.test.ts`, `tests/leads/questionnaire-action.test.ts`

**Interfaces:**
- Consumes: `saveAppointment(…, details)`, `setAppointmentNotes(jobId, appointmentId, details, actor)`, `AppointmentDetails` (Task 1); `syncJobCalendar(leadId, pushKinds?)` (existing, `lib/calendar/sync.ts`; never throws).
- Produces:
  - `designerNotesField` (zod: blank → `null`, trimmed, max 2000 with message `"Keep the designer notes under 2,000 characters"`, `\r\n` → `\n`).
  - `appointmentSchema` output gains `designerNotes: string | null` and `gateCode: string | null`.
  - `appointmentNotesSchema = z.object({ designerNotes, gateCode })`.
  - Server action `updateAppointmentNotes(appointmentId: string, jobId: string, _prev: FormState, formData: FormData): Promise<FormState>` — form fields `designerNotes` and (optional) `gateCode`. Same argument order as `confirmSchedule`/`cancelAppointmentAction`.
  - `bookAppointment` reads form fields `designerNotes` and (optional) `gateCode`.
  - `updateDetails(…)` returns `{ saved, addressChanged, gateCodeChanged }`.
  - Sync triggers (all push no kind): `updateAppointmentNotes` always after a save; `saveDetails` when `gateCodeChanged`; the questionnaire after every successful save. `bookAppointment` keeps `syncJobCalendar(jobId, [kind])` (the reconcile covers every kind, so a new gate code reaches the other confirmed events). The call form already syncs after every save (`app/admin/jobs/call-actions.ts:52`), unchanged.

- [ ] **Step 1: Write the failing schema tests**

In `tests/admin/schema.test.ts`, change the first import's start from `import { appointmentSchema, detailsSchema,` to `import { appointmentNotesSchema, appointmentSchema, designerNotesField, detailsSchema,` and add before `describe("appointmentSchema length", () => {`:

```ts
describe("designer notes and gate code", () => {
  const base = { kind: "measure", startsAt: "2026-09-24T09:00", allDay: false, windowStart: "", windowEnd: "", hours: "" };

  it("carries trimmed notes and the gate code through a booking", () => {
    expect(appointmentSchema.parse({ ...base, designerNotes: "  Side gate sticks \r\nDog in the yard ", gateCode: " #4321 " }))
      .toMatchObject({ designerNotes: "Side gate sticks \nDog in the yard", gateCode: "#4321" });
  });

  it("reads blank notes and a blank gate code as null", () => {
    expect(appointmentSchema.parse({ ...base, designerNotes: "  ", gateCode: "" })).toMatchObject({ designerNotes: null, gateCode: null });
    expect(appointmentSchema.parse(base)).toMatchObject({ designerNotes: null, gateCode: null });
  });

  it("caps notes at 2000 characters and the gate code at 40", () => {
    expect(designerNotesField.safeParse("x".repeat(2000)).success).toBe(true);
    expect(designerNotesField.safeParse("x".repeat(2001)).error!.issues[0].message).toBe("Keep the designer notes under 2,000 characters");
    expect(appointmentSchema.safeParse({ ...base, gateCode: "x".repeat(41) }).error!.issues[0].message).toBe("Keep the gate code under 40 characters");
  });

  it("parses an Edit notes form", () => {
    expect(appointmentNotesSchema.parse({ designerNotes: "Bring samples", gateCode: "" })).toEqual({ designerNotes: "Bring samples", gateCode: null });
    expect(appointmentNotesSchema.safeParse({ designerNotes: "x".repeat(2001), gateCode: "" }).success).toBe(false);
  });
});

```

- [ ] **Step 2: Write the failing action tests**

In `tests/admin/appointment-actions.test.ts`:

Add `setAppointmentNotes: vi.fn(),` to the mocked `appointments` object:

```ts
const appointments = {
  listAppointments: vi.fn(), saveAppointment: vi.fn(), confirmAppointment: vi.fn(),
  cancelAppointment: vi.fn(), mirrorToJob: vi.fn(), logConfirmation: vi.fn(), logAppointmentEmail: vi.fn(),
  logAppointmentProblem: vi.fn(), setAppointmentNotes: vi.fn(),
};
```

In `beforeEach`, after `appointments.saveAppointment.mockResolvedValue("ok");` add:

```ts
  appointments.setAppointmentNotes.mockResolvedValue("ok");
```

In `describe("without a session")`'s `it.each` table, add a fourth row:

```ts
    ["updateAppointmentNotes", () => actions.updateAppointmentNotes(APPT, JOB, {}, form({ designerNotes: "x" }))],
```

The three existing `saveAppointment` expectations in `describe("bookAppointment")` ("saves the parsed appointment as the signed-in owner", "carries the arrival window and length through", "carries an all-day booking through") gain a seventh argument. In each, after the `"owner@example.com",` argument line add:

```ts
      { designerNotes: null },
```

so, for example, the first reads:

```ts
  it("saves the parsed appointment as the signed-in owner", async () => {
    expect(await actions.bookAppointment(JOB, {}, booking())).toEqual({ ok: true });
    expect(appointments.saveAppointment).toHaveBeenCalledWith(
      JOB, "consultation", STARTS, false, { windowStart: null, windowEnd: null, durationMinutes: null }, "owner@example.com",
      { designerNotes: null },
    );
  });
```

After the test "carries the arrival window and length through" add:

```ts
  it("saves the designer notes and the gate code the dialog sent", async () => {
    await actions.bookAppointment(JOB, {}, booking({ designerNotes: " Side gate sticks ", gateCode: " #4321 " }));
    expect(appointments.saveAppointment.mock.calls[0][6]).toEqual({ designerNotes: "Side gate sticks", gateCode: "#4321" });
  });

  it("clears the gate code when the dialog sent it blank, and leaves it alone when the field was absent", async () => {
    await actions.bookAppointment(JOB, {}, booking({ gateCode: "" }));
    expect(appointments.saveAppointment.mock.calls[0][6]).toEqual({ designerNotes: null, gateCode: null });
    await actions.bookAppointment(JOB, {}, booking());
    expect(appointments.saveAppointment.mock.calls[1][6]).toEqual({ designerNotes: null });
    expect(appointments.saveAppointment.mock.calls[1][6]).not.toHaveProperty("gateCode");
  });

  it("refuses notes over 2000 characters, echoing them back", async () => {
    const long = "x".repeat(2001);
    const state = await actions.bookAppointment(JOB, {}, booking({ designerNotes: long, gateCode: "#4321" }));
    expect(state.error).toBe("Keep the designer notes under 2,000 characters");
    expect(state.values).toMatchObject({ designerNotes: long, gateCode: "#4321" });
    expect(appointments.saveAppointment).not.toHaveBeenCalled();
  });
```

Append at the end of the file:

```ts
describe("updateAppointmentNotes", () => {
  const notes = (over: Record<string, string> = {}) => form({ designerNotes: "Side gate sticks", gateCode: "#4321", ...over });

  it("saves the notes and the gate code on that job's appointment, as the signed-in owner", async () => {
    expect(await actions.updateAppointmentNotes(APPT, JOB, {}, notes())).toEqual({ ok: true });
    expect(appointments.setAppointmentNotes).toHaveBeenCalledWith(
      JOB, APPT, { designerNotes: "Side gate sticks", gateCode: "#4321" }, "owner@example.com",
    );
  });

  it("leaves the gate code alone when the form did not carry it", async () => {
    await actions.updateAppointmentNotes(APPT, JOB, {}, form({ designerNotes: "Side gate sticks" }));
    expect(appointments.setAppointmentNotes.mock.calls[0][2]).toEqual({ designerNotes: "Side gate sticks" });
  });

  // The whole point of Edit notes: it is not a reschedule, so it must not send the job back for confirmation.
  it("never reschedules, un-confirms, mirrors or emails", async () => {
    await actions.updateAppointmentNotes(APPT, JOB, {}, notes());
    expect(appointments.saveAppointment).not.toHaveBeenCalled();
    expect(appointments.confirmAppointment).not.toHaveBeenCalled();
    expect(appointments.mirrorToJob).not.toHaveBeenCalled();
    expect(sendAppointmentConfirmation).not.toHaveBeenCalled();
  });

  it("syncs the job without pushing a kind, so Outlook's date is never overridden", async () => {
    await actions.updateAppointmentNotes(APPT, JOB, {}, notes());
    expect(syncJobCalendar).toHaveBeenCalledWith(JOB);
  });

  it("refuses over-long notes or gate code, echoing what was typed and saving nothing", async () => {
    const state = await actions.updateAppointmentNotes(APPT, JOB, {}, notes({ gateCode: "x".repeat(41) }));
    expect(state.error).toBe("Keep the gate code under 40 characters");
    expect(state.values).toMatchObject({ designerNotes: "Side gate sticks", gateCode: "x".repeat(41) });
    expect(appointments.setAppointmentNotes).not.toHaveBeenCalled();
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });

  it("reports an appointment that no longer exists, and does not sync", async () => {
    appointments.setAppointmentNotes.mockResolvedValue("missing");
    expect(await actions.updateAppointmentNotes(APPT, JOB, {}, notes())).toEqual({ error: "That appointment no longer exists." });
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });
});
```

In `tests/admin/jobs.test.ts`:

```bash
sed -i '' 's/toEqual({ saved: false, addressChanged: false })/toEqual({ saved: false, addressChanged: false, gateCodeChanged: false })/g; s/toEqual({ saved: true, addressChanged: true })/toEqual({ saved: true, addressChanged: true, gateCodeChanged: false })/g; s/toEqual({ saved: true, addressChanged: false })/toEqual({ saved: true, addressChanged: false, gateCodeChanged: false })/g' tests/admin/jobs.test.ts
sed -i '' 's/with prev as (select address, city from leads where id = ?), changed as ( update leads set/with prev as (select address, city, gate_code from leads where id = ?), changed as ( update leads set/' tests/admin/jobs.test.ts
grep -c "gateCodeChanged: false })" tests/admin/jobs.test.ts
```

Expected: `6`. Then add before `it("createJob schedules a geocode of the new job, so every caller gets coordinates"`:

```ts
  it("updateDetails reports whether the gate code changed from before the update", async () => {
    const input = {
      address: null, city: "Henderson", brands: [], orderedOn: null,
      budgetTier: null, windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: "#4321",
    };
    sql.mockResolvedValue([{ id: ID, address_changed: false, gate_code_changed: true }]);
    expect(await jobs.updateDetails(ID, input, "owner@example.com")).toEqual({ saved: true, addressChanged: false, gateCodeChanged: true });
    const statement = text(sql.mock.calls[0]).replace(/\s+/g, " ");
    expect(statement).toContain("(prev.gate_code is distinct from ?::text) as gate_code_changed");
    // The gate code is owner-only: it is saved, but the log line never carries it.
    expect(sql.mock.calls[0]).toContain("#4321");
    expect(statement).toContain("'Updated job details'");
    sql.mockResolvedValue([{ id: ID, address_changed: false, gate_code_changed: false }]);
    expect((await jobs.updateDetails(ID, input, "owner@example.com")).gateCodeChanged).toBe(false);
  });

```

In `tests/admin/actions.test.ts`:

```bash
sed -i '' 's/jobs.updateDetails.mockResolvedValue({ saved: true, addressChanged: false });/jobs.updateDetails.mockResolvedValue({ saved: true, addressChanged: false, gateCodeChanged: false });/; s/jobs.updateDetails.mockResolvedValue({ saved: true, addressChanged: true });/jobs.updateDetails.mockResolvedValue({ saved: true, addressChanged: true, gateCodeChanged: false });/; s/jobs.updateDetails.mockResolvedValue({ saved: false, addressChanged: false });/jobs.updateDetails.mockResolvedValue({ saved: false, addressChanged: false, gateCodeChanged: false });/' tests/admin/actions.test.ts
sed -i '' 's/  it("never touches the calendar from Job details, which no longer holds a date", async () => {/  it("leaves the calendar alone when the gate code did not change (Job details holds no date)", async () => {/' tests/admin/actions.test.ts
```

(The renamed test keeps its body: it saves details with the default mock, `gateCodeChanged: false`, and still expects no sync.) Then, in `describe("Outlook calendar sync")`, add before `it("reports a job that no longer exists"`:

```ts
  it("syncs the calendar, pushing no date, when the gate code changed", async () => {
    jobs.updateDetails.mockResolvedValue({ saved: true, addressChanged: false, gateCodeChanged: true });
    await actions.saveDetails(ID, {}, form({ city: "Henderson", gateCode: "#4321" }));
    expect(syncJobCalendar).toHaveBeenCalledWith(ID);
  });

  it("does not sync when the gate code did not change", async () => {
    jobs.updateDetails.mockResolvedValue({ saved: true, addressChanged: false, gateCodeChanged: false });
    await actions.saveDetails(ID, {}, form({ city: "Henderson", gateCode: "#4321" }));
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });

```

In `tests/leads/questionnaire-action.test.ts`, after `vi.mock("@/lib/routes/geocode", () => ({ geocodeLead }));` add:

```ts
const syncJobCalendar = vi.fn();
vi.mock("@/lib/calendar/sync", () => ({ syncJobCalendar }));
```

In its `beforeEach`, after `geocodeLead.mockReset().mockResolvedValue(undefined);` add `syncJobCalendar.mockReset().mockResolvedValue(undefined);`, and after the `beforeEach` add:

```ts
describe("submitQuestionnaire calendar sync", () => {
  it("syncs the saved lead's calendar, so a new gate code reaches its Outlook events", async () => {
    await expect(submitQuestionnaire({}, form([["gateCode", "#4321"]]))).rejects.toThrow("NEXT_REDIRECT /thank-you/all-set");
    expect(syncJobCalendar).toHaveBeenCalledWith("lead-1");
  });
  it("does not sync when the save found no lead, or nothing was saved", async () => {
    saveQuestionnaire.mockResolvedValue(null);
    await submitQuestionnaire({}, form([["gateCode", "#4321"]]));
    expect(syncJobCalendar).not.toHaveBeenCalled();
    saveQuestionnaire.mockResolvedValue("lead-1");
    await expect(submitQuestionnaire({}, form([]))).rejects.toThrow("NEXT_REDIRECT");
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/schema.test.ts tests/admin/appointment-actions.test.ts tests/admin/jobs.test.ts tests/admin/actions.test.ts tests/leads/questionnaire-action.test.ts`
Expected: FAIL — `designerNotesField`/`appointmentNotesSchema` undefined, `actions.updateAppointmentNotes is not a function`, `saveAppointment` called with 6 arguments, `gateCodeChanged` missing, no `syncJobCalendar` call from Details or the questionnaire.

- [ ] **Step 4: Implement the schema**

In `lib/admin/schema.ts`, after `const optionalHours = z.preprocess(blank, hoursField.optional());` add:

```ts

/**
 * One appointment's designer notes: optional, trimmed, at most 2000 characters (the database check in
 * migration 035), with a browser's \r\n line breaks stored as \n. Blank is null.
 */
export const designerNotesField = z
  .preprocess(blank, z.string().trim().max(2000, "Keep the designer notes under 2,000 characters").optional())
  .transform((value) => (value === undefined ? null : value.replace(/\r\n?/g, "\n")));
```

In `appointmentSchema`'s object, after `hours: optionalHours,` add:

```ts
    designerNotes: designerNotesField,
    // The client's gate code, shown and editable in the dialog. The action uses it only when the form sent the field.
    gateCode: gateCodeField,
```

In its `.transform`, after `durationMinutes: value.hours ?? null,` add:

```ts
    designerNotes: value.designerNotes,
    gateCode: value.gateCode,
```

After the end of `appointmentSchema` (the `}));` line) add:

```ts

/** "Edit notes" on an appointment: its designer notes and the client's gate code, nothing about its time. */
export const appointmentNotesSchema = z.object({ designerNotes: designerNotesField, gateCode: gateCodeField });
```

(`gateCodeField` is already imported at the top of `schema.ts`.)

- [ ] **Step 5: Implement the appointment actions**

In `app/admin/jobs/appointment-actions.ts`, replace the imports from `@/lib/admin/appointments` and `@/lib/admin/schema`:

```ts
import { after } from "next/server";
import {
  cancelAppointment, confirmAppointment, logAppointmentEmail, logAppointmentProblem, logConfirmation,
  mirrorToJob, saveAppointment, setAppointmentNotes, type AppointmentDetails,
} from "@/lib/admin/appointments";
import { getJob, setStage } from "@/lib/admin/jobs";
import { appointmentNotesSchema, appointmentSchema } from "@/lib/admin/schema";
```

After `const GONE: FormState = { error: "That appointment no longer exists." };` add:

```ts

/**
 * A form that does not carry the gate code field leaves the client's gate code alone; one that
 * carries it blank clears it. The dialogs show the field only when they were given the client's code.
 */
const details = (formData: FormData, designerNotes: string | null, gateCode: string | null): AppointmentDetails =>
  formData.has("gateCode") ? { designerNotes, gateCode } : { designerNotes };
```

Replace `bookAppointment` and its doc comment with:

```ts
/**
 * Books or moves one appointment. It is saved pending, so the customer is not told here — only
 * confirmSchedule does that. The mirror still runs: a re-booked appointment loses its confirmation,
 * and leads.visit_at must lose the date with it. The sync runs for the same reason: rescheduling a
 * confirmed appointment un-confirms it, and an unconfirmed appointment must come OFF the shared
 * calendar at once. With no confirmed row left, the sync finds nothing wanted for this kind and
 * deletes the stale event, rather than leaving the old time on the calendar until the daily cron.
 * The designer notes and a changed gate code are saved in the same statement; the sync reconciles
 * every kind, so a new gate code also reaches the job's other confirmed events.
 */
export async function bookAppointment(jobId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData, ["kind", "startsAt", "allDay", "windowStart", "windowEnd", "hours", "gateCode", "designerNotes"]);
  const parsed = appointmentSchema.safeParse({
    kind: formData.get("kind") ?? "",
    startsAt: formData.get("startsAt") ?? "",
    allDay: formData.get("allDay") === "on",
    windowStart: formData.get("windowStart") ?? "",
    windowEnd: formData.get("windowEnd") ?? "",
    hours: formData.get("hours") ?? "",
    designerNotes: formData.get("designerNotes") ?? "",
    gateCode: formData.get("gateCode") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const { kind, startsAt, allDay, windowStart, windowEnd, durationMinutes, designerNotes, gateCode } = parsed.data;
  const saved = await saveAppointment(
    jobId, kind, startsAt, allDay, { windowStart, windowEnd, durationMinutes }, email, details(formData, designerNotes, gateCode),
  );
  if (saved === "missing") return MISSING;
  await mirrorToJob(jobId);
  after(() => syncJobCalendar(jobId, [kind]));
  refresh(jobId);
  return { ok: true };
}
```

Append at the end of the file:

```ts

/**
 * "Edit notes": the appointment's designer notes, and the client's gate code when the form carries
 * it, without rescheduling. The appointment keeps its time and its confirmation. The sync pushes no
 * kind, so a date someone moved in Outlook is never overridden; it rewrites the body of each confirmed
 * event whose text changed, which also carries a new gate code to the job's other events.
 */
export async function updateAppointmentNotes(
  appointmentId: string, jobId: string, _prev: FormState, formData: FormData,
): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData, ["designerNotes", "gateCode"]);
  const parsed = appointmentNotesSchema.safeParse({
    designerNotes: formData.get("designerNotes") ?? "",
    gateCode: formData.get("gateCode") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const saved = await setAppointmentNotes(
    jobId, appointmentId, details(formData, parsed.data.designerNotes, parsed.data.gateCode), email,
  );
  if (saved === "missing") return GONE;
  after(() => syncJobCalendar(jobId));
  refresh(jobId);
  return { ok: true };
}
```

- [ ] **Step 6: Implement `updateDetails`' gateCodeChanged and the Details trigger**

Replace `updateDetails` in `lib/admin/jobs.ts` (with its doc comment):

```ts
/**
 * Saves the details form and logs it, in one statement. saved false means the job is gone.
 * addressChanged and gateCodeChanged compare against the row as it was before this update, so only a
 * real edit re-geocodes, and only a real gate-code edit re-syncs the Outlook events that show it.
 *
 * No appointment date passes through here: visit_at and install_on are mirrors of the confirmed
 * appointments (see mirrorToJob), and a New job now moves to Appointment booked only when its
 * consultation is confirmed. Only the gate code saved here reaches Outlook (see saveDetails).
 */
export async function updateDetails(
  id: string, input: DetailsInput, actor: string,
): Promise<{ saved: boolean; addressChanged: boolean; gateCodeChanged: boolean }> {
  if (!isUuid(id)) return { saved: false, addressChanged: false, gateCodeChanged: false };
  const rows = await db()`
    with prev as (select address, city, gate_code from leads where id = ${id}),
    changed as (
      update leads set
        address = ${input.address}, city = ${input.city},
        lat = case when address is distinct from ${input.address}::text or city is distinct from ${input.city}::text then null else lat end,
        lng = case when address is distinct from ${input.address}::text or city is distinct from ${input.city}::text then null else lng end,
        geocode_status = case when address is distinct from ${input.address}::text or city is distinct from ${input.city}::text then null else geocode_status end,
        geocoded_at = case when address is distinct from ${input.address}::text or city is distinct from ${input.city}::text then null else geocoded_at end,
        brands = ${input.brands}, ordered_on = ${input.orderedOn}::date,
        budget_tier = ${input.budgetTier},
        window_count_exact = ${input.windowCountExact}, treatment_types = ${input.treatmentTypes}::text[], motorized = ${input.motorized}, gate_code = ${input.gateCode},
        updated_at = now()
      where id = ${id}
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select id, ${actor}, 'edit', 'Updated job details' from changed
      returning id
    )
    select changed.id,
           (prev.address is distinct from ${input.address}::text or prev.city is distinct from ${input.city}::text) as address_changed,
           (prev.gate_code is distinct from ${input.gateCode}::text) as gate_code_changed
      from changed, prev`;
  return {
    saved: rows.length > 0,
    addressChanged: rows[0]?.address_changed === true,
    gateCodeChanged: rows[0]?.gate_code_changed === true,
  };
}
```

In `app/admin/jobs/actions.ts`'s `saveDetails`, replace:

```ts
  // No date is edited here any more, so this save never touches Outlook.
  const { saved, addressChanged } = await updateDetails(id, parsed.data, email);
  if (!saved) return MISSING;
  // Coordinates for the route planner, only when the address really changed. Never blocks the save.
  if (addressChanged) after(() => geocodeLead(id));
```

with:

```ts
  const { saved, addressChanged, gateCodeChanged } = await updateDetails(id, parsed.data, email);
  if (!saved) return MISSING;
  // Coordinates for the route planner, only when the address really changed. Never blocks the save.
  if (addressChanged) after(() => geocodeLead(id));
  // No date is edited here. Only the gate code reaches Outlook (it is on every confirmed appointment's
  // event), so only a changed gate code syncs, and the sync pushes no date.
  if (gateCodeChanged) after(() => syncJobCalendar(id));
```

(`syncJobCalendar` and `after` are already imported in `actions.ts`.)

- [ ] **Step 7: Implement the questionnaire trigger**

In `app/(site)/thank-you/actions.ts`, add the import above `import { saveQuestionnaire } from "@/lib/leads/questionnaire";`:

```ts
import { syncJobCalendar } from "@/lib/calendar/sync";
```

and after `if (leadId && parsed.data.address) after(() => geocodeLead(leadId));` add:

```ts
  // The gate code is on every confirmed appointment's Outlook event; the sync rewrites only a body whose
  // text changed and pushes no date. It never throws and does nothing until Outlook is connected.
  if (leadId) after(() => syncJobCalendar(leadId));
```

(`saveQuestionnaire` returns only the lead id, so the questionnaire cannot tell whether the gate code changed; the sync it triggers rewrites a body only when its hash differs, and is a no-op for a lead with no linked events.)

- [ ] **Step 8: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/admin/schema.test.ts tests/admin/appointment-actions.test.ts tests/admin/jobs.test.ts tests/admin/actions.test.ts tests/admin/invite-actions.test.ts tests/leads/questionnaire-action.test.ts tests/leads/questionnaire.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck and lint**

Run: `npx tsc --noEmit` — expected: no errors.
Run: `npx eslint lib/admin/schema.ts app/admin/jobs/appointment-actions.ts lib/admin/jobs.ts app/admin/jobs/actions.ts "app/(site)/thank-you/actions.ts" tests/admin/schema.test.ts tests/admin/appointment-actions.test.ts tests/admin/jobs.test.ts tests/admin/actions.test.ts tests/leads/questionnaire-action.test.ts` — expected: no output.

- [ ] **Step 10: Commit**

```bash
git add lib/admin/schema.ts app/admin/jobs/appointment-actions.ts lib/admin/jobs.ts app/admin/jobs/actions.ts "app/(site)/thank-you/actions.ts" tests/admin/schema.test.ts tests/admin/appointment-actions.test.ts tests/admin/jobs.test.ts tests/admin/actions.test.ts tests/leads/questionnaire-action.test.ts
git commit -m "feat: book with designer notes and gate code, Edit notes action, gate-code saves sync Outlook" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Scheduler pop-up — gate code at the top, designer notes, reschedule keeps them

**Files:**
- Create: `app/admin/jobs/[id]/modal.ts` (the `<dialog>` helpers now private to `ScheduleDialog.tsx`, shared with Task 6's `NotesDialog`)
- Modify: `app/admin/jobs/[id]/ScheduleDialog.tsx` (whole file below)
- Modify: `app/admin/jobs/[id]/JobHeader.tsx:78`, `app/admin/jobs/[id]/OverviewTab.tsx:70`
- Modify: `app/admin/jobs/[id]/AppointmentsCard.tsx` (whole file below — gate code and notes handed to its dialogs)
- Test: `tests/admin/schedule-dialog.test.tsx`, `tests/admin/job-header.test.tsx`, `tests/admin/appointments-card.test.tsx`

**Interfaces:**
- Consumes: `bookAppointment` reads `gateCode` (only when the field is present) and `designerNotes` (Task 4); `Appointment.designerNotes` (Task 1); `Job.gateCode?: string | null` (existing).
- Produces:
  - `modal.ts`: `subscribeNothing`, `openModal(el: HTMLDialogElement | null)`, `closeModal(el: HTMLDialogElement | null)`.
  - `ScheduleDialog` props gain `gateCode?: string | null` (undefined → no gate code field and none sent; `null` → empty field) and `designerNotes?: string | null` (prefills the textarea). Field names: `gateCode`, `designerNotes`. Labels: "Gate code" (first control in the form), "Designer notes" (after "Length (hours)").
  - `AppointmentsCard` props gain `gateCode?: string | null`; its `Row` gets `gateCode` too.

- [ ] **Step 1: Write the failing tests**

In `tests/admin/schedule-dialog.test.tsx`, in the test "degrades to a disclosure holding the same form without JavaScript", after `expect(html).toContain('name="kind"');` add:

```ts
    expect(html).toContain('name="designerNotes"');
```

and add before `it("carries the window and length of the appointment being moved"`:

```ts
  it("shows the client's gate code first, editable, and books what was typed", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} gateCode="#4321" />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    const gate = screen.getByLabelText("Gate code");
    expect(gate).toHaveValue("#4321");
    expect(gate).toHaveAttribute("maxLength", "40");
    // At the top: the first control in the form.
    expect(gate.closest("form")!.querySelector("input, select, textarea")).toBe(gate);
    await user.clear(gate);
    await user.type(gate, "#9999");
    await user.type(screen.getByLabelText("Date and time"), "2026-09-20T10:00");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect((bookAppointment.mock.calls[0][2] as FormData).get("gateCode")).toBe("#9999");
  });

  it("shows an empty gate code field for a client without one", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} gateCode={null} />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    expect(screen.getByLabelText("Gate code")).toHaveValue("");
  });

  it("sends no gate code at all when it was not given one, so the client's code is left alone", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    expect(screen.queryByLabelText("Gate code")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect((bookAppointment.mock.calls[0][2] as FormData).has("gateCode")).toBe(false);
  });

  it("takes designer notes below the time fields and books them", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    const notes = screen.getByLabelText("Designer notes");
    expect(notes.tagName).toBe("TEXTAREA");
    expect(notes).toHaveAttribute("maxLength", "2000");
    // Below the time fields: after Length, the last of them.
    expect(screen.getByLabelText("Length (hours)").compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.type(notes, "Side gate sticks");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect((bookAppointment.mock.calls[0][2] as FormData).get("designerNotes")).toBe("Side gate sticks");
  });

  it("pre-fills the notes of the appointment being rescheduled, so they are kept", async () => {
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} label="Reschedule" kind="measure"
      startsAt="2026-10-02T09:00" gateCode="#4321" designerNotes={"Side gate sticks\nDog in the yard"} />);
    await user.click(screen.getByRole("button", { name: "Reschedule" }));
    expect(screen.getByLabelText("Designer notes")).toHaveValue("Side gate sticks\nDog in the yard");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const data = bookAppointment.mock.calls[0][2] as FormData;
    expect(data.get("designerNotes")).toBe("Side gate sticks\nDog in the yard");
    expect(data.get("gateCode")).toBe("#4321");
  });

  it("keeps the typed notes and gate code when the submit fails", async () => {
    bookAppointment.mockResolvedValueOnce({
      error: "Pick a date and time", values: { startsAt: "", kind: "consultation", designerNotes: "Typed notes", gateCode: "#77" },
    });
    const user = userEvent.setup();
    render(<ScheduleDialog jobId={ID} defaultMinutes={MINUTES} gateCode="#4321" />);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.type(screen.getByLabelText("Designer notes"), "Typed notes");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Designer notes")).toHaveValue("Typed notes");
    expect(screen.getByLabelText("Gate code")).toHaveValue("#77");
  });

```

In `tests/admin/job-header.test.tsx`, add before `it("has call, text, email and schedule actions"`:

```ts
  it("puts the client's gate code in the Schedule dialog", () => {
    render(<JobHeader job={{ ...job, gateCode: "#4321" }} now={now} team={team} defaultMinutes={MINUTES} />);
    expect(screen.getByLabelText("Gate code")).toHaveValue("#4321");
  });

```

In `tests/admin/appointments-card.test.tsx`, add before `it("hands the window and length to Reschedule"`:

```ts
  it("hands the notes and the client's gate code to Reschedule", async () => {
    const user = userEvent.setup();
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} gateCode="#4321"
      appointments={[appointment({ designerNotes: "Side gate sticks" })]} />);
    await user.click(screen.getByRole("button", { name: "Reschedule" }));
    const dialog = screen.getByRole("dialog", { name: "Reschedule" });
    expect(within(dialog).getByLabelText("Designer notes")).toHaveValue("Side gate sticks");
    expect(within(dialog).getByLabelText("Gate code")).toHaveValue("#4321");
  });

  it("hands the client's gate code to the empty card's Schedule", async () => {
    const user = userEvent.setup();
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} gateCode="#4321" appointments={[]} />);
    await user.click(within(card()).getByRole("button", { name: "Schedule" }));
    expect(screen.getByLabelText("Gate code")).toHaveValue("#4321");
  });

```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/schedule-dialog.test.tsx tests/admin/job-header.test.tsx tests/admin/appointments-card.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Gate code` / `Designer notes`, and the static markup has no `name="designerNotes"`.

- [ ] **Step 3: Create the shared modal helpers**

Create `app/admin/jobs/[id]/modal.ts`:

```ts
// The native <dialog> helpers shared by the job page's modals (ScheduleDialog, NotesDialog).

/** Nothing to subscribe to: the store's only job is to differ between server and browser. */
export const subscribeNothing = () => () => {};

// showModal/close are missing in jsdom and in very old browsers; the open attribute still shows the dialog.
export function openModal(element: HTMLDialogElement | null) {
  if (!element) return;
  if (typeof element.showModal === "function") element.showModal();
  else element.setAttribute("open", "");
}

export function closeModal(element: HTMLDialogElement | null) {
  if (!element) return;
  if (typeof element.close === "function") element.close();
  else element.removeAttribute("open");
}
```

- [ ] **Step 4: Rewrite `ScheduleDialog.tsx`**

Replace the whole of `app/admin/jobs/[id]/ScheduleDialog.tsx` with:

```tsx
"use client";

import { useActionState, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/admin/icons";
import { Button } from "@/components/ui/Button";
import { APPOINTMENT_KINDS, type AppointmentKind } from "@/lib/admin/appointment-kinds";
import { hoursLabel, WINDOW_OPTIONS } from "@/lib/routes/window";
import { bookAppointment } from "../appointment-actions";
import type { FormState } from "../actions";
import { closeModal, openModal, subscribeNothing } from "./modal";
import { ACTION_LINK } from "./ui";

const CONTROL = "min-h-11 w-full border border-rule bg-ivory px-4 py-3";

type Props = {
  jobId: string;
  /** What the trigger says: "Schedule" to book, "Reschedule" to move an existing appointment. */
  label?: string;
  kind?: AppointmentKind;
  /** The appointment being moved, as a datetime-local value. */
  startsAt?: string;
  allDay?: boolean;
  /** The arrival window being moved; null or absent is Any time. */
  windowStart?: string | null;
  windowEnd?: string | null;
  /** The length being moved; absent means the kind's default. */
  durationMinutes?: number | null;
  /** Each kind's usual length, which pre-fills Length until the owner types one. */
  defaultMinutes: Record<AppointmentKind, number>;
  /**
   * The client's gate code (null when there is none), shown at the top and saved with the booking.
   * Absent: no gate code field, and the booking leaves the client's gate code alone.
   */
  gateCode?: string | null;
  /** The designer notes of the appointment being moved, so a reschedule keeps them. */
  designerNotes?: string | null;
  className?: string;
};

/**
 * One booking, taken in a native modal. Without JavaScript the modal never appears and the same
 * form sits inside a <details> disclosure, which posts the action the ordinary way.
 */
export function ScheduleDialog({
  jobId, label = "Schedule", kind = "consultation", startsAt = "", allDay = false,
  windowStart = null, windowEnd = null, durationMinutes = null, defaultMinutes, className = ACTION_LINK,
  gateCode, designerNotes = null,
}: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(bookAppointment.bind(null, jobId), {});
  // False on the server and through hydration, true once this is running in a browser — which is
  // exactly when the modal can work. Without JavaScript the <details> fallback is what ships.
  const enhanced = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const dialog = useRef<HTMLDialogElement>(null);
  // The job page holds several of these (the header, the card, one per appointment), so the
  // field ids have to be unique per instance or the labels point at the wrong inputs.
  const uid = useId();
  // A saved booking is done with: close the modal so the refreshed card shows underneath.
  useEffect(() => { if (state.ok) closeModal(dialog.current); }, [state]);
  // A length the owner typed, or one carried from the appointment being moved, stays put when the
  // kind changes; an untouched length follows the picked kind's default.
  // A failed submit redraws the window as it was picked, so half a window is not lost. A select only
  // reads defaultValue when it mounts, so the fieldset is keyed to the echoed values to remount it.
  // The date, kind and all-day are not remounted: React 19 resets the form after the action, and the
  // reset restores each input's defaultValue/defaultChecked, which now come from the echo. An unticked
  // checkbox is absent from the echo, so once values came back, a missing allDay means unticked.
  const seeded = (
    name: "windowStart" | "windowEnd" | "startsAt" | "kind" | "gateCode" | "designerNotes", fallback: string | null,
  ) => {
    const echoed = state.values?.[name];
    return typeof echoed === "string" ? echoed : fallback ?? "";
  };
  const seededAllDay = state.values ? state.values.allDay === "on" : allDay;
  const seededKind = seeded("kind", kind);
  const [touched, setTouched] = useState(durationMinutes != null);
  const [hours, setHours] = useState(hoursLabel(durationMinutes ?? defaultMinutes[kind]));

  const fields = (
    <form action={action} className="flex flex-col gap-4 text-sm">
      {gateCode !== undefined ? (
        <label htmlFor={`gateCode-${uid}`} className="flex flex-col gap-2">
          Gate code
          <input id={`gateCode-${uid}`} name="gateCode" type="text" maxLength={40} autoComplete="off" className={CONTROL}
            defaultValue={seeded("gateCode", gateCode)} />
        </label>
      ) : null}
      <label htmlFor={`startsAt-${uid}`} className="flex flex-col gap-2">
        Date and time
        <input id={`startsAt-${uid}`} name="startsAt" type="datetime-local" className={CONTROL} defaultValue={seeded("startsAt", startsAt)} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2">What is this for?</legend>
        <div className="flex flex-wrap gap-2">
          {APPOINTMENT_KINDS.map((option) => (
            <label key={option.value} htmlFor={`kind-${uid}-${option.value}`}
              className="flex min-h-11 items-center gap-2 border border-rule px-3">
              <input id={`kind-${uid}-${option.value}`} type="radio" name="kind" value={option.value}
                defaultChecked={option.value === seededKind}
                onChange={() => { if (!touched) setHours(hoursLabel(defaultMinutes[option.value])); }} />
              <Icon name={option.icon} className="size-4" />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`allDay-${uid}`} className="flex min-h-11 items-center gap-2">
        <input id={`allDay-${uid}`} type="checkbox" name="allDay" defaultChecked={seededAllDay} />
        All day
      </label>
      <fieldset key={`${seeded("windowStart", windowStart)}-${seeded("windowEnd", windowEnd)}`} className="flex flex-col gap-2">
        <legend className="mb-2">Arrival window</legend>
        <div className="grid grid-cols-2 gap-2">
          <label htmlFor={`windowStart-${uid}`} className="flex flex-col gap-1">From
            <select id={`windowStart-${uid}`} name="windowStart" className={CONTROL} defaultValue={seeded("windowStart", windowStart)}>
              <option value="">Any time</option>
              {WINDOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label htmlFor={`windowEnd-${uid}`} className="flex flex-col gap-1">To
            <select id={`windowEnd-${uid}`} name="windowEnd" className={CONTROL} defaultValue={seeded("windowEnd", windowEnd)}>
              <option value="">Any time</option>
              {WINDOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
      </fieldset>
      <label htmlFor={`hours-${uid}`} className="flex flex-col gap-2">
        Length (hours)
        <input id={`hours-${uid}`} name="hours" type="number" step="0.25" min="0.25" max="12" inputMode="decimal"
          className={CONTROL} value={hours} onChange={(e) => { setHours(e.target.value); setTouched(true); }} />
      </label>
      <label htmlFor={`designerNotes-${uid}`} className="flex flex-col gap-2">
        Designer notes
        <textarea id={`designerNotes-${uid}`} name="designerNotes" rows={4} maxLength={2000} className={CONTROL}
          defaultValue={seeded("designerNotes", designerNotes)} />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="solid" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        {enhanced ? (
          <button type="button" className="text-sm underline underline-offset-4"
            onClick={() => closeModal(dialog.current)}>Close</button>
        ) : null}
        {state.error ? <p role="alert" className="w-full text-sm text-overdue">{state.error}</p> : null}
      </div>
    </form>
  );

  if (!enhanced) {
    // No w-full: this sits in the header's wrapping action row, where the hydrated button does too.
    return (
      <details>
        <summary className={`${className} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{label}</summary>
        <div className="mt-3 border border-rule bg-ivory p-4">{fields}</div>
      </details>
    );
  }

  return (
    <>
      <button type="button" className={className} onClick={() => openModal(dialog.current)}>{label}</button>
      <dialog ref={dialog} aria-label={label} className="w-[min(28rem,92vw)] border border-rule bg-ivory p-5 backdrop:bg-charcoal/40">
        {fields}
      </dialog>
    </>
  );
}
```

What changed against the current file: the private `subscribeNothing`/`open`/`close` moved to `./modal` (`openModal`/`closeModal`); two props; `seeded` accepts `"gateCode" | "designerNotes"` so a failed submit keeps them (React 19 resets the form to `defaultValue` after the action); the gate code field renders first only when `gateCode !== undefined`; the textarea follows Length.

- [ ] **Step 5: Pass the gate code from the header and the Overview tab**

In `app/admin/jobs/[id]/JobHeader.tsx`, replace:

```tsx
          <ScheduleDialog jobId={job.id} defaultMinutes={defaultMinutes} />
```

with:

```tsx
          <ScheduleDialog jobId={job.id} gateCode={job.gateCode ?? null} defaultMinutes={defaultMinutes} />
```

In `app/admin/jobs/[id]/OverviewTab.tsx`, replace:

```tsx
<AppointmentsCard jobId={job.id} appointments={appointments} defaultMinutes={defaultMinutes} />
```

with:

```tsx
<AppointmentsCard jobId={job.id} appointments={appointments} defaultMinutes={defaultMinutes} gateCode={job.gateCode ?? null} />
```

- [ ] **Step 6: Hand gate code and notes to the card's dialogs**

Replace the whole of `app/admin/jobs/[id]/AppointmentsCard.tsx` with:

```tsx
import { Icon } from "@/components/admin/icons";
import type { Appointment } from "@/lib/admin/appointments";
import { APPOINTMENT_STYLE, kindLabel, type AppointmentKind } from "@/lib/admin/appointment-kinds";
import { formatShortDate, formatWhen, toLocalInput } from "@/lib/admin/time";
import { hoursLabel, adminWindowLabel } from "@/lib/routes/window";
import { CancelAppointmentButton, ConfirmScheduleButton } from "./AppointmentActions";
import { StatusCard } from "./OverviewCards";
import { ScheduleDialog } from "./ScheduleDialog";

/**
 * Every appointment on the job, and what each one still needs. A booking is only a plan until
 * Confirm schedule puts it on the calendar and tells the customer.
 */
export function AppointmentsCard({ jobId, appointments, defaultMinutes, gateCode }: {
  jobId: string; appointments: Appointment[]; defaultMinutes: Record<AppointmentKind, number>;
  /** The client's gate code, editable from the booking dialogs. Absent: the dialogs leave it alone. */
  gateCode?: string | null;
}) {
  return (
    <StatusCard title="Appointments" value={null} empty={appointments.length ? undefined : "Nothing scheduled"}>
      {appointments.length ? (
        <ul className="flex flex-col gap-3">
          {appointments.map((appointment) => (
            <Row key={appointment.id} jobId={jobId} appointment={appointment} defaultMinutes={defaultMinutes} gateCode={gateCode} />
          ))}
        </ul>
      ) : null}
      {appointments.length ? null : <ScheduleDialog jobId={jobId} gateCode={gateCode} defaultMinutes={defaultMinutes} />}
    </StatusCard>
  );
}

function Row({ jobId, appointment, defaultMinutes, gateCode }: {
  jobId: string; appointment: Appointment; defaultMinutes: Record<AppointmentKind, number>; gateCode?: string | null;
}) {
  const style = APPOINTMENT_STYLE[appointment.kind];
  const confirmed = appointment.confirmedAt !== null;
  const arrives = adminWindowLabel(appointment.windowStart, appointment.windowEnd);
  const when = appointment.allDay ? formatShortDate(appointment.startsAt) : formatWhen(appointment.startsAt);

  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 pl-3 ${style.left}`}>
      <span className={`inline-flex items-center gap-1.5 border border-rule bg-sand px-2 py-0.5 text-xs uppercase tracking-wide ${style.tint}`}>
        <Icon name={style.icon} className="size-3.5" />
        {kindLabel(appointment.kind)}
      </span>
      <span className="font-display text-base">{when}</span>
      {arrives ? <span className="text-xs text-ink-soft">Arrives {arrives}</span> : null}
      {appointment.durationMinutes ? <span className="text-xs text-ink-soft">{hoursLabel(appointment.durationMinutes)} h</span> : null}
      <span className="text-xs text-ink-soft">{confirmed ? "Confirmed" : "Pending confirmation"}</span>
      {/* A div, not a span: these hold forms, which a span may not contain. */}
      <div className="flex w-full flex-wrap items-center gap-2">
        {confirmed ? null : <ConfirmScheduleButton appointmentId={appointment.id} jobId={jobId} />}
        <ScheduleDialog jobId={jobId} label="Reschedule" kind={appointment.kind} allDay={appointment.allDay}
          startsAt={toLocalInput(appointment.startsAt)} windowStart={appointment.windowStart}
          windowEnd={appointment.windowEnd} durationMinutes={appointment.durationMinutes} defaultMinutes={defaultMinutes}
          gateCode={gateCode} designerNotes={appointment.designerNotes} />
        {confirmed ? <CancelAppointmentButton appointmentId={appointment.id} jobId={jobId} /> : null}
      </div>
    </li>
  );
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/admin/schedule-dialog.test.tsx tests/admin/job-header.test.tsx tests/admin/appointments-card.test.tsx tests/admin/overview-tab.test.tsx tests/admin/job-page-layout.test.tsx tests/admin/job-page-summary.test.tsx`
Expected: PASS.

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc --noEmit` — expected: no errors.
Run: `npx eslint "app/admin/jobs/[id]/modal.ts" "app/admin/jobs/[id]/ScheduleDialog.tsx" "app/admin/jobs/[id]/JobHeader.tsx" "app/admin/jobs/[id]/OverviewTab.tsx" "app/admin/jobs/[id]/AppointmentsCard.tsx" tests/admin/schedule-dialog.test.tsx tests/admin/job-header.test.tsx tests/admin/appointments-card.test.tsx` — expected: no output.

- [ ] **Step 9: Commit**

```bash
git add "app/admin/jobs/[id]/modal.ts" "app/admin/jobs/[id]/ScheduleDialog.tsx" "app/admin/jobs/[id]/JobHeader.tsx" "app/admin/jobs/[id]/OverviewTab.tsx" "app/admin/jobs/[id]/AppointmentsCard.tsx" tests/admin/schedule-dialog.test.tsx tests/admin/job-header.test.tsx tests/admin/appointments-card.test.tsx
git commit -m "feat: scheduler shows the gate code and takes designer notes; reschedule keeps them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Appointments card — show the notes, Edit notes without un-confirming

**Files:**
- Create: `app/admin/jobs/[id]/NotesDialog.tsx`
- Modify: `app/admin/jobs/[id]/AppointmentsCard.tsx` (whole file below)
- Test: `tests/admin/appointments-card.test.tsx`
- Mocks only (each mocks `@/app/admin/jobs/appointment-actions`, and a component it renders now imports `updateAppointmentNotes`): `tests/admin/overview-tab.test.tsx:11-14`, `tests/admin/job-page-layout.test.tsx:35-38`, `tests/admin/job-page-summary.test.tsx:43-46`, `tests/admin/job-header.test.tsx:10-13`

**Interfaces:**
- Consumes: `updateAppointmentNotes(appointmentId, jobId, _prev, formData)` (Task 4); `openModal`/`closeModal`/`subscribeNothing` (Task 5); `Appointment.designerNotes` (Task 1).
- Produces: `NotesDialog({ appointmentId: string; jobId: string; designerNotes: string | null; gateCode?: string | null })` — trigger button "Edit notes", `<dialog aria-label="Edit notes">`, fields "Gate code" (only when `gateCode !== undefined`) and "Designer notes", submit "Save notes"; `<details>` fallback without JavaScript.

- [ ] **Step 1: Write the failing tests**

In `tests/admin/appointments-card.test.tsx`, replace the action mocks and `beforeEach` (from `const cancelAppointmentAction` to the end of `beforeEach`):

```ts
const cancelAppointmentAction = vi.fn<(...args: unknown[]) => Promise<FormState>>(async () => ({ ok: true }));
vi.mock("@/app/admin/jobs/appointment-actions", () => ({
  bookAppointment: vi.fn(async () => ({})), confirmSchedule, cancelAppointmentAction,
}));

beforeEach(() => {
  confirmSchedule.mockClear().mockResolvedValue({ ok: true });
  cancelAppointmentAction.mockClear().mockResolvedValue({ ok: true });
});
```

with:

```ts
const cancelAppointmentAction = vi.fn<(...args: unknown[]) => Promise<FormState>>(async () => ({ ok: true }));
const updateAppointmentNotes = vi.fn<(...args: unknown[]) => Promise<FormState>>(async () => ({ ok: true }));
const bookAppointment = vi.fn<(...args: unknown[]) => Promise<FormState>>(async () => ({}));
vi.mock("@/app/admin/jobs/appointment-actions", () => ({
  bookAppointment, confirmSchedule, cancelAppointmentAction, updateAppointmentNotes,
}));

beforeEach(() => {
  confirmSchedule.mockClear().mockResolvedValue({ ok: true });
  cancelAppointmentAction.mockClear().mockResolvedValue({ ok: true });
  updateAppointmentNotes.mockClear().mockResolvedValue({ ok: true });
  bookAppointment.mockClear();
});
```

Append inside `describe("AppointmentsCard")`, before its final `});`:

```ts
  it("shows an appointment's designer notes with their line breaks kept", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment({ designerNotes: "Side gate sticks\n  Dog in the yard" })]} />);
    const row = within(card()).getByRole("listitem");
    const notes = within(row).getByText((_, element) => element?.tagName === "P" && element.textContent === "Side gate sticks\n  Dog in the yard");
    expect(notes.className).toMatch(/whitespace-pre-wrap/);
  });

  it("shows no notes block for an appointment without notes", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment()]} />);
    expect(within(card()).getByRole("listitem").querySelector(".whitespace-pre-wrap")).toBeNull();
  });

  it("offers Edit notes on pending and confirmed appointments alike", () => {
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[
      appointment(),
      appointment({ id: "b", kind: "measure", confirmedAt: new Date("2026-09-18T12:00:00Z"), confirmedBy: "owner@example.com" }),
    ]} />);
    const rows = within(card()).getAllByRole("listitem");
    for (const row of rows) expect(within(row).getByRole("button", { name: "Edit notes" })).toBeInTheDocument();
  });

  it("edits just the notes and the gate code of this appointment, never rebooking it", async () => {
    const user = userEvent.setup();
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} gateCode="#4321" appointments={[appointment({
      confirmedAt: new Date("2026-09-18T12:00:00Z"), confirmedBy: "owner@example.com", designerNotes: "Old note",
    })]} />);
    await user.click(screen.getByRole("button", { name: "Edit notes" }));
    const dialog = screen.getByRole("dialog", { name: "Edit notes" });
    const notes = within(dialog).getByLabelText("Designer notes");
    expect(notes).toHaveValue("Old note");
    expect(within(dialog).getByLabelText("Gate code")).toHaveValue("#4321");
    await user.clear(notes);
    await user.type(notes, "New note");
    await user.click(within(dialog).getByRole("button", { name: "Save notes" }));
    expect(updateAppointmentNotes).toHaveBeenCalled();
    expect(updateAppointmentNotes.mock.calls[0].slice(0, 2)).toEqual([APPT, ID]);
    const data = updateAppointmentNotes.mock.calls[0][3] as FormData;
    expect(data.get("designerNotes")).toBe("New note");
    expect(data.get("gateCode")).toBe("#4321");
    expect(data.has("startsAt")).toBe(false);
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  it("shows why a notes edit failed", async () => {
    updateAppointmentNotes.mockResolvedValue({ error: "Keep the designer notes under 2,000 characters" });
    const user = userEvent.setup();
    render(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment()]} />);
    await user.click(screen.getByRole("button", { name: "Edit notes" }));
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Keep the designer notes under 2,000 characters");
  });

  it("degrades Edit notes to a disclosure holding the same form without JavaScript", () => {
    const html = renderToStaticMarkup(<AppointmentsCard jobId={ID} defaultMinutes={MINUTES} appointments={[appointment({ designerNotes: "Old note" })]} />);
    expect(html).toContain("Edit notes</summary>");
    expect(html).toContain("Save notes");
  });
```

In each of `tests/admin/overview-tab.test.tsx`, `tests/admin/job-page-layout.test.tsx`, `tests/admin/job-page-summary.test.tsx` and `tests/admin/job-header.test.tsx`, replace:

```ts
  cancelAppointmentAction: vi.fn(async () => ({})),
}));
```

(the end of the `vi.mock("@/app/admin/jobs/appointment-actions", …)` block) with:

```ts
  cancelAppointmentAction: vi.fn(async () => ({})), updateAppointmentNotes: vi.fn(async () => ({})),
}));
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/appointments-card.test.tsx`
Expected: FAIL — no "Edit notes" button, no notes paragraph.

- [ ] **Step 3: Create `NotesDialog.tsx`**

Create `app/admin/jobs/[id]/NotesDialog.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { updateAppointmentNotes } from "../appointment-actions";
import type { FormState } from "../actions";
import { closeModal, openModal, subscribeNothing } from "./modal";

const CONTROL = "min-h-11 w-full border border-rule bg-ivory px-4 py-3";
const QUIET_BUTTON = "min-h-11 px-3 text-sm text-ink-soft underline underline-offset-4";

/**
 * "Edit notes" on one appointment: its designer notes, and the client's gate code, without touching
 * its time — so it never sends a confirmed appointment back for confirmation. The action syncs
 * Outlook, which rewrites the event body of a confirmed appointment. Without JavaScript the same form
 * sits inside a <details> disclosure, which posts the action the ordinary way.
 */
export function NotesDialog({ appointmentId, jobId, designerNotes, gateCode }: {
  appointmentId: string;
  jobId: string;
  designerNotes: string | null;
  /** The client's gate code (null when there is none). Absent: no field, and the save leaves it alone. */
  gateCode?: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateAppointmentNotes.bind(null, appointmentId, jobId), {},
  );
  const enhanced = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const dialog = useRef<HTMLDialogElement>(null);
  // One of these per appointment row, so the ids must be unique per instance.
  const uid = useId();
  useEffect(() => { if (state.ok) closeModal(dialog.current); }, [state]);
  // A failed save redraws what was typed: React 19 resets the form to these defaults after the action.
  const seeded = (name: "designerNotes" | "gateCode", fallback: string | null) => {
    const echoed = state.values?.[name];
    return typeof echoed === "string" ? echoed : fallback ?? "";
  };

  const fields = (
    <form action={action} className="flex flex-col gap-4 text-sm">
      {gateCode !== undefined ? (
        <label htmlFor={`notesGate-${uid}`} className="flex flex-col gap-2">
          Gate code
          <input id={`notesGate-${uid}`} name="gateCode" type="text" maxLength={40} autoComplete="off" className={CONTROL}
            defaultValue={seeded("gateCode", gateCode)} />
        </label>
      ) : null}
      <label htmlFor={`notes-${uid}`} className="flex flex-col gap-2">
        Designer notes
        <textarea id={`notes-${uid}`} name="designerNotes" rows={5} maxLength={2000} className={CONTROL}
          defaultValue={seeded("designerNotes", designerNotes)} />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="solid" disabled={pending}>{pending ? "Saving…" : "Save notes"}</Button>
        {enhanced ? (
          <button type="button" className="text-sm underline underline-offset-4"
            onClick={() => closeModal(dialog.current)}>Close</button>
        ) : null}
        {state.error ? <p role="alert" className="w-full text-sm text-overdue">{state.error}</p> : null}
      </div>
    </form>
  );

  if (!enhanced) {
    return (
      <details>
        <summary className={`${QUIET_BUTTON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Edit notes</summary>
        <div className="mt-2 border border-rule bg-ivory p-3">{fields}</div>
      </details>
    );
  }

  return (
    <>
      <button type="button" className={QUIET_BUTTON} onClick={() => openModal(dialog.current)}>Edit notes</button>
      <dialog ref={dialog} aria-label="Edit notes" className="w-[min(28rem,92vw)] border border-rule bg-ivory p-5 backdrop:bg-charcoal/40">
        {fields}
      </dialog>
    </>
  );
}
```

- [ ] **Step 4: Show the notes and the control on each row**

Replace the whole of `app/admin/jobs/[id]/AppointmentsCard.tsx` with:

```tsx
import { Icon } from "@/components/admin/icons";
import type { Appointment } from "@/lib/admin/appointments";
import { APPOINTMENT_STYLE, kindLabel, type AppointmentKind } from "@/lib/admin/appointment-kinds";
import { formatShortDate, formatWhen, toLocalInput } from "@/lib/admin/time";
import { hoursLabel, adminWindowLabel } from "@/lib/routes/window";
import { CancelAppointmentButton, ConfirmScheduleButton } from "./AppointmentActions";
import { NotesDialog } from "./NotesDialog";
import { StatusCard } from "./OverviewCards";
import { ScheduleDialog } from "./ScheduleDialog";

/**
 * Every appointment on the job, and what each one still needs. A booking is only a plan until
 * Confirm schedule puts it on the calendar and tells the customer.
 */
export function AppointmentsCard({ jobId, appointments, defaultMinutes, gateCode }: {
  jobId: string; appointments: Appointment[]; defaultMinutes: Record<AppointmentKind, number>;
  /** The client's gate code, editable from the booking dialogs. Absent: the dialogs leave it alone. */
  gateCode?: string | null;
}) {
  return (
    <StatusCard title="Appointments" value={null} empty={appointments.length ? undefined : "Nothing scheduled"}>
      {appointments.length ? (
        <ul className="flex flex-col gap-3">
          {appointments.map((appointment) => (
            <Row key={appointment.id} jobId={jobId} appointment={appointment} defaultMinutes={defaultMinutes} gateCode={gateCode} />
          ))}
        </ul>
      ) : null}
      {appointments.length ? null : <ScheduleDialog jobId={jobId} gateCode={gateCode} defaultMinutes={defaultMinutes} />}
    </StatusCard>
  );
}

function Row({ jobId, appointment, defaultMinutes, gateCode }: {
  jobId: string; appointment: Appointment; defaultMinutes: Record<AppointmentKind, number>; gateCode?: string | null;
}) {
  const style = APPOINTMENT_STYLE[appointment.kind];
  const confirmed = appointment.confirmedAt !== null;
  const arrives = adminWindowLabel(appointment.windowStart, appointment.windowEnd);
  const when = appointment.allDay ? formatShortDate(appointment.startsAt) : formatWhen(appointment.startsAt);

  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 pl-3 ${style.left}`}>
      <span className={`inline-flex items-center gap-1.5 border border-rule bg-sand px-2 py-0.5 text-xs uppercase tracking-wide ${style.tint}`}>
        <Icon name={style.icon} className="size-3.5" />
        {kindLabel(appointment.kind)}
      </span>
      <span className="font-display text-base">{when}</span>
      {arrives ? <span className="text-xs text-ink-soft">Arrives {arrives}</span> : null}
      {appointment.durationMinutes ? <span className="text-xs text-ink-soft">{hoursLabel(appointment.durationMinutes)} h</span> : null}
      <span className="text-xs text-ink-soft">{confirmed ? "Confirmed" : "Pending confirmation"}</span>
      {/* Owner-only, like the gate code: the portal and the customer's emails never show these. */}
      {appointment.designerNotes ? (
        <div className="w-full text-sm">
          <span className="text-xs uppercase tracking-wide text-ink-soft">Designer notes</span>
          <p className="whitespace-pre-wrap">{appointment.designerNotes}</p>
        </div>
      ) : null}
      {/* A div, not a span: these hold forms, which a span may not contain. */}
      <div className="flex w-full flex-wrap items-center gap-2">
        {confirmed ? null : <ConfirmScheduleButton appointmentId={appointment.id} jobId={jobId} />}
        <ScheduleDialog jobId={jobId} label="Reschedule" kind={appointment.kind} allDay={appointment.allDay}
          startsAt={toLocalInput(appointment.startsAt)} windowStart={appointment.windowStart}
          windowEnd={appointment.windowEnd} durationMinutes={appointment.durationMinutes} defaultMinutes={defaultMinutes}
          gateCode={gateCode} designerNotes={appointment.designerNotes} />
        <NotesDialog appointmentId={appointment.id} jobId={jobId} designerNotes={appointment.designerNotes} gateCode={gateCode} />
        {confirmed ? <CancelAppointmentButton appointmentId={appointment.id} jobId={jobId} /> : null}
      </div>
    </li>
  );
}
```

(The notes block is a `<div>` with a `<p class="whitespace-pre-wrap">`, never a direct `<span>` child of the `<li>`: `e2e/appointments.spec.ts`'s `kindChip` matches `li > span`.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --maxWorkers=2 tests/admin/appointments-card.test.tsx tests/admin/overview-tab.test.tsx tests/admin/job-page-layout.test.tsx tests/admin/job-page-summary.test.tsx tests/admin/job-header.test.tsx tests/admin/schedule-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit` — expected: no errors.
Run: `npx eslint "app/admin/jobs/[id]/NotesDialog.tsx" "app/admin/jobs/[id]/AppointmentsCard.tsx" tests/admin/appointments-card.test.tsx tests/admin/overview-tab.test.tsx tests/admin/job-page-layout.test.tsx tests/admin/job-page-summary.test.tsx tests/admin/job-header.test.tsx` — expected: no output.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/jobs/[id]/NotesDialog.tsx" "app/admin/jobs/[id]/AppointmentsCard.tsx" tests/admin/appointments-card.test.tsx tests/admin/overview-tab.test.tsx tests/admin/job-page-layout.test.tsx tests/admin/job-page-summary.test.tsx tests/admin/job-header.test.tsx
git commit -m "feat: appointment rows show designer notes, with Edit notes that keeps the confirmation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Prove it on a real Neon branch, and end-to-end

**Files:**
- Create: `scripts/verify-designer-notes.ts`, `scripts/verify-designer-notes.config.mts` (the pattern of `scripts/verify-measure-kinds.ts` / `scripts/verify-contacted.ts`: `E2E_POSTGRES_URL` only, refuse `ep-cold-term`, never print the URL, clean up in `finally`)
- Modify: `e2e/appointments.spec.ts` (append one test)

The controller supplies the Neon test branch (its URL in a file or the environment, and its `ep-…` id). Do not run anything against production.

**Interfaces:**
- Consumes: everything above. The verify script calls `saveAppointment`, `setAppointmentNotes`, `confirmAppointment`, `listAppointments` (Task 1), `updateDetails` (Task 4), `getCalendarJob`, `saveLink`, `getLinks`, `getLinkByEvent`, `claimLink` (Tasks 2-3). It never calls Graph.
- Produces: a manual proof and one e2e journey. No production code.

- [ ] **Step 1: Write the vitest config for the script**

Create `scripts/verify-designer-notes.config.mts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/**
 * Runs scripts/verify-designer-notes.ts and nothing else.
 *
 * It needs a config of its own because the script imports the real
 * lib/admin/appointments.ts, lib/admin/jobs.ts and lib/calendar/store.ts, which need the `@` alias
 * and the server-only stub — the same resolution the unit suite uses. It is deliberately NOT reachable from
 * vitest.config.mts, whose `include` is tests/**\/*.test.ts: this script must
 * never be swept into `npm test` and counted as coverage. It is run by hand.
 */
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["scripts/verify-designer-notes.ts"],
    // Real network round trips to a Neon branch, so more generous than a unit test.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": root,
      "server-only": path.resolve(root, "tests/server-only-stub.ts"),
    },
  },
});
```

- [ ] **Step 2: Write the verify script**

Create `scripts/verify-designer-notes.ts`:

```ts
/**
 * Behavioural proof of designer notes and the event-body hash: migration 035, saveAppointment and
 * setAppointmentNotes in lib/admin/appointments.ts, updateDetails' gateCodeChanged in lib/admin/jobs.ts,
 * and getCalendarJob / saveLink / getLinks / getLinkByEvent in lib/calendar/store.ts.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is a script you run by hand, it is in no
 * suite, and CI does not execute it. Nothing runs it for you. If you change any of the
 * functions above or migration 035, run it yourself — and if you cannot, say the designer-notes
 * rules are unverified rather than assuming they hold.
 *
 * Why it exists: the unit tests mock the database, so they pin the SQL *text*, which is a tripwire,
 * not a proof. Whether a notes edit really leaves confirmed_at alone, whether the gate code really
 * stays out of job_events, whether the length check really exists and whether migration 035 really
 * re-runs are things only the database can answer. This script calls the real functions — no mocks.
 * It never calls Outlook.
 *
 * What it does, against a throwaway database, with one lead it inserts ("VERIFY Designer Notes <stamp>"):
 *   1. runs every statement of 035_designer_notes.sql twice — the second run must not throw;
 *   2. books a measure with notes and a gate code — "ok", the notes on the row, unconfirmed, the
 *      gate code on the lead, and no job_events body holding the gate code or the notes;
 *   3. listAppointments reads the notes back;
 *   4. confirms it, then setAppointmentNotes with new notes and a new gate code — "ok", the notes
 *      and gate code change, confirmed_at / confirmed_by / updated_at are exactly as before, one
 *      "Measure notes updated" event, and still no body holding the gate code or the notes;
 *   5. setAppointmentNotes without a gate code leaves the gate code alone;
 *   6. setAppointmentNotes with another job's id is "missing" and changes nothing;
 *   7. getCalendarJob returns the gate code and the confirmed measure's notes;
 *   8. saveLink stores a body hash, getLinks and getLinkByEvent read it back, a second saveLink
 *      replaces it, and a claim (claimLink) has a null hash;
 *   9. updateDetails reports gateCodeChanged true for a new gate code and false for the same one;
 *  10. rescheduling (saveAppointment again) keeps the notes it is given and un-confirms;
 *  11. a raw update setting 2001 characters of notes THROWS appointments_designer_notes_check.
 * Then it deletes its job_calendar_events, job_events, appointments and lead, so repeated runs leave
 * no residue.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. Point it only at a Neon test branch. Step 1 re-runs
 * migration 035 against the whole branch.
 * It takes its connection from E2E_POSTGRES_URL alone — never POSTGRES_URL,
 * DATABASE_URL or .env.local, all of which may hold production credentials —
 * and it refuses to start if that URL looks like production (ep-cold-term).
 *
 * Usage (bash):
 *   E2E_POSTGRES_URL='<neon test branch url>' \
 *     npx vitest run --config scripts/verify-designer-notes.config.mts
 *
 * To watch it fail (which is the only way to know it works), one at a time:
 *   - in setAppointmentNotes, add `, confirmed_at = null` after `designer_notes = ${details.designerNotes}::text`
 *     — step 4 "confirmed_at is unchanged" must fail;
 *   - in setAppointmentNotes, change the log body to `'notes: ' || ${details.designerNotes}::text`
 *     — step 4 "no job_events body holds the notes" must fail;
 *   - in saveLink, drop `body_hash = excluded.body_hash, ` — step 8 "a second saveLink replaces the hash" must fail.
 * Put each back.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { test } from "vitest";
import { confirmAppointment, listAppointments, saveAppointment, setAppointmentNotes } from "../lib/admin/appointments";
import { updateDetails } from "../lib/admin/jobs";
import { claimLink, getCalendarJob, getLinkByEvent, getLinks, saveLink } from "../lib/calendar/store";

/** Endpoints this script must never write to. Production is the whole point of the list. */
const FORBIDDEN_HOSTS = ["ep-cold-term"];

const BANNER = "\n================ verify-designer-notes REFUSED TO RUN ================\n";

function refuse(reason: string): never {
  // Printed as well as thrown: the thrown message is what sets the exit code,
  // the print is what a human actually reads in the terminal.
  console.error(`${BANNER}${reason}\n`);
  throw new Error(`verify-designer-notes refused to run: ${reason}`);
}

const url = process.env.E2E_POSTGRES_URL;
if (!url) {
  refuse(
    "E2E_POSTGRES_URL is not set.\n\n" +
      "This script WRITES rows, so it will not fall back to POSTGRES_URL, DATABASE_URL\n" +
      "or .env.local — any of which may point at production. Give it a Neon test branch:\n\n" +
      "  E2E_POSTGRES_URL='<neon test branch url>' \\\n" +
      "    npx vitest run --config scripts/verify-designer-notes.config.mts\n\n" +
      "It does not skip. No result means it did not run, not that the rules hold.",
  );
}

const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return refuse(`E2E_POSTGRES_URL is not a valid URL, so its host cannot be checked.`);
  }
})();

for (const forbidden of FORBIDDEN_HOSTS) {
  if (host.includes(forbidden)) {
    refuse(
      `E2E_POSTGRES_URL points at ${host}, which matches the production endpoint "${forbidden}".\n\n` +
        "This script inserts and deletes rows and re-runs a migration. Running it there would\n" +
        "touch the owners' real data. Cut a Neon branch and point it at that instead.",
    );
  }
}

// The functions under test read the connection through lib/db's db(), at call time, from
// POSTGRES_URL. Set it from the vetted URL so the module under test cannot reach anything
// this script has not just checked.
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;

const sql = neon(url);
const STAMP = Date.now();
const LEAD_NAME = `VERIFY Designer Notes ${STAMP}`;
const ACTOR = "verify-designer-notes@example.com";
const GATE_1 = `#G1-${STAMP}`;
const GATE_2 = `#G2-${STAMP}`;
const NOTES_1 = `Side gate sticks ${STAMP}\nDog in the yard`;
const NOTES_2 = `Bring motorized samples ${STAMP}`;
const AT = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
const NO_TIMING = { windowStart: null, windowEnd: null, durationMinutes: null };

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}

const statements = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
    .split(";").map((s) => s.trim()).filter(Boolean);

/** Timestamps as Postgres text, so "unchanged" is checked to the microsecond. */
const appointmentRow = async (lead: string) => {
  const rows = await sql`
    select id, designer_notes, confirmed_at::text as confirmed_at, confirmed_by, updated_at::text as updated_at
      from appointments where lead_id = ${lead} and kind = 'measure'`;
  return rows[0] as {
    id: string; designer_notes: string | null; confirmed_at: string | null; confirmed_by: string | null; updated_at: string;
  };
};

const gateOf = async (lead: string): Promise<string | null> => {
  const rows = await sql`select gate_code from leads where id = ${lead}`;
  return (rows[0]?.gate_code as string | null) ?? null;
};

/** Bodies of this lead's events that contain any of the given secrets. */
const leaking = async (lead: string, secrets: string[]): Promise<string[]> => {
  const rows = await sql`select coalesce(body, '') as body from job_events where lead_id = ${lead}`;
  return rows.map((row) => row.body as string).filter((body) => secrets.some((secret) => body.includes(secret)));
};

async function throwsWith(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

test("designer notes and the event-body hash against a real database", async () => {
  console.log(`\nverify-designer-notes: writing to ${host}\n`);

  // 1. Migration 035, twice: every statement must be safe to re-run.
  for (let run = 1; run <= 2; run += 1) {
    for (const statement of statements("db/migrations/035_designer_notes.sql")) await sql.query(statement);
  }
  check(true, "migration 035 ran twice without an error", "");

  const rows = await sql`
    insert into leads (name, phone, email, city, source, status)
    values (${LEAD_NAME}, '7025550199', ${`verify-notes-${STAMP}@example.com`}, 'Henderson', 'phone', 'quoted')
    returning id`;
  const lead = rows[0].id as string;
  const eventId = `verify-notes-${STAMP}`;

  try {
    // 2. Book with notes and a gate code.
    const booked = await saveAppointment(lead, "measure", AT, false, NO_TIMING, ACTOR, { designerNotes: NOTES_1, gateCode: GATE_1 });
    check(booked === "ok", "booking a measure with notes and a gate code is accepted", `saveAppointment returned ${booked}`);
    const first = await appointmentRow(lead);
    check(first.designer_notes === NOTES_1, "the notes are on the appointment, line break kept", `designer_notes is ${JSON.stringify(first.designer_notes)}`);
    check(first.confirmed_at === null, "the booking is unconfirmed", `confirmed_at is ${first.confirmed_at}`);
    check((await gateOf(lead)) === GATE_1, "the gate code is on the client", `gate_code is ${await gateOf(lead)}`);
    const leak2 = await leaking(lead, [GATE_1, NOTES_1, `Side gate sticks ${STAMP}`]);
    check(leak2.length === 0, "no job_events body holds the gate code or the notes", `leaking bodies: ${JSON.stringify(leak2)}`);

    // 3. Read back through listAppointments.
    const listed = await listAppointments(lead);
    check(listed[0]?.designerNotes === NOTES_1, "listAppointments reads the notes", `designerNotes is ${JSON.stringify(listed[0]?.designerNotes)}`);

    // 4. Confirm, then edit the notes and the gate code: still confirmed, nothing else moved.
    const confirmed = await confirmAppointment(first.id, ACTOR);
    check(typeof confirmed === "object", "the measure is confirmed", `confirmAppointment returned ${JSON.stringify(confirmed)}`);
    const before = await appointmentRow(lead);
    const edited = await setAppointmentNotes(lead, first.id, { designerNotes: NOTES_2, gateCode: GATE_2 }, ACTOR);
    check(edited === "ok", "editing the notes is accepted", `setAppointmentNotes returned ${edited}`);
    const after = await appointmentRow(lead);
    check(after.designer_notes === NOTES_2, "the notes changed", `designer_notes is ${JSON.stringify(after.designer_notes)}`);
    check(
      after.confirmed_at === before.confirmed_at && after.confirmed_at !== null,
      "confirmed_at is unchanged — a notes edit never un-confirms",
      `before ${before.confirmed_at}, after ${after.confirmed_at} — NOTES EDIT TOUCHED THE CONFIRMATION`,
    );
    check(after.confirmed_by === ACTOR, "confirmed_by is unchanged", `confirmed_by is ${after.confirmed_by}`);
    check(after.updated_at === before.updated_at, "updated_at is unchanged (the route planner reads it)",
      `before ${before.updated_at}, after ${after.updated_at}`);
    check((await gateOf(lead)) === GATE_2, "the gate code changed on the client", `gate_code is ${await gateOf(lead)}`);
    const notesEvents = await sql`select count(*)::int as n from job_events where lead_id = ${lead} and body = 'Measure notes updated'`;
    check(Number(notesEvents[0].n) === 1, `one event "Measure notes updated"`, `found ${notesEvents[0].n}`);
    const leak4 = await leaking(lead, [GATE_1, GATE_2, NOTES_1, NOTES_2]);
    check(leak4.length === 0, "still no job_events body holds a gate code or notes", `leaking bodies: ${JSON.stringify(leak4)}`);

    // 5. Without a gate code, the gate code is left alone.
    await setAppointmentNotes(lead, first.id, { designerNotes: NOTES_2 }, ACTOR);
    check((await gateOf(lead)) === GATE_2, "a notes edit without a gate code leaves it alone", `gate_code is ${await gateOf(lead)}`);

    // 6. Another job's id finds nothing and changes nothing.
    const wrongJob = await setAppointmentNotes(randomUUID(), first.id, { designerNotes: "nope" }, ACTOR);
    check(wrongJob === "missing", "another job's id is \"missing\"", `setAppointmentNotes returned ${wrongJob}`);
    check((await appointmentRow(lead)).designer_notes === NOTES_2, "and the notes are untouched", "");

    // 7. The calendar's view of the job.
    const job = await getCalendarJob(lead);
    check(job?.gateCode === GATE_2, "getCalendarJob reads the gate code", `gateCode is ${job?.gateCode}`);
    check(
      job?.appointments.length === 1 && job.appointments[0].designerNotes === NOTES_2,
      "getCalendarJob reads the confirmed measure's notes",
      `appointments are ${JSON.stringify(job?.appointments)}`,
    );

    // 8. The body hash on the link.
    await saveLink({ leadId: lead, kind: "measure", eventId, changeKey: "ck1", bodyHash: "hash-1" });
    const links = await getLinks(lead);
    check(links[0]?.bodyHash === "hash-1", "getLinks reads the stored body hash", `links are ${JSON.stringify(links)}`);
    await saveLink({ leadId: lead, kind: "measure", eventId, changeKey: "ck2", bodyHash: "hash-2" });
    const byEvent = await getLinkByEvent(eventId);
    check(byEvent?.bodyHash === "hash-2" && byEvent.changeKey === "ck2", "a second saveLink replaces the hash and changeKey",
      `link is ${JSON.stringify(byEvent)}`);
    const claim = await claimLink(lead, "consultation");
    const claimed = (await getLinks(lead)).find((l) => l.kind === "consultation");
    check(claim !== null && claimed?.bodyHash === null, "a claim has no body hash", `claim link is ${JSON.stringify(claimed)}`);

    // 9. updateDetails reports a gate-code change only when there is one.
    const details = {
      address: null, city: "Henderson", brands: [], orderedOn: null, budgetTier: null,
      windowCountExact: null, treatmentTypes: [], motorized: false,
    };
    const changed = await updateDetails(lead, { ...details, gateCode: GATE_1 }, ACTOR);
    check(changed.saved && changed.gateCodeChanged, "updateDetails reports a new gate code", JSON.stringify(changed));
    const same = await updateDetails(lead, { ...details, gateCode: GATE_1 }, ACTOR);
    check(same.saved && !same.gateCodeChanged, "updateDetails reports the same gate code as unchanged", JSON.stringify(same));

    // 10. A reschedule keeps the notes the dialog sends, and un-confirms as before.
    const later = new Date(AT.getTime() + 24 * 60 * 60 * 1000);
    await saveAppointment(lead, "measure", later, false, NO_TIMING, ACTOR, { designerNotes: NOTES_2 });
    const moved = await appointmentRow(lead);
    check(moved.designer_notes === NOTES_2, "a reschedule keeps the notes it was given", `designer_notes is ${JSON.stringify(moved.designer_notes)}`);
    check(moved.confirmed_at === null, "a reschedule still un-confirms", `confirmed_at is ${moved.confirmed_at}`);

    // 11. The database itself caps the notes.
    const tooLong = await throwsWith(() => sql`update appointments set designer_notes = ${"x".repeat(2001)} where id = ${first.id}`);
    check(
      tooLong !== null && tooLong.includes("appointments_designer_notes_check"),
      "a raw update with 2001 characters of notes throws appointments_designer_notes_check",
      tooLong === null ? "the raw update succeeded — THE DATABASE DOES NOT CAP THE NOTES" : `it threw something else: ${tooLong}`,
    );

    console.log(
      "\nPASSED: designer notes and the body hash behave as designed against a real database.\n" +
        "This was a manual run. It proves the rules as of now; it is not ongoing coverage.\n",
    );
  } finally {
    // Runs even on failure, so a red run leaves no residue either.
    await sql`delete from job_calendar_events where lead_id = ${lead}`;
    await sql`delete from job_events where lead_id = ${lead}`;
    await sql`delete from appointments where lead_id = ${lead}`;
    await sql`delete from leads where id = ${lead}`;
  }
});
```

- [ ] **Step 3: Check it refuses without a URL, and typechecks**

Run: `env -u E2E_POSTGRES_URL npx vitest run --config scripts/verify-designer-notes.config.mts`
Expected: FAIL with `verify-designer-notes REFUSED TO RUN` and `E2E_POSTGRES_URL is not set.`

Run: `npx tsc --noEmit` and `npx eslint scripts/verify-designer-notes.ts scripts/verify-designer-notes.config.mts` — expected: clean.

- [ ] **Step 4: Run it against the Neon test branch, twice**

Bring the branch up to date first (all migrations, so 034 from another session does not matter; `migrate.mjs` prints only the host):

```bash
MIGRATE_DATABASE_URL="$E2E_POSTGRES_URL" node scripts/migrate.mjs
E2E_POSTGRES_URL="$E2E_POSTGRES_URL" npx vitest run --config scripts/verify-designer-notes.config.mts
E2E_POSTGRES_URL="$E2E_POSTGRES_URL" npx vitest run --config scripts/verify-designer-notes.config.mts
```

Expected: both runs print every `ok` line and `PASSED: designer notes and the body hash behave as designed against a real database.` Step 1 of the script runs migration 035 twice more each time, so the migration is applied at least three times in total.

- [ ] **Step 5: Watch it fail**

One at a time, make each change listed under "To watch it fail" in the script's header, run the script once, confirm the named check fails, and put the code back. Then confirm `git diff --stat lib/` is empty.

- [ ] **Step 6: Add the e2e journey**

Append to `e2e/appointments.spec.ts`:

```ts
test("designer notes and the gate code are booked in the dialog, and Edit notes never un-confirms", async ({ page }) => {
  const name = `E2E Appt Notes ${STAMP}`;
  const day = lasVegasDay(7);
  const gate = `#E2E-${STAMP}`;
  const id = await lead(name);
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);

  // The gate code sits at the top of the booking dialog and the notes below the time fields.
  await card(page).getByRole("button", { name: "Schedule" }).click();
  const modal = scheduleModal(page);
  await modal.getByLabel("Gate code").fill(gate);
  await modal.getByLabel("Date and time").fill(`${day}T10:00`);
  await modal.getByRole("radio", { name: "Measure" }).check();
  await modal.getByLabel("Designer notes").fill("Side gate sticks\nBring motorized samples");
  await modal.getByRole("button", { name: "Save", exact: true }).click();

  // The row shows the notes. Scoped to the notes paragraph: the row's dialogs hold the same text in their textareas.
  const notes = card(page).locator("li p.whitespace-pre-wrap");
  await expect(notes).toContainText("Side gate sticks");
  await card(page).getByRole("button", { name: "Confirm schedule" }).click();
  await expect(card(page).getByText("Confirmed", { exact: true })).toBeVisible();

  // Edit notes changes the notes only: the appointment stays confirmed.
  await card(page).getByRole("button", { name: "Edit notes" }).click();
  const notesModal = page.getByRole("dialog", { name: "Edit notes" });
  await expect(notesModal.getByLabel("Gate code")).toHaveValue(gate);
  await notesModal.getByLabel("Designer notes").fill("Measure the patio door too");
  await notesModal.getByRole("button", { name: "Save notes" }).click();
  await expect(notes).toContainText("Measure the patio door too");
  await expect(card(page).getByText("Confirmed", { exact: true })).toBeVisible();

  const [row] = await sql()`select a.designer_notes, a.confirmed_at is not null as confirmed, l.gate_code
    from appointments a join leads l on l.id = a.lead_id where a.lead_id = ${id}`;
  expect(row).toMatchObject({ designer_notes: "Measure the patio door too", confirmed: true, gate_code: gate });

  // The gate code is owner-only: it never reaches the activity log.
  const events = await sql()`select coalesce(body, '') as body from job_events where lead_id = ${id}`;
  expect(events.map((event) => event.body as string).join("\n")).not.toContain(gate);
});
```

(The lead name starts `E2E Appt`, so the file's `afterAll` cleanup removes it; its appointments and events cascade.)

- [ ] **Step 7: Run the appointments e2e in the FOREGROUND against the test branch**

```bash
E2E_POSTGRES_URL="$E2E_POSTGRES_URL" E2E_TEST_ENDPOINT=<ep-id of the test branch> npx playwright test e2e/appointments.spec.ts --project=desktop
```

Expected: 5 passed, 0 skipped, 0 did not run. (The web server builds production first; allow several minutes.)

- [ ] **Step 8: Falsify one e2e assertion**

Change `"Measure the patio door too"` in the final `toMatchObject` to `"something else"`, run Step 7 again, confirm only the new test fails at that line, then restore it.

- [ ] **Step 9: Commit**

```bash
git add scripts/verify-designer-notes.ts scripts/verify-designer-notes.config.mts e2e/appointments.spec.ts
git commit -m "test: verify designer notes against a real branch, and an e2e journey" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Whole-branch review, then ship (controller only; owner OK required)

- [ ] **Step 1: Full checks**

```bash
npx vitest run --maxWorkers=2
npx tsc --noEmit
npx eslint $(git diff --name-only origin/main...HEAD -- '*.ts' '*.tsx' '*.mts')
npx next build
```

Expected: all green.

- [ ] **Step 2: Whole-branch review against the spec.** A fresh reviewer re-derives each owner decision in spec §2 and every item of this plan's Review Focus from the code, including: `grep -rnE "designer_notes|designerNotes|gate_code|gateCode" lib/portal lib/appointments` shows nothing this branch added; no `job_events` insert carries the notes or the gate code; `lib/admin/appointments.ts` still imports nothing from `lib/calendar`.

- [ ] **Step 3: STOP — confirm the owner's OK** for (a) applying migration 035 to production and (b) pushing to main (which deploys). If it is not on record, ask and wait.

- [ ] **Step 4: Production migration BEFORE the code ships.** The new code selects `appointments.designer_notes` and `job_calendar_events.body_hash`, so production must have them first. Following the `pss-production-migrations` memory: confirm the target endpoint is `ep-cold-term` without printing the URL; run `node scripts/migrate.mjs` from this worktree; then verify read-only that both columns and `appointments_designer_notes_check` exist and that the `appointments` and `job_calendar_events` row counts are unchanged.

- [ ] **Step 5: Ship.** Rebase `feat/designer-notes` on `origin/main`, re-run `npx vitest run --maxWorkers=2`, then `git push origin feat/designer-notes:main`. Confirm the production deploy (for example `vercel ls --prod`).

- [ ] **Step 6: Owner's live check.** Ask the owner to book and confirm one test appointment with a gate code and notes, check the event body in the support@ Outlook calendar, then use Edit notes and check the body updates and the appointment stays confirmed. Existing confirmed events get their body rewritten once (null hash) on their next reconcile; that is expected.

---

## Spec coverage (self-review)

| Spec | Where |
|---|---|
| §2 notes per appointment, gate code per client | Task 1 (column, `AppointmentDetails`), Task 4 |
| §2 edits after booking update Outlook (notes; gate code from Details, call form, questionnaire) | Task 4 triggers; call form already syncs (`call-actions.ts:52`); Task 3 body PATCH |
| §2 admin is the source of truth for notes | Task 3 (hash of our text; Outlook's body never read) |
| §2 gate code out of portal, `job_events`, emails | Task 1 + 4 tests, Task 7 verify + e2e, Review Focus 3 |
| §3 dialog: gate code at top (max 40), notes textarea (max 2000), reschedule pre-fills and keeps notes, still un-confirms | Task 5, Task 4 schema, Task 1 |
| §3 card shows notes (whitespace kept); Edit notes without reschedule or un-confirm; confirmed event updates | Task 6, Task 1 `setAppointmentNotes`, Task 4 action |
| §3 body order and content; subject/location/timing unchanged | Task 2 `eventText` |
| §3 no churn: hash, PATCH with time/subject, store hash + changeKey, legacy null hash once, Outlook-newer rule | Task 3 |
| §4 migration 035, re-runnable, no backfill | Task 1, Task 7 (applied twice+) |
| §5 out of scope (event length, call-page quick booking, portal/emails) | untouched: `newEventBody` timing, `logCall`, `lib/portal`, `lib/appointments/send.ts` |
| §6 unit, actions, UI, real DB, mocked Graph, owner's live check | Tasks 1-7, Task 8 Step 6 |
