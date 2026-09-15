# Stages, Automatic Booking and the Contact Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Remove the Contacted stage.
- Book a New lead automatically when a visit date is saved.
- Add a per-client contact log.
- Slim the job page's "•••" menu, and retire the Overview's Next action card.

**Architecture:**
- The stage list in `lib/admin/stages.ts` drives the board, the stepper and the forms, so removing `contacted` there does most of the work.
- Migration 011 moves any stray rows and narrows the database checks.
- `updateDetails` books in the same statement that saves the date.
- The contact log is a new `job_events.kind = 'contact'`. "Last contacted" is computed in `JOB_COLUMNS`.
- The header menu is rebuilt from existing pieces (FollowUpBox, StageControls) plus a new ContactLog form.

**Tech Stack:** Next.js 16 App Router (Server Actions, `useActionState`), Neon Postgres, zod 4, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-stages-contact-log-design.md`

## Global Constraints

**Stages**
- Stages in order: `new` "New lead", `visit_booked` "Appointment booked", `quoted` "Quoted", `sold` "Sold", `ordered` "Ordered", `installed` "Installed", plus `lost` "Lost".
- `contacted` is removed. `stageLabel("contacted")` still returns "Contacted" for old activity entries. `isStage("contacted")` is false.
- Every remaining stage keeps all four `STAGE_STYLE` fields (`icon`, `edge`, `tint`, `left`). `left` is used by the Schedule and the calendar.

**Automatic booking**
- Only when this save edited the visit date (`visitEdited`), the new date is not null, and the current status is `new`.
- Same statement as the save, and it logs a `stage` event `new → visit_booked`.
- Stale forms and Outlook-synced dates never book. Clearing a date never moves a job back.
- Call screen: "booked" moves to `visit_booked` from `new` only. "talked" and "no_answer" never move the stage.

**Contact log**
- Methods, in order: `called` Called, `texted` Texted, `voicemail` Voicemail, `email` Email.
- At least one method is required; the error reads "Pick how you reached them".
- The note is optional, at most 500 characters; the error reads "Keep the note under 500 characters".
- Body: `Contacted · <labels joined by ", ">` plus ` — <note>` when a note is given.
- The event is `kind = 'contact'`. Saving it never touches the stage or the call-back.

**Last contacted and overdue**
- Last contacted is the newest `job_events.created_at` where `kind = 'contact'`, or `kind = 'note'` and the body starts with `Call:`.
- It shows as "Last contacted Tue 9/15", in Las Vegas time, under the client's name.
- Overdue for `new`: more than 1 day in stage, and no `lastContactAt` at or after `stageChangedAt`.

**Menu**, top to bottom with dividers:
1. Mark contacted.
2. Call-back (the existing FollowUpBox).
3. A "Change stage…" disclosure holding the existing Set-stage list plus Mark lost.

There is no Next action section and no "Move to …" button. A "Call-back overdue" tag shows beside the stage badge when `followUpAt < now`. The Overview no longer renders NextActionCard.

**Migration** `db/migrations/011_stages_contact_log.sql`:
- idempotent;
- comments on whole lines only, and no `;` in comments;
- the job_events kind lists in 003, 004 and 011 must be identical: `('stage','note','edit','email','reward','measure','file','contact')`.

**Coordination**
- Migration 012 belongs to the Google sign-in work.
- Customer pages (`lib/portal/*`) are untouched.

**Verification**
- `npx vitest run --maxWorkers=2 <files>`, then the full suite once per task.
- `npx tsc --noEmit -p .`: ignore only "Cannot find name 'LayoutProps'" in app/layout.tsx, which comes from a build that hasn't run.
- `npx eslint <files>`.
- No `next build` except in Task 6.

## File map

| File | Change | Task |
|---|---|---|
| `lib/admin/stages.ts`, `app/admin/jobs/[id]/StageStepper.tsx`, `app/globals.css`, `lib/admin/next-action.ts`, `lib/admin/overdue.ts` (drop contacted), `lib/admin/call.ts` | stage list | 1 |
| `db/migrations/011_stages_contact_log.sql`, `003_measure_and_files.sql`, `004_referrals_reviews.sql`, `lib/admin/jobs.ts` (JobEvent kind) | data | 2 |
| `lib/admin/jobs.ts` (updateDetails) | auto-booking | 3 |
| `lib/admin/contact.ts` (new), `lib/admin/schema.ts`, `lib/admin/jobs.ts` (addContact, lastContactAt), `app/admin/jobs/contact-actions.ts` (new), `lib/admin/overdue.ts`, `lib/admin/time.ts` | contact log backend | 4 |
| `app/admin/jobs/[id]/ContactLog.tsx` (new), `JobHeader.tsx`, `OverviewTab.tsx`, delete `NextActionCard.tsx`, e2e updates | page | 5 |
| `e2e/stages.spec.ts` (new), `playwright.config.ts` | e2e | 6 |

---

### Task 1: The stage list without Contacted

**Files:**
- Modify:
  - `lib/admin/stages.ts`
  - `app/admin/jobs/[id]/StageStepper.tsx`
  - `app/globals.css` (the line `--color-stage-contacted: #6F8F72;`)
  - `lib/admin/overdue.ts` (the `OVERDUE_DAYS` entry only)
  - `lib/admin/next-action.ts` (the `contacted` case)
  - `lib/admin/call.ts` (`callStageMove`)
- Test, update these:
  - `tests/admin/stages.test.ts`, `tests/admin/stage-stepper.test.tsx`, `tests/admin/overdue.test.ts`, `tests/admin/next-action.test.ts`, `tests/admin/call.test.ts`, `tests/admin/calls.test.ts`;
  - `tests/admin/job-header.test.tsx`, `tests/admin/job-page-layout.test.tsx` and `tests/admin/overview-money-next.test.tsx` (fixture `status: "contacted"` becomes `"new"`);
  - `tests/admin/invite-actions.test.ts` and `tests/portal/progress.test.ts` (drop `"contacted"` from their stage lists);
  - `tests/admin/event-list.test.tsx` (keeps its legacy `toStatus: "contacted"` on purpose).

**Interfaces:**
- Produces:
  - `STAGES` has 6 entries.
  - `Stage = "new" | "visit_booked" | "quoted" | "sold" | "ordered" | "installed" | "lost"`.
  - `stageLabel(stage: string): string`, which accepts legacy values.
  - `callStageMove("talked")` returns `null`; `callStageMove("booked")` returns `{ to: "visit_booked", from: ["new"] }`.

- [ ] **Step 1: Update the tests**

`tests/admin/stages.test.ts`:
- The first test's expected list becomes `["new", "visit_booked", "quoted", "sold", "ordered", "installed"]`.
- The `nextStage("new")` expectation becomes `"visit_booked"`.
- In the label test, `stageLabel("visit_booked")` expects `"Appointment booked"`.
- Add:
  ```ts
  it("still names the retired Contacted stage for old activity", () => {
    expect(stageLabel("contacted")).toBe("Contacted");
    expect(isStage("contacted")).toBe(false);
  });
  ```
- The "lists the seven working stages" test is renamed "lists the six working stages". Its body is unchanged.
- In "gives every stage an icon…", add `expect(style.left).toMatch(/^border-l-/);` inside the loop.

`tests/admin/stage-stepper.test.tsx`:
- The first test renders `status="visit_booked"`, expects `["done", "current", "upcoming", "upcoming", "upcoming", "upcoming"]`, and expects the current step text "Appointment booked". Its title becomes "shows all six stages with done, current and upcoming".
- The installed test expects `["done", "done", "done", "done", "done", "current"]`.

`tests/admin/overdue.test.ts`: remove `["contacted", 3]` from the `it.each` list. Task 4 changes `new`; leave `["new", 1]` for now.

`tests/admin/next-action.test.ts`: delete the "books the visit once contacted" test.

`tests/admin/call.test.ts`: the `callStageMove` tests become:
```ts
  it("books a visit only from new", () => {
    expect(callStageMove("booked")).toEqual({ to: "visit_booked", from: ["new"] });
  });
  it("never moves on talked or no answer", () => {
    expect(callStageMove("talked")).toBeNull();
    expect(callStageMove("no_answer")).toBeNull();
  });
```
Delete the old "marks contacted only from new" and "never moves on no answer" tests.

`tests/admin/calls.test.ts`:
- In the first test's `params`, replace `["new", "contacted"]` with `["new"]`.
- The "moves talked calls only from new" test becomes:
  ```ts
  it("never moves a talked call", async () => {
    await logCall(JOB, { ...input, outcome: "talked", visitAt: null, notes: null }, "o@example.com");
    const params = query.mock.calls[0][1];
    expect(params.slice(6, 9)).toEqual([null, null, []]);
    expect(params[10]).toBe("Call: talked, no visit yet · Shutters · Motorized · 8 windows · Mid-range");
  });
  ```

In the job-header, job-page-layout and overview-money-next fixtures, change `status: "contacted"` to `status: "new"`. In job-header.test.tsx, change the stepper expectation `toHaveTextContent("Contacted")` to `toHaveTextContent("New lead")`. Leave the overview-money-next NextActionCard expectations alone; Task 5 deletes that describe. If one fails now because of the status change, delete that one `it` now and say so in the report.

`tests/admin/invite-actions.test.ts`: the `it.each` list becomes `["new", "visit_booked", "lost"]`.

`tests/portal/progress.test.ts`: remove `"contacted"` from its stage list.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/stages.test.ts tests/admin/stage-stepper.test.tsx tests/admin/call.test.ts tests/admin/calls.test.ts`
Expected: FAIL. The seven-stage list, the old label and the old call moves are still in place.

- [ ] **Step 3: Implement**

`lib/admin/stages.ts`:
```ts
export const STAGES = [
  { value: "new", label: "New lead" },
  { value: "visit_booked", label: "Appointment booked" },
  { value: "quoted", label: "Quoted" },
  { value: "sold", label: "Sold" },
  { value: "ordered", label: "Ordered" },
  { value: "installed", label: "Installed" },
] as const;
```
- Update the doc comment above it: "The database enforces the same list with a check constraint (011_stages_contact_log.sql); keep the two in step."
- Replace `stageLabel` with:
  ```ts
  /** Stages retired from the tracker that old activity entries still mention. */
  const RETIRED_LABELS: Record<string, string> = { contacted: "Contacted" };

  export const stageLabel = (stage: string): string =>
    stage === "lost" ? "Lost" : STAGES.find((s) => s.value === stage)?.label ?? RETIRED_LABELS[stage] ?? stage;
  ```
- `WORKING_STAGES` becomes `["new", "visit_booked", "quoted", "sold", "ordered", "installed"] as const`.
- Delete the `contacted:` line from `STAGE_STYLE`.

`app/admin/jobs/[id]/StageStepper.tsx`: delete the `contacted: "bg-stage-contacted",` line from `FILL`.

`app/globals.css`: delete the `--color-stage-contacted: #6F8F72;` line. Then grep `stage-contacted` across `app` and `components` and confirm there are no hits.

