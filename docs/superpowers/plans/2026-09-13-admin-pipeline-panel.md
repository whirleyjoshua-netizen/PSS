# Admin Pipeline Board and Client Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag jobs that are overdue in their stage on the `/admin` board, and open a client panel beside the board at `/admin?job=<id>`. The panel shows contact and address, money, stage and key dates, and measurements and files.

**Architecture:**
- The panel is part of the board page (`app/admin/page.tsx`), driven by a `job` search parameter, so a link or a refresh reopens it. The board loads the job, its measurements and its files only when `job` is set.
- Pure logic lives in two small tested modules: the overdue rule and the admin URL helpers.
- The panel is a server component that reuses `StageControls` and `JobFiles`.
- There is no database change.

**Tech Stack:** Next.js 16.3 App Router (server components, `searchParams` as a Promise), React 19, Tailwind 4, Vitest 4 + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-13-admin-pipeline-panel-design.md`

## Global Constraints

- The same 7 stages plus Lost. No stage, schema or migration changes.
- The admin area stays black and white. Use only the existing tokens (`charcoal`, `ivory`, `ink-soft`, `rule`, `champagne-ink`, `sand`). No new colors.
- Overdue rule:

  | Stage | Overdue when |
  |---|---|
  | `new` | days in stage > 1 |
  | `contacted` | days in stage > 3 |
  | `visit_booked` | the Las Vegas date of now > the Las Vegas date of `visitAt`; never when `visitAt` is null |
  | `quoted` | days in stage > 7 |
  | `sold` | days in stage > 3 |
  | `ordered` | days in stage > 21 |
  | `installed`, `lost` | never |

  "Days in stage" is `floor((now - stageChangedAt) / 86_400_000)`, minimum 0. This is the count the card already shows.
- URLs:
  - `/admin`, `/admin?job=<id>`, `/admin?lost=1`, `/admin?lost=1&job=<id>`.
  - Closing drops `job`.
  - "Full page" links to `/admin/jobs/<id>`, which is unchanged.
- An unknown, malformed or deleted `job` id shows a panel reading "That job no longer exists." with a Close link. Never an error page.
- Balance due = sold − deposit when both are set; otherwise "—". Amounts use the existing `formatCents`.
- Panel placement:
  - From `md` up: a right-hand column about 28rem wide, beside a still-usable board.
  - Below `md`: covers the screen.
- Admin pages call `requireAdmin()` first. The board already does.
- **Local verification on this machine:**
  - Run tests with `npx vitest run <file> --maxWorkers=2`, then the full suite with `npx vitest run --maxWorkers=2` (currently 375 passing).
  - Run `npx tsc --noEmit`, ignoring anything under `.next/dev/types`.
  - Run `npx eslint`, and add no new errors.
  - Never run `npm run build`; the Vercel deploy is the build check.
- Other Claude sessions may work in this repo. `git add` only the files each task names, never `git add -A`.
- Read the relevant guide in `node_modules/next/dist/docs/` before using a Next.js API you have not used in this repo (AGENTS.md).

## File Structure

| File | Responsibility |
|---|---|
| `lib/admin/overdue.ts` (new) | Pure: `OVERDUE_DAYS`, `daysInStage`, `isOverdue` |
| `lib/admin/links.ts` (new) | Pure: `boardHref`, `mapsHref` |
| `app/admin/JobCard.tsx` (modify) | Card gets `href`, `selected`, and the overdue flag; uses `daysInStage` |
| `app/admin/JobPanel.tsx` (new) | Server component: the client panel, or the "no longer exists" panel |
| `app/admin/page.tsx` (modify) | Reads `job`; loads panel data; lays out the board and panel side by side |
| `app/admin/jobs/[id]/page.tsx` (modify) | Uses `mapsHref` instead of its inline map link |
| `app/admin/jobs/measure-actions.ts` (modify) | Also revalidates `/admin`, so the panel refreshes after measurement and file changes |
| `e2e/admin.spec.ts` (modify) | Panel open, reload, close journey |

---

### Task 1: The overdue rule and admin URL helpers

**Files:**
- Create: `lib/admin/overdue.ts`, `lib/admin/links.ts`
- Test: `tests/admin/overdue.test.ts`, `tests/admin/links.test.ts`

**Interfaces:**
- Produces:
  - `OVERDUE_DAYS: Partial<Record<Stage, number>>`
  - `daysInStage(stageChangedAt: Date, now: Date): number`
  - `isOverdue(job: Pick<Job, "status" | "stageChangedAt" | "visitAt">, now: Date): boolean`
  - `boardHref(opts: { lost: boolean; job?: string | null }): string`
  - `mapsHref(address: string | null, city: string): string`

- [ ] **Step 1: Write the failing tests**

`tests/admin/overdue.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { OVERDUE_DAYS, daysInStage, isOverdue } from "@/lib/admin/overdue";

