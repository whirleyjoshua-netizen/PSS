# Call-Back Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each job carries one next call-back (time + short reason), set from the call screen or the job page, listed as "Follow-ups due" on the board, and emailed to both owners each morning.

**Architecture:** Two nullable `leads` columns (migration 009). Pure helpers (quick picks, labels, due window) in `lib/admin/follow-up.ts`; validation in `lib/admin/schema.ts`; one-statement set/clear/list in `lib/admin/follow-ups.ts`; the call save (`logCall`) sets or clears the follow-up. UI: a call-back block in `CallForm`, a self-contained `FollowUpBox`, a `FollowUpsDue` list on the board. A Vercel Cron route sends the morning digest through Resend.

**Tech Stack:** Next.js 16.3 App Router (Server Actions, `useActionState`), Neon Postgres (`@neondatabase/serverless`), Resend, zod 4, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-14-follow-up-reminders-design.md`

## Global Constraints

- One follow-up per job: `leads.follow_up_at timestamptz`, `leads.follow_up_note text` (≤ 200 chars). Setting replaces; Done clears.
- Clearing rules: a call saved as `talked`/`no_answer` sets the follow-up if a call-back time was given, otherwise clears it; a `booked` call clears it; marking a job `lost` clears it; other stage moves keep it.
- Valid call-back time: a real `datetime-local` value (Las Vegas time) no more than one year ahead; past times are allowed (they show as overdue). Messages: "Pick a valid call-back date and time", "Pick a call-back within a year", "Keep the reason under 200 characters".
- Quick picks (Las Vegas time): "Later today 4 PM" (only when it is before 3 PM), "Tomorrow 10 AM", "In 2 days 10 AM", "Next week 10 AM".
- Display: `formatCallVisit` style — `Fri 10/16, 10:00 AM`, reason appended as ` · <reason>`.
- Due = not Lost and `follow_up_at` before the end of today in Las Vegas; overdue = before now. Overdue text uses the `text-overdue` token.
- Activity: job-page set → `Follow-up set: <time> · <reason>`; Done → `Follow-up done`; a call's summary line gains ` · Call back <time>` and ` · <reason>`.
- Morning email: cron `{ "path": "/api/cron/follow-ups", "schedule": "0 14 * * *" }`, `Authorization: Bearer <CRON_SECRET>` checked before any data is read, sent to every address in `LEAD_NOTIFICATION_EMAIL` (comma-separated), nothing sent when nothing is due, a send failure returns 500.
- Migration 009 follows `scripts/migrate.mjs` rules (re-applied every run, `--` lines stripped, split on `;`): idempotent, no `;` inside a statement or comment. Do not run it against any database.
- New `Job` fields are optional (`followUpAt?`, `followUpNote?`); `toJob` maps missing to `null`.
- Coordination: `CallForm.tsx`'s booking block and `DaySchedule` belong to the calendar work — only add to the non-booking block, and keep `after(() => syncJobCalendar(...))` in `logCallAction` and both existing `vercel.json` crons. `FollowUpBox` is self-contained (`{ job }` props) because the job page is being redesigned; only add one line to today's `app/admin/jobs/[id]/page.tsx`.
- Admin styling: colors only from `app/globals.css` `@theme` tokens; every control has a text label. Every admin page and action calls `requireAdmin()` before reading input.
- Verification: `npx vitest run --maxWorkers=2 <paths>`, full suite once, `npx tsc --noEmit 2>&1 | grep -v '^.next/'` prints nothing (the known `app/layout.tsx … LayoutProps` quirk may appear in a never-built worktree), `npx eslint <changed paths>`. No `next build`, no `git stash`.
- Commits end with the session's attribution trailer lines.

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/009_follow_ups.sql` | The two columns, the note-length check, a partial index |
| `lib/admin/follow-up.ts` | Pure: quick picks, labels, end-of-today, `callBackProblem` |
| `lib/admin/schema.ts` (modify) | `callSchema` call-back fields; new `followUpSchema` |
| `lib/admin/call.ts` (modify) | `CallInput` gains follow-up fields; `callSummary` mentions the call-back |
| `lib/admin/calls.ts` (modify) | `logCall` sets/clears the follow-up |
| `lib/admin/jobs.ts` (modify) | `Job` fields, `JOB_COLUMNS`, `toJob`; `setStage` clears on lost |
| `lib/admin/follow-ups.ts` | `setFollowUp`, `clearFollowUp`, `listDueFollowUps` |
| `app/admin/jobs/[id]/call/CallForm.tsx`, `app/admin/jobs/call-actions.ts` (modify) | "Call back on" block and its fields |
| `app/admin/jobs/follow-up-actions.ts` | `saveFollowUp`, `clearFollowUpAction` |
| `app/admin/jobs/[id]/FollowUpBox.tsx`, `app/admin/jobs/[id]/page.tsx` (modify) | Job-page control |
| `app/admin/FollowUpsDue.tsx`, `app/admin/page.tsx` (modify) | Board list |
| `lib/leads/email.ts` (modify) | Export `ownerRecipients()` |
| `lib/admin/follow-up-digest.ts`, `app/api/cron/follow-ups/route.ts`, `vercel.json` (modify) | Morning email |
| `e2e/follow-ups.spec.ts`, `playwright.config.ts` (modify) | End-to-end |

---

### Task 1: Follow-up data and rules

**Files:**
- Create: `db/migrations/009_follow_ups.sql`, `lib/admin/follow-up.ts`, `lib/admin/follow-ups.ts`
- Modify: `lib/admin/jobs.ts` (`Job`, `JOB_COLUMNS`, `toJob`, `setStage`), `lib/admin/schema.ts` (`callSchema`, new `followUpSchema`), `lib/admin/call.ts` (`CallInput`, `callSummary`), `lib/admin/calls.ts` (`logCall`)
- Test: `tests/admin/follow-up.test.ts`, `tests/admin/follow-ups.test.ts`, `tests/admin/migration-009.test.ts`; update `tests/admin/call.test.ts`, `tests/admin/call-schema.test.ts`, `tests/admin/calls.test.ts`, `tests/admin/jobs.test.ts`, and any test whose expected `CallInput`/call params now need the two new fields (e.g. `tests/admin/call-actions.test.ts`)

**Interfaces:**
- Produces:
  - `FOLLOW_UP_NOTE_MAX = 200`
  - `type QuickPick = { label: string; value: string }` (value is `YYYY-MM-DDTHH:MM`); `quickPicks(now: Date): QuickPick[]`
  - `endOfTodayLasVegas(now: Date): Date`
  - `formatFollowUp(at: Date, note: string | null): string`
  - `dueLabel(at: Date, now: Date): { overdue: boolean; text: string }` — `"Overdue · Wed 10/14, 4:00 PM"` or `"Today · 2:00 PM"`
  - `callBackProblem(value: string, now: Date): string | null`
  - `followUpSchema` → `{ at: Date; note: string | null }`
  - `CallInput` gains `followUpAt: Date | null; followUpNote: string | null`
  - `Job.followUpAt?: Date | null; Job.followUpNote?: string | null`
  - `setFollowUp(jobId, at: Date, note: string | null, actor): Promise<boolean>`; `clearFollowUp(jobId, actor): Promise<boolean>`; `listDueFollowUps(now: Date): Promise<Job[]>`

- [ ] **Step 1: Write the failing tests**