`lib/admin/overdue.ts`: delete the `contacted: 3,` line.

`lib/admin/next-action.ts`: delete the `case "contacted":` line and its return.

`lib/admin/call.ts`:
```ts
/** Where a call's outcome may move the job, and only from which stages. Only a booked visit moves it. */
export function callStageMove(outcome: CallOutcome): { to: "visit_booked"; from: Stage[] } | null {
  if (outcome === "booked") return { to: "visit_booked", from: ["new"] };
  return null;
}
```

`lib/admin/calls.ts` needs no change. Its SQL already treats a null move as no move; the test pins the params.

Anything the TypeScript compiler reports as a type error in `app/` or `lib/`, such as a record keyed by `Stage` still listing `contacted`, gets the `contacted` entry deleted. Run `npx tsc --noEmit -p .` to find them.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/admin tests/portal`, then `npx tsc --noEmit -p .`, then `npx eslint lib/admin "app/admin/jobs/[id]/StageStepper.tsx"`.
Expected: PASS and clean. The overview-money-next NextActionCard tests pass or were deleted as described in Step 1.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/stages.ts "app/admin/jobs/[id]/StageStepper.tsx" app/globals.css lib/admin/overdue.ts lib/admin/next-action.ts lib/admin/call.ts tests/admin tests/portal
git commit -m "feat: drop the Contacted stage and rename Visit booked to Appointment booked"
```