const DAY = 86_400_000;
const NOW = new Date("2026-09-20T18:00:00Z"); // 11 a.m. Sep 20 in Las Vegas
const since = (days: number) => new Date(NOW.getTime() - days * DAY);
const job = (status: string, days: number, visitAt: Date | null = null) =>
  ({ status, stageChangedAt: since(days), visitAt }) as Parameters<typeof isOverdue>[0];

describe("daysInStage", () => {
  it("counts whole days and never goes below zero", () => {
    expect(daysInStage(since(3.9), NOW)).toBe(3);
    expect(daysInStage(new Date(NOW.getTime() + DAY), NOW)).toBe(0);
  });
});

describe("isOverdue", () => {
  it.each([
    ["new", 1], ["contacted", 3], ["quoted", 7], ["sold", 3], ["ordered", 21],
  ])("%s is overdue only after %i days", (status, limit) => {
    expect(OVERDUE_DAYS[status as keyof typeof OVERDUE_DAYS]).toBe(limit);
    expect(isOverdue(job(status, limit), NOW)).toBe(false);
    expect(isOverdue(job(status, limit + 1), NOW)).toBe(true);
  });

  it.each(["installed", "lost"])("%s is never overdue", (status) => {
    expect(isOverdue(job(status, 400), NOW)).toBe(false);
  });

  it("a booked visit is overdue from the Las Vegas day after the visit", () => {
    // Visit 4 p.m. Sep 19 Las Vegas time (23:00 UTC): overdue on Sep 20.
    expect(isOverdue(job("visit_booked", 5, new Date("2026-09-19T23:00:00Z")), NOW)).toBe(true);
    // Visit 8 p.m. Sep 20 Las Vegas time, which is already Sep 21 in UTC: not overdue.
    expect(isOverdue(job("visit_booked", 5, new Date("2026-09-21T03:00:00Z")), NOW)).toBe(false);
    // Visit earlier the same Las Vegas day: not overdue yet.
    expect(isOverdue(job("visit_booked", 5, new Date("2026-09-20T15:00:00Z")), NOW)).toBe(false);
  });

  it("a booked visit with no date is never overdue", () => {
    expect(isOverdue(job("visit_booked", 60, null), NOW)).toBe(false);
  });
});
```

`tests/admin/links.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { boardHref, mapsHref } from "@/lib/admin/links";

describe("boardHref", () => {
  it("is the plain board with nothing set", () => {
    expect(boardHref({ lost: false })).toBe("/admin");
  });
  it("opens a panel and keeps the lost toggle", () => {
    expect(boardHref({ lost: false, job: "abc" })).toBe("/admin?job=abc");
    expect(boardHref({ lost: true, job: "abc" })).toBe("/admin?lost=1&job=abc");
    expect(boardHref({ lost: true, job: null })).toBe("/admin?lost=1");
  });
});