`tests/admin/migration-009.test.ts` (mirror `scripts/migrate.mjs`: remove lines matching `^\s*--.*$`, split on `;`, trim, drop empties):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("db/migrations/009_follow_ups.sql", "utf8");
const statements = sql.replace(/^\s*--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);

describe("migration 009", () => {
  it("adds the follow-up columns, a length check and a partial index, idempotently", () => {
    expect(statements).toEqual([
      "alter table leads add column if not exists follow_up_at timestamptz",
      "alter table leads add column if not exists follow_up_note text",
      "alter table leads drop constraint if exists leads_follow_up_note_check",
      "alter table leads add constraint leads_follow_up_note_check check (follow_up_note is null or char_length(follow_up_note) <= 200)",
      "create index if not exists leads_follow_up_at_idx on leads (follow_up_at) where follow_up_at is not null",
    ]);
  });
  it("has no semicolon inside a comment", () => {
    for (const line of sql.split(/\r?\n/)) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });
});
```

`tests/admin/follow-up.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { callBackProblem, dueLabel, endOfTodayLasVegas, formatFollowUp, quickPicks } from "@/lib/admin/follow-up";

// 2026-10-14 is a Wednesday; Las Vegas is UTC-7 in October, UTC-8 in December.
const at = (iso: string) => new Date(iso);

describe("quickPicks", () => {
  it("offers later today before 3 PM", () => {
    expect(quickPicks(at("2026-10-14T16:00:00Z"))).toEqual([ // 9:00 AM Las Vegas
      { label: "Later today 4 PM", value: "2026-10-14T16:00" },
      { label: "Tomorrow 10 AM", value: "2026-10-15T10:00" },
      { label: "In 2 days 10 AM", value: "2026-10-16T10:00" },
      { label: "Next week 10 AM", value: "2026-10-21T10:00" },
    ]);
  });
  it("drops later today from 3 PM on", () => {
    expect(quickPicks(at("2026-10-14T22:30:00Z")).map((p) => p.label)) // 3:30 PM Las Vegas
      .toEqual(["Tomorrow 10 AM", "In 2 days 10 AM", "Next week 10 AM"]);
  });
  it("rolls over month ends", () => {
    expect(quickPicks(at("2026-10-31T23:00:00Z"))[0]).toEqual({ label: "Tomorrow 10 AM", value: "2026-11-01T10:00" });
  });
});

describe("endOfTodayLasVegas", () => {
  it("is midnight starting tomorrow in Las Vegas", () => {
    expect(endOfTodayLasVegas(at("2026-10-14T20:00:00Z"))).toEqual(at("2026-10-15T07:00:00Z"));
    expect(endOfTodayLasVegas(at("2026-12-01T20:00:00Z"))).toEqual(at("2026-12-02T08:00:00Z"));
  });
});

describe("labels", () => {
  it("formats a follow-up with and without a reason", () => {
    expect(formatFollowUp(at("2026-10-16T17:00:00Z"), "checking with husband")).toBe("Fri 10/16, 10:00 AM · checking with husband");
    expect(formatFollowUp(at("2026-10-16T17:00:00Z"), null)).toBe("Fri 10/16, 10:00 AM");
  });
  it("marks overdue and today", () => {
    const now = at("2026-10-14T20:00:00Z"); // 1:00 PM Las Vegas
    expect(dueLabel(at("2026-10-14T19:00:00Z"), now)).toEqual({ overdue: true, text: "Overdue · Wed 10/14, 12:00 PM" });
    expect(dueLabel(at("2026-10-14T21:00:00Z"), now)).toEqual({ overdue: false, text: "Today · 2:00 PM" });
  });
});

describe("callBackProblem", () => {
  const now = at("2026-10-14T20:00:00Z");
  it("accepts a real time, including the past", () => {
    expect(callBackProblem("2026-10-15T10:00", now)).toBeNull();
    expect(callBackProblem("2026-10-01T10:00", now)).toBeNull();
  });
  it("rejects impossible or far-off times", () => {
    expect(callBackProblem("2026-13-45T25:99", now)).toBe("Pick a valid call-back date and time");
    expect(callBackProblem("tomorrow", now)).toBe("Pick a valid call-back date and time");
    expect(callBackProblem("2027-11-01T10:00", now)).toBe("Pick a call-back within a year");
  });
});
```

Fix the fixture in the first `dueLabel` case if needed: 23:00Z is 4:00 PM Las Vegas, which is after 1:00 PM "now", so it is not overdue. Use `at("2026-10-14T19:00:00Z")` (12:00 PM) with text `"Overdue · Wed 10/14, 12:00 PM"` for the overdue case. Write the test with that corrected fixture.

`tests/admin/follow-ups.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
const sql = Object.assign(vi.fn(), { query });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { clearFollowUp, listDueFollowUps, setFollowUp } = await import("@/lib/admin/follow-ups");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
beforeEach(() => { query.mockReset().mockResolvedValue([{ id: "e1" }]); });