---

### Task 2: Migration 011 and the contact event kind

**Files:**
- Create: `db/migrations/011_stages_contact_log.sql`
- Modify:
  - `db/migrations/003_measure_and_files.sql` (lines 35–39, the kind list)
  - `db/migrations/004_referrals_reviews.sql` (lines 14–19, the kind list)
  - `lib/admin/jobs.ts` (the `JobEvent.kind` union)
- Test: `tests/db/migration-011.test.ts`

**Interfaces:**
- Produces: `JobEvent["kind"]` includes `"contact"`.

- [ ] **Step 1: Write the failing test**

`tests/db/migration-011.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const statements = (file: string) => readFileSync(`db/migrations/${file}`, "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);

const KINDS = "kind in ('stage','note','edit','email','reward','measure','file','contact')";
const kindList = (file: string) =>
  statements(file).find((s) => s.includes("job_events_kind_check check"))?.replace(/\s+/g, " ");

describe("migration 011", () => {
  const all = statements("011_stages_contact_log.sql");

  it("moves any Contacted job back to New before narrowing the stage check", () => {
    const move = all.findIndex((s) => /update leads set status = 'new' where status = 'contacted'/.test(s));
    const check = all.findIndex((s) => s.includes("add constraint leads_status_check"));
    expect(move).toBeGreaterThanOrEqual(0);
    expect(check).toBeGreaterThan(move);
    expect(all[check]).toContain("status in ('new','visit_booked','quoted','sold','ordered','installed','lost')");
    expect(all[check]).not.toContain("contacted");
  });

  it("is re-runnable", () => {
    for (const s of all) expect(s).toMatch(/^(update leads set|alter table (leads|job_events) (drop constraint if exists|add constraint))/);
  });

  it("allows the contact kind, identically in 003, 004 and 011", () => {
    for (const file of ["003_measure_and_files.sql", "004_referrals_reviews.sql", "011_stages_contact_log.sql"]) {
      expect(kindList(file)).toContain(KINDS);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --maxWorkers=2 tests/db/migration-011.test.ts`
Expected: FAIL, because the file doesn't exist.

- [ ] **Step 3: Implement**

`db/migrations/011_stages_contact_log.sql`:
```sql
-- Stages without Contacted, and the contact log's event kind.
-- Every statement is safe to re-run. Any Contacted job returns to New and keeps its day count.
-- The job_events kind list must stay identical to the ones in 003_measure_and_files.sql and 004_referrals_reviews.sql.

update leads set status = 'new' where status = 'contacted';

alter table leads drop constraint if exists leads_status_check;

alter table leads add constraint leads_status_check check (
  status in ('new','visit_booked','quoted','sold','ordered','installed','lost')
);

alter table job_events drop constraint if exists job_events_kind_check;

alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact')
);
```

In `003_measure_and_files.sql` and `004_referrals_reviews.sql`, change the kind list line `kind in ('stage','note','edit','email','reward','measure','file')` to `kind in ('stage','note','edit','email','reward','measure','file','contact')`. Add a comment line above each: `-- Must match 011_stages_contact_log.sql, which added 'contact'.`

`lib/admin/jobs.ts`: in `JobEvent`, change `kind` to `"stage" | "note" | "edit" | "email" | "reward" | "measure" | "file" | "contact"`. Also change `fromStatus`/`toStatus` to `string | null`, because old events may hold `"contacted"`. In `getEvents`, cast them with `as string | null`. Run `npx tsc --noEmit -p .`. EventList already passes them to `stageLabel(stage: string)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/db tests/admin/event-list.test.tsx`, then `npx tsc --noEmit -p .`
Expected: PASS and clean.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/011_stages_contact_log.sql db/migrations/003_measure_and_files.sql db/migrations/004_referrals_reviews.sql lib/admin/jobs.ts tests/db/migration-011.test.ts
git commit -m "feat: migration 011 narrows stages and adds the contact event kind"
```

---

### Task 3: Book the appointment automatically

**Files:**
- Modify: `lib/admin/jobs.ts` (`updateDetails`)
- Test: `tests/admin/jobs.test.ts` (append)

**Interfaces:**
- Consumes: the existing `visitEdited`.
- Produces: the same return shape `{ visitChanged, installChanged } | null`.

- [ ] **Step 1: Write the failing tests**

Append to the top-level describe in `tests/admin/jobs.test.ts`. It already has `ID`, `sql` and `text()` helpers, and a DetailsInput shape; copy the field list from the existing "updateDetails saves the questionnaire fields" test.
```ts
  describe("updateDetails books the appointment", () => {
    const blank = { quoteCents: null, soldCents: null, depositCents: null, brands: [], orderedOn: null, installOn: null,
      budgetTier: null, windowCountExact: null, treatmentTypes: [], motorized: false, gateCode: null };
    const visitAt = new Date("2026-09-20T17:00:00Z"); // 10:00 AM in Las Vegas
    const flag = (call: unknown[]) => call.slice(1).filter((v) => typeof v === "boolean").at(-1);

    it("moves a New job to Appointment booked in the same statement when the visit date was edited", async () => {
      sql.mockResolvedValue([{ visit_changed: true, install_changed: false }]);
      await jobs.updateDetails(ID, { ...blank, visitAt, visitAtLoaded: "" }, "owner@example.com");
      const statement = text(sql.mock.calls[0]).replace(/\s+/g, " ");
      expect(statement).toContain("status = case when ?::boolean and status = 'new' then 'visit_booked' else status end");
      expect(statement).toContain("stage_changed_at = case when ?::boolean and status = 'new' then now() else stage_changed_at end");
      expect(statement).toMatch(/insert into job_events \(lead_id, actor, kind, from_status, to_status\) select changed\.id, \?, 'stage', 'new', 'visit_booked' from prev, changed where prev\.status = 'new' and changed\.status = 'visit_booked'/);
      expect(flag(sql.mock.calls[0])).toBe(true);
    });

    it("never books from an untouched visit date, a cleared date or an older form", async () => {
      sql.mockResolvedValue([{ visit_changed: false, install_changed: false }]);
      await jobs.updateDetails(ID, { ...blank, visitAt, visitAtLoaded: "2026-09-20T10:00" }, "owner@example.com");
      expect(flag(sql.mock.calls[0])).toBe(false);
      await jobs.updateDetails(ID, { ...blank, visitAt: null, visitAtLoaded: "2026-09-20T10:00" }, "owner@example.com");
      expect(flag(sql.mock.calls[1])).toBe(false);
    });
  });
