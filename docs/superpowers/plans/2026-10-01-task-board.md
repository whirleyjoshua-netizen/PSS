# Task Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An internal task board at `/admin/tasks`. Signed-in admins create tasks, assign them to each other, set a due date, and move them across To do / In progress / Done. The assignee gets an email on assignment, on **Remind now**, and in a 7am digest.

**Architecture:** One new table (`tasks`, migration 032). Pure, client-safe rules live in `lib/admin/task-rules.ts`. Form parsing lives in `lib/admin/task-schema.ts`. The database store is `lib/admin/tasks.ts`, and plain-text Resend emails are in `lib/admin/task-emails.ts`. Server actions are in `app/admin/tasks/actions.ts`, and the board and detail pages are under `app/admin/tasks/`. A daily Vercel cron route sends the digest. Every write that must be atomic is a single SQL statement (see the `pss-atomic-writes-single-cte` precedent).

**Tech Stack:** Next.js 16.3 App Router (server components and server actions), React 19 `useActionState`, `@neondatabase/serverless` tagged templates, zod 4, Resend, Tailwind 4, vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-task-board-design.md`

## Global Constraints

- Work only in the worktree `/Users/jenniferjordan/pss/.claude/worktrees/task-board` (branch `feat/task-board`). Before editing, run `git rev-parse --show-toplevel` and confirm it prints that path.
- Migration number is **032** (`db/migrations/032_tasks.sql`). Every statement must be safe to re-run, because `scripts/migrate.mjs` re-applies every file.
- Statuses are exactly `todo`, `doing`, `done`, labelled "To do", "In progress", "Done".
- Title is 1–200 characters after trimming. Notes are at most 2000 characters, and blank notes are stored as null.
- Assignable people are the owners (`ADMIN_EMAILS`) plus the `admin_access` emails. A null assignee means "Unassigned".
- Due dates are calendar days in America/Los_Angeles (`lib/admin/time.ts` `lasVegasDate`).
- The Remind now cooldown is **10 minutes**, enforced in SQL. Done tasks stay on the board for **14 days** after `completed_at`.
- Emails are plain text from `` `${business.name} <${LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com"}>` `` and link to `${adminOrigin()}/admin/tasks/<id>`.
- No assignment email is sent when you assign yourself, or when the assignee did not change.
- A task save never depends on email. A failed send shows: `Saved, but the email to <Name> didn't send.`
- Every server action calls `requireAdmin()` before reading input.
- Run unit tests with `npx vitest run --maxWorkers=2 <files>`.
- Commit with the repo's configured identity (`whirleyjoshua@gmail.com`; check with `git config user.email`). End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- AGENTS.md: this Next.js version differs from training data. Before writing page, route or action code, read the relevant guide in `node_modules/next/dist/docs/` and follow the repo precedents named in each task.
- Never print a database connection string. Pipe it to a file or an env var, and name endpoints by their `ep-…` id only.

---

### Task 0: Worktree setup

**Files:** none committed.

- [ ] **Step 1: Confirm the worktree and install dependencies**

```bash
cd /Users/jenniferjordan/pss/.claude/worktrees/task-board
git rev-parse --show-toplevel   # must print …/.claude/worktrees/task-board
git branch --show-current       # must print feat/task-board
npm ci
```

- [ ] **Step 2: Baseline the suite**

Run: `npx vitest run --maxWorkers=2 tests/admin tests/db`
Expected: all pass. If anything fails before you've changed a line, stop and report it. Don't fix unrelated failures.

---

### Task 1: Migration 032

**Files:**
- Create: `db/migrations/032_tasks.sql`
- Test: `tests/db/migration-032.test.ts`

**Interfaces:**
- Produces: table `tasks` with columns `id uuid, title text, notes text, status text, assignee_email text, due_on date, created_by text, created_at timestamptz, updated_at timestamptz, completed_at timestamptz, last_reminded_at timestamptz, last_reminded_by text`, and constraints `tasks_title_check`, `tasks_status_check`, `tasks_assignee_normalized_check`, `tasks_completed_check`, `tasks_reminded_check`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/migration-032.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const statements = readFileSync("db/migrations/032_tasks.sql", "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const all = statements.join("\n");

describe("migration 032", () => {
  it("is only re-runnable statements", () => {
    for (const s of statements) {
      expect(s).toMatch(/^(create table if not exists tasks|alter table tasks (drop constraint if exists|add constraint)|create index if not exists)/);
    }
  });
  it("drops each constraint before adding it", () => {
    for (const name of ["tasks_title_check", "tasks_status_check", "tasks_assignee_normalized_check", "tasks_completed_check", "tasks_reminded_check"]) {
      const drop = statements.findIndex((s) => s === `alter table tasks drop constraint if exists ${name}`);
      const add = statements.findIndex((s) => s.startsWith(`alter table tasks add constraint ${name} check`));
      expect(drop).toBeGreaterThanOrEqual(0);
      expect(add).toBeGreaterThan(drop);
    }
  });
  it("enforces the spec's rules in the database", () => {
    expect(all).toContain("check (char_length(btrim(title)) between 1 and 200)");
    expect(all).toContain("check (status in ('todo', 'doing', 'done'))");
    expect(all).toContain("check (assignee_email is null or assignee_email = lower(btrim(assignee_email)))");
    expect(all).toContain("check ((status = 'done') = (completed_at is not null))");
    expect(all).toContain("check ((last_reminded_at is null) = (last_reminded_by is null))");
    expect(all).toContain("due_on date");
    expect(all).toContain("status text not null default 'todo'");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/db/migration-032.test.ts`
Expected: FAIL with `ENOENT: no such file or directory, open 'db/migrations/032_tasks.sql'`.

- [ ] **Step 3: Write the migration**

```sql
-- Internal task board: docs/superpowers/specs/2026-10-01-task-board-design.md.
-- Anyone with admin sign-in creates tasks, assigns them to each other, and emails reminders.
-- Every statement is safe to re-run.

create table if not exists tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  notes            text,
  status           text not null default 'todo',
  assignee_email   text,
  due_on           date,
  created_by       text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  last_reminded_at timestamptz,
  last_reminded_by text
);

alter table tasks drop constraint if exists tasks_title_check;
alter table tasks add constraint tasks_title_check check (char_length(btrim(title)) between 1 and 200);

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check check (status in ('todo', 'doing', 'done'));

-- Assignees are compared with signed-in emails, which are lower-case and trimmed.
alter table tasks drop constraint if exists tasks_assignee_normalized_check;
alter table tasks add constraint tasks_assignee_normalized_check check (assignee_email is null or assignee_email = lower(btrim(assignee_email)));

-- The board hides Done after 14 days by completed_at, so a done task must have one.
alter table tasks drop constraint if exists tasks_completed_check;
alter table tasks add constraint tasks_completed_check check ((status = 'done') = (completed_at is not null));

alter table tasks drop constraint if exists tasks_reminded_check;
alter table tasks add constraint tasks_reminded_check check ((last_reminded_at is null) = (last_reminded_by is null));

create index if not exists tasks_status_due_idx on tasks (status, due_on);
```

- [ ] **Step 4: Run the tests to verify they pass, including the cross-migration guard**

Run: `npx vitest run --maxWorkers=2 tests/db/migration-032.test.ts tests/db/migration-checks-consistent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/032_tasks.sql tests/db/migration-032.test.ts
git commit -m "feat: tasks table (migration 032)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Task rules and form schema

These are pure helpers that client components can import, so nothing here may import `server-only` or `@/lib/db`.

**Files:**
- Create: `lib/admin/task-rules.ts`
- Create: `lib/admin/task-schema.ts`
- Test: `tests/admin/task-rules.test.ts`, `tests/admin/task-schema.test.ts`

**Interfaces:**
- Produces (`lib/admin/task-rules.ts`):
  - `TASK_STATUSES: readonly [{value:"todo",label:"To do"},{value:"doing",label:"In progress"},{value:"done",label:"Done"}]`
  - `type TaskStatus = "todo" | "doing" | "done"`; `isTaskStatus(value: unknown): value is TaskStatus`
  - `TASK_TITLE_MAX = 200`, `TASK_NOTES_MAX = 2000`, `REMIND_COOLDOWN_MINUTES = 10`, `DONE_VISIBLE_DAYS = 14`
  - `type Task = { id: string; title: string; notes: string | null; status: TaskStatus; assigneeEmail: string | null; dueOn: string | null; createdBy: string; createdAt: Date; completedAt: Date | null; lastRemindedAt: Date | null; lastRemindedBy: string | null }`
  - `type TaskSummary = Pick<Task, "id" | "title" | "notes" | "dueOn" | "assigneeEmail">`
  - `displayName(email: string): string`
  - `addDays(ymd: string, days: number): string`
  - `type DueState = "none" | "overdue" | "today" | "upcoming"`; `dueState(dueOn: string | null, today: string): DueState`
  - `formatDueDay(ymd: string): string` returns e.g. `"Fri, Oct 9"`
  - `dueLine(dueOn: string | null, today: string): string`
  - `boardColumns(tasks: Task[], now: Date): Record<TaskStatus, Task[]>`
- Produces (`lib/admin/task-schema.ts`): `taskInputSchema` and `type TaskInput = { title: string; notes: string | null; assignee: string | null; dueOn: string | null; status: TaskStatus }`

- [ ] **Step 1: Write the failing rules test**

```ts
// tests/admin/task-rules.test.ts
import { describe, it, expect } from "vitest";
import {
  addDays, boardColumns, displayName, dueLine, dueState, isTaskStatus, type Task,
} from "@/lib/admin/task-rules";

const task = (over: Partial<Task>): Task => ({
  id: "t", title: "T", notes: null, status: "todo", assigneeEmail: null, dueOn: null,
  createdBy: "a@x.com", createdAt: new Date("2026-09-01T00:00:00Z"), completedAt: null,
  lastRemindedAt: null, lastRemindedBy: null, ...over,
});
const TODAY = "2026-10-01"; // a Thursday

describe("displayName", () => {
  it("title-cases the email's local part", () => {
    expect(displayName("joshua.whirley@gmail.com")).toBe("Joshua Whirley");
    expect(displayName("shade@example.com")).toBe("Shade");
    expect(displayName("e2e-tasks-mate@example.com")).toBe("E2e Tasks Mate");
    expect(displayName("ann_lee@x.com")).toBe("Ann Lee");
  });
});

describe("isTaskStatus", () => {
  it("accepts only the three statuses", () => {
    expect(["todo", "doing", "done"].every(isTaskStatus)).toBe(true);
    expect(isTaskStatus("blocked")).toBe(false);
    expect(isTaskStatus(undefined)).toBe(false);
  });
});

describe("addDays", () => {
  it("crosses month, year and daylight-saving boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02"); // Pacific DST ends Nov 1, 2026
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
});

describe("dueState and dueLine", () => {
  it("has no state without a date", () => {
    expect(dueState(null, TODAY)).toBe("none");
    expect(dueLine(null, TODAY)).toBe("No due date");
  });
  it("is overdue before today, counting days", () => {
    expect(dueState("2026-09-30", TODAY)).toBe("overdue");
    expect(dueLine("2026-09-30", TODAY)).toBe("Overdue by 1 day");
    expect(dueLine("2026-09-28", TODAY)).toBe("Overdue by 3 days");
  });
  it("is due today on the day", () => {
    expect(dueState(TODAY, TODAY)).toBe("today");
    expect(dueLine(TODAY, TODAY)).toBe("Due today");
  });
  it("names the day when it is ahead", () => {
    expect(dueState("2026-10-09", TODAY)).toBe("upcoming");
    expect(dueLine("2026-10-09", TODAY)).toBe("Due Fri, Oct 9");
  });
});

describe("boardColumns", () => {
  const now = new Date("2026-10-01T17:00:00Z");
  it("sorts open tasks by due date, undated last, ties oldest first", () => {
    const undated = task({ id: "undated" });
    const late = task({ id: "late", dueOn: "2026-09-29" });
    const soonNew = task({ id: "soon-new", dueOn: "2026-10-03", createdAt: new Date("2026-09-20T00:00:00Z") });
    const soonOld = task({ id: "soon-old", dueOn: "2026-10-03", createdAt: new Date("2026-09-10T00:00:00Z") });
    const doing = task({ id: "doing", status: "doing" });
    const columns = boardColumns([undated, soonNew, late, soonOld, doing], now);
    expect(columns.todo.map((t) => t.id)).toEqual(["late", "soon-old", "soon-new", "undated"]);
    expect(columns.doing.map((t) => t.id)).toEqual(["doing"]);
  });
  it("shows Done for 14 days, newest first", () => {
    const fresh = task({ id: "fresh", status: "done", completedAt: new Date("2026-09-30T17:00:00Z") });
    const edge = task({ id: "edge", status: "done", completedAt: new Date("2026-09-17T17:00:00Z") }); // exactly 14 days
    const old = task({ id: "old", status: "done", completedAt: new Date("2026-09-16T17:00:00Z") });
    expect(boardColumns([edge, old, fresh], now).done.map((t) => t.id)).toEqual(["fresh", "edge"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/admin/task-rules.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/admin/task-rules"`.

- [ ] **Step 3: Write `lib/admin/task-rules.ts`**

```ts
/** The task board's rules. Pure and safe to import from client components. */

export const TASK_STATUSES = [
  { value: "todo", label: "To do" },
  { value: "doing", label: "In progress" },
  { value: "done", label: "Done" },
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number]["value"];

export const isTaskStatus = (value: unknown): value is TaskStatus =>
  TASK_STATUSES.some((status) => status.value === value);

export const TASK_TITLE_MAX = 200;
export const TASK_NOTES_MAX = 2000;
/** Remind now refuses inside this window; the SQL in lib/admin/tasks.ts enforces it. */
export const REMIND_COOLDOWN_MINUTES = 10;
/** Done tasks leave the board this long after they were finished. */
export const DONE_VISIBLE_DAYS = 14;

/** `dueOn` is a Las Vegas calendar day, "YYYY-MM-DD". */
export type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  assigneeEmail: string | null;
  dueOn: string | null;
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
  lastRemindedAt: Date | null;
  lastRemindedBy: string | null;
};

/** What an email about a task needs. */
export type TaskSummary = Pick<Task, "id" | "title" | "notes" | "dueOn" | "assigneeEmail">;

/** "joshua.whirley@…" → "Joshua Whirley". Sign-ins have no name, only an email. */
export function displayName(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._-]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1));
  return words.join(" ") || email;
}

const DAY_MS = 86_400_000;
/** Noon UTC on a YYYY-MM-DD date, so day arithmetic never crosses a boundary. */
const noonUtc = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
const daysFrom = (from: string, to: string) => Math.round((noonUtc(to).getTime() - noonUtc(from).getTime()) / DAY_MS);

export const addDays = (ymd: string, days: number): string =>
  new Date(noonUtc(ymd).getTime() + days * DAY_MS).toISOString().slice(0, 10);

export type DueState = "none" | "overdue" | "today" | "upcoming";

/** `today` is the Las Vegas date (lasVegasDate(now)). */
export function dueState(dueOn: string | null, today: string): DueState {
  if (!dueOn) return "none";
  if (dueOn < today) return "overdue";
  return dueOn === today ? "today" : "upcoming";
}

/** "Fri, Oct 9", with no time-zone shift. */
export const formatDueDay = (ymd: string): string =>
  noonUtc(ymd).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

export function dueLine(dueOn: string | null, today: string): string {
  if (!dueOn) return "No due date";
  const late = daysFrom(dueOn, today);
  if (late === 0) return "Due today";
  if (late > 0) return `Overdue by ${late} ${late === 1 ? "day" : "days"}`;
  return `Due ${formatDueDay(dueOn)}`;
}

/** Undated last; equal dates oldest first. Overdue tasks sort first because their dates are earliest. */
function byDue(a: Task, b: Task): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  return a.createdAt.getTime() - b.createdAt.getTime();
}

export function boardColumns(tasks: Task[], now: Date): Record<TaskStatus, Task[]> {
  const cutoff = now.getTime() - DONE_VISIBLE_DAYS * DAY_MS;
  return {
    todo: tasks.filter((task) => task.status === "todo").sort(byDue),
    doing: tasks.filter((task) => task.status === "doing").sort(byDue),
    done: tasks
      .filter((task) => task.status === "done" && task.completedAt !== null && task.completedAt.getTime() >= cutoff)
      .sort((a, b) => (b.completedAt as Date).getTime() - (a.completedAt as Date).getTime()),
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run --maxWorkers=2 tests/admin/task-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing schema test**

```ts
// tests/admin/task-schema.test.ts
import { describe, it, expect } from "vitest";
import { taskInputSchema } from "@/lib/admin/task-schema";

const base = { title: "Finish new flyers", notes: "", assignee: "", dueOn: "", status: "todo" };
const parse = (over: Partial<typeof base>) => taskInputSchema.safeParse({ ...base, ...over });
const message = (over: Partial<typeof base>) => {
  const result = parse(over);
  return result.success ? null : result.error.issues[0].message;
};

describe("taskInputSchema", () => {
  it("turns blanks into nulls and trims the title", () => {
    expect(parse({ title: "  Finish new flyers  " })).toEqual({
      success: true,
      data: { title: "Finish new flyers", notes: null, assignee: null, dueOn: null, status: "todo" },
    });
  });
  it("normalizes the assignee", () => {
    const result = parse({ assignee: "  Shade@Example.COM " });
    expect(result.success && result.data.assignee).toBe("shade@example.com");
  });
  it("keeps a real date", () => {
    const result = parse({ dueOn: "2026-10-09" });
    expect(result.success && result.data.dueOn).toBe("2026-10-09");
  });
  it("rejects a blank or long title", () => {
    expect(message({ title: "   " })).toBe("Give the task a title");
    expect(message({ title: "x".repeat(201) })).toBe("Keep the title to 200 characters");
    expect(parse({ title: "x".repeat(200) }).success).toBe(true);
  });
  it("rejects long notes", () => {
    expect(message({ notes: "x".repeat(2001) })).toBe("Keep the notes to 2000 characters");
  });
  it("rejects an impossible date and a malformed assignee", () => {
    expect(message({ dueOn: "2026-02-30" })).toBe("Pick a due date from the calendar");
    expect(message({ dueOn: "next friday" })).toBe("Pick a due date from the calendar");
    expect(message({ assignee: "shade" })).toBe("Pick someone from the list");
  });
  it("rejects an unknown status", () => {
    expect(parse({ status: "blocked" }).success).toBe(false);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/admin/task-schema.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/admin/task-schema"`.

- [ ] **Step 7: Write `lib/admin/task-schema.ts`**

```ts
import { z } from "zod";
import { TASK_NOTES_MAX, TASK_STATUSES, TASK_TITLE_MAX, type TaskStatus } from "./task-rules";

const STATUS_VALUES = TASK_STATUSES.map((status) => status.value) as [TaskStatus, ...TaskStatus[]];
const blankToNull = (value: string) => (value === "" ? null : value);

/** A real calendar day: "2026-02-30" parses in JS as March 2, so round-trip it. */
const isCalendarDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

/** The new-task and edit-task forms. The action passes every field as a string. */
export const taskInputSchema = z.object({
  title: z.string().trim()
    .min(1, "Give the task a title")
    .max(TASK_TITLE_MAX, `Keep the title to ${TASK_TITLE_MAX} characters`),
  notes: z.string().trim()
    .max(TASK_NOTES_MAX, `Keep the notes to ${TASK_NOTES_MAX} characters`)
    .transform(blankToNull),
  assignee: z.string().trim().toLowerCase().transform(blankToNull)
    .pipe(z.string().email("Pick someone from the list").nullable()),
  dueOn: z.string().trim().transform(blankToNull)
    .pipe(z.string().refine(isCalendarDay, "Pick a due date from the calendar").nullable()),
  status: z.enum(STATUS_VALUES),
});

export type TaskInput = z.output<typeof taskInputSchema>;
```

- [ ] **Step 8: Run both tests and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/admin/task-rules.test.ts tests/admin/task-schema.test.ts && npx tsc --noEmit`
Expected: PASS, and tsc exits 0.

- [ ] **Step 9: Test power**

Change `if (dueOn < today) return "overdue";` to `if (dueOn <= today) return "overdue";` and run the rules test. It must FAIL ("is due today on the day"). Delete the `isCalendarDay` refine and run the schema test. It must FAIL ("2026-02-30"). Put both back and re-run until both pass.

- [ ] **Step 10: Commit**

```bash
git add lib/admin/task-rules.ts lib/admin/task-schema.ts tests/admin/task-rules.test.ts tests/admin/task-schema.test.ts
git commit -m "feat: task board rules and form schema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Task store, and access removal unassigns open tasks

**Files:**
- Create: `lib/admin/tasks.ts`
- Modify: `lib/admin/admin-access.ts` (`removeAdmin`, lines 26–38)
- Test: `tests/admin/tasks-store.test.ts`; modify `tests/admin/admin-access.test.ts`

**Interfaces:**
- Consumes: `Task`, `TaskStatus`, `DONE_VISIBLE_DAYS`, `REMIND_COOLDOWN_MINUTES` (Task 2); `TaskInput` (Task 2); `parseAllowlist` (`lib/admin/allowlist.ts`); `listAddedAdmins` (`lib/admin/admin-access.ts`); `isUuid` (`lib/admin/ids.ts`).
- Produces (`lib/admin/tasks.ts`):
  - `assignableEmails(): Promise<string[]>`: owners ∪ added admins, deduplicated and sorted
  - `listTasks(): Promise<Task[]>`: open tasks, plus tasks done within `DONE_VISIBLE_DAYS`
  - `getTask(id: string): Promise<Task | null>`
  - `createTask(input: TaskInput, actor: string): Promise<{ id: string } | "not-assignable">`
  - `updateTask(id: string, input: TaskInput): Promise<{ previousAssignee: string | null } | "missing" | "not-assignable">`
  - `setTaskStatus(id: string, status: TaskStatus): Promise<boolean>`
  - `deleteTask(id: string): Promise<boolean>`
  - `type ReminderClaim = { task: Task; claimedAt: string; previousAt: string | null; previousBy: string | null }`
  - `claimReminder(id: string, actor: string): Promise<{ claim: ReminderClaim } | { refused: "missing" | "done" | "unassigned" | "recent"; lastAt: Date | null }>`
  - `releaseReminder(id: string, claim: ReminderClaim): Promise<void>`
  - `listDigestTasks(through: string): Promise<Task[]>`: open, assigned tasks due on or before `through`

- [ ] **Step 1: Write the failing store test**

These tests mock the database, so they pin the SQL text only. The real behavior is proven in Task 4.

```ts
// tests/admin/tasks-store.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const listAddedAdmins = vi.fn();
vi.mock("@/lib/admin/admin-access", () => ({ listAddedAdmins }));

const store = await import("@/lib/admin/tasks");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const row = {
  id: ID, title: "Flyers", notes: null, status: "todo", assignee_email: "shade@x.com", due_on: "2026-10-09",
  created_by: "joshua@x.com", created_at: "2026-10-01T15:00:00Z", completed_at: null,
  last_reminded_at: null, last_reminded_by: null,
};
const input = { title: "Flyers", notes: null, assignee: "shade@x.com", dueOn: "2026-10-09", status: "todo" as const };

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  listAddedAdmins.mockReset().mockResolvedValue([]);
  vi.stubEnv("ADMIN_EMAILS", "Joshua@x.com, owner2@x.com");
});

describe("assignableEmails", () => {
  it("is the owners plus added admins, once each, sorted", async () => {
    listAddedAdmins.mockResolvedValue([{ email: "shade@x.com" }, { email: "owner2@x.com" }]);
    expect(await store.assignableEmails()).toEqual(["joshua@x.com", "owner2@x.com", "shade@x.com"]);
  });
});

describe("reading tasks", () => {
  it("maps rows and keeps the due date as a calendar day", async () => {
    sql.mockResolvedValue([row]);
    const [task] = await store.listTasks();
    expect(task).toEqual({
      id: ID, title: "Flyers", notes: null, status: "todo", assigneeEmail: "shade@x.com", dueOn: "2026-10-09",
      createdBy: "joshua@x.com", createdAt: new Date("2026-10-01T15:00:00Z"), completedAt: null,
      lastRemindedAt: null, lastRemindedBy: null,
    });
    expect(text(sql.mock.calls[0])).toContain("due_on::text as due_on");
    expect(text(sql.mock.calls[0])).toMatch(/where status <> 'done' or completed_at > now\(\) - make_interval\(days => \?::int\)/);
    expect(sql.mock.calls[0]).toContain(14);
  });
  it("returns null for a malformed id without querying", async () => {
    expect(await store.getTask("nope")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("createTask", () => {
  it("inserts only when the assignee may sign in", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    expect(await store.createTask(input, "joshua@x.com")).toEqual({ id: ID });
    const query = text(sql.mock.calls[0]);
    expect(query).toContain("insert into tasks");
    expect(query).toMatch(/where \?::text is null or \?::text = any\(\?::text\[\]\) or exists \(select 1 from admin_access where email = \?::text\)/);
    expect(sql.mock.calls[0]).toContainEqual(["joshua@x.com", "owner2@x.com"]);
  });
  it("reports a refused assignee", async () => {
    expect(await store.createTask(input, "joshua@x.com")).toBe("not-assignable");
  });
});

describe("updateTask", () => {
  it("returns the previous assignee from one statement", async () => {
    sql.mockResolvedValue([{ found: true, allowed: true, updated: true, previous_assignee: "joshua@x.com" }]);
    expect(await store.updateTask(ID, input)).toEqual({ previousAssignee: "joshua@x.com" });
    expect(sql).toHaveBeenCalledTimes(1);
    // Keeping a done task's assignee is allowed even after their access is gone.
    expect(text(sql.mock.calls[0])).toContain("is not distinct from (select assignee_email from prev)");
    // completed_at is kept when already done, stamped when entering done, cleared when leaving.
    expect(text(sql.mock.calls[0])).toContain("completed_at = case when ?::text = 'done' then case when status = 'done' then completed_at else now() end end");
  });
  it("reports missing and refused", async () => {
    sql.mockResolvedValueOnce([{ found: false, allowed: true, updated: false, previous_assignee: null }]);
    expect(await store.updateTask(ID, input)).toBe("missing");
    sql.mockResolvedValueOnce([{ found: true, allowed: false, updated: false, previous_assignee: null }]);
    expect(await store.updateTask(ID, input)).toBe("not-assignable");
    expect(await store.updateTask("nope", input)).toBe("missing");
  });
});

describe("claimReminder", () => {
  it("claims with the cooldown in the update's where clause", async () => {
    sql.mockResolvedValue([{ ...row, prev_status: "todo", prev_assignee: "shade@x.com", prev_at: null, prev_at_text: null, prev_by: null,
      last_reminded_at: "2026-10-01T17:42:00Z", last_reminded_by: "joshua@x.com", claimed_at: "2026-10-01 17:42:00.123456+00" }]);
    const result = await store.claimReminder(ID, "joshua@x.com");
    expect(result).toEqual({ claim: expect.objectContaining({ claimedAt: "2026-10-01 17:42:00.123456+00", previousAt: null, previousBy: null }) });
    const query = text(sql.mock.calls[0]);
    expect(query).toMatch(/last_reminded_at is null or last_reminded_at < now\(\) - make_interval\(mins => \?::int\)/);
    expect(query).toContain("assignee_email is not null and status <> 'done'");
    expect(sql.mock.calls[0]).toContain(10);
  });
  it("says why it refused", async () => {
    expect(await store.claimReminder(ID, "j@x.com")).toEqual({ refused: "missing", lastAt: null });
    sql.mockResolvedValueOnce([{ id: null, prev_status: "done", prev_assignee: "s@x.com", prev_at: null }]);
    expect(await store.claimReminder(ID, "j@x.com")).toEqual({ refused: "done", lastAt: null });
    sql.mockResolvedValueOnce([{ id: null, prev_status: "todo", prev_assignee: null, prev_at: null }]);
    expect(await store.claimReminder(ID, "j@x.com")).toEqual({ refused: "unassigned", lastAt: null });
    sql.mockResolvedValueOnce([{ id: null, prev_status: "todo", prev_assignee: "s@x.com", prev_at: "2026-10-01T17:40:00Z" }]);
    expect(await store.claimReminder(ID, "j@x.com")).toEqual({ refused: "recent", lastAt: new Date("2026-10-01T17:40:00Z") });
  });
  it("releases only its own claim", async () => {
    await store.releaseReminder(ID, { task: {} as never, claimedAt: "C", previousAt: null, previousBy: null });
    expect(text(sql.mock.calls[0])).toContain("where id = ? and last_reminded_at = ?::timestamptz");
  });
});

describe("listDigestTasks", () => {
  it("selects open, assigned tasks due by the given day", async () => {
    await store.listDigestTasks("2026-10-02");
    expect(text(sql.mock.calls[0])).toMatch(/status <> 'done' and assignee_email is not null and due_on <= \?::date/);
    expect(sql.mock.calls[0]).toContain("2026-10-02");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/admin/tasks-store.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/admin/tasks"`.

- [ ] **Step 3: Write `lib/admin/tasks.ts`**

```ts
import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "./ids";
import { parseAllowlist } from "./allowlist";
import { listAddedAdmins } from "./admin-access";
import { DONE_VISIBLE_DAYS, REMIND_COOLDOWN_MINUTES, type Task, type TaskStatus } from "./task-rules";
import type { TaskInput } from "./task-schema";

const at = (value: unknown): Date | null => (value === null || value === undefined ? null : new Date(value as string));

function toTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    notes: (row.notes as string | null) ?? null,
    status: row.status as TaskStatus,
    assigneeEmail: (row.assignee_email as string | null) ?? null,
    dueOn: (row.due_on as string | null) ?? null,
    createdBy: row.created_by as string,
    createdAt: new Date(row.created_at as string),
    completedAt: at(row.completed_at),
    lastRemindedAt: at(row.last_reminded_at),
    lastRemindedBy: (row.last_reminded_by as string | null) ?? null,
  };
}

const owners = () => parseAllowlist(process.env.ADMIN_EMAILS);

/** Everyone who can sign in: the people a task can be assigned to. */
export async function assignableEmails(): Promise<string[]> {
  const added = (await listAddedAdmins()).map((admin) => admin.email);
  return [...new Set([...owners(), ...added])].sort();
}

export async function listTasks(): Promise<Task[]> {
  const rows = await db()`
    select id, title, notes, status, assignee_email, due_on::text as due_on, created_by, created_at,
           completed_at, last_reminded_at, last_reminded_by
    from tasks
    where status <> 'done' or completed_at > now() - make_interval(days => ${DONE_VISIBLE_DAYS}::int)
    order by created_at`;
  return rows.map(toTask);
}

export async function getTask(id: string): Promise<Task | null> {
  if (!isUuid(id)) return null;
  const rows = await db()`
    select id, title, notes, status, assignee_email, due_on::text as due_on, created_by, created_at,
           completed_at, last_reminded_at, last_reminded_by
    from tasks where id = ${id}`;
  return rows[0] ? toTask(rows[0]) : null;
}

/** The assignee is checked inside the insert, so a removed person can't be assigned by a stale tab. */
export async function createTask(input: TaskInput, actor: string): Promise<{ id: string } | "not-assignable"> {
  const a = input.assignee;
  const rows = await db()`
    insert into tasks (title, notes, status, assignee_email, due_on, created_by, completed_at)
    select ${input.title}::text, ${input.notes}::text, ${input.status}::text, ${a}::text, ${input.dueOn}::date, ${actor}::text,
           case when ${input.status}::text = 'done' then now() end
    where ${a}::text is null or ${a}::text = any(${owners()}::text[]) or exists (select 1 from admin_access where email = ${a}::text)
    returning id`;
  return rows[0] ? { id: rows[0].id as string } : "not-assignable";
}

/**
 * One statement: reads the previous assignee (for the assignment email) and writes. Keeping the
 * current assignee is always allowed, so a done task's history survives that person losing access.
 */
export async function updateTask(
  id: string,
  input: TaskInput,
): Promise<{ previousAssignee: string | null } | "missing" | "not-assignable"> {
  if (!isUuid(id)) return "missing";
  const a = input.assignee;
  const [row] = await db()`
    with prev as (
      select assignee_email from tasks where id = ${id}
    ), allowed as (
      select (${a}::text is null or ${a}::text = any(${owners()}::text[])
              or exists (select 1 from admin_access where email = ${a}::text)
              or ${a}::text is not distinct from (select assignee_email from prev)) as ok
    ), updated as (
      update tasks set
        title = ${input.title}::text, notes = ${input.notes}::text, status = ${input.status}::text,
        assignee_email = ${a}::text, due_on = ${input.dueOn}::date,
        completed_at = case when ${input.status}::text = 'done' then case when status = 'done' then completed_at else now() end end,
        updated_at = now()
      where id = ${id} and (select ok from allowed)
      returning id
    )
    select exists (select 1 from prev) as found, (select ok from allowed) as allowed,
           exists (select 1 from updated) as updated, (select assignee_email from prev) as previous_assignee`;
  if (!row?.found) return "missing";
  if (!row.updated) return "not-assignable";
  return { previousAssignee: (row.previous_assignee as string | null) ?? null };
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`
    update tasks set status = ${status}::text, updated_at = now(),
      completed_at = case when ${status}::text = 'done' then case when status = 'done' then completed_at else now() end end
    where id = ${id}
    returning id`;
  return rows.length > 0;
}

export async function deleteTask(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`delete from tasks where id = ${id} returning id`;
  return rows.length > 0;
}

/** Timestamps travel as Postgres text so restoring one is exact to the microsecond. */
export type ReminderClaim = { task: Task; claimedAt: string; previousAt: string | null; previousBy: string | null };

/**
 * Takes the reminder slot in one statement. Two presses at once: Postgres re-checks the second
 * update's where clause after the first commits, so only one claims and only one email goes out.
 */
export async function claimReminder(
  id: string,
  actor: string,
): Promise<{ claim: ReminderClaim } | { refused: "missing" | "done" | "unassigned" | "recent"; lastAt: Date | null }> {
  if (!isUuid(id)) return { refused: "missing", lastAt: null };
  const [row] = await db()`
    with prev as (
      select status, assignee_email, last_reminded_at, last_reminded_at::text as at_text, last_reminded_by
      from tasks where id = ${id}
    ), claimed as (
      update tasks set last_reminded_at = now(), last_reminded_by = ${actor}::text
      where id = ${id} and assignee_email is not null and status <> 'done'
        and (last_reminded_at is null or last_reminded_at < now() - make_interval(mins => ${REMIND_COOLDOWN_MINUTES}::int))
      returning id, title, notes, status, assignee_email, due_on::text as due_on, created_by, created_at,
                completed_at, last_reminded_at, last_reminded_by, last_reminded_at::text as claimed_at
    )
    select p.status as prev_status, p.assignee_email as prev_assignee, p.last_reminded_at as prev_at,
           p.at_text as prev_at_text, p.last_reminded_by as prev_by, c.*
    from prev p left join claimed c on true`;
  if (!row) return { refused: "missing", lastAt: null };
  if (!row.id) {
    if (row.prev_status === "done") return { refused: "done", lastAt: null };
    if (!row.prev_assignee) return { refused: "unassigned", lastAt: null };
    // Null when a simultaneous press won: this statement's snapshot predates it.
    return { refused: "recent", lastAt: at(row.prev_at) };
  }
  return {
    claim: {
      task: toTask(row),
      claimedAt: row.claimed_at as string,
      previousAt: (row.prev_at_text as string | null) ?? null,
      previousBy: (row.prev_by as string | null) ?? null,
    },
  };
}

/** Undoes a claim whose email failed, unless someone has reminded since. */
export async function releaseReminder(id: string, claim: ReminderClaim): Promise<void> {
  await db()`
    update tasks set last_reminded_at = ${claim.previousAt}::timestamptz, last_reminded_by = ${claim.previousBy}::text
    where id = ${id} and last_reminded_at = ${claim.claimedAt}::timestamptz`;
}

/** For the morning digest: `through` is tomorrow's Las Vegas date. */
export async function listDigestTasks(through: string): Promise<Task[]> {
  const rows = await db()`
    select id, title, notes, status, assignee_email, due_on::text as due_on, created_by, created_at,
           completed_at, last_reminded_at, last_reminded_by
    from tasks
    where status <> 'done' and assignee_email is not null and due_on <= ${through}::date
    order by assignee_email, due_on, created_at`;
  return rows.map(toTask);
}
```

- [ ] **Step 4: Run the store test**

Run: `npx vitest run --maxWorkers=2 tests/admin/tasks-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend the admin-access test (failing)**

In `tests/admin/admin-access.test.ts`, add these lines at the **end** of `it("removes the row, their sessions and unused links in one statement", …)`, after the existing `flat` assertions (they use `flat`, which is declared partway through that test):

```ts
    // Their open tasks become unassigned in the same statement; done tasks keep the name as history.
    expect(flat).toMatch(/update tasks set assignee_email = null, updated_at = now\(\) where status <> 'done' and assignee_email in \(select email from removed\)/);
```

Run: `npx vitest run --maxWorkers=2 tests/admin/admin-access.test.ts`
Expected: FAIL on that new line.

- [ ] **Step 6: Modify `removeAdmin` in `lib/admin/admin-access.ts`**

Replace the function with:

```ts
/** One statement, so the access row, their sessions, unused sign-in links and open tasks go together. */
export async function removeAdmin(email: string): Promise<boolean> {
  const rows = await db()`
    with removed as (
      delete from admin_access where email = ${email} returning email
    ), ended as (
      delete from admin_sessions where email in (select email from removed)
    ), unused as (
      delete from admin_login_tokens where used_at is null and email in (select email from removed)
    ), unassigned as (
      update tasks set assignee_email = null, updated_at = now()
      where status <> 'done' and assignee_email in (select email from removed)
    )
    select email from removed`;
  return rows.length > 0;
}
```

**Deploy-order note:** this statement references `tasks`, so migration 032 must be in production before this code ships (see Task 10). Otherwise removing someone in Settings would fail.

- [ ] **Step 7: Run both tests and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/admin/tasks-store.test.ts tests/admin/admin-access.test.ts && npx tsc --noEmit`
Expected: PASS, and tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add lib/admin/tasks.ts lib/admin/admin-access.ts tests/admin/tasks-store.test.ts tests/admin/admin-access.test.ts
git commit -m "feat: task store; removing access unassigns open tasks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Prove the SQL on a real Neon branch

Mocked tests can't verify SQL. This script calls the real functions against a throwaway branch. It follows the `scripts/verify-measure-kinds.ts` precedent: read that file's header and refusal block first, and copy its safety rules exactly.

**Files:**
- Create: `scripts/verify-tasks.ts`
- Create: `scripts/verify-tasks.config.mts`

**Interfaces:**
- Consumes: everything `lib/admin/tasks.ts` and `removeAdmin` produce (Task 3).

- [ ] **Step 1: Write `scripts/verify-tasks.config.mts`**

Copy `scripts/verify-measure-kinds.config.mts`. Change only the doc comment's script name and `include: ["scripts/verify-tasks.ts"]`.

- [ ] **Step 2: Write `scripts/verify-tasks.ts`**

The header comment must say what the measure-kinds header says (not automated coverage, run by hand, E2E_POSTGRES_URL only, refuses `ep-cold-term`), list the steps below, and list the "watch it fail" edits from Step 5. Copy the `FORBIDDEN_HOSTS`/`refuse`/`host` block from `scripts/verify-measure-kinds.ts` lines 60–110 verbatim, renaming `verify-measure-kinds` to `verify-tasks`. Then:

```ts
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { test } from "vitest";
import {
  claimReminder, createTask, getTask, listDigestTasks, releaseReminder, setTaskStatus, updateTask,
} from "../lib/admin/tasks";
import { removeAdmin } from "../lib/admin/admin-access";
import { taskInputSchema } from "../lib/admin/task-schema";

// … refusal block copied from verify-measure-kinds.ts …

process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
const OWNER = "verify-tasks-owner@example.com";
process.env.ADMIN_EMAILS = OWNER;

const sql = neon(url);
const STAMP = Date.now();
const GUEST = `verify-tasks-guest-${STAMP}@example.com`;
const STRANGER = `verify-tasks-stranger-${STAMP}@example.com`;

const input = (over: Record<string, string>) =>
  taskInputSchema.parse({ title: `VERIFY task ${STAMP}`, notes: "", assignee: "", dueOn: "", status: "todo", ...over });

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}

async function throwsWith(run: () => Promise<unknown>): Promise<string | null> {
  try { await run(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
}

const idOf = (result: { id: string } | "not-assignable") => {
  if (result === "not-assignable") throw new Error("FAILED: expected a task to be created");
  return result.id;
};

test("task board against a real database", async () => {
  console.log(`\nverify-tasks: writing to ${host}\n`);
  try {
    // 1. Unassigned and owner-assigned tasks are created.
    const loose = idOf(await createTask(input({}), OWNER));
    check((await getTask(loose))?.assigneeEmail === null, "an unassigned task is created", "assignee not null");
    const mine = idOf(await createTask(input({ assignee: OWNER }), OWNER));
    check((await getTask(mine))?.assigneeEmail === OWNER, "an owner can be assigned", "assignee wrong");

    // 2. Someone who cannot sign in cannot be assigned, and nothing is written.
    const refused = await createTask(input({ assignee: STRANGER }), OWNER);
    const strays = await sql`select count(*)::int as n from tasks where assignee_email = ${STRANGER}`;
    check(refused === "not-assignable" && Number(strays[0].n) === 0, "a stranger is refused", `got ${JSON.stringify(refused)}, rows ${strays[0].n}`);

    // 3. An added admin can be assigned.
    await sql`insert into admin_access (email, added_by) values (${GUEST}, ${OWNER})`;
    const guestOpen = idOf(await createTask(input({ assignee: GUEST, dueOn: "2026-10-09" }), OWNER));
    const guestDone = idOf(await createTask(input({ assignee: GUEST, status: "done" }), OWNER));
    check((await getTask(guestDone))?.completedAt !== null, "a task created as done has completed_at", "null");

    // 4. Moving to done stamps completed_at and keeps it; moving back clears it.
    await setTaskStatus(mine, "done");
    const first = (await getTask(mine))?.completedAt;
    await setTaskStatus(mine, "done");
    const second = (await getTask(mine))?.completedAt;
    check(!!first && first.getTime() === second?.getTime(), "done → done keeps completed_at", `${first} vs ${second}`);
    await setTaskStatus(mine, "todo");
    check((await getTask(mine))?.completedAt === null, "leaving done clears completed_at", "not cleared");

    // 5. The database guards itself.
    const badStatus = await throwsWith(() => sql`insert into tasks (title, status, created_by) values ('x', 'blocked', ${OWNER})`);
    check(badStatus?.includes("tasks_status_check") ?? false, "status 'blocked' is refused by tasks_status_check", `${badStatus}`);
    const badTitle = await throwsWith(() => sql`insert into tasks (title, created_by) values ('   ', ${OWNER})`);
    check(badTitle?.includes("tasks_title_check") ?? false, "a blank title is refused by tasks_title_check", `${badTitle}`);
    const badDone = await throwsWith(() => sql`update tasks set completed_at = now() where id = ${loose}`);
    check(badDone?.includes("tasks_completed_check") ?? false, "completed_at without done is refused", `${badDone}`);

    // 6. Remind now: one claim per 10 minutes, and a release restores the exact previous value.
    const c1 = await claimReminder(guestOpen, OWNER);
    check("claim" in c1, "the first reminder claims", JSON.stringify(c1));
    const c2 = await claimReminder(guestOpen, OWNER);
    check("refused" in c2 && c2.refused === "recent" && c2.lastAt !== null, "a second within 10 minutes is refused as recent", JSON.stringify(c2));
    await sql`update tasks set last_reminded_at = now() - interval '11 minutes' where id = ${guestOpen}`;
    const before = await sql`select last_reminded_at::text as t, last_reminded_by as b from tasks where id = ${guestOpen}`;
    const c3 = await claimReminder(guestOpen, "someone-else@example.com");
    check("claim" in c3, "after 10 minutes it claims again", JSON.stringify(c3));
    if (!("claim" in c3)) return;
    await releaseReminder(guestOpen, c3.claim);
    const after = await sql`select last_reminded_at::text as t, last_reminded_by as b from tasks where id = ${guestOpen}`;
    check(after[0].t === before[0].t && after[0].b === before[0].b, "release restores the previous reminder exactly", `${JSON.stringify(before[0])} → ${JSON.stringify(after[0])}`);
    // A stale release (someone reminded since) changes nothing.
    const THIRD = "verify-tasks-third@example.com";
    const c4 = await claimReminder(guestOpen, THIRD);
    if (!("claim" in c4)) throw new Error("FAILED: expected a claim after release");
    await releaseReminder(guestOpen, { ...c4.claim, claimedAt: before[0].t as string });
    const kept = await sql`select last_reminded_by as b from tasks where id = ${guestOpen}`;
    // Without the claimedAt guard this would restore c4's previousBy (OWNER).
    check(kept[0].b === THIRD, "a release that doesn't match the claim changes nothing", `by is ${kept[0].b}`);

    // 7. Refusal reasons.
    check(JSON.stringify(await claimReminder(loose, OWNER)) === JSON.stringify({ refused: "unassigned", lastAt: null }), "unassigned is refused", "");
    check(JSON.stringify(await claimReminder(guestDone, OWNER)) === JSON.stringify({ refused: "done", lastAt: null }), "done is refused", "");
    check(JSON.stringify(await claimReminder("00000000-0000-4000-8000-000000000000", OWNER)) === JSON.stringify({ refused: "missing", lastAt: null }), "missing is refused", "");

    // 8. updateTask reports the previous assignee, and a stranger is refused.
    const moved = await updateTask(loose, input({ assignee: OWNER }));
    check(JSON.stringify(moved) === JSON.stringify({ previousAssignee: null }), "update reports the previous assignee", JSON.stringify(moved));
    const strangerUpdate = await updateTask(loose, input({ assignee: STRANGER }));
    check(strangerUpdate === "not-assignable" && (await getTask(loose))?.assigneeEmail === OWNER, "update to a stranger is refused and nothing changes", JSON.stringify(strangerUpdate));

    // 9. Digest: due on or before the given day, open and assigned only.
    const yesterday = idOf(await createTask(input({ assignee: OWNER, dueOn: "2026-09-30" }), OWNER));
    const tomorrow = idOf(await createTask(input({ assignee: OWNER, dueOn: "2026-10-02" }), OWNER));
    const later = idOf(await createTask(input({ assignee: OWNER, dueOn: "2026-10-03" }), OWNER));
    const digestIds = (await listDigestTasks("2026-10-02")).map((t) => t.id);
    check(digestIds.includes(yesterday) && digestIds.includes(tomorrow) && !digestIds.includes(later) && !digestIds.includes(guestDone),
      "the digest takes overdue to tomorrow, not later or done", JSON.stringify(digestIds));

    // 10. Removing access unassigns their open tasks; done ones keep the name.
    check(await removeAdmin(GUEST), "removeAdmin removes the guest", "false");
    check((await getTask(guestOpen))?.assigneeEmail === null, "the guest's open task is unassigned", "still assigned");
    check((await getTask(guestDone))?.assigneeEmail === GUEST, "the guest's done task keeps the name", "cleared");
    // …and editing that done task with its assignee unchanged is still allowed.
    const keepDone = await updateTask(guestDone, input({ assignee: GUEST, status: "done", notes: "history" }));
    check(JSON.stringify(keepDone) === JSON.stringify({ previousAssignee: GUEST }), "a done task keeps a removed assignee on edit", JSON.stringify(keepDone));

    // 11. The migration re-runs cleanly.
    const statements = readFileSync("db/migrations/032_tasks.sql", "utf8")
      .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
      .split(";").map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) await sql.query(statement);
    console.log("  ok  migration 032 re-runs without error");
  } finally {
    await sql`delete from tasks where created_by = ${OWNER}`;
    await sql`delete from admin_access where email = ${GUEST}`;
  }
});
```

- [ ] **Step 3: Cut a Neon test branch and apply migrations to it**

Follow the `pss-production-migrations` memory: branch from production, then point `MIGRATE_DATABASE_URL` at the **branch**. Write the URL to a file in the scratchpad and never echo it. Then:

```bash
MIGRATE_DATABASE_URL="$(cat "$SCRATCH/branch-url")" node scripts/migrate.mjs
```

Check the endpoint id is not `ep-cold-term` by printing only the host's `ep-…` prefix.

- [ ] **Step 4: Run the script twice**

```bash
E2E_POSTGRES_URL="$(cat "$SCRATCH/branch-url")" npx vitest run --config scripts/verify-tasks.config.mts
E2E_POSTGRES_URL="$(cat "$SCRATCH/branch-url")" npx vitest run --config scripts/verify-tasks.config.mts
```

Expected: every `ok` line prints both times, and the second run proves there's no leftover residue.

- [ ] **Step 5: Watch it fail**

One at a time, make each change below in `lib/admin/tasks.ts` (or `admin-access.ts`), run the script, confirm the named step FAILS, then put the code back:
- In `claimReminder`, delete `and (last_reminded_at is null or last_reminded_at < now() - make_interval(mins => ${REMIND_COOLDOWN_MINUTES}::int))`. Step 6 "a second within 10 minutes" must fail.
- In `releaseReminder`, delete `and last_reminded_at = ${claim.claimedAt}::timestamptz`. Step 6 "a release that doesn't match" must fail.
- In `removeAdmin`, delete the `unassigned` CTE. Step 10 "open task is unassigned" must fail.
- In `createTask`, replace the `where …` line with `where true`. Step 2 must fail.
- In `updateTask`, delete `or ${a}::text is not distinct from (select assignee_email from prev)`. Step 10 "keeps a removed assignee" must fail.

Re-run once with everything restored and confirm it passes.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-tasks.ts scripts/verify-tasks.config.mts
git commit -m "test: verify the task board SQL against a real branch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Keep the branch for Task 9's e2e. Record its `ep-…` id (not the URL) in the ledger.

---

### Task 5: Task emails and the morning digest

**Files:**
- Create: `lib/admin/task-emails.ts`
- Test: `tests/admin/task-emails.test.ts`

**Interfaces:**
- Consumes: `TaskSummary`, `Task`, `displayName`, `dueLine`, `formatDueDay`, `addDays` (Task 2); `listDigestTasks` (Task 3); `formatDay`, `lasVegasDate` (`lib/admin/time.ts`); `adminOrigin` (`lib/admin/origin.ts`).
- Produces:
  - `type Email = { subject: string; text: string }`
  - `taskUrl(id: string): string`
  - `assignmentEmail(task: TaskSummary, actor: string): Email`
  - `reminderEmail(task: TaskSummary, actor: string, now: Date): Email`
  - `digestEmails(tasks: Task[], now: Date): { to: string; email: Email }[]`
  - `sendTaskEmail(to: string, email: Email, replyTo?: string): Promise<boolean>`: never throws
  - `sendTaskDigest(now?: Date): Promise<{ sent: number; failed: number; error?: string }>`: never throws

- [ ] **Step 1: Write the failing test**

```ts
// tests/admin/task-emails.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Task } from "@/lib/admin/task-rules";

const listDigestTasks = vi.fn();
vi.mock("@/lib/admin/tasks", () => ({ listDigestTasks }));
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

const { assignmentEmail, reminderEmail, digestEmails, sendTaskEmail, sendTaskDigest } = await import("@/lib/admin/task-emails");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const task = (over: Partial<Task>): Task => ({
  id: ID, title: "Finish new flyers", notes: null, status: "todo", assigneeEmail: "shade@x.com", dueOn: null,
  createdBy: "joshua.whirley@x.com", createdAt: new Date("2026-09-01T00:00:00Z"), completedAt: null,
  lastRemindedAt: null, lastRemindedBy: null, ...over,
});
const now = new Date("2026-10-01T14:00:00Z"); // 7:00 AM Thu Oct 1, Las Vegas

beforeEach(() => {
  listDigestTasks.mockReset().mockResolvedValue([]);
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test");
});

describe("assignmentEmail", () => {
  it("names who assigned it, the due day, the notes and the link", () => {
    expect(assignmentEmail(task({ dueOn: "2026-10-09", notes: "Use the fall photos" }), "joshua.whirley@x.com")).toEqual({
      subject: "Joshua Whirley assigned you: Finish new flyers",
      text: ["Due Fri, Oct 9", "", "Use the fall photos", "", `Open the task: https://pss.test/admin/tasks/${ID}`].join("\n"),
    });
  });
  it("says when there is no due date and skips empty notes", () => {
    expect(assignmentEmail(task({}), "joshua.whirley@x.com").text).toBe(
      ["No due date", "", `Open the task: https://pss.test/admin/tasks/${ID}`].join("\n"));
  });
});

describe("reminderEmail", () => {
  it("counts overdue days in Las Vegas time", () => {
    // 11:30 PM Oct 1 in Las Vegas is already Oct 2 in UTC; the task due Sep 30 is 1 day late, not 2.
    const lateNight = new Date("2026-10-02T06:30:00Z");
    const email = reminderEmail(task({ dueOn: "2026-09-30" }), "joshua.whirley@x.com", lateNight);
    expect(email.subject).toBe("Reminder from Joshua Whirley: Finish new flyers");
    expect(email.text.split("\n")[0]).toBe("Overdue by 1 day");
  });
});

describe("digestEmails", () => {
  it("sends each person only their own tasks, in sections, skipping empty ones", () => {
    const tasks = [
      task({ id: "a", title: "Old", dueOn: "2026-09-29" }),
      task({ id: "b", title: "Now", dueOn: "2026-10-01" }),
      task({ id: "c", title: "Soon", dueOn: "2026-10-02", assigneeEmail: "joshua.whirley@x.com" }),
    ];
    const emails = digestEmails(tasks, now);
    expect(emails.map((e) => e.to)).toEqual(["joshua.whirley@x.com", "shade@x.com"]);
    expect(emails[1].email).toEqual({
      subject: "Your tasks for Thu, Oct 1, 2026: 2",
      text: [
        "Overdue", "- Old · Overdue by 2 days", "  https://pss.test/admin/tasks/a",
        "", "Due today", "- Now", "  https://pss.test/admin/tasks/b",
      ].join("\n"),
    });
    expect(emails[0].email.text).toBe(["Due tomorrow", "- Soon", "  https://pss.test/admin/tasks/c"].join("\n"));
  });
  it("uses the Pacific day late at night, after daylight saving ends", () => {
    const lateNight = new Date("2026-11-02T07:30:00Z"); // 11:30 PM PST Sun Nov 1; already Nov 2 in UTC
    const [only] = digestEmails([task({ dueOn: "2026-11-02" })], lateNight);
    expect(only.email.text.split("\n")[0]).toBe("Due tomorrow");
  });
});

describe("sendTaskEmail", () => {
  it("sends plain text with an optional reply-to", async () => {
    expect(await sendTaskEmail("shade@x.com", { subject: "S", text: "T" }, "joshua@x.com")).toBe(true);
    expect(send.mock.calls[0][0]).toMatchObject({ to: "shade@x.com", subject: "S", text: "T", replyTo: "joshua@x.com" });
  });
  it("is false, never a throw, when unconfigured, rejected or down", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendTaskEmail("s@x.com", { subject: "S", text: "T" })).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "test-key");
    send.mockResolvedValueOnce({ error: { message: "bad" } });
    expect(await sendTaskEmail("s@x.com", { subject: "S", text: "T" })).toBe(false);
    send.mockRejectedValueOnce(new Error("network"));
    expect(await sendTaskEmail("s@x.com", { subject: "S", text: "T" })).toBe(false);
  });
});