describe("setFollowUp", () => {
  it("sets the follow-up and logs it in one statement", async () => {
    const at = new Date("2026-10-16T17:00:00Z");
    expect(await setFollowUp(JOB, at, "checking with husband", "owner@example.com")).toBe(true);
    const [text, params] = query.mock.calls[0];
    expect(text).toContain("follow_up_at = $2");
    expect(text).toContain("insert into job_events");
    expect(params).toEqual([JOB, at, "checking with husband", "owner@example.com",
      "Follow-up set: Fri 10/16, 10:00 AM · checking with husband"]);
  });
  it("returns false for a missing job or a bad id", async () => {
    query.mockResolvedValue([]);
    expect(await setFollowUp(JOB, new Date(), null, "o")).toBe(false);
    query.mockClear();
    expect(await setFollowUp("nope", new Date(), null, "o")).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("clearFollowUp", () => {
  it("clears only a set follow-up and logs Follow-up done", async () => {
    expect(await clearFollowUp(JOB, "owner@example.com")).toBe(true);
    const [text, params] = query.mock.calls[0];
    expect(text).toContain("follow_up_at is not null");
    expect(text).toContain("follow_up_at = null");
    expect(params).toEqual([JOB, "owner@example.com", "Follow-up done"]);
  });
});

describe("listDueFollowUps", () => {
  it("lists jobs not lost, due before the end of today, soonest first", async () => {
    query.mockResolvedValue([]);
    const now = new Date("2026-10-14T20:00:00Z");
    await listDueFollowUps(now);
    const [text, params] = query.mock.calls[0];
    expect(text).toContain("follow_up_at is not null");
    expect(text).toContain("status <> 'lost'");
    expect(text).toContain("follow_up_at < $1");
    expect(text).toContain("order by follow_up_at asc");
    expect(params).toEqual([new Date("2026-10-15T07:00:00Z")]);
  });
});
```

Update existing tests:
- `tests/admin/call-schema.test.ts`: the `toEqual` output gains `followUpAt: null, followUpNote: null`. Add:

```ts
it("keeps a call-back only for talked or no answer", () => {
  const parsed = callSchema.parse({ ...ok, outcome: "no_answer", callBackAt: "2026-10-16T10:00", callBackNote: " checking with husband " });
  expect(parsed.followUpAt).toEqual(new Date("2026-10-16T17:00:00Z"));
  expect(parsed.followUpNote).toBe("checking with husband");
  const booked = callSchema.parse({ ...ok, outcome: "booked", visitAt: "2026-10-14T14:00", callBackAt: "2026-10-16T10:00" });
  expect(booked.followUpAt).toBeNull();
  expect(booked.followUpNote).toBeNull();
});
it("drops a reason with no call-back time", () => {
  expect(callSchema.parse({ ...ok, callBackNote: "x" }).followUpNote).toBeNull();
});
it("rejects a bad call-back time or a long reason", () => {
  expect(callSchema.safeParse({ ...ok, callBackAt: "2026-13-45T25:99" }).error!.issues[0].message).toBe("Pick a valid call-back date and time");
  expect(callSchema.safeParse({ ...ok, callBackAt: "2026-10-16T10:00", callBackNote: "x".repeat(201) }).error!.issues[0].message)
    .toBe("Keep the reason under 200 characters");
});
```

(The "within a year" limit is covered by `callBackProblem`'s unit test; the schema uses it with the real clock.)

- `tests/admin/call.test.ts`: `base` gains `followUpAt: null, followUpNote: null`. Add:

```ts
it("adds the call-back to the summary", () => {
  expect(callSummary({ ...base, outcome: "no_answer", followUpAt: new Date("2026-10-16T17:00:00Z"), followUpNote: "checking with husband" }))
    .toBe("Call: no answer · Call back Fri 10/16, 10:00 AM · checking with husband");
});
```

- `tests/admin/calls.test.ts`: each expected `params` array gains the two follow-up values at the end (`$10`, `$11`); the SQL text contains `follow_up_at = $10::timestamptz` and `follow_up_note = $11`. Add a case: `no_answer` with `followUpAt` set passes that Date and note; `booked` passes `null, null`.
- `tests/admin/jobs.test.ts`: `setStage` to `"lost"` — its SQL contains `follow_up_at = case when`; `toJob` maps `follow_up_at`/`follow_up_note` and missing → `null`.
- Any other test that asserts an exact `CallInput` (e.g. `tests/admin/call-actions.test.ts`'s `toHaveBeenCalledWith`) gains `followUpAt: null, followUpNote: null`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/migration-009.test.ts tests/admin/follow-up.test.ts tests/admin/follow-ups.test.ts tests/admin/call-schema.test.ts tests/admin/call.test.ts tests/admin/calls.test.ts tests/admin/jobs.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`db/migrations/009_follow_ups.sql`:

```sql
-- Call-back reminders: one next follow-up per job.
-- Every statement is safe to re-run.

alter table leads add column if not exists follow_up_at timestamptz;

alter table leads add column if not exists follow_up_note text;

alter table leads drop constraint if exists leads_follow_up_note_check;

alter table leads add constraint leads_follow_up_note_check check (follow_up_note is null or char_length(follow_up_note) <= 200);

create index if not exists leads_follow_up_at_idx on leads (follow_up_at) where follow_up_at is not null;
```

`lib/admin/follow-up.ts`:

```ts
import { formatCallVisit, fromLocalInput, toLocalInput } from "./time";

export const FOLLOW_UP_NOTE_MAX = 200;
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const YEAR_MS = 366 * 24 * 60 * 60 * 1000;

export type QuickPick = { label: string; value: string };

/** "2026-10-31" + 1 → "2026-11-01", read at noon UTC so the date never shifts. */
function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** One-tap call-back times, in Las Vegas time. "Later today" only before 3 PM. */
export function quickPicks(now: Date): QuickPick[] {
  const local = toLocalInput(now);
  const today = local.slice(0, 10);
  const hour = Number(local.slice(11, 13));
  const picks: QuickPick[] = [];
  if (hour < 15) picks.push({ label: "Later today 4 PM", value: `${today}T16:00` });
  picks.push({ label: "Tomorrow 10 AM", value: `${addDays(today, 1)}T10:00` });
  picks.push({ label: "In 2 days 10 AM", value: `${addDays(today, 2)}T10:00` });
  picks.push({ label: "Next week 10 AM", value: `${addDays(today, 7)}T10:00` });
  return picks;
}

/** The instant today ends in Las Vegas (midnight starting tomorrow). */
export function endOfTodayLasVegas(now: Date): Date {
  return fromLocalInput(`${addDays(toLocalInput(now).slice(0, 10), 1)}T00:00`);
}

export const formatFollowUp = (at: Date, note: string | null): string =>
  note ? `${formatCallVisit(at)} · ${note}` : formatCallVisit(at);

export function dueLabel(at: Date, now: Date): { overdue: boolean; text: string } {
  const when = formatCallVisit(at);
  if (at.getTime() < now.getTime()) return { overdue: true, text: `Overdue · ${when}` };
  return { overdue: false, text: `Today · ${when.split(", ")[1]}` };
}

/** Why a typed call-back time is unusable, or null. Past times are fine; they show as overdue. */
export function callBackProblem(value: string, now: Date): string | null {
  if (!LOCAL_TIME.test(value) || Number.isNaN(new Date(`${value}:00Z`).getTime())) {
    return "Pick a valid call-back date and time";
  }
  if (fromLocalInput(value).getTime() - now.getTime() > YEAR_MS) return "Pick a call-back within a year";
  return null;
}
```

`lib/admin/call.ts`: `CallInput` gains `followUpAt: Date | null; followUpNote: string | null;`. In `callSummary`, after building `parts`, append the call-back:

```ts
  const callBack = input.followUpAt
    ? [`Call back ${formatCallVisit(input.followUpAt)}`, ...(input.followUpNote ? [input.followUpNote] : [])]
    : [];
  return [`Call: ${outcome}`, ...parts, ...callBack].join(" · ");
```

`lib/admin/schema.ts`: import `{ callBackProblem, FOLLOW_UP_NOTE_MAX } from "./follow-up"`. In `callSchema`'s object add:

```ts
    callBackAt: z.preprocess(blank, z.string().optional()),
    callBackNote: z.preprocess(blank, z.string().trim().max(FOLLOW_UP_NOTE_MAX, "Keep the reason under 200 characters").optional()),
```

In its `superRefine` add:

```ts
    if (value.callBackAt) {
      const problem = callBackProblem(value.callBackAt, new Date());
      if (problem) ctx.addIssue({ code: "custom", path: ["callBackAt"], message: problem });
    }
```

In its `transform` add:

```ts
    followUpAt: value.outcome !== "booked" && value.callBackAt ? fromLocalInput(value.callBackAt) : null,
    followUpNote: value.outcome !== "booked" && value.callBackAt ? (value.callBackNote ?? null) : null,
```

And add:

```ts
export const followUpSchema = z
  .object({
    at: z.string({ error: "Pick a valid call-back date and time" }),
    note: z.preprocess(blank, z.string().trim().max(FOLLOW_UP_NOTE_MAX, "Keep the reason under 200 characters").optional()),
  })
  .superRefine((value, ctx) => {
    const problem = callBackProblem(value.at, new Date());
    if (problem) ctx.addIssue({ code: "custom", path: ["at"], message: problem });
  })
  .transform((value) => ({ at: fromLocalInput(value.at), note: value.note ?? null }));
```

`lib/admin/calls.ts` `logCall`: in the UPDATE's SET add `follow_up_at = $10::timestamptz, follow_up_note = $11,` and append `input.followUpAt, input.followUpNote` to the params array. Update the doc comment: "It also sets the next follow-up, or clears it (a booked call and a call with no call-back time clear it)."

`lib/admin/jobs.ts`:
- `Job` gains `followUpAt?: Date | null; followUpNote?: string | null;` (optional, with a comment).
- `JOB_COLUMNS` last line gains `, follow_up_at, follow_up_note`.
- `toJob` gains `followUpAt: row.follow_up_at ? new Date(row.follow_up_at as string) : null, followUpNote: (row.follow_up_note as string | null) ?? null,`.
- `setStage`'s SET gains `follow_up_at = case when ${to} = 'lost' then null else follow_up_at end, follow_up_note = case when ${to} = 'lost' then null else follow_up_note end,`.

`lib/admin/follow-ups.ts`:

```ts
import "server-only";
import { db } from "@/lib/db";
import { formatFollowUp, endOfTodayLasVegas } from "./follow-up";
import { JOB_COLUMNS, isUuid, toJob, type Job } from "./jobs";

/** Sets (or replaces) the job's next follow-up and logs it, in one statement. */
export async function setFollowUp(jobId: string, at: Date, note: string | null, actor: string): Promise<boolean> {
  if (!isUuid(jobId)) return false;
  const rows = await db().query(
    `with changed as (
       update leads set follow_up_at = $2, follow_up_note = $3, updated_at = now()
       where id = $1
       returning id
     )
     insert into job_events (lead_id, actor, kind, body)
     select id, $4, 'note', $5 from changed
     returning id`,
    [jobId, at, note, actor, `Follow-up set: ${formatFollowUp(at, note)}`],
  );
  return rows.length > 0;
}

/** Clears a set follow-up and logs it. False if there was none (or no such job). */
export async function clearFollowUp(jobId: string, actor: string): Promise<boolean> {
  if (!isUuid(jobId)) return false;
  const rows = await db().query(
    `with changed as (
       update leads set follow_up_at = null, follow_up_note = null, updated_at = now()
       where id = $1 and follow_up_at is not null
       returning id
     )
     insert into job_events (lead_id, actor, kind, body)
     select id, $2, 'note', $3 from changed
     returning id`,
    [jobId, actor, "Follow-up done"],
  );
  return rows.length > 0;
}

/** Jobs (not Lost) whose follow-up is before the end of today in Las Vegas, soonest first. */
export async function listDueFollowUps(now: Date): Promise<Job[]> {
  const rows = await db().query(
    `select ${JOB_COLUMNS} from leads
     where follow_up_at is not null and status <> 'lost' and follow_up_at < $1
     order by follow_up_at asc`,
    [endOfTodayLasVegas(now)],
  );
  return rows.map(toJob);
}
```

- [ ] **Step 4: Run to verify they pass**

Run the Step 2 command, then `npx vitest run --maxWorkers=2 tests/admin`. Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add db/migrations/009_follow_ups.sql lib/admin/follow-up.ts lib/admin/follow-ups.ts lib/admin/jobs.ts lib/admin/schema.ts lib/admin/call.ts lib/admin/calls.ts tests/admin
git commit -m "feat: follow-up data, rules and validation (migration 009)"
```

---

### Task 2: "Call back on" on the call screen

**Files:**
- Modify: `app/admin/jobs/[id]/call/CallForm.tsx` (non-booking block only), `app/admin/jobs/call-actions.ts` (`FIELDS`, the `safeParse` input)
- Test: `tests/admin/call-form.test.tsx`, `tests/admin/call-actions.test.ts`

**Interfaces:**
- Consumes: `quickPicks`, `FOLLOW_UP_NOTE_MAX` (Task 1); `callSchema` fields `callBackAt`, `callBackNote`; existing `DaySchedule({ jobId, date, slotStart })`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/admin/call-form.test.tsx` (it already mocks `call-actions`; also mock `./DaySchedule` if the file doesn't already, e.g. `vi.mock("@/app/admin/jobs/[id]/call/DaySchedule", () => ({ DaySchedule: ({ date }: { date: string }) => <p>schedule {date}</p> }))`):

```tsx
it("offers an optional call-back with quick picks", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T16:00:00Z")); // 9 AM Las Vegas
  render(<CallForm job={job} />);
  const when = screen.getByLabelText("Call-back date and time");
  expect(when).toHaveValue("");
  expect(when).not.toBeRequired();
  fireEvent.click(screen.getByRole("button", { name: "Tomorrow 10 AM" }));
  expect(when).toHaveValue("2026-10-15T10:00");
  expect(screen.getByText("schedule 2026-10-15")).toBeInTheDocument();
  expect(screen.getByLabelText("Reason")).toHaveAttribute("maxLength", "200");
  vi.useRealTimers();
});

it("hides the call-back while booking a visit", () => {
  render(<CallForm job={job} />);
  fireEvent.click(screen.getByRole("button", { name: "Booked a visit" }));
  expect(screen.queryByLabelText("Call-back date and time")).toBeNull();
});
```

Add to `tests/admin/call-actions.test.ts`:

```ts
it("passes the call-back to the save", async () => {
  await expect(logCallAction(JOB, {}, form([
    ["outcome", "no_answer"], ["callBackAt", "2026-10-16T10:00"], ["callBackNote", "checking with husband"],
  ]))).rejects.toThrow(`NEXT_REDIRECT /admin/jobs/${JOB}`);
  expect(logCall).toHaveBeenCalledWith(JOB, expect.objectContaining({
    outcome: "no_answer", followUpAt: new Date("2026-10-16T17:00:00Z"), followUpNote: "checking with husband",
  }), "owner@example.com");
});

it("keeps the typed call-back when validation fails", async () => {
  const state = await logCallAction(JOB, {}, form([["outcome", "talked"], ["callBackAt", "2026-13-45T25:99"], ["callBackNote", "x"]]));
  expect(state.error).toBe("Pick a valid call-back date and time");
  expect(state.values).toMatchObject({ callBackAt: "2026-13-45T25:99", callBackNote: "x" });
});
```

(If the file mocks `next/server`'s `after` and `@/lib/calendar/sync`, keep those mocks.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/call-form.test.tsx tests/admin/call-actions.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`app/admin/jobs/call-actions.ts`: add `"callBackAt", "callBackNote"` to `FIELDS`, and to the `callSchema.safeParse` input:

```ts
    callBackAt: formData.get("callBackAt") ?? "",
    callBackNote: formData.get("callBackNote") ?? "",
```

Leave the `after(() => syncJobCalendar(...))` line and `callDaySchedule` untouched.

`app/admin/jobs/[id]/call/CallForm.tsx`: import `{ FOLLOW_UP_NOTE_MAX, quickPicks } from "@/lib/admin/follow-up"`. Add state next to `visit`:

```tsx
  const [callBack, setCallBack] = useState(() => text("callBackAt", ""));
  const picks = quickPicks(new Date());
```

Replace the non-booking branch (`) : (` … `)}`) with:

```tsx
      ) : (
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-3 border border-rule p-4">
            <legend className={LEGEND}>Call back on (optional)</legend>
            <div className="flex flex-wrap gap-2">
              {picks.map((pick) => (
                <button key={pick.label} type="button" onClick={() => setCallBack(pick.value)}
                  className="min-h-11 border border-rule px-3 text-sm hover:border-charcoal">
                  {pick.label}
                </button>
              ))}
            </div>
            <label htmlFor="call-back-at" className="flex flex-col gap-2 text-sm">
              Call-back date and time
              <input id="call-back-at" name="callBackAt" type="datetime-local"
                value={callBack} onChange={(e) => setCallBack(e.target.value)}
                className="min-h-11 w-full border border-rule bg-ivory px-4 py-3" />
            </label>
            {callBack.length === 16 ? (
              <DaySchedule jobId={job.id} date={callBack.slice(0, 10)} slotStart={fromLocalInput(callBack)} />
            ) : null}
            <label htmlFor="call-back-note" className="flex flex-col gap-2 text-sm">
              Reason
              <input id="call-back-note" name="callBackNote" type="text" maxLength={FOLLOW_UP_NOTE_MAX}
                defaultValue={text("callBackNote", "")} placeholder="e.g. checking with husband"
                className="min-h-11 w-full border border-rule bg-ivory px-4 py-3" />
            </label>
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="solid" onClick={() => setBooking(true)}>Booked a visit</Button>
            <Button type="submit" name="outcome" value="talked" variant="outline" disabled={pending}>Talked, no visit yet</Button>
            <Button type="submit" name="outcome" value="no_answer" variant="outline" disabled={pending}>No answer</Button>
          </div>
        </div>
      )}