```
In the existing `dateFlags` helper of the "updateDetails with the dates the form was loaded with" block, nothing changes. It takes the first two booleans; the new flag is the last boolean.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/jobs.test.ts`
Expected: FAIL, because there is no status assignment in the statement.

- [ ] **Step 3: Implement**

In `updateDetails`, after `installEdited`, add:
```ts
  // Only a visit date this save actually set books the appointment; a stale form or an Outlook sync never does.
  const book = visitEdited && input.visitAt !== null;
```
Then change the statement as follows:
- `prev` selects `status` too: `with prev as (select status, visit_at, install_on from leads where id = ${id}),`
- In `changed`, after `gate_code = ${input.gateCode},` and before `updated_at = now()`, add these two lines. They must come after every existing assignment, so that `book` is the last boolean parameter:
  ```ts
        status = case when ${book}::boolean and status = 'new' then 'visit_booked' else status end,
        stage_changed_at = case when ${book}::boolean and status = 'new' then now() else stage_changed_at end,
  ```
- `changed` returns `returning id, status`.
- Add a CTE after `logged`:
  ```ts
    booked as (
      insert into job_events (lead_id, actor, kind, from_status, to_status)
      select changed.id, ${actor}, 'stage', 'new', 'visit_booked' from prev, changed
      where prev.status = 'new' and changed.status = 'visit_booked'
    )
  ```
- Update the doc comment by adding: "A New job whose visit date this save set moves to Appointment booked, with its stage entry, in the same statement."

Keep the final `select … from prev, changed` exactly as it is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/admin/jobs.test.ts tests/admin/actions.test.ts`
Expected: PASS, including every existing updateDetails test.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/jobs.ts tests/admin/jobs.test.ts
git commit -m "feat: saving a visit date books a New lead's appointment"
```

---

### Task 4: The contact log backend

**Files:**
- Create:
  - `lib/admin/contact.ts`
  - `app/admin/jobs/contact-actions.ts`
  - Tests: `tests/admin/contact.test.ts`, `tests/admin/contact-actions.test.ts`
- Modify:
  - `lib/admin/schema.ts` (add `contactSchema`)
  - `lib/admin/jobs.ts` (`addContact`, `lastContactAt` in `Job`, `JOB_COLUMNS` and `toJob`)
  - `lib/admin/overdue.ts` (the rule for new)
  - `lib/admin/time.ts` (`formatShortDay`)
  - Tests: `tests/admin/overdue.test.ts`, `tests/admin/jobs.test.ts`

**Interfaces:**
- Produces:
  - `CONTACT_METHODS: readonly { key: ContactMethod; label: string }[]`
  - `ContactMethod = "called" | "texted" | "voicemail" | "email"`
  - `contactBody(methods: readonly ContactMethod[], note: string | null): string`
  - `contactSchema` (FormData-shaped input `{ methods: string[]; note: string }` → `{ methods: ContactMethod[]; note: string | null }`)
  - `addContact(id: string, body: string, actor: string): Promise<boolean>`
  - `Job.lastContactAt?: Date | null`
  - `logContactAction(jobId: string, prev: FormState, formData: FormData): Promise<FormState>`
  - `formatShortDay(date: Date): string` ("Tue 9/15")
  - `isOverdue(job: Pick<Job, "status" | "stageChangedAt" | "visitAt" | "lastContactAt">, now)`

- [ ] **Step 1: Write the failing tests**

`tests/admin/contact.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { CONTACT_METHODS, contactBody } from "@/lib/admin/contact";
import { contactSchema } from "@/lib/admin/schema";
import { formatShortDay } from "@/lib/admin/time";

describe("contact log", () => {
  it("offers the four ways, in order", () => {
    expect(CONTACT_METHODS.map((m) => m.label)).toEqual(["Called", "Texted", "Voicemail", "Email"]);
  });
  it("writes one line, methods in list order, note after a dash", () => {
    expect(contactBody(["texted", "called"], "left details on price")).toBe("Contacted · Called, Texted — left details on price");
    expect(contactBody(["voicemail"], null)).toBe("Contacted · Voicemail");
  });
  it("needs at least one method and keeps notes short", () => {
    expect(contactSchema.safeParse({ methods: [], note: "" }).error!.issues[0].message).toBe("Pick how you reached them");
    expect(contactSchema.safeParse({ methods: ["fax"], note: "" }).success).toBe(false);
    expect(contactSchema.safeParse({ methods: ["called"], note: "x".repeat(501) }).error!.issues[0].message).toBe("Keep the note under 500 characters");
    expect(contactSchema.parse({ methods: ["email", "called", "email"], note: "  " })).toEqual({ methods: ["email", "called"], note: null });
  });
  it("formats the last-contacted day in Las Vegas time", () => {
    expect(formatShortDay(new Date("2026-09-16T05:00:00Z"))).toBe("Tue 9/15");
  });
});
```

