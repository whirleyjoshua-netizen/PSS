# Completed Stage and the Job List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a final Completed stage, remove the board's stage tiles, keep the Kanban to current work, and add an "All jobs" list with a stage dropdown under it.

**Architecture:** `completed` joins `STAGES` in `lib/admin/stages.ts`; a new `BOARD_STAGES` drives the Kanban and `isInstalled` centralizes "install happened" for reviews, referrals and job creation. The portal keeps its four customer steps and maps `completed` → `installed`. The board page loads every job once (Lost included) and passes the board subset to the columns and a filtered set to a new server `JobList` component, whose `<select>` submits a GET form (`?list=`).

**Tech Stack:** Next.js (App Router, this repo's version — read `node_modules/next/dist/docs/` before using any Next API), React server components, Tailwind v4 tokens in `app/globals.css`, Neon Postgres via `db()`, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-completed-stage-job-list-design.md`

## Global Constraints

- Stage value is `completed`, label is `Completed`. Customers never see the word Completed.
- Board columns: `new, visit_booked, quoted, sold, ordered, installed` only.
- Dropdown options, in order: All jobs, New lead, Appointment booked, Quoted, Sold, Ordered, Installed, Completed, Lost. Default All jobs. URL param `list`.
- Status list everywhere (002, 011, 012): `('new','visit_booked','quoted','sold','ordered','installed','completed','lost')`.
- Tailwind class names are complete literals; never build them by concatenation.
- Run unit tests with `npx vitest run --maxWorkers=2 <path>`. Typecheck with `npm run typecheck`. Lint with `npm run lint`.
- Migrations: idempotent, whole-line `--` comments only, no `;` inside comments.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JYGrNPPExoH7wwLxH3AEZk
  ```

---

### Task 1: The Completed stage and its migration

**Files:**
- Modify: `lib/admin/stages.ts`, `components/admin/icons.tsx`, `app/globals.css:43-48`, `app/admin/jobs/[id]/StageStepper.tsx:5-12`
- Modify: `db/migrations/002_job_tracker.sql:8`, `db/migrations/011_stages_contact_log.sql:10`
- Create: `db/migrations/012_completed_stage.sql`, `tests/db/migration-012.test.ts`
- Test: `tests/admin/stages.test.ts`, `tests/admin/stage-stepper.test.tsx`, `tests/db/migration-011.test.ts`

**Interfaces:**
- Produces: `STAGES` (7 entries, `completed` last), `WORKING_STAGES` (7, same order), `BOARD_STAGES: readonly ["new","visit_booked","quoted","sold","ordered","installed"]`, `type BoardStage`, `INSTALLED_STATUSES: readonly ["installed","completed"]`, `isInstalled(status: string): boolean`, `STAGE_STYLE.completed`, icon name `check`.

- [ ] **Step 1: Write the failing tests**

In `tests/admin/stages.test.ts`, replace the first and third `it` blocks and the "six working stages" test, and add a new `describe`:

```ts
  it("runs from new lead to completed, in order", () => {
    expect(STAGES.map((s) => s.value)).toEqual([
      "new", "visit_booked", "quoted", "sold", "ordered", "installed", "completed",
    ]);
  });
```
```ts
  it("advances one stage at a time and stops at completed", () => {
    expect(nextStage("new")).toBe("visit_booked");
    expect(nextStage("ordered")).toBe("installed");
    expect(nextStage("installed")).toBe("completed");
    expect(nextStage("completed")).toBeNull();
    expect(nextStage("lost")).toBeNull();
  });
```
```ts
  it("lists the working stages in stage order", () => {
    expect([...WORKING_STAGES]).toEqual(STAGES.map((s) => s.value));
  });
```
Add `stageLabel("completed")` → `"Completed"` to the labels test, and extend the import with `BOARD_STAGES, INSTALLED_STATUSES, isInstalled`, then append:

```ts
describe("board and installed stages", () => {
  it("puts only current work on the board", () => {
    expect([...BOARD_STAGES]).toEqual(["new", "visit_booked", "quoted", "sold", "ordered", "installed"]);
  });

  it("counts installed and completed as installed", () => {
    expect([...INSTALLED_STATUSES]).toEqual(["installed", "completed"]);
    expect(isInstalled("installed")).toBe(true);
    expect(isInstalled("completed")).toBe(true);
    expect(isInstalled("ordered")).toBe(false);
    expect(isInstalled("lost")).toBe(false);
  });

  it("styles completed with its own token", () => {
    expect(STAGE_STYLE.completed).toEqual({
      icon: "check", edge: "border-t-stage-completed", tint: "text-stage-completed", left: "border-l-stage-completed",
    });
  });
});
```

In `tests/admin/stage-stepper.test.tsx` replace the first two tests:

```ts
  it("shows all seven stages with done, current and upcoming", () => {
    render(<StageStepper status="visit_booked" />);
    expect(screen.getByRole("list", { name: "Stage" })).toBeInTheDocument();
    expect(states()).toEqual(["done", "current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Appointment booked");
  });

  it("marks every earlier stage done at completed", () => {
    render(<StageStepper status="completed" />);
    expect(states()).toEqual(["done", "done", "done", "done", "done", "done", "current"]);
  });
```

In `tests/db/migration-011.test.ts` change line 20's expectation to the new list:

```ts
    expect(all[check]).toContain("status in ('new','visit_booked','quoted','sold','ordered','installed','completed','lost')");
```

Create `tests/db/migration-012.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const statements = (file: string) => readFileSync(`db/migrations/${file}`, "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);

const STATUSES = "status in ('new','visit_booked','quoted','sold','ordered','installed','completed','lost')";
const statusList = (file: string) =>
  statements(file).find((s) => s.includes("leads_status_check check"))?.replace(/\s+/g, " ");

describe("migration 012", () => {
  const all = statements("012_completed_stage.sql");

  it("allows the completed status", () => {
    expect(statusList("012_completed_stage.sql")).toContain(STATUSES);
  });

  it("is re-runnable and changes no rows", () => {
    for (const s of all) expect(s).toMatch(/^alter table leads (drop constraint if exists|add constraint) leads_status_check/);
  });

  it("keeps completed in every status list, and 011 and 012 identical", () => {
    // 002 still carries the retired 'contacted', so only check it allows completed.
    expect(statusList("002_job_tracker.sql")).toContain("'completed'");
    for (const file of ["011_stages_contact_log.sql", "012_completed_stage.sql"]) {
      expect(statusList(file)).toContain(STATUSES);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/stages.test.ts tests/admin/stage-stepper.test.tsx tests/db`
Expected: FAIL (no `completed`, no `BOARD_STAGES`, no 012 file).

- [ ] **Step 3: Implement**

`lib/admin/stages.ts`:
- Add `{ value: "completed", label: "Completed" },` after the installed entry of `STAGES`.
- Replace `WORKING_STAGES` with:
```ts
export const WORKING_STAGES = ["new", "visit_booked", "quoted", "sold", "ordered", "installed", "completed"] as const;
```
- After `parseWorkingStage`, add:
```ts
/** The Kanban's columns: current work only. Completed and Lost live in the job list. */
export const BOARD_STAGES = ["new", "visit_booked", "quoted", "sold", "ordered", "installed"] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];

/** The one definition of "the install has happened", for reviews, referrals and hand-entered jobs. */
export const INSTALLED_STATUSES = ["installed", "completed"] as const;
export const isInstalled = (status: string): boolean => (INSTALLED_STATUSES as readonly string[]).includes(status);
```
- In `STAGE_STYLE`, after `installed`:
```ts
  completed: { icon: "check", edge: "border-t-stage-completed", tint: "text-stage-completed", left: "border-l-stage-completed" },
```

`components/admin/icons.tsx` — add to `PATHS` after `wrench`:
```ts
  check: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM8.5 12.5l2.5 2.5 4.5-5",
```

`app/globals.css` — after `--color-stage-installed: #1E1E1E;` add `  --color-stage-completed: #3F7D6B;`

`app/admin/jobs/[id]/StageStepper.tsx` — add `completed: "bg-stage-completed",` to `FILL` after `installed`.

`db/migrations/011_stages_contact_log.sql:10` — change the status list to `status in ('new','visit_booked','quoted','sold','ordered','installed','completed','lost')`.

`db/migrations/002_job_tracker.sql:8` — it keeps the retired `'contacted'` (011 narrows it away on every run); make it `('new','contacted','visit_booked','quoted','sold','ordered','installed','completed','lost')`.

Create `db/migrations/012_completed_stage.sql`:
```sql
-- Adds the Completed stage after Installed. No rows change.
-- migrate.mjs re-applies every file, so the status lists in 002 and 011 include completed too. Keep all three in step.

alter table leads drop constraint if exists leads_status_check;

alter table leads add constraint leads_status_check check (
  status in ('new','visit_booked','quoted','sold','ordered','installed','completed','lost')
);
```

- [ ] **Step 4: Run tests, typecheck**

Run: `npx vitest run --maxWorkers=2 tests/admin/stages.test.ts tests/admin/stage-stepper.test.tsx tests/db tests/admin/icons.test.tsx && npm run typecheck`
Expected: PASS. If typecheck flags a `Record<Stage, …>` missing `completed` anywhere else, add the entry there.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/stages.ts components/admin/icons.tsx app/globals.css "app/admin/jobs/[id]/StageStepper.tsx" db/migrations tests/admin/stages.test.ts tests/admin/stage-stepper.test.tsx tests/db
git commit -m "feat: add the Completed stage after Installed"
```

---

### Task 2: Completed counts as installed

**Files:**
- Modify: `lib/reviews/eligibility.ts:22`, `lib/reviews/db.ts:12`, `app/admin/jobs/actions.ts:130`, `app/admin/jobs/[id]/ReviewSection.tsx:45`, `lib/referrals/codes.ts:33`, `lib/referrals/db.ts:80`, `lib/admin/jobs.ts:266-272`
- Test: `tests/reviews/eligibility.test.ts`, `tests/reviews/db.test.ts`, `tests/referrals/codes.test.ts`, `tests/referrals/db.test.ts`, `tests/admin/jobs.test.ts`

**Interfaces:**
- Consumes: `isInstalled(status: string): boolean` from `@/lib/admin/stages` (Task 1).

- [ ] **Step 1: Write the failing tests**

`tests/reviews/eligibility.test.ts`, inside `describe("isDueForReview")`:
```ts
  it("is due for a completed job too", () => {
    expect(isDueForReview(job({ status: "completed" }), NOW)).toBe(true);
  });
```
`tests/referrals/codes.test.ts`, inside `describe("rewardStatus")`:
```ts
  it("is owed once completed and unpaid", () => {
    expect(rewardStatus({ status: "completed", referralPaidAt: null })).toBe("owed");
  });
```
`tests/admin/jobs.test.ts`, in the createJob describe (next to the installed cases):
```ts
  it("a job created as completed turns the review request off and says so", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    await jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone", stage: "completed" },
      "owner@example.com",
    );
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([true, "Added by hand (review request off)"]));
  });
```
In `tests/reviews/db.test.ts` and `tests/referrals/db.test.ts`, find the test that asserts on the SQL text containing `status = 'installed'` (grep for `installed`) and change it to expect `status in ('installed','completed')`. If neither file asserts on that text, add one assertion to the existing `listReviewCandidates` / `markReferralPaid` test: `expect(<statement text>).toContain("status in ('installed','completed')")`, using the helper that test file already uses to read the SQL text.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 tests/reviews tests/referrals tests/admin/jobs.test.ts`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement**

- `lib/reviews/eligibility.ts:22`: `if (!isInstalled(job.status) || !job.email || job.reviewRequestedAt || job.reviewOptOut) return false;` — import `isInstalled` from `@/lib/admin/stages`. If `ReviewCandidate["status"]` is typed as `Stage`, no type change is needed.
- `lib/reviews/db.ts:12`: `where status in ('installed','completed') and email is not null`
- `lib/referrals/db.ts:80`: `where id = ${referredId} and status in ('installed','completed')`; update the doc comment to "installed (or completed)".
- `lib/referrals/codes.ts:33`: `return isInstalled(job.status) ? "owed" : "pending";` with the import.
- `app/admin/jobs/actions.ts:130`: `if (!isInstalled(job.status)) return { error: "Review requests go out once the job is installed." };` with the import.
- `app/admin/jobs/[id]/ReviewSection.tsx:45`: `{isInstalled(job.status) ? (` with the import.
- `lib/admin/jobs.ts` `createJob`:
```ts
  // A job entered as already installed (or completed) must not trigger tomorrow's review email; the owner can untick it.
  const installed = isInstalled(input.stage);
  const body = installed ? "Added by hand (review request off)" : "Added by hand";
```
and use `${installed}` in place of `${input.stage === "installed"}` in the insert.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/reviews tests/referrals tests/admin && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/reviews lib/referrals lib/admin/jobs.ts app/admin/jobs/actions.ts "app/admin/jobs/[id]/ReviewSection.tsx" tests/reviews tests/referrals tests/admin/jobs.test.ts
git commit -m "feat: treat Completed jobs as installed for reviews, referrals and new jobs"
```

---

### Task 3: The customer portal shows Completed as Installed

**Files:**
- Modify: `lib/portal/progress.ts`, `lib/portal/access.ts`, `lib/portal/invite.ts:78`, `app/admin/jobs/actions.ts:13,52,167`, `app/admin/jobs/[id]/OverviewTab.tsx:8,82`
- Test: `tests/portal/progress.test.ts`, `tests/portal/access.test.ts`, `tests/portal/invite.test.ts`

**Interfaces:**
- Produces: `PORTAL_STATUSES: readonly ["quoted","sold","ordered","installed","completed"]`, `isPortalStatus(status: Stage): boolean`, `toPortalStage(status: Stage): PortalStage` (throws never; callers pass only portal statuses). `isPortalStage` is removed.

- [ ] **Step 1: Write the failing tests**

`tests/portal/progress.test.ts` — change the import to `formatInstallDay, isPortalStatus, progressSteps, PORTAL_STAGES, PORTAL_STATUSES, toPortalStage` and replace the "exclude every earlier stage and lost" test:
```ts
  it("show a customer quoted through completed, never earlier stages or lost", () => {
    expect(PORTAL_STATUSES).toEqual(["quoted", "sold", "ordered", "installed", "completed"]);
    for (const stage of ["new", "visit_booked", "lost"] as const) expect(isPortalStatus(stage)).toBe(false);
    for (const stage of PORTAL_STATUSES) expect(isPortalStatus(stage)).toBe(true);
  });

  it("show a completed job as installed", () => {
    expect(toPortalStage("completed")).toBe("installed");
    expect(toPortalStage("sold")).toBe("sold");
  });
```
`tests/portal/access.test.ts:38` and `tests/portal/invite.test.ts:90` — the expected param becomes `["quoted", "sold", "ordered", "installed", "completed"]`. Add to `describe("toProject")` in access.test.ts:
```ts
  it("shows a completed job to the customer as installed", async () => {
    query.mockResolvedValue([row({ status: "completed" })]);
    const [job] = await visibleJobs("maria@example.com");
    expect(toProject(job).status).toBe("installed");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 tests/portal`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/portal/progress.ts` — replace `isPortalStage` with:
```ts
/** The statuses whose jobs a customer may see. Completed shows as the Installed step. */
export const PORTAL_STATUSES = [...PORTAL_STAGES, "completed"] as const;

export const isPortalStatus = (status: Stage): boolean =>
  (PORTAL_STATUSES as readonly string[]).includes(status);

/** Only call with a portal status. Customers never see the word Completed. */
export const toPortalStage = (status: Stage): PortalStage =>
  status === "completed" ? "installed" : (status as PortalStage);
```
`lib/portal/access.ts` — import `PORTAL_STATUSES, toPortalStage, type PortalStage`; query param `[email, [...PORTAL_STATUSES]]`; update the doc comment to "from Quoted onward (Completed shows as Installed), never Lost"; in `toProject` use `status: toPortalStage(job.status),` and change the comment above it to "so its status is a portal status".
`lib/portal/invite.ts` — import `PORTAL_STATUSES` instead of `PORTAL_STAGES`; param `[jobId, [...PORTAL_STATUSES]]`.
`app/admin/jobs/actions.ts` and `app/admin/jobs/[id]/OverviewTab.tsx` — replace every `isPortalStage` import and call with `isPortalStatus`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run --maxWorkers=2 tests/portal tests/admin && npm run typecheck`
Expected: PASS. `grep -rn isPortalStage app lib tests` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add lib/portal app/admin/jobs/actions.ts "app/admin/jobs/[id]/OverviewTab.tsx" tests/portal
git commit -m "feat: customers see a Completed job as Installed"
```

---

### Task 4: The board shows current work only

**Files:**
- Modify: `lib/admin/jobs.ts:123-145` (`listJobs`), `lib/admin/links.ts`, `app/admin/JobCard.tsx:8-15`, `app/admin/page.tsx`
- Test: `tests/admin/jobs.test.ts`, `tests/admin/links.test.ts`, `tests/admin/board.test.tsx`, `tests/admin/board-page.test.tsx`

**Interfaces:**
- Consumes: `BOARD_STAGES`, `type BoardStage` (Task 1).
- Produces: `listJobs({ search }: { search?: string }): Promise<Job[]>` (always includes Lost); `boardHref({ list, job, q }: { list?: string | null; job?: string | null; q?: string | null }): string` with param order `q`, `list`, `job`; `groupByStage(jobs: Job[], stages: readonly Stage[])`.

- [ ] **Step 1: Write the failing tests**

`tests/admin/jobs.test.ts`:
- Replace "hides lost jobs unless asked" with:
```ts
  it("lists every job, lost included", async () => {
    await jobs.listJobs({});
    const [statement, params] = sql.query.mock.calls[0];
    expect(statement).not.toContain("lost");
    expect(params ?? []).toEqual([]);
  });
```
- Change every other `listJobs({ includeLost: …, search })` call to `listJobs({ search })`, and drop the leading `false`/`true` from expected params: `[false]` → no params (`expect(sql.query.mock.calls[0][1] ?? []).toEqual([])`), `[false, "%4521 Elm%", ""]` → `["%4521 Elm%", ""]`, and so on; `params[1]` in the escaping test becomes `params[0]`; `$2` in statement assertions becomes `$1`, `$3` becomes `$2`.

`tests/admin/links.test.ts` — replace the two `boardHref` describes with:
```ts
describe("boardHref", () => {
  it("is the plain board with nothing set", () => {
    expect(boardHref({})).toBe("/admin");
  });
  it("carries the search, the list filter and the open job, in that order", () => {
    expect(boardHref({ job: "abc" })).toBe("/admin?job=abc");
    expect(boardHref({ list: "completed", job: "abc" })).toBe("/admin?list=completed&job=abc");
    expect(boardHref({ q: "reyes smith", list: "lost", job: "abc" })).toBe("/admin?q=reyes%20smith&list=lost&job=abc");
    expect(boardHref({ q: "", list: null, job: null })).toBe("/admin");
  });
});
```

`tests/admin/board.test.tsx` — replace the two `groupByStage` tests:
```ts
  it("groups jobs into the given stages, in order, even when empty", () => {
    const groups = groupByStage([job({ status: "sold" }), job({ status: "completed" })], BOARD_STAGES);
    expect(groups.map((g) => g.label)).toEqual([
      "New lead", "Appointment booked", "Quoted", "Sold", "Ordered", "Installed",
    ]);
    expect(groups.find((g) => g.stage === "sold")!.jobs).toHaveLength(1);
  });
```
and add `import { BOARD_STAGES } from "@/lib/admin/stages";`.

`tests/admin/board-page.test.tsx`:
- `open`'s param type becomes `{ list?: string; job?: string; q?: string }`.
- Delete "keeps the lost toggle in card and close links".
- Replace "shows a tile per working stage linking to its column" with:
```ts
  it("has no stage tiles and no lost toggle", async () => {
    await open({});
    expect(screen.queryByRole("navigation", { name: "Stages" })).toBeNull();
    expect(screen.queryByRole("link", { name: /show lost/i })).toBeNull();
  });

  it("keeps completed and lost jobs off the board", async () => {
    jobs.listJobs.mockResolvedValue([job, { ...jobB, status: "completed" }, { ...jobB, id: "5b4d0e3a-0e74-4c75-9c3e-3f4a5b6c7d8e", name: "Lee Park", status: "lost" }]);
    await open({});
    const board = screen.getByRole("region", { name: "Board" });
    expect(within(board).getAllByRole("region")).toHaveLength(6);
    expect(within(board).queryByText("Chris Lane")).toBeNull();
    expect(within(board).queryByText("Lee Park")).toBeNull();
  });
```
- Replace "has an add link in every working column, and none for lost" with:
```ts
  it("has an add link in every board column", async () => {
    await open({});
    expect(screen.getByRole("link", { name: "+ Add lead" })).toHaveAttribute("href", "/admin/jobs/new?stage=new");
    expect(screen.getAllByRole("link", { name: "+ Add job" })).toHaveLength(5);
  });
```
- In "has a New Job button and a search box…" use `open({ list: "lost", job: ID })` and assert `search.querySelector('input[name="list"]')` has value `"lost"` instead of the `lost` input; rename the test to "…keeps the list filter and open panel".
- In "filters by ?q…" expect `jobs.listJobs` toHaveBeenCalledWith `{ search: "reyes" }`, and scope the card-link assertion to the board: `within(screen.getByRole("region", { name: "Board" })).getByRole("link", { name: /dana reyes/i, current: true })`. Do the same scoping in the two earlier tests that find the Dana Reyes link (the list in Task 5 will add a second link with that name).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 tests/admin/jobs.test.ts tests/admin/links.test.ts tests/admin/board.test.tsx tests/admin/board-page.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/admin/jobs.ts` `listJobs`:
```ts
export async function listJobs({ search }: { search?: string }): Promise<Job[]> {
  const term = (search ?? "").trim().slice(0, SEARCH_MAX);
  if (!term) {
    const rows = await db().query(`select ${JOB_COLUMNS} from leads order by stage_changed_at desc`);
    return rows.map(toJob);
  }
  // (keep the existing phone-digits comment and logic)
  const digits = term.replace(/\D/g, "");
  const phoneDigits = /^[\d\s().+-]+$/.test(term) && digits.length >= 3 ? digits : "";
  const rows = await db().query(
    `select ${JOB_COLUMNS} from leads
     where (name ilike $1 or email ilike $1 or city ilike $1 or address ilike $1
            or ($2 <> '' and phone like '%' || $2 || '%'))
     order by stage_changed_at desc`,
    [likePattern(term), phoneDigits],
  );
  return rows.map(toJob);
}
```
Grep `listJobs(` across `app lib` and update any other caller to drop `includeLost`.

`lib/admin/links.ts`:
```ts
/** The board URL: keeps the search and the job list's filter, and optionally opens a job's panel. */
export function boardHref({ q, list, job }: { q?: string | null; list?: string | null; job?: string | null }): string {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set("q", q.trim());
  if (list) params.set("list", list);
  if (job) params.set("job", job);
  const query = params.toString().replace(/\+/g, "%20");
  return query ? `/admin?${query}` : "/admin";
}
```

`app/admin/JobCard.tsx`:
```ts
export function groupByStage(jobs: Job[], stages: readonly Stage[]) {
  return stages.map((stage) => ({
    stage,
    label: stageLabel(stage),
    jobs: jobs.filter((job) => job.status === stage),
  }));
}
```
and remove the now-unused `STAGES` import.

`app/admin/page.tsx`:
- searchParams type: `{ list?: string | string[]; job?: string | string[]; q?: string | string[] }`.
- Remove `includeLost`. Add `const list = first(params.list);` (validated in Task 5; for now pass it through as-is).
- `listJobs({ search: q })`.
- `const groups = groupByStage(jobs, BOARD_STAGES);` (import `BOARD_STAGES` from `@/lib/admin/stages`); delete `working`.
- `const here = { q, list };`
- In the search form replace the hidden `lost` input with `{list ? <input type="hidden" name="list" value={list} /> : null}`.
- Delete the Show/Hide lost `<Link>` and the whole `<nav aria-label="Stages">…</nav>` block.
- "Clear search" href: `boardHref({ list, job: openId })`.
- Wrap the columns `<div className="flex flex-col gap-4 md:flex-row …">` in `<section aria-label="Board">…</section>` (keep the inner div and its comment).
- Remove the `group.stage !== "lost"` condition around the add link (every board column has one).
- `STAGE_STYLE` import stays (columns use it).

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run --maxWorkers=2 tests/admin && npm run typecheck && npm run lint`
Expected: PASS. `grep -rn "lost: " app/admin lib/admin/links.ts` shows no `boardHref({ lost` callers.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/jobs.ts lib/admin/links.ts app/admin/JobCard.tsx app/admin/page.tsx tests/admin
git commit -m "feat: board shows current work only; drop stage tiles and the lost toggle"
```

---

### Task 5: The All jobs list with a stage dropdown

**Files:**
- Create: `app/admin/JobList.tsx`, `app/admin/SubmitOnChange.tsx`, `tests/admin/job-list.test.tsx`
- Modify: `lib/admin/stages.ts` (list filter helpers), `app/admin/page.tsx`
- Test: `tests/admin/stages.test.ts`, `tests/admin/board-page.test.tsx`

**Interfaces:**
- Consumes: `boardHref` (Task 4), `STAGES`, `STAGE_STYLE`, `stageLabel`, `isStage` (Task 1), `DaysInStage` from `app/admin/DaysInStage` (existing, props `{ job, now }`).
- Produces: `LIST_FILTERS: readonly { value: Stage | ""; label: string }[]`, `parseListFilter(value: string | undefined): Stage | null`, component `JobList({ jobs, now, filter, q, openId })`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/admin/stages.test.ts` (extend the import with `LIST_FILTERS, parseListFilter`):
```ts
describe("job list filter", () => {
  it("offers all jobs, every stage in order, then lost", () => {
    expect(LIST_FILTERS.map((f) => f.label)).toEqual([
      "All jobs", "New lead", "Appointment booked", "Quoted", "Sold", "Ordered", "Installed", "Completed", "Lost",
    ]);
    expect(LIST_FILTERS[0].value).toBe("");
  });

  it("reads a stage from the URL and treats anything else as all jobs", () => {
    expect(parseListFilter("completed")).toBe("completed");
    expect(parseListFilter("lost")).toBe("lost");
    expect(parseListFilter("nope")).toBeNull();
    expect(parseListFilter(undefined)).toBeNull();
  });
});
```

Create `tests/admin/job-list.test.tsx`:
```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { JobList } from "@/app/admin/JobList";
import type { Job } from "@/lib/admin/jobs";

const base: Job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date("2026-09-01T00:00:00Z"),
  name: "Dana Reyes", phone: "7025550134", email: null, address: null, city: "Henderson",
  treatments: [], windowCount: null, heardVia: null, notes: null, source: "contact",
  status: "completed", stageChangedAt: new Date("2026-09-07T00:00:00Z"), visitAt: null, quoteCents: null,
  soldCents: null, depositCents: null, brands: [], orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
};
const lost: Job = { ...base, id: "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d", name: "Chris Lane", city: "Las Vegas", status: "lost" };
const NOW = new Date("2026-09-10T00:00:00Z");

describe("JobList", () => {
  it("lists every job with its city, stage and time in stage, and counts them", () => {
    render(<JobList jobs={[base, lost]} now={NOW} filter={null} q="" openId={undefined} />);
    expect(screen.getByRole("heading", { name: "All jobs · 2" })).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Dana Reyes");
    expect(rows[0]).toHaveTextContent("Henderson");
    expect(rows[0]).toHaveTextContent("Completed");
    expect(rows[0]).toHaveTextContent("3 days");
    expect(rows[1]).toHaveTextContent("Lost");
  });

  it("links each row to its panel, keeping the search and filter", () => {
    render(<JobList jobs={[base]} now={NOW} filter="completed" q="reyes" openId={base.id} />);
    const link = screen.getByRole("link", { name: /dana reyes/i });
    expect(link).toHaveAttribute("href", `/admin?q=reyes&list=completed&job=${base.id}`);
    expect(link).toHaveAttribute("aria-current", "true");
  });

  it("has a stage dropdown in a GET form that keeps the search and open job", () => {
    render(<JobList jobs={[]} now={NOW} filter="lost" q="reyes" openId={base.id} />);
    const select = screen.getByLabelText("Stage");
    expect(select).toHaveValue("lost");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All jobs", "New lead", "Appointment booked", "Quoted", "Sold", "Ordered", "Installed", "Completed", "Lost",
    ]);
    const form = select.closest("form")!;
    expect(form).toHaveAttribute("action", "/admin");
    expect(form.querySelector('input[name="q"]')).toHaveValue("reyes");
    expect(form.querySelector('input[name="job"]')).toHaveValue(base.id);
    expect(within(form).getByRole("button", { name: "Show" })).toBeInTheDocument();
  });

  it("says when a stage has no jobs, and when a search matches none", () => {
    const { rerender } = render(<JobList jobs={[]} now={NOW} filter="completed" q="" openId={undefined} />);
    expect(screen.getByText("No jobs in this stage")).toBeInTheDocument();
    rerender(<JobList jobs={[]} now={NOW} filter={null} q="zzz" openId={undefined} />);
    expect(screen.getByText("No jobs match")).toBeInTheDocument();
  });
});
```

Append to `tests/admin/board-page.test.tsx` `describe("board look and conveniences")`:
```ts
  it("lists every job below the board and filters it by ?list", async () => {
    jobs.listJobs.mockResolvedValue([job, { ...jobB, status: "completed" }]);
    await open({});
    const list = screen.getByRole("region", { name: /all jobs/i });
    expect(within(list).getAllByRole("row")).toHaveLength(3);

    jobs.listJobs.mockResolvedValue([job, { ...jobB, status: "completed" }]);
    await open({ list: "completed" });
    const filtered = screen.getAllByRole("region", { name: /all jobs/i }).at(-1)!;
    expect(within(filtered).getAllByRole("row")).toHaveLength(2);
    expect(filtered).toHaveTextContent("Chris Lane");
  });

  it("treats an unknown ?list as all jobs", async () => {
    await open({ list: "bogus" });
    expect(screen.getByLabelText("Stage")).toHaveValue("");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run --maxWorkers=2 tests/admin/stages.test.ts tests/admin/job-list.test.tsx tests/admin/board-page.test.tsx`
Expected: FAIL (no `JobList`, no `LIST_FILTERS`).

- [ ] **Step 3: Implement**

`lib/admin/stages.ts` — append:
```ts
/** The job list's dropdown: all jobs, then every stage, then Lost. "" means all jobs. */
export const LIST_FILTERS: readonly { value: Stage | ""; label: string }[] = [
  { value: "", label: "All jobs" },
  ...ALL_STAGES.map((stage) => ({ value: stage, label: stageLabel(stage) })),
];

export const parseListFilter = (value: string | undefined): Stage | null => (isStage(value) ? value : null);
```

`app/admin/SubmitOnChange.tsx`:
```tsx
"use client";

/** A stage dropdown that submits its form when changed. The form's own button covers no-JS. */
export function SubmitOnChange({ id, name, defaultValue, children }: {
  id: string;
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className="min-h-11 rounded-lg border border-rule bg-ivory px-3 text-sm"
    >
      {children}
    </select>
  );
}
```

`app/admin/JobList.tsx`:
```tsx
import Link from "next/link";
import type { Job } from "@/lib/admin/jobs";
import { boardHref } from "@/lib/admin/links";
import { LIST_FILTERS, STAGE_STYLE, stageLabel, type Stage } from "@/lib/admin/stages";
import { DaysInStage } from "./DaysInStage";
import { SubmitOnChange } from "./SubmitOnChange";

/** The archive under the board: every job, filtered by one stage or none. */
export function JobList({ jobs, now, filter, q, openId }: {
  jobs: Job[];
  now: Date;
  filter: Stage | null;
  q: string;
  openId: string | undefined;
}) {
  return (
    <section aria-labelledby="job-list" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="job-list" className="text-lg font-semibold text-charcoal">All jobs · {jobs.length}</h2>
        <form action="/admin" className="flex items-center gap-2">
          <label htmlFor="list-stage" className="text-sm text-ink-soft">Stage</label>
          <SubmitOnChange id="list-stage" name="list" defaultValue={filter ?? ""}>
            {LIST_FILTERS.map((option) => (
              <option key={option.value || "all"} value={option.value}>{option.label}</option>
            ))}
          </SubmitOnChange>
          {q ? <input type="hidden" name="q" value={q} /> : null}
          {openId ? <input type="hidden" name="job" value={openId} /> : null}
          <button type="submit" className="sr-only">Show</button>
        </form>
      </div>

      {jobs.length ? (
        <div className="overflow-x-auto rounded-xl border border-rule bg-ivory shadow-sm">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-rule text-xs uppercase tracking-[0.1em] text-ink-soft">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                <th scope="col" className="px-4 py-3 font-medium">City</th>
                <th scope="col" className="px-4 py-3 font-medium">Stage</th>
                <th scope="col" className="px-4 py-3 font-medium">In stage</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const style = STAGE_STYLE[job.status];
                const selected = job.id === openId;
                return (
                  <tr key={job.id} className={`border-b border-rule last:border-0 ${selected ? "bg-sand/60" : "hover:bg-sand/30"}`}>
                    <td className="px-4 py-3">
                      <Link
                        href={boardHref({ q, list: filter, job: job.id })}
                        aria-current={selected ? "true" : undefined}
                        className="font-semibold text-charcoal underline-offset-4 hover:underline"
                      >
                        {job.name}
                      </Link>
                      {job.referredBy ? (
                        <span className="ml-2 rounded border border-champagne-ink px-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-champagne-ink">
                          Referral
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{job.city}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block border-l-[3px] ${style.left} pl-2 font-medium ${style.tint}`}>
                        {stageLabel(job.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs uppercase tracking-[0.1em] text-ink-soft">
                      <DaysInStage job={job} now={now} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-rule bg-ivory p-6 text-center text-sm text-ink-soft">
          {q ? "No jobs match" : "No jobs in this stage"}
        </p>
      )}
    </section>
  );
}
```
Check `app/admin/DaysInStage.tsx`'s props before using it; if it renders an icon or needs other props, match its actual signature (the card calls `<DaysInStage job={job} now={now} />`). If its text for 3 days is not "3 days", adjust the test expectation to its real output.

`app/admin/page.tsx`:
- `const filter = parseListFilter(first(params.list));` (replace the Task 4 `list` variable; import `parseListFilter`), and `const list = filter ?? undefined;` for `here` / hidden input / clear-search link, so an unknown value is dropped from links.
- After the Board section, render:
```tsx
        <JobList
          jobs={filter ? jobs.filter((job) => job.status === filter) : jobs}
          now={now}
          filter={filter}
          q={q}
          openId={openId}
        />
```
and import `JobList` from `./JobList`.
- Close-panel href: `boardHref(here)` (already, now with `list`).

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run --maxWorkers=2 tests/admin && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/stages.ts app/admin/JobList.tsx app/admin/SubmitOnChange.tsx app/admin/page.tsx tests/admin
git commit -m "feat: All jobs list under the board with a stage dropdown"
```

---

### Task 6: End-to-end and full verification

**Files:**
- Modify: `e2e/stages.spec.ts`; any e2e spec that clicks "Show lost" or the stage tiles (grep `e2e/` for `Show lost`, `lost=1`, `name: "Stages"`)

- [ ] **Step 1: Add the e2e test**

Append to `e2e/stages.spec.ts`:
```ts
test("completing an installed job moves it from the board to the list", async ({ page }) => {
  const id = await lead(`E2E Stages Complete ${STAMP}`);
  await sql()`update leads set status = 'installed' where id = ${id}`;
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);
  await page.getByLabel("More actions").click();
  await page.getByLabel("Set stage").selectOption("completed");
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Completed");

  await page.goto("/admin");
  const name = `E2E Stages Complete ${STAMP}`;
  await expect(page.getByRole("region", { name: "Board" }).getByText(name)).toHaveCount(0);
  await page.getByLabel("Stage", { exact: true }).selectOption("completed");
  await expect(page).toHaveURL(/list=completed/);
  await expect(page.getByRole("region", { name: /all jobs/i }).getByRole("link", { name })).toBeVisible();
});

test("the list shows lost jobs", async ({ page }) => {
  const id = await lead(`E2E Stages Lost ${STAMP}`);
  await sql()`update leads set status = 'lost' where id = ${id}`;
  await signIn(page);
  await page.goto("/admin?list=lost");
  await expect(page.getByRole("region", { name: /all jobs/i }).getByRole("link", { name: `E2E Stages Lost ${STAMP}` })).toBeVisible();
});
```
Before relying on it, read `app/admin/jobs/[id]/StageControls.tsx` to confirm how "Set stage" submits (select + button, or auto-submit). If it needs a button click after `selectOption`, add that click with the button's real name.

- [ ] **Step 2: Fix other e2e specs**

Grep `e2e/` for `Show lost`, `lost=1`, `"Stages"`. Replace any "Show lost" step with `page.goto("/admin?list=lost")`, and any board-card lookup that could now also match a list row with a lookup scoped to `page.getByRole("region", { name: "Board" })`.

- [ ] **Step 3: Full unit suite, typecheck, lint, build**

Run: `npx vitest run --maxWorkers=2 && npm run typecheck && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 4: E2E against a production build**

Apply migrations to the Neon test branch first: `MIGRATE_DATABASE_URL=<test branch url> node scripts/migrate.mjs` (never against production at this step). Then run Playwright against `next start` on 127.0.0.1 with `E2E_POSTGRES_URL` set to the test branch, per `playwright.config.ts`.
Expected: all specs PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "test: e2e for the Completed stage and the job list"
```

- [ ] **Step 6: Release (owner approval required)**

Ask the owner before touching production. Then: run `node scripts/migrate.mjs` against production (012 must be applied before the new code can save a Completed job), `npx vercel --prod`, and verify on premiershadesolutions.com/admin that the tiles are gone and the list and dropdown work.