describe("mapsHref", () => {
  it("searches the address and city in Nevada", () => {
    expect(mapsHref("12 Main St", "Henderson")).toBe("https://maps.google.com/?q=12%20Main%20St%2C%20Henderson%2C%20NV");
  });
  it("works without a street address", () => {
    expect(mapsHref(null, "Henderson")).toBe("https://maps.google.com/?q=Henderson%2C%20NV");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/admin/overdue.test.ts tests/admin/links.test.ts --maxWorkers=2`
Expected: FAIL, because neither module exists.

- [ ] **Step 3: Implement**

`lib/admin/overdue.ts`:

```ts
import type { Job } from "./jobs";
import type { Stage } from "./stages";
import { lasVegasDate } from "./time";

/** Days a job may sit in a stage before the board flags it. Stages absent here never go overdue. */
export const OVERDUE_DAYS: Partial<Record<Stage, number>> = {
  new: 1,
  contacted: 3,
  quoted: 7,
  sold: 3,
  ordered: 21,
};

export const daysInStage = (stageChangedAt: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - stageChangedAt.getTime()) / 86_400_000));

/** A booked visit is judged by its date, not by time in stage: overdue once its Las Vegas day has passed. */
export function isOverdue(job: Pick<Job, "status" | "stageChangedAt" | "visitAt">, now: Date): boolean {
  if (job.status === "visit_booked") {
    return job.visitAt !== null && lasVegasDate(now) > lasVegasDate(job.visitAt);
  }
  const limit = OVERDUE_DAYS[job.status];
  return limit !== undefined && daysInStage(job.stageChangedAt, now) > limit;
}
```

`lib/admin/links.ts`:

```ts
/** The board URL, keeping the lost toggle and optionally opening a job's panel. */
export function boardHref({ lost, job }: { lost: boolean; job?: string | null }): string {
  const params = new URLSearchParams();
  if (lost) params.set("lost", "1");
  if (job) params.set("job", job);
  const query = params.toString().replace(/\+/g, "%20");
  return query ? `/admin?${query}` : "/admin";
}

export const mapsHref = (address: string | null, city: string): string =>
  `https://maps.google.com/?q=${encodeURIComponent([address, city, "NV"].filter(Boolean).join(", "))}`;
```

`lib/admin/jobs.ts` begins with `import "server-only"`, but `overdue.ts` imports only its *type*. Type imports are erased at compile time, so `overdue.ts` stays safe to import from client code.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/admin/overdue.test.ts tests/admin/links.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/overdue.ts lib/admin/links.ts tests/admin/overdue.test.ts tests/admin/links.test.ts
git commit -m "feat: overdue rule per stage and admin link helpers"
```

---

### Task 2: Cards link to the panel and show the overdue flag

**Files:**
- Modify: `app/admin/JobCard.tsx`
- Test: `tests/admin/board.test.tsx`

**Interfaces:**
- Consumes: `daysInStage` and `isOverdue` (Task 1)
- Produces: `JobCard({ job, now, href, selected }: { job: Job; now: Date; href: string; selected?: boolean })`. `groupByStage` is unchanged.

- [ ] **Step 1: Update the tests**

In `tests/admin/board.test.tsx`:

1. Replace the test "shows the name, city, interests, and days in stage, and links to the job" with:

```tsx
  it("shows the name, city, interests, and days in stage, and links to the given href", () => {
    // Quoted for 3 days: the limit is 7, so not overdue.
    render(<JobCard job={job({ status: "quoted" })} now={new Date("2026-09-10T00:00:00Z")} href="/admin?job=3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c" />);
    const link = screen.getByRole("link", { name: /dana reyes/i });
    expect(link).toHaveAttribute("href", "/admin?job=3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
    expect(link).toHaveTextContent("Henderson");
    expect(link).toHaveTextContent("Shades, Shutters");
    expect(link).toHaveTextContent("3 days");
    expect(link).not.toHaveTextContent("Overdue");
    expect(link).not.toHaveAttribute("aria-current");
  });

  it("flags a job that is overdue in its stage", () => {
    // New lead for 3 days: the limit is 1.
    render(<JobCard job={job({ status: "new" })} now={new Date("2026-09-10T00:00:00Z")} href="/admin" />);
    expect(screen.getByRole("link", { name: /dana reyes.*overdue/i })).toBeInTheDocument();
  });

  it("marks the card whose panel is open", () => {
    render(<JobCard job={job({})} now={new Date("2026-09-10T00:00:00Z")} href="/admin" selected />);
    expect(screen.getByRole("link", { name: /dana reyes/i })).toHaveAttribute("aria-current", "true");
  });
```

2. In the "marks referred jobs with a Referral badge" test, add `href="/admin"` to the `JobCard` props.

The fixture's `stageChangedAt` is Sep 7 and "now" is Sep 10, so every card shows 3 days in stage. The default fixture status is `new` (limit 1), so the Referral test's card is overdue too. That test doesn't check for "Overdue", so it's unaffected.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/admin/board.test.tsx --maxWorkers=2`
Expected: FAIL. The card still links to `/admin/jobs/<id>`, has no Overdue text, and has no `aria-current`.

- [ ] **Step 3: Implement**

Replace `app/admin/JobCard.tsx` from the `daysSince` line to the end of the file with:

```tsx
export function JobCard({ job, now, href, selected = false }: {
  job: Job;
  now: Date;
  href: string;
  selected?: boolean;
}) {
  const days = daysInStage(job.stageChangedAt, now);
  const overdue = isOverdue(job, now);
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={`flex flex-col gap-1 bg-ivory p-3 text-sm transition-colors hover:border-champagne-ink ${
        overdue ? "border-2 border-charcoal" : "border border-rule"
      } ${selected ? "outline outline-2 outline-offset-2 outline-charcoal" : ""}`}
    >
      <span className="font-display text-base text-charcoal">{job.name}</span>
      {job.referredBy ? (
        <span className="w-fit border border-champagne-ink px-1.5 font-display text-[0.65rem] uppercase tracking-[0.12em] text-champagne-ink">
          Referral
        </span>
      ) : null}
      <span className="text-ink-soft">{job.city}</span>
      {job.treatments.length ? <span className="text-ink-soft">{job.treatments.join(", ")}</span> : null}
      <span className="font-display text-xs uppercase tracking-[0.12em] text-champagne-ink">
        {days === 1 ? "1 day" : `${days} days`} in stage
        {overdue ? <strong className="ml-2 text-charcoal">· Overdue</strong> : null}
      </span>
    </Link>
  );
}
```

Then add the import at the top: `import { daysInStage, isOverdue } from "@/lib/admin/overdue";`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/admin/board.test.tsx --maxWorkers=2`
Expected: PASS. (`app/admin/page.tsx` does not pass `href` yet, so `npx tsc --noEmit` reports an error there. Task 4 fixes it. Do not commit a workaround.)

- [ ] **Step 5: Commit**

```bash
git add app/admin/JobCard.tsx tests/admin/board.test.tsx
git commit -m "feat: board cards link to the client panel and flag overdue jobs"
```

---

### Task 3: The client panel

**Files:**
- Create: `app/admin/JobPanel.tsx`
- Test: `tests/admin/job-panel.test.tsx`

**Interfaces:**
- Consumes: `daysInStage`, `isOverdue`, `mapsHref` (Task 1); the existing `StageControls`, `JobFiles`, `formatCents`, `formatPhone`, `formatWhen`
- Produces: `JobPanel(props: { job: Job | null; measurements: WindowMeasurement[]; files: JobFile[]; now: Date; closeHref: string })`

- [ ] **Step 1: Write the failing tests**

`tests/admin/job-panel.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage: vi.fn(async () => {}),
  markLost: vi.fn(async () => ({})),
}));
vi.mock("@/app/admin/jobs/measure-actions", () => ({
  removeMeasurement: vi.fn(async () => {}),
  removeFile: vi.fn(async () => {}),
}));

const { JobPanel } = await import("@/app/admin/JobPanel");

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const job: Job = {
  id: ID, createdAt: new Date("2026-09-01T00:00:00Z"), name: "Dana Reyes", phone: "7025550134",
  email: "dana@example.com", address: "12 Main St", city: "Henderson", treatments: [], windowCount: null,
  heardVia: null, notes: null, source: "contact", status: "sold",
  stageChangedAt: new Date("2026-09-08T00:00:00Z"), visitAt: null, quoteCents: 480000, soldCents: 450000,
  depositCents: 225000, brands: [], orderedOn: null, installOn: "2026-10-02", lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
};
const NOW = new Date("2026-09-10T18:00:00Z");
const panel = (overrides: Partial<Job> | null = {}) =>
  render(
    <JobPanel job={overrides === null ? null : { ...job, ...overrides }} measurements={[]} files={[]} now={NOW} closeHref="/admin" />,
  );

describe("client panel", () => {
  it("is labelled with the client's name and links to close and to the full page", () => {
    panel();
    const aside = screen.getByRole("complementary", { name: /dana reyes/i });
    expect(within(aside).getByRole("heading", { name: "Dana Reyes" })).toBeInTheDocument();
    expect(within(aside).getByRole("link", { name: "Close" })).toHaveAttribute("href", "/admin");
    expect(within(aside).getByRole("link", { name: "Full page" })).toHaveAttribute("href", `/admin/jobs/${ID}`);
  });

  it("shows contact and address links", () => {
    panel();
    expect(screen.getByRole("link", { name: "(702) 555-0134" })).toHaveAttribute("href", "tel:+17025550134");
    expect(screen.getByRole("link", { name: "dana@example.com" })).toHaveAttribute("href", "mailto:dana@example.com");
    expect(screen.getByRole("link", { name: "12 Main St, Henderson" })).toHaveAttribute(
      "href", "https://maps.google.com/?q=12%20Main%20St%2C%20Henderson%2C%20NV",
    );
  });

  it("shows the money, with balance due as sold minus deposit", () => {
    panel();
    const money = screen.getByRole("region", { name: "Money" });
    expect(money).toHaveTextContent("Quote$4,800");
    expect(money).toHaveTextContent("Sold$4,500");
    expect(money).toHaveTextContent("Deposit$2,250");
    expect(money).toHaveTextContent("Balance due$2,250");
  });

  it("shows a dash for balance due unless both sold and deposit are set", () => {
    panel({ depositCents: null });
    expect(screen.getByRole("region", { name: "Money" })).toHaveTextContent("Balance due—");
  });

  it("shows the stage controls, key dates, and days in stage with the overdue flag", () => {
    // Sold for 2 days: the limit is 3, so not overdue.
    panel();
    const stage = screen.getByRole("region", { name: "Stage and dates" });
    expect(within(stage).getByText(/Stage:/)).toHaveTextContent("Sold");
    expect(stage).toHaveTextContent("Install2026-10-02");
    expect(stage).toHaveTextContent("Visit—");
    expect(stage).toHaveTextContent("2 days in stage");
    expect(stage).not.toHaveTextContent("Overdue");
  });

  it("flags an overdue job in the stage section", () => {
    panel({ stageChangedAt: new Date("2026-09-01T00:00:00Z") }); // sold 9 days
    expect(screen.getByRole("region", { name: "Stage and dates" })).toHaveTextContent("Overdue");
  });

  it("includes the measurements and files section", () => {
    panel();
    const files = screen.getByRole("region", { name: "Measurements and files" });
    expect(files).toHaveTextContent("Measurements · 0");
  });

  it("says when the job no longer exists, with a way back", () => {
    panel(null);
    expect(screen.getByText("That job no longer exists.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/admin");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/admin/job-panel.test.tsx --maxWorkers=2`
Expected: FAIL, because `@/app/admin/JobPanel` does not exist.

- [ ] **Step 3: Implement**

`app/admin/JobPanel.tsx`:

```tsx
import Link from "next/link";
import type { JobFile } from "@/lib/admin/files";
import type { Job } from "@/lib/admin/jobs";
import type { WindowMeasurement } from "@/lib/admin/measurements";
import { mapsHref } from "@/lib/admin/links";
import { formatCents } from "@/lib/admin/money";
import { daysInStage, isOverdue } from "@/lib/admin/overdue";
import { formatWhen } from "@/lib/admin/time";
import { formatPhone } from "@/lib/leads/schema";
import { JobFiles } from "./jobs/[id]/JobFiles";
import { StageControls } from "./jobs/[id]/StageControls";

const PANEL =
  "fixed inset-0 z-40 flex flex-col gap-8 overflow-y-auto bg-ivory p-4 md:sticky md:inset-auto md:top-6 md:z-auto md:max-h-[calc(100vh-3rem)] md:w-[28rem] md:shrink-0 md:border md:border-rule md:p-6";
const HEADING = "font-display text-xs uppercase tracking-[0.2em] text-champagne-ink";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `panel-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className={HEADING}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-charcoal">{value}</dd>
    </>
  );
}

