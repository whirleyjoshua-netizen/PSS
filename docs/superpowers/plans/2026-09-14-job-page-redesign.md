# Job Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/admin/jobs/<id>` as a job record: a header with actions and a stage stepper, then four tabs (Overview, Measurements, Files, Activity). The Overview has a stage-aware Next action card, a money strip and status cards.

**Architecture:**
- The page stays one async server component. It reads `?tab=` and `?edit=details` and renders the header plus only the chosen tab.
- New presentational components live beside it in `app/admin/jobs/[id]/`, all synchronous, with data passed down from the page.
- Pure logic goes in small modules with unit tests: `lib/admin/next-action.ts`, the date helpers in `lib/admin/time.ts`, `balanceCents` in `lib/admin/money.ts`, and `app/admin/jobs/[id]/tabs.ts`.
- No database changes, and no changes to the server actions.

**Tech Stack:** Next.js App Router (this repo's version, where `params` and `searchParams` are Promises), React 19, Tailwind v4 tokens from `app/globals.css`, Vitest with Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-14-job-page-redesign-design.md`

## Global Constraints

- **Precondition:** the call-flow branch `callflow` is merged into `main` before Task 1. This plan uses its `CallButton({ jobId, name, phone })`, `budgetLabel` from `lib/admin/budget.ts`, and `Job.budgetTier`.
- **Files not to touch:** `lib/admin/stages.ts` (the calendar session is changing `STAGE_STYLE`), `app/admin/jobs/actions.ts`, `app/admin/JobPanel.tsx`, `app/admin/AdminNav.tsx`, the DB migrations and the schema.
- **Colors:** use tokens only (charcoal, ivory, sand, taupe, champagne, `champagne-ink`, `rule`, `ink-soft`, `stage-*`). No color literals. `stage-*` colors are for fills, edges and icons, never text. Champagne fills carry charcoal text.
- **Tailwind classes** must be complete literals, never built by concatenation.
- **Times** are Las Vegas time, via `lib/admin/time.ts`.
- **Screen widths:** everything works at 400px wide. Only the measurements table scrolls sideways, inside its own `overflow-x-auto` container.
- **Tests:** run with `npx vitest run --maxWorkers=2 <files>`, and the full suite with `npx vitest run --maxWorkers=2`.
- **Commit trailers:** every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WGzHiF7WZrKhK7svY3yqxy
  ```

## File Map

| File | Responsibility |
|---|---|
| `lib/admin/time.ts` (modify) | Add `formatShortDate`, `formatDateOnly`, `formatTime`, `daysBetween`, `dayLabel` |
| `lib/admin/money.ts` (modify) | Add `balanceCents` |
| `lib/admin/next-action.ts` (new) | `nextAction()`, `editDetailsHref()` |
| `app/admin/jobs/[id]/tabs.ts` (new) | `JOB_TABS`, `parseJobTab`, `firstParam`, `tabHref` |
| `app/admin/jobs/[id]/ui.ts` (new) | Shared card, heading and link class strings |
| `app/admin/jobs/[id]/JobTabs.tsx` (new) | The tab bar |
| `app/admin/jobs/[id]/StageStepper.tsx` (new) | The 7-stage stepper |
| `app/admin/jobs/[id]/StageControls.tsx` (modify) | Optional `parts` prop |
| `app/admin/jobs/[id]/EventList.tsx` (new) | Timeline grouped by day |
| `app/admin/jobs/[id]/MoneyStrip.tsx` (new) | Quote, Sold, Deposit and Balance |
| `app/admin/jobs/[id]/NextActionCard.tsx` (new) | The Next action card |
| `app/admin/jobs/[id]/MeasurementsTab.tsx` (new) | The measurements table |
| `app/admin/jobs/[id]/JobFiles.tsx` (modify) | Optional `showMeasurements` prop |
| `app/admin/jobs/[id]/measure/page.tsx`, `measure/[windowId]/page.tsx`, `measure/MeasureForm.tsx` (modify) | Return to `?tab=measurements` |
| `app/admin/jobs/[id]/JobHeader.tsx` (new) | Name, chip, action row, More menu, lost banner, stepper |
| `app/admin/jobs/[id]/OverviewCards.tsx` (new) | `CustomerCard`, `ProjectCard`, `StatusCard` |
| `app/admin/jobs/[id]/OverviewTab.tsx` (new) | The Overview grid and edit mode |
| `app/admin/jobs/[id]/ActivityTab.tsx` (new) | Note form plus the full timeline |
| `app/admin/jobs/[id]/page.tsx` (rewrite) | Load data; render the header, tabs and chosen tab |
| `e2e/admin.spec.ts` (modify) | Flows follow the new layout |

---

### Task 0: Workspace and baseline

**Files:** none

- [ ] **Step 1: Confirm the call flow is merged.** Run `git log --oneline main | Select-String "budget tier"` and check that `app/admin/jobs/[id]/CallButton.tsx` exists on `main`. If it doesn't, stop and report; this plan must not start before the call flow lands.
- [ ] **Step 2: Create the worktree.** Run `git worktree add .claude/worktrees/jobpage -b jobpage main`, then `npm ci` inside it. Before editing anything, confirm with `git -C .claude/worktrees/jobpage branch --show-current` that the output is `jobpage`, and do all later work there.
- [ ] **Step 3: Run the baseline.** Run `npx vitest run --maxWorkers=2`. Expected: all pass. Record the count.
- [ ] **Step 4: Read what the call flow left on the job page:**
  - `app/admin/jobs/[id]/CallButton.tsx`, to confirm the props `{ jobId, name, phone }`.
  - `tests/admin/job-page-summary.test.tsx`, which renders `JobPage` and asserts a Budget row. Task 10 replaces it. Note its `vi.mock` list; Task 10's page test reuses it.

---

### Task 1: Date and money helpers

**Files:**
- Modify: `lib/admin/time.ts` (append), `lib/admin/money.ts` (append)
- Test: `tests/admin/time.test.ts` (append a `describe` block; create the file if it is absent), `tests/admin/money.test.ts` (append; create if absent)

**Interfaces:**
- Produces:
  - `formatShortDate(date: Date): string`, e.g. `"Sep 11, 2026"`
  - `formatDateOnly(ymd: string): string`, e.g. `"Oct 12, 2026"`
  - `formatTime(date: Date): string`, e.g. `"10:31 AM"`
  - `daysBetween(from: Date, now: Date): number` (Las Vegas calendar days, never negative)
  - `dayLabel(date: Date, now: Date): string`: `"Today"`, `"Yesterday"`, `"Sep 11"` or `"Dec 30, 2025"`
  - `balanceCents(sold: number | null, deposit: number | null): number | null`

- [ ] **Step 1: Write the failing tests**

Append to `tests/admin/time.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dayLabel, daysBetween, formatDateOnly, formatShortDate, formatTime } from "@/lib/admin/time";

describe("job page date helpers", () => {
  const now = new Date("2026-09-14T18:00:00Z"); // 11:00 AM Sep 14 in Las Vegas

  it("formats a short date in Las Vegas time", () => {
    expect(formatShortDate(new Date("2026-09-11T18:00:00Z"))).toBe("Sep 11, 2026");
  });

  it("formats a date-only value without shifting the day", () => {
    expect(formatDateOnly("2026-10-12")).toBe("Oct 12, 2026");
  });

  it("formats a clock time in Las Vegas time", () => {
    expect(formatTime(new Date("2026-09-14T17:31:00Z"))).toMatch(/^10:31\sAM$/);
  });

  it("counts Las Vegas calendar days, not 24-hour spans", () => {
    expect(daysBetween(new Date("2026-09-11T18:00:00Z"), now)).toBe(3);
    // 11:30 PM Sep 13 → 1:00 AM Sep 14 is one calendar day
    expect(daysBetween(new Date("2026-09-14T06:30:00Z"), new Date("2026-09-14T08:00:00Z"))).toBe(1);
    expect(daysBetween(now, now)).toBe(0);
  });

  it("labels days relative to now", () => {
    expect(dayLabel(new Date("2026-09-14T17:31:00Z"), now)).toBe("Today");
    expect(dayLabel(new Date("2026-09-13T23:16:00Z"), now)).toBe("Yesterday");
    expect(dayLabel(new Date("2026-09-11T18:00:00Z"), now)).toBe("Sep 11");
    expect(dayLabel(new Date("2025-12-30T20:00:00Z"), now)).toBe("Dec 30, 2025");
  });
});
```

Append to `tests/admin/money.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { balanceCents } from "@/lib/admin/money";

describe("balanceCents", () => {
  it("is sold minus deposit", () => {
    expect(balanceCents(500000, 250000)).toBe(250000);
  });
  it("treats a missing deposit as zero", () => {
    expect(balanceCents(500000, null)).toBe(500000);
  });
  it("is null until there is a sale", () => {
    expect(balanceCents(null, 100000)).toBeNull();
  });
});
```

If either file already exists with its own imports, merge the import lines rather than duplicating them.

- [ ] **Step 2: Run the tests to verify they fail.** Run `npx vitest run --maxWorkers=2 tests/admin/time.test.ts tests/admin/money.test.ts`. Expected: FAIL, because the exports are not found.

- [ ] **Step 3: Implement**

Append to `lib/admin/time.ts`:

```ts
const DAY_MS = 86_400_000;
/** Noon UTC on a YYYY-MM-DD date, so date arithmetic never crosses a day boundary. */
const noonUtc = (ymd: string) => new Date(`${ymd}T12:00:00Z`);

/** "Sep 11, 2026" in Las Vegas time. */
export const formatShortDate = (date: Date): string =>
  date.toLocaleDateString("en-US", { timeZone: ZONE, month: "short", day: "numeric", year: "numeric" });

/** A date-only column value ("2026-10-12") as "Oct 12, 2026", with no time-zone shift. */
export const formatDateOnly = (ymd: string): string =>
  noonUtc(ymd).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

/** "10:31 AM" in Las Vegas time. */
export const formatTime = (date: Date): string =>
  date.toLocaleTimeString("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" });

