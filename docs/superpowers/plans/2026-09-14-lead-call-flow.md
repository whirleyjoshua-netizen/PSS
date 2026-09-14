# Lead Call Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One tap from the new-lead email to the lead, one tap from the lead to a call screen that records interest, windows, budget tier and notes and moves the job to Visit booked or Contacted by the call's outcome.

**Architecture:** A budget tier column (migration 006) and a tracker link in the owners' new-lead email. A pure module decides the stage move and writes the call summary; one server-only function saves answers, stage move and activity in a single statement. A call screen at `/admin/jobs/<id>/call` and a Call button (phone: dials and opens the screen; computer: opens the screen) on the job page and the board panel.

**Tech Stack:** Next.js 16.3 App Router (async `params`, Server Actions, `useActionState`), Neon Postgres via `@neondatabase/serverless`, Resend, zod 4, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-14-lead-call-flow-design.md`

## Global Constraints

- Call outcomes are exactly `booked`, `talked`, `no_answer`. Button labels: "Booked a visit", "Talked, no visit yet", "No answer"; the booked submit reads "Save booked visit".
- Stage moves only forward: `booked` → `visit_booked` only from `new` or `contacted`; `talked` → `contacted` only from `new`; `no_answer` never moves. Later stages and `lost` keep their stage.
- Budget tiers stored as `value` / `mid` / `premium`, shown as "Value" / "Mid-range" / "Premium"; empty shows "—". Budget never appears on customer pages.
- Interest options are the product category names from `content/products.ts` (`categories[].name`): Blinds, Shades, Shutters, Outdoor Shading, Motorization. Window options are `WINDOW_COUNTS` from `lib/leads/schema.ts`.
- Call summary: `Call: <outcome text>` then non-empty parts joined with " · ": interest names joined ", ", `<windows> windows`, budget label. Outcome text: `booked visit <Wed 10/14, 2:00 PM>` (Las Vegas time) / `talked, no visit yet` / `no answer`. Notes, if any, go on the next line.
- Tracker link line: `Open in tracker: <origin>/admin/jobs/<id>`, origin = `(process.env.ADMIN_BASE_URL || business.domain)` with trailing slashes stripped. Never the request Host.
- Admin styling (from the admin redesign): colors only from `app/globals.css` `@theme` tokens, no color literals; icons via `<Icon name="…" />` from `components/admin/icons.tsx` (the `phone` glyph exists), decorative, and every control keeps a text label.
- Migration 006 follows `scripts/migrate.mjs` rules: re-applied every run, `--` lines stripped, split on `;` — idempotent statements, no `;` inside a statement or comment. Do not run it against any database.
- New `Job` field `budgetTier` is optional (`?:`); `toJob` maps a missing or unknown value to `null`.
- Every admin page and action calls `requireAdmin()` before reading input.
- Verification: `npx vitest run --maxWorkers=2 <paths>`; full suite once; `npx tsc --noEmit 2>&1 | grep -v '^.next/'` prints nothing; `npx eslint <changed paths>` no errors. Do not run `next build` locally unless a task says so. Never `git stash`.
- Commits end with the session's attribution trailer lines.

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/006_budget_tier.sql` | `leads.budget_tier` + check constraint |
| `lib/admin/budget.ts` | Budget tiers, labels, guard (client-safe) |
| `lib/admin/time.ts` (modify) | `formatCallVisit()` — Las Vegas "Wed 10/14, 2:00 PM" |
| `lib/admin/call.ts` | Outcomes, treatment names, `callStageMove()`, `callSummary()` (pure, client-safe) |
| `lib/admin/schema.ts` (modify) | `detailsSchema` gains budget; new `callSchema` |
| `lib/admin/jobs.ts` (modify) | `budgetTier` on `Job`; `updateDetails` saves it |
| `lib/admin/calls.ts` | `logCall()` — one statement: answers, stage move, events |
| `lib/admin/origin.ts` | `adminOrigin()` |
| `lib/leads/db.ts`, `lib/leads/email.ts`, `app/api/consultation/route.ts` (modify) | Lead id created first; tracker link in the email |
| `app/admin/jobs/actions.ts`, `app/admin/jobs/[id]/DetailsForm.tsx`, `app/admin/jobs/[id]/page.tsx` (modify) | Budget in Job details and the summary; Call button |
| `app/admin/jobs/call-actions.ts` | `logCallAction` |
| `app/admin/jobs/[id]/call/page.tsx`, `app/admin/jobs/[id]/call/CallForm.tsx` | The call screen |
| `app/admin/jobs/[id]/CallButton.tsx` | Call / Log a call button |
| `app/admin/JobPanel.tsx` (modify) | Call button in the Contact section |
| `e2e/call.spec.ts`, `playwright.config.ts` (modify) | End-to-end call flow |

---

### Task 1: Budget tier — migration, data and Job details

**Files:**
- Create: `db/migrations/006_budget_tier.sql`, `lib/admin/budget.ts`
- Modify: `lib/admin/jobs.ts` (Job type, `JOB_COLUMNS`, `toJob`, `updateDetails`), `lib/admin/schema.ts` (`detailsSchema`), `app/admin/jobs/actions.ts` (`saveDetails`), `app/admin/jobs/[id]/DetailsForm.tsx`, `app/admin/jobs/[id]/page.tsx` (summary row)
- Test: `tests/admin/budget.test.ts`, `tests/admin/migration-006.test.ts`, plus additions to `tests/admin/schema.test.ts`, `tests/admin/jobs.test.ts`, `tests/admin/job-page.test.tsx`

**Interfaces:**
- Produces: `BUDGET_TIERS = ["value","mid","premium"] as const`, `type BudgetTier`, `isBudgetTier(v: unknown): v is BudgetTier`, `budgetLabel(t: BudgetTier | null | undefined): string`, `BUDGET_OPTIONS: { value: BudgetTier; label: string }[]`; `Job.budgetTier?: BudgetTier | null`; `DetailsInput.budgetTier: BudgetTier | null`.

- [ ] **Step 1: Write the failing tests**

`tests/admin/budget.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BUDGET_OPTIONS, BUDGET_TIERS, budgetLabel, isBudgetTier } from "@/lib/admin/budget";

describe("budget tiers", () => {
  it("are value, mid and premium", () => {
    expect(BUDGET_TIERS).toEqual(["value", "mid", "premium"]);
  });
  it("label each tier and show a dash for none", () => {
    expect(budgetLabel("value")).toBe("Value");
    expect(budgetLabel("mid")).toBe("Mid-range");
    expect(budgetLabel("premium")).toBe("Premium");
    expect(budgetLabel(null)).toBe("—");
    expect(budgetLabel(undefined)).toBe("—");
  });
  it("offer options in order", () => {
    expect(BUDGET_OPTIONS).toEqual([
      { value: "value", label: "Value" },
      { value: "mid", label: "Mid-range" },
      { value: "premium", label: "Premium" },
    ]);
  });
  it("recognise only known tiers", () => {
    expect(isBudgetTier("mid")).toBe(true);
    expect(isBudgetTier("luxury")).toBe(false);
    expect(isBudgetTier(null)).toBe(false);
  });
});
```