export function JobPanel({ job, measurements, files, now, closeHref }: {
  job: Job | null;
  measurements: WindowMeasurement[];
  files: JobFile[];
  now: Date;
  closeHref: string;
}) {
  if (!job) {
    return (
      <aside aria-label="Job not found" className={PANEL}>
        <p>That job no longer exists.</p>
        <Link href={closeHref} className="text-sm underline underline-offset-4">Close</Link>
      </aside>
    );
  }

  const days = daysInStage(job.stageChangedAt, now);
  const balance = job.soldCents !== null && job.depositCents !== null ? job.soldCents - job.depositCents : null;

  return (
    <aside aria-label={`${job.name} details`} className={PANEL}>
      <header className="flex items-start justify-between gap-4">
        <h2 className="font-display text-2xl font-light">{job.name}</h2>
        <nav className="flex shrink-0 gap-4 text-sm">
          <Link href={`/admin/jobs/${job.id}`} className="underline underline-offset-4">Full page</Link>
          <Link href={closeHref} className="underline underline-offset-4">Close</Link>
        </nav>
      </header>

      <Section title="Contact">
        <div className="flex flex-col gap-1">
          <a href={`tel:+1${job.phone}`} className="underline-offset-4 hover:underline">{formatPhone(job.phone)}</a>
          {job.email ? <a href={`mailto:${job.email}`} className="underline-offset-4 hover:underline">{job.email}</a> : null}
          <a href={mapsHref(job.address, job.city)} className="text-ink-soft underline-offset-4 hover:underline">
            {[job.address, job.city].filter(Boolean).join(", ")}
          </a>
        </div>
      </Section>

      <Section title="Money">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <Row label="Quote" value={formatCents(job.quoteCents)} />
          <Row label="Sold" value={formatCents(job.soldCents)} />
          <Row label="Deposit" value={formatCents(job.depositCents)} />
          <Row label="Balance due" value={formatCents(balance)} />
        </dl>
      </Section>

      <Section title="Stage and dates">
        <StageControls job={job} />
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <Row label="Visit" value={job.visitAt ? formatWhen(job.visitAt) : "—"} />
          <Row label="Order" value={job.orderedOn ?? "—"} />
          <Row label="Install" value={job.installOn ?? "—"} />
        </dl>
        <p className="font-display text-xs uppercase tracking-[0.12em] text-champagne-ink">
          {days === 1 ? "1 day" : `${days} days`} in stage
          {isOverdue(job, now) ? <strong className="ml-2 text-charcoal">· Overdue</strong> : null}
        </p>
      </Section>

      <Section title="Measurements and files">
        <JobFiles jobId={job.id} measurements={measurements} files={files} />
      </Section>
    </aside>
  );
}
```

If the Next docs for this version say otherwise about importing a server component that renders client components (`StageControls`, `UploadButton`), follow the docs and note it in the report. It is expected to work: `JobPanel` has no `"use client"`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/admin/job-panel.test.tsx --maxWorkers=2`
Expected: PASS. If a text assertion fails only because of spacing between a `<dt>` and `<dd>` (for example "Quote $4,800" instead of "Quote$4,800"), fix the assertion to match the rendered text. Do not add markup to satisfy it.

