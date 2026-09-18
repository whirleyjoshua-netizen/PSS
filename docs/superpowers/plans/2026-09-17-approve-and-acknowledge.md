# Approve the Quote, Acknowledge the Installation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer can approve their quote (moving the job to Sold) and, once installed, say whether they are happy — completing the job, or opening a service request and muting the review email.

**Architecture:** Three customer server actions following the pattern already reviewed twice on this codebase: `requireCustomer()`, refuse a job id not among the caller's own exactly as for one that does not exist, check the status precondition server-side, then one atomic `setStage`. The banner gains two action slots. No new tables.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before any Next API), React 19 server actions, Neon Postgres via `db()`, Resend, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-17-approve-and-acknowledge-design.md`

## Global Constraints

- **A customer may move a job along exactly two transitions: `quoted → sold` and `installed → completed`.** The target status is never taken from the request. Any other transition is refused.
- **Ownership first, always.** `requireCustomer()`, then refuse a job id not among the caller's jobs — answering identically to a job that does not exist, before any database handle. A test must assert the *absence of any database statement*, not merely the return value: the return value alone passes even with the check deleted.
- `toProject()` in `lib/portal/access.ts` is the portal's whitelist and does not change. No new field on `ProjectSummary`.
- **No migration.** An approval is a `stage` event with a body, not a new event kind.
- Every form works with JavaScript off: `<details>` reveals and plain `<form>` posts.
- Tailwind class names are complete literals, never built by concatenation. Existing tokens only. Works at ~400px.
- Unit tests: `npx vitest run --maxWorkers=2 <paths>`. Never run vitest alongside typecheck or build — the memory watchdog kills concurrent large runs.
- `npm run typecheck`; `npx eslint <changed paths>` — **never a bare `npm run lint`**.
- Do NOT run `scripts/migrate.mjs`, Playwright, or anything touching a database — `.env.local` holds PRODUCTION credentials. Mock the db in tests.
- **Before trusting any test that guards something, delete or weaken the guarded thing and watch it go red.** Prove the mutation applied before believing the result.

---

### Task 1: `setStage` can carry a body, without changing Lost

**Files:**
- Modify: `lib/admin/jobs.ts`
- Test: `tests/admin/jobs.test.ts`

**Interfaces (Produces):**
- `setStage(id, to, actor, options?: { reason?: string; body?: string })` — **or** a fourth parameter shaped however you judge cleanest; the requirement is the behaviour below, not a particular signature.

**Why this task exists.** Today the signature is `setStage(id, to, actor, reason?)`, and `reason` is written to the event body **only when the target is `lost`**:

```ts
const lostReason = to === "lost" ? (reason ?? null) : null;
// …
select ${id}, ${actor}, 'stage', prev.status, ${to}, ${lostReason} from prev, moved
```

An approval needs a sentence in that body for a `sold` move. Riding it on `reason` would either break Lost's semantics or silently drop the text. So the parameter widens deliberately.

- [ ] **Step 1: Write the failing tests**

```ts
it("writes the body it is given for a non-lost move", async () => {
  query.mockResolvedValue([{ id: JOB }]);
  await setStage(JOB, "sold", "john@example.com", { body: "Approved \"Quote.pdf\"" });
  const [, ...values] = query.mock.calls[0];
  expect(values).toContain("Approved \"Quote.pdf\"");
  expect(values).toContain("john@example.com");
});

it("still writes lost_reason only for lost, and does not leak it elsewhere", async () => {
  // a sold move given a reason must NOT write it as lost_reason
});

it("leaves every existing caller unchanged", async () => {
  // setStage(id, "sold", email) with no fourth argument behaves exactly as before
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run --maxWorkers=2 tests/admin/jobs.test.ts`
- [ ] **Step 3: Implement.** Keep `lost_reason` exactly as it is — it is a column on `leads`, not merely a body. The body is a separate value. Both end up in the same statement; do not split it into two.
- [ ] **Step 4: Check every existing call site still compiles and behaves identically** — `app/admin/jobs/actions.ts` (two), `app/admin/jobs/appointment-actions.ts` (one). Name them in your report.
- [ ] **Step 5: Run tests, typecheck, eslint the changed paths.**
- [ ] **Step 6: Commit** — `feat: a stage change can carry its own sentence`

