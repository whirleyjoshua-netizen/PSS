# Deposit Flow (Quote → Approve → Sign → Deposit → Sold → Official measure) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a Direct Connect quote is sent, the job moves on its own: Quoted → client approves → contract sent automatically → client signs (Signed) → 50% deposit by Stripe or recorded by the owner (Sold) → measure appointment confirmed (Official measure), with a refund-and-cancel path inside the 3-business-day window.

**Architecture:** Migration 030 adds three stages, the `offered`/`cancelled` DC version statuses, the approval stamps and a `deposits` table. `lib/dc/send.ts` splits into `sendQuote` (freezes the price, shares a quote PDF) and `sendContract` (from an approved, offered version); `lib/dc/approve.ts` records the approval. `lib/payments/*` holds the Stripe client, every deposit write (each one data-modifying CTE, idempotent on `status = 'pending'`/`'paid'`) and the receipts. A verified webhook or an owner is the only thing that marks a deposit paid.

**Tech Stack:** Next.js 16.3.3 App Router (server actions, route handlers, `after()`), React 19, Neon Postgres via `@neondatabase/serverless` tagged templates, zod 4, Stripe Node SDK 22, Vitest 4 + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-deposit-flow-design.md`

**Worktree:** `C:\Users\whirl\pss\.claude\worktrees\deposit-flow`, branch `feat/deposit-flow`. Run every command from there. Before editing, confirm `git rev-parse --abbrev-ref HEAD` prints `feat/deposit-flow`. `node_modules` is installed there by `npm ci` (never a junction).

## Global Constraints

- Migration number is **030** (`030_deposit_flow.sql`). 027 install extras, 028 measure quantity (pss-7a) and 029 visible signatures (pss-dd) are claimed.
- Every migration statement is safe to re-run: `create … if not exists`, `add column if not exists`, and each named constraint dropped (`drop constraint if exists`) before it is added. Whole-line `--` comments only, never a semicolon in a comment (migrate.mjs splits on `;`).
- `leads_status_check` is defined in 002, 011, 012 and 030; every copy carries the full 11-value list `('new','visit_booked','quoted','approved','signed','sold','measure','ordered','installed','completed','lost')`.
- `job_events` kind list is repeated in 002 (inline), 003, 004, 011, 019, 021, 024, 026 and 030; every copy is `('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document','payment')` — `'document'` stays. `tests/db/migration-checks-consistent.test.ts` enforces identical named copies.
- DC version statuses: `('draft','offered','sent','signed','superseded','cancelled')` in 024's inline check and 030's named `dc_quote_versions_status_check`.
- One logical write = one `db()` call = one data-modifying CTE (precedents: `saveInstallQuote` in `lib/admin/install-quotes.ts`, `recordSignature` in `lib/portal/sign.ts`, `sendContract` in `lib/dc/send.ts`). Never `sql.transaction()`, never two `db()` calls for one write.
- Money is integer cents. Deposit = `Math.round(soldCents / 2)` in TypeScript and `(client_total_cents + 1) / 2` (integer division) in SQL — identical for every non-negative integer (half cent rounds up).
- Stripe: dependency `stripe@^22.6.2`; env `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (test-mode keys only in development); `STRIPE_API_URL` is a test-only override honoured only for `127.0.0.1`/`localhost`. Unit tests never reach Stripe: they mock `@/lib/payments/stripe`, or sign bodies with `stripe.webhooks.generateTestHeaderString`. e2e talks to the local stub in `e2e/fixtures/stripe-stub.ts`.
- The portal never trusts a redirect flag: only a verified webhook or an owner marks a deposit paid; `?deposit=done` only chooses which true sentence to show.
- Event actors: the customer's email for their own acts, the owner's email for owner acts, `"Stripe"` for card payments, `"Sent on approval"` for the contract sent automatically on approval.
- Coordination with pss-dd: migration 029 (visible signatures) is merged and live; this branch merged `origin/main` at `2ea968d`, and every code block below is written against that merged state (`renderContractPdf` returning `{ bytes, marks }`, `createFile({ …, signMarks })`, `recordSignature({ …, adoption })` storing adoption images first, `signContractAction` validating the adoption). Tasks 1–6 touch nothing 029 changed; Tasks 7–9 build on it. Never edit `signContractAction` or `app/(site)/project/SignContract.tsx`. `recordSignature` stays ONE statement (only the stage target of its `sold` step changes). Keep 029's `renderContractPdf` + `signMarks` pass-through into `createFile`. Keep `'document'` in every kind list. Before Task 7, run `git fetch origin && git merge --no-edit origin/main` again if `origin/main` has moved, and re-run the full suite.
- Playwright `getByLabel`/`getByRole` names are case-insensitive substring matches. New names, checked against every `e2e/*.spec.ts`: labels "Deposit received", "Paid by"; buttons "Send quote", "Payment received", "Record payment", "Cancel & refund", "Yes, cancel and refund", "Keep the order", "Keep waiting", portal "Pay 50% deposit — $X". "Send contract" is kept as the owner's recovery button.
- Commands: `npx vitest run --maxWorkers=2 <files>`; typecheck `npx tsc --noEmit` (ignore errors under `.next/`; in a fresh worktree run `npx next typegen` first); lint changed files by path `npx eslint <files>`. When a step says "Expected: PASS", quote the vitest summary lines (`Test Files …`, `Tests …`) verbatim in your report.
- Neon test branches need the owner's OK **each time** before one is created. Never print a connection string: write it to the scratchpad and check it does **not** contain `ep-cold-term` (production). Neon project id: `misty-fire-51038688`.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0122UD6P8agX8gRaojNYtEiL
  ```

## Review Focus

1. **Duplicate and out-of-order Stripe webhook deliveries.** Stripe retries and may send `checkout.session.completed` twice, or `expired` after `completed`. A repeat must change nothing and email nobody; `expired` must never touch a paid deposit. Task 3 pins the SQL guards (`status = 'pending'`), Task 4 tests a duplicate delivery (no receipts, no alert) and an `expired` after payment; Task 10's verify script runs both against Postgres.
2. **The client double-clicks "Pay 50% deposit".** Two posts must not create two Checkout Sessions or two pending rows. The one-pending unique index plus an idempotency key per deposit row (`deposit-<id>`) make both posts land on one session. Task 5 tests two concurrent `startDepositAction` calls; Task 10 runs `claimStripeDeposit` twice for real and clicks Pay twice in e2e.
3. **The owner presses "Payment received" while a card payment is in flight.** Recording must first close the open Checkout Session; if Stripe says it is already complete, refuse ("The client is paying by card right now…"). A card payment that still arrives for an expired row alerts the owners to refund it instead of silently double-charging. Tasks 6 and 4 test both; Task 10 runs the SQL.
4. **Approve pressed twice, or the contract fails after the approval is saved.** A second approval is a no-op answering "approved"; a PDF/Blob failure leaves the job Approved, emails the owners "contract not sent", and the Quote tab offers **Send contract**. Task 8 tests the owner's Send contract, Task 9 the client's double approval and the failure path.
5. **A quote re-sent (new version) after approval.** `sendQuote` supersedes and unshares the earlier offered/sent version's quote and unsigned contract and moves an Approved job back to Quoted so the client approves the new price; a job past Signed keeps its stage and is offered the change to approve. Task 8 tests the CTE text, Task 9 the portal condition; Task 10 runs `sendQuote`'s statement for real (superseding v1) and proves the deferred one-offered constraint accepts supersede-and-offer in one statement.

(Also covered, not in the five: the owner moving the job by hand mid-flow — deposits still record, the stage only moves from Signed — Task 3; the Official-measure move only from Sold — Task 1.)

## File map

| File | Change | Task |
| --- | --- | --- |
| `db/migrations/030_deposit_flow.sql` | create | 1 |
| `db/migrations/002, 003, 004, 011, 012, 019, 021, 024, 026` | status/kind/version lists | 1 |
| `lib/admin/stages.ts`, `components/admin/icons.tsx`, `app/globals.css`, `app/admin/jobs/[id]/StageStepper.tsx`, `lib/admin/overdue.ts`, `lib/admin/jobs.ts`, `app/admin/ad-conversions/route.ts`, `app/admin/jobs/appointment-actions.ts` | stages, colours, overdue, conversions, measure confirm | 1 |
| `lib/portal/progress.ts`, `app/(site)/project/StatusBanner.tsx`, `app/(site)/project/UpdatesList.tsx` | portal steps | 2 |
| `lib/payments/stripe.ts`, `lib/payments/deposits.ts`, `package.json` | Stripe client, deposit SQL | 3 |
| `app/api/stripe/webhook/route.ts`, `lib/payments/emails.ts`, `lib/dc/notify.ts` | webhook, receipts | 4 |
| `app/(site)/project/deposit-actions.ts`, `DepositCard.tsx`, `PayDepositButton.tsx`, `ProjectView.tsx`, `page.tsx`, `[jobId]/page.tsx`, `lib/portal/send-signature-email.ts` | portal deposit | 5 |
| `app/admin/jobs/[id]/deposit-actions.ts`, `DepositPanel.tsx`, `QuoteTab.tsx` | owner payment/refund | 6 |
| `lib/portal/sign.ts`, `scripts/verify-contract-signing.ts`, `scripts/verify-dc-quote-import.ts` | Signed stage | 7 |
| `lib/dc/contract-pdf.ts`, `lib/dc/quote-pdf.ts`, `lib/dc/send.ts`, `lib/dc/store.ts`, `lib/dc/approve.ts`, `lib/dc/send-quote-email.ts`, `app/admin/jobs/[id]/quote-actions.ts`, `QuoteReview.tsx`, `scripts/verify-dc-quote-import.ts` | send split | 8 |
| `app/(site)/project/actions.ts` (approve only), `ApproveQuote.tsx`, `ProjectView.tsx`, `lib/portal/approve.ts`, `lib/portal/send-approval-email.ts`, `e2e/portal.spec.ts` | portal approval | 9 |
| `scripts/verify-deposit-flow.ts` (+ config), `e2e/fixtures/stripe-stub.ts`, `e2e/dc-quote.spec.ts`, `playwright.config.ts` | real DB + e2e | 10 |

---

### Task 1: Stages, migration 030 and the Official-measure move

**Files:**
- Create: `db/migrations/030_deposit_flow.sql`, `tests/db/migration-030.test.ts`, `tests/admin/ad-conversions-route.test.ts`
- Modify: `db/migrations/002_job_tracker.sql:8-11,34`, `003_measure_and_files.sql:39-41`, `004_referrals_reviews.sql:19-21`, `011_stages_contact_log.sql:9-11,18-20`, `012_completed_stage.sql:6-8`, `019_service_requests.sql:15-17`, `021_contract_signing.sql:16-18`, `024_dc_quote_import.sql:25,111-113`, `026_documents.sql:72-74`
- Modify: `lib/admin/stages.ts`, `components/admin/icons.tsx:2-22`, `app/globals.css:44-50`, `app/admin/jobs/[id]/StageStepper.tsx:5-13`, `lib/admin/overdue.ts:6-11`, `lib/admin/jobs.ts:80`, `app/admin/ad-conversions/route.ts`, `app/admin/jobs/appointment-actions.ts:66-68`
- Test (modify): `tests/admin/stages.test.ts`, `tests/admin/overdue.test.ts`, `tests/admin/appointment-actions.test.ts`, `tests/admin/board.test.tsx:21`, `tests/admin/board-page.test.tsx:97`, `tests/admin/job-list.test.tsx:65`, `tests/admin/job-page.test.tsx:87,103`, `tests/admin/stage-stepper.test.tsx`, `tests/db/migration-011.test.ts:8,20`, `tests/db/migration-012.test.ts:8`, `tests/db/migration-026.test.ts:10`

**Interfaces:**
- Produces: `Stage` now includes `"approved" | "signed" | "measure"`; `STAGES` order new, visit_booked, quoted, approved, signed, sold, measure, ordered, installed, completed; `stageIndex(stage: Stage): number` (-1 for lost); `BOOKED_OR_LATER: readonly Stage[]` (visit_booked…completed); `SOLD_OR_LATER: readonly Stage[]` (sold…completed); `JobEvent["kind"]` includes `"payment"`; icon name `"pen"`; CSS tokens `--color-stage-approved|signed|measure`. Tables/columns listed in the migration below.

- [ ] **Step 1: Write the migration test**

`tests/db/migration-030.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ALL_STAGES } from "@/lib/admin/stages";

const source = readFileSync("db/migrations/030_deposit_flow.sql", "utf8");
const statements = source.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const find = (text: string) => statements.find((s) => s.includes(text));
const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(",");
/** A migration file with comments removed and whitespace folded, so a list can be found whatever its line breaks. */
const flat = (file: string) => readFileSync(`db/migrations/${file}`, "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").replace(/\s+/g, " ");

const KINDS = ["stage", "note", "edit", "email", "reward", "measure", "file", "contact", "message", "service", "signature", "quote", "document", "payment"];
const STATUS_FILES = ["002_job_tracker.sql", "011_stages_contact_log.sql", "012_completed_stage.sql", "030_deposit_flow.sql"];
const KIND_FILES = ["003_measure_and_files.sql", "004_referrals_reviews.sql", "011_stages_contact_log.sql", "019_service_requests.sql",
  "021_contract_signing.sql", "024_dc_quote_import.sql", "026_documents.sql", "030_deposit_flow.sql"];
const VERSION_STATUSES = "status in ('draft','offered','sent','signed','superseded','cancelled')";

describe("migration 030", () => {
  it("never puts a semicolon inside a comment", () => {
    for (const line of source.split("\n")) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });

  it("is re-runnable: every statement creates if missing, adds a column if missing, or drops before it adds", () => {
    for (const s of statements) {
      expect(s).toMatch(/^(create table if not exists|create (unique )?index if not exists|alter table \w+ (drop constraint if exists|add constraint|add column if not exists))/);
    }
  });

  it("allows every stage the app has, in the app's order, in all four files that define the check", () => {
    expect(ALL_STAGES).toEqual(["new", "visit_booked", "quoted", "approved", "signed", "sold", "measure", "ordered", "installed", "completed", "lost"]);
    for (const file of STATUS_FILES) expect(flat(file), file).toContain(`status in (${list(ALL_STAGES)})`);
  });

  it("adds payment to the kind check in every file that lists the kinds, keeping document", () => {
    for (const file of KIND_FILES) expect(flat(file), file).toContain(`kind in (${list(KINDS)})`);
    // 002 declares it inline on the table; it only runs on an empty database, and still lists the whole set.
    expect(flat("002_job_tracker.sql")).toContain(`check (kind in (${list(KINDS)}))`);
  });

  it("lets a DC version be offered and cancelled, in 024's table and in 030's named check", () => {
    expect(flat("024_dc_quote_import.sql")).toContain(`check (${VERSION_STATUSES})`);
    const drop = statements.indexOf("alter table dc_quote_versions drop constraint if exists dc_quote_versions_status_check");
    const add = statements.indexOf(`alter table dc_quote_versions add constraint dc_quote_versions_status_check check ( ${VERSION_STATUSES} )`);
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  it("allows one offered version per job, checked when the statement commits", () => {
    const drop = statements.indexOf("alter table dc_quote_versions drop constraint if exists dc_quote_versions_one_offered");
    const add = statements.indexOf(
      "alter table dc_quote_versions add constraint dc_quote_versions_one_offered exclude using btree (lead_id with =) where (status = 'offered') deferrable initially deferred",
    );
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  it("adds the quote file and the offer, approval and cancellation stamps", () => {
    for (const column of [
      "quote_file_id uuid references job_files(id) on delete set null", "offered_at timestamptz", "offered_by text",
      "approved_at timestamptz", "approved_by text", "cancelled_at timestamptz",
    ]) expect(statements).toContain(`alter table dc_quote_versions add column if not exists ${column}`);
  });

  it("creates deposits with the spec's columns", () => {
    const table = find("create table if not exists deposits")!;
    for (const column of [
      "id uuid primary key default gen_random_uuid()", "lead_id uuid not null references leads(id) on delete cascade",
      "dc_quote_version_id uuid not null references dc_quote_versions(id)", "amount_cents integer not null",
      "method text not null", "status text not null", "stripe_session_id text unique", "stripe_payment_intent_id text",
      "recorded_by text", "created_at timestamptz not null default now()", "paid_at timestamptz", "refunded_at timestamptz",
    ]) expect(table).toContain(column);
  });

  it("names every deposits check and drops each before adding it", () => {
    const checks: Record<string, string> = {
      deposits_method_check: "check ( method in ('stripe','check','cash','other') )",
      deposits_status_check: "check ( status in ('pending','paid','refunded','expired') )",
      deposits_amount_check: "check ( amount_cents > 0 )",
      deposits_paid_at_check: "check ( status not in ('paid','refunded') or paid_at is not null )",
    };
    for (const [name, body] of Object.entries(checks)) {
      const drop = statements.indexOf(`alter table deposits drop constraint if exists ${name}`);
      const add = statements.indexOf(`alter table deposits add constraint ${name} ${body}`);
      expect(drop, name).toBeGreaterThanOrEqual(0);
      expect(add, name).toBeGreaterThan(drop);
    }
  });

  it("allows one paid and one pending deposit per version", () => {
    expect(statements).toContain("create unique index if not exists deposits_one_paid_per_version on deposits (dc_quote_version_id) where status = 'paid'");
    expect(statements).toContain("create unique index if not exists deposits_one_pending_per_version on deposits (dc_quote_version_id) where status = 'pending'");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/db/migration-030.test.ts`
Expected: FAIL — `ENOENT … 030_deposit_flow.sql`.

- [ ] **Step 3: Write the migration**

`db/migrations/030_deposit_flow.sql`:

```sql
-- Deposit flow (spec docs/superpowers/specs/2026-09-29-deposit-flow-design.md)
-- Idempotent: scripts/migrate.mjs re-applies every file on every run.
-- Whole-line comments only, and no semicolons in comments.

-- Stages. 002, 011, 012 and this file all define leads_status_check, so all four list the CURRENT FULL set.
alter table leads drop constraint if exists leads_status_check;

alter table leads add constraint leads_status_check check (
  status in ('new','visit_booked','quoted','approved','signed','sold','measure','ordered','installed','completed','lost')
);

-- Every migration that defines job_events_kind_check lists the CURRENT FULL set of kinds.
-- 'payment' is a deposit paid, recorded or refunded.
alter table job_events drop constraint if exists job_events_kind_check;

alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document','payment')
);

-- A DC version goes draft, offered (quote sent), sent (contract sent), signed. cancelled is a refunded, cancelled contract.
-- 024 declared this check inline, so Postgres named it dc_quote_versions_status_check.
alter table dc_quote_versions drop constraint if exists dc_quote_versions_status_check;

alter table dc_quote_versions add constraint dc_quote_versions_status_check check (
  status in ('draft','offered','sent','signed','superseded','cancelled')
);

-- The quote PDF Send quote shared, and when the quote was offered, approved and cancelled.
alter table dc_quote_versions add column if not exists quote_file_id uuid references job_files(id) on delete set null;
alter table dc_quote_versions add column if not exists offered_at timestamptz;
alter table dc_quote_versions add column if not exists offered_by text;
alter table dc_quote_versions add column if not exists approved_at timestamptz;
alter table dc_quote_versions add column if not exists approved_by text;
alter table dc_quote_versions add column if not exists cancelled_at timestamptz;

-- At most one offered version per job. An exclusion constraint deferred to commit rather than a unique
-- index, because Send quote supersedes the old offered version and offers the new one in ONE statement,
-- and a unique index would be checked row by row in whichever order Postgres runs the two updates.
alter table dc_quote_versions drop constraint if exists dc_quote_versions_one_offered;

alter table dc_quote_versions add constraint dc_quote_versions_one_offered
  exclude using btree (lead_id with =) where (status = 'offered') deferrable initially deferred;

-- One row per deposit attempt. method is stripe, check, cash or other. status is pending, paid, refunded or expired.
-- recorded_by is the owner's email for a payment recorded by hand.
create table if not exists deposits (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  dc_quote_version_id uuid not null references dc_quote_versions(id),
  amount_cents integer not null,
  method text not null,
  status text not null,
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  recorded_by text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);

alter table deposits drop constraint if exists deposits_method_check;

alter table deposits add constraint deposits_method_check check (
  method in ('stripe','check','cash','other')
);

alter table deposits drop constraint if exists deposits_status_check;

alter table deposits add constraint deposits_status_check check (
  status in ('pending','paid','refunded','expired')
);

alter table deposits drop constraint if exists deposits_amount_check;

alter table deposits add constraint deposits_amount_check check (
  amount_cents > 0
);

alter table deposits drop constraint if exists deposits_paid_at_check;

alter table deposits add constraint deposits_paid_at_check check (
  status not in ('paid','refunded') or paid_at is not null
);

-- One paid deposit per version, and one open card checkout per version (a double-click lands on one).
create unique index if not exists deposits_one_paid_per_version on deposits (dc_quote_version_id) where status = 'paid';

create unique index if not exists deposits_one_pending_per_version on deposits (dc_quote_version_id) where status = 'pending';

create index if not exists deposits_lead_idx on deposits (lead_id);
```

- [ ] **Step 4: Bring every older copy of the three lists up to date**

In `002_job_tracker.sql` line 10, `011_stages_contact_log.sql` line 10 and `012_completed_stage.sql` line 7, the status line becomes:

```sql
  status in ('new','visit_booked','quoted','approved','signed','sold','measure','ordered','installed','completed','lost')
```

In `002_job_tracker.sql` line 34 (inside `create table if not exists job_events`):

```sql
  kind        text not null check (kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document','payment')),
```

In `003` line 40, `004` line 20, `011` line 19, `019` line 16, `021` line 17, `024` line 112 and `026` line 73 the kind line becomes:

```sql
  kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document','payment')
```

In `024_dc_quote_import.sql` line 25:

```sql
  status                text not null check (status in ('draft','offered','sent','signed','superseded','cancelled')),
```

Update the three constants in the existing migration tests so they state the new full lists:
- `tests/db/migration-011.test.ts` line 8: `const KINDS = "kind in ('stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document','payment')";` and line 20: `expect(all[check]).toContain("status in ('new','visit_booked','quoted','approved','signed','sold','measure','ordered','installed','completed','lost')");`
- `tests/db/migration-012.test.ts` line 8: `const STATUSES = "status in ('new','visit_booked','quoted','approved','signed','sold','measure','ordered','installed','completed','lost')";`
- `tests/db/migration-026.test.ts` line 10: `const KINDS = "'stage','note','edit','email','reward','measure','file','contact','message','service','signature','quote','document','payment'";`

- [ ] **Step 5: Write the failing stage, overdue, conversion and measure tests**

`tests/admin/stages.test.ts` — replace the first `it` and the board/filter expectations, and add a block:

```ts
  it("runs from new lead to completed, in order", () => {
    expect(STAGES.map((s) => s.value)).toEqual([
      "new", "visit_booked", "quoted", "approved", "signed", "sold", "measure", "ordered", "installed", "completed",
    ]);
  });
```

In "advances one stage at a time…" add `expect(nextStage("quoted")).toBe("approved"); expect(nextStage("signed")).toBe("sold"); expect(nextStage("sold")).toBe("measure"); expect(nextStage("measure")).toBe("ordered");`. In "labels stages…" add `expect(stageLabel("approved")).toBe("Approved"); expect(stageLabel("signed")).toBe("Signed"); expect(stageLabel("measure")).toBe("Official measure");`. Board expectation becomes `["new", "visit_booked", "quoted", "approved", "signed", "sold", "measure", "ordered", "installed"]`; LIST_FILTERS labels become `["All jobs", "New lead", "Appointment booked", "Quoted", "Approved", "Signed", "Sold", "Official measure", "Ordered", "Installed", "Completed", "Lost"]`. Change the import line to also import `stageIndex, BOOKED_OR_LATER, SOLD_OR_LATER`, and append:

```ts
describe("stage order helpers", () => {
  it("gives each stage its place and lost none", () => {
    expect(stageIndex("new")).toBe(0);
    expect(stageIndex("signed")).toBeLessThan(stageIndex("sold"));
    expect(stageIndex("measure")).toBeLessThan(stageIndex("ordered"));
    expect(stageIndex("lost")).toBe(-1);
  });

  it("counts a job booked from Appointment booked on, and sold only from Sold on (Signed is not yet a sale)", () => {
    expect([...BOOKED_OR_LATER]).toEqual(["visit_booked", "quoted", "approved", "signed", "sold", "measure", "ordered", "installed", "completed"]);
    expect([...SOLD_OR_LATER]).toEqual(["sold", "measure", "ordered", "installed", "completed"]);
  });

  it("styles the three new stages with their own tokens", () => {
    expect(STAGE_STYLE.approved.edge).toBe("border-t-stage-approved");
    expect(STAGE_STYLE.signed.tint).toBe("text-stage-signed");
    expect(STAGE_STYLE.measure.left).toBe("border-l-stage-measure");
  });
});
```

`tests/admin/overdue.test.ts` — the `it.each` table becomes:

```ts
  it.each([
    ["quoted", 7], ["approved", 2], ["signed", 2], ["sold", 3], ["measure", 7], ["ordered", 21],
  ])("%s is overdue only after %i days", (status, limit) => {
```

`tests/admin/ad-conversions-route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const query = vi.fn(async (..._args: unknown[]) => [] as Record<string, unknown>[]);
vi.mock("@/lib/db", () => ({ db: () => ({ query }) }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin: vi.fn(async () => ({ email: "owner@example.com" })) }));

const { GET } = await import("@/app/admin/ad-conversions/route");

describe("GET /admin/ad-conversions", () => {
  it("counts booked from Appointment booked on and sold from Sold on, from the one stage list", async () => {
    await GET();
    const [text, params] = query.mock.calls[0] as [string, unknown[]];
    expect(text).toContain("e.to_status = any($2::text[])) as booked_at");
    expect(text).toContain("e.to_status = any($3::text[])) as sold_at");
    expect(params[1]).toEqual(["visit_booked", "quoted", "approved", "signed", "sold", "measure", "ordered", "installed", "completed"]);
    expect(params[2]).toEqual(["sold", "measure", "ordered", "installed", "completed"]);
  });
});
```

`tests/admin/appointment-actions.test.ts` — inside `describe("confirmSchedule", …)` add:

```ts
  it("moves a Sold job to Official measure when its measure appointment is confirmed", async () => {
    appointments.confirmAppointment.mockResolvedValue(confirmed({ kind: "measure" }));
    jobs.getJob.mockResolvedValue(job({ status: "sold" }));
    expect(await actions.confirmSchedule(APPT, JOB)).toEqual({ ok: true });
    expect(jobs.setStage).toHaveBeenCalledWith(JOB, "measure", "owner@example.com", { body: "Measure appointment confirmed" });
  });

  it.each(["quoted", "approved", "signed", "measure", "ordered", "lost"])(
    "leaves a %s job where it is when a measure appointment is confirmed",
    async (status) => {
      appointments.confirmAppointment.mockResolvedValue(confirmed({ kind: "measure" }));
      jobs.getJob.mockResolvedValue(job({ status }));
      await actions.confirmSchedule(APPT, JOB);
      expect(jobs.setStage).not.toHaveBeenCalled();
    },
  );

  it.each(["install", "service"])("never moves a Sold job for a confirmed %s appointment", async (kind) => {
    appointments.confirmAppointment.mockResolvedValue(confirmed({ kind }));
    jobs.getJob.mockResolvedValue(job({ status: "sold" }));
    await actions.confirmSchedule(APPT, JOB);
    expect(jobs.setStage).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/stages.test.ts tests/admin/overdue.test.ts tests/admin/ad-conversions-route.test.ts tests/admin/appointment-actions.test.ts tests/db`
Expected: FAIL — the stage list lacks approved/signed/measure, `stageIndex` is not exported, the route binds one parameter, `setStage` is not called for measure. `migration-030` and `migration-checks-consistent` pass only once every copy from Step 4 carries the new lists; a copy you missed FAILS by file name.

- [ ] **Step 7: Implement**

`lib/admin/stages.ts` — replace the header comment, `STAGES`, `WORKING_STAGES`, `BOARD_STAGES` and `STAGE_STYLE`, and add the helpers:

```ts
/**
 * The one definition of the job stages. The database enforces the same list with the
 * leads_status_check constraint, defined identically in 002, 011, 012 and 030: migrate.mjs
 * re-applies every file, so all four carry the full list. Keep them in step.
 */
export const STAGES = [
  { value: "new", label: "New lead" },
  { value: "visit_booked", label: "Appointment booked" },
  { value: "quoted", label: "Quoted" },
  { value: "approved", label: "Approved" },
  { value: "signed", label: "Signed" },
  { value: "sold", label: "Sold" },
  { value: "measure", label: "Official measure" },
  { value: "ordered", label: "Ordered" },
  { value: "installed", label: "Installed" },
  { value: "completed", label: "Completed" },
] as const;
```

```ts
/** A stage's place in STAGES; -1 for lost, which is outside the sequence. */
export const stageIndex = (stage: Stage): number => STAGES.findIndex((s) => s.value === stage);

/** Reaching any of these counts as a booked visit (Google Ads' "booked" conversion). */
export const BOOKED_OR_LATER: readonly Stage[] = STAGES.slice(stageIndex("visit_booked")).map((s) => s.value);
/** Reaching any of these counts as a sale. Signed is not: the sale is the paid deposit (spec §4). */
export const SOLD_OR_LATER: readonly Stage[] = STAGES.slice(stageIndex("sold")).map((s) => s.value);

export const WORKING_STAGES = ["new", "visit_booked", "quoted", "approved", "signed", "sold", "measure", "ordered", "installed", "completed"] as const;
```

(`stageIndex` must be declared after `Stage` and `STAGES`; place the block right after `nextStage`.)

```ts
export const BOARD_STAGES = ["new", "visit_booked", "quoted", "approved", "signed", "sold", "measure", "ordered", "installed"] as const;
```

In `STAGE_STYLE` add, in stage order:

```ts
  approved: { icon: "check", edge: "border-t-stage-approved", tint: "text-stage-approved", left: "border-l-stage-approved" },
  signed: { icon: "pen", edge: "border-t-stage-signed", tint: "text-stage-signed", left: "border-l-stage-signed" },
  measure: { icon: "ruler", edge: "border-t-stage-measure", tint: "text-stage-measure", left: "border-l-stage-measure" },
```

`components/admin/icons.tsx` — add to `PATHS` after `ruler`:

```ts
  pen: "M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3",
```

`app/globals.css` — after `--color-stage-quoted: #8A6A9E;`:

```css
  --color-stage-approved: #6F7FAE;
  --color-stage-signed: #A0607A;
```

and after `--color-stage-sold: #5E9A5A;`:

```css
  --color-stage-measure: #8C8A3E;
```

`app/admin/jobs/[id]/StageStepper.tsx` — `FILL` gains `approved: "bg-stage-approved", signed: "bg-stage-signed",` after `quoted` and `measure: "bg-stage-measure",` after `sold`.

`lib/admin/overdue.ts`:

```ts
export const OVERDUE_DAYS: Partial<Record<Stage, number>> = {
  new: 1,
  quoted: 7,
  approved: 2,
  signed: 2,
  sold: 3,
  measure: 7,
  ordered: 21,
};
```

`lib/admin/jobs.ts` line 80:

```ts
  kind: "stage" | "note" | "edit" | "email" | "reward" | "measure" | "file" | "contact" | "message" | "service" | "signature" | "quote" | "document" | "payment";
```

`app/admin/ad-conversions/route.ts` — add `import { BOOKED_OR_LATER, SOLD_OR_LATER } from "@/lib/admin/stages";`, replace the two `to_status in (…)` lines and the parameter array:

```ts
       (select min(e.created_at) from job_events e where e.lead_id = l.id and e.kind = 'stage'
          and e.to_status = any($2::text[])) as booked_at,
       (select min(e.created_at) from job_events e where e.lead_id = l.id and e.kind = 'stage'
          and e.to_status = any($3::text[])) as sold_at
```

```ts
    [ATTRIBUTION_DAYS, [...BOOKED_OR_LATER], [...SOLD_OR_LATER]],
```

`app/admin/jobs/appointment-actions.ts` — after the consultation line (68):

```ts
  // Spec §5: a confirmed measure appointment on a Sold job is the Official measure. Ordered stays manual.
  if (confirmed.kind === "measure" && job?.status === "sold") {
    await setStage(jobId, "measure", email, { body: "Measure appointment confirmed" });
  }
```

`OverviewTab.tsx` (`soldOrLater` by index), `lib/portal/guides.ts` (`ORDERED_OR_LATER` — Official measure is before Ordered, so it correctly shows no install guide), `lib/admin/call.ts`, `lib/reviews/db.ts` and `lib/referrals/db.ts` need no change: none names a stage between Quoted and Ordered. Say so in the commit body.

- [ ] **Step 8: Update the tests that list the old seven stages**

- `tests/admin/board.test.tsx` line 21: `"New lead", "Appointment booked", "Quoted", "Approved", "Signed", "Sold", "Official measure", "Ordered", "Installed",`
- `tests/admin/board-page.test.tsx` line 97: `.toHaveLength(9)`
- `tests/admin/job-list.test.tsx` line 65: `"All jobs", "New lead", "Appointment booked", "Quoted", "Approved", "Signed", "Sold", "Official measure", "Ordered", "Installed", "Completed", "Lost",`
- `tests/admin/job-page.test.tsx` lines 87 and 103: `"Move to Approved"` (the fixture is Quoted).
- `tests/admin/stage-stepper.test.tsx`: title "shows all ten stages…", first states array `["done", "current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]`, completed array nine `"done"` then `"current"`.

- [ ] **Step 9: Run the suite, typecheck, lint**

Run: `npx vitest run --maxWorkers=2` → PASS (quote the summary). Any other failure must be a test that hard-codes the seven stages; fix it to the ten and name it in your report.
Run: `npx tsc --noEmit` → clean outside `.next/`.
Run: `npx eslint lib/admin app/admin/ad-conversions app/admin/jobs/appointment-actions.ts app/admin/jobs/[id]/StageStepper.tsx components/admin/icons.tsx tests/admin tests/db` → exit 0.

- [ ] **Step 10: Test power**

(a) Temporarily delete `'measure',` from 012's status list → `migration-030` "all four files" fails naming 012. (b) Delete `'payment',` from 019's kind list → both `migration-checks-consistent` (`job_events_kind_check is identical…`) and `migration-030` fail. (c) Delete `&& job?.status === "sold"` in `appointment-actions.ts` → the `it.each` "leaves a quoted job…" fails. (d) Change `SOLD_OR_LATER` to start at `"signed"` → the ad-conversions test fails. Restore each and re-run green.

- [ ] **Step 11: Commit**

```bash
git add db/migrations lib/admin components/admin/icons.tsx app/globals.css app/admin tests/admin tests/db
git commit -m "feat: Approved, Signed and Official measure stages, migration 030 and deposits table

Official measure starts when a measure appointment on a Sold job is confirmed.
OverviewTab, guides, call, reviews and referrals need no change: none names a stage between Quoted and Ordered.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0122UD6P8agX8gRaojNYtEiL"
```

---

### Task 2: The client's progress bar

**Files:**
- Modify: `lib/portal/progress.ts`, `app/(site)/project/StatusBanner.tsx:8-26`, `app/(site)/project/UpdatesList.tsx:7-15`
- Test (modify): `tests/portal/progress.test.ts`, `tests/portal/access.test.ts:58-95`, `tests/portal/project-view.test.tsx:89-93,373`, `e2e/portal.spec.ts:245`

**Interfaces:**
- Consumes: `Stage` (Task 1).
- Produces: `PORTAL_STAGES = ["quoted","approved","signed","sold","measure","ordered","installed"]`, `PORTAL_STATUSES` (plus `"completed"`), `STEP_KEYS = ["consultation","measurements","quote","signed","deposit","measure","production","ready","installed"]`, labels "Consultation", "Measurements", "Quote Ready", "Contract Signed", "Deposit Paid", "Final Measure", "In Production", "Ready to Install", "Installed". Every `Record<StepKey, …>` must have the nine keys.

- [ ] **Step 1: Update the failing tests**

`tests/portal/progress.test.ts`:

```ts
  it("are quoted through installed, in order", () => {
    expect(PORTAL_STAGES).toEqual(["quoted", "approved", "signed", "sold", "measure", "ordered", "installed"]);
  });

  it("show a customer quoted through completed, never earlier stages or lost", () => {
    expect(PORTAL_STATUSES).toEqual(["quoted", "approved", "signed", "sold", "measure", "ordered", "installed", "completed"]);
```

```ts
  it("uses the spec's nine labels, in order", () => {
    expect(buildSteps({ status: "quoted" }).map((s) => s.label)).toEqual([
      "Consultation", "Measurements", "Quote Ready", "Contract Signed", "Deposit Paid", "Final Measure",
      "In Production", "Ready to Install", "Installed",
    ]);
    expect(buildSteps({ status: "quoted" }).map((s) => s.key)).toEqual([
      "consultation", "measurements", "quote", "signed", "deposit", "measure", "production", "ready", "installed",
    ]);
  });
```

Then, mechanically through the rest of the file: every seven-element `states`/`dates` array gains two more of the same value (nine); `toHaveLength(7)` becomes `toHaveLength(9)`; every step key `"order"` becomes `"deposit"`; the test names "Order Confirmed" become "Deposit Paid"; the loop at line 221 becomes `for (const key of ["signed", "deposit", "measure", "production", "ready"])`; the completed-job `reached` array becomes nine `true`. Add after "shows a sold job standing at Deposit Paid":

```ts
  it("shows an approved job still at Quote Ready, and a signed job at Contract Signed", () => {
    expect(step(buildSteps({ status: "approved" }), "quote").state).toBe("current");
    const signed = buildSteps({
      status: "signed",
      stageDates: { quoted: new Date("2026-09-10T17:00:00Z"), signed: new Date("2026-09-12T17:00:00Z") },
    });
    expect(step(signed, "signed").state).toBe("current");
    expect(step(signed, "signed").on).toBe("Sep 12");
    expect(step(signed, "deposit").state).toBe("upcoming");
    expect(step(signed, "deposit").on).toBeNull();
  });

  it("shows an Official measure job at Final Measure, dated when the measure was confirmed", () => {
    const steps = buildSteps({
      status: "measure",
      stageDates: { sold: new Date("2026-09-14T17:00:00Z"), measure: new Date("2026-09-16T17:00:00Z") },
    });
    expect(step(steps, "deposit").state).toBe("done");
    expect(step(steps, "deposit").on).toBe("Sep 14");
    expect(step(steps, "measure").state).toBe("current");
    expect(step(steps, "measure").on).toBe("Sep 16");
    expect(step(steps, "production").state).toBe("upcoming");
  });
```

In the "minStage gate" block's `facts.stageDates` add `signed: new Date("2026-09-07T17:00:00Z"), measure: new Date("2026-09-09T17:00:00Z"),`.

`tests/portal/access.test.ts` — the `steps` array in "keeps only what a customer may see" becomes:

```ts
        { key: "consultation", label: "Consultation", reached: true, state: "done", on: null, future: false },
        { key: "measurements", label: "Measurements", reached: false, state: "done", on: null, future: false },
        { key: "quote", label: "Quote Ready", reached: true, state: "current", on: null, future: false },
        { key: "signed", label: "Contract Signed", reached: false, state: "upcoming", on: null, future: false },
        { key: "deposit", label: "Deposit Paid", reached: false, state: "upcoming", on: null, future: false },
        { key: "measure", label: "Final Measure", reached: false, state: "upcoming", on: null, future: false },
        { key: "production", label: "In Production", reached: false, state: "upcoming", on: null, future: false },
        { key: "ready", label: "Ready to Install", reached: false, state: "upcoming", on: null, future: false },
        { key: "installed", label: "Installed", reached: false, state: "upcoming", on: null, future: false },
```

and lines 92–95:

```ts
    // The job is sold, so Deposit Paid is the furthest step reached: it is the current one.
    expect(byKey.deposit).toEqual({
      key: "deposit", label: "Deposit Paid", reached: true, state: "current", on: "Sep 14", future: false,
    });
```

`tests/portal/project-view.test.tsx` lines 89–93: replace "Order Confirmed" with "Deposit Paid" (comment and `getByText`); line 373: `"Your deposit was received."`.

`e2e/portal.spec.ts` line 245: `await expect(steps.filter({ hasText: "Deposit Paid" })).toContainText("Sep 8");`

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/portal/progress.test.ts tests/portal/access.test.ts tests/portal/project-view.test.tsx`
Expected: FAIL — seven labels returned, no `signed`/`deposit`/`measure` keys.

- [ ] **Step 3: Implement**

`lib/portal/progress.ts`:

```ts
/** The stages a customer can see, in order. Earlier stages and Lost are never shown. */
export const PORTAL_STAGES = ["quoted", "approved", "signed", "sold", "measure", "ordered", "installed"] as const;
```

```ts
/** The customer's nine steps, in order. The keys are stable; the labels are what they read. */
export const STEP_KEYS = [
  "consultation", "measurements", "quote", "signed", "deposit", "measure", "production", "ready", "installed",
] as const;
```

In `SPECS`, replace the `order` entry with three entries (minStage never decreases):

```ts
  {
    key: "signed", label: "Contract Signed", minStage: "signed",
    on: (i) => onInstant(i.stageDates?.signed),
  },
  {
    // The sale is the paid deposit (spec §4): Sold is reached when the deposit is in.
    key: "deposit", label: "Deposit Paid", minStage: "sold",
    on: (i) => onInstant(i.stageDates?.sold),
  },
  {
    key: "measure", label: "Final Measure", minStage: "measure",
    on: (i) => onInstant(i.stageDates?.measure),
  },
```

Update the two "seven steps" comments to "nine".

`app/(site)/project/StatusBanner.tsx` — in both records replace the `order` line with:

```ts
  signed: "Your contract is signed. Your 50% deposit confirms your order.",
  deposit: "Your deposit is in and your order is confirmed. Thank you for choosing us.",
  measure: "Your final measure is booked, so every treatment fits exactly.",
```

(STEP_BLURB) and

```ts
  signed: "Pay your 50% deposit to confirm your order.",
  deposit: "We will call you to book your final measure.",
  measure: "We place your order with the workroom after your final measure.",
```

(STEP_NEXT).

`app/(site)/project/UpdatesList.tsx` — replace `order` with:

```ts
  signed: "You signed your contract.",
  deposit: "Your deposit was received.",
  measure: "Your final measure was booked.",
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run --maxWorkers=2 tests/portal` → PASS. `npx tsc --noEmit` → clean. `npx eslint lib/portal/progress.ts app/(site)/project tests/portal` → exit 0.

- [ ] **Step 5: Test power**

Give `deposit` `minStage: "signed"` → the minStage-gate test "claims no milestone beyond signed" fails (Deposit Paid would read done/current on a signed job). Swap the `signed` and `deposit` entries → "lists the steps in stage order" fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add lib/portal/progress.ts app/(site)/project/StatusBanner.tsx app/(site)/project/UpdatesList.tsx tests/portal e2e/portal.spec.ts
git commit -m "feat: the client's progress bar shows Contract Signed, Deposit Paid and Final Measure

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0122UD6P8agX8gRaojNYtEiL"
```

---
### Task 3: Stripe client and every deposit write

**Files:**
- Modify: `package.json`, `package-lock.json` (add `stripe`)
- Create: `lib/payments/stripe.ts`, `lib/payments/deposits.ts`
- Test: `tests/payments/stripe.test.ts`, `tests/payments/deposits.test.ts`

**Interfaces:**
- Consumes: migration 030 (Task 1), `Stage`/`isStage` (Task 1), `isUuid` (`lib/admin/ids.ts`), `formatCents` (`lib/admin/money.ts`).
- Produces (`lib/payments/stripe.ts`):
  - `stripeApiOverride(): { host: string; port: number; protocol: "http" | "https" } | null`
  - `stripeClient(): Stripe | null`
  - `verifyWebhook(body: string, signature: string | null): Stripe.Event` (throws when it does not verify)
  - `closeCheckout(stripe: Stripe | null, sessionId: string): Promise<"closed" | "paid" | "unknown">`
  - `refundPayment(stripe: Stripe | null, paymentIntentId: string, depositId: string): Promise<boolean>`
- Produces (`lib/payments/deposits.ts`):
  - `type DepositMethod = "stripe" | "check" | "cash" | "other"`; `RECORDED_METHODS`; `type RecordedMethod = "check" | "cash" | "other"`; `isRecordedMethod(value: unknown): value is RecordedMethod`; `type DepositStatus = "pending" | "paid" | "refunded" | "expired"`
  - `type Deposit = { id; leadId; versionId; amountCents; method: DepositMethod; status: DepositStatus; stripeSessionId: string | null; stripePaymentIntentId: string | null; recordedBy: string | null; createdAt: Date; paidAt: Date | null; refundedAt: Date | null }`
  - `type DepositState = { jobStatus: Stage; versionId: string; version: number; versionStatus: "signed" | "cancelled"; soldCents: number; amountCents: number; signedAt: Date; paid: Deposit | null; pending: Deposit | null; refunded: Deposit | null }`
  - `depositAmountCents(soldCents: number): number`, `STRIPE_ACTOR = "Stripe"`, `CANCEL_REASON = "Cancelled — deposit refunded"`
  - `depositState(leadId: string): Promise<DepositState | null>`
  - `depositById(id: string): Promise<Deposit | null>`, `depositBySession(sessionId: string): Promise<Deposit | null>`
  - `expireStaleDeposits(versionId: string): Promise<number>`
  - `claimStripeDeposit(input: { leadId: string; versionId: string; amountCents: number }): Promise<Deposit | null>`
  - `pendingStripeDeposit(versionId: string): Promise<Deposit | null>`
  - `attachSession(depositId: string, sessionId: string): Promise<boolean>`
  - `markStripeDepositPaid(input: { depositId: string; sessionId: string; paymentIntentId: string | null; amountCents: number }): Promise<{ leadId: string } | null>`
  - `recordDepositPayment(input: { leadId: string; versionId: string; amountCents: number; method: RecordedMethod; actor: string }): Promise<{ depositId: string } | null>`
  - `expireDeposit(sessionId: string): Promise<boolean>`
  - `cancelDeposit(input: { leadId: string; deposit: Deposit; actor: string }): Promise<boolean>`

- [ ] **Step 1: Add the dependency**

```bash
npm install stripe@^22.6.2
```

Confirm `package.json` has `"stripe": "^22.6.2"` under `dependencies` and `node_modules/stripe/package.json` reports 22.x. (This plan's calls were type-checked against 22.6.2: `checkout.sessions.create/retrieve/expire`, `refunds.create`, `webhooks.constructEvent`, `webhooks.generateTestHeaderString`, and the `host`/`port`/`protocol` config.)

- [ ] **Step 2: Write the failing tests**

`tests/payments/stripe.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const { closeCheckout, refundPayment, stripeApiOverride, stripeClient, verifyWebhook } = await import("@/lib/payments/stripe");

const signer = new Stripe("sk_test_unit");
const payload = JSON.stringify({ id: "evt_1", object: "event", type: "checkout.session.expired", data: { object: { id: "cs_1", object: "checkout.session" } } });
const sign = (body: string, secret: string) => signer.webhooks.generateTestHeaderString({ payload: body, secret });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.unstubAllEnvs());

describe("stripeClient", () => {
  it("is null without a secret key", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(stripeClient()).toBeNull();
  });
  it("is a client with a key", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit");
    expect(stripeClient()).toBeInstanceOf(Stripe);
  });
});

describe("stripeApiOverride", () => {
  it("honours a local test server only", () => {
    vi.stubEnv("STRIPE_API_URL", "http://127.0.0.1:3198");
    expect(stripeApiOverride()).toEqual({ host: "127.0.0.1", port: 3198, protocol: "http" });
    vi.stubEnv("STRIPE_API_URL", "http://localhost:4000");
    expect(stripeApiOverride()).toEqual({ host: "localhost", port: 4000, protocol: "http" });
  });
  it("ignores anything else, so a stray variable can never send payments elsewhere", () => {
    vi.stubEnv("STRIPE_API_URL", "https://api.example.com");
    expect(stripeApiOverride()).toBeNull();
    vi.stubEnv("STRIPE_API_URL", "not a url");
    expect(stripeApiOverride()).toBeNull();
    vi.stubEnv("STRIPE_API_URL", "");
    expect(stripeApiOverride()).toBeNull();
  });
});

describe("verifyWebhook", () => {
  it("returns the event for a body signed with the webhook secret", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_unit");
    expect(verifyWebhook(payload, sign(payload, "whsec_unit")).type).toBe("checkout.session.expired");
  });
  it("throws for another secret, a changed body, or no header", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_unit");
    expect(() => verifyWebhook(payload, sign(payload, "whsec_other"))).toThrow();
    expect(() => verifyWebhook(`${payload} `, sign(payload, "whsec_unit"))).toThrow();
    expect(() => verifyWebhook(payload, null)).toThrow();
  });
  it("refuses everything when the webhook secret is not set", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(() => verifyWebhook(payload, sign(payload, "whsec_unit"))).toThrow("STRIPE_WEBHOOK_SECRET is not set");
  });
});

/** Only the three calls these helpers make. */
function fakeStripe(session: { status: string } | Error, expire?: Error) {
  const retrieve = vi.fn(async (_id: string) => { if (session instanceof Error) throw session; return session; });
  const expireFn = vi.fn(async (_id: string) => { if (expire) throw expire; return { status: "expired" }; });
  const create = vi.fn(async (_params: unknown, _options: unknown) => ({ id: "re_1", status: "succeeded" }));
  const client = { checkout: { sessions: { retrieve, expire: expireFn } }, refunds: { create } };
  return { client: client as unknown as Stripe, retrieve, expire: expireFn, create };
}

describe("closeCheckout", () => {
  it("answers paid for a completed checkout, and leaves it alone", async () => {
    const fake = fakeStripe({ status: "complete" });
    expect(await closeCheckout(fake.client, "cs_1")).toBe("paid");
    expect(fake.expire).not.toHaveBeenCalled();
  });
  it("expires an open checkout", async () => {
    const fake = fakeStripe({ status: "open" });
    expect(await closeCheckout(fake.client, "cs_1")).toBe("closed");
    expect(fake.expire).toHaveBeenCalledWith("cs_1");
  });
  it("answers closed for one already expired", async () => {
    expect(await closeCheckout(fakeStripe({ status: "expired" }).client, "cs_1")).toBe("closed");
  });
  it("answers unknown when Stripe cannot be asked, or refuses to expire it (it completed meanwhile)", async () => {
    expect(await closeCheckout(null, "cs_1")).toBe("unknown");
    expect(await closeCheckout(fakeStripe(new Error("down")).client, "cs_1")).toBe("unknown");
    expect(await closeCheckout(fakeStripe({ status: "open" }, new Error("only open sessions")).client, "cs_1")).toBe("unknown");
  });
});

describe("refundPayment", () => {
  it("refunds the whole payment, once per deposit however often it is pressed", async () => {
    const fake = fakeStripe({ status: "complete" });
    expect(await refundPayment(fake.client, "pi_1", "d1")).toBe(true);
    expect(fake.create).toHaveBeenCalledWith({ payment_intent: "pi_1" }, { idempotencyKey: "refund-d1" });
  });
  it("answers false when Stripe refuses or is not configured", async () => {
    const fake = fakeStripe({ status: "complete" });
    fake.create.mockRejectedValueOnce(new Error("refused"));
    expect(await refundPayment(fake.client, "pi_1", "d1")).toBe(false);
    expect(await refundPayment(null, "pi_1", "d1")).toBe(false);
  });
});
```

`tests/payments/deposits.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const d = await import("@/lib/payments/deposits");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const values = (call: unknown[]) => call.slice(1);
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const VERSION = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const DEPOSIT = "5d1f6a2e-3b4c-4d5e-8f60-7a8b9c0d1e2f";
const row = (over: Record<string, unknown> = {}) => ({
  id: DEPOSIT, lead_id: LEAD, dc_quote_version_id: VERSION, amount_cents: 92417, method: "stripe", status: "pending",
  stripe_session_id: "cs_1", stripe_payment_intent_id: null, recorded_by: null,
  created_at: "2026-09-29T17:00:00Z", paid_at: null, refunded_at: null, ...over,
});
const versionRow = (over: Record<string, unknown> = {}) => ({
  version_id: VERSION, version: 2, version_status: "signed", client_total_cents: 184833,
  signed_at: "2026-09-28T17:00:00Z", job_status: "signed", ...row(), ...over,
});

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
});

describe("depositAmountCents", () => {
  it("is half the signed total, a half cent rounding up", () => {
    expect(d.depositAmountCents(184834)).toBe(92417);
    expect(d.depositAmountCents(184833)).toBe(92417);
    expect(d.depositAmountCents(1)).toBe(1);
    expect(d.depositAmountCents(2)).toBe(1);
  });
  it("matches the SQL rule (client_total_cents + 1) / 2 for every total", () => {
    for (let cents = 0; cents < 5000; cents += 1) expect(d.depositAmountCents(cents)).toBe(Math.floor((cents + 1) / 2));
    for (const cents of [2_147_483_646, 99_999_999, 123_456_789]) expect(d.depositAmountCents(cents)).toBe(Math.floor((cents + 1) / 2));
  });
});

describe("depositState", () => {
  it("reads the newest signed version, its figures and each deposit by status", async () => {
    sql.mockResolvedValueOnce([versionRow({ id: "d-new", status: "pending" }), versionRow({ id: "d-old", status: "expired" })]);
    const state = await d.depositState(LEAD);
    expect(state).toMatchObject({
      jobStatus: "signed", versionId: VERSION, version: 2, versionStatus: "signed", soldCents: 184833, amountCents: 92417,
      signedAt: new Date("2026-09-28T17:00:00Z"), paid: null, refunded: null,
    });
    expect(state!.pending!.id).toBe("d-new");
    const s = text(sql.mock.calls[0]);
    expect(s).toContain("v.status in ('signed','cancelled')");
    expect(s).toContain("left join deposits d on d.dc_quote_version_id = v.id");
    expect(s).toContain("v.version = (select max(version) from dc_quote_versions");
  });
  it("is null without a signed version, and never queries for a malformed id", async () => {
    expect(await d.depositState(LEAD)).toBeNull();
    sql.mockClear();
    expect(await d.depositState("nope")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
  it("reads a version with no deposits as nothing paid, pending or refunded", async () => {
    sql.mockResolvedValueOnce([versionRow({ client_total_cents: 1000, id: null, status: null, amount_cents: null })]);
    expect(await d.depositState(LEAD)).toMatchObject({ amountCents: 500, paid: null, pending: null, refunded: null });
  });
});

describe("claimStripeDeposit", () => {
  it("in ONE statement inserts a pending card deposit only for a signed job and version at the stored half, or returns the open one", async () => {
    sql.mockResolvedValueOnce([row()]);
    const claimed = await d.claimStripeDeposit({ leadId: LEAD, versionId: VERSION, amountCents: 92417 });
    expect(claimed).toMatchObject({ id: DEPOSIT, amountCents: 92417, status: "pending", method: "stripe", stripeSessionId: "cs_1" });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "insert into deposits (id, lead_id, dc_quote_version_id, amount_cents, method, status)",
      "'stripe', 'pending'", "and v.status = 'signed' and l.status = 'signed'", "and (v.client_total_cents + 1) / 2 = ?",
      "not exists (select 1 from deposits d where d.dc_quote_version_id = v.id and d.status = 'paid')",
      "on conflict do nothing", "union all", "and status = 'pending' and method = 'stripe'", "not exists (select 1 from inserted)",
    ]) expect(s).toContain(part);
    expect(values(sql.mock.calls[0])).toContain(92417);
  });
  it("answers null when nothing may be claimed", async () => {
    expect(await d.claimStripeDeposit({ leadId: LEAD, versionId: VERSION, amountCents: 92417 })).toBeNull();
  });
});

describe("attachSession / expireDeposit / expireStaleDeposits", () => {
  it("attaches a Checkout Session only to a pending deposit without another session", async () => {
    sql.mockResolvedValueOnce([{ id: DEPOSIT }]);
    expect(await d.attachSession(DEPOSIT, "cs_1")).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("where id = ? and status = 'pending' and (stripe_session_id is null or stripe_session_id = ?)");
  });
  it("expires only a pending deposit, so an expiry arriving after payment changes nothing", async () => {
    expect(await d.expireDeposit("cs_1")).toBe(false);
    expect(text(sql.mock.calls[0])).toContain("update deposits set status = 'expired' where stripe_session_id = ? and status = 'pending'");
  });
  it("expires a pending deposit older than 23 hours, inside Stripe's 24-hour session and idempotency windows", async () => {
    sql.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    expect(await d.expireStaleDeposits(VERSION)).toBe(2);
    expect(text(sql.mock.calls[0])).toContain("status = 'pending' and created_at < now() - interval '23 hours'");
  });
});

describe("markStripeDepositPaid", () => {
  const input = { depositId: DEPOSIT, sessionId: "cs_1", paymentIntentId: "pi_1", amountCents: 92417 };

  it("in ONE statement marks the pending deposit paid, writes deposit_cents, moves Signed to Sold and logs both", async () => {
    sql.mockResolvedValueOnce([{ lead_id: LEAD }]);
    expect(await d.markStripeDepositPaid(input)).toEqual({ leadId: LEAD });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "update deposits set status = 'paid', paid_at = now(), stripe_session_id = ?, stripe_payment_intent_id = ?",
      "where id = ? and method = 'stripe' and status = 'pending'",
      "and (stripe_session_id = ? or stripe_session_id is null)", "and amount_cents = ?",
      "not exists (select 1 from deposits d where d.dc_quote_version_id = deposits.dc_quote_version_id and d.status = 'paid')",
      "deposit_cents = (select amount_cents from paid)", "status = case when status = 'signed' then 'sold' else status end",
      "'payment'", "'stage', prev.status, 'sold', 'Deposit paid'", "where prev.status = 'signed'",
    ]) expect(s).toContain(part);
    expect(values(sql.mock.calls[0])).toEqual(expect.arrayContaining(["cs_1", "pi_1", DEPOSIT, 92417, "Stripe", "Deposit $924.17 paid by card"]));
  });
  it("answers null when no pending deposit matched (a duplicate delivery, or one recorded by hand)", async () => {
    expect(await d.markStripeDepositPaid(input)).toBeNull();
  });
  it("never queries for a malformed deposit id", async () => {
    expect(await d.markStripeDepositPaid({ ...input, depositId: "x" })).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
  it("records the payment on a job the owner moved on by hand, moving only a Signed job", async () => {
    await d.markStripeDepositPaid(input);
    const s = text(sql.mock.calls[0]);
    const moved = s.slice(s.indexOf("moved as ("), s.indexOf("payment_logged as ("));
    // deposit_cents is written whatever the stage; only the status and its event depend on Signed.
    expect(moved).toContain("where id = (select lead_id from paid)");
    expect(moved).not.toContain("and status = 'signed'");
  });
});

describe("recordDepositPayment", () => {
  it("in ONE statement inserts a paid row, expires any open card checkout, moves Signed to Sold and logs both", async () => {
    sql.mockResolvedValueOnce([{ id: "new" }]);
    expect(await d.recordDepositPayment({ leadId: LEAD, versionId: VERSION, amountCents: 92400, method: "check", actor: "owner@example.com" }))
      .toEqual({ depositId: "new" });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "insert into deposits (id, lead_id, dc_quote_version_id, amount_cents, method, status, recorded_by, paid_at)",
      "'paid', ?, now()", "and v.status = 'signed' and l.status = 'signed'",
      "not exists (select 1 from deposits d where d.dc_quote_version_id = v.id and d.status = 'paid')",
      "update deposits set status = 'expired' where dc_quote_version_id = ? and status = 'pending' and exists (select 1 from paid)",
      "status = case when status = 'signed' then 'sold' else status end", "'Deposit recorded'",
    ]) expect(s).toContain(part);
    expect(values(sql.mock.calls[0])).toEqual(expect.arrayContaining([92400, "check", "owner@example.com", "Deposit $924 received by check"]));
  });
  it("refuses a card method, a bad amount or a malformed id without a query", async () => {
    const base = { leadId: LEAD, versionId: VERSION, actor: "o@x" };
    expect(await d.recordDepositPayment({ ...base, amountCents: 1, method: "stripe" as never })).toBeNull();
    expect(await d.recordDepositPayment({ ...base, amountCents: 0, method: "cash" })).toBeNull();
    expect(await d.recordDepositPayment({ ...base, amountCents: 10.5, method: "cash" })).toBeNull();
    expect(await d.recordDepositPayment({ ...base, amountCents: 100, method: "cash", versionId: "x" })).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("cancelDeposit", () => {
  const paid: import("@/lib/payments/deposits").Deposit = {
    id: DEPOSIT, leadId: LEAD, versionId: VERSION, amountCents: 92417, method: "stripe", status: "paid",
    stripeSessionId: "cs_1", stripePaymentIntentId: "pi_1", recordedBy: null, createdAt: new Date(), paidAt: new Date(), refundedAt: null,
  };

  it("in ONE statement refunds the paid deposit, cancels the version, loses the job, clears deposit_cents and logs both", async () => {
    sql.mockResolvedValueOnce([{ lead_id: LEAD }]);
    expect(await d.cancelDeposit({ leadId: LEAD, deposit: paid, actor: "owner@example.com" })).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "update deposits set status = 'refunded', refunded_at = now() where id = ? and lead_id = ? and status = 'paid' and amount_cents = ?",
      "update dc_quote_versions set status = 'cancelled', cancelled_at = now()", "and status = 'signed'",
      "status = 'lost', lost_reason = ?, deposit_cents = null", "follow_up_at = null", "and status <> 'lost'",
      "'payment'", "'stage', prev.status, 'lost'",
    ]) expect(s).toContain(part);
    expect(values(sql.mock.calls[0])).toEqual(expect.arrayContaining(["Cancelled — deposit refunded", "Deposit $924.17 refunded to the client's card"]));
  });
  it("words a recorded deposit as one the owner returns", async () => {
    await d.cancelDeposit({ leadId: LEAD, deposit: { ...paid, method: "cash" }, actor: "o@x" });
    expect(values(sql.mock.calls[0])).toContain("Deposit $924.17 (cash) marked refunded — return it to the client");
  });
  it("answers false when the deposit was no longer paid", async () => {
    expect(await d.cancelDeposit({ leadId: LEAD, deposit: paid, actor: "o@x" })).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/payments`
Expected: FAIL — `Cannot find module '@/lib/payments/stripe'` / `…/deposits`.

- [ ] **Step 4: Implement `lib/payments/stripe.ts`**

```ts
import "server-only";
import Stripe from "stripe";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * The test-only API override (e2e's stub, e2e/fixtures/stripe-stub.ts). Honoured only on this machine,
 * as ROUTE_OPTIMIZATION_URL is, so a stray variable can never send a payment elsewhere.
 */
export function stripeApiOverride(): { host: string; port: number; protocol: "http" | "https" } | null {
  const raw = process.env.STRIPE_API_URL;
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    console.error("Ignoring STRIPE_API_URL: it is not a URL");
    return null;
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    console.error("Ignoring STRIPE_API_URL: only 127.0.0.1 or localhost is allowed");
    return null;
  }
  const protocol = url.protocol === "https:" ? "https" : "http";
  return { host: url.hostname, port: Number(url.port || (protocol === "https" ? 443 : 80)), protocol };
}

/** The server SDK, or null when STRIPE_SECRET_KEY is not set. Network errors and 409 conflicts are retried twice. */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { maxNetworkRetries: 2, ...(stripeApiOverride() ?? {}) });
}

/**
 * Verifies a webhook body against its Stripe-Signature header with STRIPE_WEBHOOK_SECRET and answers the
 * event. Throws when it does not verify, and when the secret is not set (then nothing verifies).
 * Verification needs no API key; a placeholder is used when none is set.
 */
export function verifyWebhook(body: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_verification_only");
  return stripe.webhooks.constructEvent(body, signature ?? "", secret);
}

/**
 * Closes the client's card checkout before an owner records a deposit by hand (Review Focus 3).
 * "paid": Stripe says it completed, so a card payment is in flight — record nothing. "closed": it is
 * expired now, or was. "unknown": Stripe could not be asked, or refused to expire it because it
 * completed meanwhile — the owner tries again and then reads "paid".
 */
export async function closeCheckout(stripe: Stripe | null, sessionId: string): Promise<"closed" | "paid" | "unknown"> {
  if (!stripe) return "unknown";
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === "complete") return "paid";
    if (session.status === "open") await stripe.checkout.sessions.expire(sessionId);
    return "closed";
  } catch (error) {
    console.error(`Could not close Checkout Session ${sessionId}`, error);
    return "unknown";
  }
}

/** Refunds a card deposit in full. One idempotency key per deposit, so a second press refunds nothing more. */
export async function refundPayment(stripe: Stripe | null, paymentIntentId: string, depositId: string): Promise<boolean> {
  if (!stripe) return false;
  try {
    await stripe.refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey: `refund-${depositId}` });
    return true;
  } catch (error) {
    console.error(`Stripe did not refund ${paymentIntentId}`, error);
    return false;
  }
}
```

- [ ] **Step 5: Implement `lib/payments/deposits.ts`**

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/ids";
import { formatCents } from "@/lib/admin/money";
import { isStage, type Stage } from "@/lib/admin/stages";

export type DepositMethod = "stripe" | "check" | "cash" | "other";
/** What an owner may record by hand. A card payment only ever arrives through the verified webhook. */
export const RECORDED_METHODS = ["check", "cash", "other"] as const;
export type RecordedMethod = (typeof RECORDED_METHODS)[number];
export const isRecordedMethod = (value: unknown): value is RecordedMethod =>
  typeof value === "string" && (RECORDED_METHODS as readonly string[]).includes(value);
export type DepositStatus = "pending" | "paid" | "refunded" | "expired";

export type Deposit = {
  id: string; leadId: string; versionId: string; amountCents: number; method: DepositMethod; status: DepositStatus;
  stripeSessionId: string | null; stripePaymentIntentId: string | null; recordedBy: string | null;
  createdAt: Date; paidAt: Date | null; refundedAt: Date | null;
};

/** The job's newest signed (or cancelled) DC version and its deposits. */
export type DepositState = {
  jobStatus: Stage; versionId: string; version: number; versionStatus: "signed" | "cancelled";
  soldCents: number; amountCents: number; signedAt: Date;
  paid: Deposit | null; pending: Deposit | null; refunded: Deposit | null;
};

/** Spec §4: half the signed total, a half cent rounding up. The SQL twin is (client_total_cents + 1) / 2. */
export const depositAmountCents = (soldCents: number): number => Math.round(soldCents / 2);

/** Who a card payment's timeline entries name. */
export const STRIPE_ACTOR = "Stripe";
/** lost_reason, and the stage event's body, for a cancelled and refunded order. */
export const CANCEL_REASON = "Cancelled — deposit refunded";

const RECEIVED: Record<RecordedMethod, string> = { check: "by check", cash: "in cash", other: "by other means" };

const date = (value: unknown): Date | null => (value ? new Date(value as string) : null);

export const toDeposit = (row: Record<string, unknown>): Deposit => ({
  id: row.id as string, leadId: row.lead_id as string, versionId: row.dc_quote_version_id as string,
  amountCents: Number(row.amount_cents), method: row.method as DepositMethod, status: row.status as DepositStatus,
  stripeSessionId: (row.stripe_session_id as string | null) ?? null,
  stripePaymentIntentId: (row.stripe_payment_intent_id as string | null) ?? null,
  recordedBy: (row.recorded_by as string | null) ?? null,
  createdAt: new Date(row.created_at as string), paidAt: date(row.paid_at), refundedAt: date(row.refunded_at),
});

/** The deposit picture for the portal and the Quote tab. Null until a DC contract is signed. */
export async function depositState(leadId: string): Promise<DepositState | null> {
  if (!isUuid(leadId)) return null;
  const rows = await db()`
    select v.id as version_id, v.version, v.status as version_status, v.client_total_cents, v.signed_at,
           l.status as job_status,
           d.id, d.lead_id, d.dc_quote_version_id, d.amount_cents, d.method, d.status, d.stripe_session_id,
           d.stripe_payment_intent_id, d.recorded_by, d.created_at, d.paid_at, d.refunded_at
    from dc_quote_versions v
    join leads l on l.id = v.lead_id
    left join deposits d on d.dc_quote_version_id = v.id
    where v.lead_id = ${leadId} and v.status in ('signed','cancelled')
      and v.client_total_cents is not null and v.signed_at is not null
      and v.version = (select max(version) from dc_quote_versions
                       where lead_id = ${leadId} and status in ('signed','cancelled'))
    order by d.created_at desc nulls last`;
  const first = rows[0];
  if (!first || !isStage(first.job_status)) return null;
  const deposits = rows.filter((row) => row.id !== null).map(toDeposit);
  const soldCents = Number(first.client_total_cents);
  return {
    jobStatus: first.job_status, versionId: first.version_id as string, version: Number(first.version),
    versionStatus: first.version_status as "signed" | "cancelled", soldCents, amountCents: depositAmountCents(soldCents),
    signedAt: new Date(first.signed_at as string),
    paid: deposits.find((deposit) => deposit.status === "paid") ?? null,
    pending: deposits.find((deposit) => deposit.status === "pending") ?? null,
    refunded: deposits.find((deposit) => deposit.status === "refunded") ?? null,
  };
}

export async function depositById(id: string): Promise<Deposit | null> {
  if (!isUuid(id)) return null;
  const rows = await db()`select * from deposits where id = ${id}`;
  return rows[0] ? toDeposit(rows[0]) : null;
}

export async function depositBySession(sessionId: string): Promise<Deposit | null> {
  const rows = await db()`select * from deposits where stripe_session_id = ${sessionId}`;
  return rows[0] ? toDeposit(rows[0]) : null;
}

/**
 * A card checkout left pending for 23 hours is given up before Stripe's own 24-hour session expiry and
 * idempotency window end, so the next Pay starts a fresh session instead of replaying a dead one.
 */
export async function expireStaleDeposits(versionId: string): Promise<number> {
  if (!isUuid(versionId)) return 0;
  const rows = await db()`
    update deposits set status = 'expired'
    where dc_quote_version_id = ${versionId} and status = 'pending' and created_at < now() - interval '23 hours'
    returning id`;
  return rows.length;
}

/**
 * One statement: a pending card deposit for this version — inserted when the job and version are Signed,
 * nothing is paid and the amount is the stored half — or the pending one already there. The one-pending
 * index makes a second click's insert do nothing, so both clicks answer the same row (Review Focus 2).
 * The row's id is the Checkout Session's idempotency key.
 */
export async function claimStripeDeposit(input: { leadId: string; versionId: string; amountCents: number }): Promise<Deposit | null> {
  if (!isUuid(input.leadId) || !isUuid(input.versionId)) return null;
  const rows = await db()`
    with inserted as (
      insert into deposits (id, lead_id, dc_quote_version_id, amount_cents, method, status)
      select ${randomUUID()}, v.lead_id, v.id, ${input.amountCents}, 'stripe', 'pending'
      from dc_quote_versions v join leads l on l.id = v.lead_id
      where v.id = ${input.versionId} and v.lead_id = ${input.leadId}
        and v.status = 'signed' and l.status = 'signed'
        and (v.client_total_cents + 1) / 2 = ${input.amountCents}
        and not exists (select 1 from deposits d where d.dc_quote_version_id = v.id and d.status = 'paid')
      on conflict do nothing
      returning *
    )
    select * from inserted
    union all
    select * from deposits
    where dc_quote_version_id = ${input.versionId} and lead_id = ${input.leadId}
      and status = 'pending' and method = 'stripe'
      and not exists (select 1 from inserted)
    limit 1`;
  return rows[0] ? toDeposit(rows[0]) : null;
}

/** The open card deposit, read in a fresh statement when a racing claim could not see it yet. */
export async function pendingStripeDeposit(versionId: string): Promise<Deposit | null> {
  if (!isUuid(versionId)) return null;
  const rows = await db()`
    select * from deposits where dc_quote_version_id = ${versionId} and status = 'pending' and method = 'stripe' limit 1`;
  return rows[0] ? toDeposit(rows[0]) : null;
}

export async function attachSession(depositId: string, sessionId: string): Promise<boolean> {
  if (!isUuid(depositId)) return false;
  const rows = await db()`
    update deposits set stripe_session_id = ${sessionId}
    where id = ${depositId} and status = 'pending' and (stripe_session_id is null or stripe_session_id = ${sessionId})
    returning id`;
  return rows.length > 0;
}

/**
 * Spec §4, the verified webhook's write. One statement, idempotent: it acts only on this pending card
 * deposit, for exactly the amount charged, while no deposit of the version is paid. deposit_cents is
 * written and a Signed job moves to Sold; a job the owner moved elsewhere keeps its stage, and the
 * payment is still recorded. A duplicate delivery matches nothing and answers null.
 */
export async function markStripeDepositPaid(input: {
  depositId: string; sessionId: string; paymentIntentId: string | null; amountCents: number;
}): Promise<{ leadId: string } | null> {
  if (!isUuid(input.depositId)) return null;
  const rows = await db()`
    with paid as (
      update deposits set status = 'paid', paid_at = now(), stripe_session_id = ${input.sessionId},
        stripe_payment_intent_id = ${input.paymentIntentId}
      where id = ${input.depositId} and method = 'stripe' and status = 'pending'
        and (stripe_session_id = ${input.sessionId} or stripe_session_id is null)
        and amount_cents = ${input.amountCents}
        and not exists (select 1 from deposits d where d.dc_quote_version_id = deposits.dc_quote_version_id and d.status = 'paid')
      returning lead_id, amount_cents
    ),
    prev as (select l.status from leads l join paid on l.id = paid.lead_id),
    moved as (
      update leads set deposit_cents = (select amount_cents from paid),
        status = case when status = 'signed' then 'sold' else status end,
        stage_changed_at = case when status = 'signed' then now() else stage_changed_at end,
        updated_at = now()
      where id = (select lead_id from paid)
      returning id
    ),
    payment_logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${STRIPE_ACTOR}, 'payment', ${`Deposit ${formatCents(input.amountCents)} paid by card`} from paid
    ),
    stage_logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status, body)
      select moved.id, ${STRIPE_ACTOR}, 'stage', prev.status, 'sold', 'Deposit paid' from moved, prev
      where prev.status = 'signed'
    )
    select lead_id from paid`;
  return rows[0] ? { leadId: rows[0].lead_id as string } : null;
}

/**
 * The owner's "Payment received": one statement inserts the paid row (Signed job and version, nothing
 * paid yet), expires any pending card checkout of the version, writes deposit_cents, moves Signed to
 * Sold and logs both. The caller closes the Stripe session first (closeCheckout).
 */
export async function recordDepositPayment(input: {
  leadId: string; versionId: string; amountCents: number; method: RecordedMethod; actor: string;
}): Promise<{ depositId: string } | null> {
  if (!isUuid(input.leadId) || !isUuid(input.versionId) || !isRecordedMethod(input.method)) return null;
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) return null;
  const rows = await db()`
    with paid as (
      insert into deposits (id, lead_id, dc_quote_version_id, amount_cents, method, status, recorded_by, paid_at)
      select ${randomUUID()}, v.lead_id, v.id, ${input.amountCents}, ${input.method}, 'paid', ${input.actor}, now()
      from dc_quote_versions v join leads l on l.id = v.lead_id
      where v.id = ${input.versionId} and v.lead_id = ${input.leadId}
        and v.status = 'signed' and l.status = 'signed'
        and not exists (select 1 from deposits d where d.dc_quote_version_id = v.id and d.status = 'paid')
      returning id, lead_id, amount_cents
    ),
    expired as (
      update deposits set status = 'expired'
      where dc_quote_version_id = ${input.versionId} and status = 'pending' and exists (select 1 from paid)
      returning id
    ),
    prev as (select l.status from leads l join paid on l.id = paid.lead_id),
    moved as (
      update leads set deposit_cents = (select amount_cents from paid),
        status = case when status = 'signed' then 'sold' else status end,
        stage_changed_at = case when status = 'signed' then now() else stage_changed_at end,
        updated_at = now()
      where id = (select lead_id from paid)
      returning id
    ),
    payment_logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.actor}, 'payment',
        ${`Deposit ${formatCents(input.amountCents)} received ${RECEIVED[input.method]}`} from paid
    ),
    stage_logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status, body)
      select moved.id, ${input.actor}, 'stage', prev.status, 'sold', 'Deposit recorded' from moved, prev
      where prev.status = 'signed'
    )
    select id from paid`;
  return rows[0] ? { depositId: rows[0].id as string } : null;
}

/** checkout.session.expired: only a pending deposit expires, so an expiry after payment changes nothing. */
export async function expireDeposit(sessionId: string): Promise<boolean> {
  const rows = await db()`
    update deposits set status = 'expired' where stripe_session_id = ${sessionId} and status = 'pending'
    returning id`;
  return rows.length > 0;
}

/**
 * Cancel & refund (spec §4), after any Stripe refund succeeded. One statement: the paid deposit →
 * refunded (only at the amount the owner saw), its version signed → cancelled, the job → Lost with
 * deposit_cents cleared, and a 'payment' and a 'stage' event.
 */
export async function cancelDeposit(input: { leadId: string; deposit: Deposit; actor: string }): Promise<boolean> {
  if (!isUuid(input.leadId) || !isUuid(input.deposit.id)) return false;
  const amount = formatCents(input.deposit.amountCents);
  const body = input.deposit.method === "stripe"
    ? `Deposit ${amount} refunded to the client's card`
    : `Deposit ${amount} (${input.deposit.method}) marked refunded — return it to the client`;
  const rows = await db()`
    with refunded as (
      update deposits set status = 'refunded', refunded_at = now()
      where id = ${input.deposit.id} and lead_id = ${input.leadId} and status = 'paid' and amount_cents = ${input.deposit.amountCents}
      returning lead_id, dc_quote_version_id
    ),
    cancelled as (
      update dc_quote_versions set status = 'cancelled', cancelled_at = now()
      where id = (select dc_quote_version_id from refunded) and status = 'signed'
      returning id
    ),
    prev as (select l.status from leads l join refunded r on l.id = r.lead_id),
    lost as (
      update leads set status = 'lost', lost_reason = ${CANCEL_REASON}, deposit_cents = null,
        follow_up_at = null, follow_up_note = null, stage_changed_at = now(), updated_at = now()
      where id = (select lead_id from refunded) and status <> 'lost'
      returning id
    ),
    payment_logged as (
      insert into job_events (lead_id, actor, kind, body)
      select lead_id, ${input.actor}, 'payment', ${body} from refunded
    ),
    stage_logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status, body)
      select lost.id, ${input.actor}, 'stage', prev.status, 'lost', ${CANCEL_REASON} from lost, prev
    )
    select lead_id from refunded`;
  return rows.length > 0;
}
```

- [ ] **Step 6: Run the tests, typecheck, lint**

Run: `npx vitest run --maxWorkers=2 tests/payments` → PASS. `npx tsc --noEmit` → clean. `npx eslint lib/payments tests/payments` → exit 0.

- [ ] **Step 7: Test power**

Delete `and status = 'pending'` from `markStripeDepositPaid`'s `paid` CTE → "marks the pending deposit paid…" fails. Delete `and (v.client_total_cents + 1) / 2 = ${input.amountCents}` from `claimStripeDeposit` → the claim test fails. Replace `Math.round(soldCents / 2)` with `Math.floor(soldCents / 2)` → both amount tests fail. Delete `and exists (select 1 from paid)` in `recordDepositPayment` → its test fails. Add `and status = 'signed'` to `moved`'s where → "records the payment on a job the owner moved on" fails. Restore each. (These prove SQL text only; Task 10 runs every statement on Postgres.)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json lib/payments tests/payments
git commit -m "feat: Stripe client and the deposit writes, each one idempotent statement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0122UD6P8agX8gRaojNYtEiL"
```

---

### Task 4: Stripe webhook and deposit emails

Read first: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` → "Webhooks" (read the raw body with `request.text()`; no body-parser config) and `…/03-file-conventions/02-route-segment-config/runtime.md` (Node.js is the default; do not export `runtime`). Precedent: `app/api/calendar/notifications/route.ts` (verify, answer fast, work in `after()`). `proxy.ts` only matches `/admin…`, so `/api/stripe/webhook` needs no exemption.

**Files:**
- Create: `app/api/stripe/webhook/route.ts`, `lib/payments/emails.ts`
- Modify: `lib/dc/notify.ts:52-59` (owner email wording is no longer DC-only)
- Test: `tests/payments/webhook-route.test.ts`, `tests/payments/emails.test.ts`

**Interfaces:**
- Consumes: `verifyWebhook` (Task 3); `markStripeDepositPaid`, `expireDeposit`, `depositBySession`, `depositState`, `type DepositMethod` (Task 3); `notifyOwners` (`lib/dc/notify.ts`); `getJob`, `type Job` (`lib/admin/jobs.ts`); `cancellationWindowLastDay` (`lib/docs/business-days.ts`).
- Produces:
  - `POST(request: Request): Promise<Response>` at `/api/stripe/webhook`
  - `sendDepositReceipts(leadId: string): Promise<void>` — client receipt and owner note for the job's paid deposit; never throws
  - `alertUnmatchedPayment(input: { sessionId: string; amountCents: number | null; depositId: string | null; reason: string }): Promise<void>` — throws on email failure (callers `.catch`)
  - `sendCancellationEmails(input: { job: Job; amountCents: number; method: DepositMethod; inWindow: boolean; actor: string }): Promise<void>` — never throws

- [ ] **Step 1: Write the failing tests**

`tests/payments/webhook-route.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const afterCbs: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { afterCbs.push(cb); } }));
const deposits = { markStripeDepositPaid: vi.fn(), expireDeposit: vi.fn(), depositBySession: vi.fn() };
vi.mock("@/lib/payments/deposits", () => deposits);
const emails = { sendDepositReceipts: vi.fn(), alertUnmatchedPayment: vi.fn() };
vi.mock("@/lib/payments/emails", () => emails);

const { POST } = await import("@/app/api/stripe/webhook/route");

const SECRET = "whsec_unit_test";
const DEPOSIT = "5d1f6a2e-3b4c-4d5e-8f60-7a8b9c0d1e2f";
const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const signer = new Stripe("sk_test_unit");
const session = (over: Record<string, unknown> = {}) => ({
  id: "cs_test_1", object: "checkout.session", payment_status: "paid", amount_total: 92417, payment_intent: "pi_test_1",
  metadata: { depositId: DEPOSIT, leadId: LEAD }, ...over,
});
const event = (type: string, object: object) => JSON.stringify({ id: `evt_${type}`, object: "event", type, data: { object } });
const signed = (body: string, secret = SECRET) => signer.webhooks.generateTestHeaderString({ payload: body, secret });
const post = (body: string, signature: string | null = signed(body)) =>
  POST(new Request("http://localhost/api/stripe/webhook", {
    method: "POST", body, headers: signature === null ? {} : { "stripe-signature": signature },
  }));
const runAfter = async () => { for (const cb of afterCbs.splice(0)) await cb(); };
const paidRow = { id: DEPOSIT, status: "paid", stripeSessionId: "cs_test_1", amountCents: 92417 };

beforeEach(() => {
  afterCbs.length = 0;
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit");
  for (const fn of [...Object.values(deposits), ...Object.values(emails)]) fn.mockReset();
  deposits.markStripeDepositPaid.mockResolvedValue({ leadId: LEAD });
  deposits.expireDeposit.mockResolvedValue(true);
  deposits.depositBySession.mockResolvedValue(null);
  emails.sendDepositReceipts.mockResolvedValue(undefined);
  emails.alertUnmatchedPayment.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/stripe/webhook", () => {
  it("refuses a body that does not verify with 400 and applies nothing", async () => {
    const body = event("checkout.session.completed", session());
    const refusals = [
      await post(body, signed(body, "whsec_someone_else")),
      await post(body, null),
      await post(body, "t=1,v1=deadbeef"),
      await post(body.replace("92417", "1"), signed(body)),
    ];
    for (const response of refusals) expect(response.status).toBe(400);
    expect(deposits.markStripeDepositPaid).not.toHaveBeenCalled();
    expect(deposits.expireDeposit).not.toHaveBeenCalled();
  });

  it("marks the deposit paid for a completed, paid checkout, then sends the receipts after answering", async () => {
    const response = await post(event("checkout.session.completed", session()));
    expect(response.status).toBe(200);
    expect(deposits.markStripeDepositPaid).toHaveBeenCalledWith({
      depositId: DEPOSIT, sessionId: "cs_test_1", paymentIntentId: "pi_test_1", amountCents: 92417,
    });
    expect(emails.sendDepositReceipts).not.toHaveBeenCalled();
    await runAfter();
    expect(emails.sendDepositReceipts).toHaveBeenCalledWith(LEAD);
  });

  it("waits on a completed checkout whose bank payment has not cleared", async () => {
    expect((await post(event("checkout.session.completed", session({ payment_status: "unpaid" })))).status).toBe(200);
    expect(deposits.markStripeDepositPaid).not.toHaveBeenCalled();
  });

  it("marks it paid when the delayed payment succeeds", async () => {
    await post(event("checkout.session.async_payment_succeeded", session()));
    expect(deposits.markStripeDepositPaid).toHaveBeenCalledTimes(1);
  });

  it("expires the pending deposit of an expired checkout, and nothing else", async () => {
    expect((await post(event("checkout.session.expired", session({ payment_status: "unpaid" })))).status).toBe(200);
    expect(deposits.expireDeposit).toHaveBeenCalledWith("cs_test_1");
    expect(deposits.markStripeDepositPaid).not.toHaveBeenCalled();
  });

  it("changes nothing and emails nobody for a duplicate delivery of a payment already applied", async () => {
    deposits.markStripeDepositPaid.mockResolvedValue(null);
    deposits.depositBySession.mockResolvedValue(paidRow);
    expect((await post(event("checkout.session.completed", session()))).status).toBe(200);
    await runAfter();
    expect(emails.sendDepositReceipts).not.toHaveBeenCalled();
    expect(emails.alertUnmatchedPayment).not.toHaveBeenCalled();
  });

  it("alerts the owners when a card payment lands on a deposit already recorded by hand", async () => {
    deposits.markStripeDepositPaid.mockResolvedValue(null);
    deposits.depositBySession.mockResolvedValue({ ...paidRow, status: "expired" });
    expect((await post(event("checkout.session.completed", session()))).status).toBe(200);
    await runAfter();
    expect(emails.alertUnmatchedPayment).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "cs_test_1", amountCents: 92417, depositId: DEPOSIT, reason: expect.stringContaining("recorded by hand"),
    }));
    expect(emails.sendDepositReceipts).not.toHaveBeenCalled();
  });

  it("alerts the owners when the amount charged is not the deposit", async () => {
    deposits.markStripeDepositPaid.mockResolvedValue(null);
    deposits.depositBySession.mockResolvedValue({ ...paidRow, status: "pending", amountCents: 90000 });
    await post(event("checkout.session.completed", session()));
    await runAfter();
    expect(emails.alertUnmatchedPayment).toHaveBeenCalledWith(expect.objectContaining({
      reason: "The card paid $924.17 but the deposit is $900.",
    }));
  });

  it("alerts, without writing, when a paid checkout names no deposit", async () => {
    await post(event("checkout.session.completed", session({ metadata: {} })));
    await runAfter();
    expect(deposits.markStripeDepositPaid).not.toHaveBeenCalled();
    expect(emails.alertUnmatchedPayment).toHaveBeenCalledWith(expect.objectContaining({ depositId: null }));
  });

  it("answers 500 when the database fails, so Stripe retries", async () => {
    deposits.markStripeDepositPaid.mockRejectedValue(new Error("db down"));
    expect((await post(event("checkout.session.completed", session()))).status).toBe(500);
  });

  it("acknowledges an event it does not handle", async () => {
    expect((await post(event("payment_intent.succeeded", { id: "pi_1", object: "payment_intent" }))).status).toBe(200);
    expect(deposits.markStripeDepositPaid).not.toHaveBeenCalled();
    expect(deposits.expireDeposit).not.toHaveBeenCalled();
  });
});
```

`tests/payments/emails.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/lib/leads/email", () => ({ ownerRecipients: () => ["owner@example.com"] }));
vi.mock("@/lib/admin/origin", () => ({ adminOrigin: () => "https://admin.example.com" }));
const jobs = { getJob: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const deposits = { depositState: vi.fn() };
vi.mock("@/lib/payments/deposits", () => deposits);

const { alertUnmatchedPayment, sendCancellationEmails, sendDepositReceipts } = await import("@/lib/payments/emails");

const LEAD = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const job = { id: LEAD, name: "Maria Lopez", email: " Maria@Example.com ", projectNo: 1048 };
const paid = { id: "d1", method: "stripe", amountCents: 92417, paidAt: new Date("2026-09-29T17:00:00Z"), recordedBy: null };
// Signed Monday Sep 28 2026: the third business day after is Thursday Oct 1.
const state = { soldCents: 184833, amountCents: 92417, signedAt: new Date("2026-09-28T17:00:00Z"), paid };
const sent = () => send.mock.calls.map((call) => call[0] as { to: string | string[]; subject: string; text: string });

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "re_test");
  jobs.getJob.mockReset().mockResolvedValue(job);
  deposits.depositState.mockReset().mockResolvedValue(state);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendDepositReceipts", () => {
  it("sends the client a receipt with the figures on record, and tells the owners the job is Sold", async () => {
    await sendDepositReceipts(LEAD);
    const [client, owners] = sent();
    expect(client.to).toBe("maria@example.com");
    expect(client.subject).toBe("Payment received — PSS-1048");
    expect(client.text).toContain("Payment received — thank you.");
    expect(client.text).toContain("Contract total:   $1,848.33");
    expect(client.text).toContain("Deposit paid:     $924.17 by card on Sep 29, 2026");
    expect(client.text).toContain("Balance due at installation: $924.16");
    expect(client.text).toContain("You may cancel until the end of Oct 1, 2026");
    expect(owners.to).toEqual(["owner@example.com"]);
    expect(owners.subject).toBe("Deposit paid: PSS-1048 — $924.17");
    expect(owners.text).toContain("Maria Lopez paid the 50% deposit of $924.17 by card.");
    expect(owners.text).toContain(`https://admin.example.com/admin/jobs/${LEAD}?tab=quote`);
  });

  it("names the owner who recorded a hand payment", async () => {
    deposits.depositState.mockResolvedValue({ ...state, paid: { ...paid, method: "check", recordedBy: "owner@example.com" } });
    await sendDepositReceipts(LEAD);
    expect(sent()[1].text).toContain("Recorded by: owner@example.com");
    expect(sent()[0].text).toContain("$924.17 by check");
  });

  it("sends nothing when nothing is paid, and never throws when an email fails", async () => {
    deposits.depositState.mockResolvedValue({ ...state, paid: null });
    await sendDepositReceipts(LEAD);
    expect(send).not.toHaveBeenCalled();
    deposits.depositState.mockResolvedValue(state);
    send.mockRejectedValue(new Error("resend down"));
    await expect(sendDepositReceipts(LEAD)).resolves.toBeUndefined();
  });
});

describe("alertUnmatchedPayment", () => {
  it("tells the owners what to look up in Stripe", async () => {
    await alertUnmatchedPayment({ sessionId: "cs_1", amountCents: 92417, depositId: "d1", reason: "Because." });
    const [alert] = sent();
    expect(alert.subject).toBe("A card payment needs checking in Stripe");
    for (const line of ["Because.", "Checkout Session: cs_1", "Amount:           $924.17", "Deposit:          d1"]) expect(alert.text).toContain(line);
  });
});

describe("sendCancellationEmails", () => {
  it("tells the client their card refund is on its way and the owners who cancelled", async () => {
    await sendCancellationEmails({ job: job as never, amountCents: 92417, method: "stripe", inWindow: true, actor: "owner@example.com" });
    const [client, owners] = sent();
    expect(client.subject).toBe("Your order PSS-1048 is cancelled");
    expect(client.text).toContain("Your deposit of $924.17 is being refunded to your card in full.");
    expect(owners.subject).toBe("Cancelled and refunded: PSS-1048");
    expect(owners.text).toContain("cancelled by owner@example.com");
    expect(owners.text).toContain("Cancellation window: still open");
  });
  it("tells the client a recorded deposit will be returned, and the owners to return it", async () => {
    await sendCancellationEmails({ job: job as never, amountCents: 50000, method: "check", inWindow: false, actor: "o@x" });
    const [client, owners] = sent();
    expect(client.text).toContain("We will return your deposit of $500 to you in full.");
    expect(owners.text).toContain("Deposit:  $500 (check) — return it to the client");
    expect(owners.text).toContain("Cancellation window: closed");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/payments/webhook-route.test.ts tests/payments/emails.test.ts`
Expected: FAIL — the route and `lib/payments/emails.ts` do not exist.

- [ ] **Step 3: Generalise the owner email wording**

`lib/dc/notify.ts` lines 51–59 (only the doc comment and the two error strings change; `grep -rn "DC import notification" tests` finds nothing that asserts them):

```ts
/** Plain text to the owners. Throws when misconfigured or rejected. Used by the DC import and the deposit flow. */
export async function notifyOwners(email: { subject: string; text: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = ownerRecipients();
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey || to.length === 0) throw new Error("Owner notification email is not configured");
  const { error } = await new Resend(apiKey).emails.send({ from: `${business.name} <${from}>`, to, subject: email.subject, text: email.text });
  if (error) throw new Error(`Resend rejected the owner notification: ${error.message}`);
}
```

- [ ] **Step 4: Implement `lib/payments/emails.ts`**

```ts
import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { getJob, type Job } from "@/lib/admin/jobs";
import { formatCents } from "@/lib/admin/money";
import { adminOrigin } from "@/lib/admin/origin";
import { formatDateOnly, formatShortDate } from "@/lib/admin/time";
import { notifyOwners } from "@/lib/dc/notify";
import { cancellationWindowLastDay } from "@/lib/docs/business-days";
import { normalizeEmail } from "@/lib/portal/access";
import { formatProjectNo } from "@/lib/portal/project-no";
import { depositState, type DepositMethod } from "./deposits";

const PAID_HOW: Record<DepositMethod, string> = { stripe: "by card", check: "by check", cash: "in cash", other: "by other means" };

/** Plain text to the client, like the contract email. Throws when misconfigured or rejected. */
async function emailClient(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const { error } = await new Resend(apiKey).emails.send({ from: `${business.name} <${from}>`, to, replyTo: business.email, subject, text });
  if (error) throw new Error(`Resend rejected the client email: ${error.message}`);
}

const greeting = (job: Pick<Job, "name">): string => {
  const first = job.name.trim().split(/\s+/)[0] || "";
  return first ? `Hi ${first},` : "Hi there,";
};

/** Runs every send; a failure is logged, never thrown, because what it reports is already recorded. */
async function settle(label: string, sends: Promise<void>[]): Promise<void> {
  for (const result of await Promise.allSettled(sends)) {
    if (result.status === "rejected") console.error(`${label} email failed`, result.reason);
  }
}

/**
 * The receipts for the job's paid deposit (spec §4): the client's, with the figures on record and the
 * last day to cancel, and the owners' note that the job is Sold.
 */
export async function sendDepositReceipts(leadId: string): Promise<void> {
  const [job, state] = await Promise.all([getJob(leadId), depositState(leadId)]);
  if (!job || !state?.paid) return;
  const deposit = state.paid;
  const projectNo = formatProjectNo(job.projectNo) ?? "your project";
  const how = PAID_HOW[deposit.method];
  const lastDay = formatDateOnly(cancellationWindowLastDay(state.signedAt));
  const to = normalizeEmail(job.email);
  const sends: Promise<void>[] = [];
  if (to) {
    sends.push(emailClient(to, `Payment received — ${projectNo}`, [
      greeting(job), "",
      "Payment received — thank you. Your order is confirmed.", "",
      `Contract total:   ${formatCents(state.soldCents)}`,
      `Deposit paid:     ${formatCents(deposit.amountCents)} ${how} on ${formatShortDate(deposit.paidAt ?? new Date())}`,
      `Balance due at installation: ${formatCents(state.soldCents - deposit.amountCents)}`, "",
      "Next, we will call you to book your final measure.",
      `You may cancel until the end of ${lastDay}. If you do, we refund your deposit in full.`, "",
      `Questions? Call us at ${business.phone.display} or just reply to this email.`, "", business.name,
    ].join("\n")));
  }
  sends.push(notifyOwners({
    subject: `Deposit paid: ${projectNo} — ${formatCents(deposit.amountCents)}`,
    text: [
      `${job.name} paid the 50% deposit of ${formatCents(deposit.amountCents)} ${how}.`, "",
      `Project:  ${projectNo}`,
      `Contract: ${formatCents(state.soldCents)}`,
      deposit.recordedBy ? `Recorded by: ${deposit.recordedBy}` : null, "",
      `The job has moved to Sold. Book the official measure. Order after the cancellation window closes at the end of ${lastDay}.`,
      `Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}?tab=quote`,
    ].filter((line): line is string => line !== null).join("\n"),
  }));
  await settle("A deposit receipt", sends);
}

/** A verified card payment PSS could not apply (Review Focus 1 and 3). Throws on failure; callers catch. */
export async function alertUnmatchedPayment(input: { sessionId: string; amountCents: number | null; depositId: string | null; reason: string }): Promise<void> {
  await notifyOwners({
    subject: "A card payment needs checking in Stripe",
    text: [
      "Stripe reported a paid deposit checkout that PSS did not record.", "",
      input.reason, "",
      `Checkout Session: ${input.sessionId}`,
      `Amount:           ${input.amountCents === null ? "unknown" : formatCents(input.amountCents)}`,
      `Deposit:          ${input.depositId ?? "none"}`, "",
      "Open the payment in the Stripe dashboard (search for the Checkout Session) and refund it if it is a second payment for the same deposit.",
    ].join("\n"),
  });
}

/** Cancel & refund (spec §4): the client and the owners are told. Neither failure is thrown. */
export async function sendCancellationEmails(input: { job: Job; amountCents: number; method: DepositMethod; inWindow: boolean; actor: string }): Promise<void> {
  const { job } = input;
  const projectNo = formatProjectNo(job.projectNo) ?? "your project";
  const amount = formatCents(input.amountCents);
  const card = input.method === "stripe";
  const to = normalizeEmail(job.email);
  const sends: Promise<void>[] = [];
  if (to) {
    sends.push(emailClient(to, `Your order ${projectNo} is cancelled`, [
      greeting(job), "",
      `Your order ${projectNo} is cancelled.`,
      card
        ? `Your deposit of ${amount} is being refunded to your card in full. Refunds usually reach your card within 5 to 10 business days.`
        : `We will return your deposit of ${amount} to you in full.`, "",
      `Questions? Call us at ${business.phone.display} or just reply to this email.`, "", business.name,
    ].join("\n")));
  }
  sends.push(notifyOwners({
    subject: `Cancelled and refunded: ${projectNo}`,
    text: [
      `${job.name}'s order was cancelled by ${input.actor}.`, "",
      `Deposit:  ${amount} ${card ? "refunded to the card through Stripe" : `(${input.method}) — return it to the client`}`,
      `Cancellation window: ${input.inWindow ? "still open" : "closed"}`, "",
      "The contract is cancelled and the job is Lost.",
      `Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}?tab=quote`,
    ].join("\n"),
  }));
  await settle("A cancellation", sends);
}
```

- [ ] **Step 5: Implement `app/api/stripe/webhook/route.ts`**

```ts
import { after } from "next/server";
import type Stripe from "stripe";
import { isUuid } from "@/lib/admin/ids";
import { formatCents } from "@/lib/admin/money";
import { depositBySession, expireDeposit, markStripeDepositPaid } from "@/lib/payments/deposits";
import { alertUnmatchedPayment, sendDepositReceipts } from "@/lib/payments/emails";
import { verifyWebhook } from "@/lib/payments/stripe";

/**
 * Stripe calls this for checkout.session.completed, .async_payment_succeeded and .expired (Rollout step 1).
 *
 * The body is read raw: the signature covers the exact bytes, and a body that does not verify is refused
 * with 400 before anything is read from it. Every write acts only on a pending deposit, so a duplicate or
 * late delivery changes nothing twice (Review Focus 1). Emails run in after(), so Stripe gets its 2xx fast.
 * A database failure answers 500, which makes Stripe retry.
 */
export async function POST(request: Request) {
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = verifyWebhook(body, request.headers.get("stripe-signature"));
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await settle(event.data.object);
    } else if (event.type === "checkout.session.expired") {
      await expireDeposit(event.data.object.id);
    }
  } catch (error) {
    console.error(`Stripe event ${event.id} (${event.type}) could not be applied`, error);
    return new Response("Could not apply the event", { status: 500 });
  }
  return new Response(null, { status: 200 });
}

/** A paid Checkout Session marks its pending deposit paid. Unpaid (a bank payment clearing) waits for async_payment_succeeded. */
async function settle(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") return;
  const depositId = session.metadata?.depositId ?? "";
  const amountCents = session.amount_total;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const alert = (reason: string) =>
    after(() => alertUnmatchedPayment({ sessionId: session.id, amountCents, depositId: isUuid(depositId) ? depositId : null, reason }).catch(console.error));

  if (!isUuid(depositId) || amountCents === null) {
    alert("The payment names no deposit PSS knows.");
    return;
  }
  const paid = await markStripeDepositPaid({ depositId, sessionId: session.id, paymentIntentId, amountCents });
  if (paid) {
    after(() => sendDepositReceipts(paid.leadId).catch(console.error));
    return;
  }
  const existing = await depositBySession(session.id);
  // A repeat of an event already applied: the common case, and nothing to say.
  if (existing?.status === "paid") return;
  if (!existing) alert("No deposit matched this payment.");
  else if (existing.status === "pending") alert(`The card paid ${formatCents(amountCents)} but the deposit is ${formatCents(existing.amountCents)}.`);
  else alert(`The deposit was already ${existing.status} when this card payment arrived — most likely it was recorded by hand meanwhile. Refund the card payment if so.`);
}
```

- [ ] **Step 6: Run the tests, typecheck, lint**

Run: `npx vitest run --maxWorkers=2 tests/payments tests/dc/notify.test.ts` → PASS. `npx tsc --noEmit` → clean. `npx eslint app/api/stripe lib/payments lib/dc/notify.ts tests/payments` → exit 0.

- [ ] **Step 7: Test power**

Replace the `verifyWebhook` call with `event = JSON.parse(body)` → the 400 test fails. Delete `if (existing?.status === "paid") return;` → the duplicate-delivery test fails (an alert goes out). Delete `if (session.payment_status !== "paid") return;` → "waits on a completed checkout…" fails. Restore.

- [ ] **Step 8: Commit**

```bash
git add app/api/stripe lib/payments/emails.ts lib/dc/notify.ts tests/payments
git commit -m "feat: verified Stripe webhook marks deposits paid, with receipts and unmatched-payment alerts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0122UD6P8agX8gRaojNYtEiL"
```

---

### Task 5: The client pays the deposit

**Files:**
- Create: `app/(site)/project/deposit-actions.ts`, `app/(site)/project/DepositCard.tsx`, `app/(site)/project/PayDepositButton.tsx`
- Modify: `app/(site)/project/ProjectView.tsx`, `app/(site)/project/page.tsx`, `app/(site)/project/[jobId]/page.tsx`, `lib/portal/send-signature-email.ts` (`sendCustomerSignedCopy` only)
- Test: `tests/portal/deposit-action.test.ts`, `tests/portal/deposit-ui.test.tsx`, `tests/portal/project-view.test.tsx`, `tests/portal/signature-email.test.ts`

**Interfaces:**
- Consumes: `depositState`, `claimStripeDeposit`, `pendingStripeDeposit`, `attachSession`, `expireDeposit`, `expireStaleDeposits`, `type Deposit`, `type DepositState` (Task 3); `stripeClient` (Task 3); `requireCustomer` (`lib/portal/session.ts`), `portalOrigin` (`lib/portal/login.ts`), `cancellationWindowLastDay` (`lib/docs/business-days.ts`).
- Produces:
  - `type StartDepositResult = { url: string } | "not-found" | "not-due" | "paid" | "processing" | "unavailable"`
  - `startDepositAction(jobId: string): Promise<StartDepositResult>`; `startDepositFormAction(formData: FormData): Promise<void>` (redirects to Stripe, or to `/project/<job>?deposit=<result>`)
  - `DepositCard({ jobId, amountCents, lastCancellableDay }: { jobId: string; amountCents: number; lastCancellableDay: string })`, `DepositNotice({ flag, paid }: { flag: string | null; paid: boolean })`
  - `ProjectView` prop `justDeposit?: string | null`; both project pages pass `?deposit=`.
  - Portal copy: button "Pay 50% deposit — $X"; notices "Payment received — thank you." and "Processing — we will email your receipt as soon as your payment is confirmed."

- [ ] **Step 1: Write the failing action tests**

`tests/portal/deposit-action.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCustomer = vi.fn();
vi.mock("@/lib/portal/session", () => ({ requireCustomer }));
vi.mock("@/lib/portal/login", () => ({ portalOrigin: () => "https://pss.test" }));
const deposits = {
  depositState: vi.fn(), claimStripeDeposit: vi.fn(), pendingStripeDeposit: vi.fn(), attachSession: vi.fn(),
  expireDeposit: vi.fn(), expireStaleDeposits: vi.fn(),
};
vi.mock("@/lib/payments/deposits", () => deposits);
const create = vi.fn();
const retrieve = vi.fn();
const stripeClient = vi.fn(() => ({ checkout: { sessions: { create, retrieve } } }) as unknown);
vi.mock("@/lib/payments/stripe", () => ({ stripeClient }));
const redirect = vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT ${path}`); });
vi.mock("next/navigation", () => ({ redirect }));

const { startDepositAction, startDepositFormAction } = await import("@/app/(site)/project/deposit-actions");

const MINE = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const THEIRS = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const VERSION = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const DEPOSIT = "5d1f6a2e-3b4c-4d5e-8f60-7a8b9c0d1e2f";
const EMAIL = "maria@example.com";
const job = { id: MINE, name: "Maria Lopez", projectNo: 1048, status: "signed" };
const state = { jobStatus: "signed", versionId: VERSION, version: 1, versionStatus: "signed", soldCents: 184833, amountCents: 92417,
  signedAt: new Date("2026-09-28T17:00:00Z"), paid: null, pending: null, refunded: null };
const pending = (over: Record<string, unknown> = {}) => ({ id: DEPOSIT, leadId: MINE, versionId: VERSION, amountCents: 92417,
  method: "stripe", status: "pending", stripeSessionId: null, stripePaymentIntentId: null, recordedBy: null,
  createdAt: new Date(), paidAt: null, refundedAt: null, ...over });
const open = { id: "cs_1", status: "open", url: "https://checkout.stripe.test/c/cs_1" };

beforeEach(() => {
  for (const fn of [...Object.values(deposits), create, retrieve, redirect]) fn.mockClear();
  requireCustomer.mockReset().mockResolvedValue({ email: EMAIL, jobs: [job] });
  deposits.depositState.mockReset().mockResolvedValue(state);
  deposits.claimStripeDeposit.mockReset().mockResolvedValue(pending());
  deposits.pendingStripeDeposit.mockReset().mockResolvedValue(null);
  deposits.attachSession.mockReset().mockResolvedValue(true);
  deposits.expireDeposit.mockReset().mockResolvedValue(true);
  deposits.expireStaleDeposits.mockReset().mockResolvedValue(0);
  create.mockReset().mockResolvedValue(open);
  retrieve.mockReset().mockResolvedValue(open);
  stripeClient.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("startDepositAction", () => {
  it("refuses a job the customer does not own before reading anything", async () => {
    expect(await startDepositAction(THEIRS)).toBe("not-found");
    expect(deposits.depositState).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a job that is not Signed, and one whose deposit is paid", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [{ ...job, status: "approved" }] });
    expect(await startDepositAction(MINE)).toBe("not-due");
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [job] });
    deposits.depositState.mockResolvedValue({ ...state, paid: pending({ status: "paid" }) });
    expect(await startDepositAction(MINE)).toBe("paid");
    expect(create).not.toHaveBeenCalled();
    expect(deposits.claimStripeDeposit).not.toHaveBeenCalled();
  });

  it("claims a pending deposit at the stored half and opens Checkout for exactly it", async () => {
    expect(await startDepositAction(MINE)).toEqual({ url: "https://checkout.stripe.test/c/cs_1" });
    expect(deposits.expireStaleDeposits).toHaveBeenCalledWith(VERSION);
    expect(deposits.claimStripeDeposit).toHaveBeenCalledWith({ leadId: MINE, versionId: VERSION, amountCents: 92417 });
    expect(create).toHaveBeenCalledWith({
      mode: "payment",
      customer_email: EMAIL,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 92417, product_data: { name: "50% deposit — PSS-1048" } } }],
      metadata: { depositId: DEPOSIT, leadId: MINE },
      payment_intent_data: { metadata: { depositId: DEPOSIT, leadId: MINE } },
      success_url: `https://pss.test/project/${MINE}?deposit=done`,
      cancel_url: `https://pss.test/project/${MINE}`,
    }, { idempotencyKey: `deposit-${DEPOSIT}` });
    expect(deposits.attachSession).toHaveBeenCalledWith(DEPOSIT, "cs_1");
  });

  it("reuses the open session of a pending deposit instead of creating another", async () => {
    deposits.claimStripeDeposit.mockResolvedValue(pending({ stripeSessionId: "cs_1" }));
    expect(await startDepositAction(MINE)).toEqual({ url: "https://checkout.stripe.test/c/cs_1" });
    expect(retrieve).toHaveBeenCalledWith("cs_1");
    expect(create).not.toHaveBeenCalled();
  });

  it("says processing, and opens nothing, when the pending checkout already completed", async () => {
    deposits.claimStripeDeposit.mockResolvedValue(pending({ stripeSessionId: "cs_1" }));
    retrieve.mockResolvedValue({ ...open, status: "complete" });
    expect(await startDepositAction(MINE)).toBe("processing");
  });

  it("gives up an expired checkout and opens a fresh one", async () => {
    deposits.claimStripeDeposit
      .mockResolvedValueOnce(pending({ stripeSessionId: "cs_old" }))
      .mockResolvedValueOnce(pending({ id: "6e2f7b3f-4c5d-4e6f-9a71-8b9c0d1e2f3a" }));
    retrieve.mockResolvedValue({ id: "cs_old", status: "expired", url: null });
    expect(await startDepositAction(MINE)).toEqual({ url: "https://checkout.stripe.test/c/cs_1" });
    expect(deposits.expireDeposit).toHaveBeenCalledWith("cs_old");
    expect(create).toHaveBeenCalledWith(expect.anything(), { idempotencyKey: "deposit-6e2f7b3f-4c5d-4e6f-9a71-8b9c0d1e2f3a" });
  });

  it("lands two concurrent taps on one pending row and one idempotency key, so Stripe opens one session", async () => {
    const [a, b] = await Promise.all([startDepositAction(MINE), startDepositAction(MINE)]);
    expect(a).toEqual(b);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
    expect(create.mock.calls[0][1]).toEqual({ idempotencyKey: `deposit-${DEPOSIT}` });
  });

  it("reads the pending row again when a racing claim could not see it", async () => {
    deposits.claimStripeDeposit.mockResolvedValue(null);
    deposits.pendingStripeDeposit.mockResolvedValue(pending());
    expect(await startDepositAction(MINE)).toEqual({ url: "https://checkout.stripe.test/c/cs_1" });
    expect(deposits.pendingStripeDeposit).toHaveBeenCalledWith(VERSION);
  });

  it("answers unavailable when Stripe is not configured or refuses", async () => {
    stripeClient.mockReturnValueOnce(null);
    expect(await startDepositAction(MINE)).toBe("unavailable");
    create.mockRejectedValueOnce(new Error("stripe down"));
    expect(await startDepositAction(MINE)).toBe("unavailable");
  });
});

describe("startDepositFormAction", () => {
  const form = (jobId: string) => { const data = new FormData(); data.set("jobId", jobId); return data; };
  it("sends the client to Stripe", async () => {
    await expect(startDepositFormAction(form(MINE))).rejects.toThrow("NEXT_REDIRECT https://checkout.stripe.test/c/cs_1");
  });
  it("brings a refusal back to the project page as a hint", async () => {
    stripeClient.mockReturnValueOnce(null);
    await expect(startDepositFormAction(form(MINE))).rejects.toThrow(`NEXT_REDIRECT /project/${MINE}?deposit=unavailable`);
  });
});
```

- [ ] **Step 2: Write the failing UI and email tests**

`tests/portal/deposit-ui.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { business } from "@/content/business";

vi.mock("@/app/(site)/project/deposit-actions", () => ({ startDepositFormAction: vi.fn() }));
const { DepositCard, DepositNotice } = await import("@/app/(site)/project/DepositCard");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

describe("DepositCard", () => {
  it("offers the deposit with its amount and the last day to cancel, as a plain form post", () => {
    render(<DepositCard jobId={JOB} amountCents={92417} lastCancellableDay="2026-10-01" />);
    expect(screen.getByRole("button", { name: "Pay 50% deposit — $924.17" })).toHaveAttribute("type", "submit");
    expect(screen.getByText(/You may cancel until the end of Oct 1, 2026/)).toBeInTheDocument();
    expect(document.querySelector('input[type="hidden"][name="jobId"]')).toHaveValue(JOB);
  });
});

describe("DepositNotice", () => {
  it("says the payment is received only when a deposit is recorded paid", () => {
    const { unmount } = render(<DepositNotice flag="done" paid />);
    expect(screen.getByRole("status")).toHaveTextContent("Payment received — thank you.");
    unmount();
    render(<DepositNotice flag="done" paid={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Processing — we will email your receipt as soon as your payment is confirmed.");
  });
  it("gives a way forward when card payment is unavailable, and says nothing otherwise", () => {
    const { unmount } = render(<DepositNotice flag="unavailable" paid={false} />);
    expect(screen.getByRole("status")).toHaveTextContent(business.phone.display);
    unmount();
    for (const flag of [null, "not-due", "not-found", "paid", "anything"]) {
      const view = render(<DepositNotice flag={flag} paid={false} />);
      expect(screen.queryByRole("status")).toBeNull();
      view.unmount();
    }
  });
});
```

`tests/portal/project-view.test.tsx` — add the mocks next to the existing ones:

```ts
const depositState = vi.fn(async (_id: string) => null as unknown);
vi.mock("@/lib/payments/deposits", () => ({ depositState }));
vi.mock("@/app/(site)/project/deposit-actions", () => ({ startDepositFormAction: vi.fn() }));
```

add `depositState.mockReset().mockResolvedValue(null);` to `beforeEach`, and a block:

```tsx
describe("ProjectView deposit", () => {
  const signedState = { jobStatus: "signed", versionId: "v", version: 1, versionStatus: "signed", soldCents: 184833, amountCents: 92417,
    signedAt: new Date("2026-09-28T17:00:00Z"), paid: null, pending: null, refunded: null };

  it("asks a Signed job for its deposit under Needs your attention", async () => {
    depositState.mockResolvedValue(signedState);
    render(await ProjectView({ job: { ...job, status: "signed" } }));
    const attention = screen.getByRole("region", { name: "Needs your attention" });
    expect(within(attention).getByRole("button", { name: "Pay 50% deposit — $924.17" })).toBeInTheDocument();
    expect(within(attention).getByText(/You may cancel until the end of Oct 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Action required")).toBeInTheDocument();
  });

  it("asks nothing once the deposit is paid, or on a job that is not Signed", async () => {
    depositState.mockResolvedValue({ ...signedState, paid: { id: "d", status: "paid" } });
    const { unmount } = render(await ProjectView({ job: { ...job, status: "signed" } }));
    expect(screen.queryByRole("button", { name: /Pay 50% deposit/ })).toBeNull();
    unmount();
    depositState.mockResolvedValue(signedState);
    render(await ProjectView({ job: { ...job, status: "sold" } }));
    expect(screen.queryByRole("button", { name: /Pay 50% deposit/ })).toBeNull();
  });

  it("believes the payment only from the database, never from ?deposit=done", async () => {
    depositState.mockResolvedValue(signedState);
    const { unmount } = render(await ProjectView({ job: { ...job, status: "signed" }, justDeposit: "done" }));
    expect(screen.getByText("Processing — we will email your receipt as soon as your payment is confirmed.")).toBeInTheDocument();
    expect(screen.queryByText("Payment received — thank you.")).toBeNull();
    unmount();
    depositState.mockResolvedValue({ ...signedState, paid: { id: "d", status: "paid" } });
    render(await ProjectView({ job: { ...job, status: "sold" }, justDeposit: "done" }));
    expect(screen.getByText("Payment received — thank you.")).toBeInTheDocument();
  });
});
```

`tests/portal/signature-email.test.ts` — add the mock at the top (after the `@/lib/leads/email` mock):

```ts
const depositState = vi.fn(async (_id: string) => null as unknown);
vi.mock("@/lib/payments/deposits", () => ({ depositState }));
```

`depositState.mockReset().mockResolvedValue(null);` in `beforeEach`, and in `describe("sendCustomerSignedCopy", …)`:

```ts
  it("adds the deposit and where to pay it once the signed job owes one", async () => {
    depositState.mockResolvedValue({ jobStatus: "signed", versionStatus: "signed", amountCents: 92417, paid: null,
      signedAt: new Date("2026-09-28T17:00:00Z") });
    await sendCustomerSignedCopy("jane@example.com", job, "Contract PSS-1012 v1.pdf", null);
    const text = send.mock.calls[0][0].text as string;
    expect(text).toContain(`Next: your 50% deposit of $924.17 confirms your order. Pay it on your project page: premiershadesolutions.com/project/${job.id}`);
    expect(text).toContain("You may cancel until the end of Oct 1, 2026 and we will refund your deposit in full.");
  });

  it("says nothing about a deposit that is paid, or when there is none", async () => {
    depositState.mockResolvedValue({ jobStatus: "sold", versionStatus: "signed", amountCents: 92417, paid: { id: "d" },
      signedAt: new Date("2026-09-28T17:00:00Z") });
    await sendCustomerSignedCopy("jane@example.com", job, "Contract.pdf", null);
    expect(send.mock.calls[0][0].text).not.toContain("deposit");
  });
```

(`content/business.ts` has `domain: "https://premiershadesolutions.com"`; the file already strips the scheme into `bareDomain`.)

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/portal/deposit-action.test.ts tests/portal/deposit-ui.test.tsx tests/portal/project-view.test.tsx tests/portal/signature-email.test.ts`
Expected: FAIL — the modules do not exist, ProjectView has no deposit card, the email has no deposit line.

- [ ] **Step 4: Implement the action**

`app/(site)/project/deposit-actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import type Stripe from "stripe";
import {
  attachSession, claimStripeDeposit, depositState, expireDeposit, expireStaleDeposits, pendingStripeDeposit, type Deposit,
} from "@/lib/payments/deposits";
import { stripeClient } from "@/lib/payments/stripe";
import { portalOrigin } from "@/lib/portal/login";
import { formatProjectNo } from "@/lib/portal/project-no";
import { requireCustomer } from "@/lib/portal/session";

export type StartDepositResult = { url: string } | "not-found" | "not-due" | "paid" | "processing" | "unavailable";

const text = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");

/** One deposit row, one Checkout Session: the same row always produces the same parameters. */
function checkoutParams(job: { id: string; projectNo?: number | null }, email: string, deposit: Deposit): Stripe.Checkout.SessionCreateParams {
  const origin = portalOrigin();
  const projectNo = formatProjectNo(job.projectNo) ?? "PSS";
  return {
    mode: "payment",
    customer_email: email,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: deposit.amountCents, product_data: { name: `50% deposit — ${projectNo}` } } }],
    metadata: { depositId: deposit.id, leadId: job.id },
    payment_intent_data: { metadata: { depositId: deposit.id, leadId: job.id } },
    success_url: `${origin}/project/${job.id}?deposit=done`,
    cancel_url: `${origin}/project/${job.id}`,
  };
}

/**
 * Opens (or re-opens) Stripe Checkout for the 50% deposit (spec §4).
 *
 * Settled server-side, none of it from the request: ownership (the session's own jobs), the stage
 * (Signed), the amount (the signed version's stored total, checked again in the claim statement) and
 * that nothing is paid. Paying is never believed here: only the verified webhook marks it paid.
 *
 * A second tap, a back button or a double click lands on the same checkout (Review Focus 2): the
 * pending row is claimed in one statement, its id is the idempotency key of the Session, and an
 * existing Session is re-read rather than re-created.
 */
export async function startDepositAction(jobId: string): Promise<StartDepositResult> {
  const { email, jobs } = await requireCustomer();
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) return "not-found";
  const state = await depositState(job.id);
  if (state?.paid) return "paid";
  if (job.status !== "signed" || !state || state.versionStatus !== "signed" || state.jobStatus !== "signed") return "not-due";
  const stripe = stripeClient();
  if (!stripe) return "unavailable";

  await expireStaleDeposits(state.versionId);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const deposit = (await claimStripeDeposit({ leadId: job.id, versionId: state.versionId, amountCents: state.amountCents }))
      ?? (await pendingStripeDeposit(state.versionId));
    if (!deposit) return "not-due";
    let session: Stripe.Checkout.Session;
    try {
      session = deposit.stripeSessionId
        ? await stripe.checkout.sessions.retrieve(deposit.stripeSessionId)
        : await stripe.checkout.sessions.create(checkoutParams(job, email, deposit), { idempotencyKey: `deposit-${deposit.id}` });
    } catch (error) {
      console.error(`Could not open card checkout for deposit ${deposit.id}`, error);
      return "unavailable";
    }
    if (session.status === "complete") return "processing";
    if (session.status === "open" && session.url) {
      await attachSession(deposit.id, session.id);
      return { url: session.url };
    }
    // Expired at Stripe: give the row up and claim a fresh one, once.
    await expireDeposit(session.id);
  }
  return "unavailable";
}

/** The form's wrapper: to Stripe, or back to the project page with the outcome as a hint only. */
export async function startDepositFormAction(formData: FormData): Promise<void> {
  const jobId = text(formData.get("jobId"));
  const result = await startDepositAction(jobId);
  // Outside any try/catch: redirect() works by throwing.
  if (typeof result === "object") redirect(result.url);
  redirect(`/project/${encodeURIComponent(jobId)}?deposit=${result}`);
}
```

- [ ] **Step 5: Implement the card, the button and the notice**

`app/(site)/project/PayDepositButton.tsx`:

```tsx
"use client";

import { useFormStatus } from "react-dom";

/** Disabled while the post is in flight, so a double click sends one request where JavaScript runs. The server copes with two anyway. */
export function PayDepositButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 bg-charcoal px-5 py-3 font-display text-xs uppercase tracking-[0.2em] text-ivory disabled:opacity-60"
    >
      {label}
    </button>
  );
}
```

`app/(site)/project/DepositCard.tsx`:

```tsx
import { business } from "@/content/business";
import { formatCents } from "@/lib/admin/money";
import { formatDateOnly } from "@/lib/admin/time";
import { startDepositFormAction } from "./deposit-actions";
import { PayDepositButton } from "./PayDepositButton";

/**
 * Spec §3: after signing, the 50% deposit, its amount and the last day the client may cancel. A plain
 * form post, so it works with JavaScript off; the action re-derives the job, the stage and the amount.
 */
export function DepositCard({ jobId, amountCents, lastCancellableDay }: { jobId: string; amountCents: number; lastCancellableDay: string }) {
  return (
    <form action={startDepositFormAction} className="flex max-w-md flex-col gap-3 border border-rule bg-sand/50 p-4">
      <input type="hidden" name="jobId" value={jobId} />
      <p className="text-sm">
        Your contract is signed. A 50% deposit of {formatCents(amountCents)} confirms your order; the balance is due at installation.
      </p>
      <p className="text-sm text-ink-soft">
        You may cancel until the end of {formatDateOnly(lastCancellableDay)} and we will refund your deposit in full.
      </p>
      <PayDepositButton label={`Pay 50% deposit — ${formatCents(amountCents)}`} />
    </form>
  );
}

/**
 * What the client reads on the hop back from Stripe. `flag` is their own URL, so it only decides whether
 * to speak; whether the payment is received comes from the database (`paid`), never from the flag.
 */
export function DepositNotice({ flag, paid }: { flag: string | null; paid: boolean }) {
  if (flag === "done" || flag === "processing") {
    return (
      <p role="status" className="border border-champagne bg-sand/60 p-4 text-sm">
        {paid ? "Payment received — thank you." : "Processing — we will email your receipt as soon as your payment is confirmed."}
      </p>
    );
  }
  if (flag === "unavailable") {
    return (
      <p role="status" className="border border-champagne bg-sand/60 p-4 text-sm">
        Card payment is not available just now. Please call us on {business.phone.display} and we will take your deposit another way.
      </p>
    );
  }
  return null;
}
```

- [ ] **Step 6: Wire it into the project page**

`app/(site)/project/ProjectView.tsx`:
- imports: `import { cancellationWindowLastDay } from "@/lib/docs/business-days";`, `import { depositState } from "@/lib/payments/deposits";`, `import { DepositCard, DepositNotice } from "./DepositCard";`
- props: add `justDeposit,` to the destructuring and to the type:

```ts
  /** The `?deposit=` flag from the hop back from Stripe. Unvalidated — DepositNotice asks the database whether it is paid. */
  justDeposit?: string | null;
```

- add `depositState(job.id),` as the last entry of the `Promise.all` array and `deposit` as the last name in its destructuring.
- after `const quote = …`:

```ts
  // Spec §3: a Signed job owes its deposit until one is paid. The action re-checks every part of this.
  const depositDue = job.status === "signed" && deposit?.versionStatus === "signed" && deposit.jobStatus === "signed" && !deposit.paid ? deposit : null;
```

- the attention condition becomes `contracts.length > 0 || acknowledgeable.length > 0 || depositDue ? (`, and inside the section, after the acknowledge block:

```tsx
          {depositDue ? (
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">Deposit</h3>
              <DepositCard jobId={job.id} amountCents={depositDue.amountCents} lastCancellableDay={cancellationWindowLastDay(depositDue.signedAt)} />
            </div>
          ) : null}
```

- after `<DocumentAcknowledgedNotice … />`: `<DepositNotice flag={justDeposit ?? null} paid={Boolean(deposit?.paid)} />`
- the "Action required" condition becomes `{(quote && current.key === "quote") || depositDue ? (`.

`app/(site)/project/[jobId]/page.tsx` and `app/(site)/project/page.tsx`: add `deposit?: string` to the `searchParams` type and pass `justDeposit={query.deposit ?? null}` (in `page.tsx`, `params.deposit`).

`lib/portal/send-signature-email.ts` — add imports `import { formatCents } from "@/lib/admin/money";`, `import { formatDateOnly } from "@/lib/admin/time";` (already imports `formatShortDate, formatTime` — extend that import), `import { cancellationWindowLastDay } from "@/lib/docs/business-days";`, `import { depositState } from "@/lib/payments/deposits";`. In `sendCustomerSignedCopy`, after the `apiKey` check:

```ts
  // Spec §3: the client's signed-copy email adds the deposit link once their signed job owes one.
  // Looked up here, so signContractAction (pss-dd's) is untouched. A failed lookup only drops the line.
  const deposit = await depositState(job.id).catch(() => null);
  const due = deposit && deposit.jobStatus === "signed" && deposit.versionStatus === "signed" && !deposit.paid ? deposit : null;
```

and in the `text` array, after the attachment line and its `""`:

```ts
    due ? `Next: your 50% deposit of ${formatCents(due.amountCents)} confirms your order. Pay it on your project page: ${bareDomain}/project/${job.id}` : null,
    due ? `You may cancel until the end of ${formatDateOnly(cancellationWindowLastDay(due.signedAt))} and we will refund your deposit in full.` : null,
    due ? "" : null,
```

- [ ] **Step 7: Run the tests, typecheck, lint**

Run: `npx vitest run --maxWorkers=2 tests/portal` → PASS. `npx tsc --noEmit` → clean. `npx eslint app/(site)/project lib/portal tests/portal` → exit 0.

- [ ] **Step 8: Test power**

Change `{ idempotencyKey: \`deposit-${deposit.id}\` }` to `{ idempotencyKey: \`deposit-${Date.now()}-${Math.random()}\` }` → the concurrent-taps test fails. Make `DepositNotice` print "Payment received — thank you." whenever `flag === "done"` → "believes the payment only from the database" fails. Drop `job.status !== "signed" ||` from `startDepositAction` → "refuses a job that is not Signed" fails. Restore.

- [ ] **Step 9: Commit**

```bash
git add app/(site)/project lib/portal/send-signature-email.ts tests/portal
git commit -m "feat: the client pays the 50% deposit through Stripe Checkout after signing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0122UD6P8agX8gRaojNYtEiL"
```

---

### Task 6: The owner records a payment, or cancels and refunds

**Files:**
- Create: `app/admin/jobs/[id]/deposit-actions.ts`, `app/admin/jobs/[id]/DepositPanel.tsx`
- Modify: `app/admin/jobs/[id]/QuoteTab.tsx`
- Test: `tests/admin/deposit-actions.test.ts`, `tests/admin/deposit-panel.test.tsx`, `tests/dc/quote-review.test.tsx` (QuoteTab mocks)

**Interfaces:**
- Consumes: `depositState`, `recordDepositPayment`, `cancelDeposit`, `isRecordedMethod`, `type DepositState` (Task 3); `stripeClient`, `closeCheckout`, `refundPayment` (Task 3); `sendDepositReceipts`, `sendCancellationEmails` (Task 4); `getJob`, `requireAdmin`, `dollarsToCents`, `refresh`/`MISSING` (`app/admin/jobs/form-state.ts`), `inCancellationWindow`/`cancellationWindowLastDay`.
- Produces:
  - `recordDepositAction(jobId: string, amount: string, method: string): Promise<{ error?: string; ok?: boolean }>`
  - `cancelDepositAction(jobId: string, depositId: string): Promise<{ error?: string; ok?: boolean }>`
  - `type DepositView = { jobStatus: string; amountCents: number; soldCents: number; lastCancellableDay: string; inWindow: boolean; paid: { id: string; amountCents: number; method: DepositMethod; paidAt: Date } | null; refunded: { amountCents: number; refundedAt: Date } | null; cardPending: boolean }`
  - `DepositPanel({ jobId, view }: { jobId: string; view: DepositView })`; `toDepositView(state: DepositState, now: Date): DepositView` (exported from `QuoteTab.tsx`)
  - Owner copy: section "Deposit"; buttons "Payment received", "Record payment", "Keep waiting", "Cancel & refund", "Yes, cancel and refund", "Keep the order"; labels "Deposit received", "Paid by".

- [ ] **Step 1: Write the failing action tests**

`tests/admin/deposit-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn(async () => ({ email: "owner@example.com" }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const afterCbs: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { afterCbs.push(cb); } }));
const jobs = { getJob: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const deposits = { depositState: vi.fn(), recordDepositPayment: vi.fn(), cancelDeposit: vi.fn(), isRecordedMethod: (v: unknown) => ["check", "cash", "other"].includes(v as string) };
vi.mock("@/lib/payments/deposits", () => deposits);
const stripe = { stripeClient: vi.fn(() => ({}) as unknown), closeCheckout: vi.fn(), refundPayment: vi.fn() };
vi.mock("@/lib/payments/stripe", () => stripe);
const emails = { sendDepositReceipts: vi.fn(), sendCancellationEmails: vi.fn() };
vi.mock("@/lib/payments/emails", () => emails);

const { cancelDepositAction, recordDepositAction } = await import("@/app/admin/jobs/[id]/deposit-actions");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const VERSION = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const DEPOSIT = "5d1f6a2e-3b4c-4d5e-8f60-7a8b9c0d1e2f";
const job = { id: JOB, name: "Maria Lopez", status: "signed", email: "maria@example.com", projectNo: 1048 };
const paid = { id: DEPOSIT, leadId: JOB, versionId: VERSION, amountCents: 92417, method: "stripe", status: "paid",
  stripeSessionId: "cs_1", stripePaymentIntentId: "pi_1", recordedBy: null, createdAt: new Date(), paidAt: new Date(), refundedAt: null };
const state = { jobStatus: "signed", versionId: VERSION, version: 1, versionStatus: "signed", soldCents: 184833, amountCents: 92417,
  signedAt: new Date(), paid: null, pending: null, refunded: null };

beforeEach(() => {
  afterCbs.length = 0;
  requireAdmin.mockClear();
  jobs.getJob.mockReset().mockResolvedValue(job);
  deposits.depositState.mockReset().mockResolvedValue(state);
  deposits.recordDepositPayment.mockReset().mockResolvedValue({ depositId: "new" });
  deposits.cancelDeposit.mockReset().mockResolvedValue(true);
  stripe.stripeClient.mockClear();
  stripe.closeCheckout.mockReset().mockResolvedValue("closed");
  stripe.refundPayment.mockReset().mockResolvedValue(true);
  emails.sendDepositReceipts.mockReset().mockResolvedValue(undefined);
  emails.sendCancellationEmails.mockReset().mockResolvedValue(undefined);
});

describe("recordDepositAction", () => {
  it("records the typed amount and method for a Signed job, then sends the receipts", async () => {
    expect(await recordDepositAction(JOB, "$924.00", "check")).toEqual({ ok: true });
    expect(deposits.recordDepositPayment).toHaveBeenCalledWith({ leadId: JOB, versionId: VERSION, amountCents: 92400, method: "check", actor: "owner@example.com" });
    for (const cb of afterCbs.splice(0)) await cb();
    expect(emails.sendDepositReceipts).toHaveBeenCalledWith(JOB);
  });

  it("closes an open card checkout before recording", async () => {
    deposits.depositState.mockResolvedValue({ ...state, pending: { ...paid, status: "pending", stripeSessionId: "cs_open" } });
    await recordDepositAction(JOB, "924.17", "cash");
    expect(stripe.closeCheckout).toHaveBeenCalledWith(expect.anything(), "cs_open");
    expect(deposits.recordDepositPayment).toHaveBeenCalled();
  });

  it("refuses, recording nothing, while the client's card payment is in flight", async () => {
    deposits.depositState.mockResolvedValue({ ...state, pending: { ...paid, status: "pending", stripeSessionId: "cs_open" } });
    stripe.closeCheckout.mockResolvedValue("paid");
    expect(await recordDepositAction(JOB, "924.17", "cash")).toEqual({
      error: "The client is paying by card right now. Wait for that payment before recording another.",
    });
    stripe.closeCheckout.mockResolvedValue("unknown");
    expect(await recordDepositAction(JOB, "924.17", "cash")).toEqual({
      error: "Could not check the client's card payment with Stripe. Try again in a minute.",
    });
    expect(deposits.recordDepositPayment).not.toHaveBeenCalled();
  });

  it("refuses a bad method, a bad amount, more than the contract, a job not Signed, and a paid deposit", async () => {
    expect(await recordDepositAction(JOB, "924", "stripe")).toEqual({ error: "Choose check, cash or other." });
    expect(await recordDepositAction(JOB, "abc", "check")).toEqual({ error: "Enter an amount like 4500 or 4,500.00" });
    expect(await recordDepositAction(JOB, "", "check")).toEqual({ error: "Enter the amount received." });
    expect(await recordDepositAction(JOB, "1848.34", "check")).toEqual({ error: "That is more than the contract total of $1,848.33." });
    jobs.getJob.mockResolvedValue({ ...job, status: "sold" });
    expect(await recordDepositAction(JOB, "924", "check")).toEqual({ error: "A deposit is recorded once the contract is signed and before the job is Sold." });
    jobs.getJob.mockResolvedValue(job);
    deposits.depositState.mockResolvedValue({ ...state, paid });
    expect(await recordDepositAction(JOB, "924", "check")).toEqual({ error: "The deposit is already recorded." });
    expect(deposits.recordDepositPayment).not.toHaveBeenCalled();
  });

  it("says so when the statement recorded nothing (the job moved meanwhile)", async () => {
    deposits.recordDepositPayment.mockResolvedValue(null);
    expect(await recordDepositAction(JOB, "924", "check")).toEqual({ error: "The deposit could not be recorded. Reload the page and check the job's stage." });
  });
});

describe("cancelDepositAction", () => {
  beforeEach(() => { deposits.depositState.mockResolvedValue({ ...state, paid }); });

  it("refunds a card deposit through Stripe first, then records the cancellation and emails both sides", async () => {
    expect(await cancelDepositAction(JOB, DEPOSIT)).toEqual({ ok: true });
    expect(stripe.refundPayment).toHaveBeenCalledWith(expect.anything(), "pi_1", DEPOSIT);
    expect(deposits.cancelDeposit).toHaveBeenCalledWith({ leadId: JOB, deposit: paid, actor: "owner@example.com" });
    expect(stripe.refundPayment.mock.invocationCallOrder[0]).toBeLessThan(deposits.cancelDeposit.mock.invocationCallOrder[0]);
    for (const cb of afterCbs.splice(0)) await cb();
    expect(emails.sendCancellationEmails).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 92417, method: "stripe", actor: "owner@example.com" }));
  });

  it("changes nothing when Stripe does not refund", async () => {
    stripe.refundPayment.mockResolvedValue(false);
    expect(await cancelDepositAction(JOB, DEPOSIT)).toEqual({
      error: "Stripe did not refund the card, so nothing was changed. Try again, or refund it in the Stripe dashboard first.",
    });
    expect(deposits.cancelDeposit).not.toHaveBeenCalled();
  });

  it("marks a recorded deposit refunded without calling Stripe", async () => {
    deposits.depositState.mockResolvedValue({ ...state, paid: { ...paid, method: "check", stripePaymentIntentId: null } });
    expect(await cancelDepositAction(JOB, DEPOSIT)).toEqual({ ok: true });
    expect(stripe.refundPayment).not.toHaveBeenCalled();
  });

  it("refuses a job that is not Signed or Sold, and a deposit that is not the paid one", async () => {
    jobs.getJob.mockResolvedValue({ ...job, status: "ordered" });
    expect(await cancelDepositAction(JOB, DEPOSIT)).toEqual({ error: "Only a Signed or Sold job can be cancelled and refunded here." });
    jobs.getJob.mockResolvedValue(job);
    expect(await cancelDepositAction(JOB, "6e2f7b3f-4c5d-4e6f-9a71-8b9c0d1e2f3a")).toEqual({ error: "This deposit is no longer paid. Reload the page." });
    expect(stripe.refundPayment).not.toHaveBeenCalled();
    expect(deposits.cancelDeposit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing panel tests**

`tests/admin/deposit-panel.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordDepositAction = vi.fn();
const cancelDepositAction = vi.fn();
vi.mock("@/app/admin/jobs/[id]/deposit-actions", () => ({ recordDepositAction, cancelDepositAction }));
const { DepositPanel } = await import("@/app/admin/jobs/[id]/DepositPanel");

const J = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const view = {
  jobStatus: "signed", amountCents: 92417, soldCents: 184833, lastCancellableDay: "2026-10-01", inWindow: true,
  paid: null, refunded: null, cardPending: false,
};
const paid = { id: "d1", amountCents: 92417, method: "stripe" as const, paidAt: new Date("2026-09-29T17:00:00Z") };

beforeEach(() => {
  recordDepositAction.mockReset().mockResolvedValue({ ok: true });
  cancelDepositAction.mockReset().mockResolvedValue({ ok: true });
});

describe("DepositPanel", () => {
  it("shows the deposit due and records a payment with the amount prefilled", async () => {
    render(<DepositPanel jobId={J} view={view} />);
    expect(screen.getByText("50% deposit due: $924.17 of $1,848.33.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Payment received" }));
    expect(screen.getByLabelText("Deposit received")).toHaveValue("924.17");
    fireEvent.change(screen.getByLabelText("Paid by"), { target: { value: "cash" } });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Deposit recorded. The job is Sold.");
    expect(recordDepositAction).toHaveBeenCalledWith(J, "924.17", "cash");
  });

  it("shows the action's refusal", async () => {
    recordDepositAction.mockResolvedValueOnce({ error: "The client is paying by card right now. Wait for that payment before recording another." });
    render(<DepositPanel jobId={J} view={view} />);
    fireEvent.click(screen.getByRole("button", { name: "Payment received" }));
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The client is paying by card right now.");
  });

  it("confirms Cancel & refund, saying whether the 3-day window is open", async () => {
    render(<DepositPanel jobId={J} view={{ ...view, jobStatus: "sold", paid }} />);
    expect(screen.getByText("Deposit $924.17 paid by card on Sep 29, 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Payment received" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel & refund" }));
    expect(screen.getByText("The client is inside the 3-business-day cancellation window, which ends at the end of Oct 1, 2026.")).toBeInTheDocument();
    expect(screen.getByText(/refunds \$924\.17 to the client's card in full/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel and refund" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Cancelled and refunded. The job is Lost.");
    expect(cancelDepositAction).toHaveBeenCalledWith(J, "d1");
  });

  it("says when the window has closed, and words a recorded deposit as one to return", () => {
    render(<DepositPanel jobId={J} view={{ ...view, jobStatus: "sold", inWindow: false, paid: { ...paid, method: "check" } }} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel & refund" }));
    expect(screen.getByText("The 3-business-day cancellation window closed at the end of Oct 1, 2026.")).toBeInTheDocument();
    expect(screen.getByText(/return it to the client yourself/)).toBeInTheDocument();
  });

  it("offers nothing on a refunded, Lost job", () => {
    render(<DepositPanel jobId={J} view={{ ...view, jobStatus: "lost", refunded: { amountCents: 92417, refundedAt: new Date("2026-09-30T17:00:00Z") } }} />);
    expect(screen.getByText("Deposit $924.17 refunded Sep 30, 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
```

`tests/dc/quote-review.test.tsx` — the QuoteTab now reads the deposit too. Add next to the `loadReview` mock:

```ts
const depositState = vi.fn(async (_id: string) => null as unknown);
vi.mock("@/lib/payments/deposits", () => ({ depositState }));
vi.mock("@/app/admin/jobs/[id]/deposit-actions", () => ({ recordDepositAction: vi.fn(), cancelDepositAction: vi.fn() }));
```

and in `describe("QuoteTab", …)`:

```tsx
  it("shows the deposit panel once a contract is signed, and none before", async () => {
    loadReview.mockResolvedValueOnce(review()).mockResolvedValueOnce(review());
    render(await QuoteTab({ job: { ...job, status: "quoted" } }));
    expect(screen.queryByRole("region", { name: "Deposit" })).toBeNull();
    depositState.mockResolvedValueOnce({ jobStatus: "signed", versionId: V, version: 2, versionStatus: "signed", soldCents: 184834,
      amountCents: 92417, signedAt: new Date("2026-09-28T17:00:00Z"), paid: null, pending: null, refunded: null });
    render(await QuoteTab({ job: { ...job, status: "signed" } }));
    expect(screen.getByRole("region", { name: "Deposit" })).toHaveTextContent("50% deposit due: $924.17 of $1,848.34.");
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/deposit-actions.test.ts tests/admin/deposit-panel.test.tsx tests/dc/quote-review.test.tsx`
Expected: FAIL — modules missing; QuoteTab renders no Deposit region.

- [ ] **Step 4: Implement the actions**

`app/admin/jobs/[id]/deposit-actions.ts`:

```ts
"use server";

import { after } from "next/server";
import { getJob } from "@/lib/admin/jobs";
import { dollarsToCents, formatCents } from "@/lib/admin/money";
import { requireAdmin } from "@/lib/admin/session";
import { inCancellationWindow } from "@/lib/docs/business-days";
import { cancelDeposit, depositState, isRecordedMethod, recordDepositPayment } from "@/lib/payments/deposits";
import { sendCancellationEmails, sendDepositReceipts } from "@/lib/payments/emails";
import { closeCheckout, refundPayment, stripeClient } from "@/lib/payments/stripe";
import { MISSING, refresh } from "../form-state";

/**
 * "Payment received" (spec §4): the owner records a check, cash or other deposit on a Signed job.
 * An open card checkout is closed at Stripe first; if Stripe says the client already paid by card,
 * nothing is recorded (Review Focus 3).
 */
export async function recordDepositAction(jobId: string, amount: string, method: string): Promise<{ error?: string; ok?: boolean }> {
  const admin = await requireAdmin();
  if (!isRecordedMethod(method)) return { error: "Choose check, cash or other." };
  let amountCents: number | null;
  try {
    amountCents = dollarsToCents(typeof amount === "string" ? amount : "");
  } catch (error) {
    return { error: (error as Error).message };
  }
  if (amountCents === null || amountCents <= 0) return { error: "Enter the amount received." };
  const job = await getJob(jobId);
  if (!job) return MISSING;
  if (job.status !== "signed") return { error: "A deposit is recorded once the contract is signed and before the job is Sold." };
  const state = await depositState(job.id);
  if (!state || state.versionStatus !== "signed") return { error: "This job has no signed contract." };
  if (state.paid) return { error: "The deposit is already recorded." };
  if (amountCents > state.soldCents) return { error: `That is more than the contract total of ${formatCents(state.soldCents)}.` };
  if (state.pending?.stripeSessionId) {
    const closed = await closeCheckout(stripeClient(), state.pending.stripeSessionId);
    if (closed === "paid") return { error: "The client is paying by card right now. Wait for that payment before recording another." };
    if (closed === "unknown") return { error: "Could not check the client's card payment with Stripe. Try again in a minute." };
  }
  const recorded = await recordDepositPayment({ leadId: job.id, versionId: state.versionId, amountCents, method, actor: admin.email });
  if (!recorded) return { error: "The deposit could not be recorded. Reload the page and check the job's stage." };
  after(() => sendDepositReceipts(job.id));
  refresh(job.id);
  return { ok: true };
}

/**
 * "Cancel & refund" (spec §4) on a Signed or Sold job with a paid deposit. A card deposit is refunded
 * in full through Stripe first (one idempotency key per deposit); only then is the cancellation
 * recorded, in one statement. A recorded deposit is marked refunded and the owner returns the money.
 */
export async function cancelDepositAction(jobId: string, depositId: string): Promise<{ error?: string; ok?: boolean }> {
  const admin = await requireAdmin();
  const job = await getJob(jobId);
  if (!job) return MISSING;
  if (job.status !== "signed" && job.status !== "sold") return { error: "Only a Signed or Sold job can be cancelled and refunded here." };
  const state = await depositState(job.id);
  const deposit = state?.paid;
  if (!state || !deposit || deposit.id !== depositId) return { error: "This deposit is no longer paid. Reload the page." };
  if (deposit.method === "stripe") {
    const refunded = deposit.stripePaymentIntentId !== null
      && await refundPayment(stripeClient(), deposit.stripePaymentIntentId, deposit.id);
    if (!refunded) return { error: "Stripe did not refund the card, so nothing was changed. Try again, or refund it in the Stripe dashboard first." };
  }
  if (!(await cancelDeposit({ leadId: job.id, deposit, actor: admin.email }))) {
    return { error: "The cancellation could not be recorded. Reload the page." };
  }
  const inWindow = inCancellationWindow(state.signedAt, new Date());
  after(() => sendCancellationEmails({ job, amountCents: deposit.amountCents, method: deposit.method, inWindow, actor: admin.email }));
  refresh(job.id);
  return { ok: true };
}
```

- [ ] **Step 5: Implement the panel and wire it into the Quote tab**

`app/admin/jobs/[id]/DepositPanel.tsx`:

```tsx
"use client";

import { useState, useTransition, type FormEvent } from "react";
import { formatCents } from "@/lib/admin/money";
import { formatDateOnly, formatShortDate } from "@/lib/admin/time";
import type { DepositMethod } from "@/lib/payments/deposits";
import { cancelDepositAction, recordDepositAction } from "./deposit-actions";

export type DepositView = {
  jobStatus: string;
  amountCents: number;
  soldCents: number;
  /** The last day of the 3-business-day window, YYYY-MM-DD. */
  lastCancellableDay: string;
  inWindow: boolean;
  paid: { id: string; amountCents: number; method: DepositMethod; paidAt: Date } | null;
  refunded: { amountCents: number; refundedAt: Date } | null;
  cardPending: boolean;
};

const PAID_HOW: Record<DepositMethod, string> = { stripe: "by card", check: "by check", cash: "in cash", other: "by other means" };
const field = "min-h-11 border border-rule px-2";
const primary = "inline-flex min-h-11 items-center justify-center bg-charcoal px-5 text-sm text-ivory disabled:opacity-40";
const secondary = "inline-flex min-h-11 items-center justify-center border border-charcoal px-5 text-sm";

/** The Quote tab's deposit (spec §4): what is due or paid, Payment received, and Cancel & refund with its confirmation. */
export function DepositPanel({ jobId, view }: { jobId: string; view: DepositView }) {
  const [recording, setRecording] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: string } | { error: string } | null>(null);
  const [pending, start] = useTransition();
  const canRecord = !view.paid && view.jobStatus === "signed";
  const canCancel = view.paid !== null && (view.jobStatus === "signed" || view.jobStatus === "sold");
  const lastDay = formatDateOnly(view.lastCancellableDay);

  const record = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start(async () => {
      const result = await recordDepositAction(jobId, String(form.get("amount") ?? ""), String(form.get("method") ?? ""));
      if (result.error) setMessage({ error: result.error });
      else {
        setRecording(false);
        setMessage({ ok: "Deposit recorded. The job is Sold." });
      }
    });
  };

  const cancel = () => {
    if (!view.paid) return;
    const depositId = view.paid.id;
    start(async () => {
      const result = await cancelDepositAction(jobId, depositId);
      if (result.error) setMessage({ error: result.error });
      else {
        setConfirming(false);
        setMessage({ ok: "Cancelled and refunded. The job is Lost." });
      }
    });
  };

  return (
    <section aria-labelledby="deposit-heading" className="flex flex-col gap-3 border-t border-rule pt-5">
      <h2 id="deposit-heading" className="text-lg font-semibold">Deposit</h2>
      {view.refunded ? (
        <p className="text-sm">Deposit {formatCents(view.refunded.amountCents)} refunded {formatShortDate(view.refunded.refundedAt)}.</p>
      ) : null}
      {view.paid ? (
        <p className="text-sm">Deposit {formatCents(view.paid.amountCents)} paid {PAID_HOW[view.paid.method]} on {formatShortDate(view.paid.paidAt)}.</p>
      ) : canRecord ? (
        <p className="text-sm">
          50% deposit due: {formatCents(view.amountCents)} of {formatCents(view.soldCents)}.
          {view.cardPending ? " The client has opened card checkout." : ""}
        </p>
      ) : null}

      {canRecord ? (
        recording ? (
          <form onSubmit={record} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Deposit received
              <input name="amount" inputMode="decimal" defaultValue={(view.amountCents / 100).toFixed(2)} className={`${field} w-32`} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Paid by
              <select name="method" defaultValue="check" className={field}>
                <option value="check">Check</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </label>
            <button type="submit" disabled={pending} className={primary}>Record payment</button>
            <button type="button" onClick={() => setRecording(false)} className={secondary}>Keep waiting</button>
          </form>
        ) : (
          <div>
            <button type="button" onClick={() => { setRecording(true); setMessage(null); }} className={secondary}>Payment received</button>
          </div>
        )
      ) : null}

      {canCancel && view.paid ? (
        confirming ? (
          <div className="flex flex-col gap-2 border border-rule p-3 text-sm">
            <p>
              {view.inWindow
                ? `The client is inside the 3-business-day cancellation window, which ends at the end of ${lastDay}.`
                : `The 3-business-day cancellation window closed at the end of ${lastDay}.`}
            </p>
            <p>
              {view.paid.method === "stripe"
                ? `This refunds ${formatCents(view.paid.amountCents)} to the client's card in full, cancels the contract and marks the job Lost.`
                : `This marks the ${formatCents(view.paid.amountCents)} deposit refunded — return it to the client yourself — cancels the contract and marks the job Lost.`}
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={cancel} disabled={pending} className={primary}>Yes, cancel and refund</button>
              <button type="button" onClick={() => setConfirming(false)} className={secondary}>Keep the order</button>
            </div>
          </div>
        ) : (
          <div>
            <button type="button" onClick={() => { setConfirming(true); setMessage(null); }} className={secondary}>Cancel &amp; refund</button>
          </div>
        )
      ) : null}

      {message && "ok" in message ? <p role="status" className="text-sm">{message.ok}</p> : null}
      {message && "error" in message ? <p role="alert" className="text-sm text-red-700">{message.error}</p> : null}
    </section>
  );
}
```

`app/admin/jobs/[id]/QuoteTab.tsx` — replace with:

```tsx
import type { Job } from "@/lib/admin/jobs";
import { loadReview } from "@/lib/dc/send";
import { cancellationWindowLastDay, inCancellationWindow } from "@/lib/docs/business-days";
import { depositState, type DepositState } from "@/lib/payments/deposits";
import { formatProjectNo } from "@/lib/portal/project-no";
import { CheckNowButton, DcButtons } from "./DcButtons";
import { DepositPanel, type DepositView } from "./DepositPanel";
import { QuoteReview } from "./QuoteReview";

/** The panel's props from the stored deposit state, the window computed on the server at `now`. */
export function toDepositView(state: DepositState, now: Date): DepositView {
  return {
    jobStatus: state.jobStatus, amountCents: state.amountCents, soldCents: state.soldCents,
    lastCancellableDay: cancellationWindowLastDay(state.signedAt), inWindow: inCancellationWindow(state.signedAt, now),
    paid: state.paid && state.paid.paidAt
      ? { id: state.paid.id, amountCents: state.paid.amountCents, method: state.paid.method, paidAt: state.paid.paidAt }
      : null,
    refunded: state.refunded && state.refunded.refundedAt
      ? { amountCents: state.refunded.amountCents, refundedAt: state.refunded.refundedAt }
      : null,
    cardPending: state.pending !== null,
  };
}

export async function QuoteTab({ job }: { job: Pick<Job, "id" | "projectNo" | "status"> }) {
  const [review, deposit] = await Promise.all([loadReview(job.id), depositState(job.id)]);
  const projectNo = formatProjectNo(job.projectNo);
  const now = new Date();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <DcButtons projectNo={projectNo} dcQuoteNo={review?.version.dcQuoteNo ?? null} />
        <CheckNowButton jobId={job.id} />
      </div>
      {review ? (
        <QuoteReview jobId={job.id} review={review} now={now} />
      ) : (
        <p className="text-sm">
          No Direct Connect quote yet. Put {projectNo ?? "the job's PSS number"} in PO Reference and email the Dealer Copy with Owner and Include dealer costs ticked.
        </p>
      )}
      {deposit ? <DepositPanel jobId={job.id} view={toDepositView(deposit, now)} /> : null}
    </div>
  );
}
```

(`app/admin/jobs/[id]/page.tsx` already passes the whole `job`, so it satisfies the widened `Pick`.)

- [ ] **Step 6: Run the tests, typecheck, lint**

Run: `npx vitest run --maxWorkers=2 tests/admin tests/dc` → PASS. `npx tsc --noEmit` → clean. `npx eslint app/admin/jobs/[id] tests/admin tests/dc` → exit 0.

- [ ] **Step 7: Test power**

Delete the `if (closed === "paid") …` line → "refuses, recording nothing, while the client's card payment is in flight" fails. Move `cancelDeposit` above the Stripe refund → the call-order assertion fails. Make the panel show "Payment received" when `view.paid` is set → the refunded/paid tests fail. Restore.

- [ ] **Step 8: Commit**

```bash
git add app/admin/jobs/[id] tests/admin tests/dc/quote-review.test.tsx
git commit -m "feat: the owner records a deposit by hand, or cancels and refunds it, from the Quote tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0122UD6P8agX8gRaojNYtEiL"
```

---

### Task 7: Signing moves the job to Signed

Built on the merged 029 code: `recordSignature` stores the adoption images first, then runs ONE statement (`signed`, `version`, `prev`, `sold`, `stage_logged`, `document`, `logged`). Only the stage target of the `sold` step and its event change. Do not touch `signContractAction`, `SignContract.tsx`, the adoption columns or the image cleanup.

**Files:**
- Modify: `lib/portal/sign.ts:205-219` (the `sold` and `stage_logged` CTEs only)
- Modify: `scripts/verify-contract-signing.ts:26-31,50,332-336`, `scripts/verify-dc-quote-import.ts:39,493-498`
- Test: `tests/portal/sign.test.ts` (the "moves the job to Sold" test)

**Interfaces:**
- Consumes: stages `approved`, `signed` (Task 1).
- Produces: signing a sent DC contract moves a job at new / visit_booked / quoted / approved to **signed** (event "Signed contract version N", to_status `signed`); `sold_cents` is still set to the version's `client_total_cents`; a job already past Approved keeps its stage. Task 5's deposit card and the signed-copy deposit line now appear after a real signature.

- [ ] **Step 0: Bring in main**

```bash
git fetch origin && git merge --no-edit origin/main
npx vitest run --maxWorkers=2
```

Expected: the merge is clean or already up to date, and the suite passes (quote the summary). If a merge conflict touches `lib/portal/sign.ts`, `lib/dc/send.ts` or `app/(site)/project/actions.ts`, stop and report it.

- [ ] **Step 1: Update the failing test**

In `tests/portal/sign.test.ts`, replace the test "in the SAME statement, marks a generated contract's version signed and moves the job to Sold" with:

```ts
  it("in the SAME statement, marks a generated contract's version signed and moves the job to Signed", async () => {
    vi.mocked(readFile).mockResolvedValue({ stream: new Response("pdf bytes").body!, contentType: "application/pdf" });
    query.mockResolvedValue([{ id: "s1", lead_id: JOB, file_id: FILE, signed_name: "A", signed_email: "a@x", signed_at: new Date(), doc_sha256: "x", signed_file_id: null }]);
    await recordSignature({ jobId: JOB, file: doc(FILE, "Contract PSS-1042 v1.pdf", "contract"), name: "A", email: "a@x", ip: null, userAgent: null, adoption: TYPED });
    expect(query).toHaveBeenCalledTimes(1);
    const s = (query.mock.calls[0][0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
    expect(s).toContain("update dc_quote_versions set status = 'signed'");
    expect(s).toContain("contract_file_id = (select file_id from signed)");
    expect(s).toContain("sold_cents = (select client_total_cents from version)");
    // Spec §3: Signed, not Sold — the sale is the paid deposit. Approved is a stage before Signed.
    expect(s).toContain("status = case when status in ('new','visit_booked','quoted','approved') then 'signed' else status end");
    expect(s).toContain("'stage', prev.status, 'signed', 'Signed contract version ' || version.version");
    expect(s).toContain("where prev.status in ('new','visit_booked','quoted','approved')");
    expect(s).not.toContain("then 'sold'");
    // The stage event is attributed to the signer, bound once more before the timeline body.
    expect(query.mock.calls[0].slice(1).slice(-3)).toEqual([
      "a@x", "a@x", 'Signed "Contract PSS-1042 v1.pdf" from their project page',
    ]);
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 tests/portal/sign.test.ts`
Expected: FAIL — the statement still says `then 'sold'`.

- [ ] **Step 3: Implement**

In `lib/portal/sign.ts`, replace lines 205–219 (the comment, `sold` and `stage_logged`) with:

```ts
      -- ('new','visit_booked','quoted','approved') mirrors the stages before Signed in lib/admin/stages.ts.
      -- Spec §3: signing moves the job to Signed. Sold waits for the paid deposit (lib/payments/deposits.ts).
      sold as (
        update leads set sold_cents = (select client_total_cents from version),
          status = case when status in ('new','visit_booked','quoted','approved') then 'signed' else status end,
          stage_changed_at = case when status in ('new','visit_booked','quoted','approved') then now() else stage_changed_at end,
          updated_at = now()
        where id = (select lead_id from version)
        returning id
      ),
      stage_logged as (
        insert into job_events (lead_id, actor, kind, from_status, to_status, body)
        select sold.id, ${input.email}, 'stage', prev.status, 'signed', 'Signed contract version ' || version.version
        from sold, prev, version
        where prev.status in ('new','visit_booked','quoted','approved')
      ),
```

(The comment lines sit inside the SQL template, like the existing one. Nothing else in the statement changes; it stays one `db()` call.)

- [ ] **Step 4: Bring the two hand-run verify scripts to the new stage**

`scripts/verify-contract-signing.ts`:
- doc lines 26–31: "moves C to 'sold'" → "moves C to 'signed'", "quoted -> sold 'stage' event" → "quoted -> signed 'stage' event", and in line 50 "(the lead stays quoted)" stays.
- lines 332–336:

```ts
    check(lC.status === "signed" && lC.sold_cents === 123456, "lead C is signed with sold_cents 123456",
      `row ${JSON.stringify(lC)}`);
    const stC = await stageEvents(leadC);
    check(stC.length === 1 && stC[0].from_status === "quoted" && stC[0].to_status === "signed",
      "exactly one stage event, quoted -> signed", `got ${JSON.stringify(stC)}`);
```

(Step 10's lead D, already `ordered`, still keeps its status and logs no stage event — unchanged.)

`scripts/verify-dc-quote-import.ts`:
- doc line 39: "sign: recordSignature on the contract signs v2, moves A to signed with sold_cents = the total;"
- lines 493–498:

```ts
    const aSold = await leadRow(A.id);
    check(aSold.status === "signed" && aSold.sold_cents === expected.clientTotalCents,
      `A is signed with sold_cents = ${expected.clientTotalCents}`, `row ${JSON.stringify(aSold)}`);
    const soldStages = await stageEvents(A.id);
    check(soldStages.length === 2 && soldStages[1].from_status === "quoted" && soldStages[1].to_status === "signed",
      "one more stage event, quoted -> signed", `got ${JSON.stringify(soldStages)}`);
```

`e2e/dc-quote.spec.ts` still expects Sold after signing; Task 10 rewrites that flow end to end. Do not run it before then.

- [ ] **Step 5: Run the tests, typecheck, lint**

Run: `npx vitest run --maxWorkers=2 tests/portal tests/dc` → PASS. `npx tsc --noEmit` → clean. `npx eslint lib/portal/sign.ts scripts/verify-contract-signing.ts scripts/verify-dc-quote-import.ts tests/portal/sign.test.ts` → exit 0.

- [ ] **Step 6: Test power**

Change the `sold` CTE's target back to `'sold'` → the new test fails on `then 'signed'`. Drop `'approved'` from the `stage_logged` where-list only → the test fails on the `where prev.status in (…)` assertion. Restore.

- [ ] **Step 7: Commit**

```bash
git add lib/portal/sign.ts scripts/verify-contract-signing.ts scripts/verify-dc-quote-import.ts tests/portal/sign.test.ts
git commit -m "feat: signing a contract moves the job to Signed; Sold waits for the deposit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0122UD6P8agX8gRaojNYtEiL"
```

---

### Task 8: Send quote, approve, and the contract from the approved quote (DC library and Quote tab)

Built on the merged 029 code in `lib/dc/send.ts` and `lib/dc/contract-pdf.ts` (`renderContractPdf` → `{ bytes, marks }`; `createFile({ …, signMarks: rendered.marks })`). The contract path keeps both exactly.

**Files:**
- Modify: `lib/dc/contract-pdf.ts` (extract `drawPricedPages`; `renderContractPdf` output unchanged)
- Create: `lib/dc/quote-pdf.ts`, `lib/dc/send-quote-email.ts`, `lib/dc/approve.ts`
- Replace: `lib/dc/send.ts`
- Modify: `lib/dc/store.ts:8-17,116-127`, `app/admin/jobs/[id]/quote-actions.ts`, `app/admin/jobs/[id]/QuoteReview.tsx`, `scripts/verify-dc-quote-import.ts`
- Test: `tests/dc/quote-pdf.test.ts`, `tests/dc/send-quote-email.test.ts`, `tests/dc/approve.test.ts` (create); `tests/dc/send.test.ts` (replace); `tests/dc/quote-actions.test.ts`, `tests/dc/quote-review.test.tsx`, `tests/dc/store.test.ts` (modify)

**Interfaces:**
- Consumes: migration 030 columns (Task 1); `renderContractPdf`, `ContractTerms` (029); `createFile`/`deleteFile` (`lib/admin/files.ts`); `sendContractEmail` (`lib/dc/send-contract-email.ts`); `issueCustomerLink`, `INVITE_MINUTES` (`lib/portal/login.ts`).
- Produces:
  - `StoredVersion.status: "draft" | "offered" | "sent" | "signed" | "superseded" | "cancelled"`; new fields `quoteFileId: string | null; offeredAt: Date | null; approvedAt: Date | null`
  - `drawPricedPages(doc: PDFDocument, regular: PDFFont, bold: PDFFont, input: ContractInput, heading: string, closing: string): void`
  - `buildQuotePdf(input: ContractInput): Promise<Uint8Array>`
  - `sendQuoteEmail(job: Job, fileName: string): Promise<void>` (throws on failure)
  - `sendQuote(input: { jobId: string; versionId: string; fingerprint: string; actor: string }): Promise<{ ok: true; emailed: boolean } | { error: string }>`
  - `sendContract(input: { jobId: string; versionId: string; actor: string }): Promise<{ ok: true; emailed: boolean } | { error: string }>` (no fingerprint: the price was frozen at Send quote)
  - `APPROVAL_ACTOR = "Sent on approval"`; `type OfferedVersion = { id: string; version: number; quoteFileId: string | null; approvedAt: Date | null }`; `offeredVersion(leadId: string): Promise<OfferedVersion | null>`; `approveDcQuote(leadId: string, versionId: string, actor: string): Promise<{ version: number } | null>`
  - `sendQuoteAction(jobId: string, versionId: string, fingerprint: string)` and `sendContractAction(jobId: string, versionId: string)`, both `Promise<{ error?: string; ok?: boolean; emailed?: boolean }>`
  - Quote tab: button "Send quote" (was "Send contract"); status badge "Quote sent" / "Contract sent" / "Cancelled"; for an approved `offered` version, the recovery button "Send contract".

- [ ] **Step 0: Bring in main**

```bash
git fetch origin && git merge --no-edit origin/main
npx vitest run --maxWorkers=2
```

Expected: clean (or already up to date) and PASS. Stop and report if `lib/dc/send.ts` or `lib/dc/contract-pdf.ts` conflict.

- [ ] **Step 1: Write the failing PDF, email and approval tests**

`tests/dc/quote-pdf.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import type { ContractInput } from "@/lib/dc/contract-layout";
import { renderContractPdf } from "@/lib/dc/contract-pdf";
import { buildQuotePdf } from "@/lib/dc/quote-pdf";

const input: ContractInput = {
  projectNo: "PSS-1042", version: 1, date: new Date("2026-09-28T12:00:00Z"),
  client: { name: "Test Testt", address: "1 Main St", city: "Las Vegas", email: "t@example.com" },
  lines: [
    { room: "Primary Bedroom", description: "Hunter Douglas Silhouette PowerView Gen 3 Automation Bottom-Up",
      options: [["Control System", "PowerView"], ["Order Width", "48 1/2"], ["Order Height", "72 3/8"], ["Mount Type", "Inside Mount"]],
      qty: 1, sellUnitCents: 128150, sellExtendedCents: 128150 },
    { room: "", description: "Hunter Douglas PowerView Gateway", options: [["Collection", "Motorization"]], qty: 1, sellUnitCents: 20501, sellExtendedCents: 20501 },
  ],
  installCents: 25000, handlingChargedCents: 6600, oversizedCents: 0, clientTotalCents: 128150 + 20501 + 25000 + 6600,
};

/** Every string drawn, with where, captured before pdf-lib encodes it. */
function spyOnDrawText() {
  const drawn: { text: string; x: number; y: number }[] = [];
  const original = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    drawn.push({ text, x: options?.x ?? 0, y: options?.y ?? 0 });
    return original.call(this, text, options);
  });
  return drawn;
}

afterEach(() => vi.restoreAllMocks());

describe("buildQuotePdf", () => {
  it("prints the priced lines and totals under the title Quote, with no terms, initials or signature block", async () => {
    const drawn = spyOnDrawText();
    const bytes = await buildQuotePdf(input);
    const texts = drawn.map((d) => d.text);
    expect(texts).toContain("Quote PSS-1042 · Version 1");
    for (const figure of ["$1,281.50", "$205.01", "Installation", "$250", "Hunter Douglas handling", "$66", "Total", "$1,802.51"]) {
      expect(texts).toContain(figure);
    }
    for (const absent of ["Terms and Conditions", "Client signature", "Initials", "Signature"]) expect(texts).not.toContain(absent);
    expect(texts.some((t) => t.startsWith("Contract "))).toBe(false);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("draws every line and total exactly where page 1 of the contract does", async () => {
    const quote = spyOnDrawText();
    await buildQuotePdf(input);
    vi.restoreAllMocks();
    const contract = spyOnDrawText();
    await renderContractPdf(input, { text: "## Terms\n\n1. Something." });
    const page1 = contract.slice(0, quote.length);
    expect(page1.map(({ x, y }) => [x, y])).toEqual(quote.map(({ x, y }) => [x, y]));
    const differing = page1.flatMap((d, i) => (d.text === quote[i].text ? [] : [[d.text, quote[i].text]]));
    expect(differing).toEqual([
      ["Contract PSS-1042 · Version 1", "Quote PSS-1042 · Version 1"],
      ["The terms and conditions on the following pages are part of this contract.",
        "Approve this quote on your project page and we will send your contract to sign."],
    ]);
  });
});
```

`tests/dc/send-quote-email.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { business } from "@/content/business";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
const login = { issueCustomerLink: vi.fn(), INVITE_MINUTES: 7 * 24 * 60 };
vi.mock("@/lib/portal/login", () => login);
const { sendQuoteEmail } = await import("@/lib/dc/send-quote-email");

const LINK = "https://pss.test/project/auth?token=abc";
const job = { id: "11111111-1111-4111-8111-111111111111", name: "  Test Testt", email: "  T@Example.COM " } as never;

beforeEach(() => {
  send.mockReset().mockResolvedValue({ error: null });
  login.issueCustomerLink.mockReset().mockResolvedValue(LINK);
  vi.stubEnv("RESEND_API_KEY", "test-key");
});

describe("sendQuoteEmail", () => {
  it("sends the sign-in link and the quote's name, with no price in it", async () => {
    await sendQuoteEmail(job, "Quote PSS-1042 v1.pdf");
    expect(login.issueCustomerLink).toHaveBeenCalledWith("t@example.com", login.INVITE_MINUTES);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("t@example.com");
    expect(message.subject).toBe(`Your ${business.name} quote is ready`);
    expect(message.replyTo).toBe(business.email);
    expect(message.text).toMatch(/^Hi Test,/);
    expect(message.text).toContain("Quote PSS-1042 v1.pdf");
    expect(message.text).toContain("approve it on your project page");
    expect(message.text).toContain(LINK);
    expect(message.text).not.toContain("$");
  });
  it("throws without a key, without an email, and when Resend rejects it", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendQuoteEmail(job, "q.pdf")).rejects.toThrow("RESEND_API_KEY is not set");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    await expect(sendQuoteEmail({ ...(job as object), email: " " } as never, "q.pdf")).rejects.toThrow("This job has no email address");
    send.mockResolvedValue({ error: { message: "domain not verified" } });
    await expect(sendQuoteEmail(job, "q.pdf")).rejects.toThrow("Resend rejected the quote email: domain not verified");
  });
});
```

`tests/dc/approve.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { APPROVAL_ACTOR, approveDcQuote, offeredVersion } = await import("@/lib/dc/approve");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const V = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

beforeEach(() => { sql.mockReset().mockResolvedValue([]); });

describe("offeredVersion", () => {
  it("reads the job's one offered version", async () => {
    sql.mockResolvedValueOnce([{ id: V, version: 2, quote_file_id: "f1", approved_at: "2026-09-29T17:00:00Z" }]);
    expect(await offeredVersion(JOB)).toEqual({ id: V, version: 2, quoteFileId: "f1", approvedAt: new Date("2026-09-29T17:00:00Z") });
    expect(text(sql.mock.calls[0])).toContain("where lead_id = ? and status = 'offered'");
  });
  it("is null when none is offered, and never queries a malformed id", async () => {
    expect(await offeredVersion(JOB)).toBeNull();
    sql.mockClear();
    expect(await offeredVersion("x")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});

describe("approveDcQuote", () => {
  it("in ONE statement stamps the approval once, only on a shared offered quote of a job that is not Lost, and moves Quoted to Approved", async () => {
    sql.mockResolvedValueOnce([{ version: 2 }]);
    expect(await approveDcQuote(JOB, V, "maria@example.com")).toEqual({ version: 2 });
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "update dc_quote_versions set approved_at = now(), approved_by = ?",
      "where id = ? and lead_id = ? and status = 'offered' and approved_at is null",
      "exists (select 1 from leads where id = ? and status <> 'lost')",
      "exists (select 1 from job_files f where f.id = dc_quote_versions.quote_file_id and f.shared_at is not null)",
      "update leads set status = 'approved'", "where id = ? and status = 'quoted' and exists (select 1 from approved)",
      "'stage', prev.status, 'approved', 'Approved quote version ' || approved.version",
      "'quote', 'Approved quote version ' || version || ' from their project page' from approved where not exists (select 1 from moved)",
    ]) expect(s).toContain(part);
  });
  it("answers null for a second approval, which changes nothing", async () => {
    expect(await approveDcQuote(JOB, V, "maria@example.com")).toBeNull();
  });
  it("names the automatic contract send", () => expect(APPROVAL_ACTOR).toBe("Sent on approval"));
});
```

- [ ] **Step 2: Replace `tests/dc/send.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { formatCents } from "@/lib/admin/money";
import { parseDealerCopy } from "@/lib/dc/parse";
import { pricingFingerprint, priceVersion } from "@/lib/dc/pricing";
import type { StoredVersion } from "@/lib/dc/store";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = { listVersions: vi.fn(), listMarkupRules: vi.fn(), getDcSettings: vi.fn() };
vi.mock("@/lib/dc/store", () => store);
const installs = { listInstallQuotes: vi.fn() };
vi.mock("@/lib/admin/install-quotes", () => installs);
const jobs = { getJob: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
const files = { createFile: vi.fn(), deleteFile: vi.fn() };
vi.mock("@/lib/admin/files", () => files);
const blob = { get: vi.fn() };
vi.mock("@vercel/blob", () => blob);
const pdf = { renderContractPdf: vi.fn() };
vi.mock("@/lib/dc/contract-pdf", () => pdf);
const quotePdf = { buildQuotePdf: vi.fn() };
vi.mock("@/lib/dc/quote-pdf", () => quotePdf);
const email = { sendContractEmail: vi.fn() };
vi.mock("@/lib/dc/send-contract-email", () => email);
const quoteEmail = { sendQuoteEmail: vi.fn() };
vi.mock("@/lib/dc/send-quote-email", () => quoteEmail);
const templates = { liveTemplateOfKind: vi.fn() };
vi.mock("@/lib/docs/templates", () => templates);
const { loadReview, sendContract, sendQuote } = await import("@/lib/dc/send");

const { createFile, deleteFile } = files;
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

const JOB = "11111111-1111-4111-8111-111111111111";
const V1 = "33333333-3333-4333-8333-333333333333";
const V0 = "44444444-4444-4444-8444-444444444444";
const FILE = "55555555-5555-4555-8555-555555555555";
const INSTALL = "66666666-6666-4666-8666-666666666666";
const QUOTE_FILE = "99999999-9999-4999-8999-999999999999";
const OWNER = "owner@example.com";
const MARKS = { initials: [{ page: 1, x: 502, y: 700, section: "4" }], signature: { page: 2, x: 154, y: 300 } };
const parsed = parseDealerCopy(readFileSync("tests/fixtures/dc/dealer-copy-1-line.html", "utf8"));
if (!parsed.ok) throw new Error("fixture must parse");
const quote = parsed.quote;

const version: StoredVersion = {
  id: V1, leadId: JOB, version: 1, dcQuoteNo: quote.quoteNo, poReference: quote.poReference,
  sourceFileId: "77777777-7777-4777-8777-777777777777", sourceSha256: "abc", clientName: "Test", status: "draft",
  subtotalCents: quote.subtotalCents, handlingFeeCents: quote.handlingFeeCents, oversizedFeeCents: quote.oversizedFeeCents,
  dealerTotalCents: quote.dealerTotalCents, waiveHandling: false, noInstall: false,
  installQuoteId: null, installCents: null, productsCents: null, clientTotalCents: null,
  contractFileId: null, sentAt: null, signedAt: null, createdAt: new Date("2026-09-27T19:30:00Z"),
  quoteFileId: null, offeredAt: null, approvedAt: null,
  lines: quote.lines.map((l) => ({ ...l, pctOverride: null, markupPct: null, sellUnitCents: null, markupOverridden: false })),
};
const line = version.lines[0];
const productsCents = 39300 * line.qty;
const frozenTotal = productsCents + version.handlingFeeCents + version.oversizedFeeCents + 25000;
/** The quote as Send quote froze it, approved by the client: what sendContract builds from. */
const offered: StoredVersion = {
  ...version, status: "offered", installQuoteId: INSTALL, installCents: 25000, productsCents, clientTotalCents: frozenTotal,
  quoteFileId: QUOTE_FILE, offeredAt: new Date("2026-09-27T20:00:00Z"), approvedAt: new Date("2026-09-28T15:00:00Z"),
  lines: [{ ...line, markupPct: 60, sellUnitCents: 39300, markupOverridden: false }],
};
const job = { id: JOB, name: "Test Testt", email: "t@example.com", status: "visit_booked", projectNo: 1042, address: "1 Main St", city: "Las Vegas" };
const termsBytes = new Uint8Array([37, 80, 68, 70]);
const install = { id: INSTALL, kind: "final", totalCents: 25000, createdAt: new Date("2026-09-26T12:00:00Z") };
const TERMS = { id: "t", name: "Contract terms", kind: "terms", response: "view", archivedAt: null,
  body: "## Terms\n\n{{company_name}} and {{client_name}}, {{project_no}}." };

beforeEach(() => {
  for (const f of [sql, ...Object.values(store), ...Object.values(installs), ...Object.values(jobs), ...Object.values(files),
    ...Object.values(blob), ...Object.values(pdf), ...Object.values(quotePdf), ...Object.values(email),
    ...Object.values(quoteEmail), ...Object.values(templates)]) f.mockReset();
  templates.liveTemplateOfKind.mockResolvedValue(null);
  jobs.getJob.mockResolvedValue(job);
  store.listVersions.mockResolvedValue([version]);
  store.listMarkupRules.mockResolvedValue({ Duette: 60 });
  store.getDcSettings.mockResolvedValue({ termsPathname: "settings/terms.pdf", termsUpdatedAt: null, lastPolledAt: null });
  installs.listInstallQuotes.mockResolvedValue([install]);
  blob.get.mockImplementation(async () => ({ statusCode: 200, stream: new Response(termsBytes).body }));
  pdf.renderContractPdf.mockResolvedValue({ bytes: new Uint8Array([1]), marks: MARKS });
  quotePdf.buildQuotePdf.mockResolvedValue(new Uint8Array([2]));
  files.createFile.mockResolvedValue({ id: FILE });
  files.deleteFile.mockResolvedValue(true);
  sql.mockResolvedValue([{ id: V1 }]);
  email.sendContractEmail.mockResolvedValue(undefined);
  quoteEmail.sendQuoteEmail.mockResolvedValue(undefined);
});

const send = async (over: Partial<Parameters<typeof sendQuote>[0]> = {}) => {
  const review = await loadReview(JOB);
  return sendQuote({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER, ...over });
};

describe("loadReview", () => {
  it("prices the newest draft with the Settings markup and the newest final install price", async () => {
    store.listVersions.mockResolvedValue([version, { ...version, id: V0, version: 0, status: "superseded" }]);
    const review = await loadReview(JOB);
    expect(review!.version.id).toBe(V1);
    expect(review!.olderVersions.map((v) => v.id)).toEqual([V0]);
    expect(review!.install).toEqual(install);
    expect(review!.blockers).toEqual([]);
    expect(review!.priced.lines[0]).toMatchObject({ pct: 60, source: "rule", sellUnitCents: 39300 });
    expect(review!.priced.installCents).toBe(25000);
    expect(review!.fingerprint).toBe(pricingFingerprint(review!.priced));
  });

  describe("an offered or later version shows what was sent, not today's price", () => {
    const newer = { id: "88888888-8888-4888-8888-888888888888", kind: "final", totalCents: 31000, createdAt: new Date("2026-09-28T12:00:00Z") };
    beforeEach(() => {
      // Both changed after sending: the rule went from 60 to 70 and a newer install price was saved.
      store.listMarkupRules.mockResolvedValue({ Duette: 70 });
      installs.listInstallQuotes.mockResolvedValue([newer, install]);
    });

    it.each(["offered", "sent", "signed", "cancelled"] as const)("prices a %s version from the frozen columns", async (status) => {
      store.listVersions.mockResolvedValue([{ ...offered, status }]);
      const review = await loadReview(JOB);
      expect(review!.priced).toEqual({
        lines: [{ position: line.position, pct: 60, source: "rule", sellUnitCents: 39300, sellExtendedCents: productsCents, marginCents: productsCents - line.costExtendedCents }],
        productsCents, handlingChargedCents: version.handlingFeeCents, oversizedCents: version.oversizedFeeCents,
        installCents: 25000, installQuoteId: INSTALL, clientTotalCents: frozenTotal, costCents: version.dealerTotalCents,
        marginCents: frozenTotal - 25000 - version.dealerTotalCents, waiveHandling: false, blockers: [],
      });
      expect(review!.install).toEqual(install);
    });

    it("keeps a waived fee, an override and no installation as they were sent", async () => {
      const total = 41000 * line.qty + version.oversizedFeeCents;
      store.listVersions.mockResolvedValue([{ ...offered, status: "signed", waiveHandling: true, noInstall: true, installQuoteId: null, installCents: 0,
        productsCents: 41000 * line.qty, clientTotalCents: total,
        lines: [{ ...offered.lines[0], pctOverride: 62.6, markupPct: 62.6, sellUnitCents: 41000, markupOverridden: true }] }]);
      const review = await loadReview(JOB);
      expect(review!.priced).toMatchObject({ handlingChargedCents: 0, installCents: 0, installQuoteId: null, clientTotalCents: total, waiveHandling: true });
      expect(review!.priced.lines[0]).toMatchObject({ pct: 62.6, source: "override", sellUnitCents: 41000 });
      expect(review!.install).toBeNull();
    });

    it("refuses to send an offered quote again: the status blocker remains", async () => {
      store.listVersions.mockResolvedValue([offered]);
      const review = await loadReview(JOB);
      expect(review!.blockers).toEqual(["This version has already been sent."]);
      expect(await send({ fingerprint: review!.fingerprint })).toEqual({ error: "This version has already been sent." });
      expect(createFile).not.toHaveBeenCalled();
      expect(sql).not.toHaveBeenCalled();
    });
  });

  it("answers null for a job with no Direct Connect quote", async () => {
    store.listVersions.mockResolvedValue([]);
    expect(await loadReview(JOB)).toBeNull();
  });
});

describe("sendQuote", () => {
  it("refuses when the screen's fingerprint differs from the server's (Settings changed meanwhile)", async () => {
    const onScreen = pricingFingerprint(priceVersion({
      lines: version.lines, rules: { Duette: 55 }, handlingFeeCents: version.handlingFeeCents,
      oversizedFeeCents: version.oversizedFeeCents, dealerTotalCents: version.dealerTotalCents,
      waiveHandling: false, install: install as never, noInstall: false,
    }));
    expect(await send({ fingerprint: onScreen })).toEqual({ error: "Prices changed since you opened this page. Review them and send again." });
    expect(createFile).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  it("refuses with the first blocker and writes nothing", async () => {
    store.listMarkupRules.mockResolvedValue({});
    expect(await send()).toEqual({ error: "Set a markup for Duette first." });
    expect(createFile).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  it("refuses a version that is no longer the newest", async () => {
    expect(await send({ versionId: V0 })).toEqual({ error: "A newer version of this quote has arrived. Review that one." });
    expect(createFile).not.toHaveBeenCalled();
  });

  it("refuses, writing nothing, when the uploaded terms cannot be read — the contract could not be built on approval", async () => {
    blob.get.mockResolvedValue(null);
    expect(await send()).toEqual({ error: "Your contract terms file could not be read. Add your contract terms on the Documents page." });
    expect(quotePdf.buildQuotePdf).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  it("freezes the price, shares a quote PDF and logs it in ONE statement, then emails the client; no contract yet", async () => {
    expect(await send()).toEqual({ ok: true, emailed: true });
    expect(createFile).toHaveBeenCalledWith(expect.objectContaining({
      docType: "quote", name: "Quote PSS-1042 v1.pdf", contentType: "application/pdf", actor: OWNER,
    }));
    expect(new Uint8Array(await (createFile.mock.calls[0][0] as { body: Blob }).body.arrayBuffer())).toEqual(new Uint8Array([2]));
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "update dc_quote_versions set status = 'offered'", "quote_file_id = ?, offered_at = now(), offered_by = ?",
      "and status = 'draft'", "select max(version)", "update dc_quote_lines",
      "update dc_quote_versions set status = 'superseded'", "status in ('draft','offered','sent')",
      "returning contract_file_id, quote_file_id",
      "(id in (select contract_file_id from superseded) or id in (select quote_file_id from superseded))",
      "update job_files set shared_at = now()", "quote_cents = ?",
      "when status in ('new','visit_booked','approved') then 'quoted'", "'Quote sent'", "'quote'",
    ]) expect(s).toContain(part);
    expect(quoteEmail.sendQuoteEmail).toHaveBeenCalledWith(job, "Quote PSS-1042 v1.pdf");
    expect(pdf.renderContractPdf).not.toHaveBeenCalled();
    expect(email.sendContractEmail).not.toHaveBeenCalled();
    expect(blob.get).toHaveBeenCalledWith("settings/terms.pdf", { access: "private" });
  });

  it("the saved figures, the quote PDF and the review screen are one and the same", async () => {
    const review = await loadReview(JOB);
    await sendQuote({ jobId: JOB, versionId: V1, fingerprint: review!.fingerprint, actor: OWNER });
    const { priced } = review!;
    const [printed] = quotePdf.buildQuotePdf.mock.calls[0];
    expect(printed).toMatchObject({
      projectNo: "PSS-1042", version: 1,
      client: { name: "Test Testt", address: "1 Main St", city: "Las Vegas", email: "t@example.com" },
      installCents: priced.installCents, handlingChargedCents: priced.handlingChargedCents,
      oversizedCents: priced.oversizedCents, clientTotalCents: priced.clientTotalCents,
    });
    expect(printed.lines).toEqual([expect.objectContaining({ qty: 1, sellUnitCents: priced.lines[0].sellUnitCents, sellExtendedCents: priced.lines[0].sellExtendedCents })]);
    const values = sql.mock.calls[0].slice(1);
    const lineJson = values.find((v: unknown) => typeof v === "string" && v.startsWith("[{"));
    expect(JSON.parse(lineJson as string)).toEqual([{ position: 1, override: null, pct: 60, sell_unit_cents: priced.lines[0].sellUnitCents, overridden: false }]);
    for (const figure of [priced.installQuoteId, priced.installCents, priced.productsCents, priced.clientTotalCents, FILE, V1, JOB, OWNER]) {
      expect(values).toContain(figure);
    }
    expect(values).toContain(`Sent Quote PSS-1042 v1.pdf for ${formatCents(priced.clientTotalCents)}`);
  });

  it("re-checks the stored pricing inputs the review read (waive, no-install, every line's %)", async () => {
    const waived = { ...version, waiveHandling: true, lines: version.lines.map((l) => ({ ...l, pctOverride: 64.1 })) };
    store.listVersions.mockResolvedValue([waived]);
    await send();
    const call = sql.mock.calls[0];
    const s = text(call);
    const offeredCte = s.slice(s.indexOf("offered as ("), s.indexOf("priced_lines as ("));
    expect(offeredCte).toContain("and waive_handling = ? and no_install = ?");
    expect(offeredCte).toMatch(/and not exists \( select 1 from dc_quote_lines q join jsonb_to_recordset\(\?::jsonb\) as r\(position int, override numeric\) on q.position = r.position where q.version_id = \? and q.pct_override is distinct from r.override \)/);
    const strings = call[0] as TemplateStringsArray;
    const valueAfter = (fragment: string) => call[1 + strings.findIndex((part) => part.replace(/\s+/g, " ").endsWith(fragment))];
    expect(valueAfter("and waive_handling = ")).toBe(true);
    expect(valueAfter(" and no_install = ")).toBe(false);
  });

  it("re-checks, where they are stored, that the job is not Lost and has an email", async () => {
    await send();
    const s = text(sql.mock.calls[0]);
    const offeredCte = s.slice(s.indexOf("offered as ("), s.indexOf("priced_lines as ("));
    expect(offeredCte).toContain("and exists (select 1 from leads where id = ? and status <> 'lost' and nullif(trim(email), '') is not null)");
  });

  it("a quote re-sent after approval supersedes the old one, unshares its quote and unsigned contract, and puts Approved back to Quoted", async () => {
    await send();
    const s = text(sql.mock.calls[0]);
    const superseded = s.slice(s.indexOf("superseded as ("), s.indexOf("unshared as ("));
    expect(superseded).toContain("status in ('draft','offered','sent') and id <> ? and exists (select 1 from offered)");
    const unsharedAt = s.indexOf("unshared as (");
    const unshared = s.slice(unsharedAt, s.indexOf("shared as (", unsharedAt + "unshared as (".length));
    expect(unshared).toContain("not exists (select 1 from contract_signatures s where s.file_id = job_files.id or s.signed_file_id = job_files.id)");
    const stageAt = s.indexOf("stage_logged as (");
    const stage = s.slice(stageAt, s.indexOf("logged as (", stageAt + "stage_logged as (".length));
    expect(stage).toContain("where prev.status in ('new','visit_booked','approved')");
  });

  it("removes the generated quote when the statement matched nothing (a race)", async () => {
    sql.mockResolvedValue([]);
    expect(await send()).toEqual({ error: "This quote changed while you were sending. Reload and try again." });
    expect(deleteFile).toHaveBeenCalledWith(FILE, OWNER);
    expect(quoteEmail.sendQuoteEmail).not.toHaveBeenCalled();
  });

  it("removes the generated quote when the statement throws, and the error still propagates", async () => {
    sql.mockRejectedValue(new Error("db down"));
    files.deleteFile.mockRejectedValue(new Error("cleanup failed too"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(send()).rejects.toThrow("db down");
    expect(deleteFile).toHaveBeenCalledWith(FILE, OWNER);
    spy.mockRestore();
  });

  it("a failed client email still leaves the quote sent, and says so", async () => {
    quoteEmail.sendQuoteEmail.mockRejectedValue(new Error("resend down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await send()).toEqual({ ok: true, emailed: false });
    expect(deleteFile).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("sendContract, from the approved quote", () => {
  beforeEach(() => {
    store.listVersions.mockResolvedValue([offered]);
    jobs.getJob.mockResolvedValue({ ...job, status: "approved" });
  });
  const contract = () => sendContract({ jobId: JOB, versionId: V1, actor: "Sent on approval" });

  it("builds the contract from the frozen figures, with its sign marks, and sends it in ONE statement", async () => {
    expect(await contract()).toEqual({ ok: true, emailed: true });
    const [printed, terms] = pdf.renderContractPdf.mock.calls[0];
    expect(terms).toEqual({ pdf: termsBytes });
    expect(printed).toMatchObject({ projectNo: "PSS-1042", version: 1, clientTotalCents: frozenTotal, installCents: 25000 });
    expect(printed.lines).toEqual([expect.objectContaining({ sellUnitCents: 39300, sellExtendedCents: productsCents })]);
    expect(createFile).toHaveBeenCalledWith(expect.objectContaining({
      docType: "contract", name: "Contract PSS-1042 v1.pdf", signMarks: MARKS, actor: "Sent on approval",
    }));
    expect(sql).toHaveBeenCalledTimes(1);
    const s = text(sql.mock.calls[0]);
    for (const part of [
      "update dc_quote_versions set status = 'sent', contract_file_id = ?, sent_at = now(), sent_by = ?",
      "and status = 'offered' and approved_at is not null", "select max(version)",
      "and exists (select 1 from leads where id = ? and status <> 'lost' and nullif(trim(email), '') is not null)",
      "update job_files set shared_at = now()", "'quote'",
    ]) expect(s).toContain(part);
    // The price was frozen at Send quote: nothing re-prices or supersedes here.
    expect(s).not.toContain("update dc_quote_lines");
    expect(s).not.toContain("superseded");
    expect(sql.mock.calls[0].slice(1)).toContain(`Sent Contract PSS-1042 v1.pdf for ${formatCents(frozenTotal)}`);
    expect(email.sendContractEmail).toHaveBeenCalledWith({ ...job, status: "approved" }, "Contract PSS-1042 v1.pdf");
  });

  it("prints the live terms template, filled for this job", async () => {
    templates.liveTemplateOfKind.mockResolvedValue(TERMS);
    expect(await contract()).toEqual({ ok: true, emailed: true });
    expect(blob.get).not.toHaveBeenCalled();
    expect(pdf.renderContractPdf.mock.calls[0][1]).toEqual({ text: "## Terms\n\nPremier Shade Solutions LLC and Test Testt, PSS-1042." });
  });

  it.each([
    ["a quote the client has not approved", { ...offered, approvedAt: null }, "The client has not approved this quote yet."],
    ["a quote whose contract is already out", { ...offered, status: "sent" as const }, "This quote's contract has already been sent, or the quote was never sent."],
    ["a draft", version, "This quote's contract has already been sent, or the quote was never sent."],
  ])("refuses %s, building nothing", async (_label, stored, error) => {
    store.listVersions.mockResolvedValue([stored]);
    expect(await contract()).toEqual({ error });
    expect(pdf.renderContractPdf).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
  });

  it("refuses a Lost job, a job with no email and a version that is not the newest", async () => {
    jobs.getJob.mockResolvedValue({ ...job, status: "lost" });
    expect(await contract()).toEqual({ error: "This job is marked Lost." });
    jobs.getJob.mockResolvedValue({ ...job, email: " " });
    expect(await contract()).toEqual({ error: "Add the client's email address to the job first." });
    jobs.getJob.mockResolvedValue(job);
    expect(await sendContract({ jobId: JOB, versionId: V0, actor: OWNER })).toEqual({ error: "A newer version of this quote has arrived. Review that one." });
    expect(createFile).not.toHaveBeenCalled();
  });

  it("removes the contract when the statement matched nothing (approved twice, or a race)", async () => {
    sql.mockResolvedValue([]);
    expect(await contract()).toEqual({ error: "This quote changed while you were sending. Reload and try again." });
    expect(deleteFile).toHaveBeenCalledWith(FILE, "Sent on approval");
    expect(email.sendContractEmail).not.toHaveBeenCalled();
  });
});

describe("terms from the Documents page", () => {
  it("has no terms blocker with a template and no upload", async () => {
    store.getDcSettings.mockResolvedValue({ termsPathname: null, termsUpdatedAt: null, lastPolledAt: null });
    templates.liveTemplateOfKind.mockResolvedValue(TERMS);
    expect((await loadReview(JOB))!.blockers).toEqual([]);
  });
  it("blocks with neither a template nor an upload", async () => {
    store.getDcSettings.mockResolvedValue({ termsPathname: null, termsUpdatedAt: null, lastPolledAt: null });
    expect((await loadReview(JOB))!.blockers).toContain("Add your contract terms on the Documents page first.");
  });
  it("refuses Send quote, storing nothing, when a terms field has no value for this job", async () => {
    templates.liveTemplateOfKind.mockResolvedValue(TERMS);
    jobs.getJob.mockResolvedValue({ ...job, name: "   " });
    expect(await send()).toEqual({ error: "Your contract terms have {{client_name}} with no value for this job. Fix the terms on the Documents page." });
    expect(quotePdf.buildQuotePdf).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
  });
  it("shows a terms field with no value as a blocker on the review, before Send quote", async () => {
    templates.liveTemplateOfKind.mockResolvedValue(TERMS);
    jobs.getJob.mockResolvedValue({ ...job, name: "   " });
    expect((await loadReview(JOB))!.blockers)
      .toContain("Your contract terms have {{client_name}} with no value for this job. Fix the terms on the Documents page.");
  });
  describe("the starter's DRAFT line", () => {
    const DRAFT = "Your contract terms still carry the DRAFT line. Remove it on the Documents page.";
    it("blocks the review and refuses Send quote while the live terms still carry it", async () => {
      const { STARTER_TERMS } = await import("@/lib/docs/starter-terms");
      templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: STARTER_TERMS });
      const review = await loadReview(JOB);
      expect(review!.blockers).toContain(DRAFT);
      expect(await send({ fingerprint: review!.fingerprint })).toEqual({ error: DRAFT });
      expect(quotePdf.buildQuotePdf).not.toHaveBeenCalled();
      expect(createFile).not.toHaveBeenCalled();
      expect(sql).not.toHaveBeenCalled();
    });
    it("refuses the contract too, if the line comes back after the quote was sent", async () => {
      const { STARTER_TERMS } = await import("@/lib/docs/starter-terms");
      store.listVersions.mockResolvedValue([offered]);
      templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: STARTER_TERMS });
      expect(await sendContract({ jobId: JOB, versionId: V1, actor: OWNER })).toEqual({ error: DRAFT });
      expect(pdf.renderContractPdf).not.toHaveBeenCalled();
    });
    it("finds the line anywhere in the body, padded with spaces", async () => {
      const { STARTER_TERMS } = await import("@/lib/docs/starter-terms");
      const first = STARTER_TERMS.split("\n")[0].trim();
      templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: `## Terms\n\n  ${first}  \n\nMore.` });
      expect((await loadReview(JOB))!.blockers).toEqual([DRAFT]);
    });
    it("still finds the line with its bold taken off or its spacing changed", async () => {
      const { STARTER_TERMS } = await import("@/lib/docs/starter-terms");
      const plain = STARTER_TERMS.split("\n")[0].trim().replace(/\*/g, "").replace(/ /g, "   ");
      templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: `## Terms\n\n${plain}\n\nMore.` });
      expect((await loadReview(JOB))!.blockers).toEqual([DRAFT]);
    });
    it("does not mistake terms that merely mention a draft for the banner", async () => {
      templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: "## Terms\n\nA draft of the order is shared before it is placed." });
      expect((await loadReview(JOB))!.blockers).toEqual([]);
    });
    it("clears once the owner deletes the line", async () => {
      const { STARTER_TERMS } = await import("@/lib/docs/starter-terms");
      const reviewed = STARTER_TERMS.split("\n").slice(1).join("\n");
      templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: reviewed });
      expect((await loadReview(JOB))!.blockers).toEqual([]);
    });
  });
  it("never fills a field terms may not use, so a stray figure cannot print beside the total", async () => {
    templates.liveTemplateOfKind.mockResolvedValue({ ...TERMS, body: "## Terms\n\nPay {{deposit}} on signing." });
    jobs.getJob.mockResolvedValue({ ...job, depositCents: 50000, soldCents: 200000 });
    const review = await loadReview(JOB);
    const refusal = "Your contract terms have {{deposit}} with no value for this job. Fix the terms on the Documents page.";
    expect(review!.blockers).toContain(refusal);
    expect(await send({ fingerprint: review!.fingerprint })).toEqual({ error: refusal });
    expect(quotePdf.buildQuotePdf).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Update the Quote tab, action and store tests**

`tests/dc/quote-actions.test.ts`:
- the `@/lib/dc/send` mock becomes

```ts
const sendQuote = vi.fn(async (..._args: unknown[]): Promise<{ ok: true; emailed: boolean } | { error: string }> => {
  order.push("send");
  return { ok: true, emailed: true };
});
const sendContract = vi.fn(async (..._args: unknown[]): Promise<{ ok: true; emailed: boolean } | { error: string }> => {
  order.push("send");
  return { ok: true, emailed: true };
});
vi.mock("@/lib/dc/send", () => ({ sendQuote, sendContract }));
```

- the import line adds `sendQuoteAction`: `const { setLinePctAction, setChoicesAction, sendQuoteAction, sendContractAction, checkNowAction } = await import(…)`.
- rename `describe("sendContractAction", …)` to `describe("sendQuoteAction", …)`; in it, every `sendContractAction(J, V, …)` becomes `sendQuoteAction(J, V, …)` and every `sendContract` becomes `sendQuote`; the thrown-error test expects `{ error: "The quote could not be sent. Try again, and if it keeps failing, contact support." }` and `console.error` called with `"Sending the quote failed"`.
- add:

```ts
describe("sendContractAction", () => {
  it("checks the admin first and sends the approved version's contract as the owner", async () => {
    expect(await sendContractAction(J, V)).toEqual({ ok: true, emailed: true });
    expect(order).toEqual(["auth", "send"]);
    expect(sendContract).toHaveBeenCalledWith({ jobId: J, versionId: V, actor: "o@x.com" });
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/jobs/${J}`);
  });
  it("returns the refusal verbatim, and answers a failure plainly", async () => {
    sendContract.mockResolvedValueOnce({ error: "The client has not approved this quote yet." });
    expect(await sendContractAction(J, V)).toEqual({ error: "The client has not approved this quote yet." });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    sendContract.mockRejectedValueOnce(new Error("Blob put failed"));
    expect(await sendContractAction(J, V)).toEqual({ error: "The contract could not be sent. Try again, and if it keeps failing, contact support." });
    expect(error).toHaveBeenCalledWith("Sending the contract failed", expect.any(Error));
    error.mockRestore();
  });
});
```

`tests/dc/quote-review.test.tsx`:
- mock: `const sendQuoteAction = vi.fn();` and the quote-actions mock returns `{ setLinePctAction, setChoicesAction, sendQuoteAction, sendContractAction, checkNowAction }`; `beforeEach` adds `sendQuoteAction.mockResolvedValue({ ok: true, emailed: true });`.
- `version()` fixture gains `quoteFileId: null, offeredAt: null, approvedAt: null,` after `createdAt`.
- in `describe("QuoteReview send")`: every `{ name: "Send contract" }` becomes `{ name: "Send quote" }`; `sendContractAction` becomes `sendQuoteAction`; the ok text is `/^Quote sent\.$/`; the email-failed text is `"Quote sent, but the email to the client failed — send them their project page link yourself."`.
- in `describe("QuoteReview after sending")`, the fixture `sent` gains `offeredAt: new Date("2026-09-20T18:00:00Z"), approvedAt: new Date("2026-09-20T20:00:00Z")` and the two expectations read `"Contract sent Sep 21, 2026 for $1,848.34"` and `"Contract sent Sep 21, 2026 for $1,777.17"`.
- `describe("QuoteTab")` "shows the review…": `{ name: "Send quote" }`.
- add:

```tsx
describe("QuoteReview after Send quote", () => {
  const offered = version({ status: "offered", offeredAt: new Date("2026-09-21T18:00:00Z"), clientTotalCents: 184834 });

  it("says the quote went out and is waiting for the client, with no contract button", () => {
    render(<QuoteReview jobId={J} review={review({ version: offered, blockers: ["This version has already been sent."] })} />);
    expect(screen.getByText("Quote sent")).toBeInTheDocument();
    expect(screen.getByText("Quote sent Sep 21, 2026 for $1,848.34. Waiting for the client to approve it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send contract" })).toBeNull();
  });

  it("offers Send contract when the client approved but the contract did not go out, and sends it", async () => {
    sendContractAction.mockResolvedValueOnce({ ok: true, emailed: true });
    const approved = { ...offered, approvedAt: new Date("2026-09-22T18:00:00Z") };
    render(<QuoteReview jobId={J} review={review({ version: approved, blockers: ["This version has already been sent."] })} />);
    expect(screen.getByText("The client approved this quote on Sep 22, 2026, but the contract was not sent.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send contract" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/^Contract sent\.$/);
    expect(sendContractAction).toHaveBeenCalledWith(J, V);
  });
});
```

`tests/dc/store.test.ts` — in "reads the DC Client name back", add `quote_file_id: "q1", offered_at: "2026-09-21T18:00:00.000Z", approved_at: null,` to the row and assert:

```ts
    expect(version).toMatchObject({ quoteFileId: "q1", offeredAt: new Date("2026-09-21T18:00:00.000Z"), approvedAt: null });
```

- [ ] **Step 4: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/dc`
Expected: FAIL — `sendQuote`, `buildQuotePdf`, `sendQuoteEmail`, `approveDcQuote` do not exist; the Quote tab still says "Send contract".

- [ ] **Step 5: Extract the priced pages and build the quote PDF**

`lib/dc/contract-pdf.ts` — replace `renderContractPdf`'s first half (from its doc comment down to and including the line `text("The terms and conditions on the following pages are part of this contract.", MARGIN, 9);`) with a shared drawer and a shorter `renderContractPdf`. Everything from `const initials: InitialsMark[] = [];` to the end of the file, `drawTerms`, `buildTermsPdf` and `buildContractPdf` stay exactly as merged.

```ts
/**
 * Page 1+: the letterhead, the client, the priced lines and the totals under `heading`, ending with the
 * `closing` sentence. The contract and the quote both print through this, so the quote the client
 * approves and the contract they sign show the same figures in the same places.
 */
export function drawPricedPages(doc: PDFDocument, regular: PDFFont, bold: PDFFont, input: ContractInput, heading: string, closing: string): void {
  const { rows, totals } = contractRows(input);
  const fullWidth = LETTER[0] - 2 * MARGIN;

  let page: PDFPage = doc.addPage(LETTER);
  let y = LETTER[1] - MARGIN;
  // Every string drawn passes through winAnsiSafe: the standard fonts throw on anything they cannot encode.
  const text = (s: string, x: number, size = 9, font = regular) => page.drawText(winAnsiSafe(s), { x, y, size, font, color: rgb(0.1, 0.1, 0.1) });
  const right = (s: string, xRight: number, size = 9, font = regular) => text(s, xRight - font.widthOfTextAtSize(winAnsiSafe(s), size), size, font);
  const need = (height: number) => { if (y - height < MARGIN) { page = doc.addPage(LETTER); y = LETTER[1] - MARGIN; } };

  text(business.legalName, MARGIN, 14, bold); y -= 16;
  text(`${business.phone.display} · ${business.email}`, MARGIN, 9); y -= 26;
  const date = formatShortDate(input.date);
  const title = wrap(heading, bold, 16, fullWidth - regular.widthOfTextAtSize(winAnsiSafe(date), 10) - 16);
  right(date, LETTER[0] - MARGIN, 10);
  title.forEach((l, i) => { if (i) y -= 18; text(l, MARGIN, 16, bold); }); y -= 20;
  for (const l of wrap(input.client.name, bold, 11, fullWidth)) { text(l, MARGIN, 11, bold); y -= 13; }
  for (const line of [input.client.address, input.client.city, input.client.email]) {
    if (line) for (const l of wrap(line, regular, 10, fullWidth)) { text(l, MARGIN, 10); y -= 12; }
  }
  y -= 14;

  const header = () => {
    text("Room", COLS.room, 9, bold); text("Product", COLS.product, 9, bold);
    right("Qty", COLS.qty, 9, bold); right("Each", COLS.unit + 20, 9, bold); right("Total", LETTER[0] - MARGIN, 9, bold);
    y -= 6; page.drawLine({ start: { x: MARGIN, y }, end: { x: LETTER[0] - MARGIN, y }, thickness: 0.5 }); y -= 12;
  };
  need(40);
  header();
  for (const row of rows) {
    const product = wrap(row.product, bold, 9, COLS.qty - COLS.product - 40);
    const details = wrap(row.details, regular, 8, COLS.qty - COLS.product - 40);
    const roomLines = wrap(row.room, regular, 9, COLS.product - COLS.room - 8);
    const height = Math.max(product.length * 11 + details.length * 10, roomLines.length * 11) + 8;
    if (y - height < MARGIN) { page = doc.addPage(LETTER); y = LETTER[1] - MARGIN; header(); }
    const top = y;
    roomLines.forEach((l, i) => { y = top - i * 11; text(l, COLS.room); });
    y = top; right(row.qty, COLS.qty); right(row.unit, COLS.unit + 20); right(row.total, LETTER[0] - MARGIN);
    product.forEach((l, i) => { y = top - i * 11; text(l, COLS.product, 9, bold); });
    details.forEach((l, i) => { y = top - product.length * 11 - i * 10; text(l, COLS.product, 8); });
    y = top - height;
  }
  need(totals.length * 16 + 20);
  y -= 6; page.drawLine({ start: { x: 330, y }, end: { x: LETTER[0] - MARGIN, y }, thickness: 0.5 }); y -= 14;
  for (const [label, value] of totals) {
    const strong = label === "Total";
    right(label, 470, strong ? 11 : 9, strong ? bold : regular);
    right(value, LETTER[0] - MARGIN, strong ? 11 : 9, strong ? bold : regular);
    y -= strong ? 16 : 13;
  }
  need(40);
  y -= 16;
  text(closing, MARGIN, 9);
}

/** Page 1+: the priced contract. Then the terms: drawn from the terms template, or the uploaded PDF page for page. Signing stamps it later. */
export async function renderContractPdf(input: ContractInput, terms: ContractTerms): Promise<RenderedPdf> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  drawPricedPages(doc, regular, bold, input, `Contract ${input.projectNo} · Version ${input.version}`,
    "The terms and conditions on the following pages are part of this contract.");

```

(`renderContractPdf` continues with the merged `const initials: InitialsMark[] = [];` block unchanged; `PDFPage` stays imported because `drawPricedPages` uses it.)

`lib/dc/quote-pdf.ts`:

```ts
import "server-only";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { ContractInput } from "./contract-layout";
import { drawPricedPages } from "./contract-pdf";

/** Spec §2: the quote the client approves — the contract's priced pages, titled Quote, with no terms and no signature block. */
export async function buildQuotePdf(input: ContractInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  drawPricedPages(doc, regular, bold, input, `Quote ${input.projectNo} · Version ${input.version}`,
    "Approve this quote on your project page and we will send your contract to sign.");
  return doc.save();
}
```

`lib/dc/send-quote-email.ts`:

```ts
import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import { normalizeEmail } from "@/lib/portal/access";
import { INVITE_MINUTES, issueCustomerLink } from "@/lib/portal/login";

/** Spec §2: "Your quote is ready", with a sign-in link. Plain text, like sendContractEmail. Throws on failure. */
export async function sendQuoteEmail(job: Job, fileName: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  const email = normalizeEmail(job.email);
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!email) throw new Error("This job has no email address");
  const link = await issueCustomerLink(email, INVITE_MINUTES);
  const firstName = job.name.trim().split(/\s+/)[0] || "";
  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`, to: email, replyTo: business.email,
    subject: `Your ${business.name} quote is ready`,
    text: [
      firstName ? `Hi ${firstName},` : "Hi there,", "",
      `Your quote (${fileName}) is ready. You can review it and approve it on your project page:`, "",
      link, "",
      "Once you approve it, we send your contract to sign.", "",
      `Questions? Call us at ${business.phone.display} or just reply to this email.`, "", business.name,
    ].join("\n"),
  });
  if (error) throw new Error(`Resend rejected the quote email: ${error.message}`);
}
```

- [ ] **Step 6: Record the approval**

`lib/dc/approve.ts`:

```ts
import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/ids";

/** Who the contract sent automatically on approval names: the client's approval sent it, not an owner. */
export const APPROVAL_ACTOR = "Sent on approval";

export type OfferedVersion = { id: string; version: number; quoteFileId: string | null; approvedAt: Date | null };

/** The job's one offered DC version (dc_quote_versions_one_offered allows at most one), or null. */
export async function offeredVersion(leadId: string): Promise<OfferedVersion | null> {
  if (!isUuid(leadId)) return null;
  const rows = await db()`
    select id, version, quote_file_id, approved_at from dc_quote_versions
    where lead_id = ${leadId} and status = 'offered'
    order by version desc limit 1`;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string, version: Number(row.version), quoteFileId: (row.quote_file_id as string | null) ?? null,
    approvedAt: row.approved_at ? new Date(row.approved_at as string) : null,
  };
}

/**
 * Spec §2, the client's approval of a DC quote. One statement: stamps approved_at once (a second
 * approval matches nothing and answers null), only on this job's offered version whose quote PDF is
 * shared and only while the job is not Lost; moves Quoted to Approved with a 'stage' event, or — for a
 * change to a job already past Quoted — logs a 'quote' event and leaves the stage alone.
 */
export async function approveDcQuote(leadId: string, versionId: string, actor: string): Promise<{ version: number } | null> {
  if (!isUuid(leadId) || !isUuid(versionId)) return null;
  const rows = await db()`
    with approved as (
      update dc_quote_versions set approved_at = now(), approved_by = ${actor}
      where id = ${versionId} and lead_id = ${leadId} and status = 'offered' and approved_at is null
        and exists (select 1 from leads where id = ${leadId} and status <> 'lost')
        and exists (select 1 from job_files f where f.id = dc_quote_versions.quote_file_id and f.shared_at is not null)
      returning id, version
    ),
    prev as (select status from leads where id = ${leadId}),
    moved as (
      update leads set status = 'approved', stage_changed_at = now(), updated_at = now()
      where id = ${leadId} and status = 'quoted' and exists (select 1 from approved)
      returning id
    ),
    stage_logged as (
      insert into job_events (lead_id, actor, kind, from_status, to_status, body)
      select ${leadId}, ${actor}, 'stage', prev.status, 'approved', 'Approved quote version ' || approved.version
      from prev, moved, approved
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select ${leadId}, ${actor}, 'quote', 'Approved quote version ' || version || ' from their project page' from approved
      where not exists (select 1 from moved)
    )
    select version from approved`;
  return rows[0] ? { version: Number(rows[0].version) } : null;
}
```

- [ ] **Step 7: The version's new statuses and stamps**

`lib/dc/store.ts` — in `StoredVersion`:

```ts
  sourceFileId: string; sourceSha256: string; status: "draft" | "offered" | "sent" | "signed" | "superseded" | "cancelled";
```

and after `contractFileId: string | null; sentAt: Date | null; signedAt: Date | null; createdAt: Date; lines: StoredLine[];` add:

```ts
  /** The quote PDF Send quote shared, when the quote was offered and when the client approved it (migration 030). */
  quoteFileId: string | null; offeredAt: Date | null; approvedAt: Date | null;
```

In `listVersions`' mapping, after `createdAt: new Date(v.created_at as string),`:

```ts
    quoteFileId: (v.quote_file_id as string | null) ?? null, offeredAt: date(v.offered_at), approvedAt: date(v.approved_at),
```

- [ ] **Step 8: Replace `lib/dc/send.ts`**

```ts
import "server-only";
import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { createFile, deleteFile } from "@/lib/admin/files";
import { getJob, type Job } from "@/lib/admin/jobs";
import { listInstallQuotes } from "@/lib/admin/install-quotes";
import { formatCents } from "@/lib/admin/money";
import { formatProjectNo } from "@/lib/portal/project-no";
import { fillFields, termsFieldValues } from "@/lib/docs/fill";
import { remainingMarkers } from "@/lib/docs/parse";
import { STARTER_TERMS } from "@/lib/docs/starter-terms";
import { liveTemplateOfKind, type DocumentTemplate } from "@/lib/docs/templates";
import type { ContractInput } from "./contract-layout";
import { renderContractPdf, type ContractTerms } from "./contract-pdf";
import { pickInstallQuote, priceVersion, pricingFingerprint, sendBlockers, type InstallChoice, type PricedVersion } from "./pricing";
import { buildQuotePdf } from "./quote-pdf";
import { sendContractEmail } from "./send-contract-email";
import { sendQuoteEmail } from "./send-quote-email";
import { getDcSettings, listMarkupRules, listVersions, type DcSettings, type StoredVersion } from "./store";

export type Review = { version: StoredVersion; priced: PricedVersion; blockers: string[]; fingerprint: string; install: InstallChoice | null; rules: Record<string, number>; olderVersions: StoredVersion[] };

const NEWER = "A newer version of this quote has arrived. Review that one.";
const RACE = "This quote changed while you were sending. Reload and try again.";
const NO_TERMS = "Add your contract terms on the Documents page first.";
const DRAFT_TERMS = "Your contract terms still carry the DRAFT line. Remove it on the Documents page.";
const TERMS_UNREADABLE = "Your contract terms file could not be read. Add your contract terms on the Documents page.";

/** An offered (or later) version's price as Send quote froze it: the per-line % and sell stored then, and the stored totals. */
function frozenPrice(version: StoredVersion): PricedVersion {
  const lines = version.lines.map((l) => {
    const sellExtendedCents = l.sellUnitCents === null ? null : l.sellUnitCents * l.qty;
    return {
      position: l.position, pct: l.markupPct, source: l.markupOverridden ? "override" as const : "rule" as const,
      sellUnitCents: l.sellUnitCents, sellExtendedCents,
      marginCents: sellExtendedCents === null ? null : sellExtendedCents - l.costExtendedCents,
    };
  });
  const installCents = version.installCents ?? 0;
  const clientTotalCents = version.clientTotalCents;
  return {
    lines, productsCents: version.productsCents,
    handlingChargedCents: version.waiveHandling ? 0 : version.handlingFeeCents, oversizedCents: version.oversizedFeeCents,
    installCents, installQuoteId: version.installQuoteId, clientTotalCents, costCents: version.dealerTotalCents,
    // As priceVersion computes it: product margin, installation excluded.
    marginCents: clientTotalCents === null ? null : clientTotalCents - installCents - version.dealerTotalCents,
    waiveHandling: version.waiveHandling, blockers: [],
  };
}

/**
 * Spec §8 (documents): the terms template filled for this job at `now`. Only TERMS_FIELDS are filled: any
 * other marker (a total, a deposit) stays and refuses, so terms never print a figure beside the contract's.
 */
function fillTerms(template: DocumentTemplate, job: Job, now: Date): { text: string } | { error: string } {
  const filled = fillFields(template.body, termsFieldValues(job, now));
  const left = remainingMarkers(filled.text);
  if (left.length > 0) {
    return { error: `Your contract terms have ${left.join(", ")} with no value for this job. Fix the terms on the Documents page.` };
  }
  return { text: filled.text };
}

/** A line as it reads, ignoring bold marks and spacing, so un-bolding the banner doesn't sneak it past. */
const asRead = (line: string): string => line.replace(/\*/g, "").replace(/\s+/g, " ").trim();

/** The starter terms banner (their first line), which the owner deletes once an attorney has reviewed them. */
const STARTER_DRAFT_LINE = asRead(STARTER_TERMS.split("\n")[0]);

/** True while the terms still carry the starter DRAFT banner as one of their lines. */
function carriesDraftLine(body: string): boolean {
  return body.split("\n").some((line) => asRead(line) === STARTER_DRAFT_LINE);
}

/** The review plus the job and settings it was computed from, so Send quote and the contract use the very same reads. */
async function review(jobId: string): Promise<{ review: Review; job: Job; settings: DcSettings; termsTemplate: DocumentTemplate | null } | null> {
  const [job, versions, rules, installs, settings, termsTemplate] = await Promise.all([
    getJob(jobId), listVersions(jobId), listMarkupRules(), listInstallQuotes(jobId), getDcSettings(), liveTemplateOfKind("terms"),
  ]);
  if (!job || versions.length === 0) return null;
  const [version, ...olderVersions] = versions;
  const choices: InstallChoice[] = installs.map((q) => ({ id: q.id, kind: q.kind, totalCents: q.totalCents, createdAt: q.createdAt }));
  let install: InstallChoice | null;
  let priced: PricedVersion;
  if (version.status === "draft") {
    install = pickInstallQuote(choices);
    priced = priceVersion({
      lines: version.lines.map((l) => ({ position: l.position, qty: l.qty, collection: l.collection, msrpUnitCents: l.msrpUnitCents, costExtendedCents: l.costExtendedCents, pctOverride: l.pctOverride })),
      rules, handlingFeeCents: version.handlingFeeCents, oversizedFeeCents: version.oversizedFeeCents,
      dealerTotalCents: version.dealerTotalCents, waiveHandling: version.waiveHandling, install, noInstall: version.noInstall,
    });
  } else {
    // Offered, sent, signed, superseded or cancelled: what was sent, never a re-price with today's markup or install price.
    install = version.installQuoteId ? choices.find((q) => q.id === version.installQuoteId) ?? null : null;
    priced = frozenPrice(version);
  }
  const blockers = sendBlockers(priced, {
    hasTerms: termsTemplate !== null || settings.termsPathname !== null, isLatest: true, versionStatus: version.status,
    jobStatus: job.status, customerEmail: job.email,
  });
  // Shown before Send quote; Send quote and the contract fill and check again with their own `now`.
  if (termsTemplate) {
    const filled = fillTerms(termsTemplate, job, new Date());
    if ("error" in filled) blockers.push(filled.error);
    if (carriesDraftLine(termsTemplate.body)) blockers.push(DRAFT_TERMS);
  }
  return { review: { version, priced, blockers, fingerprint: pricingFingerprint(priced), install, rules, olderVersions }, job, settings, termsTemplate };
}

/** The latest version of a job's DC quote, priced exactly as Send quote would price it. */
export async function loadReview(jobId: string): Promise<Review | null> {
  return (await review(jobId))?.review ?? null;
}

/**
 * The terms the contract prints: the live terms template filled for this job at `now`, otherwise the
 * uploaded PDF's bytes. Send quote resolves them too and throws the result away (spec §2: nothing that
 * could stop the contract later is left unchecked).
 */
async function resolveTerms(termsTemplate: DocumentTemplate | null, settings: DcSettings, job: Job, now: Date): Promise<ContractTerms | { error: string }> {
  if (termsTemplate) {
    if (carriesDraftLine(termsTemplate.body)) return { error: DRAFT_TERMS };
    return fillTerms(termsTemplate, job, now);
  }
  if (!settings.termsPathname) return { error: NO_TERMS };
  const stored = await get(settings.termsPathname, { access: "private" });
  if (!stored || stored.statusCode !== 200) return { error: TERMS_UNREADABLE };
  return { pdf: new Uint8Array(await new Response(stored.stream).arrayBuffer()) };
}

/** What the quote and the contract print, from the priced version the review computed or Send quote froze. */
function pricedInput(job: Job, version: StoredVersion, priced: PricedVersion, projectNo: string, date: Date): ContractInput {
  const pricedLine = (position: number) => priced.lines.find((x) => x.position === position)!;
  return {
    projectNo, version: version.version, date,
    client: { name: job.name, address: job.address, city: job.city, email: job.email },
    lines: version.lines.map((l) => {
      const p = pricedLine(l.position);
      return { room: l.room, description: l.description, options: l.options, qty: l.qty, sellUnitCents: p.sellUnitCents!, sellExtendedCents: p.sellExtendedCents! };
    }),
    installCents: priced.installCents, handlingChargedCents: priced.handlingChargedCents,
    oversizedCents: priced.oversizedCents, clientTotalCents: priced.clientTotalCents!,
  };
}

/**
 * Spec §2, Send quote. Recomputes the price, refuses anything the owner did not see (a blocker, a newer
 * version, a changed fingerprint) and anything that would stop the contract later (the terms), builds the
 * quote PDF, then in ONE statement freezes the price (draft → offered), supersedes and unshares every other
 * unsigned version's quote and contract, shares the quote, records quote_cents, moves New / Appointment
 * booked / Approved to Quoted (an approval of a superseded price no longer stands), and logs it.
 * The client email goes last: a failed email leaves the quote sent and answers emailed false.
 */
export async function sendQuote(input: { jobId: string; versionId: string; fingerprint: string; actor: string }): Promise<{ ok: true; emailed: boolean } | { error: string }> {
  const loaded = await review(input.jobId);
  if (!loaded) return { error: "This job has no Direct Connect quote." };
  const { review: current, job, settings, termsTemplate } = loaded;
  if (current.version.id !== input.versionId) return { error: NEWER };
  if (current.blockers.length > 0) return { error: current.blockers[0] };
  if (current.fingerprint !== input.fingerprint) return { error: "Prices changed since you opened this page. Review them and send again." };

  const { priced, version } = current;
  const now = new Date();
  const terms = await resolveTerms(termsTemplate, settings, job, now);
  if ("error" in terms) return terms;

  const projectNo = formatProjectNo(job.projectNo) ?? "PSS";
  const name = `Quote ${projectNo} v${version.version}.pdf`;
  const pdf = await buildQuotePdf(pricedInput(job, version, priced, projectNo, now));
  const file = await createFile({ leadId: job.id, kind: "document", name, contentType: "application/pdf",
    body: new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), actor: input.actor, docType: "quote" });
  if (!file) return { error: "This job no longer exists." };

  const lineRows = JSON.stringify(version.lines.map((l) => {
    const p = priced.lines.find((x) => x.position === l.position)!;
    return { position: l.position, override: l.pctOverride, pct: p.pct, sell_unit_cents: p.sellUnitCents, overridden: p.source === "override" };
  }));
  let rows: Record<string, unknown>[];
  try {
    // Every CTE sees the same snapshot, so `moved`'s case reads the status before this update.
    // dc_quote_versions_one_offered is deferred to commit, so offering this version while `superseded`
    // retires the old offered one, in the same statement, is allowed.
    rows = await db()`
      with prev as (select status from leads where id = ${job.id}),
      offered as (
        update dc_quote_versions set status = 'offered', install_quote_id = ${priced.installQuoteId}, install_cents = ${priced.installCents},
          products_cents = ${priced.productsCents}, client_total_cents = ${priced.clientTotalCents},
          quote_file_id = ${file.id}, offered_at = now(), offered_by = ${input.actor}
        where id = ${version.id} and lead_id = ${job.id} and status = 'draft'
          and version = (select max(version) from dc_quote_versions where lead_id = ${job.id})
          -- The inputs this price was computed from must be the ones still stored.
          and waive_handling = ${version.waiveHandling} and no_install = ${version.noInstall}
          and not exists (
            select 1 from dc_quote_lines q
            join jsonb_to_recordset(${lineRows}::jsonb) as r(position int, override numeric) on q.position = r.position
            where q.version_id = ${version.id} and q.pct_override is distinct from r.override
          )
          -- The job-level blockers, rechecked where they are stored.
          and exists (select 1 from leads where id = ${job.id} and status <> 'lost' and nullif(trim(email), '') is not null)
        returning id
      ),
      priced_lines as (
        update dc_quote_lines set markup_pct = l.pct, sell_unit_cents = l.sell_unit_cents, markup_overridden = l.overridden
        from offered, jsonb_to_recordset(${lineRows}::jsonb) as l(position int, pct numeric, sell_unit_cents int, overridden boolean)
        where dc_quote_lines.version_id = offered.id and dc_quote_lines.position = l.position
        returning 1
      ),
      superseded as (
        update dc_quote_versions set status = 'superseded'
        where lead_id = ${job.id} and status in ('draft','offered','sent') and id <> ${version.id} and exists (select 1 from offered)
        returning contract_file_id, quote_file_id
      ),
      unshared as (
        update job_files set shared_at = null
        where lead_id = ${job.id}
          and (id in (select contract_file_id from superseded) or id in (select quote_file_id from superseded))
          and not exists (select 1 from contract_signatures s where s.file_id = job_files.id or s.signed_file_id = job_files.id)
        returning id
      ),
      shared as (
        update job_files set shared_at = now()
        where id = ${file.id} and lead_id = ${job.id} and exists (select 1 from offered)
        returning id
      ),
      moved as (
        update leads set quote_cents = ${priced.clientTotalCents},
          status = case when status in ('new','visit_booked','approved') then 'quoted' else status end,
          stage_changed_at = case when status in ('new','visit_booked','approved') then now() else stage_changed_at end,
          updated_at = now()
        where id = ${job.id} and exists (select 1 from offered)
        returning id
      ),
      stage_logged as (
        insert into job_events (lead_id, actor, kind, from_status, to_status, body)
        select ${job.id}, ${input.actor}, 'stage', prev.status, 'quoted', 'Quote sent' from prev, moved
        where prev.status in ('new','visit_booked','approved')
      ),
      logged as (
        insert into job_events (lead_id, actor, kind, body)
        select ${job.id}, ${input.actor}, 'quote', ${`Sent ${name} for ${formatCents(priced.clientTotalCents)}`} from offered
      )
      select id from offered`;
  } catch (error) {
    // Nothing links to the quote yet: remove it, or every retry leaves another one on the job.
    await deleteFile(file.id, input.actor).catch((cleanup) => console.error("Could not remove the unsent quote", cleanup));
    throw error;
  }
  if (rows.length === 0) {
    // The version stopped being the latest draft (another send, or a newer import) after we read it.
    if (!(await deleteFile(file.id, input.actor))) console.error(`Could not remove the unsent quote ${file.id}`);
    return { error: RACE };
  }
  try {
    await sendQuoteEmail(job, name);
    return { ok: true, emailed: true };
  } catch (error) {
    console.error(`Quote ${name} sent but the client email failed`, error);
    return { ok: true, emailed: false };
  }
}

/**
 * Spec §2, the contract for an approved quote: called on the client's approval, or by the owner's Send
 * contract when that failed. Builds from the price Send quote froze (no fingerprint: nothing can have
 * moved), with 029's sign marks stored in createFile's statement, then in ONE statement moves the
 * version offered → sent (approved, still the newest, job not Lost and with an email), shares the
 * contract and logs it. A second call matches nothing, removes its file and says so.
 */
export async function sendContract(input: { jobId: string; versionId: string; actor: string }): Promise<{ ok: true; emailed: boolean } | { error: string }> {
  const loaded = await review(input.jobId);
  if (!loaded) return { error: "This job has no Direct Connect quote." };
  const { review: current, job, settings, termsTemplate } = loaded;
  const { version, priced } = current;
  if (version.id !== input.versionId) return { error: NEWER };
  if (version.status !== "offered") return { error: "This quote's contract has already been sent, or the quote was never sent." };
  if (!version.approvedAt) return { error: "The client has not approved this quote yet." };
  if (job.status === "lost") return { error: "This job is marked Lost." };
  if (!job.email?.trim()) return { error: "Add the client's email address to the job first." };

  const now = new Date();
  const terms = await resolveTerms(termsTemplate, settings, job, now);
  if ("error" in terms) return terms;

  const projectNo = formatProjectNo(job.projectNo) ?? "PSS";
  const name = `Contract ${projectNo} v${version.version}.pdf`;
  const rendered = await renderContractPdf(pricedInput(job, version, priced, projectNo, now), terms);
  // The marks go in with the file, in createFile's one statement (visible signatures spec §3).
  const file = await createFile({ leadId: job.id, kind: "document", name, contentType: "application/pdf",
    body: new Blob([new Uint8Array(rendered.bytes)], { type: "application/pdf" }), actor: input.actor, docType: "contract",
    signMarks: rendered.marks });
  if (!file) return { error: "This job no longer exists." };

  let rows: Record<string, unknown>[];
  try {
    rows = await db()`
      with frozen as (
        update dc_quote_versions set status = 'sent', contract_file_id = ${file.id}, sent_at = now(), sent_by = ${input.actor}
        where id = ${version.id} and lead_id = ${job.id} and status = 'offered' and approved_at is not null
          and version = (select max(version) from dc_quote_versions where lead_id = ${job.id})
          and exists (select 1 from leads where id = ${job.id} and status <> 'lost' and nullif(trim(email), '') is not null)
        returning id
      ),
      shared as (
        update job_files set shared_at = now()
        where id = ${file.id} and lead_id = ${job.id} and exists (select 1 from frozen)
        returning id
      ),
      logged as (
        insert into job_events (lead_id, actor, kind, body)
        select ${job.id}, ${input.actor}, 'quote', ${`Sent ${name} for ${formatCents(priced.clientTotalCents)}`} from frozen
      )
      select id from frozen`;
  } catch (error) {
    await deleteFile(file.id, input.actor).catch((cleanup) => console.error("Could not remove the unsent contract", cleanup));
    throw error;
  }
  if (rows.length === 0) {
    if (!(await deleteFile(file.id, input.actor))) console.error(`Could not remove the unsent contract ${file.id}`);
    return { error: RACE };
  }
  try {
    await sendContractEmail(job, name);
    return { ok: true, emailed: true };
  } catch (error) {
    console.error(`Contract ${name} sent but the client email failed`, error);
    return { ok: true, emailed: false };
  }
}
```

Note: the SQL `--` comment lines inside the `offered` CTE are inside the template string, as the merged file already has them; Postgres ignores them. They contain no `${}`.

- [ ] **Step 9: The owner's two buttons**

`app/admin/jobs/[id]/quote-actions.ts` — the import becomes `import { sendContract, sendQuote } from "@/lib/dc/send";`, and replace `sendContractAction` with:

```ts
/** Send quote (spec §2). The fingerprint is passed through untouched for Send quote to compare. */
export async function sendQuoteAction(jobId: string, versionId: string, fingerprint: string): Promise<{ error?: string; ok?: boolean; emailed?: boolean }> {
  const admin = await requireAdmin();
  if (typeof fingerprint !== "string" || fingerprint.length > 50_000) return { error: "Reload the page and try again." };
  let result: Awaited<ReturnType<typeof sendQuote>>;
  try {
    result = await sendQuote({ jobId, versionId, fingerprint, actor: admin.email });
  } catch (error) {
    // Blob or pdf-lib can throw. The owner gets a plain answer, not the error page.
    console.error("Sending the quote failed", error);
    return { error: "The quote could not be sent. Try again, and if it keeps failing, contact support." };
  }
  if ("error" in result) return { error: result.error };
  refresh(jobId);
  return { ok: true, emailed: result.emailed };
}

/** Send contract (spec §2): the recovery when the client approved but the contract did not go out. */
export async function sendContractAction(jobId: string, versionId: string): Promise<{ error?: string; ok?: boolean; emailed?: boolean }> {
  const admin = await requireAdmin();
  let result: Awaited<ReturnType<typeof sendContract>>;
  try {
    result = await sendContract({ jobId, versionId, actor: admin.email });
  } catch (error) {
    console.error("Sending the contract failed", error);
    return { error: "The contract could not be sent. Try again, and if it keeps failing, contact support." };
  }
  if ("error" in result) return { error: result.error };
  refresh(jobId);
  return { ok: true, emailed: result.emailed };
}
```

`app/admin/jobs/[id]/QuoteReview.tsx`:
- import: `import { sendContractAction, sendQuoteAction, setChoicesAction, setLinePctAction } from "./quote-actions";`
- constants:

```ts
const STATUS: Record<StoredVersion["status"], string> = {
  draft: "Draft", offered: "Quote sent", sent: "Contract sent", signed: "Signed", superseded: "Superseded", cancelled: "Cancelled",
};
const EMAIL_FAILED = "Quote sent, but the email to the client failed — send them their project page link yourself.";
const CONTRACT_EMAIL_FAILED = "Contract sent, but the email to the client failed — send them their project page link yourself.";
```

- replace `send` and add `sendContract` and `awaitingContract`:

```ts
  const send = () =>
    startSend(async () => {
      const result = await sendQuoteAction(jobId, version.id, fingerprint);
      if (result.error) setSendResult({ error: result.error });
      else setSendResult({ ok: result.emailed === false ? EMAIL_FAILED : "Quote sent." });
    });

  // Spec §2: the client approved, but the contract step failed (the owners were emailed). The owner sends it.
  const awaitingContract = version.status === "offered" && version.approvedAt !== null;
  const sendContract = () =>
    startSend(async () => {
      const result = await sendContractAction(jobId, version.id);
      if (result.error) setSendResult({ error: result.error });
      else setSendResult({ ok: result.emailed === false ? CONTRACT_EMAIL_FAILED : "Contract sent." });
    });
```

- replace the line `{version.sentAt ? <p className="text-sm">Sent {formatShortDate(version.sentAt)} for {formatCents(priced.clientTotalCents)}</p> : null}` with:

```tsx
      {version.status === "offered" && version.offeredAt ? (
        <p className="text-sm">Quote sent {formatShortDate(version.offeredAt)} for {formatCents(priced.clientTotalCents)}.{version.approvedAt ? "" : " Waiting for the client to approve it."}</p>
      ) : null}
      {awaitingContract && version.approvedAt ? (
        <p className="text-sm font-semibold">The client approved this quote on {formatShortDate(version.approvedAt)}, but the contract was not sent.</p>
      ) : null}
      {version.sentAt ? <p className="text-sm">Contract sent {formatShortDate(version.sentAt)} for {formatCents(priced.clientTotalCents)}</p> : null}
```

- replace the `<div>` holding the Send button with:

```tsx
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={send} disabled={blockers.length > 0 || sending}
            className="inline-flex min-h-11 items-center justify-center bg-charcoal px-5 text-sm text-ivory disabled:cursor-not-allowed disabled:opacity-40">
            Send quote
          </button>
          {awaitingContract ? (
            <button type="button" onClick={sendContract} disabled={sending}
              className="inline-flex min-h-11 items-center justify-center border border-charcoal px-5 text-sm disabled:opacity-40">
              Send contract
            </button>
          ) : null}
        </div>
```

- [ ] **Step 10: Bring `scripts/verify-dc-quote-import.ts` onto the new flow**

(Task 7 already made step 10 expect Signed.) Edits:

1. Doc comment steps 5–7: "sendContract" → "sendQuote" and "contract file" → "quote file" in 5; step 6 becomes "send: sendQuote freezes v2 (offered) at priceVersion's figures (computed here independently), supersedes v1, shares the quote PDF, sets A's quote_cents and moves A from visit_booked to quoted with one stage event; 6b. approveDcQuote approves v2 once (a second call answers null), moves A to approved, and sendContract moves v2 to sent with a shared contract at the same total"; step 7 "a second Send quote and a second contract are both refused and leave one quote and one contract file"; step 10 "…signs v2, moves A from approved to signed with sold_cents = the total".
2. After the `vi.mock("../lib/dc/contract-pdf", …)` block add:

```ts
vi.mock("../lib/dc/quote-pdf", () => ({
  buildQuotePdf: async (input: { projectNo: string; version: number }) => {
    if (hooks.duringBuild) await hooks.duringBuild();
    return new Uint8Array(Buffer.from(`%PDF-1.4 verify quote ${input.projectNo} v${input.version}`));
  },
}));
vi.mock("../lib/dc/send-quote-email", () => ({
  sendQuoteEmail: async (_job: unknown, fileName: string) => {
    hooks.emails.push(fileName);
  },
}));
```

3. Imports: `import { loadReview, sendContract, sendQuote } from "../lib/dc/send";` and `import { approveDcQuote } from "../lib/dc/approve";`.
4. `versionRow` selects `client_total_cents, contract_file_id, sent_at, sent_by, signed_at, quote_file_id, offered_at, offered_by, approved_at`. After `contractFiles` add:

```ts
const quoteFiles = async (leadId: string) =>
  await sql`select id, shared_at, doc_type from job_files where lead_id = ${leadId} and doc_type = 'quote'`;
```

5. In `race`: `let answer: Awaited<ReturnType<typeof sendQuote>>;`, `answer = await sendQuote({ jobId: A.id, versionId: v2, fingerprint: fresh!.fingerprint, actor: ACTOR });`, label `sendQuote answers the race error`, `const left = await quoteFiles(A.id);` with `no quote file is left`, and the draft check `row.status === "draft" && row.quote_file_id === null && row.client_total_cents === null`. In race (a), both statements use `'offered'` instead of `'sent'` for the change (undo stays `'draft'`).
6. Step 6 — replace from `const sent = await sendContract(` through the `check(hooks.emails.length === 1, "the client email was sent once", …)` line (keeping the `frozenLines`, v1-superseded and dealer-copy checks) so that it reads:

```ts
    const sent = await sendQuote({ jobId: A.id, versionId: v2, fingerprint: fresh!.fingerprint, actor: ACTOR });
    check(same(sent, { ok: true, emailed: true }), "sendQuote answers ok, emailed", `got ${JSON.stringify(sent)}`);
    const v2sent = await versionRow(v2);
    check(
      v2sent.status === "offered" && v2sent.client_total_cents === expected.clientTotalCents &&
        v2sent.products_cents === expected.productsCents && v2sent.install_cents === 25000 &&
        v2sent.install_quote_id === installQuoteId && v2sent.offered_at !== null && v2sent.offered_by === ACTOR &&
        v2sent.quote_file_id !== null && v2sent.contract_file_id === null && v2sent.approved_at === null,
      `v2 is offered, frozen at priceVersion's total ${expected.clientTotalCents}, with a quote and no contract`,
      `row ${JSON.stringify(v2sent)}, expected ${JSON.stringify(expected)}`,
    );
```

then the unchanged `frozenLines` and `v1 is superseded` checks, then:

```ts
    const quotes = await quoteFiles(A.id);
    check(quotes.length === 1 && quotes[0].id === v2sent.quote_file_id && quotes[0].shared_at !== null,
      "one shared quote file, the one v2 points at", `got ${JSON.stringify(quotes)}`);
    check((await contractFiles(A.id)).length === 0, "no contract before the approval", JSON.stringify(await contractFiles(A.id)));
```

then the unchanged `aSent` (quoted, quote_cents) and one-stage-event checks, then `check(hooks.emails.length === 1, "the quote email was sent once", …)`, the unchanged dealer-copy check, and:

```ts
    console.log("step 6b: approve, then the contract");
    const approved = await approveDcQuote(A.id, v2, ACTOR);
    check(same(approved, { version: 2 }), "approveDcQuote answers version 2", `got ${JSON.stringify(approved)}`);
    check((await approveDcQuote(A.id, v2, ACTOR)) === null, "approving again answers null", "not null");
    const aApproved = await leadRow(A.id);
    check(aApproved.status === "approved", "A is approved", `row ${JSON.stringify(aApproved)}`);
    const approvedStages = await stageEvents(A.id);
    check(approvedStages.length === 2 && approvedStages[1].from_status === "quoted" && approvedStages[1].to_status === "approved",
      "one more stage event, quoted -> approved, and none for the second approval", `got ${JSON.stringify(approvedStages)}`);
    const contracted = await sendContract({ jobId: A.id, versionId: v2, actor: ACTOR });
    check(same(contracted, { ok: true, emailed: true }), "sendContract answers ok, emailed", `got ${JSON.stringify(contracted)}`);
    const v2contract = await versionRow(v2);
    check(v2contract.status === "sent" && v2contract.contract_file_id !== null && v2contract.sent_by === ACTOR &&
        v2contract.client_total_cents === expected.clientTotalCents && v2contract.approved_at !== null,
      "v2 is sent with its contract, at the same total", `row ${JSON.stringify(v2contract)}`);
    const contracts = await contractFiles(A.id);
    check(contracts.length === 1 && contracts[0].id === v2contract.contract_file_id && contracts[0].shared_at !== null &&
        contracts[0].doc_type === "contract",
      "one shared contract file, the one v2 points at", `got ${JSON.stringify(contracts)}`);
    const contractId = contracts[0].id as string;
    check(hooks.emails.length === 2, "the contract email was sent once", `got ${JSON.stringify(hooks.emails)}`);
```

(Delete the old step 6's `const contracts = …`, its check and `const contractId = …`: they now live in 6b.)
7. Step 7 becomes:

```ts
    console.log("step 7: a second send");
    const resend = await loadReview(A.id);
    const again = await sendQuote({ jobId: A.id, versionId: v2, fingerprint: resend!.fingerprint, actor: ACTOR });
    check(same(again, { error: "This version has already been sent." }),
      "sending v2's quote again is refused: This version has already been sent.", `got ${JSON.stringify(again)}`);
    const againContract = await sendContract({ jobId: A.id, versionId: v2, actor: ACTOR });
    check(same(againContract, { error: "This quote's contract has already been sent, or the quote was never sent." }),
      "sending v2's contract again is refused", `got ${JSON.stringify(againContract)}`);
    check((await contractFiles(A.id)).length === 1 && (await versionRow(v2)).contract_file_id === contractId &&
        (await quoteFiles(A.id)).length === 1,
      "still exactly one contract and one quote file, v2's", JSON.stringify(await contractFiles(A.id)));
    check(hooks.emails.length === 2, "no further client email", `got ${JSON.stringify(hooks.emails)}`);
```

8. Step 10's stage check becomes:

```ts
    check(soldStages.length === 3 && soldStages[2].from_status === "approved" && soldStages[2].to_status === "signed",
      "one more stage event, approved -> signed", `got ${JSON.stringify(soldStages)}`);
```

- [ ] **Step 11: Run the tests, typecheck, lint**

Run: `npx vitest run --maxWorkers=2 tests/dc tests/docs tests/admin tests/portal` → PASS (the contract tests prove the extraction changed no drawing). `npx tsc --noEmit` → clean. `npx eslint lib/dc app/admin/jobs/[id] scripts/verify-dc-quote-import.ts tests/dc` → exit 0.

- [ ] **Step 12: Test power**

(a) In `sendQuote`'s `moved` and `stage_logged`, drop `'approved'` → "a quote re-sent after approval…" fails (Review Focus 5). (b) In `sendContract`, drop `and approved_at is not null` from `frozen` → "builds the contract…" fails. (c) Change the quote's closing sentence → "draws every line and total exactly where page 1 of the contract does" fails on `differing`. (d) Make `resolveTerms` skip the uploaded file read → "refuses, writing nothing, when the uploaded terms cannot be read" fails. (e) In `approveDcQuote`, drop `and approved_at is null` → its test fails. Restore each.

- [ ] **Step 13: Commit**

```bash
git add lib/dc app/admin/jobs/[id] scripts/verify-dc-quote-import.ts tests/dc
git commit -m "feat: Send quote freezes and shares a quote; the approved quote's contract is sent from it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0122UD6P8agX8gRaojNYtEiL"
```

---

### Task 9: The client approves — DC quotes send their contract, uploaded quotes move to Approved

`app/(site)/project/actions.ts` was changed by 029 (`signContractAction`, `signContractFormAction`). Edit only `approveQuoteAction` and the imports; leave both signing functions byte-for-byte as merged.

**Files:**
- Modify: `app/(site)/project/actions.ts` (imports and `approveQuoteAction` only), `app/(site)/project/ApproveQuote.tsx`, `app/(site)/project/ProjectView.tsx`, `lib/portal/approve.ts`, `lib/portal/send-approval-email.ts`
- Test: `tests/portal/approve.test.ts`, `tests/portal/approve-ui.test.tsx`, `tests/portal/approval-email.test.ts`, `tests/portal/project-view.test.tsx`, `e2e/portal.spec.ts:620-680`

**Interfaces:**
- Consumes: `offeredVersion`, `approveDcQuote`, `APPROVAL_ACTOR`, `type OfferedVersion` (Task 8); `sendContract` (Task 8); `stageIndex` (Task 1); `stageRank` (`lib/portal/progress.ts`).
- Produces:
  - `approveQuoteAction(jobId)` — DC path when an offered version exists (any stage but Lost): approve once, then `sendContract({ jobId, versionId, actor: "Sent on approval" })`; uploaded path: Quoted → Approved.
  - `approveQuote(jobId, actor, quoteName)` moves to `approved`.
  - `type ApprovalOutcome = "paperwork" | "contract-sent" | "contract-failed"`; `notifyOwnersOfApproval(job, quoteName, approvedBy, outcome: ApprovalOutcome = "paperwork")`.
  - `ApprovalNotice` confirms only when the job is `approved`, and says nothing about a failure at or beyond Approved.
  - Portal copy: "Approving accepts this quote. Your contract comes next, to read and sign."

- [ ] **Step 1: Update the failing tests**

`tests/portal/approve.test.ts` — add mocks under the existing ones:

```ts
const dcApprove = {
  offeredVersion: vi.fn(async (_id: string) => null as unknown), approveDcQuote: vi.fn(), APPROVAL_ACTOR: "Sent on approval",
};
vi.mock("@/lib/dc/approve", () => dcApprove);
const dcSend = { sendContract: vi.fn() };
vi.mock("@/lib/dc/send", () => dcSend);
```

In `beforeEach` add `dcApprove.offeredVersion.mockReset().mockResolvedValue(null); dcApprove.approveDcQuote.mockReset(); dcSend.sendContract.mockReset();`. Then:
- "refuses a job the customer does not own…": add `expect(dcApprove.offeredVersion).not.toHaveBeenCalled();`.
- "refuses when the job is not quoted…": the list becomes `["signed", "sold", "ordered", "installed", "completed"]`, and the comment says `approved` is covered below.
- "moves the job once when approved twice": the second call's job has `status: "approved"`.
- "answers a re-approval of an already-sold job…" → "…already-approved job…" with `status: "approved"`.
- `describe("approveQuote")` first test: "moves the job to approved …" and `expect(values).toContain("approved");`.
- "tells the owners who approved, and which document": `toHaveBeenCalledWith(expect.objectContaining({ id: MINE }), QUOTE_NAME, EMAIL, "paperwork")`.
- append:

```ts
describe("a Direct Connect quote (spec §2)", () => {
  const V = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  const offered = { id: V, version: 2, quoteFileId: "fq", approvedAt: null as Date | null };
  const dcQuote = { id: "fq", name: "Quote PSS-1048 v2.pdf", docType: "quote" };

  beforeEach(() => {
    dcApprove.offeredVersion.mockResolvedValue(offered);
    dcApprove.approveDcQuote.mockResolvedValue({ version: 2 });
    dcSend.sendContract.mockResolvedValue({ ok: true, emailed: true });
    SHARED = [dcQuote];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("records the approval, then sends that version's contract as the automatic sender, then tells the owners", async () => {
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(dcApprove.approveDcQuote).toHaveBeenCalledWith(MINE, V, EMAIL);
    expect(dcSend.sendContract).toHaveBeenCalledWith({ jobId: MINE, versionId: V, actor: "Sent on approval" });
    expect(dcApprove.approveDcQuote.mock.invocationCallOrder[0]).toBeLessThan(dcSend.sendContract.mock.invocationCallOrder[0]);
    expect(notifyOwnersOfApproval).toHaveBeenCalledWith(expect.objectContaining({ id: MINE }), "Quote PSS-1048 v2.pdf", EMAIL, "contract-sent");
    // approveDcQuote's own statement moved the job; setStage is not used on this path.
    expect(query).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith(`/project/${MINE}`);
  });

  it("keeps the approval when the contract throws or is refused, and tells the owners it was not sent", async () => {
    dcSend.sendContract.mockRejectedValueOnce(new Error("Blob put failed"));
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(notifyOwnersOfApproval).toHaveBeenLastCalledWith(expect.anything(), "Quote PSS-1048 v2.pdf", EMAIL, "contract-failed");
    dcSend.sendContract.mockResolvedValueOnce({ error: "Your contract terms file could not be read. Add your contract terms on the Documents page." });
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(notifyOwnersOfApproval).toHaveBeenLastCalledWith(expect.anything(), "Quote PSS-1048 v2.pdf", EMAIL, "contract-failed");
  });

  it("is a no-op the second time: an approved quote sends and emails nothing again", async () => {
    dcApprove.offeredVersion.mockResolvedValue({ ...offered, approvedAt: new Date() });
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(dcApprove.approveDcQuote).not.toHaveBeenCalled();
    expect(dcSend.sendContract).not.toHaveBeenCalled();
    expect(notifyOwnersOfApproval).not.toHaveBeenCalled();
  });

  it("answers approved, sending nothing, when a racing tap approved first", async () => {
    dcApprove.approveDcQuote.mockResolvedValue(null);
    dcApprove.offeredVersion.mockResolvedValueOnce(offered).mockResolvedValueOnce({ ...offered, approvedAt: new Date() });
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(dcSend.sendContract).not.toHaveBeenCalled();
    expect(notifyOwnersOfApproval).not.toHaveBeenCalled();
  });

  it("refuses when the offered version's own quote PDF is not shared", async () => {
    SHARED = [{ id: "older", name: "Quote PSS-1048 v1.pdf", docType: "quote" }];
    await expect(approveQuoteAction(MINE)).resolves.toBe("no-quote");
    expect(dcApprove.approveDcQuote).not.toHaveBeenCalled();
  });

  it("approves a change sent to a job already past Quoted (Review Focus 5)", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [{ ...job, status: "sold" }] });
    await expect(approveQuoteAction(MINE)).resolves.toBe("approved");
    expect(dcSend.sendContract).toHaveBeenCalled();
  });

  it("refuses a Lost job before reading anything", async () => {
    requireCustomer.mockResolvedValue({ email: EMAIL, jobs: [{ ...job, status: "lost" }] });
    await expect(approveQuoteAction(MINE)).resolves.toBe("wrong-status");
    expect(dcApprove.offeredVersion).not.toHaveBeenCalled();
  });
});
```

`tests/portal/approve-ui.test.tsx`:
- `const REVEAL = "Approving accepts this quote. Your contract comes next, to read and sign.";`
- every `status="sold"` in the confirmation tests (the first, second and last `it`) becomes `status="approved"`.
- "confirms nothing when the job is not sold…" → "…not approved…", list `["quoted", "signed", "ordered", "installed"]`.
- the F1 `it.each` list becomes `["approved", "signed", "sold", "measure", "ordered", "installed"]` and its comment "every status AT OR BEYOND `approved`".

`tests/portal/approval-email.test.ts` — append:

```ts
  it.each([
    ["paperwork", "Quote approved by John Ramos — PSS-1048", "The job has moved to Approved. Send the paperwork from the job page."],
    ["contract-sent", "Quote approved — contract sent — PSS-1048", "The job has moved to Approved and the contract was sent to the client to sign."],
    ["contract-failed", "Quote approved — contract not sent — PSS-1048", "The job has moved to Approved, but the contract was NOT sent. Open the Quote tab and press Send contract."],
  ] as const)("says what happened next: %s", async (outcome, subject, line) => {
    await notifyOwnersOfApproval(JOB, QUOTE_NAME, EMAIL, outcome);
    const sent = send.mock.calls[0][0] as { subject: string; text: string };
    expect(sent.subject).toBe(subject);
    expect(sent.text).toContain(line);
    expect(sent.text).not.toContain("Sold");
  });
```

`tests/portal/project-view.test.tsx` — add the mock `const offeredVersion = vi.fn(async (_id: string) => null as unknown); vi.mock("@/lib/dc/approve", () => ({ offeredVersion }));`, reset it to `null` in `beforeEach`, and:

```tsx
describe("ProjectView approval", () => {
  const dcQuote = { id: "fq", name: "Quote PSS-1048 v2.pdf", docType: "quote" as const };

  it("offers approval of the offered DC quote, linking that quote, even on a job past Quoted", async () => {
    listSharedDocuments.mockResolvedValue([quoteDoc, dcQuote]);
    offeredVersion.mockResolvedValue({ id: "v", version: 2, quoteFileId: "fq", approvedAt: null });
    render(await ProjectView({ job: { ...job, status: "sold" } }));
    const banner = screen.getByRole("region", { name: "Where your project stands" });
    expect(within(banner).getByText("Approve this quote")).toBeInTheDocument();
    expect(within(banner).getByRole("link", { name: "Review quote" })).toHaveAttribute("href", "/project/files/fq");
  });

  it("offers nothing once the client approved it", async () => {
    listSharedDocuments.mockResolvedValue([dcQuote]);
    offeredVersion.mockResolvedValue({ id: "v", version: 2, quoteFileId: "fq", approvedAt: new Date() });
    render(await ProjectView({ job: { ...job, status: "approved" } }));
    expect(screen.queryByText("Approve this quote")).toBeNull();
  });
});
```

`e2e/portal.spec.ts`, the test "a customer approves a quote and the job reads Sold, in their own name" (uploaded path):
- name: "a customer approves an uploaded quote and the job reads Approved, in their own name"; its doc comment says Approved.
- REVEAL line 648: `banner.getByText("Approving accepts this quote. Your contract comes next, to read and sign."),`
- line 659: `await expect(banner.getByRole("heading", { name: "Quote Ready" })).toBeVisible();` (an approved job still stands at Quote Ready).
- `expect(row.status).toBe("approved");`, the event `to_status: "approved"`.
- the board check: `page.getByRole("region", { name: /^Approved ·/ })`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --maxWorkers=2 tests/portal/approve.test.ts tests/portal/approve-ui.test.tsx tests/portal/approval-email.test.ts tests/portal/project-view.test.tsx`
Expected: FAIL — approval still moves to Sold, the DC path does not exist, the copy is old.

- [ ] **Step 3: Implement**

`lib/portal/approve.ts` — line 11 of the doc comment, `* Records that a customer approved their quote, moving the job to Sold.`, becomes:

```ts
 * Records that a customer approved an uploaded quote, moving the job to Approved; the owners then send
 * the paperwork by hand. A Direct Connect quote is approved by approveDcQuote (lib/dc/approve.ts) instead.
```

(the rest of that comment stays) and `const moved = await setStage(jobId, "approved", actor, {`.

`lib/portal/send-approval-email.ts`:

```ts
/** What happened after the approval, so the owners know whether anything is left for them to do. */
export type ApprovalOutcome = "paperwork" | "contract-sent" | "contract-failed";

const SUBJECT: Record<ApprovalOutcome, string> = {
  paperwork: "Quote approved by",
  "contract-sent": "Quote approved — contract sent —",
  "contract-failed": "Quote approved — contract not sent —",
};
const NEXT: Record<ApprovalOutcome, string> = {
  paperwork: "The job has moved to Approved. Send the paperwork from the job page.",
  "contract-sent": "The job has moved to Approved and the contract was sent to the client to sign.",
  "contract-failed": "The job has moved to Approved, but the contract was NOT sent. Open the Quote tab and press Send contract.",
};
```

Change the signature to `export async function notifyOwnersOfApproval(job: ApprovedJob, quoteName: string, approvedBy: string, outcome: ApprovalOutcome = "paperwork"): Promise<void>`, replace `"The job has moved to Sold.",` with `NEXT[outcome],`, the tracker line with ``Open in tracker: ${adminOrigin()}/admin/jobs/${job.id}${outcome === "paperwork" ? "" : "?tab=quote"}``, and the subject with:

```ts
    subject: outcome === "paperwork"
      ? `${SUBJECT.paperwork} ${job.name}${projectNo ? ` — ${projectNo}` : ""}`
      : `${SUBJECT[outcome]} ${projectNo ?? job.name}`,
```

`app/(site)/project/actions.ts`:
- imports: add `type Job` to the `@/lib/admin/jobs` import (`import { isUuid, setStage, type Job } from "@/lib/admin/jobs";`), and

```ts
import { APPROVAL_ACTOR, approveDcQuote, offeredVersion, type OfferedVersion } from "@/lib/dc/approve";
import { sendContract } from "@/lib/dc/send";
```

- replace `approveQuoteAction` (and its doc comment) with:

```ts
/**
 * Records that a customer approved their quote.
 *
 * Settled server-side, in this order, none of it from the request:
 *
 * 1. Ownership. The jobs are re-derived from the session; a jobId not among them is refused with
 *    exactly the answer a missing job gets, before anything is read or written.
 * 2. Which quote. A Direct Connect quote the owner sent with Send quote (an `offered` version) is
 *    approved by approveDcQuote, and its contract is then built and sent (spec §2). Otherwise an
 *    uploaded, shared quote moves the job Quoted → Approved and the owners send paperwork by hand.
 * 3. A shared quote. Approving something the customer cannot read is not consent: the DC path needs
 *    the offered version's own PDF shared, the uploaded path a shared Quote document.
 *
 * Approving twice is a no-op answering "approved". A contract that fails after the approval is saved
 * leaves the job Approved and tells the owners, who press Send contract on the Quote tab.
 */
export async function approveQuoteAction(jobId: string): Promise<ApproveResult> {
  const { email, jobs } = await requireCustomer();
  const job = jobs.find((candidate) => candidate.id === jobId);
  if (!job) return "not-found";
  if (job.status === "lost") return "wrong-status";

  const offered = await offeredVersion(job.id);
  if (offered) return approveOfferedQuote(job, offered, email);

  // An uploaded quote. A job already at the destination is an approval that already happened (spec
  // §4 of the portal work): same success, and nothing runs again.
  if (job.status === "approved") return "approved";
  if (job.status !== "quoted") return "wrong-status";

  const documents = await listSharedDocuments(job.id);
  const quote = documents.find((file) => file.docType === "quote");
  if (!quote) return "no-quote";

  const result = await approveQuote(job.id, email, quote.name);
  if (result !== "approved") return result;

  // The job has already moved by this point, so a failed email costs only the notification.
  after(() => {
    void notifyOwnersOfApproval(job, quote.name, email, "paperwork").catch(console.error);
  });

  // Both paths render the same view: /project renders ProjectView directly for a customer
  // with a single job, so revalidating only the [jobId] path would leave the common case stale.
  revalidatePath("/project");
  revalidatePath(`/project/${job.id}`);
  return result;
}

/** Spec §2: the DC path. The approval is saved first; the contract follows, and its failure never undoes it. */
async function approveOfferedQuote(job: Job, offered: OfferedVersion, email: string): Promise<ApproveResult> {
  if (offered.approvedAt) return "approved";
  const documents = await listSharedDocuments(job.id);
  const quote = documents.find((file) => file.id === offered.quoteFileId);
  if (!quote) return "no-quote";

  const approved = await approveDcQuote(job.id, offered.id, email);
  if (!approved) {
    // A racing second tap approved first (its request sends the contract), or the job was lost or
    // the quote unshared in between. Only the first is an approval that happened.
    const again = await offeredVersion(job.id);
    return again?.approvedAt ? "approved" : "wrong-status";
  }

  let contractSent = false;
  try {
    const result = await sendContract({ jobId: job.id, versionId: offered.id, actor: APPROVAL_ACTOR });
    contractSent = "ok" in result;
    if ("error" in result) console.error(`Quote version ${approved.version} approved but the contract was not sent: ${result.error}`);
  } catch (error) {
    console.error(`Quote version ${approved.version} approved but the contract could not be built or stored`, error);
  }
  after(() => {
    void notifyOwnersOfApproval(job, quote.name, email, contractSent ? "contract-sent" : "contract-failed").catch(console.error);
  });
  revalidatePath("/project");
  revalidatePath(`/project/${job.id}`);
  return "approved";
}
```

`app/(site)/project/ApproveQuote.tsx`:
- the reveal paragraph text becomes `Approving accepts this quote. Your contract comes next, to read and sign.`
- in `ApprovalNotice`: `const confirmed = approved === "1" && status === "approved";` and `if (!confirmed && stageRank(status) >= stageRank("approved")) return null;`; update the two comments that name `sold` to name `approved` ("an approved job does not stay at `approved`: it is signed, paid, ordered…").

`app/(site)/project/ProjectView.tsx`:
- import `import { offeredVersion } from "@/lib/dc/approve";`, add `offeredVersion(job.id),` to the `Promise.all` and `offered` to its destructuring.
- replace `const quote = documents.find((file) => file.docType === "quote");` with:

```ts
  // Spec §2: a Direct Connect quote the owner sent and the client has not approved yet — offered at any
  // stage but Lost, so a change sent after the contract can be approved too (Review Focus 5).
  const offeredQuote = offered && !offered.approvedAt && job.status !== "lost"
    ? documents.find((file) => file.id === offered.quoteFileId) ?? null
    : null;
  const quote = offeredQuote ?? documents.find((file) => file.docType === "quote");
```

- the banner's `approve` prop becomes `approve={offeredQuote || (quote && project.status === "quoted") ? <ApproveQuote jobId={job.id} /> : null}`.

- [ ] **Step 4: Run the tests, typecheck, lint**

Run: `npx vitest run --maxWorkers=2 tests/portal tests/dc` → PASS. `npx tsc --noEmit` → clean. `npx eslint "app/(site)/project" lib/portal tests/portal e2e/portal.spec.ts` → exit 0. Confirm `git diff origin/main -- "app/(site)/project/actions.ts"` touches only the imports and `approveQuoteAction`/`approveOfferedQuote`, and `git diff origin/main -- "app/(site)/project/SignContract.tsx"` is empty.

- [ ] **Step 5: Test power**

Move `sendContract` before `approveDcQuote` → the call-order assertion fails. Delete `if (offered.approvedAt) return "approved";` → "is a no-op the second time" fails (approveDcQuote is called). Change `ApprovalNotice`'s confirmation back to `status === "sold"` → the approve-ui confirmation test fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add "app/(site)/project/actions.ts" "app/(site)/project/ApproveQuote.tsx" "app/(site)/project/ProjectView.tsx" lib/portal/approve.ts lib/portal/send-approval-email.ts tests/portal e2e/portal.spec.ts
git commit -m "feat: approving a DC quote sends its contract; an uploaded quote's approval moves the job to Approved

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0122UD6P8agX8gRaojNYtEiL"
```

---

### Task 10: Real database — migration twice, every new statement run, and the flow end to end

Mocked-DB tests prove SQL text only. This task runs migration 030 (twice), every new CTE, the constraints and the whole flow against a Neon test branch, with Stripe replaced by a local stub.

**Files:**
- Create: `scripts/verify-deposit-flow.ts`, `scripts/verify-deposit-flow.config.mts`, `e2e/fixtures/stripe-stub.ts`
- Modify: `playwright.config.ts` (Stripe test env), `e2e/dc-quote.spec.ts` (the send/sign describe, the two "can't be sent" tests, `afterAll`)

**Interfaces:**
- Consumes: everything above. `e2e/portal.spec.ts` was updated in Tasks 2 and 9.

- [ ] **Step 0: Bring in main, and a clean build**

```bash
git fetch origin && git merge --no-edit origin/main
npx vitest run --maxWorkers=2
npx tsc --noEmit
npx next build
```

All pass (quote the vitest summary; `next build` ~34 s in a fresh worktree — never with a stale `.next/dev`).

- [ ] **Step 1: The hand-run verify script for the deposit SQL**

`scripts/verify-deposit-flow.config.mts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/**
 * Runs scripts/verify-deposit-flow.ts and nothing else. Its own config because the script imports the
 * real lib/payments/deposits.ts and lib/admin/jobs.ts, which need the `@` alias and the server-only stub.
 * Deliberately NOT reachable from vitest.config.mts (whose include is tests/**\/*.test.ts): it is run by hand.
 */
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["scripts/verify-deposit-flow.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": root,
      "server-only": path.resolve(root, "tests/server-only-stub.ts"),
    },
  },
});
```

`scripts/verify-deposit-flow.ts`:

```ts
/**
 * Behavioural proof of the deposit flow's SQL (migration 030, lib/payments/deposits.ts) against a real Postgres.
 *
 * THIS IS NOT AUTOMATED COVERAGE. It is run by hand, it is in no suite, and CI does not execute it. If you
 * change a statement in lib/payments/deposits.ts or a constraint in 030, run it yourself — and if you cannot,
 * call that SQL unverified. This feature moves money.
 *
 * What it does, against a throwaway database (leads named "VERIFY Deposit Flow <stamp> …"):
 *   1. setup: signed leads A (total 184833) and B (100000), quoted C with two draft versions, signed D;
 *   2. claimStripeDeposit on A twice answers the SAME pending row at 92417; a wrong amount claims nothing;
 *   3. attachSession sets the session once and refuses a second, different one;
 *   4. markStripeDepositPaid at a wrong amount changes nothing;
 *   5. markStripeDepositPaid pays A: every deposits field, A sold with deposit_cents, two events;
 *   6. the same delivery again changes nothing (rows and events identical);
 *   7. expireDeposit on the paid session changes nothing, and A can no longer be claimed;
 *   8. depositState(A) reads it all back;
 *   9. B: an open card checkout, then recordDepositPayment by check — the pending row expires, one paid row,
 *      B sold; the card payment that lands anyway matches nothing (Review Focus 3);
 *  10. a second paid row, and a second pending row, on one version violate their unique indexes (23505);
 *  11. expireStaleDeposits expires a pending row older than 23 hours;
 *  12. the deposits checks refuse a bad method, a zero amount and a paid row with no paid_at (23514);
 *  13. cancelDeposit on A: refunded, version cancelled, A lost with deposit_cents cleared, two events; again → false;
 *  14. dc_quote_versions_one_offered: two offered versions for C fail at commit (23P01), but superseding one and
 *      offering the other in ONE statement succeeds — the shape sendQuote relies on;
 *  15. the new stages and 'payment' are accepted, a bogus stage is not;
 *  16. deleteJob(A), with its deposits, succeeds and leaves no deposit rows;
 *  17. deletes everything it wrote, even on failure.
 *
 * IT WRITES TO THE DATABASE IT IS GIVEN. It takes its connection from E2E_POSTGRES_URL alone and refuses
 * production (cold-term). Usage (bash):
 *   E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" npx vitest run --config scripts/verify-deposit-flow.config.mts
 *
 * To watch it fail: delete `and status = 'pending'` from markStripeDepositPaid's `paid` CTE — step 6 fails
 * (a second delivery pays again or throws on the one-paid index). Delete `and exists (select 1 from paid)`
 * from recordDepositPayment — nothing visible changes here, so also delete `and l.status = 'signed'` from
 * its insert and run step 9 on a Sold lead by hand. Put everything back.
 */
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { test, vi } from "vitest";

// deleteJob removes the job's blobs; this script's files have made-up pathnames, so the delete is a no-op.
vi.mock("@vercel/blob", () => ({ del: async () => undefined, put: async () => ({}), get: async () => null }));

import { deleteJob } from "../lib/admin/jobs";
import {
  attachSession, cancelDeposit, claimStripeDeposit, depositState, expireDeposit, expireStaleDeposits,
  markStripeDepositPaid, recordDepositPayment,
} from "../lib/payments/deposits";

const url = process.env.E2E_POSTGRES_URL;
if (!url) throw new Error("verify-deposit-flow refused to run: E2E_POSTGRES_URL is not set. It never falls back to POSTGRES_URL or .env.local.");
const host = new URL(url).hostname;
if (host.includes("cold-term")) throw new Error("verify-deposit-flow refused to run: E2E_POSTGRES_URL is production (cold-term).");
const endpoint = process.env.E2E_TEST_ENDPOINT;
if (endpoint && !host.includes(endpoint)) throw new Error(`verify-deposit-flow refused to run: the URL is not the named test branch ${endpoint}.`);

// The modules under test read the connection through lib/db at call time: point them at the vetted URL only.
process.env.POSTGRES_URL = url;
process.env.DATABASE_URL = url;
delete process.env.RESEND_API_KEY;

const sql = neon(url);
const STAMP = Date.now();
const NAME_PREFIX = "VERIFY Deposit Flow";
const ACTOR = "verify-deposit-flow@example.com";

function check(condition: boolean, description: string, detail: string): void {
  if (!condition) throw new Error(`FAILED: ${description}\n  ${detail}`);
  console.log(`  ok  ${description}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const failure = (error: { code?: string; constraint?: string }) => `${error.code}:${error.constraint}`;

const newLead = async (suffix: string, status: string, soldCents: number | null): Promise<string> => {
  const rows = await sql`
    insert into leads (name, phone, email, city, source, status, sold_cents)
    values (${`${NAME_PREFIX} ${STAMP} ${suffix}`}, '7025550198', ${`verify-deposit-${STAMP}-${suffix}@example.com`},
            'Henderson', 'phone', ${status}, ${soldCents})
    returning id`;
  return rows[0].id as string;
};

const newVersion = async (leadId: string, version: number, status: string, totalCents: number | null): Promise<string> => {
  const [file] = await sql`
    insert into job_files (lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname, doc_type)
    values (${leadId}, ${ACTOR}, 'document', ${`DEALER COPY verify ${version}.html`}, 'text/html', 1,
            ${`verify/${leadId}/dealer-${version}-${STAMP}.html`}, 'dealer_copy')
    returning id`;
  const id = randomUUID();
  await sql`
    insert into dc_quote_versions (id, lead_id, version, dc_quote_no, po_reference, source_file_id, source_sha256, status,
      dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents, client_total_cents, signed_at)
    values (${id}, ${leadId}, ${version}, ${`V${STAMP}`}, 'PSS-0000', ${file.id}, ${"0".repeat(64)}, ${status},
            1, 0, 0, 1, ${totalCents}, ${status === "signed" ? new Date() : null})`;
  return id;
};

const depositRows = async (versionId: string) => await sql`
  select method, status, amount_cents, stripe_session_id, stripe_payment_intent_id, recorded_by,
         (paid_at is not null) as paid, (refunded_at is not null) as refunded
  from deposits where dc_quote_version_id = ${versionId} order by created_at, method`;
const leadRow = async (id: string) =>
  (await sql`select status, deposit_cents, sold_cents, lost_reason from leads where id = ${id}`)[0];
const events = async (id: string) => await sql`
  select actor, kind, from_status, to_status, body from job_events
  where lead_id = ${id} and kind in ('payment','stage') order by created_at, kind`;

const scriptLeads = async () =>
  (await sql`select id from leads where name like ${`${NAME_PREFIX} %`}`).map((r) => r.id as string);

test("the deposit flow's SQL holds against a real database", async () => {
  try {
    console.log("step 1: setup");
    const A = await newLead("A", "signed", 184833);
    const vA = await newVersion(A, 1, "signed", 184833);
    const B = await newLead("B", "signed", 100000);
    const vB = await newVersion(B, 1, "signed", 100000);
    const C = await newLead("C", "quoted", null);
    const vC1 = await newVersion(C, 1, "draft", null);
    const vC2 = await newVersion(C, 2, "draft", null);
    const D = await newLead("D", "signed", 2000);
    const vD = await newVersion(D, 1, "signed", 2000);

    console.log("step 2: claim twice");
    const first = await claimStripeDeposit({ leadId: A, versionId: vA, amountCents: 92417 });
    const second = await claimStripeDeposit({ leadId: A, versionId: vA, amountCents: 92417 });
    check(first !== null && second !== null && first.id === second.id && first.amountCents === 92417 && first.status === "pending",
      "two claims answer the same pending row at 92417", `got ${JSON.stringify([first, second])}`);
    check((await depositRows(vA)).length === 1, "one row for A", JSON.stringify(await depositRows(vA)));
    check((await claimStripeDeposit({ leadId: B, versionId: vB, amountCents: 49999 })) === null,
      "a claim at anything but the stored half claims nothing", "claimed");
    const depositA = first!.id;

    console.log("step 3: attach");
    check(await attachSession(depositA, "cs_verify_A"), "attachSession sets the session", "false");
    check(!(await attachSession(depositA, "cs_verify_other")), "a second, different session is refused", "true");

    console.log("step 4: wrong amount");
    check((await markStripeDepositPaid({ depositId: depositA, sessionId: "cs_verify_A", paymentIntentId: "pi_x", amountCents: 1 })) === null,
      "a payment for the wrong amount changes nothing", "paid");
    check((await depositRows(vA))[0].status === "pending", "A's row is still pending", JSON.stringify(await depositRows(vA)));

    console.log("step 5: paid by card");
    const paid = await markStripeDepositPaid({ depositId: depositA, sessionId: "cs_verify_A", paymentIntentId: "pi_verify_A", amountCents: 92417 });
    check(same(paid, { leadId: A }), "markStripeDepositPaid answers A", `got ${JSON.stringify(paid)}`);
    const rowsA = await depositRows(vA);
    check(same(rowsA, [{ method: "stripe", status: "paid", amount_cents: 92417, stripe_session_id: "cs_verify_A",
      stripe_payment_intent_id: "pi_verify_A", recorded_by: null, paid: true, refunded: false }]),
      "every stored field of A's deposit", JSON.stringify(rowsA));
    check(same(await leadRow(A), { status: "sold", deposit_cents: 92417, sold_cents: 184833, lost_reason: null }),
      "A is sold with deposit_cents 92417", JSON.stringify(await leadRow(A)));
    const eventsA = await events(A);
    check(same(eventsA, [
      { actor: "Stripe", kind: "payment", from_status: null, to_status: null, body: "Deposit $924.17 paid by card" },
      { actor: "Stripe", kind: "stage", from_status: "signed", to_status: "sold", body: "Deposit paid" },
    ]), "a payment and a stage event, both by Stripe", JSON.stringify(eventsA));

    console.log("step 6: the same delivery again");
    check((await markStripeDepositPaid({ depositId: depositA, sessionId: "cs_verify_A", paymentIntentId: "pi_verify_A", amountCents: 92417 })) === null,
      "a duplicate delivery answers null", "paid again");
    check(same(await depositRows(vA), rowsA) && same(await events(A), eventsA), "rows and events are unchanged", "changed");

    console.log("step 7: expiry after payment");
    check(!(await expireDeposit("cs_verify_A")), "expiring a paid session changes nothing", "expired it");
    check((await claimStripeDeposit({ leadId: A, versionId: vA, amountCents: 92417 })) === null, "a paid deposit cannot be claimed again", "claimed");

    console.log("step 8: depositState");
    const stateA = await depositState(A);
    check(stateA !== null && stateA.jobStatus === "sold" && stateA.versionId === vA && stateA.soldCents === 184833 &&
        stateA.amountCents === 92417 && stateA.paid?.id === depositA && stateA.pending === null && stateA.refunded === null,
      "depositState reads A back", JSON.stringify(stateA));

    console.log("step 9: recorded by hand while a card checkout is open");
    const pendingB = await claimStripeDeposit({ leadId: B, versionId: vB, amountCents: 50000 });
    if (!pendingB) throw new Error("setup: B's claim failed");
    await attachSession(pendingB.id, "cs_verify_B");
    const recorded = await recordDepositPayment({ leadId: B, versionId: vB, amountCents: 49000, method: "check", actor: ACTOR });
    check(recorded !== null, "recordDepositPayment answers a deposit", "null");
    const rowsB = await depositRows(vB);
    check(same(rowsB.map((r) => [r.method, r.status, r.amount_cents, r.recorded_by, r.paid]).sort(), [
      ["check", "paid", 49000, ACTOR, true], ["stripe", "expired", 50000, null, false],
    ].sort()), "the card row expired and one check row is paid", JSON.stringify(rowsB));
    check(same(await leadRow(B), { status: "sold", deposit_cents: 49000, sold_cents: 100000, lost_reason: null }),
      "B is sold with deposit_cents 49000", JSON.stringify(await leadRow(B)));
    check(same(await events(B), [
      { actor: ACTOR, kind: "payment", from_status: null, to_status: null, body: "Deposit $490 received by check" },
      { actor: ACTOR, kind: "stage", from_status: "signed", to_status: "sold", body: "Deposit recorded" },
    ]), "a payment and a stage event, both by the owner", JSON.stringify(await events(B)));
    check((await markStripeDepositPaid({ depositId: pendingB.id, sessionId: "cs_verify_B", paymentIntentId: "pi_verify_B", amountCents: 50000 })) === null,
      "the card payment that lands anyway matches nothing", "paid twice");
    check((await depositRows(vB)).filter((r) => r.status === "paid").length === 1, "still one paid deposit for B", JSON.stringify(await depositRows(vB)));

    console.log("step 10: the unique indexes");
    const secondPaid = await sql`
      insert into deposits (lead_id, dc_quote_version_id, amount_cents, method, status, paid_at)
      values (${B}, ${vB}, 1, 'cash', 'paid', now())`.then(() => "inserted", failure);
    check(secondPaid === "23505:deposits_one_paid_per_version", "a second paid deposit on one version is refused", secondPaid);
    await sql`insert into deposits (lead_id, dc_quote_version_id, amount_cents, method, status) values (${D}, ${vD}, 1000, 'stripe', 'pending')`;
    const secondPending = await sql`
      insert into deposits (lead_id, dc_quote_version_id, amount_cents, method, status)
      values (${D}, ${vD}, 1000, 'stripe', 'pending')`.then(() => "inserted", failure);
    check(secondPending === "23505:deposits_one_pending_per_version", "a second pending deposit on one version is refused", secondPending);

    console.log("step 11: a stale checkout");
    await sql`update deposits set created_at = now() - interval '24 hours' where dc_quote_version_id = ${vD}`;
    check((await expireStaleDeposits(vD)) === 1, "expireStaleDeposits expires the day-old pending row", "not 1");
    check((await depositRows(vD))[0].status === "expired", "D's row is expired", JSON.stringify(await depositRows(vD)));

    console.log("step 12: the deposits checks");
    for (const [label, statement, expected] of [
      ["a bad method", sql`insert into deposits (lead_id, dc_quote_version_id, amount_cents, method, status) values (${D}, ${vD}, 1, 'bitcoin', 'expired')`, "23514:deposits_method_check"],
      ["a zero amount", sql`insert into deposits (lead_id, dc_quote_version_id, amount_cents, method, status) values (${D}, ${vD}, 0, 'cash', 'expired')`, "23514:deposits_amount_check"],
      ["a paid row with no paid_at", sql`insert into deposits (lead_id, dc_quote_version_id, amount_cents, method, status) values (${D}, ${vD}, 5, 'cash', 'paid')`, "23514:deposits_paid_at_check"],
    ] as const) {
      const answer = await statement.then(() => "inserted", failure);
      check(answer === expected, `${label} is refused`, answer);
    }

    console.log("step 13: cancel and refund");
    const beforeCancel = await depositState(A);
    check(await cancelDeposit({ leadId: A, deposit: beforeCancel!.paid!, actor: ACTOR }), "cancelDeposit answers true", "false");
    const refundedA = await depositRows(vA);
    check(same(refundedA.map((r) => [r.status, r.paid, r.refunded]), [["refunded", true, true]]), "A's deposit is refunded", JSON.stringify(refundedA));
    const [versionA] = await sql`select status, (cancelled_at is not null) as cancelled from dc_quote_versions where id = ${vA}`;
    check(same(versionA, { status: "cancelled", cancelled: true }), "A's version is cancelled", JSON.stringify(versionA));
    check(same(await leadRow(A), { status: "lost", deposit_cents: null, sold_cents: 184833, lost_reason: "Cancelled — deposit refunded" }),
      "A is lost, deposit_cents cleared", JSON.stringify(await leadRow(A)));
    const cancelEvents = (await events(A)).slice(2);
    check(same(cancelEvents, [
      { actor: ACTOR, kind: "payment", from_status: null, to_status: null, body: "Deposit $924.17 refunded to the client's card" },
      { actor: ACTOR, kind: "stage", from_status: "sold", to_status: "lost", body: "Cancelled — deposit refunded" },
    ]), "a payment and a stage event for the cancellation", JSON.stringify(cancelEvents));
    check(!(await cancelDeposit({ leadId: A, deposit: beforeCancel!.paid!, actor: ACTOR })), "cancelling again answers false", "true");

    console.log("step 14: one offered version per job");
    await sql`update dc_quote_versions set status = 'offered' where id = ${vC1}`;
    const twoOffered = await sql`update dc_quote_versions set status = 'offered' where id = ${vC2}`.then(() => "updated", failure);
    check(twoOffered === "23P01:dc_quote_versions_one_offered", "a second offered version fails at commit", twoOffered);
    await sql`
      with retired as (update dc_quote_versions set status = 'superseded' where id = ${vC1} returning id)
      update dc_quote_versions set status = 'offered' where id = ${vC2} and exists (select 1 from retired)`;
    const statuses = await sql`select id, status from dc_quote_versions where lead_id = ${C} order by version`;
    check(same(statuses.map((r) => r.status), ["superseded", "offered"]), "superseding and offering in one statement succeeds", JSON.stringify(statuses));

    console.log("step 15: stages and kinds");
    for (const status of ["approved", "signed", "measure"]) await sql`update leads set status = ${status} where id = ${C}`;
    await sql`insert into job_events (lead_id, actor, kind, body) values (${C}, ${ACTOR}, 'payment', 'verify')`;
    const bogus = await sql`update leads set status = 'bogus' where id = ${C}`.then(() => "updated", failure);
    check(bogus === "23514:leads_status_check", "a stage outside the list is refused", bogus);

    console.log("step 16: deleting a job with deposits");
    check((await deleteJob(A, ACTOR)) === "deleted", "deleteJob(A) answers deleted", "not deleted");
    check((await sql`select id from deposits where lead_id = ${A}`).length === 0, "A's deposits went with it", "rows left");

    console.log("\nPASSED: the deposit flow's SQL holds against a real database. Manual run, not coverage.\n");
  } finally {
    // Step 17. Deposits first: they reference versions with no on-delete action.
    const ids = await scriptLeads();
    if (ids.length > 0) {
      await sql`delete from deposits where lead_id = any(${ids})`;
      await sql`delete from dc_quote_versions where lead_id = any(${ids})`;
      await sql`delete from job_files where lead_id = any(${ids})`;
      await sql`delete from job_events where lead_id = any(${ids})`;
      await sql`delete from leads where id = any(${ids})`;
    }
  }
});
```

- [ ] **Step 2: The Stripe stub and the e2e server's Stripe settings**

`e2e/fixtures/stripe-stub.ts`:

```ts
import { createServer, type ServerResponse } from "node:http";
import Stripe from "stripe";

export const STRIPE_STUB_PORT = 3198;
/** The values playwright.config.ts gives the app server. A mismatch fails every Stripe call loudly (401). */
export const STRIPE_E2E_KEY = "sk_test_e2e";
export const STRIPE_E2E_WEBHOOK_SECRET = "whsec_e2e_test_secret";

export type StubSession = {
  id: string; status: "open" | "complete" | "expired"; amount: number; depositId: string; leadId: string;
  email: string; successUrl: string; url: string; paymentIntent: string;
};

const json = (res: ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));

/** A Checkout Session as Stripe's API and its events present one. */
export const sessionObject = (s: StubSession) => ({
  id: s.id, object: "checkout.session", status: s.status, url: s.status === "open" ? s.url : null,
  amount_total: s.amount, currency: "usd", customer_email: s.email, success_url: s.successUrl,
  payment_status: s.status === "complete" ? "paid" : "unpaid",
  payment_intent: s.status === "complete" ? s.paymentIntent : null,
  metadata: { depositId: s.depositId, leadId: s.leadId },
});

/**
 * Stands in for api.stripe.com (STRIPE_API_URL in playwright.config.ts). It creates Checkout Sessions — one per
 * Idempotency-Key, replayed as Stripe does — retrieves and expires them, and records refunds. The checkout
 * "page" it hands out is a plain page on the stub: a test pays by completing the session and posting a
 * signed webhook (signedEvent). No request ever reaches Stripe.
 */
export async function startStripeStub(port = STRIPE_STUB_PORT) {
  const sessions = new Map<string, StubSession>();
  const byKey = new Map<string, string>();
  const creates: URLSearchParams[] = [];
  const refunds: { paymentIntent: string; idempotencyKey: string | null }[] = [];
  let count = 0;
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const path = (req.url ?? "").split("?")[0];
      if (req.method === "GET" && path.startsWith("/pay/")) {
        res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>Stub checkout</title><h1>Stub checkout</h1>");
        return;
      }
      if (req.headers.authorization !== `Bearer ${STRIPE_E2E_KEY}`) {
        json(res, 401, { error: { type: "authentication_error", message: "Invalid API key" } });
        return;
      }
      const form = new URLSearchParams(raw);
      const key = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : null;
      if (req.method === "POST" && path === "/v1/checkout/sessions") {
        creates.push(form);
        const replay = key ? byKey.get(key) : undefined;
        if (replay) {
          json(res, 200, sessionObject(sessions.get(replay)!));
          return;
        }
        count += 1;
        const id = `cs_test_e2e_${Date.now()}_${count}`;
        const session: StubSession = {
          id, status: "open", amount: Number(form.get("line_items[0][price_data][unit_amount]")),
          depositId: form.get("metadata[depositId]") ?? "", leadId: form.get("metadata[leadId]") ?? "",
          email: form.get("customer_email") ?? "", successUrl: form.get("success_url") ?? "",
          url: `http://127.0.0.1:${port}/pay/${id}`, paymentIntent: `pi_test_e2e_${Date.now()}_${count}`,
        };
        sessions.set(id, session);
        if (key) byKey.set(key, id);
        json(res, 200, sessionObject(session));
        return;
      }
      const match = /^\/v1\/checkout\/sessions\/([^/]+)(\/expire)?$/.exec(path);
      if (match) {
        const session = sessions.get(match[1]);
        if (!session) {
          json(res, 404, { error: { type: "invalid_request_error", message: `No such checkout.session: ${match[1]}` } });
          return;
        }
        if (match[2]) {
          if (session.status !== "open") {
            json(res, 400, { error: { type: "invalid_request_error", message: "Only open Checkout Sessions can be expired." } });
            return;
          }
          session.status = "expired";
        }
        json(res, 200, sessionObject(session));
        return;
      }
      if (req.method === "POST" && path === "/v1/refunds") {
        refunds.push({ paymentIntent: form.get("payment_intent") ?? "", idempotencyKey: key });
        json(res, 200, { id: `re_test_e2e_${refunds.length}`, object: "refund", status: "succeeded", payment_intent: form.get("payment_intent") });
        return;
      }
      json(res, 404, { error: { type: "invalid_request_error", message: `Unrecognized request URL (${req.method}: ${path})` } });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => reject(error.code === "EADDRINUSE"
      ? new Error(`Stripe stub: port ${port} is already in use. Stop whatever holds it (a previous e2e run?) and retry.`)
      : error));
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return {
    sessions, creates, refunds,
    /** The client paid: the session completes, as Stripe marks it before sending checkout.session.completed. */
    complete(id: string): StubSession {
      const session = sessions.get(id)!;
      session.status = "complete";
      return session;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** A Stripe event for a session, signed with the e2e webhook secret exactly as Stripe signs one. */
export function signedEvent(type: string, session: StubSession): { body: string; signature: string } {
  const body = JSON.stringify({
    id: `evt_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`, object: "event", type,
    data: { object: sessionObject(session) },
  });
  const signature = new Stripe(STRIPE_E2E_KEY).webhooks.generateTestHeaderString({ payload: body, secret: STRIPE_E2E_WEBHOOK_SECRET });
  return { body, signature };
}
```

`playwright.config.ts` — in the `env` object, after `GOOGLE_GEOCODING_KEY: "",`:

```ts
          // Stripe goes to the local stub dc-quote.spec.ts starts (e2e/fixtures/stripe-stub.ts), never to Stripe.
          // The same three values are exported by the stub; card payments are proved by signed test webhooks.
          STRIPE_SECRET_KEY: "sk_test_e2e",
          STRIPE_WEBHOOK_SECRET: "whsec_e2e_test_secret",
          STRIPE_API_URL: "http://127.0.0.1:3198",
```

(Only `dc-quote.spec.ts` starts the stub, and it runs serially and desktop-only, so port 3198 is never contended.)

- [ ] **Step 3: Rewrite the DC e2e flow**

`e2e/dc-quote.spec.ts`:

1. Imports: add `import { signedEvent, startStripeStub } from "./fixtures/stripe-stub";`. Constants: after `BYSTANDER` add

```ts
// The two payment paths each get a seeded Signed job and their own customer.
const PAY_CUSTOMER = `e2e-dc-pay-${STAMP}@example.com`;
const REFUND_CUSTOMER = `e2e-dc-refund-${STAMP}@example.com`;
```

2. After `lead()` add:

```ts
/** A Signed job with a signed DC version at `totalCents`, as signing leaves one. The Dealer Copy row has no blob. */
async function seedSigned(name: string, email: string, totalCents: number): Promise<{ id: string; versionId: string }> {
  const seeded = await lead(name, email, "signed");
  await sql()`update leads set sold_cents = ${totalCents} where id = ${seeded.id}`;
  const [file] = await sql()`insert into job_files (lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname, doc_type)
    values (${seeded.id}, 'Direct Connect', 'document', 'DEALER COPY seeded.html', 'text/html', 1,
            ${`e2e/${seeded.id}/seeded-${STAMP}.html`}, 'dealer_copy') returning id`;
  const versionId = randomUUID();
  await sql()`insert into dc_quote_versions (id, lead_id, version, dc_quote_no, po_reference, source_file_id, source_sha256, status,
      dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents, client_total_cents, products_cents, install_cents, signed_at)
    values (${versionId}, ${seeded.id}, 1, ${`E2E${STAMP}`}, ${formatProjectNo(seeded.projectNo)}, ${file.id}, ${"0".repeat(64)}, 'signed',
            1, 0, 0, 1, ${totalCents}, ${totalCents}, 0, now())`;
  return { id: seeded.id, versionId };
}
```

3. In the two early tests, `{ name: "Send contract" }` becomes `{ name: "Send quote" }` (lines 265 and 304).
4. `afterAll`: before `delete from dc_quote_versions …` add
   ``await sql()`delete from deposits where lead_id in (select id from leads where name like 'E2E DC %')`;``
5. Replace the whole `test.describe("send, sign and the release gate", …)` block with:

```ts
test.describe("quote, approve, sign, deposit, measure — and the release gate", () => {
  // Sending builds PDFs from the terms in Blob and stores them there, and signing fingerprints the stored
  // bytes, so this needs a real blob store. A missing token fails loudly rather than skipping.
  let stub: Awaited<ReturnType<typeof startStripeStub>>;
  test.beforeAll(async () => {
    if (!process.env.E2E_BLOB_READ_WRITE_TOKEN) {
      throw new Error(
        "E2E_BLOB_READ_WRITE_TOKEN is not set. Send, sign and the release gate must actually run — " +
          "set the token against the test blob store rather than skipping them.",
      );
    }
    stub = await startStripeStub();
  });
  test.afterAll(async () => { await stub?.close(); });

  const waivedTotal = () => expectedTotal - quote.handlingFeeCents;
  const deposit = () => Math.round(waivedTotal() / 2);
  const quoteName = () => `Quote ${formatProjectNo(job.projectNo)} v1.pdf`;
  const contractName = () => `Contract ${formatProjectNo(job.projectNo)} v1.pdf`;
  let quoteFileId = "";
  const webhook = async (request: APIRequestContext, type: string, session: Parameters<typeof signedEvent>[1]) => {
    const event = signedEvent(type, session);
    return request.post("/api/stripe/webhook", { data: event.body, headers: { "stripe-signature": event.signature, "content-type": "application/json" } });
  };

  test("with the starter terms, Send quote shares the reviewed total as a quote, with no contract yet, and the job moves to Quoted", async ({ page }) => {
    await signInOwner(page);
    await page.goto("/admin/documents");
    await page.getByRole("button", { name: "Start from the Premier Shade starter terms" }).click();
    await expect(page).toHaveURL(/\/admin\/documents\/[0-9a-f-]{36}$/);
    const terms = page.getByLabel("Text");
    const [banner, ...rest] = (await terms.inputValue()).split("\n");
    expect(banner).toMatch(/^\*\*DRAFT:/);
    await terms.fill(rest.join("\n").trimStart());
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");

    const review = await quoteTab(page, job.id);
    await expect(review.getByRole("list", { name: "Before you can send" })).toHaveCount(0);
    await expect(stageBadge(page)).toHaveText("Appointment booked");
    await review.getByRole("button", { name: "Send quote" }).click();
    // Resend is not configured in e2e, so the quote is sent and the email is reported failed.
    await expect(review.getByRole("status")).toHaveText(
      "Quote sent, but the email to the client failed — send them their project page link yourself.",
    );

    const [version] = await sql()`select status, client_total_cents, products_cents, install_cents, quote_file_id, contract_file_id,
        offered_by, (offered_at is not null) as offered, approved_at from dc_quote_versions where id = ${versionId}`;
    expect(version).toEqual({ status: "offered", client_total_cents: waivedTotal(), products_cents: expectedProducts,
      install_cents: INSTALL_CENTS, quote_file_id: expect.any(String), contract_file_id: null, offered_by: OWNER, offered: true, approved_at: null });
    quoteFileId = version.quote_file_id as string;
    const [row] = await sql()`select status, quote_cents, sold_cents, deposit_cents from leads where id = ${job.id}`;
    expect(row).toEqual({ status: "quoted", quote_cents: waivedTotal(), sold_cents: null, deposit_cents: null });
    const [file] = await sql()`select name, doc_type, (shared_at is not null) as shared from job_files where id = ${quoteFileId}`;
    expect(file).toEqual({ name: quoteName(), doc_type: "quote", shared: true });
    expect(await sql()`select id from job_files where lead_id = ${job.id} and doc_type = 'contract'`).toHaveLength(0);

    const printed = pdfText(await fetchBytes(page, `/admin/files/${quoteFileId}`));
    expect(printed).toContain(`Quote ${formatProjectNo(job.projectNo)} · Version 1`);
    expect(printed).toContain(formatCents(waivedTotal()));
    expect(printed).not.toContain("Terms and Conditions");
    expect(printed).not.toContain("Client signature");
    await page.reload();
    await expect(stageBadge(page)).toHaveText("Quoted");
  });

  test("the customer approves, and the contract goes out at the same total and prints the terms", async ({ browser }) => {
    const customer = await customerPage(browser, CUSTOMER);
    const banner = customer.getByRole("region", { name: "Where your project stands" });
    await expect(banner.getByRole("link", { name: "Review quote" })).toHaveAttribute("href", `/project/files/${quoteFileId}`);
    await banner.getByText("Approve this quote", { exact: true }).click();
    await expect(banner.getByText("Approving accepts this quote. Your contract comes next, to read and sign.")).toBeVisible();
    await banner.getByRole("button", { name: "Yes, approve this quote" }).click();
    await expect(customer).toHaveURL(new RegExp(`/project/${job.id}\\?approved=1$`));
    await expect(customer.getByRole("status")).toContainText("Thank you — we have your approval");
    await expect(customer.getByRole("heading", { name: "Documents to sign" })).toBeVisible();
    await expect(customer.getByText("Approve this quote", { exact: true })).toHaveCount(0);

    const [version] = await sql()`select status, client_total_cents, products_cents, install_cents, quote_file_id, contract_file_id,
        offered_by, approved_by, sent_by, (approved_at is not null) as approved from dc_quote_versions where id = ${versionId}`;
    expect(version).toEqual({ status: "sent", client_total_cents: waivedTotal(), products_cents: expectedProducts, install_cents: INSTALL_CENTS,
      quote_file_id: quoteFileId, contract_file_id: expect.any(String), offered_by: OWNER, approved_by: CUSTOMER,
      sent_by: "Sent on approval", approved: true });
    const [row] = await sql()`select status, quote_cents, sold_cents from leads where id = ${job.id}`;
    expect(row).toEqual({ status: "approved", quote_cents: waivedTotal(), sold_cents: null });
    const stages = await sql()`select from_status, to_status, body, actor from job_events where lead_id = ${job.id} and kind = 'stage' order by created_at`;
    expect(stages).toEqual([
      { from_status: "visit_booked", to_status: "quoted", body: "Quote sent", actor: OWNER },
      { from_status: "quoted", to_status: "approved", body: "Approved quote version 1", actor: CUSTOMER },
    ]);
    const [file] = await sql()`select name, doc_type, (shared_at is not null) as shared, sign_marks is not null as marked
      from job_files where id = ${version.contract_file_id}`;
    expect(file).toEqual({ name: contractName(), doc_type: "contract", shared: true, marked: true });

    // The contract prints the terms template's text, fields filled.
    const drawn = pdfText(await fetchBytes(customer, `/project/files/${version.contract_file_id}`));
    expect(drawn).toContain("Terms and Conditions");
    expect(drawn).toContain("4. Your Right to Cancel");
    expect(drawn).toContain("18. Contact Us");
    expect(drawn).toContain(`Phone: ${business.phone.display}`);
    expect(drawn).toContain(formatCents(waivedTotal()));
    expect(drawn.join(" ")).not.toContain("{{");
  });
```

Then the existing signing test, renamed "the customer signs the contract, the owner sees Signed, and the order link waits for the cancellation window", unchanged except:
- `expect(row).toEqual({ status: "signed", sold_cents: waivedTotal() });`
- `await expect(stageBadge(page)).toHaveText("Signed");`
- after the stage-badge line, add:

```ts
    const signedStages = await sql()`select from_status, to_status, body from job_events where lead_id = ${job.id} and kind = 'stage' order by created_at`;
    expect(signedStages.at(-1)).toEqual({ from_status: "approved", to_status: "signed", body: "Signed contract version 1" });
    await expect(page.getByRole("region", { name: "Deposit" })).toContainText(`50% deposit due: ${formatCents(deposit())} of ${formatCents(waivedTotal())}.`);
```

Then, after it:

```ts
  test("the customer pays the deposit by card: one session, a verified webhook, Sold, and a duplicate delivery changes nothing", async ({ page, browser, request }) => {
    const customer = await customerPage(browser, CUSTOMER);
    await expect(customer.getByRole("heading", { name: "Deposit" })).toBeVisible();
    await customer.getByRole("button", { name: `Pay 50% deposit — ${formatCents(deposit())}` }).click();
    await expect(customer).toHaveURL(/^http:\/\/127\.0\.0\.1:3198\/pay\/cs_test_e2e_/);
    const sent = stub.creates.at(-1)!;
    expect(sent.get("line_items[0][price_data][unit_amount]")).toBe(String(deposit()));
    expect(sent.get("line_items[0][price_data][product_data][name]")).toBe(`50% deposit — ${formatProjectNo(job.projectNo)}`);
    expect(sent.get("customer_email")).toBe(CUSTOMER);
    expect(sent.get("success_url")).toBe(`http://127.0.0.1:3100/project/${job.id}?deposit=done`);
    const [pending] = await sql()`select id, status, amount_cents, stripe_session_id from deposits where lead_id = ${job.id}`;
    expect(pending).toMatchObject({ status: "pending", amount_cents: deposit(), id: sent.get("metadata[depositId]") });

    // Back on the page before paying: Pay again lands on the same session (Review Focus 2).
    await customer.goto(`/project/${job.id}`);
    await customer.getByRole("button", { name: `Pay 50% deposit — ${formatCents(deposit())}` }).click();
    await expect(customer).toHaveURL(new RegExp(`/pay/${pending.stripe_session_id}$`));
    expect(await sql()`select id from deposits where lead_id = ${job.id}`).toHaveLength(1);

    // The redirect alone proves nothing: before the webhook, the page says Processing.
    await customer.goto(`/project/${job.id}?deposit=done`);
    await expect(customer.getByText("Processing — we will email your receipt as soon as your payment is confirmed.")).toBeVisible();

    const paid = stub.complete(pending.stripe_session_id as string);
    expect((await webhook(request, "checkout.session.completed", paid)).status()).toBe(200);
    const [row] = await sql()`select method, status, amount_cents, recorded_by, stripe_session_id, stripe_payment_intent_id,
        (paid_at is not null) as paid, (refunded_at is not null) as refunded from deposits where lead_id = ${job.id}`;
    expect(row).toEqual({ method: "stripe", status: "paid", amount_cents: deposit(), recorded_by: null,
      stripe_session_id: paid.id, stripe_payment_intent_id: paid.paymentIntent, paid: true, refunded: false });
    const [lead] = await sql()`select status, sold_cents, deposit_cents from leads where id = ${job.id}`;
    expect(lead).toEqual({ status: "sold", sold_cents: waivedTotal(), deposit_cents: deposit() });
    const paymentEvents = await sql()`select actor, kind, from_status, to_status, body from job_events
      where lead_id = ${job.id} and (kind = 'payment' or (kind = 'stage' and to_status = 'sold')) order by kind`;
    expect(paymentEvents).toEqual([
      { actor: "Stripe", kind: "payment", from_status: null, to_status: null, body: `Deposit ${formatCents(deposit())} paid by card` },
      { actor: "Stripe", kind: "stage", from_status: "signed", to_status: "sold", body: "Deposit paid" },
    ]);

    // Stripe delivers again, and an expiry arrives late: nothing changes (Review Focus 1).
    expect((await webhook(request, "checkout.session.completed", paid)).status()).toBe(200);
    expect((await webhook(request, "checkout.session.expired", paid)).status()).toBe(200);
    expect(await sql()`select status from deposits where lead_id = ${job.id}`).toEqual([{ status: "paid" }]);
    expect(await sql()`select id from job_events where lead_id = ${job.id} and kind = 'payment'`).toHaveLength(1);
    // A body that does not verify is refused.
    const forged = await request.post("/api/stripe/webhook", { data: signedEvent("checkout.session.completed", paid).body,
      headers: { "stripe-signature": "t=1,v1=deadbeef", "content-type": "application/json" } });
    expect(forged.status()).toBe(400);

    await customer.goto(`/project/${job.id}?deposit=done`);
    await expect(customer.getByText("Payment received — thank you.")).toBeVisible();
    await expect(customer.getByRole("button", { name: /Pay 50% deposit/ })).toHaveCount(0);

    await signInOwner(page);
    await quoteTab(page, job.id);
    await expect(stageBadge(page)).toHaveText("Sold");
    await expect(page.getByRole("region", { name: "Deposit" })).toContainText(`Deposit ${formatCents(deposit())} paid by card on`);
  });

  test("confirming the measure appointment moves the Sold job to Official measure", async ({ page }) => {
    await signInOwner(page);
    await page.goto(`/admin/jobs/${job.id}`);
    const card = page.getByRole("region", { name: "Appointments" });
    await card.getByRole("button", { name: "Schedule" }).click();
    const modal = page.getByRole("dialog", { name: "Schedule" });
    await modal.getByLabel("Date and time").fill("2027-01-12T10:00");
    await modal.getByRole("radio", { name: "Measure" }).check();
    await modal.getByRole("button", { name: "Save", exact: true }).click();
    await card.getByRole("button", { name: "Confirm schedule" }).click();
    await expect(card.getByText("Confirmed", { exact: true })).toBeVisible();
    await page.reload();
    await expect(stageBadge(page)).toHaveText("Official measure");
    const [row] = await sql()`select status, sold_cents, deposit_cents from leads where id = ${job.id}`;
    expect(row).toEqual({ status: "measure", sold_cents: waivedTotal(), deposit_cents: deposit() });
    const [stage] = await sql()`select from_status, to_status, body from job_events where lead_id = ${job.id} and kind = 'stage' order by created_at desc limit 1`;
    expect(stage).toEqual({ from_status: "sold", to_status: "measure", body: "Measure appointment confirmed" });
  });

  test("Payment received closes the client's open card checkout, records the check, and a late card payment is not recorded twice", async ({ page, browser, request }) => {
    const seeded = await seedSigned(`${NAME} Pay`, PAY_CUSTOMER, 250_001);
    const customer = await customerPage(browser, PAY_CUSTOMER);
    await customer.getByRole("button", { name: `Pay 50% deposit — ${formatCents(125_001)}` }).click();
    await expect(customer).toHaveURL(/\/pay\/cs_test_e2e_/);
    const [pending] = await sql()`select stripe_session_id from deposits where lead_id = ${seeded.id} and status = 'pending'`;
    expect(stub.sessions.get(pending.stripe_session_id as string)?.status).toBe("open");

    await signInOwner(page);
    await page.goto(`/admin/jobs/${seeded.id}?tab=quote`);
    const panel = page.getByRole("region", { name: "Deposit" });
    await panel.getByRole("button", { name: "Payment received" }).click();
    await expect(panel.getByLabel("Deposit received")).toHaveValue("1250.01");
    await panel.getByLabel("Deposit received").fill("1250.00");
    await panel.getByLabel("Paid by").selectOption("check");
    await panel.getByRole("button", { name: "Record payment" }).click();
    await expect(panel.getByRole("status")).toHaveText("Deposit recorded. The job is Sold.");
    expect(stub.sessions.get(pending.stripe_session_id as string)?.status).toBe("expired");

    const rows = await sql()`select method, status, amount_cents, recorded_by, stripe_session_id, stripe_payment_intent_id,
        (paid_at is not null) as paid, (refunded_at is not null) as refunded from deposits where lead_id = ${seeded.id} order by method`;
    expect(rows).toEqual([
      { method: "check", status: "paid", amount_cents: 125_000, recorded_by: OWNER, stripe_session_id: null, stripe_payment_intent_id: null, paid: true, refunded: false },
      { method: "stripe", status: "expired", amount_cents: 125_001, recorded_by: null, stripe_session_id: pending.stripe_session_id, stripe_payment_intent_id: null, paid: false, refunded: false },
    ]);
    const [row] = await sql()`select status, sold_cents, deposit_cents from leads where id = ${seeded.id}`;
    expect(row).toEqual({ status: "sold", sold_cents: 250_001, deposit_cents: 125_000 });
    const events = await sql()`select actor, kind, from_status, to_status, body from job_events where lead_id = ${seeded.id} and kind in ('payment','stage') order by kind`;
    expect(events).toEqual([
      { actor: OWNER, kind: "payment", from_status: null, to_status: null, body: "Deposit $1,250 received by check" },
      { actor: OWNER, kind: "stage", from_status: "signed", to_status: "sold", body: "Deposit recorded" },
    ]);

    // Review Focus 3: the card payment completes anyway. It is not recorded as a second deposit.
    const late = stub.complete(pending.stripe_session_id as string);
    expect((await webhook(request, "checkout.session.completed", late)).status()).toBe(200);
    expect(await sql()`select id from deposits where lead_id = ${seeded.id} and status = 'paid'`).toHaveLength(1);
    const [after] = await sql()`select status, deposit_cents from leads where id = ${seeded.id}`;
    expect(after).toEqual({ status: "sold", deposit_cents: 125_000 });
  });

  test("Cancel & refund refunds the card in full through Stripe, cancels the contract and loses the job", async ({ page }) => {
    const seeded = await seedSigned(`${NAME} Refund`, REFUND_CUSTOMER, 300_000);
    const depositId = randomUUID();
    await sql()`insert into deposits (id, lead_id, dc_quote_version_id, amount_cents, method, status, stripe_session_id, stripe_payment_intent_id, paid_at)
      values (${depositId}, ${seeded.id}, ${seeded.versionId}, 150000, 'stripe', 'paid', ${`cs_seeded_${STAMP}`}, ${`pi_seeded_${STAMP}`}, now())`;
    await sql()`update leads set status = 'sold', deposit_cents = 150000 where id = ${seeded.id}`;

    await signInOwner(page);
    await page.goto(`/admin/jobs/${seeded.id}?tab=quote`);
    const panel = page.getByRole("region", { name: "Deposit" });
    await expect(panel).toContainText("Deposit $1,500 paid by card on");
    await panel.getByRole("button", { name: "Cancel & refund" }).click();
    await expect(panel.getByText(/^The client is inside the 3-business-day cancellation window, which ends at the end of /)).toBeVisible();
    await panel.getByRole("button", { name: "Yes, cancel and refund" }).click();
    await expect(panel.getByRole("status")).toHaveText("Cancelled and refunded. The job is Lost.");

    expect(stub.refunds).toContainEqual({ paymentIntent: `pi_seeded_${STAMP}`, idempotencyKey: `refund-${depositId}` });
    const [stored] = await sql()`select status, amount_cents, (refunded_at is not null) as refunded from deposits where id = ${depositId}`;
    expect(stored).toEqual({ status: "refunded", amount_cents: 150000, refunded: true });
    const [version] = await sql()`select status, (cancelled_at is not null) as cancelled from dc_quote_versions where id = ${seeded.versionId}`;
    expect(version).toEqual({ status: "cancelled", cancelled: true });
    const [row] = await sql()`select status, sold_cents, deposit_cents, lost_reason from leads where id = ${seeded.id}`;
    expect(row).toEqual({ status: "lost", sold_cents: 300000, deposit_cents: null, lost_reason: "Cancelled — deposit refunded" });
    const events = await sql()`select actor, kind, from_status, to_status, body from job_events where lead_id = ${seeded.id} and kind in ('payment','stage') order by kind`;
    expect(events).toEqual([
      { actor: OWNER, kind: "payment", from_status: null, to_status: null, body: "Deposit $1,500 refunded to the client's card" },
      { actor: OWNER, kind: "stage", from_status: "sold", to_status: "lost", body: "Cancelled — deposit refunded" },
    ]);
  });
```

and finally the existing "gate: another customer's quoted job does not move and never sees this contract" test, unchanged, closing the describe. Add `type APIRequestContext` to the `@playwright/test` import.

- [ ] **Step 4: Lint and list the e2e tests**

```bash
npx eslint e2e scripts/verify-deposit-flow.ts scripts/verify-deposit-flow.config.mts playwright.config.ts
npx tsc --noEmit
npx playwright test e2e/dc-quote.spec.ts e2e/portal.spec.ts --list
```

Expected: exit 0, clean, and the list shows the new tests (desktop only).

- [ ] **Step 5: A Neon test branch (ask the owner first)**

Ask the owner for OK to create a branch. Then (bash, `$SCRATCH` = the session scratchpad):

```bash
npx -y neonctl@latest branches create --project-id misty-fire-51038688 --name e2e-deposit-flow-$(date +%Y%m%d) --parent main --output json > "$SCRATCH/branch.json"
node -e "const b=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(b.branch.id)" "$SCRATCH/branch.json"
npx -y neonctl@latest connection-string <branch-id> --project-id misty-fire-51038688 --pooled > "$SCRATCH/e2e-db-url.txt"
grep -q ep-cold-term "$SCRATCH/e2e-db-url.txt" && echo "REFUSE: production" || echo "branch ok"
export E2E_TEST_ENDPOINT="$(node -e "const u=new URL(require('fs').readFileSync(process.argv[1],'utf8').trim());process.stdout.write(u.hostname.split('.')[0].replace(/-pooler$/,''))" "$SCRATCH/e2e-db-url.txt")"
case "$E2E_TEST_ENDPOINT" in ep-*) echo "endpoint named";; *) echo "REFUSE: no endpoint";; esac
```

Never `cat` the URL file. (`scripts/migrate.mjs` needs a `.env.local` to exist — create an empty one if missing and delete it afterwards.)

- [ ] **Step 6: Migration 030, twice, and again on a database holding the new values**

```bash
MIGRATE_DATABASE_URL="$(cat "$SCRATCH/e2e-db-url.txt")" node scripts/migrate.mjs > "$SCRATCH/migrate-1.log"
MIGRATE_DATABASE_URL="$(cat "$SCRATCH/e2e-db-url.txt")" node scripts/migrate.mjs > "$SCRATCH/migrate-2.log"
tail -3 "$SCRATCH/migrate-2.log"
```

Both succeed (the logs print the host, not the password). Then write `$SCRATCH/hold-new-values.mjs`:

```js
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(readFileSync(process.argv[2], "utf8").trim());
const mode = process.argv[3];
if (mode === "seed") {
  const [lead] = await sql`insert into leads (name, phone, city, source, status) values ('HOLD Deposit Flow', '7025550197', 'Henderson', 'phone', 'measure') returning id`;
  await sql`insert into job_events (lead_id, actor, kind, body) values (${lead.id}, 'hold', 'payment', 'hold')`;
  const [file] = await sql`insert into job_files (lead_id, uploaded_by, kind, name, content_type, size_bytes, blob_pathname, doc_type)
    values (${lead.id}, 'hold', 'document', 'hold.html', 'text/html', 1, 'hold/hold.html', 'dealer_copy') returning id`;
  await sql`insert into dc_quote_versions (id, lead_id, version, dc_quote_no, po_reference, source_file_id, source_sha256, status,
    dealer_subtotal_cents, handling_fee_cents, oversized_fee_cents, dealer_total_cents)
    values (gen_random_uuid(), ${lead.id}, 1, 'HOLD', 'PSS-0000', ${file.id}, ${"0".repeat(64)}, 'offered', 1, 0, 0, 1)`;
  console.log("seeded a measure lead, a payment event and an offered version");
} else {
  await sql`delete from dc_quote_versions where lead_id in (select id from leads where name = 'HOLD Deposit Flow')`;
  await sql`delete from leads where name = 'HOLD Deposit Flow'`;
  console.log("removed");
}
```

```bash
node "$SCRATCH/hold-new-values.mjs" "$SCRATCH/e2e-db-url.txt" seed
MIGRATE_DATABASE_URL="$(cat "$SCRATCH/e2e-db-url.txt")" node scripts/migrate.mjs > "$SCRATCH/migrate-3.log"
node "$SCRATCH/hold-new-values.mjs" "$SCRATCH/e2e-db-url.txt" clean
```

The third run must succeed: every older copy of the three lists (002, 003, 004, 011, 012, 019, 021, 024, 026) accepts rows holding `measure`, `payment` and `offered`.

- [ ] **Step 7: Run every new statement for real**

```bash
E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" npx vitest run --config scripts/verify-deposit-flow.config.mts
E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" npx vitest run --config scripts/verify-dc-quote-import.config.mts
E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" npx vitest run --config scripts/verify-contract-signing.config.mts
```

All three print `PASSED` (quote the lines). Between them they execute: `claimStripeDeposit`, `attachSession`, `markStripeDepositPaid`, `recordDepositPayment`, `expireDeposit`, `expireStaleDeposits`, `cancelDeposit`, `depositState` (deposits script); `sendQuote`, `approveDcQuote`, `sendContract` (DC import script); `recordSignature`'s Signed step (both signing scripts).

- [ ] **Step 8: Falsify the verify script**

Delete `and status = 'pending'` from `markStripeDepositPaid`'s `paid` CTE and re-run the deposits script → it must fail at step 6 (the duplicate delivery pays again or hits the one-paid index). Restore and re-run green.

- [ ] **Step 9: End to end against `next start`**

```bash
npx next build
E2E_POSTGRES_URL="$(cat "$SCRATCH/e2e-db-url.txt")" E2E_TEST_ENDPOINT="$E2E_TEST_ENDPOINT" E2E_BLOB_READ_WRITE_TOKEN="<test blob token, from the owner's env, never printed>" \
  npx playwright test e2e/dc-quote.spec.ts e2e/portal.spec.ts e2e/stages.spec.ts e2e/admin.spec.ts --project=desktop
```

Run in the foreground; `playwright.config.ts` starts `next start` on 127.0.0.1:3100 with the branch URL and the Stripe stub settings. Reconcile the totals (passed / failed / did not run) and quote them. Then falsify once: temporarily change `recordSignature`'s target back to `'sold'`, rebuild, and re-run `e2e/dc-quote.spec.ts` → the signing test must fail on `status: "signed"`. Restore, rebuild, re-run green.

- [ ] **Step 10: Clean up and commit**

Delete the Neon branch (`npx -y neonctl@latest branches delete <branch-id> --project-id misty-fire-51038688`), `$SCRATCH/e2e-db-url.txt`, `$SCRATCH/branch.json` and any temporary `.env.local`.

```bash
git add scripts/verify-deposit-flow.ts scripts/verify-deposit-flow.config.mts e2e/fixtures/stripe-stub.ts e2e/dc-quote.spec.ts playwright.config.ts
git commit -m "test: the deposit flow end to end on a real database, Stripe stubbed and webhooks signed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0122UD6P8agX8gRaojNYtEiL"
```

---

## Rollout (owner approval required for each; not code)

1. Whole-branch review of `feat/deposit-flow`.
2. The owner adds `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (**test mode**) in Vercel (Production and Preview), and registers the webhook endpoint `https://premiershadesolutions.com/api/stripe/webhook` in the Stripe dashboard for exactly `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired`. Do not set `STRIPE_API_URL` anywhere but e2e.
3. Production migration 030 **before** the push (main auto-deploys): `MIGRATE_DATABASE_URL` from a file, confirm it targets `ep-cold-term` without printing it, run `node scripts/migrate.mjs`, then read-only verify: `select conname from pg_constraint where conname in ('dc_quote_versions_one_offered','dc_quote_versions_status_check','deposits_method_check','deposits_status_check','deposits_amount_check','deposits_paid_at_check','leads_status_check','job_events_kind_check')` returns all eight, and `select to_regclass('deposits')` is not null.
4. Merge `feat/deposit-flow` to `main` after 029 (already live) and push. Tell pss-dd (signatures) and pss-7a (measure quantity, 028) that `leads_status_check`, `job_events_kind_check` and `dc_quote_versions_status_check` now carry the new lists — any migration of theirs that redefines one must copy the full list from 030.
5. One real test-mode deposit end to end on production (a test job: Send quote → approve → sign → pay with a Stripe test card → Sold → confirm measure), then Cancel & refund it; check the Stripe dashboard shows the payment and the refund. Only then switch both Vercel variables to live keys and re-register the webhook in live mode.