- [ ] **Step 5: Commit**

```bash
git add app/admin/JobPanel.tsx tests/admin/job-panel.test.tsx
git commit -m "feat: client panel with contact, money, stage and dates, and files"
```

---

### Task 4: Wire the panel into the board, and keep it fresh

**Files:**
- Modify: `app/admin/page.tsx`, `app/admin/jobs/[id]/page.tsx`, `app/admin/jobs/measure-actions.ts`
- Test: `tests/admin/board-page.test.tsx` (new), `tests/admin/measure-actions.test.ts`

**Interfaces:**
- Consumes: `boardHref`, `mapsHref` (Task 1); `JobCard` with `href`/`selected` (Task 2); `JobPanel` (Task 3); the existing `getJob`, `listJobs`, `listMeasurements`, `listFiles`, `requireAdmin`

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` (the `searchParams` prop) before editing the page.

- [ ] **Step 1: Write the failing page tests**

`tests/admin/board-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "@/lib/admin/jobs";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const job: Job = {
  id: ID, createdAt: new Date("2026-09-01T00:00:00Z"), name: "Dana Reyes", phone: "7025550134",
  email: null, address: null, city: "Henderson", treatments: [], windowCount: null, heardVia: null,
  notes: null, source: "contact", status: "quoted", stageChangedAt: new Date(), visitAt: null,
  quoteCents: null, soldCents: null, depositCents: null, brands: [], orderedOn: null, installOn: null,
  lostReason: null, referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null,
  reviewOptOut: false,
};