```

The booking branch stays exactly as it is.

- [ ] **Step 4: Run to verify they pass**

Run the Step 2 command, then `npx vitest run --maxWorkers=2 tests/admin`. Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add "app/admin/jobs/[id]/call/CallForm.tsx" app/admin/jobs/call-actions.ts tests/admin/call-form.test.tsx tests/admin/call-actions.test.ts
git commit -m "feat: set a call-back from the call screen"
```

---

### Task 3: The Follow-up box on the job page

**Files:**
- Create: `app/admin/jobs/follow-up-actions.ts`, `app/admin/jobs/[id]/FollowUpBox.tsx`
- Modify: `app/admin/jobs/[id]/page.tsx` (one line under `StageControls`)
- Test: `tests/admin/follow-up-actions.test.ts`, `tests/admin/follow-up-box.test.tsx`, one assertion in `tests/admin/job-page-summary.test.tsx`

**Interfaces:**
- Consumes: `followUpSchema`, `setFollowUp`, `clearFollowUp`, `quickPicks`, `formatFollowUp`, `FOLLOW_UP_NOTE_MAX` (Task 1); `type FormState` from `app/admin/jobs/actions.ts`.
- Produces: `saveFollowUp(jobId, prev: FormState, formData): Promise<FormState>`; `clearFollowUpAction(jobId): Promise<void>`; `FollowUpBox({ job }: { job: { id: string; followUpAt?: Date | null; followUpNote?: string | null } })`.

