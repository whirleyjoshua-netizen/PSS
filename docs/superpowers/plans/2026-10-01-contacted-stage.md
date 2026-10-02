# Contacted Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a Contacted stage between New lead and Appointment booked. Mark contacted, or a "Talked" call, moves a New lead into it. Booking, a sent quote, or a signed contract moves it on.

**Architecture:** The stage list in `lib/admin/stages.ts` drives the board, the stepper and the forms. The database check `leads_status_check` is defined identically in five migration files. Every stage move is a single SQL statement that writes its own `stage` event (precedents: `setStage`, `logCall`).

**Spec:** `docs/superpowers/specs/2026-10-01-contacted-stage-design.md`

## Global Constraints

- Work only in `/Users/jenniferjordan/pss/.claude/worktrees/contacted-stage` (branch `feat/contacted-stage`). Before editing, confirm `git rev-parse --show-toplevel` prints that path.
- The stage value is `contacted`, its label is "Contacted", the color token is `--color-stage-contacted: #6F8F72`, and the icon is `phone`.
- The order is `new, contacted, visit_booked, quoted, approved, signed, sold, measure, ordered, installed, completed`, plus `lost`.
- Moves into Contacted come only from `new`, and nothing ever moves a job backwards.
- `OVERDUE_DAYS.contacted = 3`. A Contacted job is not overdue while `followUpAt > now`.
- Migration number is **033**. Every statement must be re-runnable. **Remove** 011's `update leads set status = 'new' where status = 'contacted'`.
- All five `leads_status_check` definitions (002, 011, 012, 030, 033) must list the same full set in the app's order.
- Run unit tests with `npx vitest run --maxWorkers=2 <files>`. Lint by path. Run `npx tsc --noEmit`, and run `npx next typegen` first if errors appear only in generated types.
- Commits use the repo identity (whirleyjoshua@gmail.com) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never print a database URL.

---

### Task 1: The stage, the database check, and overdue