const jobs = { listJobs: vi.fn(), getJob: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const listMeasurements = vi.fn();
vi.mock("@/lib/admin/measurements", () => ({ listMeasurements }));
const listFiles = vi.fn();
vi.mock("@/lib/admin/files", () => ({ listFiles }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));
vi.mock("@/app/admin/jobs/actions", () => ({ moveStage: vi.fn(), markLost: vi.fn(async () => ({})) }));
vi.mock("@/app/admin/jobs/measure-actions", () => ({ removeMeasurement: vi.fn(), removeFile: vi.fn() }));

const { default: BoardPage } = await import("@/app/admin/page");
const open = async (params: { lost?: string; job?: string }) =>
  render(await BoardPage({ searchParams: Promise.resolve(params) }));

beforeEach(() => {
  jobs.listJobs.mockReset().mockResolvedValue([job]);
  jobs.getJob.mockReset().mockResolvedValue(job);
  listMeasurements.mockReset().mockResolvedValue([]);
  listFiles.mockReset().mockResolvedValue([]);
});

describe("board page", () => {
  it("shows no panel and loads no job details without ?job", async () => {
    await open({});
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(jobs.getJob).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /dana reyes/i })).toHaveAttribute("href", `/admin?job=${ID}`);
  });

  it("opens the panel for ?job, marks the card, and closes back to the board", async () => {
    await open({ job: ID });
    expect(screen.getByRole("complementary", { name: /dana reyes/i })).toBeInTheDocument();
    expect(listMeasurements).toHaveBeenCalledWith(ID);
    expect(listFiles).toHaveBeenCalledWith(ID);
    expect(screen.getByRole("link", { name: /dana reyes/i, current: true })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/admin");
  });

  it("keeps the lost toggle in card and close links", async () => {
    await open({ lost: "1", job: ID });
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/admin?lost=1");
    expect(screen.getByRole("link", { name: /dana reyes/i, current: true })).toHaveAttribute("href", `/admin?lost=1&job=${ID}`);
  });

  it("shows the not-found panel for a job that no longer exists", async () => {
    jobs.getJob.mockResolvedValue(null);
    await open({ job: "nope" });
    expect(screen.getByText("That job no longer exists.")).toBeInTheDocument();
    expect(listMeasurements).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Extend the measure-actions tests**

In `tests/admin/measure-actions.test.ts`:
- Replace `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));` with:

```ts
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
```

- Add `revalidatePath.mockReset();` inside the existing `beforeEach`.
- Add this block at the end:

```ts
describe("keeping the board panel fresh", () => {
  it("revalidates the board as well as the job page", async () => {
    measurements.addMeasurement.mockResolvedValue(WIN);
    await actions.saveMeasurement(LEAD, null, window());
    await actions.removeMeasurement(LEAD, WIN);
    getFile.mockResolvedValue({ id: WIN, leadId: LEAD });
    await actions.removeFile(LEAD, WIN);
    expect(revalidatePath.mock.calls.filter(([path]) => path === "/admin")).toHaveLength(3);
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${LEAD}`);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/admin/board-page.test.tsx tests/admin/measure-actions.test.ts --maxWorkers=2`
Expected: FAIL. The page renders no panel, and the actions do not revalidate `/admin`.

- [ ] **Step 4: Implement the page**

Replace `app/admin/page.tsx` with:

```tsx
import Link from "next/link";
import { listFiles } from "@/lib/admin/files";
import { getJob, listJobs } from "@/lib/admin/jobs";
import { boardHref } from "@/lib/admin/links";
import { listMeasurements } from "@/lib/admin/measurements";
import { requireAdmin } from "@/lib/admin/session";
import { JobCard, groupByStage } from "./JobCard";
import { JobPanel } from "./JobPanel";

/** The panel's data, loaded only when a job is open. A missing job still gets a panel that says so. */
async function loadPanel(id: string) {
  const job = await getJob(id);
  if (!job) return { job: null, measurements: [], files: [] };
  const [measurements, files] = await Promise.all([listMeasurements(id), listFiles(id)]);
  return { job, measurements, files };
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ lost?: string; job?: string }>;
}) {
  await requireAdmin();
  const { lost, job: openId } = await searchParams;
  const includeLost = lost === "1";
  const [jobs, panel] = await Promise.all([
    listJobs({ includeLost }),
    openId ? loadPanel(openId) : Promise.resolve(null),
  ]);
  const groups = groupByStage(jobs, includeLost);
  const now = new Date();

  return (
    <div className="mx-auto flex max-w-[110rem] items-start gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Jobs</h1>
          <Link href={boardHref({ lost: !includeLost, job: openId })} className="text-sm underline underline-offset-4">
            {includeLost ? "Hide lost" : "Show lost"}
          </Link>
        </header>

        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft" aria-label="Jobs per stage">
          {groups.map((group) => (
            <li key={group.stage}>
              {group.label} <span className="font-display tabular-nums text-charcoal">{group.jobs.length}</span>
            </li>
          ))}
        </ul>

        {/* Stacked on phones; one scrolling row of columns from md up. */}
        <div className="flex flex-col gap-6 md:flex-row md:gap-4 md:overflow-x-auto md:pb-4">
          {groups.map((group) => (
            <section key={group.stage} aria-labelledby={`stage-${group.stage}`} className="flex flex-col gap-3 md:w-64 md:shrink-0">
              <h2 id={`stage-${group.stage}`} className="font-display text-xs font-medium uppercase tracking-[0.18em] text-champagne-ink">
                {group.label} · {group.jobs.length}
              </h2>
              {group.jobs.length ? (
                group.jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    now={now}
                    href={boardHref({ lost: includeLost, job: job.id })}
                    selected={job.id === openId}
                  />
                ))
              ) : (
                <p className="text-sm text-ink-soft">Nothing here.</p>
              )}
            </section>
          ))}
        </div>
      </div>

      {panel ? <JobPanel {...panel} now={now} closeHref={boardHref({ lost: includeLost })} /> : null}
    </div>
  );
}
```

- [ ] **Step 5: Implement the revalidation and the shared maps link**

1. `app/admin/jobs/measure-actions.ts`: directly after each of the three `revalidatePath(\`/admin/jobs/${jobId}\`);` lines (in `saveMeasurement`, `removeMeasurement`, `removeFile`), add:

```ts
  revalidatePath("/admin");
```

2. `app/admin/jobs/[id]/page.tsx`:
   - Add `import { mapsHref } from "@/lib/admin/links";`.
   - Replace the `const mapHref = ...;` line with `const mapHref = mapsHref(job.address, job.city);`.
   - Leave everything else unchanged.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/admin --maxWorkers=2`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors outside `.next/dev/types`. This also confirms Task 2's `href` prop is now passed.

- [ ] **Step 7: Commit**

```bash
git add app/admin/page.tsx "app/admin/jobs/[id]/page.tsx" app/admin/jobs/measure-actions.ts tests/admin/board-page.test.tsx tests/admin/measure-actions.test.ts
git commit -m "feat: open the client panel beside the board at /admin?job="
```

---

### Task 5: End-to-end panel journey and full verification

**Files:**
- Modify: `e2e/admin.spec.ts`

- [ ] **Step 1: Add the e2e test** at the end of `e2e/admin.spec.ts`. The file already has `signIn(page)`, `sql()`, serial mode, and an `afterAll` that deletes leads named `E2E Tracker %`.

```ts
test("a job opens in the panel beside the board, survives a reload, and closes", async ({ page }) => {
  const name = `E2E Tracker Panel ${Date.now()}`;
  await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550102', 'e2e-panel@example.com', 'Henderson', 'phone', 'quoted')`;

  await signIn(page);
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/admin\?job=/);
  const panel = page.getByRole("complementary", { name: new RegExp(name) });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("region", { name: "Money" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("complementary", { name: new RegExp(name) })).toBeVisible();

  await page.getByRole("complementary", { name: new RegExp(name) }).getByRole("link", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("complementary")).toHaveCount(0);
});
```

Before relying on them, check the selectors against the committed code: the card's accessible name contains the job name, and the panel's `aria-label` is `<name> details`.

- [ ] **Step 2: Run the full verification**

- `npx vitest run --maxWorkers=2`: all pass (375 before this plan, plus the new tests).
- `npx tsc --noEmit`: no errors outside `.next/dev/types`.
- `npx eslint`: no new errors.

- [ ] **Step 3: Commit**

```bash
git add e2e/admin.spec.ts
git commit -m "test: end-to-end client panel open, reload, and close"
```

- [ ] **Step 4: Run the e2e test** only when a Neon branch URL is available and the user has approved one:

```
MIGRATE_DATABASE_URL=<branch url> node scripts/migrate.mjs
E2E_POSTGRES_URL=<branch url> npx playwright test e2e/admin.spec.ts --project=desktop
```

Otherwise, report that the test was written but not run. This task never deploys. Deploying stays the user's call (`npx vercel --prod`, after which the live site should be checked).