- [ ] **Step 1: Write the failing tests**

`tests/admin/follow-up-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const followUps = { setFollowUp: vi.fn(), clearFollowUp: vi.fn() };
vi.mock("@/lib/admin/follow-ups", () => followUps);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { clearFollowUpAction, saveFollowUp } = await import("@/app/admin/jobs/follow-up-actions");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const form = (e: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(e)) d.append(k, v); return d; };

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  followUps.setFollowUp.mockReset().mockResolvedValue(true);
  followUps.clearFollowUp.mockReset().mockResolvedValue(true);
});

describe("saveFollowUp", () => {
  it("checks the session first", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveFollowUp(JOB, {}, form({ at: "2026-10-16T10:00" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(followUps.setFollowUp).not.toHaveBeenCalled();
  });
  it("sets the follow-up as the owner", async () => {
    expect(await saveFollowUp(JOB, {}, form({ at: "2026-10-16T10:00", note: " checking " }))).toEqual({ ok: true });
    expect(followUps.setFollowUp).toHaveBeenCalledWith(JOB, new Date("2026-10-16T17:00:00Z"), "checking", "owner@example.com");
  });
  it("keeps what was typed when invalid", async () => {
    const state = await saveFollowUp(JOB, {}, form({ at: "2026-13-45T25:99", note: "x" }));
    expect(state).toEqual({ error: "Pick a valid call-back date and time", values: { at: "2026-13-45T25:99", note: "x" } });
  });
  it("reports a missing job", async () => {
    followUps.setFollowUp.mockResolvedValue(false);
    expect(await saveFollowUp(JOB, {}, form({ at: "2026-10-16T10:00" }))).toEqual({ error: "That job no longer exists." });
  });
});

describe("clearFollowUpAction", () => {
  it("clears as the owner after the session check", async () => {
    await clearFollowUpAction(JOB);
    expect(followUps.clearFollowUp).toHaveBeenCalledWith(JOB, "owner@example.com");
  });
});
```

`tests/admin/follow-up-box.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/admin/jobs/follow-up-actions", () => ({ saveFollowUp: vi.fn(), clearFollowUpAction: vi.fn() }));
const { FollowUpBox } = await import("@/app/admin/jobs/[id]/FollowUpBox");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

describe("FollowUpBox", () => {
  it("says when none is set and offers Set", () => {
    render(<FollowUpBox job={{ id: JOB, followUpAt: null, followUpNote: null }} />);
    expect(screen.getByText("No call-back set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set call-back" })).toBeInTheDocument();
  });
  it("shows the next call-back with Change and Done", () => {
    render(<FollowUpBox job={{ id: JOB, followUpAt: new Date("2099-10-16T17:00:00Z"), followUpNote: "checking with husband" }} />);
    expect(screen.getByText(/Next call-back: .* · checking with husband/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });
  it("marks an overdue call-back", () => {
    render(<FollowUpBox job={{ id: JOB, followUpAt: new Date("2020-01-01T17:00:00Z"), followUpNote: null }} />);
    expect(screen.getByText(/Overdue/).className).toContain("text-overdue");
  });
  it("opens an editor with quick picks", () => {
    render(<FollowUpBox job={{ id: JOB, followUpAt: null, followUpNote: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Set call-back" }));
    expect(screen.getByLabelText("Call-back date and time")).toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "Next week 10 AM" }));
    expect((screen.getByLabelText("Call-back date and time") as HTMLInputElement).value).toMatch(/T10:00$/);
    expect(screen.getByRole("button", { name: "Save call-back" })).toBeInTheDocument();
  });
});
```

Add to `tests/admin/job-page-summary.test.tsx` (which renders the real async `JobPage`; add `followUpAt: null, followUpNote: null` to its fixture if it asserts exact shapes, and mock `@/app/admin/jobs/follow-up-actions` there):

```ts
expect(screen.getByText("No call-back set")).toBeInTheDocument();
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/follow-up-actions.test.ts tests/admin/follow-up-box.test.tsx tests/admin/job-page-summary.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`app/admin/jobs/follow-up-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { clearFollowUp, setFollowUp } from "@/lib/admin/follow-ups";
import { followUpSchema } from "@/lib/admin/schema";
import { requireAdmin } from "@/lib/admin/session";
import type { FormState } from "./actions";