`tests/admin/contact-actions.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const addContact = vi.fn();
vi.mock("@/lib/admin/jobs", () => ({ addContact }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { logContactAction } = await import("@/app/admin/jobs/contact-actions");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const form = (entries: [string, string][]) => { const d = new FormData(); for (const [k, v] of entries) d.append(k, v); return d; };

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  addContact.mockReset().mockResolvedValue(true);
});

describe("logContactAction", () => {
  it("checks the session before reading input", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(logContactAction(JOB, {}, form([["methods", "called"]]))).rejects.toThrow("NEXT_REDIRECT");
    expect(addContact).not.toHaveBeenCalled();
  });
  it("saves the contact line as the owner", async () => {
    expect(await logContactAction(JOB, {}, form([["methods", "called"], ["methods", "texted"], ["note", "left details"]])))
      .toEqual({ ok: true });
    expect(addContact).toHaveBeenCalledWith(JOB, "Contacted · Called, Texted — left details", "owner@example.com");
  });
  it("keeps what was typed when no method is picked", async () => {
    const state = await logContactAction(JOB, {}, form([["note", "hello"]]));
    expect(state).toEqual({ error: "Pick how you reached them", values: { note: "hello" } });
    expect(addContact).not.toHaveBeenCalled();
  });
  it("reports a job that no longer exists", async () => {
    addContact.mockResolvedValue(false);
    expect(await logContactAction(JOB, {}, form([["methods", "email"]]))).toEqual({ error: "That job no longer exists." });
  });
});
```

Append to `tests/admin/jobs.test.ts`:
```ts
  it("addContact logs a contact event against an existing job only", async () => {
    sql.mockResolvedValue([{ id: "e1" }]);
    expect(await jobs.addContact(ID, "Contacted · Called", "owner@example.com")).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("'contact'");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([ID, "owner@example.com", "Contacted · Called"]));
    expect(await jobs.addContact("../etc", "x", "o")).toBe(false);
  });

  it("computes last contacted from contact events and call logs", () => {
    expect(jobs.JOB_COLUMNS).toMatch(/\(select max\(e\.created_at\) from job_events e where e\.lead_id = leads\.id and \(e\.kind = 'contact' or \(e\.kind = 'note' and e\.body like 'Call:%'\)\)\) as last_contact_at/);
    expect(jobs.toJob({ ...row, last_contact_at: "2026-09-15T17:00:00Z" }).lastContactAt).toEqual(new Date("2026-09-15T17:00:00Z"));
    expect(jobs.toJob({ ...row }).lastContactAt).toBeNull();
  });
```

`tests/admin/overdue.test.ts`:
- Remove `["new", 1]` from the `it.each` list.
- Change the `job` helper to accept `lastContactAt`: `(status, days, visitAt = null, lastContactAt: Date | null = null) => ({ status, stageChangedAt: since(days), visitAt, lastContactAt })`.
- Add:
  ```ts
  it("a new lead is overdue after a day only when nothing was logged since it came in", () => {
    expect(OVERDUE_DAYS.new).toBe(1);
    expect(isOverdue(job("new", 1), NOW)).toBe(false);
    expect(isOverdue(job("new", 2), NOW)).toBe(true);
    expect(isOverdue(job("new", 2, null, since(1)), NOW)).toBe(false);
    expect(isOverdue(job("new", 2, null, since(3)), NOW)).toBe(true); // contact before it entered New does not count
  });
  ```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/contact.test.ts tests/admin/contact-actions.test.ts tests/admin/overdue.test.ts tests/admin/jobs.test.ts`
Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Implement**

`lib/admin/contact.ts`:
```ts
/** How the owners reached a client. Logged on the job page; never a stage. */
export const CONTACT_METHODS = [
  { key: "called", label: "Called" },
  { key: "texted", label: "Texted" },
  { key: "voicemail", label: "Voicemail" },
  { key: "email", label: "Email" },
] as const;

export type ContactMethod = (typeof CONTACT_METHODS)[number]["key"];
export const CONTACT_METHOD_KEYS = CONTACT_METHODS.map((m) => m.key) as [ContactMethod, ...ContactMethod[]];
export const CONTACT_NOTE_MAX = 500;