/** Whole Las Vegas calendar days from `from` to `now`; never negative. */
export const daysBetween = (from: Date, now: Date): number =>
  Math.max(0, Math.round((noonUtc(lasVegasDate(now)).getTime() - noonUtc(lasVegasDate(from)).getTime()) / DAY_MS));

/** "Today", "Yesterday", "Sep 11", or "Dec 30, 2025" when not this year. */
export function dayLabel(date: Date, now: Date): string {
  const days = daysBetween(date, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const sameYear = lasVegasDate(date).slice(0, 4) === lasVegasDate(now).slice(0, 4);
  return date.toLocaleDateString("en-US", {
    timeZone: ZONE, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" as const }),
  });
}
```

Append to `lib/admin/money.ts`:

```ts
/** What the customer still owes: sold minus deposit, or null before there is a sale. */
export const balanceCents = (sold: number | null, deposit: number | null): number | null =>
  sold === null ? null : sold - (deposit ?? 0);
```

- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/time.ts lib/admin/money.ts tests/admin/time.test.ts tests/admin/money.test.ts
git commit -m "feat: date and balance helpers for the job page"
```

(Add the trailers from Global Constraints to every commit.)

---

### Task 2: Next action logic

**Files:**
- Create: `lib/admin/next-action.ts`
- Test: `tests/admin/next-action.test.ts`

**Interfaces:**
- Consumes: `balanceCents`, `formatCents` (`lib/admin/money.ts`); `type Job` (`lib/admin/jobs.ts`, type-only import).
- Produces:
  - `type NextActionCta = { kind: "call" } | { kind: "link"; label: string; href: string }`
  - `type NextAction = { title: string; detail: string; cta: NextActionCta | null }`
  - `nextAction(job: Pick<Job, "id" | "status" | "soldCents" | "depositCents">, measurementCount: number): NextAction | null`
  - `editDetailsHref(jobId: string, anchor?: string): string`, which returns `/admin/jobs/<id>?tab=overview&edit=details` plus `#<anchor>` when an anchor is given

- [ ] **Step 1: Write the failing test**

`tests/admin/next-action.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { editDetailsHref, nextAction } from "@/lib/admin/next-action";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const EDIT = `/admin/jobs/${ID}?tab=overview&edit=details`;
const job = (status: string, soldCents: number | null = null, depositCents: number | null = null) =>
  ({ id: ID, status, soldCents, depositCents }) as Parameters<typeof nextAction>[0];

describe("editDetailsHref", () => {
  it("opens the details form, optionally at a field", () => {
    expect(editDetailsHref(ID)).toBe(EDIT);
    expect(editDetailsHref(ID, "visitAt")).toBe(`${EDIT}#visitAt`);
  });
});