---

### Task 2: Approve the quote

**Files:**
- Create: `lib/portal/approve.ts`, `lib/portal/send-approval-email.ts`, `app/(site)/project/ApproveQuote.tsx`, `tests/portal/approve.test.ts`, `tests/portal/approve-ui.test.tsx`
- Modify: `app/(site)/project/actions.ts`, `app/(site)/project/StatusBanner.tsx`, `app/(site)/project/ProjectView.tsx`

**Interfaces (Consumes):** `setStage` with a body, from Task 1.

**Interfaces (Produces):** `approveQuote(jobId, actor, quoteName): Promise<"approved" | "not-found" | "wrong-status" | "no-quote">`

- [ ] **Step 1: Write the failing tests**

```ts
it("refuses a job the customer does not own and writes nothing", async () => {
  await expect(approveQuoteAction(THEIRS)).resolves.toBe("not-found");
  expect(query).not.toHaveBeenCalled();          // the assertion with teeth
});

it("refuses when the job is not quoted", async () => { /* sold, installed, new … */ });

it("refuses when no Quote document is shared", async () => {
  // approving something they cannot read is not consent
});

it("moves the job to sold with the CUSTOMER as actor and a body naming the document", async () => {
  await approveQuote(MINE, "john@example.com", "Quote - Living room.pdf");
  const [, ...values] = query.mock.calls.at(-1);
  expect(values).toContain("sold");
  expect(values).toContain("john@example.com");
  expect(values.some((v) => typeof v === "string" && v.includes("Quote - Living room.pdf"))).toBe(true);
});

it("moves the job once when approved twice", async () => { /* setStage's status <> guard */ });
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `lib/portal/approve.ts`.** Ownership and status are checked in the action (as `requestServiceAction` does at `app/(site)/project/actions.ts:71-74`); this module does the work. The shared-quote precondition reads the documents the page already loads — `ProjectView` derives `documents.find((file) => file.docType === "quote")` at line 64 — so pass the quote in rather than re-querying, and refuse when it is absent.

- [ ] **Step 4: The action** in `app/(site)/project/actions.ts`, shaped like `requestServiceAction`: `requireCustomer()`, find the job among `jobs`, refuse identically for missing/foreign, check `status === "quoted"`, call `approveQuote`, then `after(() => notifyOwnersOfApproval(...))` and revalidate **both** `/project` and `/project/<jobId>` — a single-job customer's page IS `/project`.

- [ ] **Step 5: The email**, modelled on `lib/portal/send-message-email.ts`: plain text, `adminOrigin()` link, subject naming the customer and job. Who approved, which document, when. Note `ownerRecipients()` is **exported from `lib/leads/email.ts:7`** — `send-message-email.ts` imports it from there, so import it from its home rather than re-exporting it.

- [ ] **Step 6: The UI.** `ApproveQuote.tsx` — a `<details>` whose summary reads **"Approve this quote"**, revealing:

> Approving tells us to go ahead and order. We will email you to arrange the details.

and a confirm button. Rendered in `StatusBanner`'s action slot beside the existing **Review quote** link, only when the status is `quoted` **and** a shared quote exists. Works with JavaScript off.

- [ ] **Step 7: Focused tests, typecheck, eslint changed paths, `npm run build` alone and last.**
- [ ] **Step 8: Commit** — `feat: a customer can approve their quote`

---

### Task 3: Acknowledge the installation

**Files:**
- Create: `app/(site)/project/AcknowledgeInstall.tsx`, `tests/portal/acknowledge.test.ts`
- Modify: `app/(site)/project/actions.ts`, `lib/portal/service-request.ts`, `app/(site)/project/StatusBanner.tsx` (or `AfterWork.tsx` — judge which, see below)

**Interfaces (Consumes):** `setStage` with a body; `setReviewOptOut(id, optOut, actor)` from `lib/reviews/db.ts`; `requestService(jobId, input, options?)` from `lib/portal/service-request.ts` — today `requestService(jobId: string, input: ServiceRequestInput)`.

**The acknowledgement flag is a THIRD ARGUMENT, not a schema field — and this matters.** `serviceRequestSchema` validates *the customer's typed answers* and is parsed from `FormData`. Adding `fromAcknowledgement` to it would make provenance something a crafted post could assert, and its effect is to mute the owners' review email — so a stranger with a job's link could silence review requests. Provenance is decided by the server from which route was used, never by the submitted form. Do not "tidy" it into the schema.

- [ ] **Step 1: Write the failing tests**

```ts
it("completes the job with the customer as actor", async () => { /* installed → completed */ });
it("refuses unless the status is installed", async () => { /* quoted, sold, completed */ });
it("refuses a job the customer does not own and writes nothing", async () => { /* … */ });