/** "Contacted · Called, Texted — note". Methods in list order. */
export function contactBody(methods: readonly ContactMethod[], note: string | null): string {
  const labels = CONTACT_METHODS.filter((m) => methods.includes(m.key)).map((m) => m.label).join(", ");
  return `Contacted · ${labels}${note ? ` — ${note}` : ""}`;
}
```

`lib/admin/schema.ts`: add `import { CONTACT_METHOD_KEYS, CONTACT_NOTE_MAX, type ContactMethod } from "./contact";` and:
```ts
export const contactSchema = z.object({
  methods: z
    .array(z.enum(CONTACT_METHOD_KEYS, { error: "Pick how you reached them" }))
    .min(1, "Pick how you reached them")
    .transform((keys): ContactMethod[] => [...new Set(keys)]),
  note: z
    .preprocess(blank, z.string().trim().max(CONTACT_NOTE_MAX, "Keep the note under 500 characters").optional())
    .transform((value) => value ?? null),
});
```

`lib/admin/time.ts`:
```ts
/** "Tue 9/15" in Las Vegas time, for the last-contacted line. */
export function formatShortDay(date: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", month: "numeric", day: "numeric" })
      .formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${p.weekday} ${p.month}/${p.day}`;
}
```

`lib/admin/jobs.ts`:
- `Job` gains:
  ```ts
  /** Newest contact entry or logged call. Optional so older fixtures still type-check. */
  lastContactAt?: Date | null;
  ```
- `JOB_COLUMNS` ends with `…, gate_code, finish,` followed by a new line:
  ```
    (select max(e.created_at) from job_events e where e.lead_id = leads.id and (e.kind = 'contact' or (e.kind = 'note' and e.body like 'Call:%'))) as last_contact_at`;
  ```
  Every caller selects from or updates `leads` unaliased; `lib/portal/invite.ts` uses it in `returning`, which Postgres allows.
- `toJob` gains `lastContactAt: row.last_contact_at ? new Date(row.last_contact_at as string) : null,`.
- Add, next to `addNote`:
  ```ts
  export async function addContact(id: string, body: string, actor: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await db()`
      insert into job_events (lead_id, actor, kind, body)
      select id, ${actor}, 'contact', ${body} from leads where id = ${id}
      returning id`;
    return rows.length > 0;
  }
  ```

`lib/admin/overdue.ts`:
```ts
/** A booked visit is judged by its date, a new lead by whether anyone has reached out since it came in. */
export function isOverdue(job: Pick<Job, "status" | "stageChangedAt" | "visitAt" | "lastContactAt">, now: Date): boolean {
  if (job.status === "visit_booked") {
    return job.visitAt !== null && lasVegasDate(now) > lasVegasDate(job.visitAt);
  }
  const limit = OVERDUE_DAYS[job.status];
  if (limit === undefined || daysInStage(job.stageChangedAt, now) <= limit) return false;
  if (job.status === "new" && job.lastContactAt && job.lastContactAt >= job.stageChangedAt) return false;
  return true;
}
```

`app/admin/jobs/contact-actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { contactBody } from "@/lib/admin/contact";
import { addContact } from "@/lib/admin/jobs";
import { contactSchema } from "@/lib/admin/schema";
import { requireAdmin } from "@/lib/admin/session";
import type { FormState } from "./actions";

// Calls requireAdmin() before reading its input. Never touches the stage or the call-back.
export async function logContactAction(jobId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const methods = formData.getAll("methods").map(String);
  const note = String(formData.get("note") ?? "");
  const parsed = contactSchema.safeParse({ methods, note });
  if (!parsed.success) {
    const values: Record<string, string | string[]> = {};
    if (methods.length) values.methods = methods.length > 1 ? methods : methods[0];
    if (note) values.note = note;
    return { error: parsed.error.issues[0].message, values };
  }
  const saved = await addContact(jobId, contactBody(parsed.data.methods, parsed.data.note), email);
  if (!saved) return { error: "That job no longer exists." };
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  return { ok: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 2 command plus `tests/admin/board.test.tsx tests/admin/board-page.test.tsx`, then `npx tsc --noEmit -p .`, then `npx eslint lib/admin app/admin/jobs/contact-actions.ts`.
Expected: PASS and clean.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/contact.ts lib/admin/schema.ts lib/admin/jobs.ts lib/admin/overdue.ts lib/admin/time.ts app/admin/jobs/contact-actions.ts tests/admin/contact.test.ts tests/admin/contact-actions.test.ts tests/admin/overdue.test.ts tests/admin/jobs.test.ts
git commit -m "feat: contact log entries, last contacted and the new-lead overdue rule"
```

---

### Task 5: The job page — menu, last contacted, no Next action card

**Files:**
- Create:
  - `app/admin/jobs/[id]/ContactLog.tsx`
  - Test: `tests/admin/contact-log.test.tsx`
- Modify:
  - `app/admin/jobs/[id]/JobHeader.tsx`
  - `app/admin/jobs/[id]/OverviewTab.tsx` (remove NextActionCard)
  - `lib/admin/next-action.ts` (delete `nextAction` and its types, keep `editDetailsHref`)
  - Tests: `tests/admin/job-header.test.tsx`, `tests/admin/next-action.test.ts`, `tests/admin/overview-money-next.test.tsx`, `tests/admin/overview-tab.test.tsx`
  - `e2e/admin.spec.ts`, `e2e/follow-ups.spec.ts`, `e2e/call.spec.ts`
- Delete: `app/admin/jobs/[id]/NextActionCard.tsx`

**Interfaces:**
- Consumes: `logContactAction`, `CONTACT_METHODS`, `CONTACT_NOTE_MAX`, `formatShortDay`, `Job.lastContactAt`, `FollowUpBox`, `StageControls` with `parts={["set", "lost"]}`.

- [ ] **Step 1: Write and update the tests**

`tests/admin/contact-log.test.tsx`:
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/admin/jobs/contact-actions", () => ({ logContactAction: vi.fn(async () => ({ ok: true })) }));
const { ContactLog } = await import("@/app/admin/jobs/[id]/ContactLog");

describe("ContactLog", () => {
  it("opens the ways and a note once Mark contacted is ticked", () => {
    render(<ContactLog jobId="3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c" />);
    expect(screen.queryByLabelText("Called")).toBeNull();
    fireEvent.click(screen.getByLabelText("Mark contacted"));
    for (const label of ["Called", "Texted", "Voicemail", "Email"]) expect(screen.getByLabelText(label)).not.toBeChecked();
    expect(screen.getByLabelText("Note (optional)")).toHaveAttribute("maxLength", "500");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
```

`tests/admin/job-header.test.tsx`:
- Add these mocks at the top, beside the existing actions mock:
  ```ts
  vi.mock("@/app/admin/jobs/contact-actions", () => ({ logContactAction: vi.fn(async () => ({})) }));
  vi.mock("@/app/admin/jobs/follow-up-actions", () => ({ saveFollowUp: vi.fn(async () => ({})), clearFollowUpAction: vi.fn(async () => {}) }));
  ```
- Replace the "keeps set stage and mark lost in the More menu" test with:
  ```tsx
  it("puts mark contacted, the call-back and change stage in the More menu, with no Move button", () => {
    render(<JobHeader job={job} now={now} />);
    const menu = within(screen.getByLabelText("More actions").closest("details")!);
    expect(menu.getByLabelText("Mark contacted")).toBeInTheDocument();
    expect(menu.getByText("No call-back set")).toBeInTheDocument();
    expect(menu.getByText("Change stage…")).toBeInTheDocument();
    expect(menu.getByLabelText("Set stage")).toBeInTheDocument();
    expect(menu.getByLabelText(/mark lost/i)).toBeInTheDocument();
    expect(menu.queryByRole("button", { name: /^Move to/ })).toBeNull();
    expect(menu.queryByText(/^Next/)).toBeNull();
  });

  it("shows when the client was last contacted", () => {
    render(<JobHeader job={{ ...job, lastContactAt: new Date("2026-09-16T05:00:00Z") }} now={now} />);
    expect(screen.getByText("Last contacted Tue 9/15")).toBeInTheDocument();
    render(<JobHeader job={{ ...job, lastContactAt: null }} now={now} />);
    expect(screen.getAllByText(/Last contacted/)).toHaveLength(1);
  });

  it("flags an overdue call-back beside the stage", () => {
    render(<JobHeader job={{ ...job, followUpAt: new Date("2026-09-13T17:00:00Z") }} now={now} />);
    expect(screen.getByText("Call-back overdue")).toBeInTheDocument();
  });
  ```
- The "keeps the More-actions panel within the header row below sm" test stays. Its `details.querySelector("div")` must still be the panel, so keep the panel as the `<details>`'s first `div`.

`tests/admin/next-action.test.ts`: keep only the `editDetailsHref` describe. Delete the `nextAction` describe and remove `nextAction` from the import.

`tests/admin/overview-money-next.test.tsx`: delete the `NextActionCard` describe, its import, and the follow-up-actions mock if nothing else uses it. Keep the MoneyStrip tests.

`tests/admin/overview-tab.test.tsx`:
- Remove the line `expect(screen.getByText("Schedule the install")).toBeInTheDocument();`.
- Add to that first test: `expect(screen.queryByRole("region", { name: "Next action" })).toBeNull();`.

E2E text updates (they run in Task 6):
- `e2e/admin.spec.ts` "an owner adds a job, advances it, and leaves a note", replacing lines 73–74 and 80–83:
  ```ts
  await page.getByLabel("More actions").click();
  await page.getByText("Change stage…").click();
  await page.getByLabel("Set stage").selectOption("visit_booked");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Appointment booked");
  ```
  and
  ```ts
  await expect(page.getByText("New lead → Appointment booked")).toBeVisible();

  await page.getByRole("link", { name: "← All jobs" }).click();
  await expect(page.getByRole("region", { name: /appointment booked/i }).getByRole("link", { name: new RegExp(NAME) })).toBeVisible();
  ```
- `e2e/follow-ups.spec.ts`, second test: before `getByRole("button", { name: "Set call-back" })` and before `getByRole("button", { name: "Done" })`, add `await page.getByLabel("More actions").click();`. The text assertions stay as they are: `Next call-back: …` and `No call-back set` are inside the opened menu.
- `e2e/call.spec.ts`: replace `toContainText("Visit booked")` with `toContainText("Appointment booked")`.
- Grep `e2e/` for `Visit booked`, `Contacted` and `Next action`, and update any other hits the same way.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/contact-log.test.tsx tests/admin/job-header.test.tsx tests/admin/overview-tab.test.tsx`
Expected: FAIL. ContactLog is missing, and the menu is the old one.

- [ ] **Step 3: Implement**

`app/admin/jobs/[id]/ContactLog.tsx`:
```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CONTACT_METHODS, CONTACT_NOTE_MAX } from "@/lib/admin/contact";
import { logContactAction } from "../contact-actions";
import type { FormState } from "../actions";

const CHIP = "flex min-h-11 items-center gap-2 border border-rule px-3 text-sm";

/** "Mark contacted": how the owners reached the client, logged on the job. Never moves the stage. */
export function ContactLog({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [saves, setSaves] = useState(0);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const result = await logContactAction(jobId, prev, fd);
    if (result.ok) {
      setOpen(false);
      setSaves((n) => n + 1);
    }
    return result;
  }, {});
  const values = state.values;
  const picked = (key: string) => {
    const v = values?.methods;
    return Array.isArray(v) ? v.includes(key) : v === key;
  };

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="contact-open" className="flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input id="contact-open" type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
        Mark contacted
      </label>
      {open ? (
        <form key={`${saves}:${values ? JSON.stringify(values) : "initial"}`} action={action} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {CONTACT_METHODS.map((m) => (
              <label key={m.key} htmlFor={`contact-${m.key}`} className={CHIP}>
                <input id={`contact-${m.key}`} type="checkbox" name="methods" value={m.key} defaultChecked={picked(m.key)} />
                {m.label}
              </label>
            ))}
          </div>
          <label htmlFor="contact-note" className="flex flex-col gap-2 text-sm">
            Note (optional)
            <input id="contact-note" name="note" type="text" maxLength={CONTACT_NOTE_MAX}
              defaultValue={typeof values?.note === "string" ? values.note : ""}
              className="min-h-11 w-full border border-rule bg-ivory px-4 py-3" />
          </label>
          <Button type="submit" variant="solid" disabled={pending}>Save</Button>
          {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
        </form>
      ) : saves > 0 ? (
        <p role="status" className="text-sm text-ink-soft">Contact saved</p>
      ) : null}
    </div>
  );
}
```

`app/admin/jobs/[id]/JobHeader.tsx`:
- Add these imports:
  ```ts
  import { formatShortDay } from "@/lib/admin/time";
  import { ContactLog } from "./ContactLog";
  import { FollowUpBox } from "./FollowUpBox";
  ```
  Keep the existing `daysBetween, formatShortDate` import, extended to `import { daysBetween, formatShortDate, formatShortDay } from "@/lib/admin/time";`.
- After the stage badge `<span>`, inside the same flex row, add:
  ```tsx
            {job.followUpAt && job.followUpAt.getTime() < now.getTime() ? (
              <span className="border border-overdue px-2 py-1 text-xs font-semibold uppercase tracking-wide text-overdue">Call-back overdue</span>
            ) : null}
  ```
- After the city · created · in-stage `<p>`, add:
  ```tsx
          {job.lastContactAt ? (
            <p className="text-sm text-ink-soft">Last contacted {formatShortDay(job.lastContactAt)}</p>
          ) : null}
  ```
- Replace the menu panel's content, the `<StageControls job={job} parts={["set", "lost"]} />` inside the `div`, with:
  ```tsx
              <div className="flex flex-col gap-4">
                <ContactLog jobId={job.id} />
                <hr className="border-rule" />
                <FollowUpBox
                  key={job.followUpAt?.toISOString() ?? "none"}
                  job={{ id: job.id, followUpAt: job.followUpAt ?? null, followUpNote: job.followUpNote ?? null }}
                />
                <hr className="border-rule" />
                <details>
                  <summary className="cursor-pointer text-sm underline underline-offset-4">Change stage…</summary>
                  <div className="mt-3">
                    <StageControls job={job} parts={["set", "lost"]} />
                  </div>
                </details>
              </div>
  ```
  Keep the outer panel `div`, with its `absolute inset-x-0 … sm:right-0 sm:w-80` classes, as the `<details>`'s first child `div`.

`app/admin/jobs/[id]/OverviewTab.tsx`: remove the `NextActionCard` import and the `<NextActionCard … />` line.

Delete `app/admin/jobs/[id]/NextActionCard.tsx`.

`lib/admin/next-action.ts`: delete `nextAction`, `NextAction`, `NextActionCta`, `link`, and the now-unused `balanceCents`/`formatCents` import. Keep `editDetailsHref` and its comment. Grep `nextAction\(` and `NextAction` across `app` and `lib` and confirm there are no hits.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2`, the full suite. Then `npx tsc --noEmit -p .` and `npx eslint .`.
Expected: all pass and clean.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/jobs/[id]/ContactLog.tsx" "app/admin/jobs/[id]/JobHeader.tsx" "app/admin/jobs/[id]/OverviewTab.tsx" lib/admin/next-action.ts tests/admin e2e
git rm "app/admin/jobs/[id]/NextActionCard.tsx"
git commit -m "feat: job menu with mark contacted, call-back and change stage; drop the Next action card"
```

---

### Task 6: End-to-end and full verification

**Files:**
- Create: `e2e/stages.spec.ts`
- Modify: `playwright.config.ts`
  - line 21: add `stages` to the mobile `testIgnore` group, giving `/(admin|portal|call|follow-ups|questionnaire|stages)\.spec\.ts/`;
  - line 36: append `,e2e-stages-owner@example.com` to `ADMIN_EMAILS`.
- Controller only, not committed: add `e2e-stages-owner@example.com` to the scratchpad `run-e2e.mjs` ADMIN_EMAILS.

- [ ] **Step 1: Write the spec**

`e2e/stages.spec.ts`:
```ts
import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run stage tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-stages-owner@example.com";
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
    values (${name}, '7025550190', 'e2e-stages@example.com', 'Henderson', 'phone', 'new') returning id`;
  return row.id as string;
}

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from leads where name like 'E2E Stages %'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

test("saving a visit date books a new lead's appointment", async ({ page }) => {
  const id = await lead(`E2E Stages Book ${STAMP}`);
  await signIn(page);
  await page.goto(`/admin/jobs/${id}?tab=overview&edit=details`);
  await page.getByLabel("Visit date and time").fill("2026-10-14T14:00");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.goto(`/admin/jobs/${id}`);
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Appointment booked");
  const [row] = await sql()`select status from leads where id = ${id}`;
  expect(row.status).toBe("visit_booked");
  const stages = await sql()`select from_status, to_status from job_events where lead_id = ${id} and kind = 'stage'`;
  expect(stages).toEqual([{ from_status: "new", to_status: "visit_booked" }]);
});

test("mark contacted logs how, shows last contacted, and keeps the stage", async ({ page }) => {
  const id = await lead(`E2E Stages Contact ${STAMP}`);
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);
  await page.getByLabel("More actions").click();
  await page.getByLabel("Mark contacted").check();
  await page.getByLabel("Called").check();
  await page.getByLabel("Texted").check();
  await page.getByLabel("Note (optional)").fill("left details on price");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^Last contacted /)).toBeVisible();
  await expect(page.getByText("Contacted · Called, Texted — left details on price")).toBeVisible();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("New lead");
  const [event] = await sql()`select kind, body from job_events where lead_id = ${id} and kind = 'contact'`;
  expect(event).toEqual({ kind: "contact", body: "Contacted · Called, Texted — left details on price" });
});
```

- [ ] **Step 2: Full unit suite, types, lint**

Run: `npx vitest run --maxWorkers=2`, then `npx tsc --noEmit -p .`, then `npx eslint .`
Expected: all pass, 0 errors.

- [ ] **Step 3: Controller runs e2e on a Neon test branch** (the owner approves a fresh branch first)

1. Create the branch.
2. Add the stages owner to `run-e2e.mjs`.
3. Run `npx next build`.
4. Run every spec with `run-e2e.mjs`: questionnaire, call, follow-ups, portal, admin, consultation, stages.
5. Delete the branch and the URL file.

- [ ] **Step 4: Commit**

```bash
git add e2e/stages.spec.ts playwright.config.ts
git commit -m "test: e2e for automatic booking and the contact log"
```

## Launch (owner approval required, not part of the build)

1. Ping pss-eb before merging.
2. Merge `project-card-trim` to main. It also carries the Project details trim and the all-set page.
3. Run `node scripts/migrate.mjs` on production. It applies 011 and must run **before** the deploy: the new code writes `contact` events and the old status check would still allow `contacted`.
4. Run `npx vercel --prod`.
5. Verify the live site.