`tests/admin/migration-006.test.ts` (mirror how `scripts/migrate.mjs` parses — read it; it removes lines matching `^\s*--.*$`, splits on `;`, trims, drops empties):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("db/migrations/006_budget_tier.sql", "utf8");
const statements = sql.replace(/^\s*--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);

describe("migration 006", () => {
  it("adds the budget tier column and a check constraint, idempotently", () => {
    expect(statements).toEqual([
      "alter table leads add column if not exists budget_tier text",
      "alter table leads drop constraint if exists leads_budget_tier_check",
      "alter table leads add constraint leads_budget_tier_check check (budget_tier is null or budget_tier in ('value', 'mid', 'premium'))",
    ]);
  });
  it("has no semicolon inside a comment", () => {
    for (const line of sql.split(/\r?\n/)) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });
});
```

Add to `tests/admin/schema.test.ts` (keep existing tests; if an existing `detailsSchema` test compares the whole output with `toEqual`, add `budgetTier: null` to its expected object):

```ts
describe("detailsSchema budget", () => {
  it("accepts a tier and maps blank to null", () => {
    expect(detailsSchema.parse({ budget: "premium" }).budgetTier).toBe("premium");
    expect(detailsSchema.parse({ budget: "" }).budgetTier).toBeNull();
    expect(detailsSchema.parse({}).budgetTier).toBeNull();
  });
  it("rejects an unknown tier", () => {
    expect(detailsSchema.safeParse({ budget: "luxury" }).success).toBe(false);
  });
});
```

Add to `tests/admin/jobs.test.ts` (follow the file's existing `db` mock; `updateDetails` uses the tagged template, so the parameters are the call's rest arguments):

```ts
it("updateDetails saves the budget tier", async () => {
  sql.mockResolvedValue([{ id: "x" }]);
  await updateDetails("3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", {
    visitAt: null, quoteCents: null, soldCents: null, depositCents: null,
    brands: [], orderedOn: null, installOn: null, budgetTier: "mid",
  }, "owner@example.com");
  const call = sql.mock.calls.at(-1)!;
  expect((call[0] as TemplateStringsArray).join("?")).toContain("budget_tier = ");
  expect(call).toContain("mid");
});