it("a service request from an acknowledgement mutes the review email", async () => {
  await requestService(JOB, input, { fromAcknowledgement: true });
  expect(setReviewOptOut).toHaveBeenCalledWith(JOB, true, CUSTOMER_EMAIL);
});

it("an ordinary service request does NOT mute it", async () => {
  await requestService(JOB, input);            // no options: the default must not mute
  expect(setReviewOptOut).not.toHaveBeenCalled();
});

it("cannot be muted by a crafted form post", async () => {
  // fromAcknowledgement is NOT part of serviceRequestSchema, so a submitted field is ignored
  await requestServiceAction(previous, formDataWith({ fromAcknowledgement: "true" }));
  expect(setReviewOptOut).not.toHaveBeenCalled();
});

it("a service request from an acknowledgement leaves the job at installed", async () => { /* not completed */ });
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement the happy path** — `acknowledgeInstallAction`: ownership, status must be `installed`, `setStage(jobId, "completed", customerEmail, { body: "Confirmed the installation from their project page" })`, owner email, revalidate both paths.

- [ ] **Step 4: Implement the unhappy path.** "Something is not right" links to `/project/<jobId>/service`, carrying a marker that this came from an acknowledgement. **Handle that marker the way `?delete=blocked` is handled on the admin side**: match it against a known value and pass a boolean onwards — never render a URL string, and never let it choose a status. On submission it additionally calls `setReviewOptOut(jobId, true, customerEmail)` and says so in the owners' email. **The job stays `installed`.**

- [ ] **Step 5: The UI** — two clearly distinct actions, not one button with a tick:

> **Is everything how you wanted it?**
> [ Yes, everything looks great ] [ Something is not right ]

Shown when the status is `installed`, never on `completed`. **Judge where it belongs** — the banner's action slot, or the "after the work is done" section in `AfterWork.tsx` which already appears at `installed` and already holds the review link. Say which you chose and why in your report.

- [ ] **Step 6: Focused tests, typecheck, eslint changed paths, `npm run build` alone and last.**
- [ ] **Step 7: Commit** — `feat: a customer can tell us the installation is right, or is not`

---

### Task 4: End-to-end, and the release gate

**Files:** `e2e/portal.spec.ts`

SCOPE: write the specs and run the LOCAL checks. Do **NOT** run Playwright against a server, migrations, or a deploy — the controller does that. `npx playwright test --list` in the FOREGROUND is the only Playwright command you may run.

- [ ] **Step 1: The journeys** — a customer approves a quote and the job reads Sold on the board with the customer named in its timeline; a customer confirms an installation and it reads Completed; a customer reports a fault, a service job appears, the original stays Installed, and the review opt-out is set.

- [ ] **Step 2: The release gate.** **A customer approving must not move any other job.** Two customers, two jobs, both at `quoted`; one approves; assert in the DATABASE that the other is untouched — status, `stage_changed_at`, and no new event. Include a positive control in the same run so the gate cannot pass because nothing happened.

Write it so the mutation it must catch is obvious: **weakening the id match in the action**. The controller runs that mutation on a Neon branch before trusting the gate.

- [ ] **Step 3: Local checks** — typecheck, eslint changed paths, `npm run build`, `npx playwright test --list` in the foreground.
- [ ] **Step 4: Commit** — `test: e2e for approving and acknowledging`

- [ ] **Step 5: Controller only** — Neon branch, run the suite, **watch the gate fail with the id match weakened**, restore, delete the branch.

- [ ] **Step 6: Release (owner approval required)** — no migration. Merge to main and **push, which deploys production by itself**. Do NOT run `vercel --prod` afterwards. Verify with `vercel ls --prod` and `vercel inspect`, then approve a quote on a disposable job on the live site.