const refresh = (id: string) => {
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${id}`);
};

// Each action calls requireAdmin() before reading its input.
export async function saveFollowUp(jobId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const raw = { at: String(formData.get("at") ?? ""), note: String(formData.get("note") ?? "") };
  const parsed = followUpSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: raw };
  const saved = await setFollowUp(jobId, parsed.data.at, parsed.data.note, email);
  if (!saved) return { error: "That job no longer exists." };
  refresh(jobId);
  return { ok: true };
}

export async function clearFollowUpAction(jobId: string): Promise<void> {
  const { email } = await requireAdmin();
  await clearFollowUp(jobId, email);
  refresh(jobId);
}
```

`app/admin/jobs/[id]/FollowUpBox.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FOLLOW_UP_NOTE_MAX, formatFollowUp, quickPicks } from "@/lib/admin/follow-up";
import { toLocalInput } from "@/lib/admin/time";
import { clearFollowUpAction, saveFollowUp } from "../follow-up-actions";
import type { FormState } from "../actions";

type FollowUpJob = { id: string; followUpAt?: Date | null; followUpNote?: string | null };

/** The job's next call-back. Self-contained so the job page redesign can place it anywhere. */
export function FollowUpBox({ job }: { job: FollowUpJob }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveFollowUp.bind(null, job.id), {});
  const [editing, setEditing] = useState(Boolean(state.error));
  const initial = typeof state.values?.at === "string" ? state.values.at : job.followUpAt ? toLocalInput(job.followUpAt) : "";
  const [at, setAt] = useState(initial);
  const followUpAt = job.followUpAt ?? null;
  const overdue = followUpAt ? followUpAt.getTime() < Date.now() : false;

  return (
    <div className="flex flex-col gap-3">
      {followUpAt ? (
        <p className="text-sm">
          Next call-back: {formatFollowUp(followUpAt, job.followUpNote ?? null)}
          {overdue ? <strong className="ml-2 font-semibold uppercase text-overdue">Overdue</strong> : null}
        </p>
      ) : (
        <p className="text-sm text-ink-soft">No call-back set</p>
      )}

      {editing ? (
        <form key={state.values ? JSON.stringify(state.values) : "initial"} action={action} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {quickPicks(new Date()).map((pick) => (
              <button key={pick.label} type="button" onClick={() => setAt(pick.value)}
                className="min-h-11 border border-rule px-3 text-sm hover:border-charcoal">
                {pick.label}
              </button>
            ))}
          </div>
          <label htmlFor="follow-up-at" className="flex flex-col gap-2 text-sm">
            Call-back date and time
            <input id="follow-up-at" name="at" type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)}
              className="min-h-11 w-full border border-rule bg-ivory px-4 py-3" />
          </label>
          <label htmlFor="follow-up-note" className="flex flex-col gap-2 text-sm">
            Reason
            <input id="follow-up-note" name="note" type="text" maxLength={FOLLOW_UP_NOTE_MAX}
              defaultValue={typeof state.values?.note === "string" ? state.values.note : job.followUpNote ?? ""}
              className="min-h-11 w-full border border-rule bg-ivory px-4 py-3" />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="solid" disabled={pending}>Save call-back</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
          {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>{followUpAt ? "Change" : "Set call-back"}</Button>
          {followUpAt ? (
            <form action={clearFollowUpAction.bind(null, job.id)}>
              <Button type="submit" variant="outline">Done</Button>
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}
```

Closing after a save: the save revalidates the page, and `page.tsx` renders `<FollowUpBox key={job.followUpAt?.toISOString() ?? "none"} job={job} />`, so a changed follow-up remounts the box with the editor closed. No extra state handling is needed.

`app/admin/jobs/[id]/page.tsx`: import `{ FollowUpBox } from "./FollowUpBox"`; directly after `<StageControls job={job} />` add:

```tsx
        <FollowUpBox key={job.followUpAt?.toISOString() ?? "none"} job={job} />
```

- [ ] **Step 4: Run to verify they pass**

Run the Step 2 command, then `npx vitest run --maxWorkers=2 tests/admin`. Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add app/admin/jobs/follow-up-actions.ts "app/admin/jobs/[id]/FollowUpBox.tsx" "app/admin/jobs/[id]/page.tsx" tests/admin/follow-up-actions.test.ts tests/admin/follow-up-box.test.tsx tests/admin/job-page-summary.test.tsx
git commit -m "feat: follow-up box on the job page"
```

---

### Task 4: "Follow-ups due" on the board

**Files:**
- Create: `app/admin/FollowUpsDue.tsx`
- Modify: `app/admin/page.tsx`
- Test: `tests/admin/follow-ups-due.test.tsx`; one assertion in `tests/admin/board-page.test.tsx`

**Interfaces:**
- Consumes: `listDueFollowUps`, `dueLabel` (Task 1); `type Job`.
- Produces: `FollowUpsDue({ jobs, now }: { jobs: Job[]; now: Date })`.

- [ ] **Step 1: Write the failing tests**

`tests/admin/follow-ups-due.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FollowUpsDue } from "@/app/admin/FollowUpsDue";

const now = new Date("2026-10-14T20:00:00Z"); // 1:00 PM Las Vegas
const job = (id: string, name: string, at: string, note: string | null) =>
  ({ id, name, followUpAt: new Date(at), followUpNote: note }) as Parameters<typeof FollowUpsDue>[0]["jobs"][number];

