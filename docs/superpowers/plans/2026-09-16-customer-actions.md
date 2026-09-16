# What a Customer Can Do From Their Project Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer can send a message, request a service visit, and leave a review from their project page — and a customer with several projects can tell them apart.

**Architecture:** Three new write paths on the customer portal, which until now was read-only. Each re-derives the caller's jobs from the session and refuses a job id they do not own. A service request creates a real job through `createJob()` so it is geocoded, scheduled and invoiced like any other work.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before any Next API), React 19 server components and server actions, Neon Postgres via `db()`, Resend, zod 4, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-customer-actions-design.md`

## Global Constraints

- **`lib/portal/access.ts`'s `toProject()` is a whitelist and the portal's security boundary.** A customer must never see `notes`, `gateCode`, `lostReason`, money, `budgetTier`, `source`, `heardVia`, internal ids, or any `job_events` body.
- **Every new action calls `requireCustomer()` and refuses a `jobId` not in the returned jobs.** A foreign id gets the same response as a non-existent one — no information about what exists.
- A service job is created through `createJob()`. Never insert into `leads` directly.
- Tailwind class names are complete literals, never built by concatenation. Everything works at ~400px.
- Every form works with JavaScript off: plain `<form>` posts to server actions.
- Migration numbers: **019 is ours.** 017 (pss-d1) and 018 (pss-c7) belong to other branches.
- Unit tests `npx vitest run --maxWorkers=2 <paths>`. **The full suite cannot run on this machine — the memory watchdog kills it, even single-worker.** Run focused paths. Never run vitest alongside typecheck or build.
- `npm run typecheck`; `npx eslint <changed paths>` — **never a bare `npm run lint`** (it walks other worktrees' generated types).
- Do not run `scripts/migrate.mjs`, Playwright, or anything touching a database — `.env.local` holds PRODUCTION credentials. Mock the db in tests.
- **Before trusting any test that guards something, delete the thing it guards and watch it go red.**

---

### Task 1: The data — migration 019, and widening `createJob`

**Files:**
- Create: `db/migrations/019_service_requests.sql`, `tests/db/migration-019.test.ts`
- Modify: `lib/admin/jobs.ts` (`Job`, `JOB_COLUMNS`, `toJob`, `createJob`), `lib/admin/schema.ts` (source enum), `tests/admin/jobs.test.ts`

**Interfaces (Produces):**
- `Job` gains `parentJobId: string | null`.
- `JOB_SOURCES = [...HAND_SOURCES, "service"]`; `newJobSchema.source` uses `JOB_SOURCES`. **`HAND_SOURCES` stays exactly as it is** — it drives the admin's Add-job dropdown, which must not offer "Service".
- `createJob(input: NewJobInput, actor: string, options?: { parentJobId?: string; eventBody?: string }): Promise<string>`

- [ ] **Step 1: Understand the `job_events.kind` constraint you are about to change**

`job_events.kind` **has** a check constraint, `job_events_kind_check`. It was declared inline in `002_job_tracker.sql` and has been dropped and re-added since by `003`, `004` and `011`. **`011_stages_contact_log.sql` is the last to define it and therefore the one that wins**, because `scripts/migrate.mjs` applies every migration in filename order on every run. Its current value list is:

```
kind in ('stage','note','edit','email','reward','measure','file','contact')
```

Tasks 2 and 5 write two new kinds — `'message'` and `'service'` — so 019 must drop and re-add this constraint listing **all ten**. The convention in this repo is that every migration touching it re-lists every kind, so run order can never narrow it. Dropping a kind that another migration added would break inserts on a live table, so copy the eight above verbatim rather than from memory.

- [ ] **Step 2: Write the migration**

`db/migrations/019_service_requests.sql`. Idempotent — `scripts/migrate.mjs` re-applies every migration on every run. Whole-line `--` comments only, no `;` inside a comment.

```sql
-- A service request creates a new job that points back at the original.
alter table leads add column if not exists parent_job_id uuid references leads(id);
create index if not exists leads_parent_job_id_idx on leads (parent_job_id);

-- 011_stages_contact_log.sql last defined this check; every migration that touches it
-- lists every kind, so run order can never narrow it. 'message' is a customer's message
-- from their project page, 'service' is a customer's service request.
alter table job_events drop constraint if exists job_events_kind_check;
alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service')
);
```

- [ ] **Step 3: Write the failing tests**

`tests/db/migration-019.test.ts`. Follow `tests/db/migration-016.test.ts`'s **actual** shape: it strips whole-line comments, splits on `;`, and normalises whitespace, so an assertion cannot be satisfied by a commented-out line and an exact statement can be pinned.

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FILE = "db/migrations/019_service_requests.sql";

const statements = readFileSync(FILE, "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

const all = statements.join(" ");

describe("migration 019", () => {
  it("adds parent_job_id idempotently, as a real reference", () => {
    expect(all).toContain("alter table leads add column if not exists parent_job_id uuid references leads(id)");
  });

  it("indexes it, so the parent lookup does not scan", () => {
    expect(all).toContain("create index if not exists leads_parent_job_id_idx on leads (parent_job_id)");
  });

  // The failure this pins is a NARROWED constraint: re-adding it without a kind that an
  // earlier migration added breaks inserts on a live table.
  it("re-adds the kind check with every existing kind plus the two new ones", () => {
    const check = statements.find((s) => s.includes("add constraint job_events_kind_check"));
    expect(check).toBeDefined();
    for (const kind of ["stage", "note", "edit", "email", "reward", "measure", "file", "contact", "message", "service"]) {
      expect(check).toContain(`'${kind}'`);
    }
  });

  it("drops the old constraint first, or the re-add fails on an existing database", () => {
    expect(all).toContain("drop constraint if exists job_events_kind_check");
  });
});
```

In `tests/admin/jobs.test.ts`, assert `createJob` passes a parent id and a custom event body through:

```ts
it("records the parent job and the opening note it is given", async () => {
  query.mockResolvedValue([{ id: "11111111-1111-4111-8111-111111111111" }]);
  await createJob(input, "owner@example.com", { parentJobId: PARENT, eventBody: "Service requested by the customer" });
  const [strings, ...values] = query.mock.calls[0];
  expect(strings.join("?")).toContain("parent_job_id");
  expect(values).toContain(PARENT);
  expect(values).toContain("Service requested by the customer");
});
```

- [ ] **Step 4: Run to verify failure.** `npx vitest run --maxWorkers=2 tests/db/migration-019.test.ts tests/admin/jobs.test.ts` — expect failures naming `parent_job_id`.

- [ ] **Step 5: Implement**

In `lib/admin/schema.ts`, beside `HAND_SOURCES`:

```ts
/** Sources a job may be created with. HAND_SOURCES is what the Add-job form offers;
 *  "service" is set by the customer's own service request and never appears in that list. */
export const JOB_SOURCES = [...HAND_SOURCES, "service"] as const;
```

and change `newJobSchema.source` to `z.enum(JOB_SOURCES)`. Leave the Add-job form's options alone.

In `lib/admin/jobs.ts`: add `parentJobId` to `Job`, to `JOB_COLUMNS`, and to `toJob` (`row.parent_job_id as string | null`). Widen `createJob`:

```ts
export async function createJob(
  input: NewJobInput,
  actor: string,
  options: { parentJobId?: string; eventBody?: string } = {},
): Promise<string> {
  const installed = isInstalled(input.stage);
  const body = options.eventBody ?? (installed ? "Added by hand (review request off)" : "Added by hand");
  // ... same CTE, with parent_job_id added to the column list and ${options.parentJobId ?? null} to values,
  //     and ${body} in place of the literal.
}
```

- [ ] **Step 6: Run tests, typecheck, eslint the changed paths.**
- [ ] **Step 7: Commit** — `feat: a job can point back at the job it came from`

---

### Task 2: A customer can send a message

**Files:**
- Create: `lib/portal/messages.ts`, `lib/portal/send-message-email.ts`, `app/(site)/project/MessageForm.tsx`, `tests/portal/messages.test.ts`
- Modify: `app/(site)/project/actions.ts`, `app/(site)/project/ProjectView.tsx` (contact section, currently at :151)

**Interfaces (Produces):**
- `sendMessage(jobId, body, email): Promise<"sent" | "throttled" | "too-long" | "not-found">` in `lib/portal/messages.ts`
- `listMessages(jobId): Promise<{ body: string; createdAt: Date }[]>` — the customer's own messages on their own job.

- [ ] **Step 1: Write the failing tests**

`tests/portal/messages.test.ts`, mocking `@/lib/db`:

```ts
it("refuses a job the customer does not own", async () => {
  // requireCustomer mocked to return jobs: [{ id: MINE }]
  await expect(sendCustomerMessage(THEIRS, "hello")).resolves.toBe("not-found");
  expect(query).not.toHaveBeenCalled();     // nothing is written at all
});

it("accepts a second message inside the window without erroring", async () => {
  query.mockResolvedValueOnce([{ created_at: new Date() }]);   // a message seconds ago
  await expect(sendMessage(MINE, "again", EMAIL)).resolves.toBe("throttled");
});

it("rejects a body over 2000 characters", async () => {
  await expect(sendMessage(MINE, "x".repeat(2001), EMAIL)).resolves.toBe("too-long");
});

it("writes the message as a job event before sending any email", async () => { /* order assertion */ });
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `lib/portal/messages.ts`**

```ts
import "server-only";
import { db } from "@/lib/db";

export const MESSAGE_MAX = 2000;
const THROTTLE_SECONDS = 60;

export async function sendMessage(jobId: string, body: string, actor: string) {
  const text = body.trim();
  if (!text) return "empty" as const;
  if (text.length > MESSAGE_MAX) return "too-long" as const;

  const sql = db();
  const [recent] = await sql`
    select created_at from job_events
    where lead_id = ${jobId} and kind = 'message'
    order by created_at desc limit 1`;
  if (recent && Date.now() - new Date(recent.created_at as string).getTime() < THROTTLE_SECONDS * 1000) {
    return "throttled" as const;
  }

  const rows = await sql`
    insert into job_events (lead_id, actor, kind, body)
    values (${jobId}, ${actor}, 'message', ${text})
    returning id`;
  return rows.length > 0 ? ("sent" as const) : ("not-found" as const);
}
```

The **event row is written before the email is sent**, so a Resend failure cannot lose the customer's words.

- [ ] **Step 4: Implement the action** in `app/(site)/project/actions.ts`:

```ts
export async function sendCustomerMessage(jobId: string, body: string) {
  const { email, jobs } = await requireCustomer();
  if (!jobs.some((job) => job.id === jobId)) return "not-found" as const;   // same answer as a job that does not exist
  const result = await sendMessage(jobId, body, email);
  if (result === "sent") after(() => notifyOwnersOfMessage(jobs.find((j) => j.id === jobId)!, body).catch(console.error));
  revalidatePath(`/project/${jobId}`);
  return result;
}
```

Read `node_modules/next/dist/docs/` on `after()` before using it.

- [ ] **Step 5: The email** — `lib/portal/send-message-email.ts`, modelled on `lib/leads/email.ts`: plain text, `ownerRecipients()` from `LEAD_NOTIFICATION_EMAIL`, `replyTo` the customer's own address so a reply reaches them, subject `Message from <name> — PSS-1002`, body containing the message, the project number, and `${adminOrigin()}/admin/jobs/<id>`.

- [ ] **Step 6: The UI** — `MessageForm.tsx`, a client component only for the pending state; the form itself is a plain `<form action={…}>` with a `<textarea name="body" maxLength={2000} required>` and a Send button. Under it, the customer's own sent messages, newest first, each with its date. Render inside the existing contact `<section>` in `ProjectView.tsx`.

Confirmation copy on success: **"Thanks — we have your message and will come back to you."** On `throttled`, show the same thing: a double-click is not an error.

- [ ] **Step 7: Focused tests, typecheck, eslint changed paths.**
- [ ] **Step 8: Commit** — `feat: a customer can send a message about their project`

---

### Task 3: Leave a review, and the "after the work is done" section

**Files:**
- Create: `app/(site)/project/AfterWork.tsx`, `tests/portal/after-work.test.tsx`
- Modify: `app/(site)/project/ProjectView.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it("does not appear before the work is done", () => {
  render(<AfterWork project={{ ...project, status: "quoted" }} />);
  expect(screen.queryByRole("link", { name: /leave a review/i })).toBeNull();
});

it("offers a review link once installed", () => {
  render(<AfterWork project={{ ...project, status: "installed" }} />);
  const link = screen.getByRole("link", { name: /leave a review/i });
  expect(link).toHaveAttribute("href", business.googleBusinessProfile);
  expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** The section renders only when the portal status is `installed`. It holds the review link and (after Task 5) the "Request a service" link. Copy: *"Happy with the work? A review helps two people running a small business more than you would think."* Existing tokens only.
- [ ] **Step 4: Focused tests, typecheck, eslint.**
- [ ] **Step 5: Commit** — `feat: a review link once the work is done`

---

### Task 4: The project list names its projects

**Files:**
- Modify: `app/(site)/project/page.tsx`
- Test: `tests/portal/project-pages.test.tsx`

Today every row renders `address, city` and falls back to "Your project", so two jobs in one city are identical. Rows become the project number, the address, and the current step.

- [ ] **Step 1: Write the failing test** — two jobs in Las Vegas, one without a street address; assert both rows are distinguishable and each shows its `PSS-` number and its current step label.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Build each row from `toProject()` (never from `Job` directly — the whitelist is the boundary), using `formatProjectNo` and the `current` step's label from `buildSteps`. A job with no street address shows the city; the number still distinguishes it.
- [ ] **Step 4: Focused tests, typecheck, eslint.**
- [ ] **Step 5: Commit** — `feat: the project list names each project`

---

### Task 5: Request a service

**Files:**
- Create: `app/(site)/project/[jobId]/service/page.tsx`, `ServiceForm.tsx`, `lib/portal/service-request.ts`, `lib/portal/service-schema.ts`, `lib/portal/send-service-email.ts`, `tests/portal/service-request.test.ts`
- Modify: `app/(site)/project/actions.ts`, `app/(site)/project/AfterWork.tsx`

**Interfaces (Consumes):** `createJob(input, actor, { parentJobId, eventBody })` from Task 1; `listMeasurements` and `describe` from `lib/admin/measurements.ts`; `createFile` from `lib/admin/files.ts`.

- [ ] **Step 1: The schema** — `lib/portal/service-schema.ts`, zod 4, client-safe (no `server-only`, no db import):

```ts
export const ISSUES = [
  { value: "wont-move", label: "Will not go up or down" },
  { value: "crooked", label: "Crooked or uneven" },
  { value: "damaged", label: "Damaged or broken" },
  { value: "motor", label: "Remote or motor not working" },
  { value: "other", label: "Something else" },
] as const;

export const serviceRequestSchema = z.object({
  windowId: z.string().optional(),                 // a measurement id, when picked from the list
  windowText: z.string().max(120).optional(),      // "somewhere else"
  issue: z.enum(ISSUES.map((i) => i.value) as [string, ...string[]], { error: "Tell us what is happening" }),
  details: z.string().max(2000).optional(),
}).refine((v) => v.windowId || v.windowText?.trim(), { error: "Tell us which window", path: ["windowText"] });
```

- [ ] **Step 2: Write the failing tests**

```ts
it("refuses a job the customer does not own", async () => {
  await expect(requestService(THEIRS, form)).resolves.toBe("not-found");
  expect(createJob).not.toHaveBeenCalled();
});

it("refuses a job that is not installed yet", async () => { /* quoted job → "not-found" */ });

it("creates the new job through createJob, never a direct insert", async () => {
  await requestService(MINE, form);
  expect(createJob).toHaveBeenCalledWith(
    expect.objectContaining({ source: "service", stage: "new", name: PARENT.name, address: PARENT.address }),
    expect.any(String),
    expect.objectContaining({ parentJobId: MINE }),
  );
});

it("still creates the job when the photo fails", async () => {
  createFile.mockRejectedValue(new Error("blob down"));
  await expect(requestService(MINE, formWithPhoto)).resolves.toBe("created");
});
```

- [ ] **Step 3: Run to verify failure.**

- [ ] **Step 4: Implement `lib/portal/service-request.ts`.** Ownership and status checked first; then `createJob` with `source: "service"`, `stage: "new"`, name/phone/email/address/city copied from the parent, `notes` set to the formatted answers, and `{ parentJobId, eventBody: "Service requested by the customer" }`. Then, if a photo was given, `createFile({ leadId: newJobId, kind: "photo", … })` inside its own try/catch — **a failed photo must not fail the request**. Then the owner email via `after()`.

- [ ] **Step 5: The page and form.** `/project/<jobId>/service` renders only for a job the customer owns that is installed; otherwise `notFound()`. The window picker lists `listMeasurements(jobId)` through `describe()` plus a "Somewhere else" option revealing a text box (use `<details>` or a always-present text input — it must work with JavaScript off). File input `accept="image/*"`, capped at 10 MB with the cap stated in the copy.

- [ ] **Step 6: The email** — same shape as Task 2's: what is wrong, which window, the customer's words, the parent project number, and a link to the NEW job.

- [ ] **Step 7: Confirmation.** After submitting, the customer lands back on their project page, which shows *"Service requested on Sep 16 — we will be in touch."* under the after-work section.

- [ ] **Step 8: Focused tests, typecheck, eslint, `npm run build` alone and last.**
- [ ] **Step 9: Commit** — `feat: a customer can request a service visit`

---

### Task 6: The admin sees where a service job came from

**Files:**
- Modify: `app/admin/jobs/[id]/OverviewTab.tsx` (or the job header), the board card component
- Test: `tests/admin/job-page.test.tsx`, the board card's test

- [ ] **Step 1: Write the failing tests** — a job with `parentJobId` shows a link reading `Service request for PSS-1002` pointing at `/admin/jobs/<parent>`; a job without one shows nothing. The board card for a `source === "service"` job carries a visible Service marker; an ordinary card does not.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Read the parent's `project_no` for the label. Keep the marker small — a word, in the existing type scale, not a new colour.
- [ ] **Step 4: Focused tests, typecheck, eslint.**
- [ ] **Step 5: Commit** — `feat: a service job links back to the job it came from`

---

### Task 7: End-to-end, and the release gate

**Files:** `e2e/portal.spec.ts`

SCOPE: write the specs and run the LOCAL checks. Do **NOT** run Playwright against a server, migrations, or a deploy — the controller does that.

- [ ] **Step 1: Add the journeys** — a customer sends a message and it appears on the job in the admin; a customer requests a service and a new job appears linked to the original, with the original page showing the requested line.

- [ ] **Step 2: The release gate.** A customer attempts a service request naming ANOTHER customer's job id, and no job is created. Assert on the effect (no new row, nothing on either customer's page), not on a status code. Follow `e2e/portal.spec.ts`'s existing `download`/`expectNotFound` helpers — and note the comment block there explaining why the file-sharing cross-job case cannot be proven from a browser. **Say in your report whether this gate has the same problem**: if server-action argument binding makes the attack unreachable from a browser, say so plainly and put the proof where it can actually run, rather than leaving a test that cannot fail.

- [ ] **Step 3: Local checks** — typecheck, eslint changed paths, `npm run build`, and `npx playwright test --list` **in the foreground** (a detached shell exits 0 with "not recognized" — a false pass).

- [ ] **Step 4: Commit** — `test: e2e for the customer's actions`

- [ ] **Step 5: Controller only** — Neon test branch, migrate, full desktop run, **and watch the gate fail with the ownership check removed** before trusting it. Then delete the branch.

- [ ] **Step 6: Release (owner approval required)** — migrate production (019) **before** deploying, `vercel --prod`, verify with `vercel ls --prod` and `vercel inspect` rather than the exit code, then open a real project page.