**Files:**
- Modify: `lib/admin/stages.ts`, `app/admin/jobs/[id]/StageStepper.tsx` (`FILL`), `app/globals.css` (stage tokens, around line 43)
- Modify: `db/migrations/002_job_tracker.sql`, `011_stages_contact_log.sql`, `012_completed_stage.sql`, `030_deposit_flow.sql` (the status list only, plus 011's reset statement and its header comment)
- Create: `db/migrations/033_contacted_stage.sql`, `tests/db/migration-033.test.ts`
- Modify: `lib/admin/overdue.ts`
- Tests to update: `tests/admin/stages.test.ts`, `tests/admin/stage-stepper.test.tsx`, `tests/admin/overdue.test.ts`, `tests/db/migration-011.test.ts`, `tests/db/migration-012.test.ts`, `tests/db/migration-030.test.ts`. Also update any board or list test that pins the column list. Find them with `grep -rln "visit_booked\|Appointment booked" tests/admin`, and update only the ones that fail.

**Interfaces produced:** `Stage` includes `"contacted"`. `isOverdue(job: Pick<Job, "status" | "stageChangedAt" | "visitAt" | "lastContactAt" | "followUpAt">, now)`.

- [ ] **Step 1: Write the failing tests first.**
  - `tests/admin/stages.test.ts`: `STAGES.map(s => s.value)` equals the full order above. `stageLabel("contacted") === "Contacted"`. `nextStage("new") === "contacted"`. `nextStage("contacted") === "visit_booked"`. `BOARD_STAGES` and `WORKING_STAGES` contain `contacted` right after `new`. `isStage("contacted") === true`. `BOOKED_OR_LATER` does not contain `contacted`.
  - `tests/db/migration-033.test.ts` (copy the helpers from `migration-030.test.ts`):
    ```ts
    import { describe, it, expect } from "vitest";
    import { readFileSync } from "node:fs";
    import { ALL_STAGES } from "@/lib/admin/stages";

    const flat = (file: string) => readFileSync(`db/migrations/${file}`, "utf8")
      .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").replace(/\s+/g, " ");
    const statements = (file: string) => flat(file).split(";").map((s) => s.trim()).filter(Boolean);
    const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(",");
    const STATUS_FILES = ["002_job_tracker.sql", "011_stages_contact_log.sql", "012_completed_stage.sql", "030_deposit_flow.sql", "033_contacted_stage.sql"];

    describe("migration 033", () => {
      it("is only a re-runnable redefinition of the stage check", () => {
        const all = statements("033_contacted_stage.sql");
        expect(all).toEqual([
          "alter table leads drop constraint if exists leads_status_check",
          `alter table leads add constraint leads_status_check check ( status in (${list(ALL_STAGES)}) )`,
        ]);
      });
      it("puts contacted after new, and every file that defines the check lists the same full set", () => {
        expect(ALL_STAGES.slice(0, 3)).toEqual(["new", "contacted", "visit_booked"]);
        for (const file of STATUS_FILES) expect(flat(file), file).toContain(`status in (${list(ALL_STAGES)})`);
      });
      it("no migration resets Contacted jobs any more (migrate.mjs re-runs every file)", () => {
        for (const file of STATUS_FILES) expect(flat(file), file).not.toMatch(/update leads set status = 'new' where status = 'contacted'/);
      });
    });
    ```
    If the exact whitespace inside `check ( status in (…) )` differs once it's flattened, match the file you write. The point is that the file contains exactly those two statements.
  - `tests/db/migration-011.test.ts`: replace the "moves any Contacted job back to New" test with one asserting that 011 has **no** `update leads` statement and that its check lists the full set including `contacted`. Change the re-runnable regex to drop the `update leads set` alternative.
  - `tests/db/migration-030.test.ts`: the hard-coded `ALL_STAGES` expectation gains `"contacted"` after `"new"`.
  - `tests/db/migration-012.test.ts`: update any hard-coded list the same way.
  - `tests/admin/overdue.test.ts`: add `["contacted", 3]` to the `it.each` table. Extend the `job()` helper with an optional `followUpAt` (5th parameter, default `null`). Add tests that:
    - a contacted job 4 days in with `followUpAt` 1 day **ahead** is **not** overdue;
    - with `followUpAt` 1 day **past** it **is** overdue;
    - with no `followUpAt` it **is** overdue.
  - `tests/admin/stage-stepper.test.tsx`: if it counts the steps, the count gains one, and a `contacted` status shows "Contacted" as the current step.
- [ ] **Step 2:** Run those files and confirm they fail for the right reasons.
- [ ] **Step 3: Implement.**
  - `stages.ts`:
    - Add `{ value: "contacted", label: "Contacted" }` after `new` in `STAGES`.
    - Insert `"contacted"` after `"new"` in `WORKING_STAGES` and in `BOARD_STAGES`.
    - In `STAGE_STYLE`, add `contacted: { icon: "phone", edge: "border-t-stage-contacted", tint: "text-stage-contacted", left: "border-l-stage-contacted" }` after `new`.
    - `RETIRED_LABELS` becomes `{}`. Keep the variable so `stageLabel` stays unchanged, but update its comment to say no stage is currently retired. Alternatively, remove it along with its use, but keep `stageLabel` behaving the same for unknown values.
  - `StageStepper.tsx` `FILL`: add `contacted: "bg-stage-contacted",` after `new`.
  - `globals.css`: add `--color-stage-contacted: #6F8F72;` after `--color-stage-new`, with the existing "edges, dots and icon tints only" convention.
  - In each of 002, 011, 012 and 030, replace the status list with `status in ('new','contacted','visit_booked','quoted','approved','signed','sold','measure','ordered','installed','completed','lost')`.
  - In 011:
    - Delete the line `update leads set status = 'new' where status = 'contacted';`.
    - Rewrite the header's second line as: `-- Every statement is safe to re-run. It once returned Contacted jobs to New. That reset was removed when Contacted came back (2026-10-01), because migrate.mjs re-runs every file.` Comments must contain no semicolons.
  - Create `033_contacted_stage.sql`:
    ```sql
    -- Contacted is a stage again (docs/superpowers/specs/2026-10-01-contacted-stage-design.md).
    -- 002, 011, 012, 030 and this file all define leads_status_check, so all five list the CURRENT FULL set.
    -- Whole-line comments only, and no semicolons in comments.

    alter table leads drop constraint if exists leads_status_check;

    alter table leads add constraint leads_status_check check (
      status in ('new','contacted','visit_booked','quoted','approved','signed','sold','measure','ordered','installed','completed','lost')
    );
    ```
  - Update the doc comment in `stages.ts` so it names the five files: 002, 011, 012, 030, 033.
  - `overdue.ts`:
    ```ts
    export const OVERDUE_DAYS: Partial<Record<Stage, number>> = {
      new: 1,
      contacted: 3,
      quoted: 7,
      approved: 2,
      signed: 2,
      sold: 3,
      measure: 7,
      ordered: 21,
    };
    …
    /** A booked visit is judged by its date, a new lead by whether anyone has reached out, a contacted one by its call-back. */
    export function isOverdue(
      job: Pick<Job, "status" | "stageChangedAt" | "visitAt" | "lastContactAt" | "followUpAt">, now: Date,
    ): boolean {
      if (job.status === "visit_booked") {
        return job.visitAt !== null && lasVegasDate(now) > lasVegasDate(job.visitAt);
      }
      const limit = OVERDUE_DAYS[job.status];
      if (limit === undefined || daysInStage(job.stageChangedAt, now) <= limit) return false;
      if (job.status === "new" && job.lastContactAt && job.lastContactAt >= job.stageChangedAt) return false;
      // A call-back set for later is the plan for this client: the call-back reminder covers it.
      if (job.status === "contacted" && job.followUpAt && job.followUpAt.getTime() > now.getTime()) return false;
      return true;
    }
    ```
    Check the callers (`app/admin/JobCard.tsx`, `app/admin/DaysInStage.tsx`) still type-check: `Job` has `followUpAt?: Date | null`.
- [ ] **Step 4:** Run the changed test files, then `npx vitest run --maxWorkers=2 tests/admin tests/db`. Fix only failures caused by the new stage, such as tests that pin column lists or step counts. Run `npx tsc --noEmit`.
- [ ] **Step 5: Test power.** Delete `contacted: 3` from `OVERDUE_DAYS`, and the overdue test must fail. Re-add 011's reset line, and migration-033's "no migration resets" test must fail. Restore both.
- [ ] **Step 6:** Commit with the message `feat: Contacted is a stage again (migration 033); 011 no longer resets it`.

---

### Task 2: Moves into and out of Contacted

**Files:**
- Modify: `lib/admin/jobs.ts` (`addContact`, around line 292), `lib/admin/call.ts` (`callStageMove`), `app/admin/jobs/appointment-actions.ts` (line 68), `lib/portal/sign.ts` (three `('new','visit_booked','quoted','approved')` lists plus the comment above them), `lib/dc/send.ts` (three `('new','visit_booked','approved')` lists), `app/admin/jobs/[id]/ContactLog.tsx` (doc comment), `app/admin/jobs/contact-actions.ts` (comment)
- Tests: `tests/admin/jobs.test.ts`, `tests/admin/call.test.ts`, `tests/admin/calls.test.ts` (only if it pins `callStageMove` output), `tests/admin/appointment-actions.test.ts`, and the sign and send tests. Find them with `grep -rln "'new','visit_booked'" tests`.

- [ ] **Step 1: Write the failing tests first.**
  - `call.test.ts`: `callStageMove("booked")` equals `{ to: "visit_booked", from: ["new", "contacted"] }`. `callStageMove("talked")` equals `{ to: "contacted", from: ["new"] }`. `callStageMove("no_answer")` is `null`.
  - `jobs.test.ts`, the `addContact` test: keep the existing assertions. Add that it is **one** statement (`sql` called once) containing:
    - `"'contact'"`;
    - `update leads set status = 'contacted'`;
    - `where id = ? and status = 'new'`;
    - a stage insert with `'stage', 'new', 'contacted'`.
  - `appointment-actions.test.ts`: next to "moves a new job to visit_booked when the consultation is confirmed", add the same test for a `contacted` job. Add (or keep) one asserting that a `quoted` job does not move.
  - The sign and send tests: assert that the status lists in the SQL text include `'contacted'`, using whatever style each existing test uses for the list.
- [ ] **Step 2:** Run the tests and confirm they fail.
- [ ] **Step 3: Implement.**
  - `call.ts`:
    ```ts
    /** Where a call's outcome may move the job, and only from which stages. Never backwards. */
    export function callStageMove(outcome: CallOutcome): { to: "visit_booked" | "contacted"; from: Stage[] } | null {
      if (outcome === "booked") return { to: "visit_booked", from: ["new", "contacted"] };
      if (outcome === "talked") return { to: "contacted", from: ["new"] };
      return null;
    }
    ```
    `logCall` in `lib/admin/calls.ts` already applies `$8`/`$9` generically and logs the stage event only when the move landed. Leave it alone, apart from any comment that says only a booked call moves the stage.
  - `jobs.ts`:
    ```ts
    /**
     * Logs how the owners reached the client and, for a New lead, moves it to Contacted, in one
     * statement. The move is guarded by status = 'new' in the UPDATE itself, so it never moves a
     * job backwards and two saves at once log one stage event. The unreferenced stage_logged CTE
     * still runs: Postgres executes every data-modifying CTE.
     */
    export async function addContact(id: string, body: string, actor: string): Promise<boolean> {
      if (!isUuid(id)) return false;
      const rows = await db()`
        with logged as (
          insert into job_events (lead_id, actor, kind, body)
          select id, ${actor}, 'contact', ${body} from leads where id = ${id}
          returning lead_id
        ), moved as (
          update leads set status = 'contacted', stage_changed_at = now(), updated_at = now()
          where id = ${id} and status = 'new' and exists (select 1 from logged)
          returning id
        ), stage_logged as (
          insert into job_events (lead_id, actor, kind, from_status, to_status)
          select moved.id, ${actor}, 'stage', 'new', 'contacted' from moved
        )
        select lead_id from logged`;
      return rows.length > 0;
    }
    ```
  - `appointment-actions.ts` line 68:
    `if (confirmed.kind === "consultation" && (job?.status === "new" || job?.status === "contacted")) await setStage(jobId, "visit_booked", email);`
  - `sign.ts`: each `('new','visit_booked','quoted','approved')` becomes `('new','contacted','visit_booked','quoted','approved')`, and the comment above them changes to match.
  - `send.ts`: each `('new','visit_booked','approved')` becomes `('new','contacted','visit_booked','approved')`.
  - `ContactLog.tsx` doc comment: `/** "Mark contacted": how the owners reached the client, logged on the job. Moves a New lead to Contacted. */`
  - `contact-actions.ts` comment: `// Calls requireAdmin() before reading its input. Moves a New lead to Contacted (addContact). Never touches the call-back.`
  - The action already revalidates `/admin` and the job page, so the board and stepper update.
- [ ] **Step 4:** Run the changed tests, then `tests/admin tests/db`, then tsc and eslint by path.
- [ ] **Step 5: Test power.** Remove `and status = 'new'` from `addContact`, and the jobs test must fail. Remove `"contacted"` from the booked `from` list, and the call test must fail. Restore both.
- [ ] **Step 6:** Commit with the message `feat: Mark contacted and a talked call move a new lead to Contacted; booking moves it on`.

---

### Task 3: Prove it on a real Neon branch

**Files:** Create `scripts/verify-contacted.ts` and `scripts/verify-contacted.config.mts`. Copy the safety block, config and style of `scripts/verify-tasks.ts` / `scripts/verify-tasks.config.mts`: E2E_POSTGRES_URL only, refuse `ep-cold-term`, never print the URL, clean up in `finally` with `Promise.allSettled`.

The controller supplies an already-migrated branch.

- [ ] **Step 1: Write the script.** It inserts its own leads (name prefix `VERIFY Contacted <stamp>`, status `new`, using the column set from `scripts/verify-measure-kinds.ts`'s `newLead`) and checks:
  1. A raw `update leads set status = 'contacted'` on a lead **succeeds**, so the check accepts it.
  2. `addContact(newLead)` returns true. The lead is now `contacted`, there is exactly one `contact` event, and exactly one `stage` event from `new` to `contacted`.
  3. `addContact` again on the same lead: it stays `contacted`, there are two contact events, and still exactly one stage event.
  4. `addContact` on a lead set to `quoted`: it stays `quoted`, and there is no stage event.
  5. `logCall` with outcome `talked` on a new lead moves it to `contacted` with one stage event. Build the input from `callSchema` in `lib/admin/schema.ts` or construct a valid `CallInput`, and read `tests/admin/calls.test.ts` for a valid one.
  6. `logCall` with outcome `booked` and a `visitAt` on a `contacted` lead moves it to `visit_booked`, with one stage event from `contacted`.
  7. `logCall` `no_answer` on a new lead leaves it `new`.
  8. Re-run every statement of `db/migrations/011_stages_contact_log.sql` and `033_contacted_stage.sql` via `sql.query`, splitting on `;` after stripping `--` lines. A lead that is `contacted` is **still** `contacted` afterwards. This is the regression the 011 edit exists for.
  9. A raw update to status `'contactd'` (a typo) **throws** `leads_status_check`.

  Cleanup deletes `job_events`, then `appointments`, then `leads` for the script's own lead ids.
- [ ] **Step 2:** Run it twice. All checks must pass with no residue.
- [ ] **Step 3: Watch it fail.** Remove `and status = 'new'` from `addContact`: step 4 must fail. Re-add 011's reset line: step 8 must fail. Restore both, and confirm `git diff --stat lib/ db/` is empty.
- [ ] **Step 4:** Commit with the message `test: verify the Contacted stage against a real branch`.

---

### Task 4: End-to-end

**Files:** Modify `e2e/stages.spec.ts`.

- [ ] **Step 1:** The test `"mark contacted logs how, shows last contacted, and keeps the stage"` now contradicts the spec. Change it to `"mark contacted logs how, shows last contacted, and moves a new lead to Contacted"`. Keep its contact-log assertions, but change the stage assertions:
  - the stepper's current step contains "Contacted";
  - the DB status is `contacted`;
  - the stage events equal `[{ from_status: "new", to_status: "contacted" }]`.

  Add a test `"confirming a consultation books a contacted lead"`. It is the existing booking test, with the lead inserted as `status 'contacted'` and the expected stage events `[{ from_status: "contacted", to_status: "visit_booked" }]`.

  Add a board check: after marking contacted, go to `/admin` and assert the card is inside the Contacted column. Read `app/admin/page.tsx` and the board components for the column's accessible name, and follow existing board assertions in `e2e/admin.spec.ts` if present.
- [ ] **Step 2:** Run in the FOREGROUND against the controller's branch:
  `E2E_POSTGRES_URL="$(cat <file>)" E2E_TEST_ENDPOINT=<ep-id> npx playwright test e2e/stages.spec.ts e2e/call.spec.ts --project=desktop`
  Reconcile the totals: `did not run` and `skipped` must be 0. `call.spec.ts` is included because the talked outcome now moves the stage. If it asserts that a talked call keeps the stage, update that assertion to `contacted`. That change matches the spec.
- [ ] **Step 3:** Falsify one assertion, confirm it fails where you meant it to, then restore it.
- [ ] **Step 4:** Commit with the message `test: e2e for the Contacted stage`.

---

### Task 5: Ship (controller only; ask the owner before the production migration and push)

- [ ] Run the full `npx vitest run --maxWorkers=2`, then tsc and `npx next build`.
- [ ] Do a final whole-branch review, then make one fix wave if needed.
- [ ] Apply the production migration following the `pss-production-migrations` memory: confirm the target is `ep-cold-term` without printing it, run migrate.mjs from this worktree (which carries the edited 011 and the new 033), and verify read-only that the constraint includes contacted and row counts are unchanged.
- [ ] Fast-forward main, run the tests on the merged result, push (which deploys), and confirm with curl. Then delete the branch and the worktree, and record a memory.