describe("nextAction", () => {
  it("calls a new lead", () => {
    expect(nextAction(job("new"), 0)).toMatchObject({ title: "Call the customer", cta: { kind: "call" } });
  });
  it("books the visit once contacted", () => {
    expect(nextAction(job("contacted"), 0)).toMatchObject({
      title: "Book the consultation", cta: { kind: "link", label: "Book visit", href: `${EDIT}#visitAt` },
    });
  });
  it("measures a booked visit with no measurements", () => {
    expect(nextAction(job("visit_booked"), 0)).toMatchObject({
      title: "Measure the windows", cta: { label: "Add measurement", href: `/admin/jobs/${ID}/measure` },
    });
  });
  it("quotes a booked visit once measured", () => {
    expect(nextAction(job("visit_booked"), 3)).toMatchObject({
      title: "Send the quote", cta: { label: "Enter quote", href: EDIT },
    });
  });
  it("follows up a quote", () => {
    expect(nextAction(job("quoted"), 0)).toMatchObject({ title: "Follow up and close", cta: { label: "Enter sold amount" } });
  });
  it("orders a sold job", () => {
    expect(nextAction(job("sold"), 0)).toMatchObject({ title: "Order the product", cta: { label: "Set order date" } });
  });
  it("schedules an ordered job", () => {
    expect(nextAction(job("ordered"), 0)).toMatchObject({ title: "Schedule the install", cta: { label: "Set install date" } });
  });
  it("collects an installed job's balance", () => {
    expect(nextAction(job("installed", 500000, 250000), 0)).toMatchObject({
      title: "Collect the balance", detail: "$2,500 left to collect.", cta: { label: "Record payment", href: EDIT },
    });
  });
  it("is complete when installed with nothing owed", () => {
    expect(nextAction(job("installed", 500000, 500000), 0)).toMatchObject({ title: "Job complete", cta: null });
    expect(nextAction(job("installed"), 0)).toMatchObject({ title: "Job complete", cta: null });
  });
  it("has no action for a lost job", () => {
    expect(nextAction(job("lost"), 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run `npx vitest run --maxWorkers=2 tests/admin/next-action.test.ts`. Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement**

`lib/admin/next-action.ts`:

```ts
import type { Job } from "./jobs";
import { balanceCents, formatCents } from "./money";

export type NextActionCta = { kind: "call" } | { kind: "link"; label: string; href: string };
export type NextAction = { title: string; detail: string; cta: NextActionCta | null };

/** The Overview in edit mode, optionally scrolled to one field of the details form. */
export const editDetailsHref = (jobId: string, anchor?: string): string =>
  `/admin/jobs/${jobId}?tab=overview&edit=details${anchor ? `#${anchor}` : ""}`;

const link = (label: string, href: string): NextActionCta => ({ kind: "link", label, href });

/**
 * The one thing to do next at each stage. It only points at screens and
 * fields that exist; moving the stage stays a separate, manual step.
 */
export function nextAction(
  job: Pick<Job, "id" | "status" | "soldCents" | "depositCents">,
  measurementCount: number,
): NextAction | null {
  const edit = editDetailsHref(job.id);
  switch (job.status) {
    case "new":
      return { title: "Call the customer", detail: "Learn what they want and book a visit.", cta: { kind: "call" } };
    case "contacted":
      return { title: "Book the consultation", detail: "Set a date for the in-home visit and measure.", cta: link("Book visit", editDetailsHref(job.id, "visitAt")) };
    case "visit_booked":
      return measurementCount === 0
        ? { title: "Measure the windows", detail: "Record each window at the visit.", cta: link("Add measurement", `/admin/jobs/${job.id}/measure`) }
        : { title: "Send the quote", detail: "Enter the quote, then move the job to Quoted.", cta: link("Enter quote", edit) };
    case "quoted":
      return { title: "Follow up and close", detail: "Enter the sold amount once they say yes.", cta: link("Enter sold amount", edit) };
    case "sold":
      return { title: "Order the product", detail: "Enter the order date once it's placed.", cta: link("Set order date", edit) };
    case "ordered":
      return { title: "Schedule the install", detail: "Set the install date once the product arrives.", cta: link("Set install date", edit) };
    case "installed": {
      const balance = balanceCents(job.soldCents, job.depositCents);
      return balance !== null && balance > 0
        ? { title: "Collect the balance", detail: `${formatCents(balance)} left to collect.`, cta: link("Record payment", edit) }
        : { title: "Job complete", detail: "Nothing left to do on this job.", cta: null };
    }
    case "lost":
      return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/next-action.ts tests/admin/next-action.test.ts
git commit -m "feat: stage-aware next action for jobs"
```

---

### Task 3: Tabs, shared classes and the tab bar

**Files:**
- Create: `app/admin/jobs/[id]/tabs.ts`, `app/admin/jobs/[id]/ui.ts`, `app/admin/jobs/[id]/JobTabs.tsx`
- Test: `tests/admin/job-tabs.test.tsx`

**Interfaces:**
- Produces:
  - `JOB_TABS` (value/label pairs), `type JobTab = "overview" | "measurements" | "files" | "activity"`
  - `parseJobTab(value: string | string[] | undefined): JobTab`
  - `firstParam(value: string | string[] | undefined): string | undefined`
  - `tabHref(jobId: string, tab: JobTab): string`: overview is `/admin/jobs/<id>`; the others are `/admin/jobs/<id>?tab=<tab>`
  - `JobTabs({ jobId, active, counts }: { jobId: string; active: JobTab; counts: Partial<Record<JobTab, number>> })`
  - From `ui.ts`: `CARD`, `HEADING`, `TEXT_LINK`, `ACTION_LINK` (string constants)

- [ ] **Step 1: Write the failing test**

`tests/admin/job-tabs.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { firstParam, parseJobTab, tabHref } from "@/app/admin/jobs/[id]/tabs";
import { JobTabs } from "@/app/admin/jobs/[id]/JobTabs";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

describe("parseJobTab", () => {
  it("accepts each tab", () => {
    for (const tab of ["overview", "measurements", "files", "activity"]) expect(parseJobTab(tab)).toBe(tab);
  });
  it("falls back to overview for missing or unknown values", () => {
    expect(parseJobTab(undefined)).toBe("overview");
    expect(parseJobTab("quote")).toBe("overview");
    expect(parseJobTab(["files", "activity"])).toBe("files");
  });
  it("takes the first of repeated params", () => {
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam("a")).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });
  it("links overview without a param", () => {
    expect(tabHref(ID, "overview")).toBe(`/admin/jobs/${ID}`);
    expect(tabHref(ID, "files")).toBe(`/admin/jobs/${ID}?tab=files`);
  });
});

describe("JobTabs", () => {
  it("marks the active tab and shows counts", () => {
    render(<JobTabs jobId={ID} active="files" counts={{ measurements: 3, files: 2 }} />);
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent("Files");
    expect(screen.getByRole("link", { name: /Measurements/ })).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("href", `/admin/jobs/${ID}?tab=activity`);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run `npx vitest run --maxWorkers=2 tests/admin/job-tabs.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`app/admin/jobs/[id]/tabs.ts`:

```ts
export const JOB_TABS = [
  { value: "overview", label: "Overview" },
  { value: "measurements", label: "Measurements" },
  { value: "files", label: "Files" },
  { value: "activity", label: "Activity" },
] as const;

export type JobTab = (typeof JOB_TABS)[number]["value"];

export const firstParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** The tab in `?tab=`; anything missing or unknown shows the Overview. */
export function parseJobTab(value: string | string[] | undefined): JobTab {
  const tab = firstParam(value);
  return JOB_TABS.some((t) => t.value === tab) ? (tab as JobTab) : "overview";
}

export const tabHref = (jobId: string, tab: JobTab): string =>
  tab === "overview" ? `/admin/jobs/${jobId}` : `/admin/jobs/${jobId}?tab=${tab}`;
```

`app/admin/jobs/[id]/ui.ts`:

```ts
/** Class strings shared by the job page's cards, so every card reads the same. */
export const CARD = "flex flex-col gap-4 border border-rule bg-ivory p-5";
export const HEADING = "font-display text-xs uppercase tracking-[0.2em] text-champagne-ink";
export const TEXT_LINK = "text-sm underline underline-offset-4";
export const ACTION_LINK =
  "inline-flex min-h-11 items-center justify-center gap-2 border border-charcoal px-4 text-sm text-charcoal hover:bg-charcoal hover:text-ivory";
```

`app/admin/jobs/[id]/JobTabs.tsx`:

```tsx
import Link from "next/link";
import { JOB_TABS, tabHref, type JobTab } from "./tabs";

export function JobTabs({ jobId, active, counts }: {
  jobId: string;
  active: JobTab;
  counts: Partial<Record<JobTab, number>>;
}) {
  return (
    <nav aria-label="Job sections" className="overflow-x-auto border-b border-rule">
      <ul className="flex gap-6">
        {JOB_TABS.map((tab) => {
          const current = tab.value === active;
          const count = counts[tab.value];
          return (
            <li key={tab.value}>
              <Link
                href={tabHref(jobId, tab.value)}
                aria-current={current ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 text-sm ${
                  current ? "border-charcoal font-semibold text-charcoal" : "border-transparent text-ink-soft hover:text-charcoal"
                }`}
              >
                {tab.label}
                {count !== undefined ? <span className="text-xs text-ink-soft">{count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/jobs/[id]/tabs.ts" "app/admin/jobs/[id]/ui.ts" "app/admin/jobs/[id]/JobTabs.tsx" tests/admin/job-tabs.test.tsx
git commit -m "feat: job page tabs"
```

---

### Task 4: Stage stepper and StageControls parts

**Files:**
- Create: `app/admin/jobs/[id]/StageStepper.tsx`
- Modify: `app/admin/jobs/[id]/StageControls.tsx`
- Test: `tests/admin/stage-stepper.test.tsx`; add cases to `tests/admin/job-page.test.tsx`

**Interfaces:**
- Consumes: `STAGES`, `STAGE_STYLE`, `type Stage`, `type WorkingStage` from `lib/admin/stages.ts` (read only).
- Produces:
  - `StageStepper({ status }: { status: Stage })`: an `<ol aria-label="Stage">`. Each `<li>` has `data-state` set to `"done"`, `"current"` or `"upcoming"`, and the current one has `aria-current="step"`.
  - `type StagePart = "status" | "move" | "set" | "lost"` and `StageControls({ job, parts }: { job: Job; parts?: readonly StagePart[] })`. The default shows all four parts.

- [ ] **Step 1: Write the failing tests**

`tests/admin/stage-stepper.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StageStepper } from "@/app/admin/jobs/[id]/StageStepper";

const states = () => screen.getAllByRole("listitem").map((li) => li.getAttribute("data-state"));

describe("StageStepper", () => {
  it("shows all seven stages with done, current and upcoming", () => {
    render(<StageStepper status="contacted" />);
    expect(screen.getByRole("list", { name: "Stage" })).toBeInTheDocument();
    expect(states()).toEqual(["done", "current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Contacted");
  });

  it("marks every earlier stage done at installed", () => {
    render(<StageStepper status="installed" />);
    expect(states()).toEqual(["done", "done", "done", "done", "done", "done", "current"]);
  });

  it("greys out and has no current step when lost", () => {
    render(<StageStepper status="lost" />);
    expect(screen.queryByRole("listitem", { current: "step" })).toBeNull();
    expect(screen.getByRole("list", { name: "Stage" }).className).toContain("opacity-50");
  });
});
```

Add to `tests/admin/job-page.test.tsx`, inside `describe("job page")`:

```tsx
  it("renders only the requested stage-control parts", () => {
    render(<StageControls job={job} parts={["set", "lost"]} />);
    expect(screen.queryByRole("button", { name: /^Move to/ })).toBeNull();
    expect(screen.queryByText("Stage:")).toBeNull();
    expect(screen.getByLabelText("Set stage")).toBeInTheDocument();
    expect(screen.getByLabelText(/mark lost/i)).toBeInTheDocument();
  });

  it("still renders every stage-control part by default", () => {
    render(<StageControls job={job} />);
    expect(screen.getByText("Stage:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to Sold" })).toBeInTheDocument();
    expect(screen.getByLabelText("Set stage")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail.** Run `npx vitest run --maxWorkers=2 tests/admin/stage-stepper.test.tsx tests/admin/job-page.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`app/admin/jobs/[id]/StageStepper.tsx`:

```tsx
import { Icon } from "@/components/admin/icons";
import { STAGES, STAGE_STYLE, type Stage, type WorkingStage } from "@/lib/admin/stages";

/** Fill for done and current steps. Complete literals so Tailwind generates them. */
const FILL: Record<WorkingStage, string> = {
  new: "bg-stage-new",
  contacted: "bg-stage-contacted",
  visit_booked: "bg-stage-visit",
  quoted: "bg-stage-quoted",
  sold: "bg-stage-sold",
  ordered: "bg-stage-ordered",
  installed: "bg-stage-installed",
};

export function StageStepper({ status }: { status: Stage }) {
  const lost = status === "lost";
  const currentIndex = STAGES.findIndex((stage) => stage.value === status);

  return (
    <ol aria-label="Stage" className={`flex overflow-x-auto pb-1 ${lost ? "opacity-50" : ""}`}>
      {STAGES.map((stage, index) => {
        const done = !lost && index < currentIndex;
        const current = !lost && index === currentIndex;
        return (
          <li
            key={stage.value}
            aria-current={current ? "step" : undefined}
            data-state={done ? "done" : current ? "current" : "upcoming"}
            className="relative flex min-w-12 flex-1 flex-col items-center gap-2 text-center"
          >
            {index > 0 ? (
              <span aria-hidden="true" className={`absolute right-1/2 top-3.5 h-0.5 w-full ${done || current ? "bg-charcoal" : "bg-rule"}`} />
            ) : null}
            <span
              aria-hidden="true"
              className={`relative flex size-7 items-center justify-center rounded-full border-2 text-xs ${
                done || current ? `border-transparent text-ivory ${FILL[stage.value]}` : "border-rule bg-ivory text-ink-soft"
              }`}
            >
              {done ? "✓" : current ? <Icon name={STAGE_STYLE[stage.value].icon} className="size-3.5" /> : null}
            </span>
            <span className={`text-xs ${current ? "font-semibold text-charcoal" : "text-ink-soft max-sm:sr-only"}`}>
              {stage.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
```

`app/admin/jobs/[id]/StageControls.tsx`: add the `parts` prop and wrap each block. The full new file:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/admin/icons";
import type { Job } from "@/lib/admin/jobs";
import { ALL_STAGES, nextStage, stageLabel } from "@/lib/admin/stages";
import { markLost, moveStage, type FormState } from "../actions";

export type StagePart = "status" | "move" | "set" | "lost";
const ALL_PARTS: readonly StagePart[] = ["status", "move", "set", "lost"];

/**
 * The stage line, next-stage button, set-stage select and mark-lost form.
 * The board's side panel shows all four; the job page splits them between
 * the Next action card and the header's More menu.
 */
export function StageControls({ job, parts = ALL_PARTS }: { job: Job; parts?: readonly StagePart[] }) {
  const show = (part: StagePart) => parts.includes(part);
  const next = nextStage(job.status);
  const [lostState, lostAction, losing] = useActionState<FormState, FormData>(
    markLost.bind(null, job.id),
    {},
  );

  return (
    <div className="flex flex-col gap-4">
      {show("status") ? (
        <p className="text-sm text-ink-soft">
          Stage: <span className="font-display text-charcoal">{stageLabel(job.status)}</span>
          {job.lostReason ? ` — ${job.lostReason}` : null}
        </p>
      ) : null}

      {show("move") && next ? (
        <form action={moveStage.bind(null, job.id, next)}>
          <Button type="submit" variant="solid" className="w-full gap-2">
            <Icon name="arrow" className="size-4" />
            Move to {stageLabel(next)}
          </Button>
        </form>
      ) : null}

      {show("set") ? (
        <form
          action={async (formData) => {
            const to = formData.get("stage");
            if (typeof to === "string" && to !== job.status) await moveStage(job.id, to as Job["status"]);
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <label htmlFor="set-stage" className="flex flex-col gap-1 text-sm">
            Set stage
            <select id="set-stage" name="stage" defaultValue={job.status} className="min-h-11 border border-rule bg-ivory px-3">
              {ALL_STAGES.filter((stage) => stage !== "lost").map((stage) => (
                <option key={stage} value={stage}>{stageLabel(stage)}</option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline">Set</Button>
        </form>
      ) : null}

      {show("lost") && job.status !== "lost" ? (
        <form
          key={lostState.values ? JSON.stringify(lostState.values) : "initial"}
          action={lostAction}
          className="flex flex-wrap items-end gap-3"
        >
          <label htmlFor="lost-reason" className="flex flex-1 flex-col gap-1 text-sm">
            Mark lost — reason
            <input
              id="lost-reason"
              name="reason"
              defaultValue={typeof lostState.values?.reason === "string" ? lostState.values.reason : ""}
              className="min-h-11 border border-rule bg-ivory px-3"
            />
          </label>
          <Button type="submit" variant="outline" disabled={losing}>Mark lost</Button>
          {lostState.error ? <p role="alert" className="w-full text-sm">{lostState.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass.** Run the same files plus `tests/admin/job-panel.test.tsx`, which must still pass unchanged. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/jobs/[id]/StageStepper.tsx" "app/admin/jobs/[id]/StageControls.tsx" tests/admin/stage-stepper.test.tsx tests/admin/job-page.test.tsx
git commit -m "feat: stage stepper and splittable stage controls"
```

---

### Task 5: Event timeline

**Files:**
- Create: `app/admin/jobs/[id]/EventList.tsx`
- Test: `tests/admin/event-list.test.tsx`

**Interfaces:**
- Consumes: `dayLabel`, `formatTime` (Task 1); `stageLabel`; `type JobEvent`.
- Produces: `EventList({ events, now }: { events: JobEvent[]; now: Date })`. It groups events by consecutive `dayLabel` under an `h3` per day. A stage event renders its "From → To" text as a single text node.

- [ ] **Step 1: Write the failing test**

`tests/admin/event-list.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { JobEvent } from "@/lib/admin/jobs";
import { EventList } from "@/app/admin/jobs/[id]/EventList";

const now = new Date("2026-09-14T18:00:00Z");
const event = (id: string, iso: string, extra: Partial<JobEvent>): JobEvent => ({
  id, createdAt: new Date(iso), actor: "joshua@example.com", kind: "note", fromStatus: null, toStatus: null, body: null, ...extra,
});

describe("EventList", () => {
  it("groups events under Today, Yesterday and a date", () => {
    render(<EventList now={now} events={[
      event("1", "2026-09-14T17:31:00Z", { kind: "stage", fromStatus: "new", toStatus: "contacted" }),
      event("2", "2026-09-14T17:16:00Z", { body: "Call back after 5pm" }),
      event("3", "2026-09-13T23:16:00Z", { kind: "email", body: "Email sent" }),
      event("4", "2026-09-11T18:00:00Z", { body: "Lead created" }),
    ]} />);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Today", "Yesterday", "Sep 11"]);
    expect(screen.getByText("New lead → Contacted")).toBeInTheDocument();
    expect(screen.getByText("Call back after 5pm")).toBeInTheDocument();
    expect(screen.getAllByText(/^10:31\sAM$/)).toHaveLength(1);
  });

  it("says so when there is no activity", () => {
    render(<EventList now={now} events={[]} />);
    expect(screen.getByText("No activity yet.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run `npx vitest run --maxWorkers=2 tests/admin/event-list.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`app/admin/jobs/[id]/EventList.tsx`:

```tsx
import type { JobEvent } from "@/lib/admin/jobs";
import { stageLabel } from "@/lib/admin/stages";
import { dayLabel, formatTime } from "@/lib/admin/time";

/** The job's events, newest first, grouped by Las Vegas day. */
export function EventList({ events, now }: { events: JobEvent[]; now: Date }) {
  if (events.length === 0) return <p className="text-sm text-ink-soft">No activity yet.</p>;

  const groups: { label: string; events: JobEvent[] }[] = [];
  for (const event of events) {
    const label = dayLabel(event.createdAt, now);
    const last = groups.at(-1);
    if (last?.label === label) last.events.push(event);
    else groups.push({ label, events: [event] });
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{group.label}</h3>
          <ol className="flex flex-col gap-3 border-l border-rule pl-4 text-sm">
            {group.events.map((event) => (
              <li key={event.id} className="grid grid-cols-[4.5rem_1fr] gap-x-3">
                <span className="text-xs text-ink-soft">{formatTime(event.createdAt)}</span>
                <div className="flex min-w-0 flex-col gap-1">
                  {event.kind === "stage" && event.toStatus ? (
                    <p className="flex flex-wrap items-center gap-2">
                      <span>Moved the job</span>
                      <span className="border border-rule bg-sand px-2 py-0.5 text-xs">
                        {`${event.fromStatus ? `${stageLabel(event.fromStatus)} → ` : ""}${stageLabel(event.toStatus)}`}
                      </span>
                    </p>
                  ) : (
                    <p className="whitespace-pre-line text-charcoal">{event.body}</p>
                  )}
                  {event.kind === "stage" && event.body ? <p className="text-ink-soft">{event.body}</p> : null}
                  <p className="text-xs text-ink-soft">{event.actor}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/jobs/[id]/EventList.tsx" tests/admin/event-list.test.tsx
git commit -m "feat: activity timeline grouped by day"
```

---

### Task 6: Money strip and Next action card

**Files:**
- Create: `app/admin/jobs/[id]/MoneyStrip.tsx`, `app/admin/jobs/[id]/NextActionCard.tsx`
- Test: `tests/admin/overview-money-next.test.tsx`

**Interfaces:**
- Consumes: `balanceCents`, `formatCents`; `nextAction`; `CallButton`; `StageControls` with `parts={["move"]}`; `ButtonLink` from `components/ui/Button`; `CARD`, `HEADING`, `TEXT_LINK`.
- Produces:
  - `MoneyStrip({ job, editHref }: { job: Pick<Job, "quoteCents" | "soldCents" | "depositCents">; editHref: string })`, a `<section aria-label="Money">`.
  - `NextActionCard({ job, measurementCount }: { job: Job; measurementCount: number })`, which renders nothing for a lost job.

- [ ] **Step 1: Write the failing test**

`tests/admin/overview-money-next.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

vi.mock("@/app/admin/jobs/actions", () => ({ moveStage: vi.fn(), markLost: vi.fn(async () => ({})) }));
const { MoneyStrip } = await import("@/app/admin/jobs/[id]/MoneyStrip");
const { NextActionCard } = await import("@/app/admin/jobs/[id]/NextActionCard");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const EDIT = `/admin/jobs/${ID}?tab=overview&edit=details`;
const job: Job = {
  id: ID, createdAt: new Date(), name: "Dana Reyes", phone: "7025550134", email: null, address: null,
  city: "Henderson", treatments: [], windowCount: null, heardVia: null, notes: null, source: "phone",
  status: "contacted", stageChangedAt: new Date(), visitAt: null, quoteCents: null, soldCents: null,
  depositCents: null, brands: [], orderedOn: null, installOn: null, lostReason: null, referralCode: null,
  referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false, budgetTier: null,
};

describe("MoneyStrip", () => {
  it("collapses to a prompt before there is a quote", () => {
    render(<MoneyStrip job={job} editHref={EDIT} />);
    const money = screen.getByRole("region", { name: "Money" });
    expect(within(money).getByText("No quote yet.")).toBeInTheDocument();
    expect(within(money).getByRole("link", { name: "Add quote" })).toHaveAttribute("href", EDIT);
  });

  it("shows the balance as sold minus deposit", () => {
    render(<MoneyStrip job={{ quoteCents: 520000, soldCents: 500000, depositCents: 250000 }} editHref={EDIT} />);
    const balance = screen.getByText("Balance").closest("div")!;
    expect(balance).toHaveTextContent("$2,500");
    expect(screen.getByText("Quote").closest("div")).toHaveTextContent("$5,200");
  });

  it("shows no balance before a sale", () => {
    render(<MoneyStrip job={{ quoteCents: 520000, soldCents: null, depositCents: null }} editHref={EDIT} />);
    expect(screen.getByText("Balance").closest("div")).toHaveTextContent("—");
  });
});

describe("NextActionCard", () => {
  it("links to the task and keeps the manual stage move", () => {
    render(<NextActionCard job={job} measurementCount={0} />);
    expect(screen.getByText("Book the consultation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book visit" })).toHaveAttribute("href", `${EDIT}#visitAt`);
    expect(screen.getByRole("button", { name: "Move to Visit booked" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Set stage")).toBeNull();
  });

  it("offers the call button for a new lead", () => {
    render(<NextActionCard job={{ ...job, status: "new" }} measurementCount={0} />);
    expect(screen.getByRole("link", { name: "Log a call" })).toHaveAttribute("href", `/admin/jobs/${ID}/call`);
  });

  it("renders nothing for a lost job", () => {
    const { container } = render(<NextActionCard job={{ ...job, status: "lost" }} measurementCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run `npx vitest run --maxWorkers=2 tests/admin/overview-money-next.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`app/admin/jobs/[id]/MoneyStrip.tsx`:

```tsx
import Link from "next/link";
import type { Job } from "@/lib/admin/jobs";
import { balanceCents, formatCents } from "@/lib/admin/money";
import { CARD, HEADING, TEXT_LINK } from "./ui";

export function MoneyStrip({ job, editHref }: {
  job: Pick<Job, "quoteCents" | "soldCents" | "depositCents">;
  editHref: string;
}) {
  const balance = balanceCents(job.soldCents, job.depositCents);
  const empty = job.quoteCents === null && job.soldCents === null;

  return (
    <section aria-label="Money" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={HEADING}>Money</h2>
        {empty ? null : <Link href={editHref} className={TEXT_LINK}>Edit</Link>}
      </div>
      {empty ? (
        <p className="text-sm text-ink-soft">
          No quote yet. <Link href={editHref} className={TEXT_LINK}>Add quote</Link>
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure label="Quote" value={formatCents(job.quoteCents)} />
          <Figure label="Sold" value={formatCents(job.soldCents)} />
          <Figure label="Deposit" value={formatCents(job.depositCents)} />
          <Figure label="Balance" value={formatCents(balance)} strong />
        </dl>
      )}
    </section>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-l border-rule pl-3">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={`font-display text-xl ${strong ? "font-semibold" : "font-light"}`}>{value}</dd>
    </div>
  );
}
```

`app/admin/jobs/[id]/NextActionCard.tsx`:

```tsx
import { ButtonLink } from "@/components/ui/Button";
import type { Job } from "@/lib/admin/jobs";
import { nextAction } from "@/lib/admin/next-action";
import { CallButton } from "./CallButton";
import { StageControls } from "./StageControls";
import { CARD, HEADING } from "./ui";

export function NextActionCard({ job, measurementCount }: { job: Job; measurementCount: number }) {
  const action = nextAction(job, measurementCount);
  if (!action) return null;

  return (
    <section aria-labelledby="next-action-heading" className={`${CARD} border-l-4 border-l-champagne`}>
      <h2 id="next-action-heading" className={HEADING}>Next action</h2>
      <div className="flex flex-col gap-1">
        <p className="font-display text-xl">{action.title}</p>
        <p className="text-sm text-ink-soft">{action.detail}</p>
      </div>
      {action.cta?.kind === "call" ? <CallButton jobId={job.id} name={job.name} phone={job.phone} /> : null}
      {action.cta?.kind === "link" ? (
        <ButtonLink href={action.cta.href} variant="primary" className="w-full">{action.cta.label}</ButtonLink>
      ) : null}
      <StageControls job={job} parts={["move"]} />
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/jobs/[id]/MoneyStrip.tsx" "app/admin/jobs/[id]/NextActionCard.tsx" tests/admin/overview-money-next.test.tsx
git commit -m "feat: money strip and next action card"
```

---

### Task 7: Measurements tab, Files tab and measure return links

**Files:**
- Create: `app/admin/jobs/[id]/MeasurementsTab.tsx`
- Modify:
  - `app/admin/jobs/[id]/JobFiles.tsx` (prop)
  - `app/admin/jobs/[id]/measure/page.tsx:18-19`
  - `app/admin/jobs/[id]/measure/[windowId]/page.tsx:15`
  - `app/admin/jobs/[id]/measure/MeasureForm.tsx:93`
- Test: `tests/admin/measurements-tab.test.tsx`

**Interfaces:**
- Consumes: `formatEighths`, `requirementLabel`, `removeMeasurement`, `DeleteButton()`, `ShareSwitch({ jobId, fileId, shared })`, `ButtonLink`, `HEADING`, `tabHref`.
- Produces:
  - `MeasurementsTab({ jobId, measurements, files }: { jobId: string; measurements: WindowMeasurement[]; files: JobFile[] })`
  - `JobFiles` gains `showMeasurements?: boolean`, default `true`. When it is false, the Measure link and the Measurements block are hidden, but window photos are still left out of Photos.

- [ ] **Step 1: Write the failing test**

`tests/admin/measurements-tab.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { JobFile } from "@/lib/admin/files";
import type { WindowMeasurement } from "@/lib/admin/measurements";

vi.mock("@/app/admin/jobs/measure-actions", () => ({ removeMeasurement: vi.fn(), removeFile: vi.fn(), setFileShared: vi.fn() }));
const { MeasurementsTab } = await import("@/app/admin/jobs/[id]/MeasurementsTab");
const { JobFiles } = await import("@/app/admin/jobs/[id]/JobFiles");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const WIN = "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d";
const PHOTO = "5b4d0e3a-0e74-4c75-9c3e-3f4a5b6c7d8e";
const m: WindowMeasurement = {
  id: WIN, leadId: JOB, position: 1, room: "Kitchen", label: "Window 1", widthEighths: 35 * 8 + 5,
  heightEighths: 48 * 8, depthEighths: null, mount: "inside", requirements: [], notes: "Over sink",
  photoFileId: PHOTO, measuredBy: "joshua@example.com", createdAt: new Date(), updatedAt: new Date(),
};
const photo: JobFile = {
  id: PHOTO, leadId: JOB, createdAt: new Date(), uploadedBy: "joshua@example.com", kind: "photo",
  name: "window.jpg", contentType: "image/jpeg", sizeBytes: 1000, blobPathname: "x", sharedAt: null,
};

describe("MeasurementsTab", () => {
  it("shows one row per window with its sizes", () => {
    render(<MeasurementsTab jobId={JOB} measurements={[m]} files={[photo]} />);
    const row = screen.getByRole("row", { name: /Kitchen/ });
    expect(within(row).getByText("35 ⅝″")).toBeInTheDocument();
    expect(within(row).getByText("48″")).toBeInTheDocument();
    expect(within(row).getByText("Inside")).toBeInTheDocument();
    expect(within(row).getByText("Over sink")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Edit" })).toHaveAttribute("href", `/admin/jobs/${JOB}/measure/${WIN}`);
    expect(screen.getByRole("link", { name: "Add measurement" })).toHaveAttribute("href", `/admin/jobs/${JOB}/measure`);
  });

  it("keeps today's empty state", () => {
    render(<MeasurementsTab jobId={JOB} measurements={[]} files={[]} />);
    expect(screen.getByText("No windows measured yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("JobFiles without measurements", () => {
  it("hides the measurements block but still keeps window photos out of Photos", () => {
    render(<JobFiles jobId={JOB} measurements={[m]} files={[photo]} showMeasurements={false} />);
    expect(screen.queryByText(/^Measurements ·/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Measure" })).toBeNull();
    expect(screen.getByText("Photos · 0")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run `npx vitest run --maxWorkers=2 tests/admin/measurements-tab.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`app/admin/jobs/[id]/MeasurementsTab.tsx`:

```tsx
import Link from "next/link";
import { removeMeasurement } from "@/app/admin/jobs/measure-actions";
import { ButtonLink } from "@/components/ui/Button";
import type { JobFile } from "@/lib/admin/files";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { formatEighths, requirementLabel } from "@/lib/admin/measure-units";
import { DeleteButton } from "./DeleteButton";
import { ShareSwitch } from "./ShareSwitch";
import { HEADING } from "./ui";

const COLUMNS = ["Room", "Window", "Width", "Height", "Depth", "Mount", "Notes", "Photo"];
const CELL = "px-3 py-3";

export function MeasurementsTab({ jobId, measurements, files }: {
  jobId: string;
  measurements: WindowMeasurement[];
  files: JobFile[];
}) {
  const sharedById = new Map(files.map((file) => [file.id, Boolean(file.sharedAt)]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={HEADING}>Measurements · {measurements.length}</h2>
        <ButtonLink href={`/admin/jobs/${jobId}/measure`} variant="solid">Add measurement</ButtonLink>
      </div>

      {measurements.length === 0 ? (
        <p className="text-sm text-ink-soft">No windows measured yet.</p>
      ) : (
        <div className="overflow-x-auto border border-rule bg-ivory">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-rule text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                {COLUMNS.map((column) => <th key={column} scope="col" className={`${CELL} font-semibold`}>{column}</th>)}
                <th scope="col" className={CELL}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {measurements.map((m) => (
                <tr key={m.id} className="align-top">
                  <th scope="row" className={`${CELL} font-semibold`}>{m.room}</th>
                  <td className={CELL}>{m.label ?? "—"}</td>
                  <td className={CELL}>{formatEighths(m.widthEighths)}</td>
                  <td className={CELL}>{formatEighths(m.heightEighths)}</td>
                  <td className={CELL}>{formatEighths(m.depthEighths)}</td>
                  <td className={CELL}>{m.mount === "inside" ? "Inside" : "Outside"}</td>
                  <td className={`${CELL} whitespace-pre-line`}>
                    {[...m.requirements.map(requirementLabel), m.notes].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className={CELL}>
                    {m.photoFileId ? (
                      <a href={`/admin/files/${m.photoFileId}`} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- private files are streamed by our own route, not the image optimizer */}
                        <img src={`/admin/files/${m.photoFileId}`} alt={`Photo of ${m.label ?? m.room}`} className="size-12 object-cover" />
                      </a>
                    ) : "—"}
                  </td>
                  <td className={CELL}>
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/jobs/${jobId}/measure/${m.id}`}
                        className="inline-flex min-h-11 items-center px-2 underline underline-offset-4">Edit</Link>
                      {m.photoFileId ? (
                        <ShareSwitch jobId={jobId} fileId={m.photoFileId} shared={sharedById.get(m.photoFileId) ?? false} />
                      ) : null}
                      <form action={removeMeasurement.bind(null, jobId, m.id)}>
                        <DeleteButton />
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

`app/admin/jobs/[id]/JobFiles.tsx`:
- Change the signature to:
  ```tsx
  export function JobFiles({ jobId, measurements, files, showMeasurements = true }: {
    jobId: string;
    measurements: WindowMeasurement[];
    files: JobFile[];
    /** The job page shows measurements on their own tab; the board panel keeps them here. */
    showMeasurements?: boolean;
  }) {
  ```
- Wrap the `Measure` `<Link>` (lines 28-29) in `{showMeasurements ? (…) : null}`.
- Wrap the whole Measurements `<div className="flex flex-col gap-4">` block (lines 34-76) in `{showMeasurements ? (…) : null}`.
- Leave everything else unchanged, including the `windowPhotoIds` filter.

Return links (a finished measurement lands on the Measurements tab):
- `measure/page.tsx` lines 18-19: change both `href={`/admin/jobs/${id}`}` to `href={`/admin/jobs/${id}?tab=measurements`}`.
- `measure/[windowId]/page.tsx` line 15: the same change.
- `measure/MeasureForm.tsx` line 93: change it to `router.push(`/admin/jobs/${jobId}?tab=measurements`);`.

- [ ] **Step 4: Run the tests to verify they pass.** Run `npx vitest run --maxWorkers=2 tests/admin/measurements-tab.test.tsx tests/admin/job-panel.test.tsx` and any measure-form tests (`tests/admin/measure*`). If a measure-form test asserts `router.push("/admin/jobs/<id>")`, update its expected string to add `?tab=measurements`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/jobs/[id]/MeasurementsTab.tsx" "app/admin/jobs/[id]/JobFiles.tsx" "app/admin/jobs/[id]/measure" tests/admin
git commit -m "feat: measurements table tab; measure screens return to it"
```

---

### Task 8: Job header

**Files:**
- Create: `app/admin/jobs/[id]/JobHeader.tsx`
- Test: `tests/admin/job-header.test.tsx`

**Interfaces:**
- Consumes:
  - `CallButton`; `StageControls` with `parts={["set","lost"]}`; `StageStepper`
  - `STAGE_STYLE`, `stageLabel`; `Icon`
  - `daysBetween`, `formatShortDate`; `editDetailsHref`
  - `ACTION_LINK`, `TEXT_LINK`
- Produces: `JobHeader({ job, now }: { job: Job; now: Date })`

- [ ] **Step 1: Write the failing test**

`tests/admin/job-header.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

vi.mock("@/app/admin/jobs/actions", () => ({ moveStage: vi.fn(), markLost: vi.fn(async () => ({})) }));
const { JobHeader } = await import("@/app/admin/jobs/[id]/JobHeader");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const now = new Date("2026-09-14T18:00:00Z");
const job: Job = {
  id: ID, createdAt: new Date("2026-09-11T18:00:00Z"), name: "Dana Reyes", phone: "7025550134",
  email: "dana@example.com", address: null, city: "Henderson", treatments: [], windowCount: null, heardVia: null,
  notes: null, source: "phone", status: "contacted", stageChangedAt: new Date("2026-09-13T18:00:00Z"),
  visitAt: null, quoteCents: null, soldCents: null, depositCents: null, brands: [], orderedOn: null,
  installOn: null, lostReason: null, referralCode: null, referredBy: null, referralPaidAt: null,
  reviewRequestedAt: null, reviewOptOut: false, budgetTier: null,
};

describe("JobHeader", () => {
  it("shows the name, stage and age of the job", () => {
    render(<JobHeader job={job} now={now} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dana Reyes");
    expect(screen.getByText("Henderson · Created Sep 11, 2026 · 1 day in stage")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Contacted");
  });

  it("has call, text, email and schedule actions", () => {
    render(<JobHeader job={job} now={now} />);
    expect(screen.getByRole("link", { name: "Log a call" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Text" })).toHaveAttribute("href", "sms:+17025550134");
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute("href", "mailto:dana@example.com");
    expect(screen.getByRole("link", { name: "Schedule" })).toHaveAttribute(
      "href", `/admin/jobs/${ID}?tab=overview&edit=details#visitAt`,
    );
  });

  it("hides Email when there is no email", () => {
    render(<JobHeader job={{ ...job, email: null }} now={now} />);
    expect(screen.queryByRole("link", { name: "Email" })).toBeNull();
  });

  it("keeps set stage and mark lost in the More menu", () => {
    render(<JobHeader job={job} now={now} />);
    const menu = screen.getByLabelText("More actions").closest("details")!;
    expect(within(menu).getByLabelText("Set stage")).toBeInTheDocument();
    expect(within(menu).getByLabelText(/mark lost/i)).toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: /^Move to/ })).toBeNull();
  });

  it("shows a lost banner with the reason", () => {
    render(<JobHeader job={{ ...job, status: "lost", lostReason: "Went with another company" }} now={now} />);
    expect(screen.getByText("Lost — Went with another company")).toBeInTheDocument();
  });

  it("says a job moved stages today", () => {
    render(<JobHeader job={{ ...job, stageChangedAt: now }} now={now} />);
    expect(screen.getByText(/In stage since today/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run `npx vitest run --maxWorkers=2 tests/admin/job-header.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`app/admin/jobs/[id]/JobHeader.tsx`:

```tsx
import Link from "next/link";
import { Icon } from "@/components/admin/icons";
import type { Job } from "@/lib/admin/jobs";
import { editDetailsHref } from "@/lib/admin/next-action";
import { STAGE_STYLE, stageLabel } from "@/lib/admin/stages";
import { daysBetween, formatShortDate } from "@/lib/admin/time";
import { CallButton } from "./CallButton";
import { StageControls } from "./StageControls";
import { StageStepper } from "./StageStepper";
import { ACTION_LINK, TEXT_LINK } from "./ui";

function inStage(days: number): string {
  if (days === 0) return "In stage since today";
  return `${days} ${days === 1 ? "day" : "days"} in stage`;
}

export function JobHeader({ job, now }: { job: Job; now: Date }) {
  const style = STAGE_STYLE[job.status];

  return (
    <header className="flex flex-col gap-5">
      <Link href="/admin" className={`${TEXT_LINK} self-start`}>← All jobs</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-light">{job.name}</h1>
            <span className="inline-flex items-center gap-1.5 border border-rule bg-ivory px-2 py-1 text-xs uppercase tracking-wide">
              <Icon name={style.icon} className={`size-3.5 ${style.tint}`} />
              {stageLabel(job.status)}
            </span>
          </div>
          <p className="text-sm text-ink-soft">
            {[job.city, `Created ${formatShortDate(job.createdAt)}`, inStage(daysBetween(job.stageChangedAt, now))].join(" · ")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CallButton jobId={job.id} name={job.name} phone={job.phone} />
          <a href={`sms:+1${job.phone}`} className={ACTION_LINK}>Text</a>
          {job.email ? <a href={`mailto:${job.email}`} className={ACTION_LINK}>Email</a> : null}
          <Link href={editDetailsHref(job.id, "visitAt")} className={ACTION_LINK}>Schedule</Link>
          <details className="relative">
            <summary aria-label="More actions" className={`${ACTION_LINK} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
              <span aria-hidden="true">•••</span>
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] border border-rule bg-ivory p-4 shadow-lg">
              <StageControls job={job} parts={["set", "lost"]} />
            </div>
          </details>
        </div>
      </div>

      {job.status === "lost" ? (
        <p className="border-l-4 border-taupe bg-ivory px-4 py-3 text-sm">
          {job.lostReason ? `Lost — ${job.lostReason}` : "Lost"}
        </p>
      ) : null}

      <StageStepper status={job.status} />
    </header>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/jobs/[id]/JobHeader.tsx" tests/admin/job-header.test.tsx
git commit -m "feat: job page header with actions and stepper"
```

---

### Task 9: Overview and Activity tabs

**Files:**
- Create: `app/admin/jobs/[id]/OverviewCards.tsx`, `app/admin/jobs/[id]/OverviewTab.tsx`, `app/admin/jobs/[id]/ActivityTab.tsx`
- Test: `tests/admin/overview-tab.test.tsx`

**Interfaces:**
- Consumes:
  - Everything above
  - `DetailsForm`, `InviteSection`, `ReviewSection`, `ReferralSection`, `ReferralsList`, `NoteForm`
  - `formatPhone` (`lib/leads/schema`), `mapsHref` (`lib/admin/links`), `budgetLabel`
  - `formatWhen`, `formatDateOnly`, `isPortalStage` (`lib/portal/progress`), `listReferrals` (type only)
- Produces:
  - `CustomerCard({ job, referrer })`, `ProjectCard({ job, editHref })`
  - `StatusCard({ title, value, detail, empty, actions })`, where `actions: { label: string; href: string }[]`
  - `OverviewTab({ job, editing, now, measurements, files, events, referrals, referrer })`
  - `ActivityTab({ jobId, events, now })`

- [ ] **Step 1: Write the failing test**

`tests/admin/overview-tab.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage: vi.fn(), markLost: vi.fn(async () => ({})), saveDetails: vi.fn(async () => ({})),
  saveNote: vi.fn(async () => ({})), sendPortalInviteNow: vi.fn(), sendReviewNow: vi.fn(),
  saveReviewOptOut: vi.fn(), createReferralLink: vi.fn(), payReferral: vi.fn(),
}));
vi.mock("@/app/admin/jobs/measure-actions", () => ({ removeMeasurement: vi.fn(), removeFile: vi.fn(), setFileShared: vi.fn() }));
const { OverviewTab } = await import("@/app/admin/jobs/[id]/OverviewTab");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const now = new Date("2026-09-14T18:00:00Z");
const job: Job = {
  id: ID, createdAt: now, name: "Dana Reyes", phone: "7025550134", email: "dana@example.com",
  address: "12 Elm St", city: "Henderson", treatments: ["Shutters"], windowCount: "6-10", heardVia: "Google",
  notes: "Prefers white", source: "contact", status: "ordered", stageChangedAt: now, visitAt: null,
  quoteCents: 520000, soldCents: 500000, depositCents: 250000, brands: ["Alta Window Fashions"],
  orderedOn: "2026-09-18", installOn: null, lostReason: null, referralCode: null, referredBy: null,
  referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false, budgetTier: "mid",
};
const base = { job, editing: false, now, measurements: [], files: [], events: [], referrals: [], referrer: null };

describe("OverviewTab", () => {
  it("shows the customer, project, next action and money", () => {
    render(<OverviewTab {...base} />);
    expect(screen.getByRole("region", { name: "Customer" })).toHaveTextContent("(702) 555-0134");
    const project = screen.getByRole("region", { name: "Project details" });
    expect(project).toHaveTextContent("Shutters");
    expect(project).toHaveTextContent("Mid-range");
    expect(project).toHaveTextContent("Alta Window Fashions");
    expect(screen.getByText("Schedule the install")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Money" })).toHaveTextContent("$2,500");
  });

  it("shows set values and empty states on the status cards", () => {
    render(<OverviewTab {...base} />);
    expect(screen.getByRole("region", { name: "Order" })).toHaveTextContent("Sep 18, 2026");
    const install = screen.getByRole("region", { name: "Install" });
    expect(install).toHaveTextContent("Not scheduled");
    expect(within(install).getByRole("link", { name: "Set install date" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Visit" })).toHaveTextContent("No visit booked");
  });

  it("swaps the money and status cards for the details form in edit mode", () => {
    render(<OverviewTab {...base} editing />);
    expect(screen.getByRole("button", { name: /save details/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", `/admin/jobs/${ID}`);
    expect(screen.queryByRole("region", { name: "Money" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Install" })).toBeNull();
  });

  it("shows empty activity and files with links to their tabs", () => {
    render(<OverviewTab {...base} />);
    expect(screen.getByText("No activity yet.")).toBeInTheDocument();
    expect(screen.getByText("No files yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload" })).toHaveAttribute("href", `/admin/jobs/${ID}?tab=files`);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run `npx vitest run --maxWorkers=2 tests/admin/overview-tab.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`app/admin/jobs/[id]/OverviewCards.tsx`:

```tsx
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { budgetLabel } from "@/lib/admin/budget";
import type { Job } from "@/lib/admin/jobs";
import { mapsHref } from "@/lib/admin/links";
import { formatPhone } from "@/lib/leads/schema";
import { CARD, HEADING, TEXT_LINK } from "./ui";

const DL = "grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm";

export function CustomerCard({ job, referrer }: { job: Job; referrer: Job | null }) {
  const place = [job.address, job.city].filter(Boolean).join(", ");
  return (
    <section aria-labelledby="customer-heading" className={CARD}>
      <h2 id="customer-heading" className={HEADING}>Customer</h2>
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg">{job.name}</p>
        <a href={`tel:+1${job.phone}`} className="underline-offset-4 hover:underline">{formatPhone(job.phone)}</a>
        {job.email ? <a href={`mailto:${job.email}`} className="break-all underline-offset-4 hover:underline">{job.email}</a> : null}
        {place ? <a href={mapsHref(job.address, job.city)} className="text-ink-soft underline-offset-4 hover:underline">{place}</a> : null}
      </div>
      <dl className={`${DL} border-t border-rule pt-4`}>
        <dt className="text-ink-soft">Heard about us</dt><dd>{job.heardVia ?? "—"}</dd>
        <dt className="text-ink-soft">Came in via</dt><dd>{job.source}</dd>
        {referrer ? (
          <>
            <dt className="text-ink-soft">Referred by</dt>
            <dd><Link href={`/admin/jobs/${referrer.id}`} className={TEXT_LINK}>{referrer.name}</Link></dd>
          </>
        ) : null}
      </dl>
    </section>
  );
}

export function ProjectCard({ job, editHref }: { job: Job; editHref: string }) {
  return (
    <section aria-labelledby="project-heading" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="project-heading" className={HEADING}>Project details</h2>
        <Link href={editHref} className={TEXT_LINK}>Edit</Link>
      </div>
      <dl className={DL}>
        <dt className="text-ink-soft">Interested in</dt>
        <dd className="flex flex-wrap gap-1.5">
          {job.treatments.length
            ? job.treatments.map((t) => <span key={t} className="border border-rule bg-sand px-2 py-0.5 text-xs">{t}</span>)
            : "—"}
        </dd>
        <dt className="text-ink-soft">Windows</dt><dd>{job.windowCount ?? "—"}</dd>
        <dt className="text-ink-soft">Budget</dt><dd>{budgetLabel(job.budgetTier)}</dd>
        <dt className="text-ink-soft">Brands</dt><dd>{job.brands.join(", ") || "—"}</dd>
      </dl>
      {job.notes ? <p className="whitespace-pre-line border-l-2 border-champagne pl-4 text-sm">{job.notes}</p> : null}
    </section>
  );
}

export function StatusCard({ title, value, detail, empty, actions }: {
  title: string;
  value: string | null;
  detail?: string;
  empty: string;
  actions: { label: string; href: string }[];
}) {
  const id = `status-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className={CARD}>
      <h2 id={id} className={HEADING}>{title}</h2>
      <div className="flex flex-1 flex-col gap-1 text-sm">
        {value ? <p className="font-display text-lg">{value}</p> : <p className="text-ink-soft">{empty}</p>}
        {detail ? <p className="text-xs text-ink-soft">{detail}</p> : null}
      </div>
      {actions.map((action) => (
        <ButtonLink key={action.label} href={action.href} variant="outline" className="w-full px-3">{action.label}</ButtonLink>
      ))}
    </section>
  );
}
```

`app/admin/jobs/[id]/OverviewTab.tsx`:

```tsx
import Link from "next/link";
import type { JobFile } from "@/lib/admin/files";
import type { Job, JobEvent } from "@/lib/admin/jobs";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { editDetailsHref } from "@/lib/admin/next-action";
import { STAGES } from "@/lib/admin/stages";
import { formatDateOnly, formatWhen } from "@/lib/admin/time";
import { isPortalStage } from "@/lib/portal/progress";
import type { listReferrals } from "@/lib/referrals/db";
import { DetailsForm } from "./DetailsForm";
import { EventList } from "./EventList";
import { InviteSection } from "./InviteSection";
import { MoneyStrip } from "./MoneyStrip";
import { NextActionCard } from "./NextActionCard";
import { CustomerCard, ProjectCard, StatusCard } from "./OverviewCards";
import { ReferralSection } from "./ReferralSection";
import { ReferralsList } from "./ReferralsList";
import { ReviewSection } from "./ReviewSection";
import { tabHref } from "./tabs";
import { CARD, HEADING, TEXT_LINK } from "./ui";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function OverviewTab({ job, editing, now, measurements, files, events, referrals, referrer }: {
  job: Job;
  editing: boolean;
  now: Date;
  measurements: WindowMeasurement[];
  files: JobFile[];
  events: JobEvent[];
  referrals: Awaited<ReturnType<typeof listReferrals>>;
  referrer: Job | null;
}) {
  const edit = editDetailsHref(job.id);
  const stageIndex = STAGES.findIndex((s) => s.value === job.status);
  const soldOrLater = stageIndex >= STAGES.findIndex((s) => s.value === "sold");
  const photos = files.filter((file) => file.kind === "photo").slice(0, 6);
  const documents = files.filter((file) => file.kind === "document").length;
  const lastMeasured = measurements.reduce<Date | null>(
    (latest, m) => (!latest || m.updatedAt > latest ? m.updatedAt : latest), null,
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <CustomerCard job={job} referrer={referrer} />
      <ProjectCard job={job} editHref={edit} />
      <NextActionCard job={job} measurementCount={measurements.length} />

      {editing ? (
        <section aria-labelledby="edit-heading" className={`${CARD} lg:col-span-3`}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="edit-heading" className={HEADING}>Job details</h2>
            <Link href={tabHref(job.id, "overview")} className={TEXT_LINK}>Done</Link>
          </div>
          <DetailsForm job={job} />
        </section>
      ) : (
        <>
          <div className="lg:col-span-3"><MoneyStrip job={job} editHref={edit} /></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
            <StatusCard title="Visit" value={job.visitAt ? formatWhen(job.visitAt) : null} empty="No visit booked"
              actions={job.visitAt ? [] : [{ label: "Book visit", href: editDetailsHref(job.id, "visitAt") }]} />
            <StatusCard title="Measurements" value={measurements.length ? plural(measurements.length, "window") : null}
              detail={lastMeasured ? `Updated ${formatWhen(lastMeasured)}` : undefined} empty="No windows measured yet"
              actions={[
                { label: "Add measurement", href: `/admin/jobs/${job.id}/measure` },
                ...(measurements.length ? [{ label: "View all", href: tabHref(job.id, "measurements") }] : []),
              ]} />
            <StatusCard title="Order" value={job.orderedOn ? formatDateOnly(job.orderedOn) : null} empty="Not ordered"
              actions={job.orderedOn ? [] : [{ label: "Set order date", href: edit }]} />
            <StatusCard title="Install" value={job.installOn ? formatDateOnly(job.installOn) : null} empty="Not scheduled"
              actions={job.installOn ? [] : [{ label: "Set install date", href: edit }]} />
          </div>
        </>
      )}

      <section aria-labelledby="portal-heading" className={CARD}>
        <h2 id="portal-heading" className={HEADING}>Customer project page</h2>
        <InviteSection
          jobId={job.id}
          hasEmail={Boolean(job.email?.trim())}
          canInvite={isPortalStage(job.status)}
          invitedLabel={job.portalInvitedAt ? formatWhen(job.portalInvitedAt) : null}
        />
      </section>
      {soldOrLater ? (
        <>
          <section aria-labelledby="review-heading" className={CARD}>
            <h2 id="review-heading" className={HEADING}>Review request</h2>
            <ReviewSection job={job} />
          </section>
          <section aria-labelledby="referral-heading" className={CARD}>
            <h2 id="referral-heading" className={HEADING}>Referral link</h2>
            <ReferralSection job={job} />
          </section>
        </>
      ) : null}
      {referrals.length ? (
        <section aria-labelledby="referrals-heading" className={`${CARD} lg:col-span-3`}>
          <h2 id="referrals-heading" className={HEADING}>Referrals</h2>
          <ReferralsList referrerId={job.id} referrals={referrals} />
        </section>
      ) : null}

      <section aria-labelledby="recent-heading" className={`${CARD} lg:col-span-2`}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="recent-heading" className={HEADING}>Recent activity</h2>
          <div className="flex gap-4">
            <Link href={tabHref(job.id, "activity")} className={TEXT_LINK}>Add note</Link>
            <Link href={tabHref(job.id, "activity")} className={TEXT_LINK}>All activity</Link>
          </div>
        </div>
        <EventList events={events.slice(0, 5)} now={now} />
      </section>

      <section aria-labelledby="files-heading" className={CARD}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="files-heading" className={HEADING}>Files and photos</h2>
          {files.length ? <Link href={tabHref(job.id, "files")} className={TEXT_LINK}>Files</Link> : null}
        </div>
        {files.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No files yet. <Link href={tabHref(job.id, "files")} className={TEXT_LINK}>Upload</Link>
          </p>
        ) : (
          <>
            {photos.length ? (
              <ul className="grid grid-cols-3 gap-2">
                {photos.map((file) => (
                  <li key={file.id}>
                    <a href={`/admin/files/${file.id}`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private files are streamed by our own route, not the image optimizer */}
                      <img src={`/admin/files/${file.id}`} alt={file.name} className="aspect-square w-full object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-sm text-ink-soft">{plural(documents, "document")}</p>
          </>
        )}
      </section>
    </div>
  );
}
```

`app/admin/jobs/[id]/ActivityTab.tsx`:

```tsx
import type { JobEvent } from "@/lib/admin/jobs";
import { EventList } from "./EventList";
import { NoteForm } from "./NoteForm";

export function ActivityTab({ jobId, events, now }: { jobId: string; events: JobEvent[]; now: Date }) {
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <NoteForm jobId={jobId} />
      <EventList events={events} now={now} />
    </div>
  );
}
```

About `StatusCard`: the test finds cards by region name. `aria-labelledby` pointing at the `h2` gives the accessible name "Order", "Install" and so on, so the `id`s must stay unique on the page. They are: `status-visit`, `status-measurements`, `status-order`, `status-install`.

- [ ] **Step 4: Run the test to verify it passes.** Same command. Expected: PASS. If `ReviewSection` or `ReferralSection` import another action name that the mock lacks, add that name to the `vi.mock` list; don't change the components.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/jobs/[id]/OverviewCards.tsx" "app/admin/jobs/[id]/OverviewTab.tsx" "app/admin/jobs/[id]/ActivityTab.tsx" tests/admin/overview-tab.test.tsx
git commit -m "feat: overview and activity tabs"
```

---

### Task 10: Rewrite the page

**Files:**
- Rewrite: `app/admin/jobs/[id]/page.tsx`
- Test: create `tests/admin/job-page-layout.test.tsx`; delete or replace `tests/admin/job-page-summary.test.tsx` (the call flow's test of the old summary list)

**Interfaces:**
- Consumes: `parseJobTab`, `firstParam`, `JobHeader`, `JobTabs`, `OverviewTab`, `MeasurementsTab`, `JobFiles`, `ActivityTab`, plus the existing loaders.
- Produces: `JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string | string[]; edit?: string | string[] }> })`

- [ ] **Step 1: Write the failing test**

`tests/admin/job-page-layout.test.tsx`. First compare this mock list with `tests/admin/job-page-summary.test.tsx` (read in Task 0) and add any module it mocks that is missing here.

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "@/lib/admin/jobs";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const job: Job = {
  id: ID, createdAt: new Date(), name: "Dana Reyes", phone: "7025550134", email: null, address: null,
  city: "Henderson", treatments: [], windowCount: null, heardVia: null, notes: null, source: "phone",
  status: "contacted", stageChangedAt: new Date(), visitAt: null, quoteCents: null, soldCents: null,
  depositCents: null, brands: [], orderedOn: null, installOn: null, lostReason: null, referralCode: null,
  referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false, budgetTier: "mid",
};

const getJob = vi.fn();
vi.mock("@/lib/admin/jobs", () => ({ getJob, getEvents: vi.fn(async () => []) }));
vi.mock("@/lib/admin/measurements", () => ({ listMeasurements: vi.fn(async () => []) }));
vi.mock("@/lib/admin/files", () => ({ listFiles: vi.fn(async () => []) }));
vi.mock("@/lib/referrals/db", () => ({ listReferrals: vi.fn(async () => []) }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("not found"); }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage: vi.fn(), markLost: vi.fn(async () => ({})), saveDetails: vi.fn(async () => ({})),
  saveNote: vi.fn(async () => ({})), sendPortalInviteNow: vi.fn(), sendReviewNow: vi.fn(),
  saveReviewOptOut: vi.fn(), createReferralLink: vi.fn(), payReferral: vi.fn(),
}));
vi.mock("@/app/admin/jobs/measure-actions", () => ({ removeMeasurement: vi.fn(), removeFile: vi.fn(), setFileShared: vi.fn() }));

const { default: JobPage } = await import("@/app/admin/jobs/[id]/page");
const open = async (query: { tab?: string; edit?: string }) =>
  render(await JobPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve(query) }));

beforeEach(() => { getJob.mockReset().mockResolvedValue(job); });

describe("job page layout", () => {
  it("opens on the Overview", async () => {
    await open({});
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent("Overview");
    expect(screen.getByRole("region", { name: "Customer" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Project details" })).toHaveTextContent("Mid-range");
    expect(screen.getByText("Book the consultation")).toBeInTheDocument();
  });

  it("shows the Measurements tab", async () => {
    await open({ tab: "measurements" });
    expect(screen.getByText("No windows measured yet.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Customer" })).toBeNull();
  });

  it("shows the Files tab without the measurements block", async () => {
    await open({ tab: "files" });
    expect(screen.getByText("Photos · 0")).toBeInTheDocument();
    expect(screen.queryByText(/^Measurements ·/)).toBeNull();
  });

  it("shows the Activity tab with the note form", async () => {
    await open({ tab: "activity" });
    expect(screen.getByLabelText("Add a note")).toBeInTheDocument();
  });

  it("falls back to the Overview for an unknown tab", async () => {
    await open({ tab: "quote" });
    expect(screen.getByRole("region", { name: "Customer" })).toBeInTheDocument();
  });

  it("opens the details form with ?edit=details", async () => {
    await open({ edit: "details" });
    expect(screen.getByRole("button", { name: /save details/i })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Money" })).toBeNull();
  });

  it("keeps the header on every tab", async () => {
    await open({ tab: "files" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dana Reyes");
    expect(screen.getByRole("list", { name: "Stage" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Email" })).toBeNull();
  });
});
```

Then handle the call flow's `tests/admin/job-page-summary.test.tsx`. It asserts a Budget row in the old summary `dl`, and `job-page-layout.test.tsx` now covers budget in "opens on the Overview". So delete that file with `git rm`, after checking that every other assertion in it is either about the old summary list or duplicated above. If it asserts anything else, move that assertion into `job-page-layout.test.tsx` instead.

- [ ] **Step 2: Run the test to verify it fails.** Run `npx vitest run --maxWorkers=2 tests/admin/job-page-layout.test.tsx`. Expected: FAIL, because the old page has no tabs.

- [ ] **Step 3: Implement.** The full new `app/admin/jobs/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getEvents, getJob } from "@/lib/admin/jobs";
import { listFiles } from "@/lib/admin/files";
import { listMeasurements } from "@/lib/admin/measurements";
import { requireAdmin } from "@/lib/admin/session";
import { listReferrals } from "@/lib/referrals/db";
import { ActivityTab } from "./ActivityTab";
import { JobFiles } from "./JobFiles";
import { JobHeader } from "./JobHeader";
import { JobTabs } from "./JobTabs";
import { MeasurementsTab } from "./MeasurementsTab";
import { OverviewTab } from "./OverviewTab";
import { firstParam, parseJobTab } from "./tabs";

export default async function JobPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[]; edit?: string | string[] }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const [query, events, referrals, referrer, measurements, files] = await Promise.all([
    searchParams,
    getEvents(id),
    listReferrals(id),
    job.referredBy ? getJob(job.referredBy) : Promise.resolve(null),
    listMeasurements(id),
    listFiles(id),
  ]);
  const tab = parseJobTab(query.tab);
  const editing = tab === "overview" && firstParam(query.edit) === "details";
  const now = new Date();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <JobHeader job={job} now={now} />
      <JobTabs jobId={job.id} active={tab} counts={{ measurements: measurements.length, files: files.length }} />
      {tab === "overview" ? (
        <OverviewTab job={job} editing={editing} now={now} measurements={measurements} files={files}
          events={events} referrals={referrals} referrer={referrer} />
      ) : null}
      {tab === "measurements" ? <MeasurementsTab jobId={job.id} measurements={measurements} files={files} /> : null}
      {tab === "files" ? <JobFiles jobId={job.id} measurements={measurements} files={files} showMeasurements={false} /> : null}
      {tab === "activity" ? <ActivityTab jobId={job.id} events={events} now={now} /> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the full suite, typecheck and lint.**
  - Run `npx vitest run --maxWorkers=2`. Expected: all pass. Any failing test that asserts the old single-column page (for example a "Log a call" link directly under the `h1`) should now find that element in the header; update its query rather than the component.
  - Run `npx tsc --noEmit`. Expected: no errors.
  - Run `npm run lint`. Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A "app/admin/jobs/[id]/page.tsx" tests/admin
git commit -m "feat: job page as header, stepper and tabs"
```

---

### Task 11: End-to-end flows and final verification

**Files:**
- Modify: `e2e/admin.spec.ts`

- [ ] **Step 1: Update the add-job flow** (the test at line 64). Replace lines 73-79 with:

```ts
  await page.getByRole("button", { name: "Move to Contacted" }).click();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Contacted");

  await page.getByRole("link", { name: "Activity", exact: true }).click();
  await page.getByLabel("Add a note").fill("Call back after 5pm");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Call back after 5pm")).toBeVisible();
  await expect(page.getByText("New lead → Contacted")).toBeVisible();
```

- [ ] **Step 2: Update the referral flow.** Replace lines 111-113 with:

```ts
  await page.getByLabel("More actions").click();
  await page.getByLabel("Set stage").selectOption("installed");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Installed");
```

- [ ] **Step 3: Update the measure flow.**
  - Line 133 becomes `await page.getByRole("link", { name: "Add measurement" }).click();`.
  - Replace lines 144-146 with:

```ts
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page).toHaveURL(/\?tab=measurements$/);
  const row = page.getByRole("row", { name: /Kitchen/ });
  await expect(row).toContainText("35 ⅝″");
  await expect(row).toContainText("48″");
```

  - Delete the old `const row = page.locator("li", …)` on line 157. The `row` above is reused for the Edit click.
  - Replace lines 164-166 with:

```ts
  await expect(page.getByRole("row", { name: /Kitchen/ })).toContainText("50″");
  const editedRow = page.getByRole("row", { name: /Kitchen/ });
```

- [ ] **Step 4: Run all checks.** Follow the repo's usual e2e setup: build with `npx next build`, and run against `next start` on 127.0.0.1 with `E2E_POSTGRES_URL` set to the Neon test branch (see `playwright.config.ts`). Run:
  - `npx playwright test e2e/admin.spec.ts`
  - `npx playwright test e2e/call.spec.ts` (the call flow's test, to confirm the Call button still works from its new spot)

  Expected: PASS. The photo test is skipped without `E2E_BLOB_READ_WRITE_TOKEN`; say so if it is.

- [ ] **Step 5: Check the page by eye.** With `next start` running, open a job at desktop width and at 400px. Check:
  - the stepper is correct
  - the header buttons wrap
  - only the measurements table scrolls sideways
  - the More menu opens
  - `?edit=details#visitAt` lands on the visit field

  Take a screenshot of each width for the user.

- [ ] **Step 6: Commit.** Then coordinate: message the call-flow and calendar sessions (`ListAgents` for names) that `jobpage` is ready to merge and that it touches `app/admin/jobs/[id]/*`, `JobFiles`, the measure screens and `StageControls`. Merge only after the user says to. Deploying is separate: `npx vercel --prod`, then verify the live site, only when the user asks.

```bash
git add e2e/admin.spec.ts
git commit -m "test: e2e flows follow the tabbed job page"
```