it("toJob maps budget_tier, and unknown or missing values to null", () => {
  expect(toJob({ ...ROW, budget_tier: "premium" }).budgetTier).toBe("premium");
  expect(toJob({ ...ROW, budget_tier: "luxury" }).budgetTier).toBeNull();
  expect(toJob({ ...ROW }).budgetTier).toBeNull();
});
```

(`ROW` = whatever minimal row fixture `tests/admin/jobs.test.ts` already uses; if none exists, define one with `id`, `created_at`, `name`, `phone`, `city`, `source`, `status: "new"`, `stage_changed_at`. Match the file's real mock variable names.)

Add to `tests/admin/job-page.test.tsx` (use its existing job fixture and render helper):

```ts
it("shows the budget tier in the summary", async () => {
  // render the page with the fixture job given budgetTier: "mid"
  expect(screen.getByText("Budget")).toBeInTheDocument();
  expect(screen.getByText("Mid-range")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/budget.test.ts tests/admin/migration-006.test.ts tests/admin/schema.test.ts tests/admin/jobs.test.ts tests/admin/job-page.test.tsx`
Expected: FAIL (module and migration missing, no `budgetTier`).

- [ ] **Step 3: Implement**

`db/migrations/006_budget_tier.sql`:

```sql
-- Lead call flow: the budget tier heard on the first call.
-- Every statement is safe to re-run.

alter table leads add column if not exists budget_tier text;

alter table leads drop constraint if exists leads_budget_tier_check;

alter table leads add constraint leads_budget_tier_check check (budget_tier is null or budget_tier in ('value', 'mid', 'premium'));
```

`lib/admin/budget.ts`:

```ts
/** The budget tier the owner hears on the first call. Owner-only; never shown to customers. */
export const BUDGET_TIERS = ["value", "mid", "premium"] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

const LABELS: Record<BudgetTier, string> = { value: "Value", mid: "Mid-range", premium: "Premium" };

export const isBudgetTier = (value: unknown): value is BudgetTier =>
  typeof value === "string" && (BUDGET_TIERS as readonly string[]).includes(value);

export const budgetLabel = (tier: BudgetTier | null | undefined): string => (tier ? LABELS[tier] : "—");

export const BUDGET_OPTIONS = BUDGET_TIERS.map((value) => ({ value, label: LABELS[value] }));
```

`lib/admin/jobs.ts`:
- import `{ isBudgetTier, type BudgetTier } from "./budget"`.
- `Job` gains, after `portalInvitedAt`: `/** Budget tier from the call screen or Job details. Optional so older fixtures still type-check. */ budgetTier?: BudgetTier | null;`
- `JOB_COLUMNS` last line becomes `referral_code, referred_by, referral_paid_at, review_requested_at, review_opt_out, portal_invited_at, budget_tier`.
- `toJob` gains `budgetTier: isBudgetTier(row.budget_tier) ? row.budget_tier : null,`
- `updateDetails` SET list gains `budget_tier = ${input.budgetTier},` (before `updated_at = now()`).

`lib/admin/schema.ts`: import `{ BUDGET_TIERS } from "./budget"`; `detailsSchema` object gains `budget: z.preprocess(blank, z.enum(BUDGET_TIERS, { error: "Pick a budget tier" }).optional()),` and the transform destructures `budget` and returns `budgetTier: budget ?? null` alongside the existing fields.

`app/admin/jobs/actions.ts` `saveDetails`: add `"budget"` to its `captureValues` key list and `budget: formData.get("budget") ?? "",` to the object passed to `detailsSchema.safeParse`.

`app/admin/jobs/[id]/DetailsForm.tsx`: import `{ BUDGET_OPTIONS } from "@/lib/admin/budget"`; after the Install date label add:

```tsx
      <label htmlFor="budget" className="flex flex-col gap-2 text-sm">
        Budget
        <select id="budget" name="budget" className={CONTROL} defaultValue={field("budget", job.budgetTier ?? "")}>
          <option value="">—</option>
          {BUDGET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
```

`app/admin/jobs/[id]/page.tsx`: import `{ budgetLabel } from "@/lib/admin/budget"`; in the summary `dl`, right after the Windows pair: `<dt>Budget</dt><dd>{budgetLabel(job.budgetTier)}</dd>`.

- [ ] **Step 4: Run the tests to verify they pass**

Run the Step 2 command, then `npx vitest run --maxWorkers=2 tests/admin`. Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add db/migrations/006_budget_tier.sql lib/admin/budget.ts lib/admin/jobs.ts lib/admin/schema.ts app/admin/jobs/actions.ts "app/admin/jobs/[id]/DetailsForm.tsx" "app/admin/jobs/[id]/page.tsx" tests/admin/budget.test.ts tests/admin/migration-006.test.ts tests/admin/schema.test.ts tests/admin/jobs.test.ts tests/admin/job-page.test.tsx
git commit -m "feat: budget tier on jobs (migration 006) in Job details"
```

---

### Task 2: Tracker link in the new-lead email

**Files:**
- Create: `lib/admin/origin.ts`
- Modify: `lib/leads/db.ts`, `lib/leads/email.ts`, `app/api/consultation/route.ts`
- Test: `tests/leads/email.test.ts` (add), `tests/leads/route.test.ts` (add), `tests/leads/db.test.ts` (create if absent)

**Interfaces:**
- Produces: `adminOrigin(): string`; `insertLead(input: ConsultationInput & { referredBy?: string | null; id: string }): Promise<{ id: string }>`; `sendLeadNotification(input: ConsultationInput, leadId: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/leads/email.test.ts` (it already mocks `resend` with `send`; import `sendLeadNotification` next to `sendCustomerConfirmation`):

```ts
describe("sendLeadNotification", () => {
  beforeEach(() => {
    vi.stubEnv("LEAD_NOTIFICATION_EMAIL", "owners@example.com");
    vi.stubEnv("ADMIN_BASE_URL", "https://pss.test/");
  });

  it("opens with a link straight to the job in the tracker", async () => {
    await sendLeadNotification(input, "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
    const lines = send.mock.calls[0][0].text.split("\n");
    expect(lines[0]).toBe("Open in tracker: https://pss.test/admin/jobs/3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
    expect(lines[1]).toBe("");
    expect(lines[2]).toMatch(/^Name:\s+Dana Reyes$/);
  });

  it("falls back to the business domain", async () => {
    vi.stubEnv("ADMIN_BASE_URL", "");
    await sendLeadNotification(input, "abc");
    expect(send.mock.calls[0][0].text.split("\n")[0]).toBe(`Open in tracker: ${business.domain}/admin/jobs/abc`);
  });
});
```

Add to `tests/leads/route.test.ts`:

```ts
describe("lead id", () => {
  it("creates the id first and gives the same one to the database and the email", async () => {
    await POST(request(body));
    const stored = insertLead.mock.calls[0][0];
    expect(stored.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(sendLeadNotification).toHaveBeenCalledWith(expect.objectContaining({ name: "Dana Reyes" }), stored.id);
  });
});
```

`tests/leads/db.test.ts` (create; if a file already tests `insertLead`, add the case there instead):

```ts
import { describe, it, expect, vi } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { insertLead } = await import("@/lib/leads/db");

describe("insertLead", () => {
  it("inserts the id it was given", async () => {
    sql.mockResolvedValue([{ id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c" }]);
    await insertLead({ id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", name: "Dana", phone: "7025550134",
      email: "d@example.com", city: "Henderson", source: "hero" });
    const call = sql.mock.calls[0];
    expect((call[0] as TemplateStringsArray).join("?")).toMatch(/insert into leads\s*\(\s*id,/);
    expect(call).toContain("3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/leads`. Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/admin/origin.ts`:

```ts
import { business } from "@/content/business";

/** Where owner links point. From configuration, never the request's Host. No trailing slash. */
export const adminOrigin = (): string => (process.env.ADMIN_BASE_URL || business.domain).replace(/\/+$/, "");
```

`lib/leads/db.ts`: parameter type becomes `ConsultationInput & { referredBy?: string | null; id: string }`; column list starts `(id, name, …` and values start `(${input.id}, ${input.name}, …`. Update the doc comment: "Inserts a lead with the id the caller chose (so the notification email can link to it)".

`lib/leads/email.ts`: import `{ adminOrigin } from "@/lib/admin/origin"`; signature `sendLeadNotification(input: ConsultationInput, leadId: string)`; the `lines` array starts with:

```ts
    `Open in tracker: ${adminOrigin()}/admin/jobs/${leadId}`,
    "",
```

`app/api/consultation/route.ts`: `import { randomUUID } from "node:crypto";`; `const id = randomUUID();` just before building `lead`; `const lead = { ...parsed.data, heardVia: …, referredBy: …, id };`; call `insertLead(lead)` and `sendLeadNotification(lead, id)`. Update the design-rule comment to say the id is created first so the email can link to the job.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run --maxWorkers=2 tests/leads`. Expected: PASS (including `referral-route.test.ts`).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add lib/admin/origin.ts lib/leads/db.ts lib/leads/email.ts app/api/consultation/route.ts tests/leads/email.test.ts tests/leads/route.test.ts tests/leads/db.test.ts
git commit -m "feat: new-lead email links straight to the job in the tracker"
```

---

### Task 3: Call rules, summary, validation and the save function

**Files:**
- Create: `lib/admin/call.ts`, `lib/admin/calls.ts`
- Modify: `lib/admin/time.ts` (add `formatCallVisit`), `lib/admin/schema.ts` (add `callSchema`)
- Test: `tests/admin/call.test.ts`, `tests/admin/call-schema.test.ts`, `tests/admin/calls.test.ts`, add to `tests/admin/time.test.ts` (create if absent)

**Interfaces:**
- Consumes: `BUDGET_TIERS`, `budgetLabel` (Task 1); `WINDOW_COUNTS`; `categories` from `content/products.ts`; `fromLocalInput`.
- Produces:
  - `formatCallVisit(date: Date): string`
  - `CALL_OUTCOMES = ["booked","talked","no_answer"] as const`, `type CallOutcome`, `TREATMENT_NAMES: string[]`
  - `callStageMove(outcome: CallOutcome): { to: "visit_booked" | "contacted"; from: Stage[] } | null`
  - `type CallInput = { outcome: CallOutcome; treatments: string[]; windowCount: string | null; budgetTier: BudgetTier | null; notes: string | null; visitAt: Date | null }`
  - `callSummary(input: CallInput): string` (one line, no notes)
  - `callSchema` (zod) whose output is `CallInput`
  - `logCall(jobId: string, input: CallInput, actor: string): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

`tests/admin/time.test.ts` (add; create with these imports if the file doesn't exist):

```ts
import { describe, it, expect } from "vitest";
import { formatCallVisit } from "@/lib/admin/time";

describe("formatCallVisit", () => {
  it("formats a Las Vegas visit time in summer and winter", () => {
    expect(formatCallVisit(new Date("2026-10-14T21:00:00Z"))).toBe("Wed 10/14, 2:00 PM");
    expect(formatCallVisit(new Date("2026-12-01T22:30:00Z"))).toBe("Tue 12/1, 2:30 PM");
  });
});
```

`tests/admin/call.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CALL_OUTCOMES, TREATMENT_NAMES, callStageMove, callSummary } from "@/lib/admin/call";

const base = { treatments: [], windowCount: null, budgetTier: null, notes: null, visitAt: null };

describe("call outcomes", () => {
  it("are booked, talked and no answer", () => {
    expect(CALL_OUTCOMES).toEqual(["booked", "talked", "no_answer"]);
  });
  it("offer the website form's treatment categories", () => {
    expect(TREATMENT_NAMES).toEqual(["Blinds", "Shades", "Shutters", "Outdoor Shading", "Motorization"]);
  });
});

describe("callStageMove", () => {
  it("books a visit only from new or contacted", () => {
    expect(callStageMove("booked")).toEqual({ to: "visit_booked", from: ["new", "contacted"] });
  });
  it("marks contacted only from new", () => {
    expect(callStageMove("talked")).toEqual({ to: "contacted", from: ["new"] });
  });
  it("never moves on no answer", () => {
    expect(callStageMove("no_answer")).toBeNull();
  });
});

describe("callSummary", () => {
  it("describes a booked visit with everything learned", () => {
    expect(callSummary({
      ...base, outcome: "booked", treatments: ["Shutters", "Shades"], windowCount: "6-10",
      budgetTier: "mid", visitAt: new Date("2026-10-14T21:00:00Z"),
    })).toBe("Call: booked visit Wed 10/14, 2:00 PM · Shutters, Shades · 6-10 windows · Mid-range");
  });
  it("leaves out what wasn't learned", () => {
    expect(callSummary({ ...base, outcome: "talked", treatments: ["Blinds"], budgetTier: "value" }))
      .toBe("Call: talked, no visit yet · Blinds · Value");
    expect(callSummary({ ...base, outcome: "no_answer" })).toBe("Call: no answer");
  });
  it("never includes the notes", () => {
    expect(callSummary({ ...base, outcome: "talked", notes: "Call back Friday" })).toBe("Call: talked, no visit yet");
  });
});
```

`tests/admin/call-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { callSchema } from "@/lib/admin/schema";

const ok = { outcome: "talked", treatments: [], windowCount: "", budget: "", notes: "", visitAt: "" };

describe("callSchema", () => {
  it("parses a talked call to a clean input", () => {
    expect(callSchema.parse({ ...ok, treatments: ["Shades"], windowCount: "11-20", budget: "premium", notes: " Call back " }))
      .toEqual({ outcome: "talked", treatments: ["Shades"], windowCount: "11-20", budgetTier: "premium", notes: "Call back", visitAt: null });
  });
  it("requires a visit time only when booking", () => {
    const missing = callSchema.safeParse({ ...ok, outcome: "booked" });
    expect(missing.success).toBe(false);
    expect(missing.error!.issues[0].message).toBe("Pick the visit date and time");
    const booked = callSchema.parse({ ...ok, outcome: "booked", visitAt: "2026-10-14T14:00" });
    expect(booked.visitAt).toEqual(new Date("2026-10-14T21:00:00Z"));
  });
  it("ignores a visit time for other outcomes", () => {
    expect(callSchema.parse({ ...ok, outcome: "no_answer", visitAt: "2026-10-14T14:00" }).visitAt).toBeNull();
  });
  it("rejects a malformed visit time", () => {
    expect(callSchema.safeParse({ ...ok, outcome: "booked", visitAt: "tomorrow" }).success).toBe(false);
  });
  it("rejects an unknown outcome, treatment, window range or budget", () => {
    expect(callSchema.safeParse({ ...ok, outcome: "voicemail" }).error!.issues[0].message).toBe("Pick how the call went");
    expect(callSchema.safeParse({ ...ok, treatments: ["Curtains"] }).success).toBe(false);
    expect(callSchema.safeParse({ ...ok, windowCount: "50" }).success).toBe(false);
    expect(callSchema.safeParse({ ...ok, budget: "luxury" }).success).toBe(false);
  });
  it("limits notes to 2,000 characters", () => {
    expect(callSchema.safeParse({ ...ok, notes: "x".repeat(2001) }).success).toBe(false);
  });
});
```

`tests/admin/calls.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
const sql = Object.assign(vi.fn(), { query });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { logCall } = await import("@/lib/admin/calls");

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const input = { outcome: "booked" as const, treatments: ["Shutters"], windowCount: "6-10", budgetTier: "mid" as const,
  notes: "Gate code 1234", visitAt: new Date("2026-10-14T21:00:00Z") };

beforeEach(() => { query.mockReset().mockResolvedValue([{ id: "e1" }]); });

describe("logCall", () => {
  it("saves answers, the forward-only move and both events in one statement", async () => {
    expect(await logCall(JOB, input, "owner@example.com")).toBe(true);
    expect(query).toHaveBeenCalledOnce();
    const [text, params] = query.mock.calls[0];
    expect(text).toContain("treatments = $2::text[]");
    expect(text).toContain("budget_tier = $4");
    expect(text).toContain("coalesce($5::timestamptz, visit_at)");
    expect(text).toContain("status = any($7::text[])");
    expect(text).toContain("where updated.status <> prev.status");
    expect(text).toContain("'note'");
    expect(params).toEqual([
      JOB, ["Shutters"], "6-10", "mid", input.visitAt, "visit_booked", ["new", "contacted"], "owner@example.com",
      "Call: booked visit Wed 10/14, 2:00 PM · Shutters · 6-10 windows · Mid-range\nGate code 1234",
    ]);
  });

  it("moves talked calls only from new", async () => {
    await logCall(JOB, { ...input, outcome: "talked", visitAt: null, notes: null }, "o@example.com");
    const params = query.mock.calls[0][1];
    expect(params.slice(4, 7)).toEqual([null, "contacted", ["new"]]);
    expect(params[8]).toBe("Call: talked, no visit yet · Shutters · 6-10 windows · Mid-range");
  });

  it("never moves on no answer, but still saves what was learned", async () => {
    await logCall(JOB, { ...input, outcome: "no_answer", visitAt: null, notes: null }, "o@example.com");
    const params = query.mock.calls[0][1];
    expect(params.slice(1, 7)).toEqual([["Shutters"], "6-10", "mid", null, null, []]);
  });

  it("returns false for a missing job or a bad id", async () => {
    query.mockResolvedValue([]);
    expect(await logCall(JOB, input, "o@example.com")).toBe(false);
    query.mockClear();
    expect(await logCall("nope", input, "o@example.com")).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/time.test.ts tests/admin/call.test.ts tests/admin/call-schema.test.ts tests/admin/calls.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/admin/time.ts` — append (reuses the file's `ZONE`):

```ts
/** "Wed 10/14, 2:00 PM" in Las Vegas time, for the call log line. */
export function formatCallVisit(date: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE, weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${p.weekday} ${p.month}/${p.day}, ${p.hour}:${p.minute} ${p.dayPeriod}`;
}
```

`lib/admin/call.ts`:

```ts
import { categories } from "@/content/products";
import { budgetLabel, type BudgetTier } from "./budget";
import type { Stage } from "./stages";
import { formatCallVisit } from "./time";

export const CALL_OUTCOMES = ["booked", "talked", "no_answer"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/** The same interest options as the website consultation form. */
export const TREATMENT_NAMES: string[] = categories.map((category) => category.name);

export type CallInput = {
  outcome: CallOutcome;
  treatments: string[];
  windowCount: string | null;
  budgetTier: BudgetTier | null;
  notes: string | null;
  visitAt: Date | null;
};

/** Where a call's outcome may move the job, and only from which stages. Forward only. */
export function callStageMove(outcome: CallOutcome): { to: "visit_booked" | "contacted"; from: Stage[] } | null {
  if (outcome === "booked") return { to: "visit_booked", from: ["new", "contacted"] };
  if (outcome === "talked") return { to: "contacted", from: ["new"] };
  return null;
}

const OUTCOME_TEXT: Record<CallOutcome, string> = {
  booked: "booked visit",
  talked: "talked, no visit yet",
  no_answer: "no answer",
};

/** One activity line for the call. Empty parts are left out; notes are not included. */
export function callSummary(input: CallInput): string {
  const outcome = input.outcome === "booked" && input.visitAt
    ? `${OUTCOME_TEXT.booked} ${formatCallVisit(input.visitAt)}`
    : OUTCOME_TEXT[input.outcome];
  const parts = [
    input.treatments.join(", "),
    input.windowCount ? `${input.windowCount} windows` : "",
    input.budgetTier ? budgetLabel(input.budgetTier) : "",
  ].filter(Boolean);
  return [`Call: ${outcome}`, ...parts].join(" · ");
}
```

`lib/admin/schema.ts` — add imports `{ CALL_OUTCOMES, TREATMENT_NAMES, type CallInput } from "./call"` and `{ WINDOW_COUNTS } from "@/lib/leads/schema"` (merge with the existing `consultationSchema` import), then:

```ts
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const callSchema = z
  .object({
    outcome: z.enum(CALL_OUTCOMES, { error: "Pick how the call went" }),
    treatments: z.array(z.string().refine((name) => TREATMENT_NAMES.includes(name), "Unknown treatment")).default([]),
    windowCount: z.preprocess(blank, z.enum(WINDOW_COUNTS, { error: "Pick a window range" }).optional()),
    budget: z.preprocess(blank, z.enum(BUDGET_TIERS, { error: "Pick a budget tier" }).optional()),
    notes: z.preprocess(blank, z.string().trim().max(2000, "Keep notes under 2,000 characters").optional()),
    visitAt: z.preprocess(blank, z.string().optional()),
  })
  .superRefine((value, ctx) => {
    if (value.outcome === "booked" && !(value.visitAt && LOCAL_TIME.test(value.visitAt))) {
      ctx.addIssue({ code: "custom", path: ["visitAt"], message: "Pick the visit date and time" });
    }
  })
  .transform((value): CallInput => ({
    outcome: value.outcome,
    treatments: value.treatments,
    windowCount: value.windowCount ?? null,
    budgetTier: value.budget ?? null,
    notes: value.notes ?? null,
    visitAt: value.outcome === "booked" && value.visitAt ? fromLocalInput(value.visitAt) : null,
  }));
```

`lib/admin/calls.ts`:

```ts
import "server-only";
import { db } from "@/lib/db";
import { callStageMove, callSummary, type CallInput } from "./call";
import { isUuid } from "./jobs";

/**
 * Saves a call in one statement: what was learned, the forward-only stage move
 * (with its usual 'stage' event) and a 'note' event with the call summary.
 * Every SET expression reads the row as it was, so the stage check and the
 * stage_changed_at update agree.
 */
export async function logCall(jobId: string, input: CallInput, actor: string): Promise<boolean> {
  if (!isUuid(jobId)) return false;
  const move = callStageMove(input.outcome);
  const body = callSummary(input) + (input.notes ? `\n${input.notes}` : "");
  const rows = await db().query(
    `with prev as (select status from leads where id = $1),
     updated as (
       update leads set
         treatments = $2::text[], window_count = $3, budget_tier = $4,
         visit_at = coalesce($5::timestamptz, visit_at),
         status = case when $6::text is not null and status = any($7::text[]) then $6::text else status end,
         stage_changed_at = case when $6::text is not null and status = any($7::text[]) then now() else stage_changed_at end,
         updated_at = now()
       where id = $1
       returning id, status
     ),
     moved as (
       insert into job_events (lead_id, actor, kind, from_status, to_status)
       select updated.id, $8, 'stage', prev.status, updated.status from prev, updated
       where updated.status <> prev.status
     )
     insert into job_events (lead_id, actor, kind, body)
     select id, $8, 'note', $9 from updated
     returning id`,
    [jobId, input.treatments, input.windowCount, input.budgetTier, input.visitAt, move?.to ?? null, move?.from ?? [], actor, body],
  );
  return rows.length > 0;
}
```

- [ ] **Step 4: Run to verify they pass**

Run the Step 2 command, then `npx vitest run --maxWorkers=2 tests/admin`. Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add lib/admin/time.ts lib/admin/call.ts lib/admin/calls.ts lib/admin/schema.ts tests/admin/time.test.ts tests/admin/call.test.ts tests/admin/call-schema.test.ts tests/admin/calls.test.ts
git commit -m "feat: call outcome rules, summary line, validation and save"
```

---

### Task 4: The call screen

**Files:**
- Create: `app/admin/jobs/call-actions.ts`, `app/admin/jobs/[id]/call/page.tsx`, `app/admin/jobs/[id]/call/CallForm.tsx`
- Test: `tests/admin/call-actions.test.ts`, `tests/admin/call-form.test.tsx`, `tests/admin/call-page.test.tsx`

**Interfaces:**
- Consumes: `callSchema` (Task 3), `logCall` (Task 3), `TREATMENT_NAMES`, `BUDGET_OPTIONS`, `WINDOW_COUNTS`, `getJob`, `requireAdmin`, `formatPhone`, `stageLabel`, `toLocalInput`, `type FormState` from `app/admin/jobs/actions.ts`.
- Produces: `logCallAction(jobId: string, prev: FormState, formData: FormData): Promise<FormState>`; route `/admin/jobs/[id]/call`.

- [ ] **Step 1: Write the failing tests**

`tests/admin/call-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const logCall = vi.fn();
vi.mock("@/lib/admin/calls", () => ({ logCall }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); });
vi.mock("next/navigation", () => ({ redirect }));

const { logCallAction } = await import("@/app/admin/jobs/call-actions");
const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const form = (entries: [string, string][]) => { const d = new FormData(); for (const [k, v] of entries) d.append(k, v); return d; };

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
  logCall.mockReset().mockResolvedValue(true);
  redirect.mockClear();
});

describe("logCallAction", () => {
  it("checks the session before reading input", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(logCallAction(JOB, {}, form([["outcome", "talked"]]))).rejects.toThrow("NEXT_REDIRECT");
    expect(logCall).not.toHaveBeenCalled();
  });

  it("saves the call as the owner and returns to the job", async () => {
    await expect(logCallAction(JOB, {}, form([
      ["outcome", "talked"], ["treatments", "Shades"], ["treatments", "Blinds"], ["windowCount", "1-5"], ["budget", "value"], ["notes", "Fri pm"],
    ]))).rejects.toThrow(`NEXT_REDIRECT /admin/jobs/${JOB}`);
    expect(logCall).toHaveBeenCalledWith(JOB, {
      outcome: "talked", treatments: ["Shades", "Blinds"], windowCount: "1-5", budgetTier: "value", notes: "Fri pm", visitAt: null,
    }, "owner@example.com");
  });

  it("keeps what was typed when validation fails", async () => {
    const state = await logCallAction(JOB, {}, form([["outcome", "booked"], ["treatments", "Shutters"], ["notes", "x"]]));
    expect(state.error).toBe("Pick the visit date and time");
    expect(state.values).toMatchObject({ outcome: "booked", treatments: "Shutters", notes: "x" });
    expect(logCall).not.toHaveBeenCalled();
  });

  it("reports a job that no longer exists", async () => {
    logCall.mockResolvedValue(false);
    expect(await logCallAction(JOB, {}, form([["outcome", "no_answer"]]))).toEqual({ error: "That job no longer exists." });
  });
});
```

`tests/admin/call-form.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/admin/jobs/call-actions", () => ({ logCallAction: vi.fn() }));
const { CallForm } = await import("@/app/admin/jobs/[id]/call/CallForm");

const job = { id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", treatments: ["Shades"], windowCount: "6-10", budgetTier: "mid" as const, visitAt: null };

describe("CallForm", () => {
  it("is pre-filled from the job", () => {
    render(<CallForm job={job} />);
    expect(screen.getByLabelText("Shades")).toBeChecked();
    expect(screen.getByLabelText("Shutters")).not.toBeChecked();
    expect(screen.getByLabelText("6-10")).toBeChecked();
    expect(screen.getByLabelText("Mid-range")).toBeChecked();
    expect(screen.getByLabelText("Notes")).toHaveValue("");
  });

  it("offers talked and no answer as direct saves", () => {
    render(<CallForm job={job} />);
    expect(screen.getByRole("button", { name: "Talked, no visit yet" })).toHaveAttribute("value", "talked");
    expect(screen.getByRole("button", { name: "No answer" })).toHaveAttribute("value", "no_answer");
  });

  it("asks for the visit time before saving a booked visit", () => {
    render(<CallForm job={job} />);
    expect(screen.queryByLabelText("Visit date and time")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Booked a visit" }));
    expect(screen.getByLabelText("Visit date and time")).toBeRequired();
    expect(screen.getByRole("button", { name: "Save booked visit" })).toHaveAttribute("value", "booked");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Visit date and time")).toBeNull();
  });
});
```

`tests/admin/call-page.test.tsx` (render the async page the same way `tests/admin/job-page.test.tsx` does; mock `@/lib/admin/session`, `@/lib/admin/jobs`' `getJob`, `next/navigation`'s `notFound`, and `@/app/admin/jobs/call-actions`):

```tsx
it("shows who to call with a tap-to-call number", async () => {
  // getJob resolves a job named "Maria Lopez", phone "7025550100", city "Henderson", status "new"
  render(await CallPage({ params: Promise.resolve({ id: JOB }) }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Call Maria Lopez");
  expect(screen.getByRole("link", { name: "(702) 555-0100" })).toHaveAttribute("href", "tel:+17025550100");
  expect(screen.getByRole("link", { name: "← Back to job" })).toHaveAttribute("href", `/admin/jobs/${JOB}`);
});
it("is not found for a missing job", async () => {
  // getJob resolves null; notFound throws NEXT_NOT_FOUND
  await expect(CallPage({ params: Promise.resolve({ id: JOB }) })).rejects.toThrow("NEXT_NOT_FOUND");
});
```

(Complete these two tests with the mocks listed above; use a full `Job` fixture like the other admin page tests.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/call-actions.test.ts tests/admin/call-form.test.tsx tests/admin/call-page.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`app/admin/jobs/call-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logCall } from "@/lib/admin/calls";
import { callSchema } from "@/lib/admin/schema";
import { requireAdmin } from "@/lib/admin/session";
import type { FormState } from "./actions";

const FIELDS = ["outcome", "treatments", "windowCount", "budget", "notes", "visitAt"];

function captureValues(formData: FormData): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};
  for (const key of FIELDS) {
    const all = formData.getAll(key);
    if (all.length === 0) continue;
    values[key] = all.length > 1 ? all.map(String) : String(all[0]);
  }
  return values;
}

// Calls requireAdmin() before reading its input.
export async function logCallAction(jobId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const values = captureValues(formData);
  const parsed = callSchema.safeParse({
    outcome: formData.get("outcome") ?? undefined,
    treatments: formData.getAll("treatments").map(String),
    windowCount: formData.get("windowCount") ?? "",
    budget: formData.get("budget") ?? "",
    notes: formData.get("notes") ?? "",
    visitAt: formData.get("visitAt") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const saved = await logCall(jobId, parsed.data, email);
  if (!saved) return { error: "That job no longer exists." };

  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${jobId}`);
  redirect(`/admin/jobs/${jobId}`);
}
```

`app/admin/jobs/[id]/call/CallForm.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BUDGET_OPTIONS, type BudgetTier } from "@/lib/admin/budget";
import { TREATMENT_NAMES } from "@/lib/admin/call";
import { toLocalInput } from "@/lib/admin/time";
import { WINDOW_COUNTS } from "@/lib/leads/schema";
import { logCallAction } from "../../call-actions";
import type { FormState } from "../../actions";

type CallJob = { id: string; treatments: string[]; windowCount: string | null; budgetTier?: BudgetTier | null; visitAt: Date | null };

const CHIP = "flex min-h-11 items-center gap-2 border border-rule px-3 text-sm";
const LEGEND = "text-sm font-semibold text-charcoal";

export function CallForm({ job }: { job: CallJob }) {
  const [state, action, pending] = useActionState<FormState, FormData>(logCallAction.bind(null, job.id), {});
  const values = state.values;
  const [booking, setBooking] = useState(values?.outcome === "booked");

  const text = (name: string, fallback: string) => (typeof values?.[name] === "string" ? (values[name] as string) : fallback);
  const checked = (name: string) => {
    const submitted = values?.treatments;
    if (submitted === undefined) return job.treatments.includes(name);
    return Array.isArray(submitted) ? submitted.includes(name) : submitted === name;
  };
  const windows = text("windowCount", job.windowCount ?? "");
  const budget = text("budget", job.budgetTier ?? "");

  return (
    <form key={values ? JSON.stringify(values) : "initial"} action={action} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className={LEGEND}>Interest</legend>
        <div className="flex flex-wrap gap-2">
          {TREATMENT_NAMES.map((name) => (
            <label key={name} htmlFor={`call-t-${name}`} className={CHIP}>
              <input id={`call-t-${name}`} type="checkbox" name="treatments" value={name} defaultChecked={checked(name)} />
              {name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={LEGEND}>Windows</legend>
        <div className="flex flex-wrap gap-2">
          {WINDOW_COUNTS.map((count) => (
            <label key={count} htmlFor={`call-w-${count}`} className={CHIP}>
              <input id={`call-w-${count}`} type="radio" name="windowCount" value={count} defaultChecked={windows === count} />
              {count}
            </label>
          ))}
          <label htmlFor="call-w-none" className={CHIP}>
            <input id="call-w-none" type="radio" name="windowCount" value="" defaultChecked={windows === ""} />
            Not sure
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={LEGEND}>Budget</legend>
        <div className="flex flex-wrap gap-2">
          {BUDGET_OPTIONS.map((option) => (
            <label key={option.value} htmlFor={`call-b-${option.value}`} className={CHIP}>
              <input id={`call-b-${option.value}`} type="radio" name="budget" value={option.value} defaultChecked={budget === option.value} />
              {option.label}
            </label>
          ))}
          <label htmlFor="call-b-none" className={CHIP}>
            <input id="call-b-none" type="radio" name="budget" value="" defaultChecked={budget === ""} />
            Not sure
          </label>
        </div>
      </fieldset>

      <label htmlFor="call-notes" className="flex flex-col gap-2 text-sm">
        Notes
        <textarea id="call-notes" name="notes" rows={3} maxLength={2000} defaultValue={text("notes", "")}
          className="w-full border border-rule bg-ivory px-4 py-3" />
      </label>

      {booking ? (
        <div className="flex flex-col gap-3">
          <label htmlFor="call-visit" className="flex flex-col gap-2 text-sm">
            Visit date and time
            <input id="call-visit" name="visitAt" type="datetime-local" required
              defaultValue={text("visitAt", job.visitAt ? toLocalInput(job.visitAt) : "")}
              className="min-h-11 w-full border border-rule bg-ivory px-4 py-3" />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" name="outcome" value="booked" variant="solid" disabled={pending}>Save booked visit</Button>
            <Button type="button" variant="outline" onClick={() => setBooking(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="solid" onClick={() => setBooking(true)}>Booked a visit</Button>
          <Button type="submit" name="outcome" value="talked" variant="outline" disabled={pending}>Talked, no visit yet</Button>
          <Button type="submit" name="outcome" value="no_answer" variant="outline" disabled={pending}>No answer</Button>
        </div>
      )}

      {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
    </form>
  );
}
```

`app/admin/jobs/[id]/call/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob } from "@/lib/admin/jobs";
import { requireAdmin } from "@/lib/admin/session";
import { stageLabel } from "@/lib/admin/stages";
import { formatPhone } from "@/lib/leads/schema";
import { CallForm } from "./CallForm";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <Link href={`/admin/jobs/${job.id}`} className="text-sm underline underline-offset-4">← Back to job</Link>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-light">Call {job.name}</h1>
        <a href={`tel:+1${job.phone}`} className="text-2xl font-semibold underline-offset-4 hover:underline">{formatPhone(job.phone)}</a>
        <p className="text-sm text-ink-soft">{job.city} · {stageLabel(job.status)}</p>
      </header>
      <CallForm job={job} />
    </div>
  );
}
```

Check `formatPhone("7025550100")` returns "(702) 555-0100" (it's used the same way on the job page) and adjust the test's expected link name if its real format differs.

- [ ] **Step 4: Run to verify they pass**

Run the Step 2 command, then `npx vitest run --maxWorkers=2 tests/admin`. Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add app/admin/jobs/call-actions.ts "app/admin/jobs/[id]/call" tests/admin/call-actions.test.ts tests/admin/call-form.test.tsx tests/admin/call-page.test.tsx
git commit -m "feat: call screen with interest, windows, budget, notes and outcome"
```

---

### Task 5: The Call button

**Files:**
- Create: `app/admin/jobs/[id]/CallButton.tsx`
- Modify: `app/admin/jobs/[id]/page.tsx` (under the name), `app/admin/JobPanel.tsx` (top of the Contact section)
- Test: `tests/admin/call-button.test.tsx`; add one assertion each to `tests/admin/job-page.test.tsx` and `tests/admin/job-panel.test.tsx`

**Interfaces:**
- Consumes: `Icon` from `components/admin/icons.tsx`.
- Produces: `CallButton({ jobId, name, phone }: { jobId: string; name: string; phone: string })`.

- [ ] **Step 1: Write the failing tests**

`tests/admin/call-button.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CallButton } from "@/app/admin/jobs/[id]/CallButton";

const JOB = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

describe("CallButton", () => {
  it("dials on touch devices and names the customer", () => {
    render(<CallButton jobId={JOB} name="Maria Lopez" phone="7025550100" />);
    const call = screen.getByRole("link", { name: "Call Maria" });
    expect(call).toHaveAttribute("href", "tel:+17025550100");
    expect(call.className).toContain("[@media(pointer:coarse)]:inline-flex");
  });

  it("opens the call screen on computers", () => {
    render(<CallButton jobId={JOB} name="Maria Lopez" phone="7025550100" />);
    const log = screen.getByRole("link", { name: "Log a call" });
    expect(log).toHaveAttribute("href", `/admin/jobs/${JOB}/call`);
    expect(log.className).toContain("[@media(pointer:coarse)]:hidden");
  });

  it("opens the call screen after starting the call", () => {
    vi.useFakeTimers();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    render(<CallButton jobId={JOB} name="Maria Lopez" phone="7025550100" />);
    fireEvent.click(screen.getByRole("link", { name: "Call Maria" }));
    vi.runAllTimers();
    expect(assign).toHaveBeenCalledWith(`/admin/jobs/${JOB}/call`);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
```

Add to `tests/admin/job-page.test.tsx` and `tests/admin/job-panel.test.tsx` (using each file's rendered fixture job):

```ts
expect(screen.getByRole("link", { name: "Log a call" })).toHaveAttribute("href", `/admin/jobs/${fixtureJob.id}/call`);
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --maxWorkers=2 tests/admin/call-button.test.tsx tests/admin/job-page.test.tsx tests/admin/job-panel.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`app/admin/jobs/[id]/CallButton.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Icon } from "@/components/admin/icons";

const BASE = "min-h-11 items-center justify-center gap-2 bg-charcoal px-5 text-sm font-medium text-ivory hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * Touch devices get "Call <name>": the tel: link starts the call, and the tab
 * then opens the call screen so it is waiting after the call. Computers get
 * "Log a call", which opens the call screen and leaves dialing to the phone.
 * Both are rendered; CSS on the pointer type shows one.
 */
export function CallButton({ jobId, name, phone }: { jobId: string; name: string; phone: string }) {
  const first = name.trim().split(/\s+/)[0] || "customer";
  const screenHref = `/admin/jobs/${jobId}/call`;
  return (
    <div className="flex">
      <a href={`tel:+1${phone}`}
        onClick={() => { window.setTimeout(() => window.location.assign(screenHref), 300); }}
        className={`hidden [@media(pointer:coarse)]:inline-flex ${BASE}`}>
        <Icon name="phone" className="size-4" />
        Call {first}
      </a>
      <Link href={screenHref} className={`inline-flex [@media(pointer:coarse)]:hidden ${BASE}`}>
        <Icon name="phone" className="size-4" />
        Log a call
      </Link>
    </div>
  );
}
```

Check `components/admin/icons.tsx`'s `Icon` renders `aria-hidden` (so the link's accessible name is only its text). If it doesn't, pass/add it so the names are exactly "Call Maria" and "Log a call".

`app/admin/jobs/[id]/page.tsx`: import `{ CallButton } from "./CallButton"`; directly after the `<h1>`: `<CallButton jobId={job.id} name={job.name} phone={job.phone} />`.

`app/admin/JobPanel.tsx`: import `{ CallButton } from "./jobs/[id]/CallButton"`; in the Contact `Section`, before the `<div className="flex flex-col gap-1">`: `<CallButton jobId={job.id} name={job.name} phone={job.phone} />`.

- [ ] **Step 4: Run to verify they pass**

Run the Step 2 command, then `npx vitest run --maxWorkers=2 tests/admin`. Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
git add "app/admin/jobs/[id]/CallButton.tsx" "app/admin/jobs/[id]/page.tsx" app/admin/JobPanel.tsx tests/admin/call-button.test.tsx tests/admin/job-page.test.tsx tests/admin/job-panel.test.tsx
git commit -m "feat: Call button on the job page and board panel"
```

---

### Task 6: End-to-end call flow

**Files:**
- Create: `e2e/call.spec.ts`
- Modify: `playwright.config.ts` (mobile `testIgnore`, `ADMIN_EMAILS`)

**Interfaces:**
- Consumes: everything above; migration 006 on the test branch.

- [ ] **Step 1: Config**

In `playwright.config.ts`: the mobile project's `testIgnore` becomes `/(admin|portal|call)\.spec\.ts/`; `ADMIN_EMAILS` becomes `"e2e-owner@example.com,e2e-portal-owner@example.com,e2e-call-owner@example.com"` (update the comment: each spec signs in as its own owner).

- [ ] **Step 2: Write `e2e/call.spec.ts`**

```ts
import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run call-flow tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-call-owner@example.com";
const STAMP = Date.now();

async function signIn(page: Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
}

async function lead(name: string, status: string): Promise<string> {
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550170', 'e2e-call@example.com', 'Henderson', 'phone', ${status}) returning id`;
  return row.id as string;
}

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from leads where name like 'E2E Call %'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

test("logging a booked call from a computer moves the lead to Visit booked", async ({ page }) => {
  const id = await lead(`E2E Call Booked ${STAMP}`, "new");
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);
  await page.getByRole("link", { name: "Log a call" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Call E2E Call Booked ${STAMP}`);

  await page.getByLabel("Shutters").check();
  await page.getByLabel("6-10").check();
  await page.getByLabel("Mid-range").check();
  await page.getByRole("button", { name: "Booked a visit" }).click();
  await page.getByLabel("Visit date and time").fill("2026-10-14T14:00");
  await page.getByRole("button", { name: "Save booked visit" }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${id}$`));
  await expect(page.getByText("Stage:")).toContainText("Visit booked");
  await expect(page.getByText("Call: booked visit Wed 10/14, 2:00 PM · Shutters · 6-10 windows · Mid-range")).toBeVisible();
  const [row] = await sql()`select budget_tier, window_count, treatments from leads where id = ${id}`;
  expect(row).toMatchObject({ budget_tier: "mid", window_count: "6-10", treatments: ["Shutters"] });
});

test("a missed call is logged and the lead stays new", async ({ page }) => {
  const id = await lead(`E2E Call Missed ${STAMP}`, "new");
  await signIn(page);
  await page.goto(`/admin/jobs/${id}/call`);
  await page.getByRole("button", { name: "No answer" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${id}$`));
  await expect(page.getByText("Stage:")).toContainText("New lead");
  await expect(page.getByText("Call: no answer")).toBeVisible();
});

test("a call never moves a job backwards", async ({ page }) => {
  const id = await lead(`E2E Call Quoted ${STAMP}`, "quoted");
  await signIn(page);
  await page.goto(`/admin/jobs/${id}/call`);
  await page.getByRole("button", { name: "Talked, no visit yet" }).click();
  await expect(page.getByText("Stage:")).toContainText("Quoted");
  await expect(page.getByText("Call: talked, no visit yet")).toBeVisible();
});
```

(Check the job page's stage text: if the admin redesign changed "Stage:" in `StageControls`, use the element it renders now — read `app/admin/jobs/[id]/StageControls.tsx` and `e2e/admin.spec.ts` for the current pattern.)

- [ ] **Step 3: Verify**

Run `npx playwright test e2e/call.spec.ts --list` (3 tests, desktop only). Do not run it against any database; the controller runs e2e on a Neon test branch.

- [ ] **Step 4: Full unit suite, typecheck, lint, commit**

```bash
git add e2e/call.spec.ts playwright.config.ts
git commit -m "test: end-to-end lead call flow"
```

---

## Launch (not part of any task: owner approval required)

1. With the owner's explicit OK: `node scripts/migrate.mjs` (applies 006 to production) — before the deploy, since `JOB_COLUMNS` reads `budget_tier`.
2. With the owner's explicit OK: `npx vercel --prod`.
3. Live check: submit a test consultation → the owners' email opens with the tracker link → open it on the phone → "Call …" dials and opens the call screen → book a visit → the job shows Visit booked, the visit time and the call line.
