# Customer Project Page, Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the customer's project page to match the owner's mockup (minus the hero image): a dated seven-step tracker, project details, photos **and documents**, an updates timeline, contact and referral — and make documents shareable, private by default.

**Architecture:** `toProject()` stays the single security boundary; it gains five whitelisted fields plus derived steps, and nothing else. A new `lib/portal/timeline.ts` reads only `job_events.created_at` and `to_status` for stage rows — never a body. `setShared` widens from photos to documents, keeping its job guard. The page is rebuilt from the existing tokens; no new design system.

**Tech Stack:** Next.js App Router (this repo's version — read `node_modules/next/dist/docs/` before using any Next API), React server components, Tailwind v4 tokens, Neon Postgres via `db()`, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-customer-project-page-design.md`

## Global Constraints

- **The security boundary is the point of this feature.** `ProjectView` renders only from `toProject()`. Never add `notes`, `gateCode`, `lostReason`, any `*Cents`, `budgetTier`, `source`, `heardVia`, `phone`, or any `job_events` body to `ProjectSummary` or to anything the portal renders.
- Customer-facing wording only: never "pending", a stage value, a job id, or internal vocabulary.
- Steps, in order: Consultation, Measurements, Quote Ready, Order Confirmed, In Production, Ready to Install, Installed.
- Document types: `quote`, `po`, `invoice`, `other`. Labels: Quote, PO, Invoice, Other.
- Documents and photos are **private by default**; only an explicit owner action shares them.
- Tailwind class names are complete literals; never built by concatenation. Everything works at ~400px.
- Migrations: idempotent, whole-line `--` comments only, no `;` inside comments. `scripts/migrate.mjs` re-applies every file on every run.
- Unit tests: `npx vitest run --maxWorkers=2 <paths>`. Memory is tight: NEVER run vitest alongside typecheck/lint/build; if a run is killed, re-run with `--maxWorkers=1` or a narrower path.
- Typecheck `npm run typecheck`. Lint ONLY changed files by path (`npx eslint <paths>`) — a bare `npm run lint` reports pre-existing errors from generated `.next/types` in sibling worktrees. Then `npm run build`.
- Do NOT run `scripts/migrate.mjs`, Playwright, or anything against a database — `.env.local` holds PRODUCTION credentials. Mock the db in tests.
- Never use `git stash`. Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JYGrNPPExoH7wwLxH3AEZk
  ```

---

### Task 1: Migration 016 and the project number

**Files:**
- Create: `db/migrations/016_project_page.sql`, `tests/db/migration-016.test.ts`
- Modify: `lib/admin/jobs.ts` (`Job`, `JOB_COLUMNS`, `toJob`), `lib/portal/access.ts` (`ProjectSummary`, `toProject`), `tests/admin/jobs.test.ts`, `tests/portal/access.test.ts`
- Create: `lib/portal/project-no.ts`

**Interfaces (Produces):**
- `formatProjectNo(n: number | null): string | null` in `lib/portal/project-no.ts` (client-safe, no db) — `1048` → `"PSS-1048"`, padded to at least 4 digits, `null` → `null`.
- `Job.projectNo?: number | null`; `ProjectSummary.projectNo: string | null`.

- [ ] **Step 1: Write the failing tests**

`tests/db/migration-016.test.ts` — statements parse under the migrate.mjs rules; `create sequence if not exists project_no_seq start with 1001`; `alter table leads add column if not exists project_no integer`; a backfill `update leads set project_no = nextval('project_no_seq') where project_no is null` (so a second run updates nothing); `alter table leads alter column project_no set default nextval('project_no_seq')`; `create unique index if not exists leads_project_no_key`; `alter table job_files add column if not exists doc_type text`; and a dropped-then-added `job_files_doc_type_check` allowing `doc_type is null or doc_type in ('quote','po','invoice','other')`. Every statement matches the re-runnable prefixes.

`tests/admin/jobs.test.ts` — `JOB_COLUMNS` contains `project_no`; `toJob` maps it; a row without it maps to `null`.

`tests/portal/access.test.ts` — extend the existing leak test: `toProject` returns `projectNo: "PSS-1048"` for `project_no: 1048`, and `JSON.stringify(toProject(job))` contains none of the notes text, the gate code, the lost reason, any money figure, or the budget tier.

New small test for `formatProjectNo`: `1048 → "PSS-1048"`, `7 → "PSS-0007"`, `null → null`.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`db/migrations/016_project_page.sql`:
```sql
-- A short, human-friendly project number for the customer page, and a type label for documents.
-- Every statement is safe to re-run. The backfill only touches rows that have no number yet.

create sequence if not exists project_no_seq start with 1001;

alter table leads add column if not exists project_no integer;

update leads set project_no = nextval('project_no_seq') where project_no is null;

alter table leads alter column project_no set default nextval('project_no_seq');

create unique index if not exists leads_project_no_key on leads (project_no);

alter table job_files add column if not exists doc_type text;

alter table job_files drop constraint if exists job_files_doc_type_check;

alter table job_files add constraint job_files_doc_type_check check (
  doc_type is null or doc_type in ('quote','po','invoice','other')
);
```
`create sequence if not exists` leaves an existing sequence untouched, so a second run neither restarts numbering nor renumbers jobs.

`lib/portal/project-no.ts` — pure, no imports:
```ts
/** The customer-facing project number. Internal ids never reach the portal. */
export const formatProjectNo = (n: number | null | undefined): string | null =>
  typeof n === "number" ? `PSS-${String(n).padStart(4, "0")}` : null;
```

`lib/admin/jobs.ts` — add `project_no` to `JOB_COLUMNS`, `projectNo?: number | null` to `Job`, and the mapping in `toJob`.

`lib/portal/access.ts` — `ProjectSummary` gains `projectNo: string | null`; `toProject` sets it via `formatProjectNo(job.projectNo ?? null)`.

- [ ] **Step 4: Focused tests, then the full suite once, typecheck, lint changed paths.**
- [ ] **Step 5: Commit** — `feat: a project number for the customer page`

---

### Task 2: Documents become shareable

**Files:**
- Modify: `lib/admin/files.ts`, `lib/admin/uploads.ts` (if `FileKind`/types live there), `tests/admin/files.test.ts`

**Interfaces:**
- `DOC_TYPES` and `type DocType = "quote" | "po" | "invoice" | "other"` with `docTypeLabel(t)` — put them in a client-safe module (`lib/admin/doc-types.ts`) following `lib/admin/appointment-kinds.ts`'s shape, since Task 3's UI imports them.
- `JobFile.docType?: DocType | null` (mapped in `toFile`).
- `setShared(jobId, fileId, shared, actor)` — now accepts photos **and** documents.
- `setDocType(jobId, fileId, type: DocType | null, actor): Promise<boolean>` — never touches `shared_at`.
- `listSharedDocuments(leadId): Promise<JobFile[]>`.

- [ ] **Step 1: Write the failing tests** (copy the db-mock shape from the existing files tests):
- `setShared` shares a **document** and logs it; shares a photo as before; refuses a file whose `lead_id` is a different job (the guard must stay); unsharing sets `shared_at` to null.
- The log wording is kind-aware: the current SQL hardcodes `"Shared photo "`. Assert the emitted body names the file and does not say "photo" for a document.
- `setDocType` sets the label, returns false for a non-UUID, and the emitted SQL does **not** mention `shared_at`.
- `listSharedDocuments` selects `kind = 'document' and shared_at is not null`, newest first.
- `toFile` maps `doc_type`, and a row without it maps to `null`.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** In `setShared`, change `and kind = 'photo'` to `and kind in ('photo','document')` and make the logged body use the file's kind (e.g. `'Shared ' || name || ' with customer'` / `'Stopped sharing ' || name`). Keep the `lead_id` guard exactly as it is — that clause is what stops one job's file being shared onto another. Update the doc comment, which currently says "documents are never shared".

- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths.**
- [ ] **Step 5: Commit** — `feat: documents can be shared with the customer`

---

### Task 3: The admin Files tab

**Files:**
- Modify: `app/admin/jobs/[id]/JobFiles.tsx`, `app/admin/jobs/measure-actions.ts` (a `setFileDocType` action beside the existing `setFileShared`), `tests/admin/job-files-share.test.tsx` (or the nearest existing test)
- Read first: `app/admin/jobs/[id]/ShareSwitch.tsx` — it already exists for photos and should be reused, not duplicated.

**Interfaces:**
- Consumes `DOC_TYPES`, `docTypeLabel`, `setDocType` (Task 2).
- Produces a server action `setFileDocType(jobId, fileId, type)` following `setFileShared`'s shape (`requireAdmin()` first, then revalidate).

- [ ] **Step 1: Write the failing tests** — in the documents list, each row shows a **type select** (Quote / PO / Invoice / Other, defaulting to the file's current type or blank) and a **Share with customer** control; the share control's accessible name makes the consequence explicit (e.g. "Share quote.pdf with customer"); photos keep their existing switch untouched; changing the type calls `setFileDocType` and does not call `setFileShared`.

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** In `JobFiles.tsx` the documents list is `uploads = files.filter((file) => file.kind === "document")`; add the two controls there. Reuse `ShareSwitch`. Keep the existing `sharedById` map.
- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths.**
- [ ] **Step 5: Commit** — `feat: type and share documents from the job's Files tab`

---

### Task 4: The seven steps

**Files:**
- Create: `lib/portal/timeline.ts`, `tests/portal/timeline.test.ts`
- Modify: `lib/portal/progress.ts` (or replace its `progressSteps` — see below), `lib/portal/access.ts`, `tests/portal/progress.test.ts`, `tests/portal/access.test.ts`

**Interfaces (Produces):**
- `type ProjectStep = { key: StepKey; label: string; state: "done" | "current" | "upcoming"; on: string | null }` where `on` is a formatted Las Vegas date (`"Sep 13"`) or null.
- `buildSteps(input): ProjectStep[]` — pure, taking `{ status, visitAt, lastMeasuredAt, orderedOn, installOn, stageDates, installAppointmentAt }`.
- `stageDates(jobId): Promise<Partial<Record<Stage, Date>>>` in `lib/portal/timeline.ts` — the **first** time each `to_status` was reached, from `job_events` rows of kind `stage`, selecting only `to_status` and `created_at`. **No body column may appear in the query.**
- `ProjectSummary` gains `steps: ProjectStep[]`, `windowCount`, `treatmentTypes`, `finish`, `orderedOn`.

The existing four-step `progressSteps`/`PORTAL_STAGES` is replaced by `buildSteps`. Check every consumer (`ProjectView`, tests) and remove what is no longer used; keep `PORTAL_STATUSES`/`isPortalStatus`/`toPortalStage`, which access control depends on.

- [ ] **Step 1: Write the failing tests**
- `stageDates`: the query names `to_status` and `created_at` and **not** `body`; the earliest row per status wins.
- `buildSteps`: a brand-new job (Consultation upcoming, no dates); a job with measurements but no quote (Measurements done and dated, Quote Ready current); a `sold` job (Order Confirmed done, In Production current); a job with a confirmed install appointment (Ready to Install dated); a `completed` job (every step done, Installed dated from `installOn`); and that the **current** step is the last one reached.
- Dates render as Las Vegas days, not UTC.
- `toProject` leak test extended again for the new fields.

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** `buildSteps` is pure so it is fully testable; the page passes it data it already loads. Reuse `lasVegasDate`/`formatShortDate` from `lib/admin/time` rather than new formatting.
- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths.**
- [ ] **Step 5: Commit** — `feat: the customer's seven project steps`

---

### Task 5: The page

**Files:**
- Modify: `app/(site)/project/ProjectView.tsx` (rebuilt), `app/(site)/project/layout.tsx` (the `max-w-3xl` wrapper cannot hold a multi-column page — widen it for this area), `app/(site)/project/[jobId]/page.tsx` and `page.tsx` if they must pass new data
- Create: whatever small components the page needs (`StatusBanner`, `StepTracker`, `DetailsCard`, `FilesTabs`, `UpdatesList`), each in `app/(site)/project/`
- Test: `tests/portal/project-view.test.tsx`, `tests/portal/project-pages.test.tsx`

**Interfaces:**
- Consumes `ProjectSummary` (with `steps`), `listSharedPhotos`, `listSharedDocuments`, `formatProjectNo`, `docTypeLabel`.

Build the mockup's layout, **minus the hero image**: header (greeting, address, project number, Sign out); status banner with a **Review quote** link when a shared Quote document exists, informational otherwise; the seven-step tracker (horizontal on desktop, stacked on phones); Next step; Project details (window count, treatment types, finish, estimated production while In Production is current, install date or "Not scheduled yet"); Installation; Project updates (fixed labels from the step dates — **never** an event body); Photos & Documents tabs; Contact; Refer a friend.

- [ ] **Step 1: Write the failing tests** — the tabs are real buttons with `aria-selected` and both panels exist without JavaScript; Documents lists shared documents with their type label and a `/project/files/<id>` link; the empty states; the banner with and without a shared quote; the project number renders as `PSS-1048`; and a leak test rendering a job whose notes, gate code and lost reason are set, asserting none of those strings appear in the output.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Existing tokens only (`font-display`, champagne/ivory/charcoal, `border-rule`). Read `node_modules/next/dist/docs/` before using any Next API.
- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths, `npm run build`.**
- [ ] **Step 5: Commit** — `feat: the customer project page`

---

### Task 6: End-to-end and full verification

**Files:**
- Modify: `e2e/portal.spec.ts` (it asserts the old page), `playwright.config.ts` only if a new owner email is needed

SCOPE: write the specs and run the local checks. Do **NOT** run Playwright, migrations, or a deploy — the controller does that.

- [ ] **Step 1: Update and extend the portal spec** — the existing tests assert the old layout and must be brought to the new one. Add: an owner shares a document from the admin, the customer sees it under Documents and can open it, the owner unshares it and it disappears; and a mid-flow job shows the right current step with its dates.
- [ ] **Step 2: Unit suite, typecheck, lint changed paths, `npm run build`, and `npx playwright test --list` in the FOREGROUND** (a detached shell exits 0 with "not recognized" — a false pass).
- [ ] **Step 3: Commit** — `test: e2e for the customer project page`
- [ ] **Step 4: E2E (controller):** Neon test branch cut from `main`, migrate, full desktop run, delete the branch.
- [ ] **Step 5: Release (owner approval required):** migrate production (016) **before** deploying, `vercel --prod`, verify with `vercel ls --prod` and `vercel inspect` rather than the exit code, then look at a real project page.