describe("FollowUpsDue", () => {
  it("renders nothing when nothing is due", () => {
    const { container } = render(<FollowUpsDue jobs={[]} now={now} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists overdue and today with links to the job and the call screen", () => {
    render(<FollowUpsDue now={now} jobs={[
      job("00000000-0000-4000-8000-000000000001", "Maria Lopez", "2026-10-14T19:00:00Z", "checking with husband"),
      job("00000000-0000-4000-8000-000000000002", "Sam Park", "2026-10-14T21:00:00Z", null),
    ]} />);
    const list = screen.getByRole("region", { name: "Follow-ups due · 2" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Overdue · Wed 10/14, 12:00 PM");
    expect(within(rows[0]).getByText(/Overdue/).className).toContain("text-overdue");
    expect(rows[0]).toHaveTextContent("checking with husband");
    expect(within(rows[0]).getByRole("link", { name: "Maria Lopez" })).toHaveAttribute("href", "/admin/jobs/00000000-0000-4000-8000-000000000001");
    expect(within(rows[0]).getByRole("link", { name: "Call" })).toHaveAttribute("href", "/admin/jobs/00000000-0000-4000-8000-000000000001/call");
    expect(rows[1]).toHaveTextContent("Today · 2:00 PM");
  });

  it("shows at most 20, then how many more", () => {
    const many = Array.from({ length: 23 }, (_, i) =>
      job(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, `Lead ${i}`, "2026-10-14T19:00:00Z", null));
    render(<FollowUpsDue jobs={many} now={now} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(screen.getByText("and 3 more")).toBeInTheDocument();
  });
});
```

Add to `tests/admin/board-page.test.tsx`: mock `@/lib/admin/follow-ups` with `listDueFollowUps: vi.fn().mockResolvedValue([])` (the board page now calls it), and assert that the board still renders when none are due (no "Follow-ups due" region). Add one case where it resolves a due job and the region "Follow-ups due · 1" appears.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/follow-ups-due.test.tsx tests/admin/board-page.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`app/admin/FollowUpsDue.tsx`:

```tsx
import Link from "next/link";
import type { Job } from "@/lib/admin/jobs";
import { dueLabel } from "@/lib/admin/follow-up";

const LIMIT = 20;

/** Call-backs due today or overdue. Hidden when there are none. */
export function FollowUpsDue({ jobs, now }: { jobs: Job[]; now: Date }) {
  const due = jobs.filter((job) => job.followUpAt);
  if (due.length === 0) return null;
  const shown = due.slice(0, LIMIT);

  return (
    <section aria-labelledby="follow-ups-due" className="flex flex-col gap-3 rounded-xl border border-rule bg-ivory p-4 shadow-sm">
      <h2 id="follow-ups-due" className="text-sm font-semibold text-charcoal">Follow-ups due · {due.length}</h2>
      <ul className="flex flex-col divide-y divide-rule">
        {shown.map((job) => {
          const label = dueLabel(job.followUpAt as Date, now);
          return (
            <li key={job.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
              <Link href={`/admin/jobs/${job.id}`} className="font-semibold underline-offset-4 hover:underline">{job.name}</Link>
              <span className={label.overdue ? "font-semibold text-overdue" : "text-ink-soft"}>{label.text}</span>
              {job.followUpNote ? <span className="text-ink-soft">{job.followUpNote}</span> : null}
              <Link href={`/admin/jobs/${job.id}/call`} className="ml-auto inline-flex min-h-11 items-center px-3 underline underline-offset-4">Call</Link>
            </li>
          );
        })}
      </ul>
      {due.length > LIMIT ? <p className="text-sm text-ink-soft">and {due.length - LIMIT} more</p> : null}
    </section>
  );
}
```

`app/admin/page.tsx`: import `{ listDueFollowUps } from "@/lib/admin/follow-ups"` and `{ FollowUpsDue } from "./FollowUpsDue"`. Move `const now = new Date();` above the `Promise.all` and load the list with it:

```tsx
  const now = new Date();
  const [jobs, panel, followUps] = await Promise.all([
    listJobs({ includeLost, search: q }),
    openId ? loadPanel(openId) : Promise.resolve(null),
    listDueFollowUps(now),
  ]);
```

(remove the later `const now = new Date();`). Render `<FollowUpsDue jobs={followUps} now={now} />` directly after the search/`q` block and before `<nav aria-label="Stages">`.

- [ ] **Step 4: Run to verify they pass**

Run the Step 2 command, then `npx vitest run --maxWorkers=2 tests/admin`. Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add app/admin/FollowUpsDue.tsx app/admin/page.tsx tests/admin/follow-ups-due.test.tsx tests/admin/board-page.test.tsx
git commit -m "feat: follow-ups due list on the board"
```

---

### Task 5: The morning email

**Files:**
- Create: `lib/admin/follow-up-digest.ts`, `app/api/cron/follow-ups/route.ts`
- Modify: `lib/leads/email.ts` (export `ownerRecipients`), `vercel.json`
- Test: `tests/admin/follow-up-digest.test.ts`, `tests/admin/follow-ups-cron.test.ts`, one case in `tests/leads/email.test.ts`

**Interfaces:**
- Consumes: `listDueFollowUps`, `dueLabel`, `formatFollowUp` (Task 1); `formatCallVisit`, `formatDay`; `formatPhone`; `adminOrigin`; `business`.
- Produces: `ownerRecipients(): string[]`; `followUpEmail(jobs: Job[], now: Date): { subject: string; text: string } | null`; `sendFollowUpDigest(now?: Date): Promise<{ sent: number; error?: string }>`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/leads/email.test.ts`:

```ts
describe("ownerRecipients", () => {
  it("splits and trims the owner list", async () => {
    const { ownerRecipients } = await import("@/lib/leads/email");
    vi.stubEnv("LEAD_NOTIFICATION_EMAIL", " a@example.com, b@example.com ,");
    expect(ownerRecipients()).toEqual(["a@example.com", "b@example.com"]);
  });
});
```

`tests/admin/follow-up-digest.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const listDueFollowUps = vi.fn();
vi.mock("@/lib/admin/follow-ups", () => ({ listDueFollowUps }));
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

const { followUpEmail, sendFollowUpDigest } = await import("@/lib/admin/follow-up-digest");

const now = new Date("2026-10-14T14:00:00Z"); // 7:00 AM Las Vegas
const job = (id: string, name: string, at: string, note: string | null) =>
  ({ id, name, phone: "7025550100", followUpAt: new Date(at), followUpNote: note }) as never;
const overdue = job("00000000-0000-4000-8000-000000000001", "Maria Lopez", "2026-10-13T23:00:00Z", "checking with husband");
const today = job("00000000-0000-4000-8000-000000000002", "Sam Park", "2026-10-14T21:00:00Z", null);

beforeEach(() => {
  listDueFollowUps.mockReset();
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("LEAD_NOTIFICATION_EMAIL", "owner@example.com,partner@example.com");
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test");
});

describe("followUpEmail", () => {
  it("is null when nothing is due", () => {
    expect(followUpEmail([], now)).toBeNull();
  });
  it("lists overdue first, then today, with phone and tracker link", () => {
    const email = followUpEmail([overdue, today], now)!;
    expect(email.subject).toBe("Call-backs for Wed, Oct 14, 2026: 2");
    expect(email.text).toBe([
      "Overdue",
      "- Maria Lopez · Tue 10/13, 4:00 PM · checking with husband",
      "  (702) 555-0100 · Open in tracker: https://pss.test/admin/jobs/00000000-0000-4000-8000-000000000001",
      "",
      "Today",
      "- Sam Park · Wed 10/14, 2:00 PM",
      "  (702) 555-0100 · Open in tracker: https://pss.test/admin/jobs/00000000-0000-4000-8000-000000000002",
    ].join("\n"));
  });
});

describe("sendFollowUpDigest", () => {
  it("sends nothing when nothing is due", async () => {
    listDueFollowUps.mockResolvedValue([]);
    expect(await sendFollowUpDigest(now)).toEqual({ sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });
  it("emails both owners", async () => {
    listDueFollowUps.mockResolvedValue([overdue, today]);
    expect(await sendFollowUpDigest(now)).toEqual({ sent: 2 });
    expect(send.mock.calls[0][0].to).toEqual(["owner@example.com", "partner@example.com"]);
  });
  it("reports a failed send", async () => {
    listDueFollowUps.mockResolvedValue([today]);
    send.mockResolvedValue({ error: { message: "down" } });
    expect((await sendFollowUpDigest(now)).error).toMatch(/down/);
  });
  it("reports missing configuration", async () => {
    listDueFollowUps.mockResolvedValue([today]);
    vi.stubEnv("LEAD_NOTIFICATION_EMAIL", "");
    expect((await sendFollowUpDigest(now)).error).toMatch(/not configured/);
  });
});
```

Check the expected phone format against `formatPhone("7025550100")` (the job page shows "(702) 555-0100").

`tests/admin/follow-ups-cron.test.ts` (`// @vitest-environment node`):

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendFollowUpDigest = vi.fn();
vi.mock("@/lib/admin/follow-up-digest", () => ({ sendFollowUpDigest }));
const { GET } = await import("@/app/api/cron/follow-ups/route");
const call = (auth?: string) => GET(new Request("http://localhost/api/cron/follow-ups", auth ? { headers: { authorization: auth } } : {}));

beforeEach(() => {
  sendFollowUpDigest.mockReset().mockResolvedValue({ sent: 1 });
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("follow-ups cron", () => {
  it("refuses without the secret, before doing anything", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(sendFollowUpDigest).not.toHaveBeenCalled();
  });
  it("sends the digest", async () => {
    const response = await call("Bearer s3cret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 1 });
  });
  it("fails the run on an error so it isn't missed", async () => {
    sendFollowUpDigest.mockResolvedValue({ sent: 0, error: "down" });
    expect((await call("Bearer s3cret")).status).toBe(500);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/follow-up-digest.test.ts tests/admin/follow-ups-cron.test.ts tests/leads/email.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/leads/email.ts`: add and use:

```ts
/** Every owner address in LEAD_NOTIFICATION_EMAIL (comma-separated). */
export function ownerRecipients(): string[] {
  return (process.env.LEAD_NOTIFICATION_EMAIL ?? "").split(",").map((address) => address.trim()).filter(Boolean);
}
```

and in `sendLeadNotification` replace the inline split with `const to = ownerRecipients();`.

`lib/admin/follow-up-digest.ts`:

```ts
import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { formatPhone } from "@/lib/leads/schema";
import { ownerRecipients } from "@/lib/leads/email";
import { adminOrigin } from "./origin";
import { formatFollowUp } from "./follow-up";
import { listDueFollowUps } from "./follow-ups";
import type { Job } from "./jobs";
import { formatDay } from "./time";

function block(title: string, jobs: Job[]): string[] {
  if (jobs.length === 0) return [];
  return [
    title,
    ...jobs.flatMap((job) => [
      `- ${job.name} · ${formatFollowUp(job.followUpAt as Date, job.followUpNote ?? null)}`,
      `  ${formatPhone(job.phone)} · Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}`,
    ]),
  ];
}

/** The morning digest, or null when nothing is due. Overdue first, then today. */
export function followUpEmail(jobs: Job[], now: Date): { subject: string; text: string } | null {
  const due = jobs.filter((job) => job.followUpAt);
  if (due.length === 0) return null;
  const overdue = due.filter((job) => (job.followUpAt as Date).getTime() < now.getTime());
  const today = due.filter((job) => (job.followUpAt as Date).getTime() >= now.getTime());
  const sections = [block("Overdue", overdue), block("Today", today)].filter((lines) => lines.length);
  return {
    subject: `Call-backs for ${formatDay(now)}: ${due.length}`,
    text: sections.map((lines) => lines.join("\n")).join("\n\n"),
  };
}

/** Run by the daily cron. Never throws; an error comes back for the route to report. */
export async function sendFollowUpDigest(now: Date = new Date()): Promise<{ sent: number; error?: string }> {
  try {
    const email = followUpEmail(await listDueFollowUps(now), now);
    if (!email) return { sent: 0 };
    const apiKey = process.env.RESEND_API_KEY;
    const to = ownerRecipients();
    if (!apiKey || to.length === 0) return { sent: 0, error: "Follow-up email is not configured" };
    const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
    const { error } = await new Resend(apiKey).emails.send({
      from: `${business.name} <${from}>`, to, subject: email.subject, text: email.text,
    });
    if (error) return { sent: 0, error: `Resend rejected the follow-up email: ${error.message}` };
    return { sent: to.length };
  } catch (error) {
    console.error("Follow-up digest failed", error);
    return { sent: 0, error: (error as Error).message };
  }
}
```

`app/api/cron/follow-ups/route.ts`:

```ts
import { sendFollowUpDigest } from "@/lib/admin/follow-up-digest";

/**
 * Called each morning by Vercel Cron (vercel.json). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`; anything else is refused before any
 * data is read.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendFollowUpDigest();
  return Response.json(result, { status: result.error ? 500 : 200 });
}
```

`vercel.json` — keep both existing entries and add the third:

```json
{
  "crons": [
    { "path": "/api/cron/review-requests", "schedule": "0 17 * * *" },
    { "path": "/api/cron/calendar", "schedule": "0 16 * * *" },
    { "path": "/api/cron/follow-ups", "schedule": "0 14 * * *" }
  ]
}
```

- [ ] **Step 4: Run to verify they pass**

Run the Step 2 command, then `npx vitest run --maxWorkers=2 tests/admin tests/leads`. Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add lib/leads/email.ts lib/admin/follow-up-digest.ts app/api/cron/follow-ups/route.ts vercel.json tests/admin/follow-up-digest.test.ts tests/admin/follow-ups-cron.test.ts tests/leads/email.test.ts
git commit -m "feat: morning call-back email to both owners"
```

---

### Task 6: End-to-end

**Files:**
- Create: `e2e/follow-ups.spec.ts`
- Modify: `playwright.config.ts` (mobile `testIgnore`; `ADMIN_EMAILS`)

- [ ] **Step 1: Config**

`playwright.config.ts`: mobile `testIgnore` becomes `/(admin|portal|call|follow-ups)\.spec\.ts/`; `ADMIN_EMAILS` gains `,e2e-followup-owner@example.com` (keep every existing address). Keep the comment that each spec signs in as its own owner.

- [ ] **Step 2: Write `e2e/follow-ups.spec.ts`**

```ts
import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run follow-up tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-followup-owner@example.com";
const STAMP = Date.now();

async function signIn(page: Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
}

async function lead(name: string): Promise<string> {
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550180', 'e2e-followup@example.com', 'Henderson', 'phone', 'new') returning id`;
  return row.id as string;
}

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from leads where name like 'E2E FollowUp %'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

test("a no-answer call sets tomorrow's call-back", async ({ page }) => {
  const id = await lead(`E2E FollowUp Call ${STAMP}`);
  await signIn(page);
  await page.goto(`/admin/jobs/${id}/call`);
  await page.getByRole("button", { name: "Tomorrow 10 AM" }).click();
  await page.getByLabel("Reason").fill("checking with husband");
  await page.getByRole("button", { name: "No answer" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${id}$`));
  await expect(page.getByText(/Next call-back: .* 10:00 AM · checking with husband/)).toBeVisible();
  const [row] = await sql()`select follow_up_note from leads where id = ${id}`;
  expect(row.follow_up_note).toBe("checking with husband");
});

test("an overdue call-back shows on the board until it's done", async ({ page }) => {
  const name = `E2E FollowUp Overdue ${STAMP}`;
  const id = await lead(name);
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);
  await page.getByRole("button", { name: "Set call-back" }).click();
  await page.getByLabel("Call-back date and time").fill("2026-01-05T09:00");
  await page.getByRole("button", { name: "Save call-back" }).click();
  await expect(page.getByText(/Next call-back: .* 9:00 AM/)).toBeVisible();

  await page.goto("/admin");
  const due = page.getByRole("region", { name: /Follow-ups due/ });
  await expect(due.getByRole("link", { name })).toBeVisible();
  await expect(due.getByRole("listitem").filter({ hasText: name })).toContainText("Overdue");

  await page.goto(`/admin/jobs/${id}`);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("No call-back set")).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});
```

- [ ] **Step 3: Verify**

`npx playwright test e2e/follow-ups.spec.ts --list` → 2 tests, desktop only, no server started. Do not run it against a database (the controller runs e2e on a Neon test branch). `npx eslint e2e/follow-ups.spec.ts playwright.config.ts`; `npx vitest run --maxWorkers=2 tests/admin` once.

- [ ] **Step 4: Commit**

```bash
git add e2e/follow-ups.spec.ts playwright.config.ts
git commit -m "test: end-to-end call-back reminders"
```

---

## Launch (not part of any task: owner approval required)

1. Ping the other sessions before merging to main.
2. With the owner's explicit OK: `node scripts/migrate.mjs` (applies 009 to production) — before the deploy, since `JOB_COLUMNS` reads the new columns.
3. With the owner's explicit OK: `npx vercel --prod`.
4. Live check: log a No-answer call with "Tomorrow 10 AM" → the job shows the call-back; set a past one → it appears as overdue on the board; tap Done. The next morning's email arrives for both owners.