describe("sendTaskDigest", () => {
  it("asks for tasks due through tomorrow and sends one email per person", async () => {
    listDigestTasks.mockResolvedValue([task({ dueOn: "2026-10-01" }), task({ id: "c", dueOn: "2026-10-02", assigneeEmail: "j@x.com" })]);
    expect(await sendTaskDigest(now)).toEqual({ sent: 2, failed: 0 });
    expect(listDigestTasks).toHaveBeenCalledWith("2026-10-02");
  });
  it("keeps going after one failure and reports it", async () => {
    listDigestTasks.mockResolvedValue([task({ dueOn: "2026-10-01" }), task({ id: "c", dueOn: "2026-10-02", assigneeEmail: "j@x.com" })]);
    send.mockResolvedValueOnce({ error: { message: "down" } });
    expect(await sendTaskDigest(now)).toEqual({ sent: 1, failed: 1, error: "1 task digest email didn't send" });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("sends nothing when nothing is due, and reports a database error", async () => {
    expect(await sendTaskDigest(now)).toEqual({ sent: 0, failed: 0 });
    listDigestTasks.mockRejectedValue(new Error("db down"));
    expect(await sendTaskDigest(now)).toEqual({ sent: 0, failed: 0, error: "db down" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/admin/task-emails.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/admin/task-emails"`.

- [ ] **Step 3: Write `lib/admin/task-emails.ts`**

```ts
import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { adminOrigin } from "./origin";
import { formatDay, lasVegasDate } from "./time";
import { addDays, displayName, dueLine, formatDueDay, type Task, type TaskSummary } from "./task-rules";
import { listDigestTasks } from "./tasks";

export type Email = { subject: string; text: string };

export const taskUrl = (id: string): string => `${adminOrigin()}/admin/tasks/${id}`;

const body = (first: string, task: TaskSummary): string =>
  [first, ...(task.notes ? ["", task.notes] : []), "", `Open the task: ${taskUrl(task.id)}`].join("\n");

export function assignmentEmail(task: TaskSummary, actor: string): Email {
  return {
    subject: `${displayName(actor)} assigned you: ${task.title}`,
    text: body(task.dueOn ? `Due ${formatDueDay(task.dueOn)}` : "No due date", task),
  };
}

export function reminderEmail(task: TaskSummary, actor: string, now: Date): Email {
  return {
    subject: `Reminder from ${displayName(actor)}: ${task.title}`,
    text: body(dueLine(task.dueOn, lasVegasDate(now)), task),
  };
}

/** One email per assignee with something overdue, due today or due tomorrow; nobody else. */
export function digestEmails(tasks: Task[], now: Date): { to: string; email: Email }[] {
  const today = lasVegasDate(now);
  const tomorrow = addDays(today, 1);
  const byPerson = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.assigneeEmail || !task.dueOn || task.status === "done" || task.dueOn > tomorrow) continue;
    byPerson.set(task.assigneeEmail, [...(byPerson.get(task.assigneeEmail) ?? []), task]);
  }
  const section = (title: string, list: Task[], withDue: boolean): string[] =>
    list.length === 0 ? [] : [title, ...list.flatMap((task) => [
      `- ${task.title}${withDue ? ` · ${dueLine(task.dueOn, today)}` : ""}`,
      `  ${taskUrl(task.id)}`,
    ])];
  return [...byPerson.keys()].sort().map((to) => {
    const mine = byPerson.get(to) as Task[];
    const sections = [
      section("Overdue", mine.filter((task) => (task.dueOn as string) < today), true),
      section("Due today", mine.filter((task) => task.dueOn === today), false),
      section("Due tomorrow", mine.filter((task) => task.dueOn === tomorrow), false),
    ].filter((lines) => lines.length > 0);
    return {
      to,
      email: { subject: `Your tasks for ${formatDay(now)}: ${mine.length}`, text: sections.map((lines) => lines.join("\n")).join("\n\n") },
    };
  });
}

/** True when it went out. Never throws: callers have already saved. */
export async function sendTaskEmail(to: string, email: Email, replyTo?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey) {
    console.error("Task email is not configured (missing RESEND_API_KEY).");
    return false;
  }
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: `${business.name} <${from}>`, to, subject: email.subject, text: email.text,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) {
      console.error("Task email failed", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Task email failed", error);
    return false;
  }
}

/** Run by the daily cron. One person's failed send does not stop the rest. */
export async function sendTaskDigest(now: Date = new Date()): Promise<{ sent: number; failed: number; error?: string }> {
  try {
    const emails = digestEmails(await listDigestTasks(addDays(lasVegasDate(now), 1)), now);
    let sent = 0;
    let failed = 0;
    for (const { to, email } of emails) {
      if (await sendTaskEmail(to, email)) sent += 1;
      else failed += 1;
    }
    if (failed === 0) return { sent, failed };
    return { sent, failed, error: `${failed} task digest ${failed === 1 ? "email" : "emails"} didn't send` };
  } catch (error) {
    console.error("Task digest failed", error);
    return { sent: 0, failed: 0, error: (error as Error).message };
  }
}
```

`replyTo` is the field name the repo already uses with this Resend version (`lib/payments/emails.ts:21`).

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run --maxWorkers=2 tests/admin/task-emails.test.ts && npx tsc --noEmit`
Expected: PASS, and tsc exits 0.

- [ ] **Step 5: Test power**

In `digestEmails`, change `lasVegasDate(now)` to `now.toISOString().slice(0, 10)`. The "late at night, after daylight saving ends" test must FAIL. In `sendTaskDigest`, turn the loop into `return` on the first failure. "keeps going after one failure" must FAIL. Restore both.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/task-emails.ts tests/admin/task-emails.test.ts
git commit -m "feat: task assignment, reminder and digest emails

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Daily digest cron

**Files:**
- Create: `app/api/cron/tasks/route.ts`
- Modify: `vercel.json`
- Test: `tests/admin/tasks-cron.test.ts`

**Interfaces:**
- Consumes: `sendTaskDigest` (Task 5).

- [ ] **Step 1: Write the failing test**

```ts
// tests/admin/tasks-cron.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const sendTaskDigest = vi.fn();
vi.mock("@/lib/admin/task-emails", () => ({ sendTaskDigest }));
const { GET } = await import("@/app/api/cron/tasks/route");
const call = (auth?: string) => GET(new Request("http://localhost/api/cron/tasks", auth ? { headers: { authorization: auth } } : {}));

beforeEach(() => {
  sendTaskDigest.mockReset().mockResolvedValue({ sent: 1, failed: 0 });
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("tasks cron", () => {
  it("refuses without the secret, before doing anything", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(sendTaskDigest).not.toHaveBeenCalled();
  });
  it("sends the digest", async () => {
    const response = await call("Bearer s3cret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 1, failed: 0 });
  });
  it("fails the run when any email failed, so it isn't missed", async () => {
    sendTaskDigest.mockResolvedValue({ sent: 1, failed: 1, error: "1 task digest email didn't send" });
    expect((await call("Bearer s3cret")).status).toBe(500);
  });
  it("is scheduled at 7am Pacific (daylight time) in vercel.json", () => {
    const { crons } = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(crons).toContainEqual({ path: "/api/cron/tasks", schedule: "0 14 * * *" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/admin/tasks-cron.test.ts`
Expected: FAIL, `Failed to resolve import "@/app/api/cron/tasks/route"`.

- [ ] **Step 3: Write the route and schedule**

```ts
// app/api/cron/tasks/route.ts
import { sendTaskDigest } from "@/lib/admin/task-emails";

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
  const result = await sendTaskDigest();
  return Response.json(result, { status: result.error ? 500 : 200 });
}
```

In `vercel.json`, add this as the last entry of `crons`:

```json
    { "path": "/api/cron/tasks", "schedule": "0 14 * * *" }
```

(Add a comma after the previous entry.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run --maxWorkers=2 tests/admin/tasks-cron.test.ts tests/admin/follow-ups-cron.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/tasks/route.ts vercel.json tests/admin/tasks-cron.test.ts
git commit -m "feat: daily task digest cron

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Server actions

Read `node_modules/next/dist/docs/` on server actions and forms first, then `app/admin/settings/actions.ts` (the precedent for `requireAdmin` before input and returned `values` on error).

**Files:**
- Create: `app/admin/tasks/actions.ts`
- Test: `tests/admin/task-actions.test.ts`

**Interfaces:**
- Consumes: `taskInputSchema` (Task 2), the store (Task 3), `assignmentEmail`, `reminderEmail`, `sendTaskEmail` (Task 5), `displayName`, `isTaskStatus` (Task 2), `formatTime` (`lib/admin/time.ts`).
- Produces:
  - `type TaskFormValues = { title: string; notes: string; assignee: string; dueOn: string; status: string }`
  - `type TaskFormState = { error?: string; notice?: string; ok?: string; values?: TaskFormValues }`
  - `createTaskAction(prev: TaskFormState, formData: FormData): Promise<TaskFormState>`
  - `updateTaskAction(id: string, prev: TaskFormState, formData: FormData): Promise<TaskFormState>`
  - `moveTaskAction(id: string, formData: FormData): Promise<void>`
  - `type RemindState = { ok?: string; error?: string }`
  - `remindTaskAction(id: string, prev: RemindState, formData: FormData): Promise<RemindState>`
  - `deleteTaskAction(id: string): Promise<void>`: redirects to `/admin/tasks`

- [ ] **Step 1: Write the failing test**

```ts
// tests/admin/task-actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const store = {
  createTask: vi.fn(), updateTask: vi.fn(), setTaskStatus: vi.fn(), deleteTask: vi.fn(),
  claimReminder: vi.fn(), releaseReminder: vi.fn(),
};
vi.mock("@/lib/admin/tasks", () => store);
const sendTaskEmail = vi.fn();
vi.mock("@/lib/admin/task-emails", async () => ({
  ...(await vi.importActual<object>("@/lib/admin/task-emails")),
  sendTaskEmail,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.fn(() => { throw new Error("NEXT_REDIRECT"); });
vi.mock("next/navigation", () => ({ redirect }));

const actions = await import("@/app/admin/tasks/actions");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const ME = "joshua@x.com";
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};
const filled = { title: "Finish new flyers", notes: "", assignee: "shade@x.com", dueOn: "2026-10-09" };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ email: ME });
  sendTaskEmail.mockResolvedValue(true);
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test");
});

describe("createTaskAction", () => {
  it("checks the session before reading input", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(actions.createTaskAction({}, form(filled))).rejects.toThrow("NEXT_REDIRECT");
    expect(store.createTask).not.toHaveBeenCalled();
  });
  it("creates a to-do and emails the assignee", async () => {
    store.createTask.mockResolvedValue({ id: ID });
    expect(await actions.createTaskAction({}, form(filled))).toEqual({ ok: "Task added." });
    expect(store.createTask).toHaveBeenCalledWith(
      { title: "Finish new flyers", notes: null, assignee: "shade@x.com", dueOn: "2026-10-09", status: "todo" }, ME);
    expect(sendTaskEmail).toHaveBeenCalledWith("shade@x.com", expect.objectContaining({ subject: "Joshua assigned you: Finish new flyers" }));
  });
  it("sends nothing when you assign yourself or nobody", async () => {
    store.createTask.mockResolvedValue({ id: ID });
    await actions.createTaskAction({}, form({ ...filled, assignee: ME }));
    await actions.createTaskAction({}, form({ ...filled, assignee: "" }));
    expect(sendTaskEmail).not.toHaveBeenCalled();
  });
  it("says so when the email fails, but the task is saved", async () => {
    store.createTask.mockResolvedValue({ id: ID });
    sendTaskEmail.mockResolvedValue(false);
    expect(await actions.createTaskAction({}, form(filled))).toEqual({
      ok: "Task added.", notice: "Saved, but the email to Shade didn't send.",
    });
  });
  it("returns what was typed on a bad form or a refused assignee", async () => {
    const bad = await actions.createTaskAction({}, form({ ...filled, title: " " }));
    expect(bad).toEqual({ error: "Give the task a title", values: { ...filled, title: " ", status: "todo" } });
    store.createTask.mockResolvedValue("not-assignable");
    expect((await actions.createTaskAction({}, form(filled))).error).toBe("That person no longer has access. Pick someone from the list.");
    expect(sendTaskEmail).not.toHaveBeenCalled();
  });
});

describe("updateTaskAction", () => {
  const edit = { ...filled, status: "doing" };
  it("emails only when the assignee changed to someone else", async () => {
    store.updateTask.mockResolvedValue({ previousAssignee: "shade@x.com" });
    expect(await actions.updateTaskAction(ID, {}, form(edit))).toEqual({ ok: "Saved.", values: edit });
    expect(sendTaskEmail).not.toHaveBeenCalled();
    store.updateTask.mockResolvedValue({ previousAssignee: ME });
    await actions.updateTaskAction(ID, {}, form(edit));
    expect(sendTaskEmail).toHaveBeenCalledTimes(1);
  });
  it("reports a deleted task", async () => {
    store.updateTask.mockResolvedValue("missing");
    expect((await actions.updateTaskAction(ID, {}, form(edit))).error).toBe("That task was deleted.");
  });
});

describe("moveTaskAction", () => {
  it("moves to a real status only", async () => {
    await actions.moveTaskAction(ID, form({ status: "done" }));
    expect(store.setTaskStatus).toHaveBeenCalledWith(ID, "done");
    await actions.moveTaskAction(ID, form({ status: "blocked" }));
    expect(store.setTaskStatus).toHaveBeenCalledTimes(1);
  });
});

describe("remindTaskAction", () => {
  const claim = {
    task: { id: ID, title: "Finish new flyers", notes: null, dueOn: null, assigneeEmail: "shade@x.com" },
    claimedAt: "C", previousAt: null, previousBy: null,
  };
  it("emails the assignee with reply-to set to you", async () => {
    store.claimReminder.mockResolvedValue({ claim });
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ ok: "Reminder sent to Shade." });
    expect(sendTaskEmail).toHaveBeenCalledWith("shade@x.com", expect.objectContaining({ subject: "Reminder from Joshua: Finish new flyers" }), ME);
    expect(store.releaseReminder).not.toHaveBeenCalled();
  });
  it("gives the claim back when the email fails", async () => {
    store.claimReminder.mockResolvedValue({ claim });
    sendTaskEmail.mockResolvedValue(false);
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ error: "The reminder didn't send. Try again." });
    expect(store.releaseReminder).toHaveBeenCalledWith(ID, claim);
  });
  it("explains each refusal without sending", async () => {
    store.claimReminder.mockResolvedValueOnce({ refused: "recent", lastAt: new Date("2026-10-01T17:42:00Z") });
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ error: "Already reminded at 10:42 AM." });
    store.claimReminder.mockResolvedValueOnce({ refused: "recent", lastAt: null });
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ error: "Already reminded a moment ago." });
    store.claimReminder.mockResolvedValueOnce({ refused: "done", lastAt: null });
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ error: "That task is already done." });
    store.claimReminder.mockResolvedValueOnce({ refused: "unassigned", lastAt: null });
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ error: "Assign the task to someone first." });
    store.claimReminder.mockResolvedValueOnce({ refused: "missing", lastAt: null });
    expect(await actions.remindTaskAction(ID, {}, form({}))).toEqual({ error: "That task was deleted." });
    expect(sendTaskEmail).not.toHaveBeenCalled();
  });
});

describe("deleteTaskAction", () => {
  it("deletes and returns to the board", async () => {
    await expect(actions.deleteTaskAction(ID)).rejects.toThrow("NEXT_REDIRECT");
    expect(store.deleteTask).toHaveBeenCalledWith(ID);
    expect(redirect).toHaveBeenCalledWith("/admin/tasks");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/admin/task-actions.test.ts`
Expected: FAIL, `Failed to resolve import "@/app/admin/tasks/actions"`.

- [ ] **Step 3: Write `app/admin/tasks/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/session";
import { taskInputSchema } from "@/lib/admin/task-schema";
import { claimReminder, createTask, deleteTask, releaseReminder, setTaskStatus, updateTask } from "@/lib/admin/tasks";
import { assignmentEmail, reminderEmail, sendTaskEmail } from "@/lib/admin/task-emails";
import { displayName, isTaskStatus, type TaskSummary } from "@/lib/admin/task-rules";
import { formatTime } from "@/lib/admin/time";

/** Exactly what the form sent, so a rejected form comes back as typed. */
export type TaskFormValues = { title: string; notes: string; assignee: string; dueOn: string; status: string };
export type TaskFormState = { error?: string; notice?: string; ok?: string; values?: TaskFormValues };
export type RemindState = { ok?: string; error?: string };

const NOT_ASSIGNABLE = "That person no longer has access. Pick someone from the list.";
const MISSING = "That task was deleted.";

const refresh = () => {
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/tasks/[id]", "page");
};

const readForm = (formData: FormData): TaskFormValues => ({
  title: String(formData.get("title") ?? ""),
  notes: String(formData.get("notes") ?? ""),
  assignee: String(formData.get("assignee") ?? ""),
  dueOn: String(formData.get("dueOn") ?? ""),
  // The new-task form has no status: a new task starts in To do.
  status: String(formData.get("status") ?? "todo"),
});

/** Undefined when nothing needed sending or it went out; otherwise the notice to show. */
async function notifyAssignee(task: TaskSummary, actor: string, previous: string | null): Promise<string | undefined> {
  const to = task.assigneeEmail;
  if (!to || to === actor.toLowerCase() || to === previous) return undefined;
  if (await sendTaskEmail(to, assignmentEmail(task, actor))) return undefined;
  return `Saved, but the email to ${displayName(to)} didn't send.`;
}

const withNotice = <T extends object>(state: T, notice: string | undefined): T & { notice?: string } =>
  notice ? { ...state, notice } : state;

// Each action calls requireAdmin() before reading its input.
export async function createTaskAction(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const admin = await requireAdmin();
  const values = readForm(formData);
  const parsed = taskInputSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const created = await createTask(parsed.data, admin.email);
  if (created === "not-assignable") return { error: NOT_ASSIGNABLE, values };
  const { title, notes, dueOn, assignee } = parsed.data;
  const notice = await notifyAssignee({ id: created.id, title, notes, dueOn, assigneeEmail: assignee }, admin.email, null);
  refresh();
  return withNotice({ ok: "Task added." }, notice);
}

/** `values` is returned on success too: the edit form shows what was saved, not a reset. */
export async function updateTaskAction(id: string, _prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const admin = await requireAdmin();
  const values = readForm(formData);
  const parsed = taskInputSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const updated = await updateTask(id, parsed.data);
  if (updated === "missing") return { error: MISSING, values };
  if (updated === "not-assignable") return { error: NOT_ASSIGNABLE, values };
  const { title, notes, dueOn, assignee } = parsed.data;
  const notice = await notifyAssignee({ id, title, notes, dueOn, assigneeEmail: assignee }, admin.email, updated.previousAssignee);
  refresh();
  return withNotice({ ok: "Saved.", values }, notice);
}

export async function moveTaskAction(id: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const status = formData.get("status");
  if (!isTaskStatus(status)) return;
  await setTaskStatus(id, status);
  refresh();
}

export async function remindTaskAction(id: string, _prev: RemindState, _formData: FormData): Promise<RemindState> {
  const admin = await requireAdmin();
  const result = await claimReminder(id, admin.email);
  if ("refused" in result) {
    // Someone else's reminder may be why: show their "Reminded …" line too.
    refresh();
    switch (result.refused) {
      case "recent":
        return { error: result.lastAt ? `Already reminded at ${formatTime(result.lastAt)}.` : "Already reminded a moment ago." };
      case "done":
        return { error: "That task is already done." };
      case "unassigned":
        return { error: "Assign the task to someone first." };
      case "missing":
        return { error: MISSING };
    }
  }
  const { claim } = result;
  const to = claim.task.assigneeEmail as string;
  if (!(await sendTaskEmail(to, reminderEmail(claim.task, admin.email, new Date()), admin.email))) {
    await releaseReminder(id, claim);
    return { error: "The reminder didn't send. Try again." };
  }
  refresh();
  return { ok: `Reminder sent to ${displayName(to)}.` };
}

export async function deleteTaskAction(id: string): Promise<void> {
  await requireAdmin();
  await deleteTask(id);
  refresh();
  redirect("/admin/tasks");
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run --maxWorkers=2 tests/admin/task-actions.test.ts && npx tsc --noEmit`
Expected: PASS, and tsc exits 0.

- [ ] **Step 5: Test power**

Delete `to === actor.toLowerCase() ||` in `notifyAssignee`. "sends nothing when you assign yourself" must FAIL. Delete `|| to === previous`. "emails only when the assignee changed" must FAIL. Delete the `releaseReminder` call. "gives the claim back" must FAIL. Restore all three.

- [ ] **Step 6: Commit**

```bash
git add app/admin/tasks/actions.ts tests/admin/task-actions.test.ts
git commit -m "feat: task board server actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The board, the task page, and the nav link

Read the `node_modules/next/dist/docs/` guides on pages, `params`/`searchParams` (they are Promises here) and `notFound`. Precedents: `app/admin/documents/page.tsx` and `app/admin/documents/[id]/page.tsx` (layout, `requireAdmin`, `notFound`), `app/admin/settings/GiveAccessForm.tsx` (`useActionState`, `key` remount, `role="alert"`/`role="status"`), `app/admin/SubmitOnChange.tsx`, and `app/admin/jobs/[id]/DeleteButton.tsx` (two-tap delete).

**Files:**
- Modify: `app/admin/AdminNav.tsx` (`LINKS`, lines 9–14)
- Create: `app/admin/tasks/page.tsx`, `app/admin/tasks/TaskCard.tsx`, `app/admin/tasks/TaskForm.tsx`, `app/admin/tasks/RemindButton.tsx`, `app/admin/tasks/[id]/page.tsx`
- Test: modify `tests/admin/admin-nav.test.tsx`; create `tests/admin/tasks-page.test.tsx`, `tests/admin/task-form.test.tsx`

**Interfaces:**
- Consumes: Tasks 2, 3 and 7. `CARD`, `TEXT_LINK` from `app/admin/jobs/[id]/ui.ts`. `Button` from `components/ui/Button`. `CONTROL`, `Label` from `components/forms/Field`. `formatWhen`, `formatShortDate`, `lasVegasDate` from `lib/admin/time.ts`.
- Produces: `TaskForm({ action, people, defaults, submitLabel, idPrefix, showStatus? })`, `RemindButton({ taskId, title })`, `TaskCard({ task, today })`.

- [ ] **Step 1: Nav test (failing)**

In `tests/admin/admin-nav.test.tsx`, rename the first test to `"links to Jobs, Schedule, Tasks, Documents and Settings, with no New job link"` and add inside it:

```ts
    expect(nav.getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/admin/tasks");
    // Order: Tasks sits between Schedule and Documents.
    expect(nav.getAllByRole("link").map((link) => link.textContent?.trim())).toEqual(
      expect.arrayContaining(["Jobs", "Schedule", "Tasks", "Documents", "Settings"]));
    const names = nav.getAllByRole("link").map((link) => link.textContent?.trim());
    expect(names.indexOf("Tasks")).toBe(names.indexOf("Schedule") + 1);
    expect(names.indexOf("Documents")).toBe(names.indexOf("Tasks") + 1);
```

Add a new test:

```ts
  it("marks the board and every task page as Tasks", () => {
    for (const path of ["/admin/tasks", "/admin/tasks/3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c"]) {
      pathname.mockReturnValue(path);
      const { unmount } = render(<AdminNav email="owner@example.com" />);
      expect(within(column()).getByRole("link", { name: "Tasks" })).toHaveAttribute("aria-current", "page");
      unmount();
    }
  });
```

Run: `npx vitest run --maxWorkers=2 tests/admin/admin-nav.test.tsx`. Expected: FAIL (no Tasks link).

- [ ] **Step 2: Add the link**

In `app/admin/AdminNav.tsx`, `LINKS` becomes:

```ts
const LINKS: readonly { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Jobs", icon: "jobs" },
  { href: "/admin/schedule", label: "Schedule", icon: "calendar" },
  { href: "/admin/tasks", label: "Tasks", icon: "check" },
  { href: "/admin/documents", label: "Documents", icon: "document" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];
```

Run the nav test. Expected: PASS. (`isActive` already treats `/admin/tasks/…` as Tasks.)

- [ ] **Step 3: Write the failing page and form tests**

```tsx
// tests/admin/tasks-page.test.tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Task } from "@/lib/admin/task-rules";

const store = { listTasks: vi.fn(), assignableEmails: vi.fn(), getTask: vi.fn() };
vi.mock("@/lib/admin/tasks", () => store);
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "joshua@x.com" })) }));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/admin/tasks/actions", () => ({
  createTaskAction: vi.fn(async () => ({})), updateTaskAction: vi.fn(async () => ({})),
  moveTaskAction: vi.fn(), remindTaskAction: vi.fn(async () => ({})), deleteTaskAction: vi.fn(),
}));

const { default: TasksPage } = await import("@/app/admin/tasks/page");
const { default: TaskPage } = await import("@/app/admin/tasks/[id]/page");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const task = (over: Partial<Task>): Task => ({
  id: ID, title: "Finish new flyers", notes: null, status: "todo", assigneeEmail: "shade@x.com", dueOn: null,
  createdBy: "joshua@x.com", createdAt: new Date("2026-09-01T00:00:00Z"), completedAt: null,
  lastRemindedAt: null, lastRemindedBy: null, ...over,
});
const open = async (view?: string) => render(await TasksPage({ searchParams: Promise.resolve(view ? { view } : {}) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T17:00:00Z")); // 10 AM Thu Oct 1, Las Vegas
  store.listTasks.mockReset().mockResolvedValue([]);
  store.assignableEmails.mockReset().mockResolvedValue(["joshua@x.com", "shade@x.com"]);
  store.getTask.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TasksPage", () => {
  it("shows three columns with counts", async () => {
    store.listTasks.mockResolvedValue([task({}), task({ id: "b", title: "Order samples", status: "doing" })]);
    await open();
    expect(screen.getByRole("region", { name: "To do (1)" })).toHaveTextContent("Finish new flyers");
    expect(screen.getByRole("region", { name: "In progress (1)" })).toHaveTextContent("Order samples");
    expect(screen.getByRole("region", { name: "Done (0)" })).toHaveTextContent("Nothing finished in the last 14 days.");
  });
  it("flags overdue and due-today tasks in words", async () => {
    store.listTasks.mockResolvedValue([task({ dueOn: "2026-09-30" }), task({ id: "b", title: "Call vendor", dueOn: "2026-10-01" })]);
    await open();
    const todo = within(screen.getByRole("region", { name: "To do (2)" }));
    expect(todo.getByText("Overdue by 1 day")).toHaveClass("text-overdue");
    expect(todo.getByText("Due today")).toBeInTheDocument();
  });
  it("shows who it is for, the reminder line, and Remind only when it can be sent", async () => {
    store.listTasks.mockResolvedValue([
      task({ lastRemindedAt: new Date("2026-10-01T16:42:00Z"), lastRemindedBy: "joshua@x.com" }),
      task({ id: "b", title: "Nobody's", assigneeEmail: null }),
      task({ id: "c", title: "Finished", status: "done", completedAt: new Date("2026-09-30T17:00:00Z") }),
    ]);
    await open();
    // Scoped to the column: the New task form's dropdown also says "Unassigned".
    const todo = within(screen.getByRole("region", { name: "To do (2)" }));
    expect(todo.getByText("Shade")).toBeInTheDocument();
    expect(todo.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("Reminded Thu, Oct 1, 9:42 AM")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Remind now/ })).toHaveLength(1);
  });
  it("filters to my tasks with ?view=mine", async () => {
    store.listTasks.mockResolvedValue([task({}), task({ id: "b", title: "My samples", assigneeEmail: "joshua@x.com" })]);
    await open("mine");
    expect(screen.queryByText("Finish new flyers")).toBeNull();
    expect(screen.getByText("My samples")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mine" })).toHaveAttribute("aria-current", "page");
  });
  it("defaults a new task to me", async () => {
    await open();
    expect(screen.getByLabelText("Assigned to")).toHaveValue("joshua@x.com");
  });
});

describe("TaskPage", () => {
  it("is not found for an unknown task", async () => {
    store.getTask.mockResolvedValue(null);
    await expect(TaskPage({ params: Promise.resolve({ id: ID }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("edits every field and keeps a removed person's name on a done task", async () => {
    store.getTask.mockResolvedValue(task({ status: "done", completedAt: new Date(), assigneeEmail: "gone@x.com" }));
    render(await TaskPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Finish new flyers" })).toBeInTheDocument();
    expect(screen.getByLabelText("Assigned to")).toHaveValue("gone@x.com");
    expect(screen.getByLabelText("Status")).toHaveValue("done");
    expect(screen.queryByRole("button", { name: /^Remind now/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
```

```tsx
// tests/admin/task-form.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/admin/tasks/actions", () => ({}));
const { TaskForm } = await import("@/app/admin/tasks/TaskForm");

const defaults = { title: "", notes: "", assignee: "joshua@x.com", dueOn: "", status: "todo" };

describe("TaskForm", () => {
  it("lists people by name with Unassigned first", () => {
    render(<TaskForm action={vi.fn(async () => ({}))} people={["joshua@x.com", "shade@x.com"]} defaults={defaults} submitLabel="Add task" idPrefix="new" />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Unassigned", "Joshua (joshua@x.com)", "Shade (shade@x.com)"]);
  });
  it("shows an error and keeps what was typed", async () => {
    const action = vi.fn(async () => ({ error: "Give the task a title", values: { ...defaults, notes: "keep me" } }));
    render(<TaskForm action={action} people={["joshua@x.com"]} defaults={defaults} submitLabel="Add task" idPrefix="new" />);
    // Fill the title so the browser's `required` check can't block the submit; the error comes from the action.
    await userEvent.type(screen.getByLabelText("Title"), "Flyers");
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give the task a title");
    expect(screen.getByLabelText("Notes")).toHaveValue("keep me");
  });
  it("shows a saved notice as status, not as an error", async () => {
    const action = vi.fn(async () => ({ ok: "Task added.", notice: "Saved, but the email to Shade didn't send." }));
    render(<TaskForm action={action} people={["joshua@x.com"]} defaults={defaults} submitLabel="Add task" idPrefix="new" />);
    await userEvent.type(screen.getByLabelText("Title"), "Flyers");
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Task added. Saved, but the email to Shade didn't send.");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
```

Run: `npx vitest run --maxWorkers=2 tests/admin/tasks-page.test.tsx tests/admin/task-form.test.tsx`
Expected: FAIL, unresolved `@/app/admin/tasks/page` and `TaskForm`.

- [ ] **Step 4: Write `app/admin/tasks/TaskForm.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTROL, Label } from "@/components/forms/Field";
import { displayName, TASK_NOTES_MAX, TASK_STATUSES, TASK_TITLE_MAX } from "@/lib/admin/task-rules";
import type { TaskFormState, TaskFormValues } from "./actions";

/** New task and edit task. `people` must include the current assignee, even one who lost access. */
export function TaskForm({ action, people, defaults, submitLabel, idPrefix, showStatus = false }: {
  action: (prev: TaskFormState, formData: FormData) => Promise<TaskFormState>;
  people: string[];
  defaults: TaskFormValues;
  submitLabel: string;
  idPrefix: string;
  showStatus?: boolean;
}) {
  const [state, formAction, saving] = useActionState<TaskFormState, FormData>(action, {});
  const values = state.values ?? defaults;
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <>
      <form
        // Remount so the fields show what the action returned: typed text on error, saved text on edit.
        key={JSON.stringify(state.values ?? null)}
        action={formAction}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("title")}>Title</Label>
          <input id={id("title")} name="title" required maxLength={TASK_TITLE_MAX} defaultValue={values.title} className={CONTROL} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("assignee")}>Assigned to</Label>
            <select id={id("assignee")} name="assignee" defaultValue={values.assignee} className={CONTROL}>
              <option value="">Unassigned</option>
              {people.map((email) => (
                <option key={email} value={email}>{`${displayName(email)} (${email})`}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("due")}>Due date</Label>
            <input id={id("due")} name="dueOn" type="date" defaultValue={values.dueOn} className={CONTROL} />
          </div>
        </div>
        {showStatus ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("status")}>Status</Label>
            <select id={id("status")} name="status" defaultValue={values.status} className={CONTROL}>
              {TASK_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("notes")}>Notes</Label>
          <textarea id={id("notes")} name="notes" rows={3} maxLength={TASK_NOTES_MAX} defaultValue={values.notes} className={CONTROL} />
        </div>
        <div>
          <Button type="submit" variant="solid" disabled={saving}>{submitLabel}</Button>
        </div>
      </form>
      {state.error ? (
        <p role="alert" className="text-sm text-overdue">{state.error}</p>
      ) : state.ok ? (
        <p role="status" className="text-sm text-ink-soft">{[state.ok, state.notice].filter(Boolean).join(" ")}</p>
      ) : null}
    </>
  );
}
```

Check `components/ui/Button.tsx` exports `Button` with `type`, `variant`, `disabled` (`GiveAccessForm` uses it this way). If its props differ, match `GiveAccessForm`.

- [ ] **Step 5: Write `app/admin/tasks/RemindButton.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { remindTaskAction, type RemindState } from "./actions";

export function RemindButton({ taskId, title }: { taskId: string; title: string }) {
  const [state, action, sending] = useActionState<RemindState, FormData>(remindTaskAction.bind(null, taskId), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <button
        type="submit"
        disabled={sending}
        aria-label={`Remind now: ${title}`}
        className="inline-flex min-h-11 items-center border border-charcoal px-3 text-sm text-charcoal hover:bg-charcoal hover:text-ivory disabled:opacity-60"
      >
        {sending ? "Sending…" : "Remind now"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-overdue">{state.error}</p>
      ) : state.ok ? (
        <p role="status" className="text-sm text-ink-soft">{state.ok}</p>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 6: Write `app/admin/tasks/TaskCard.tsx`**

```tsx
import Link from "next/link";
import { SubmitOnChange } from "@/app/admin/SubmitOnChange";
import { displayName, dueLine, dueState, TASK_STATUSES, type DueState, type Task } from "@/lib/admin/task-rules";
import { formatShortDate, formatWhen } from "@/lib/admin/time";
import { moveTaskAction } from "./actions";
import { RemindButton } from "./RemindButton";

// Stage colors are edges only (they fail contrast as text); the words carry the meaning.
const EDGE: Record<DueState, string> = {
  none: "border-l-rule", upcoming: "border-l-rule", today: "border-l-stage-new", overdue: "border-l-overdue",
};
const DUE_TEXT: Record<DueState, string> = {
  none: "text-ink-soft", upcoming: "text-ink-soft", today: "font-semibold", overdue: "font-semibold text-overdue",
};

/** `today` is the Las Vegas date. */
export function TaskCard({ task, today }: { task: Task; today: string }) {
  const open = task.status !== "done";
  const due = open ? dueState(task.dueOn, today) : "none";
  return (
    <article aria-labelledby={`task-${task.id}`} className={`flex flex-col gap-2 border border-l-4 border-rule bg-ivory p-3 text-sm ${EDGE[due]}`}>
      <Link id={`task-${task.id}`} href={`/admin/tasks/${task.id}`} className="font-semibold underline-offset-4 hover:underline">
        {task.title}
      </Link>
      <p className="text-ink-soft">{task.assigneeEmail ? displayName(task.assigneeEmail) : "Unassigned"}</p>
      {open && task.dueOn ? <p className={DUE_TEXT[due]}>{dueLine(task.dueOn, today)}</p> : null}
      {!open && task.completedAt ? <p className="text-ink-soft">Done {formatShortDate(task.completedAt)}</p> : null}
      <form action={moveTaskAction.bind(null, task.id)} className="flex items-center gap-2">
        <label htmlFor={`status-${task.id}`} className="sr-only">{`Status of ${task.title}`}</label>
        <SubmitOnChange id={`status-${task.id}`} name="status" defaultValue={task.status}>
          {TASK_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
        </SubmitOnChange>
        <noscript><button type="submit" className="min-h-11 px-3 underline">Move</button></noscript>
      </form>
      {open && task.assigneeEmail ? <RemindButton taskId={task.id} title={task.title} /> : null}
      {task.lastRemindedAt ? <p className="text-xs text-ink-soft">{`Reminded ${formatWhen(task.lastRemindedAt)}`}</p> : null}
    </article>
  );
}
```

Confirm the Tailwind tokens exist in `app/globals.css`: `--color-stage-new`, `--color-overdue` (both verified), `--color-rule` and `--color-ink-soft` (used across the admin). `border-l-*` color utilities follow from `--color-*` in Tailwind 4.

- [ ] **Step 7: Write `app/admin/tasks/page.tsx`**

```tsx
import Link from "next/link";
import { CARD } from "@/app/admin/jobs/[id]/ui";
import { requireAdmin } from "@/lib/admin/session";
import { assignableEmails, listTasks } from "@/lib/admin/tasks";
import { boardColumns, DONE_VISIBLE_DAYS, TASK_STATUSES, type TaskStatus } from "@/lib/admin/task-rules";
import { lasVegasDate } from "@/lib/admin/time";
import { createTaskAction } from "./actions";
import { TaskCard } from "./TaskCard";
import { TaskForm } from "./TaskForm";

const EMPTY: Record<TaskStatus, string> = {
  todo: "Nothing waiting.",
  doing: "Nothing in progress.",
  done: `Nothing finished in the last ${DONE_VISIBLE_DAYS} days.`,
};
const TOGGLE = "inline-flex min-h-11 items-center px-4 text-sm border border-charcoal";

/** Spec §4: the board. `?view=mine` keeps the filter in links and bookmarks. */
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const admin = await requireAdmin();
  const me = admin.email.toLowerCase();
  const [tasks, people, query] = await Promise.all([listTasks(), assignableEmails(), searchParams]);
  const mine = (Array.isArray(query.view) ? query.view[0] : query.view) === "mine";
  const now = new Date();
  const today = lasVegasDate(now);
  const columns = boardColumns(mine ? tasks.filter((task) => task.assigneeEmail === me) : tasks, now);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <nav aria-label="Whose tasks" className="flex">
          <Link href="/admin/tasks" aria-current={mine ? undefined : "page"} className={`${TOGGLE} ${mine ? "" : "bg-charcoal text-ivory"}`}>Everyone</Link>
          <Link href="/admin/tasks?view=mine" aria-current={mine ? "page" : undefined} className={`${TOGGLE} border-l-0 ${mine ? "bg-charcoal text-ivory" : ""}`}>Mine</Link>
        </nav>
      </div>
      <details className={CARD}>
        <summary className="cursor-pointer font-semibold">New task</summary>
        <TaskForm
          action={createTaskAction}
          people={people}
          defaults={{ title: "", notes: "", assignee: people.includes(me) ? me : "", dueOn: "", status: "todo" }}
          submitLabel="Add task"
          idPrefix="new-task"
        />
      </details>
      <div className="grid gap-6 md:grid-cols-3">
        {TASK_STATUSES.map((status) => (
          <section key={status.value} aria-labelledby={`column-${status.value}`} className="flex flex-col gap-3">
            <h2 id={`column-${status.value}`} className="text-lg font-semibold">
              {`${status.label} (${columns[status.value].length})`}
            </h2>
            {columns[status.value].length === 0 ? (
              <p className="text-sm text-ink-soft">{EMPTY[status.value]}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {columns[status.value].map((task) => <li key={task.id}><TaskCard task={task} today={today} /></li>)}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Write `app/admin/tasks/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { TEXT_LINK } from "@/app/admin/jobs/[id]/ui";
import { DeleteButton } from "@/app/admin/jobs/[id]/DeleteButton";
import { requireAdmin } from "@/lib/admin/session";
import { assignableEmails, getTask } from "@/lib/admin/tasks";
import { displayName } from "@/lib/admin/task-rules";
import { formatWhen } from "@/lib/admin/time";
import { deleteTaskAction, updateTaskAction } from "../actions";
import { RemindButton } from "../RemindButton";
import { TaskForm } from "../TaskForm";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [task, people] = await Promise.all([getTask(id), assignableEmails()]);
  if (!task) notFound();
  // A done task keeps the name of someone who has since lost access; the list must show it,
  // or the select would silently fall back to Unassigned and saving would erase it.
  const options = task.assigneeEmail && !people.includes(task.assigneeEmail) ? [...people, task.assigneeEmail] : people;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href="/admin/tasks" className={TEXT_LINK}>All tasks</Link>
      <h1 className="text-2xl font-semibold">{task.title}</h1>
      <p className="text-sm text-ink-soft">
        {`Created by ${displayName(task.createdBy)}, ${formatWhen(task.createdAt)}`}
        {task.lastRemindedAt && task.lastRemindedBy
          ? ` · Last reminded ${formatWhen(task.lastRemindedAt)} by ${displayName(task.lastRemindedBy)}`
          : ""}
      </p>
      {task.status !== "done" && task.assigneeEmail ? <RemindButton taskId={task.id} title={task.title} /> : null}
      <TaskForm
        action={updateTaskAction.bind(null, task.id)}
        people={options}
        defaults={{
          title: task.title, notes: task.notes ?? "", assignee: task.assigneeEmail ?? "",
          dueOn: task.dueOn ?? "", status: task.status,
        }}
        submitLabel="Save"
        idPrefix="edit-task"
        showStatus
      />
      <form action={deleteTaskAction.bind(null, task.id)}>
        <DeleteButton />
      </form>
    </div>
  );
}
```

- [ ] **Step 9: Run the UI tests, the whole admin suite, typecheck and lint**

Run: `npx vitest run --maxWorkers=2 tests/admin tests/db && npx tsc --noEmit && npx eslint app/admin/tasks lib/admin/task-rules.ts lib/admin/task-schema.ts lib/admin/tasks.ts lib/admin/task-emails.ts app/api/cron/tasks`
Expected: all PASS, and tsc and eslint exit 0. If "Reminded Thu, Oct 1, 9:42 AM" differs only in whitespace (some ICU versions use a narrow no-break space before AM), compare the way `tests/admin/follow-up-digest.test.ts` does. Don't loosen the assertion to a regex that would pass with a wrong time.

- [ ] **Step 10: Test power**

In `TaskCard`, change `overdue: "font-semibold text-overdue"` to `"font-semibold"`. The overdue test must FAIL. In the page, delete the `mine ? … :` filter. The Mine test must FAIL. In `[id]/page.tsx`, use `people` instead of `options`. "keeps a removed person's name" must FAIL. Restore all three.

- [ ] **Step 11: Commit**

```bash
git add app/admin/AdminNav.tsx app/admin/tasks tests/admin/admin-nav.test.tsx tests/admin/tasks-page.test.tsx tests/admin/task-form.test.tsx
git commit -m "feat: task board and task pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: End-to-end test

Precedent: `e2e/admin-access.spec.ts` (`signInAs`, serial mode, `afterAll` cleanup) and `playwright.config.ts`.

**Files:**
- Create: `e2e/tasks.spec.ts`
- Modify: `playwright.config.ts` (add `e2e-tasks-owner@example.com,e2e-tasks-mate@example.com` to the end of `ADMIN_EMAILS`, and add `|tasks` inside the mobile `testIgnore` group)

- [ ] **Step 1: Write the spec**

```ts
// e2e/tasks.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run task board tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-tasks-owner@example.com";
const MATE = "e2e-tasks-mate@example.com";
const TITLE = `E2E flyers ${Date.now()}`;

async function signInAs(page: Page, email: string) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${email}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Yesterday in Las Vegas, as the date input wants it. */
const yesterday = () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
};

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from tasks where created_by = ${OWNER}`;
  await sql()`delete from admin_login_tokens where email like 'e2e-tasks-%'`;
  await sql()`delete from admin_sessions where email like 'e2e-tasks-%'`;
});

test("create, assign, move, remind, filter and delete a task", async ({ page }) => {
  await signInAs(page, OWNER);
  await page.getByRole("link", { name: "Tasks" }).first().click();
  await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible();

  // Create, assigned to the mate, due yesterday. No RESEND_API_KEY in e2e: the honest notice shows.
  await page.getByText("New task").click();
  await page.getByLabel("Title").fill(TITLE);
  await page.getByLabel("Assigned to").selectOption(MATE);
  await page.getByLabel("Due date").fill(yesterday());
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("status")).toContainText("Task added. Saved, but the email to E2e Tasks Mate didn't send.");

  const card = page.getByRole("article").filter({ hasText: TITLE });
  await expect(page.getByRole("region", { name: /^To do/ }).getByRole("article").filter({ hasText: TITLE })).toBeVisible();
  await expect(card).toContainText("E2e Tasks Mate");
  await expect(card).toContainText("Overdue by 1 day");

  // Move to In progress with the status select.
  await card.getByLabel(`Status of ${TITLE}`).selectOption("doing");
  await expect(page.getByRole("region", { name: /^In progress/ }).getByRole("article").filter({ hasText: TITLE })).toBeVisible();

  // Remind now: the send fails in e2e, so the claim is given back and no "Reminded" line appears.
  await card.getByRole("button", { name: `Remind now: ${TITLE}` }).click();
  await expect(card.getByRole("alert")).toHaveText("The reminder didn't send. Try again.");
  await page.reload();
  await expect(card).not.toContainText("Reminded");

  // A reminder from a moment ago blocks another for 10 minutes.
  await sql()`update tasks set last_reminded_at = now(), last_reminded_by = ${OWNER} where title = ${TITLE}`;
  await page.reload();
  await expect(card).toContainText("Reminded");
  await card.getByRole("button", { name: `Remind now: ${TITLE}` }).click();
  await expect(card.getByRole("alert")).toContainText("Already reminded at");

  // Mine hides a task assigned to someone else; Everyone shows it again.
  await page.getByRole("link", { name: "Mine" }).click();
  await expect(page).toHaveURL(/view=mine/);
  await expect(card).toHaveCount(0);
  await page.getByRole("link", { name: "Everyone" }).click();
  await expect(card).toBeVisible();

  // Open it, delete with two taps, back on an empty board for it.
  await card.getByRole("link", { name: TITLE }).click();
  await expect(page.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Tap again to delete" }).click();
  await expect(page).toHaveURL(/\/admin\/tasks$/);
  await expect(page.getByRole("article").filter({ hasText: TITLE })).toHaveCount(0);
});
```

- [ ] **Step 2: Update `playwright.config.ts`** as listed under Files.

- [ ] **Step 3: Run it against the Task 4 branch**

Follow the `pss-local-verification-quirks` memory: production build, `next start` on 127.0.0.1, and the test branch only.

```bash
E2E_POSTGRES_URL="$(cat "$SCRATCH/branch-url")" E2E_TEST_ENDPOINT=<ep-id of the branch> \
  npx playwright test e2e/tasks.spec.ts e2e/admin-access.spec.ts --project=desktop
```

Expected: both specs pass. `admin-access.spec.ts` re-proves `removeAdmin` with the new CTE.

- [ ] **Step 4: Commit**

```bash
git add e2e/tasks.spec.ts playwright.config.ts
git commit -m "test: task board end to end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Ship (controller only; ask the owner before Step 3)

- [ ] **Step 1: Full verification in the worktree**

Run: `npx vitest run --maxWorkers=2 && npx tsc --noEmit && npx eslint && npx next build`
Expected: all green. Paste the summary lines into the ledger.

- [ ] **Step 2: Final review**

Use superpowers:requesting-code-review on `main..feat/task-board`, with the spec as the requirements. The reviewer must re-derive from the spec, not from this plan: the self-assign rule, the 10-minute lock, unassign on removal, and the 14-day Done window.

- [ ] **Step 3: Production migration (ask first)**

Follow the `pss-production-migrations` memory exactly. Confirm 032 is still unclaimed on every branch (`git ls-tree` on the `origin/feat/*` branches). It was proven twice on a branch in Task 4. Verify the target is `ep-cold-term` without printing the URL. Apply with `node scripts/migrate.mjs`, then confirm read-only with `select count(*) from tasks` and a check that the five constraint names exist in `pg_constraint`.

The migration must be live **before** the push, because `removeAdmin` now writes to `tasks`.

- [ ] **Step 4: Merge and push**

Use superpowers:finishing-a-development-branch. Push to `main` deploys production by itself, so don't also run `vercel --prod`. After the deploy, check that `/admin/tasks` loads, and in the Vercel dashboard confirm the `/api/cron/tasks` cron is listed.

- [ ] **Step 5: Hand-off note to the owner**

Shade must be added under Settings → Admin access to be assignable. The digest arrives at 7am PDT (6am after Nov 1). Names come from email addresses.
