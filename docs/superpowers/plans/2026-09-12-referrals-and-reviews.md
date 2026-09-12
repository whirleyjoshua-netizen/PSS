# Referrals and Review Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every customer a personal referral link, track who referred whom and the $100 reward, and email each installed customer a review request the morning after installation.

**Architecture:** Everything lives in the existing Next.js 16 site. Migration `003` adds columns to `leads` and widens `job_events.kind`. Pure logic (codes, eligibility, reward status) sits in small tested modules. Database access sits in `server-only` modules that follow `lib/admin/jobs.ts`. A `/r/[code]` route handler sets a cookie and redirects to the contact form. The consultation API attributes the lead. A Vercel Cron job calls a secret-guarded route once a day. The admin job page gains Review request, Referral link, Referred by and Referrals sections.

**Tech Stack:** Next.js 16.3 (App Router, route handlers, Server Actions), `@neondatabase/serverless`, Resend, zod 4, Vitest 4 + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-11-referrals-and-reviews-design.md`

## Global Constraints

- Referral code: 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, matched case-insensitively, generated with a cryptographic random source.
- Referral link: `${business.domain}/r/<CODE>`. Cookie `pss_ref`: `httpOnly`, `sameSite=lax`, `secure` in production, `path=/`, 30 days.
- Reward: $100 (`REFERRAL_REWARD_CENTS = 10000`), owed only once the referred job is `installed`.
- Review window: install date before today and no more than 14 days ago, with dates in `America/Los_Angeles`. Install date is `install_on`, else the Las Vegas date of `stage_changed_at`.
- Cron schedule: `0 17 * * *` in `vercel.json`, path `/api/cron/review-requests`, guarded by `Authorization: Bearer <CRON_SECRET>`.
- Emails are plain text, sent from `LEAD_FROM_EMAIL` (default `leads@premiershadesolutions.com`) with `replyTo: business.email`.
- New settings: `GOOGLE_REVIEW_URL`, `CRON_SECRET`. A missing `GOOGLE_REVIEW_URL` means no review email is sent.
- Every admin Server Action calls `requireAdmin()` before reading its input.
- **Never lose a lead:** referral lookup failures in the consultation API are caught, and the lead is saved unattributed.
- **Local verification on this machine:**
  - Run tests with `npx vitest run --maxWorkers=2` (default parallelism times out).
  - Run `npx tsc --noEmit` and ignore errors under `.next/dev/types`.
  - Run `npx eslint <files>`.
  - Do **not** run `npm run build` locally (it takes ~56 minutes); the Vercel deploy is the build check.
- Another Claude session may commit to `main` in the same folder, so `git add` only the files each task names. Never `git add -A`.
- Read the relevant guide in `node_modules/next/dist/docs/` before using a Next.js API you have not used in this repo (AGENTS.md).

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/003_referrals_reviews.sql` (new) | New `leads` columns, unique code index, widened event kinds |
| `lib/referrals/codes.ts` (new) | Pure: alphabet, `newReferralCode`, `normalizeCode`, `referralUrl`, `rewardStatus`, cookie name and parser, reward constant |
| `lib/referrals/db.ts` (new) | server-only: `ensureReferralCode`, `findReferrer`, `listReferrals`, `markReferralPaid` |
| `lib/reviews/eligibility.ts` (new) | Pure: `installDate`, `isDueForReview` |
| `lib/reviews/db.ts` (new) | server-only: `listReviewCandidates`, `claimReview`, `releaseReview`, `recordReviewSent`, `setReviewOptOut` |
| `lib/reviews/send.ts` (new) | server-only: `reviewEmailText`, `sendReviewEmail`, `sendReviewRequest`, `runDailyReviewRequests` |
| `lib/admin/time.ts` (modify) | Add `lasVegasDate` |
| `lib/admin/jobs.ts` (modify) | New `Job` fields, export `isUuid`, `JobEvent` kinds |
| `lib/leads/schema.ts`, `lib/leads/db.ts`, `lib/leads/referral.ts` (modify) | `referralCode` field, `referred_by` insert, `friend` ref |
| `app/api/consultation/route.ts` (modify) | Resolve the code (body, then cookie) and attribute the lead |
| `app/(site)/r/[code]/route.ts` (new) | Referral link handler |
| `components/forms/ConsultationForm.tsx`, `components/forms/useConsultationForm.ts` (modify) | Hidden code field and "sent you" note |
| `app/api/cron/review-requests/route.ts` (new), `vercel.json` (new) | Daily run and schedule |
| `app/admin/jobs/actions.ts` (modify) | `sendReviewNow`, `saveReviewOptOut`, `createReferralLink`, `payReferral` |
| `app/admin/jobs/[id]/ReviewSection.tsx`, `ReferralSection.tsx`, `ReferralsList.tsx` (new) | Admin UI |
| `app/admin/jobs/[id]/page.tsx`, `app/admin/JobCard.tsx` (modify) | Wire sections, Referred by line, board badge |
| `e2e/admin.spec.ts` (modify) | Referral journey end to end |
| `.env.example` (modify) | Document the new settings |

---

### Task 1: Migration and referral code helpers

**Files:**
- Create: `db/migrations/003_referrals_reviews.sql`
- Create: `lib/referrals/codes.ts`
- Test: `tests/referrals/codes.test.ts`

**Interfaces:**
- Produces:
  - `CODE_ALPHABET: string`, `CODE_LENGTH = 6`, `REFERRAL_REWARD_CENTS = 10000`, `REF_COOKIE = "pss_ref"`, `REF_COOKIE_SECONDS = 2592000`
  - `newReferralCode(bytes?: (n: number) => Uint8Array): string`
  - `normalizeCode(input: string | null | undefined): string | null`
  - `referralUrl(code: string): string`
  - `type RewardStatus = "pending" | "owed" | "paid" | "none"`
  - `rewardStatus(job: { status: Stage; referralPaidAt: Date | null }): RewardStatus`
  - `cookieValue(header: string | null, name: string): string | undefined`

- [ ] **Step 1: Write the migration**

`db/migrations/003_referrals_reviews.sql`:

```sql
-- Portal step 2: customer referral links, referral rewards, and review requests.
--
-- Every statement is safe to re-run: the migrate script applies all files.

alter table leads add column if not exists referral_code       text;
alter table leads add column if not exists referred_by         uuid references leads (id) on delete set null;
alter table leads add column if not exists referral_paid_at    timestamptz;
alter table leads add column if not exists review_requested_at timestamptz;
alter table leads add column if not exists review_opt_out      boolean not null default false;

create unique index if not exists leads_referral_code_idx on leads (referral_code) where referral_code is not null;
create index if not exists leads_referred_by_idx on leads (referred_by);

-- 002 declared the check inline, so Postgres named it job_events_kind_check.
alter table job_events drop constraint if exists job_events_kind_check;
alter table job_events add constraint job_events_kind_check check (
  kind in ('stage','note','edit','email','reward')
);
```

No statement may contain a `;` except at its end: `scripts/migrate.mjs` splits on `;`.

- [ ] **Step 2: Write the failing tests**

`tests/referrals/codes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CODE_ALPHABET, CODE_LENGTH, REFERRAL_REWARD_CENTS, cookieValue, newReferralCode,
  normalizeCode, referralUrl, rewardStatus,
} from "@/lib/referrals/codes";
import { business } from "@/content/business";

describe("newReferralCode", () => {
  it("is six characters from the alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = newReferralCode();
      expect(code).toHaveLength(CODE_LENGTH);
      for (const char of code) expect(CODE_ALPHABET).toContain(char);
    }
  });

  it("never uses characters that are easy to misread", () => {
    for (const char of "0O1I") expect(CODE_ALPHABET).not.toContain(char);
  });

  it("maps each random byte onto the alphabet", () => {
    const bytes = () => new Uint8Array([0, 1, 31, 32, 255, 8]);
    expect(newReferralCode(bytes)).toBe("AB9A9J");
  });
});

describe("normalizeCode", () => {
  it("uppercases and trims what a person retypes", () => {
    expect(normalizeCode("  k7m2qx ")).toBe("K7M2QX");
  });

  it("rejects anything that could not be a code", () => {
    expect(normalizeCode("K7M2Q")).toBeNull();
    expect(normalizeCode("K7M2QX1")).toBeNull();
    expect(normalizeCode("K0M2QX")).toBeNull();
    expect(normalizeCode("")).toBeNull();
    expect(normalizeCode(null)).toBeNull();
    expect(normalizeCode(undefined)).toBeNull();
  });
});

describe("referralUrl", () => {
  it("builds the link from the production domain", () => {
    expect(referralUrl("K7M2QX")).toBe(`${business.domain}/r/K7M2QX`);
  });
});

describe("rewardStatus", () => {
  it("is pending until the referred job is installed", () => {
    expect(rewardStatus({ status: "sold", referralPaidAt: null })).toBe("pending");
  });
  it("is owed once installed and unpaid", () => {
    expect(rewardStatus({ status: "installed", referralPaidAt: null })).toBe("owed");
  });
  it("is paid once marked paid", () => {
    expect(rewardStatus({ status: "installed", referralPaidAt: new Date() })).toBe("paid");
  });
  it("is none for a lost job", () => {
    expect(rewardStatus({ status: "lost", referralPaidAt: null })).toBe("none");
  });
  it("is one hundred dollars", () => {
    expect(REFERRAL_REWARD_CENTS).toBe(10000);
  });
});

describe("cookieValue", () => {
  it("reads one cookie out of a Cookie header", () => {
    expect(cookieValue("a=1; pss_ref=K7M2QX; b=2", "pss_ref")).toBe("K7M2QX");
  });
  it("is undefined when absent", () => {
    expect(cookieValue("a=1", "pss_ref")).toBeUndefined();
    expect(cookieValue(null, "pss_ref")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/referrals/codes.test.ts --maxWorkers=2`
Expected: FAIL, because `@/lib/referrals/codes` does not exist.

- [ ] **Step 4: Implement**

`lib/referrals/codes.ts`:

```ts
import { business } from "@/content/business";
import type { Stage } from "@/lib/admin/stages";

/** 32 characters with no 0/O or 1/I, so a code read aloud or retyped survives. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
export const REFERRAL_REWARD_CENTS = 10000;

export const REF_COOKIE = "pss_ref";
export const REF_COOKIE_SECONDS = 60 * 60 * 24 * 30;

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** 256 is a multiple of 32, so masking each byte to 5 bits is unbiased. */
export function newReferralCode(bytes: (n: number) => Uint8Array = randomBytes): string {
  return Array.from(bytes(CODE_LENGTH), (byte) => CODE_ALPHABET[byte & 31]).join("");
}

export function normalizeCode(input: string | null | undefined): string | null {
  const code = (input ?? "").trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export const referralUrl = (code: string): string => `${business.domain}/r/${code}`;

export type RewardStatus = "pending" | "owed" | "paid" | "none";

export function rewardStatus(job: { status: Stage; referralPaidAt: Date | null }): RewardStatus {
  if (job.referralPaidAt) return "paid";
  if (job.status === "lost") return "none";
  return job.status === "installed" ? "owed" : "pending";
}

/** One cookie from a raw Cookie header. Route handlers get a plain Request in tests. */
export function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/referrals/codes.test.ts --maxWorkers=2`
Expected: PASS. In the byte-mapping test, 0→A, 1→B, 31→9, 32→A, 255→9 and 8→J.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/003_referrals_reviews.sql lib/referrals/codes.ts tests/referrals/codes.test.ts
git commit -m "feat: referral code helpers and migration 003"
```

---

### Task 2: Job fields and referral queries

**Files:**
- Modify: `lib/admin/jobs.ts`
- Modify: `tests/admin/board.test.tsx` and `tests/admin/job-page.test.tsx` (fixtures only)
- Create: `lib/referrals/db.ts`
- Test: `tests/referrals/db.test.ts`

**Interfaces:**
- Consumes: `newReferralCode`, `normalizeCode`, `rewardStatus`, `RewardStatus` (Task 1)
- Produces:
  - On `Job`: `referralCode: string | null`, `referredBy: string | null`, `referralPaidAt: Date | null`, `reviewRequestedAt: Date | null`, `reviewOptOut: boolean`
  - `JobEvent["kind"]`: `"stage" | "note" | "edit" | "email" | "reward"`
  - `isUuid(id: string): boolean` exported from `lib/admin/jobs.ts`
  - `JOB_COLUMNS: string` and `toJob(row)` exported from `lib/admin/jobs.ts`
  - `ensureReferralCode(id: string): Promise<string | null>`
  - `findReferrer(code: string): Promise<{ id: string; code: string; firstName: string } | null>`
  - `type Referral = { id: string; name: string; status: Stage; referralPaidAt: Date | null; reward: RewardStatus }`
  - `listReferrals(referrerId: string): Promise<Referral[]>`
  - `markReferralPaid(referredId: string, actor: string): Promise<boolean>`

- [ ] **Step 1: Extend `Job` in `lib/admin/jobs.ts`**

Make these changes:

1. Add these five fields to `type Job`, after `lostReason`:

```ts
  referralCode: string | null;
  referredBy: string | null;
  referralPaidAt: Date | null;
  reviewRequestedAt: Date | null;
  reviewOptOut: boolean;
```

2. In `type JobEvent`, change `kind` to `"stage" | "note" | "edit" | "email" | "reward";`.

3. Replace the `UUID` constant with an exported helper, and replace every `UUID.test(id)` in the file with `isUuid(id)`:

```ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string): boolean => UUID.test(id);
```

4. Rename `COLUMNS` to `JOB_COLUMNS`, export it, and append the new columns. Update both uses of `${COLUMNS}` to `${JOB_COLUMNS}`:

```ts
export const JOB_COLUMNS = `id, created_at, name, phone, email, address, city, treatments, window_count,
  heard_via, notes, source, status, stage_changed_at, visit_at, quote_cents, sold_cents,
  deposit_cents, brands, ordered_on::text as ordered_on, install_on::text as install_on, lost_reason,
  referral_code, referred_by, referral_paid_at, review_requested_at, review_opt_out`;
```

5. Export `toJob` (`export function toJob`) and add the fields to its return object, after `lostReason`:

```ts
    referralCode: (row.referral_code as string | null) ?? null,
    referredBy: (row.referred_by as string | null) ?? null,
    referralPaidAt: row.referral_paid_at ? new Date(row.referral_paid_at as string) : null,
    reviewRequestedAt: row.review_requested_at ? new Date(row.review_requested_at as string) : null,
    reviewOptOut: row.review_opt_out === true,
```

- [ ] **Step 2: Update the test fixtures that build a `Job`**

In `tests/admin/board.test.tsx` (the `job()` factory) and `tests/admin/job-page.test.tsx` (the `job` constant), add after `lostReason: null,`:

```ts
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
```

Then run `npx vitest run tests/admin --maxWorkers=2`. Expected: PASS, since only the types changed.

- [ ] **Step 3: Write the failing tests for `lib/referrals/db.ts`**

`tests/referrals/db.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const referrals = await import("@/lib/referrals/db");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  sql.query.mockReset().mockResolvedValue([]);
});

describe("ensureReferralCode", () => {
  it("returns the existing code without writing", async () => {
    sql.mockResolvedValueOnce([{ referral_code: "K7M2QX" }]);
    expect(await referrals.ensureReferralCode(ID)).toBe("K7M2QX");
    expect(sql).toHaveBeenCalledOnce();
  });

  it("creates a code when the job has none", async () => {
    sql.mockResolvedValueOnce([{ referral_code: null }]);
    sql.mockImplementationOnce(async (_strings: TemplateStringsArray, code: string) => [{ referral_code: code }]);
    const code = await referrals.ensureReferralCode(ID);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(text(sql.mock.calls[1])).toContain("referral_code is null");
  });

  it("retries when a new code collides with another job's", async () => {
    sql.mockResolvedValueOnce([{ referral_code: null }]);
    sql.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "23505" }));
    sql.mockImplementationOnce(async (_strings: TemplateStringsArray, code: string) => [{ referral_code: code }]);
    expect(await referrals.ensureReferralCode(ID)).toMatch(/^[A-Z2-9]{6}$/);
    expect(sql).toHaveBeenCalledTimes(3);
  });

  it("returns null for a missing job or a non-uuid id", async () => {
    expect(await referrals.ensureReferralCode(ID)).toBeNull();
    expect(await referrals.ensureReferralCode("../etc")).toBeNull();
  });
});

describe("findReferrer", () => {
  it("resolves a retyped code to the job and its first name", async () => {
    sql.mockResolvedValueOnce([{ id: ID, referral_code: "K7M2QX", name: "Sarah Lopez" }]);
    expect(await referrals.findReferrer(" k7m2qx ")).toEqual({ id: ID, code: "K7M2QX", firstName: "Sarah" });
    expect(sql.mock.calls[0]).toContain("K7M2QX");
  });

  it("returns null for a malformed code without querying", async () => {
    expect(await referrals.findReferrer("nope")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns null for an unknown code", async () => {
    expect(await referrals.findReferrer("K7M2QX")).toBeNull();
  });
});

describe("listReferrals", () => {
  it("lists referred jobs with their reward status", async () => {
    sql.mockResolvedValueOnce([
      { id: "a", name: "Ana", status: "sold", referral_paid_at: null },
      { id: "b", name: "Ben", status: "installed", referral_paid_at: null },
      { id: "c", name: "Cy", status: "installed", referral_paid_at: new Date("2026-09-01T00:00:00Z") },
    ]);
    const list = await referrals.listReferrals(ID);
    expect(list.map((r) => r.reward)).toEqual(["pending", "owed", "paid"]);
  });
});

describe("markReferralPaid", () => {
  it("pays and logs on the referrer's job in one statement", async () => {
    sql.mockResolvedValueOnce([{ id: "event" }]);
    expect(await referrals.markReferralPaid(ID, "owner@example.com")).toBe(true);
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("status = 'installed'");
    expect(statement).toContain("referral_paid_at is null");
    expect(statement).toContain("insert into job_events");
  });

  it("returns false when the reward is not owed", async () => {
    expect(await referrals.markReferralPaid(ID, "owner@example.com")).toBe(false);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/referrals/db.test.ts --maxWorkers=2`
Expected: FAIL, because `@/lib/referrals/db` does not exist.

- [ ] **Step 5: Implement**

`lib/referrals/db.ts`:

```ts
import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import type { Stage } from "@/lib/admin/stages";
import { newReferralCode, normalizeCode, rewardStatus, type RewardStatus } from "./codes";

const UNIQUE_VIOLATION = "23505";

/** The job's code, created on first use. Null if the job does not exist. */
export async function ensureReferralCode(id: string): Promise<string | null> {
  if (!isUuid(id)) return null;
  const sql = db();
  const rows = await sql`select referral_code from leads where id = ${id}`;
  if (!rows[0]) return null;
  if (rows[0].referral_code) return rows[0].referral_code as string;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const code = newReferralCode();
      const set = await sql`
        update leads set referral_code = ${code}, updated_at = now()
        where id = ${id} and referral_code is null
        returning referral_code`;
      if (set[0]) return set[0].referral_code as string;
      // Another request gave this job a code first; use that one.
      const again = await sql`select referral_code from leads where id = ${id}`;
      return (again[0]?.referral_code as string | undefined) ?? null;
    } catch (error) {
      if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
    }
  }
  throw new Error("Could not create a unique referral code");
}

export async function findReferrer(
  input: string,
): Promise<{ id: string; code: string; firstName: string } | null> {
  const code = normalizeCode(input);
  if (!code) return null;
  const rows = await db()`select id, referral_code, name from leads where referral_code = ${code}`;
  if (!rows[0]) return null;
  return {
    id: rows[0].id as string,
    code: rows[0].referral_code as string,
    firstName: (rows[0].name as string).trim().split(/\s+/)[0],
  };
}

export type Referral = {
  id: string;
  name: string;
  status: Stage;
  referralPaidAt: Date | null;
  reward: RewardStatus;
};

export async function listReferrals(referrerId: string): Promise<Referral[]> {
  if (!isUuid(referrerId)) return [];
  const rows = await db()`
    select id, name, status, referral_paid_at from leads
    where referred_by = ${referrerId} order by created_at`;
  return rows.map((row) => {
    const job = {
      status: row.status as Stage,
      referralPaidAt: row.referral_paid_at ? new Date(row.referral_paid_at as string) : null,
    };
    return { id: row.id as string, name: row.name as string, ...job, reward: rewardStatus(job) };
  });
}

/**
 * Marks the reward for a referred job paid, and logs it on the referrer's job.
 * Refuses (returns false) unless the job is installed, unpaid, and referred.
 */
export async function markReferralPaid(referredId: string, actor: string): Promise<boolean> {
  if (!isUuid(referredId)) return false;
  const rows = await db()`
    with paid as (
      update leads set referral_paid_at = now(), updated_at = now()
      where id = ${referredId} and status = 'installed'
        and referral_paid_at is null and referred_by is not null
      returning referred_by, name
    )
    insert into job_events (lead_id, actor, kind, body)
    select referred_by, ${actor}, 'reward', 'Referral reward paid for ' || name from paid
    returning id`;
  return rows.length > 0;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/referrals tests/admin --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/admin/jobs.ts lib/referrals/db.ts tests/referrals/db.test.ts tests/admin/board.test.tsx tests/admin/job-page.test.tsx
git commit -m "feat: referral fields on jobs and referral queries"
```

---

### Task 3: Referral link route and contact form prefill

**Files:**
- Create: `app/(site)/r/[code]/route.ts`
- Modify: `lib/leads/referral.ts`, `lib/leads/schema.ts`, `components/forms/useConsultationForm.ts`, `components/forms/ConsultationForm.tsx`
- Test: `tests/referrals/link-route.test.ts`, `tests/forms/referral.test.tsx` (extend)

**Interfaces:**
- Consumes: `findReferrer` (Task 2); `REF_COOKIE`, `REF_COOKIE_SECONDS` (Task 1)
- Produces:
  - `consultationSchema` gains `referralCode?: string`
  - The form posts `referralCode` when the page was opened from a referral link
  - `REFERRAL_SOURCES.friend = "Referral from a friend"`

First read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (Dynamic Route Segments) and `.../04-functions/next-response.md` (`redirect`, `cookies`).

- [ ] **Step 1: Write the failing route tests**

`tests/referrals/link-route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findReferrer = vi.fn();
vi.mock("@/lib/referrals/db", () => ({ findReferrer }));

const { GET } = await import("@/app/(site)/r/[code]/route");
const open = (code: string) =>
  GET(new NextRequest(`https://premiershadesolutions.com/r/${code}`), { params: Promise.resolve({ code }) });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  findReferrer.mockReset();
});

describe("GET /r/[code]", () => {
  it("remembers the code and sends the friend to the contact form", async () => {
    findReferrer.mockResolvedValue({ id: "x", code: "K7M2QX", firstName: "Sarah" });
    const response = await open("k7m2qx");
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/contact");
    expect(location.searchParams.get("ref")).toBe("friend");
    expect(location.searchParams.get("r")).toBe("K7M2QX");
    expect(location.searchParams.get("by")).toBe("Sarah");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("pss_ref=K7M2QX");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie).toContain("Max-Age=2592000");
  });

  it("sends an unknown code to the plain contact form with no cookie", async () => {
    findReferrer.mockResolvedValue(null);
    const response = await open("ZZZZZZ");
    expect(new URL(response.headers.get("location")!).search).toBe("");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("still lands on the contact form when the database is down", async () => {
    findReferrer.mockRejectedValue(new Error("Neon down"));
    const response = await open("K7M2QX");
    expect(new URL(response.headers.get("location")!).pathname).toBe("/contact");
  });
});
```

- [ ] **Step 2: Add form tests** to the end of `tests/forms/referral.test.tsx`:

```tsx
describe("ConsultationForm friend referral", () => {
  it("prefills the friend source, shows who sent them, and posts the code", async () => {
    visit("?ref=friend&r=K7M2QX&by=Sarah");
    const { container } = render(<ConsultationForm />);

    await waitFor(() =>
      expect(screen.getByLabelText(/how did you hear/i)).toHaveValue("Referral from a friend"),
    );
    expect(screen.getByText("Sarah sent you.")).toBeInTheDocument();
    expect(container.querySelector('input[name="referralCode"]')).toHaveValue("K7M2QX");
  });

  it("renders no code field without a referral", () => {
    visit("");
    const { container } = render(<ConsultationForm />);
    expect(container.querySelector('input[name="referralCode"]')).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/referrals/link-route.test.ts tests/forms/referral.test.tsx --maxWorkers=2`
Expected: FAIL. The route module is missing, and the form has no friend handling.

- [ ] **Step 4: Implement the route**

`app/(site)/r/[code]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { findReferrer } from "@/lib/referrals/db";
import { REF_COOKIE, REF_COOKIE_SECONDS } from "@/lib/referrals/codes";

/**
 * A customer's personal referral link. Remembers the code for 30 days, so a
 * friend who browses first and books later is still attributed, then opens
 * the consultation form. An unknown code quietly opens the plain form.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const referrer = await findReferrer(code).catch((error) => {
    console.error("Referral lookup failed", error);
    return null;
  });

  const contact = new URL("/contact", request.url);
  if (!referrer) return NextResponse.redirect(contact);

  contact.searchParams.set("ref", "friend");
  contact.searchParams.set("r", referrer.code);
  contact.searchParams.set("by", referrer.firstName);

  const response = NextResponse.redirect(contact);
  response.cookies.set(REF_COOKIE, referrer.code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: REF_COOKIE_SECONDS,
  });
  return response;
}
```

- [ ] **Step 5: Implement the form changes**

`lib/leads/referral.ts`: add `friend` to `REFERRAL_SOURCES`, after `show`:

```ts
  friend: "Referral from a friend",
```

`lib/leads/schema.ts`: add after `notes`:

```ts
  /** A customer's referral code, from a /r/<code> link. Resolved on the server. */
  referralCode: z.string().trim().max(20).optional(),
```

`components/forms/useConsultationForm.ts`: add to `payload`, after `notes`:

```ts
      referralCode: str(data.get("referralCode")),
```

`components/forms/ConsultationForm.tsx`:

1. Next to the `heardVia` state, add:

```tsx
  const [referral, setReferral] = useState<{ code: string; by: string | null } | null>(null);
```

2. Replace the `useEffect` body with:

```tsx
    const params = new URLSearchParams(window.location.search);
    const label = referralLabel(params.get("ref"));
    if (label) setHeardVia(label);
    const code = params.get("r");
    if (code) setReferral({ code: code.slice(0, 20), by: params.get("by")?.slice(0, 40) || null });
```

3. Directly after `<Honeypot />`, add:

```tsx
      {referral ? (
        <>
          <input type="hidden" name="referralCode" value={referral.code} />
          {referral.by ? (
            <p className="border-l-2 border-champagne pl-4 text-sm text-ink-soft">{referral.by} sent you.</p>
          ) : null}
        </>
      ) : null}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/referrals tests/forms tests/leads --maxWorkers=2`
Expected: PASS. The existing "only maps to labels the form actually offers" test also passes, because `HEARD_VIA_OPTIONS` already contains "Referral from a friend".

- [ ] **Step 7: Commit**

```bash
git add "app/(site)/r/[code]/route.ts" lib/leads/referral.ts lib/leads/schema.ts components/forms/useConsultationForm.ts components/forms/ConsultationForm.tsx tests/referrals/link-route.test.ts tests/forms/referral.test.tsx
git commit -m "feat: customer referral links open a prefilled consultation form"
```

---

### Task 4: Attribute consultation leads to their referrer

**Files:**
- Modify: `lib/leads/db.ts`, `app/api/consultation/route.ts`
- Test: `tests/leads/referral-route.test.ts`

**Interfaces:**
- Consumes: `findReferrer` (Task 2); `REF_COOKIE`, `cookieValue` (Task 1)
- Produces: `insertLead(input: ConsultationInput & { referredBy?: string | null })`, which writes `referred_by`

- [ ] **Step 1: Write the failing tests**

`tests/leads/referral-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertLead = vi.fn();
const findReferrer = vi.fn();
vi.mock("@/lib/leads/db", () => ({ insertLead }));
vi.mock("@/lib/leads/email", () => ({
  sendLeadNotification: vi.fn(async () => {}),
  sendCustomerConfirmation: vi.fn(async () => {}),
}));
vi.mock("@/lib/referrals/db", () => ({ findReferrer }));

const { POST } = await import("@/app/api/consultation/route");
const REFERRER = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const body = { name: "Ana Diaz", phone: "7025550199", email: "ana@example.com", city: "Henderson", source: "hero" };

const request = (payload: unknown, cookie?: string) =>
  new Request("http://localhost/api/consultation", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  insertLead.mockReset().mockResolvedValue({ id: "new" });
  findReferrer.mockReset().mockResolvedValue({ id: REFERRER, code: "K7M2QX", firstName: "Sarah" });
});

describe("referral attribution", () => {
  it("links the lead to the referrer from the form's code", async () => {
    await POST(request({ ...body, referralCode: "K7M2QX" }));
    expect(findReferrer).toHaveBeenCalledWith("K7M2QX");
    expect(insertLead).toHaveBeenCalledWith(
      expect.objectContaining({ referredBy: REFERRER, heardVia: "Referral from a friend" }),
    );
  });

  it("falls back to the remembered cookie, for the homepage form", async () => {
    await POST(request(body, "pss_ref=K7M2QX"));
    expect(findReferrer).toHaveBeenCalledWith("K7M2QX");
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ referredBy: REFERRER }));
  });

  it("prefers the form's code over the cookie", async () => {
    await POST(request({ ...body, referralCode: "AAAAAA" }, "pss_ref=K7M2QX"));
    expect(findReferrer).toHaveBeenCalledWith("AAAAAA");
  });

  it("keeps a how-did-you-hear answer the visitor chose", async () => {
    await POST(request({ ...body, referralCode: "K7M2QX", heardVia: "Google search" }));
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ heardVia: "Google search" }));
  });

  it("saves an unknown code's lead unattributed", async () => {
    findReferrer.mockResolvedValue(null);
    const response = await POST(request({ ...body, referralCode: "ZZZZZZ" }));
    expect(response.status).toBe(201);
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ referredBy: null }));
  });

  it("never loses the lead when the referral lookup fails", async () => {
    findReferrer.mockRejectedValue(new Error("Neon down"));
    const response = await POST(request({ ...body, referralCode: "K7M2QX" }));
    expect(response.status).toBe(201);
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ referredBy: null }));
  });

  it("does not look anything up without a code", async () => {
    await POST(request(body));
    expect(findReferrer).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/leads/referral-route.test.ts --maxWorkers=2`
Expected: FAIL. `findReferrer` is never called.

- [ ] **Step 3: Implement**

`lib/leads/db.ts`: change the signature and the insert:

```ts
export async function insertLead(
  input: ConsultationInput & { referredBy?: string | null },
): Promise<{ id: string }> {
  const sql = db();

  const rows = await sql`
    insert into leads
      (name, phone, email, address, city, treatments, window_count, heard_via, notes, source, referred_by)
    values
      (${input.name}, ${input.phone}, ${input.email}, ${input.address ?? null},
       ${input.city}, ${input.treatments ?? []}, ${input.windowCount ?? null},
       ${input.heardVia ?? null}, ${input.notes ?? null}, ${input.source}, ${input.referredBy ?? null})
    returning id
  `;
```

The rest of the function is unchanged.

`app/api/consultation/route.ts`:

1. Add imports:

```ts
import { findReferrer } from "@/lib/referrals/db";
import { REF_COOKIE, cookieValue } from "@/lib/referrals/codes";
```

2. After the `if (!parsed.success) { ... }` block, and before `Promise.allSettled`, add:

```ts
  // A referral never blocks a lead: any lookup failure saves it unattributed.
  const code = parsed.data.referralCode ?? cookieValue(request.headers.get("cookie"), REF_COOKIE);
  const referrer = code
    ? await findReferrer(code).catch((error) => {
        console.error("Referral lookup failed", error);
        return null;
      })
    : null;
  const lead = {
    ...parsed.data,
    heardVia: parsed.data.heardVia ?? (referrer ? "Referral from a friend" : undefined),
    referredBy: referrer?.id ?? null,
  };
```

3. Change `insertLead(parsed.data)` to `insertLead(lead)`, and change `sendLeadNotification(parsed.data)` to `sendLeadNotification(lead)`, so the owner email shows the referral in "Heard via".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/leads --maxWorkers=2`
Expected: PASS, including the existing `tests/leads/route.test.ts`. Its `objectContaining` assertions tolerate the new keys, and with no code and no cookie, `findReferrer` is never called.

- [ ] **Step 5: Commit**

```bash
git add lib/leads/db.ts app/api/consultation/route.ts tests/leads/referral-route.test.ts
git commit -m "feat: consultation leads record the customer who referred them"
```

---

### Task 5: Review request eligibility

**Files:**
- Modify: `lib/admin/time.ts`
- Create: `lib/reviews/eligibility.ts`
- Test: `tests/reviews/eligibility.test.ts`

Note: `tests/reviews.test.tsx` already exists and tests the customer reviews section of the site. The new tests go in the `tests/reviews/` folder.

**Interfaces:**
- Produces:
  - `lasVegasDate(date: Date): string` (`YYYY-MM-DD`) in `lib/admin/time.ts`
  - `type ReviewCandidate = Pick<Job, "status" | "email" | "reviewRequestedAt" | "reviewOptOut" | "installOn" | "stageChangedAt">`
  - `installDate(job: ReviewCandidate): string`
  - `isDueForReview(job: ReviewCandidate, now: Date): boolean`
  - `REVIEW_WINDOW_DAYS = 14`

- [ ] **Step 1: Write the failing tests**

`tests/reviews/eligibility.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lasVegasDate } from "@/lib/admin/time";
import { installDate, isDueForReview, type ReviewCandidate } from "@/lib/reviews/eligibility";

// 17:00 UTC on Sep 12 is 10 a.m. Sep 12 in Las Vegas, when the cron runs.
const NOW = new Date("2026-09-12T17:00:00Z");
const job = (overrides: Partial<ReviewCandidate>): ReviewCandidate => ({
  status: "installed", email: "dana@example.com", reviewRequestedAt: null, reviewOptOut: false,
  installOn: "2026-09-11", stageChangedAt: new Date("2026-09-11T20:00:00Z"), ...overrides,
});

describe("lasVegasDate", () => {
  it("uses the Las Vegas calendar day, not UTC", () => {
    // 03:00 UTC on Sep 12 is still 8 p.m. Sep 11 in Las Vegas.
    expect(lasVegasDate(new Date("2026-09-12T03:00:00Z"))).toBe("2026-09-11");
  });
});

describe("installDate", () => {
  it("prefers the install date the owners entered", () => {
    expect(installDate(job({ installOn: "2026-09-05" }))).toBe("2026-09-05");
  });
  it("falls back to the Las Vegas day the job moved to Installed", () => {
    expect(installDate(job({ installOn: null, stageChangedAt: new Date("2026-09-11T03:00:00Z") }))).toBe("2026-09-10");
  });
});

describe("isDueForReview", () => {
  it("is due the morning after installation", () => {
    expect(isDueForReview(job({}), NOW)).toBe(true);
  });
  it("is not due on installation day", () => {
    expect(isDueForReview(job({ installOn: "2026-09-12" }), NOW)).toBe(false);
  });
  it("is still due up to 14 days later, so a failed send is retried", () => {
    expect(isDueForReview(job({ installOn: "2026-08-29" }), NOW)).toBe(true);
  });
  it("is not due after 14 days, so launch does not email every past customer", () => {
    expect(isDueForReview(job({ installOn: "2026-08-28" }), NOW)).toBe(false);
  });
  it("is not due before the job is installed", () => {
    expect(isDueForReview(job({ status: "ordered" }), NOW)).toBe(false);
  });
  it("is not due without an email address", () => {
    expect(isDueForReview(job({ email: null }), NOW)).toBe(false);
  });
  it("is not due once sent", () => {
    expect(isDueForReview(job({ reviewRequestedAt: new Date() }), NOW)).toBe(false);
  });
  it("is not due when the owners turned it off", () => {
    expect(isDueForReview(job({ reviewOptOut: true }), NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/reviews --maxWorkers=2`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 3: Implement**

Append to `lib/admin/time.ts`:

```ts
/** The Las Vegas calendar date of an instant, as YYYY-MM-DD. */
export const lasVegasDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
```

`lib/reviews/eligibility.ts`:

```ts
import type { Job } from "@/lib/admin/jobs";
import { lasVegasDate } from "@/lib/admin/time";

export const REVIEW_WINDOW_DAYS = 14;

export type ReviewCandidate = Pick<
  Job, "status" | "email" | "reviewRequestedAt" | "reviewOptOut" | "installOn" | "stageChangedAt"
>;

export const installDate = (job: ReviewCandidate): string =>
  job.installOn ?? lasVegasDate(job.stageChangedAt);

/** YYYY-MM-DD strings compare correctly as text, so no Date math is needed past this. */
function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Whether the daily run should email this job today. */
export function isDueForReview(job: ReviewCandidate, now: Date): boolean {
  if (job.status !== "installed" || !job.email || job.reviewRequestedAt || job.reviewOptOut) return false;
  const today = lasVegasDate(now);
  const installed = installDate(job);
  return installed < today && installed >= daysBefore(today, REVIEW_WINDOW_DAYS);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/reviews tests/admin --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/time.ts lib/reviews/eligibility.ts tests/reviews/eligibility.test.ts
git commit -m "feat: review request eligibility in Las Vegas days"
```

---

### Task 6: Review email and sending

**Files:**
- Create: `lib/reviews/db.ts`, `lib/reviews/send.ts`
- Test: `tests/reviews/send.test.ts`, `tests/reviews/db.test.ts`

**Interfaces:**
- Consumes: `Job`, `JOB_COLUMNS`, `toJob`, `isUuid` (Task 2); `ensureReferralCode` (Task 2); `referralUrl` (Task 1); `isDueForReview` (Task 5)
- Produces:
  - `listReviewCandidates(): Promise<Job[]>`
  - `claimReview(id: string): Promise<boolean>`
  - `releaseReview(id: string): Promise<void>`
  - `recordReviewSent(id: string, actor: string): Promise<void>`
  - `setReviewOptOut(id: string, optOut: boolean, actor: string): Promise<boolean>`
  - `reviewEmailText(input: { firstName: string; reviewUrl: string; referralLink: string }): string`
  - `sendReviewRequest(job: Job, actor: string): Promise<void>`, which throws on missing config or a Resend error
  - `runDailyReviewRequests(now?: Date): Promise<{ sent: number; failed: number; error?: string }>`

- [ ] **Step 1: Write the failing database tests**

`tests/reviews/db.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const reviews = await import("@/lib/reviews/db");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  sql.query.mockReset().mockResolvedValue([]);
});

describe("review request records", () => {
  it("lists only installed, unsent, emailable jobs from the last few weeks", async () => {
    await reviews.listReviewCandidates();
    const statement = sql.query.mock.calls[0][0] as string;
    expect(statement).toContain("status = 'installed'");
    expect(statement).toContain("review_requested_at is null");
    expect(statement).toContain("not review_opt_out");
  });

  it("claims a job only if nobody else has", async () => {
    sql.mockResolvedValueOnce([{ id: ID }]);
    expect(await reviews.claimReview(ID)).toBe(true);
    expect(text(sql.mock.calls[0])).toContain("review_requested_at is null");
    expect(await reviews.claimReview(ID)).toBe(false);
  });

  it("records a send with an email event", async () => {
    await reviews.recordReviewSent(ID, "system");
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("review_requested_at = now()");
    expect(statement).toContain("'email'");
  });

  it("turns review requests off and logs it", async () => {
    sql.mockResolvedValueOnce([{ id: "event" }]);
    expect(await reviews.setReviewOptOut(ID, true, "owner@example.com")).toBe(true);
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([true, "owner@example.com"]));
  });

  it("ignores ids that are not uuids", async () => {
    expect(await reviews.claimReview("../etc")).toBe(false);
    expect(await reviews.setReviewOptOut("../etc", true, "x")).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing send tests**

`tests/reviews/send.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "@/lib/admin/jobs";

const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
const reviewsDb = {
  listReviewCandidates: vi.fn(), claimReview: vi.fn(), releaseReview: vi.fn(), recordReviewSent: vi.fn(),
};
vi.mock("@/lib/reviews/db", () => reviewsDb);
const ensureReferralCode = vi.fn();
vi.mock("@/lib/referrals/db", () => ({ ensureReferralCode }));

const { reviewEmailText, runDailyReviewRequests, sendReviewRequest } = await import("@/lib/reviews/send");
const { business } = await import("@/content/business");

const NOW = new Date("2026-09-12T17:00:00Z");
const job = (overrides: Partial<Job> = {}): Job => ({
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date(), name: "Dana Reyes",
  phone: "7025550134", email: "dana@example.com", address: null, city: "Henderson", treatments: [],
  windowCount: null, heardVia: null, notes: null, source: "contact", status: "installed",
  stageChangedAt: new Date("2026-09-11T20:00:00Z"), visitAt: null, quoteCents: null, soldCents: null,
  depositCents: null, brands: [], orderedOn: null, installOn: "2026-09-11", lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
  ...overrides,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  send.mockReset().mockResolvedValue({ error: null });
  Object.values(reviewsDb).forEach((fn) => fn.mockReset());
  reviewsDb.claimReview.mockResolvedValue(true);
  ensureReferralCode.mockReset().mockResolvedValue("K7M2QX");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("GOOGLE_REVIEW_URL", "https://g.page/r/example/review");
});

describe("reviewEmailText", () => {
  it("thanks them by first name and carries both links and the reward", () => {
    const text = reviewEmailText({
      firstName: "Dana", reviewUrl: "https://g.page/r/example/review", referralLink: `${business.domain}/r/K7M2QX`,
    });
    expect(text).toMatch(/^Hi Dana,/);
    expect(text).toContain("https://g.page/r/example/review");
    expect(text).toContain(`${business.domain}/r/K7M2QX`);
    expect(text).toContain("$100");
  });
});

describe("sendReviewRequest", () => {
  it("emails the customer from the business and records the send", async () => {
    await sendReviewRequest(job(), "owner@example.com");
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("dana@example.com");
    expect(message.replyTo).toBe(business.email);
    expect(message.subject).toBe("Thank you from Premier Shade Solutions, Dana");
    expect(message.text).toContain("/r/K7M2QX");
    expect(reviewsDb.recordReviewSent).toHaveBeenCalledWith(job().id, "owner@example.com");
  });

  it("refuses to send without the Google review link", async () => {
    vi.stubEnv("GOOGLE_REVIEW_URL", "");
    await expect(sendReviewRequest(job(), "x")).rejects.toThrow(/GOOGLE_REVIEW_URL/);
    expect(send).not.toHaveBeenCalled();
  });

  it("throws when Resend rejects the message, without recording it", async () => {
    send.mockResolvedValue({ error: { message: "domain not verified" } });
    await expect(sendReviewRequest(job(), "x")).rejects.toThrow(/domain not verified/);
    expect(reviewsDb.recordReviewSent).not.toHaveBeenCalled();
  });
});

describe("runDailyReviewRequests", () => {
  it("emails each job that is due, and skips the rest", async () => {
    reviewsDb.listReviewCandidates.mockResolvedValue([job(), job({ id: "b", installOn: "2026-09-12" })]);
    expect(await runDailyReviewRequests(NOW)).toEqual({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledOnce();
  });

  it("skips a job another run already claimed", async () => {
    reviewsDb.listReviewCandidates.mockResolvedValue([job()]);
    reviewsDb.claimReview.mockResolvedValue(false);
    expect(await runDailyReviewRequests(NOW)).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("releases the claim when a send fails, so tomorrow retries", async () => {
    reviewsDb.listReviewCandidates.mockResolvedValue([job()]);
    send.mockResolvedValue({ error: { message: "rate limited" } });
    expect(await runDailyReviewRequests(NOW)).toEqual({ sent: 0, failed: 1 });
    expect(reviewsDb.releaseReview).toHaveBeenCalledWith(job().id);
  });

  it("sends nothing when the Google review link is not set", async () => {
    vi.stubEnv("GOOGLE_REVIEW_URL", "");
    const result = await runDailyReviewRequests(NOW);
    expect(result).toMatchObject({ sent: 0, failed: 0, error: expect.stringMatching(/GOOGLE_REVIEW_URL/) });
    expect(reviewsDb.listReviewCandidates).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/reviews --maxWorkers=2`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 4: Implement `lib/reviews/db.ts`**

```ts
import "server-only";
import { db } from "@/lib/db";
import { JOB_COLUMNS, isUuid, toJob, type Job } from "@/lib/admin/jobs";

/**
 * A coarse database filter. The exact Las Vegas date window is applied by
 * isDueForReview, which is tested apart from SQL.
 */
export async function listReviewCandidates(): Promise<Job[]> {
  const rows = await db().query(
    `select ${JOB_COLUMNS} from leads
     where status = 'installed' and email is not null
       and review_requested_at is null and not review_opt_out
       and coalesce(install_on, stage_changed_at::date) >= current_date - 16`,
  );
  return rows.map(toJob);
}

/** Marks the job as being sent. Only one caller can win, so a job never gets two emails. */
export async function claimReview(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db()`
    update leads set review_requested_at = now()
    where id = ${id} and review_requested_at is null
    returning id`;
  return rows.length > 0;
}

export async function releaseReview(id: string): Promise<void> {
  if (!isUuid(id)) return;
  await db()`update leads set review_requested_at = null where id = ${id}`;
}

/** Stamps the send and logs it in one statement. */
export async function recordReviewSent(id: string, actor: string): Promise<void> {
  if (!isUuid(id)) return;
  await db()`
    with sent as (
      update leads set review_requested_at = now(), updated_at = now()
      where id = ${id} returning id
    )
    insert into job_events (lead_id, actor, kind, body)
    select id, ${actor}, 'email', 'Review request sent' from sent`;
}

export async function setReviewOptOut(id: string, optOut: boolean, actor: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const body = optOut ? "Turned off the review request" : "Turned the review request back on";
  const rows = await db()`
    with changed as (
      update leads set review_opt_out = ${optOut}, updated_at = now()
      where id = ${id} returning id
    )
    insert into job_events (lead_id, actor, kind, body)
    select id, ${actor}, 'edit', ${body} from changed
    returning id`;
  return rows.length > 0;
}
```

- [ ] **Step 5: Implement `lib/reviews/send.ts`**

```ts
import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import type { Job } from "@/lib/admin/jobs";
import { ensureReferralCode } from "@/lib/referrals/db";
import { referralUrl } from "@/lib/referrals/codes";
import { claimReview, listReviewCandidates, recordReviewSent, releaseReview } from "./db";
import { isDueForReview } from "./eligibility";

/** Plain text, like the other customer emails, so it reads the same on every phone. */
export function reviewEmailText(input: { firstName: string; reviewUrl: string; referralLink: string }): string {
  return [
    `Hi ${input.firstName},`,
    "",
    `Thank you for choosing ${business.name}. We hope you are enjoying your new window treatments.`,
    "",
    "If you have a minute, a Google review helps other Las Vegas families find a local installer they can trust:",
    input.reviewUrl,
    "",
    "Know someone who could use new window treatments? Share your personal link. When a friend books through it and their installation is done, we send you $100 as a thank-you:",
    input.referralLink,
    "",
    `Anything not quite right? Reply to this email or call ${business.phone.display} and we will make it right.`,
    "",
    business.name,
    business.domain,
  ].join("\n");
}

/** Sends one job's review request and records it. Throws on missing config or a rejected send. */
export async function sendReviewRequest(job: Job, actor: string): Promise<void> {
  const reviewUrl = process.env.GOOGLE_REVIEW_URL;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!reviewUrl) throw new Error("GOOGLE_REVIEW_URL is not set");
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!job.email) throw new Error("This job has no email address");

  const code = await ensureReferralCode(job.id);
  if (!code) throw new Error("That job no longer exists");

  const firstName = job.name.trim().split(/\s+/)[0];
  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to: job.email,
    replyTo: business.email,
    subject: `Thank you from ${business.name}, ${firstName}`,
    text: reviewEmailText({ firstName, reviewUrl, referralLink: referralUrl(code) }),
  });
  if (error) throw new Error(`Resend rejected the review request: ${error.message}`);

  await recordReviewSent(job.id, actor);
}

/** The daily cron run: emails every job that is due, one claim at a time. */
export async function runDailyReviewRequests(
  now: Date = new Date(),
): Promise<{ sent: number; failed: number; error?: string }> {
  if (!process.env.GOOGLE_REVIEW_URL) {
    console.error("Review requests skipped: GOOGLE_REVIEW_URL is not set");
    return { sent: 0, failed: 0, error: "GOOGLE_REVIEW_URL is not set" };
  }

  let sent = 0;
  let failed = 0;
  for (const job of await listReviewCandidates()) {
    if (!isDueForReview(job, now)) continue;
    if (!(await claimReview(job.id))) continue;
    try {
      await sendReviewRequest(job, "system");
      sent++;
    } catch (error) {
      console.error(`Review request failed for job ${job.id}`, error);
      await releaseReview(job.id);
      failed++;
    }
  }
  return { sent, failed };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/reviews --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/reviews/db.ts lib/reviews/send.ts tests/reviews/db.test.ts tests/reviews/send.test.ts
git commit -m "feat: review request email with the customer's referral link"
```

---

### Task 7: The daily cron route and schedule

**Files:**
- Create: `app/api/cron/review-requests/route.ts`, `vercel.json`
- Modify: `.env.example`
- Test: `tests/reviews/cron-route.test.ts`

**Interfaces:**
- Consumes: `runDailyReviewRequests` (Task 6)

- [ ] **Step 1: Write the failing tests**

`tests/reviews/cron-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const runDailyReviewRequests = vi.fn();
vi.mock("@/lib/reviews/send", () => ({ runDailyReviewRequests }));

const { GET } = await import("@/app/api/cron/review-requests/route");
const call = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/review-requests", {
    headers: authorization ? { authorization } : {},
  }));

beforeEach(() => {
  runDailyReviewRequests.mockReset().mockResolvedValue({ sent: 2, failed: 0 });
  vi.stubEnv("CRON_SECRET", "s3cret");
});

describe("GET /api/cron/review-requests", () => {
  it("runs and reports counts with the right secret", async () => {
    const response = await call("Bearer s3cret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 2, failed: 0 });
  });

  it.each([undefined, "Bearer wrong", "s3cret"])("rejects %s without running", async (header) => {
    const response = await call(header);
    expect(response.status).toBe(401);
    expect(runDailyReviewRequests).not.toHaveBeenCalled();
  });

  it("rejects everything when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(runDailyReviewRequests).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/reviews/cron-route.test.ts --maxWorkers=2`
Expected: FAIL, because the route does not exist.

- [ ] **Step 3: Implement**

`app/api/cron/review-requests/route.ts`:

```ts
import { runDailyReviewRequests } from "@/lib/reviews/send";

/**
 * Called once a day by Vercel Cron (vercel.json). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`; anything else is refused before any
 * data is read.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runDailyReviewRequests());
}
```

`vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/review-requests", "schedule": "0 17 * * *" }]
}
```

Append to `.env.example`:

```
# Review requests — the "write a review" link from the Google Business Profile.
# With it unset, no review request email is sent.
GOOGLE_REVIEW_URL=

# Vercel Cron — a long random string. Vercel sends it to /api/cron/* automatically.
CRON_SECRET=
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/reviews --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/review-requests/route.ts vercel.json .env.example tests/reviews/cron-route.test.ts
git commit -m "feat: daily cron sends review requests the morning after install"
```

---

### Task 8: Admin Server Actions

**Files:**
- Modify: `app/admin/jobs/actions.ts`
- Test: `tests/admin/actions.test.ts` (extend)

**Interfaces:**
- Consumes: `getJob` (existing); `ensureReferralCode`, `markReferralPaid` (Task 2); `sendReviewRequest` (Task 6); `setReviewOptOut` (Task 6)
- Produces:
  - `sendReviewNow(id: string, _prev: FormState, _formData: FormData): Promise<FormState>`
  - `saveReviewOptOut(id: string, optOut: boolean): Promise<void>`
  - `createReferralLink(id: string, _prev: FormState, _formData: FormData): Promise<FormState>`
  - `payReferral(referredId: string, referrerId: string, _prev: FormState, _formData: FormData): Promise<FormState>`

- [ ] **Step 1: Extend the tests**

In `tests/admin/actions.test.ts`:

1. After the existing `vi.mock("@/lib/admin/jobs", () => jobs);`, change `jobs` to include `getJob: vi.fn()`, and add:

```ts
const referrals = { ensureReferralCode: vi.fn(), markReferralPaid: vi.fn() };
vi.mock("@/lib/referrals/db", () => referrals);
const sendReviewRequest = vi.fn();
vi.mock("@/lib/reviews/send", () => ({ sendReviewRequest }));
const reviewsDb = { setReviewOptOut: vi.fn() };
vi.mock("@/lib/reviews/db", () => reviewsDb);
```

2. In `beforeEach`, add:

```ts
  [...Object.values(referrals), sendReviewRequest, ...Object.values(reviewsDb)].forEach((fn) => fn.mockReset());
  jobs.getJob.mockResolvedValue({ id: ID, email: "dana@example.com", reviewOptOut: false });
  referrals.ensureReferralCode.mockResolvedValue("K7M2QX");
  referrals.markReferralPaid.mockResolvedValue(true);
  reviewsDb.setReviewOptOut.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
```

3. Add these cases to the `it.each` list in "without a session":

```ts
    ["sendReviewNow", () => actions.sendReviewNow(ID, {}, form({}))],
    ["saveReviewOptOut", () => actions.saveReviewOptOut(ID, true)],
    ["createReferralLink", () => actions.createReferralLink(ID, {}, form({}))],
    ["payReferral", () => actions.payReferral(ID, ID, {}, form({}))],
```

Then change that test's assertion so it also checks the new modules:

```ts
    [...Object.values(jobs), ...Object.values(referrals), sendReviewRequest, ...Object.values(reviewsDb)]
      .forEach((fn) => expect(fn).not.toHaveBeenCalled());
```

4. Add a new block:

```ts
describe("referrals and reviews", () => {
  it("sends a review request now as the signed-in owner", async () => {
    expect(await actions.sendReviewNow(ID, {}, form({}))).toEqual({ ok: true });
    expect(sendReviewRequest).toHaveBeenCalledWith(expect.objectContaining({ id: ID }), "owner@example.com");
  });

  it("will not send to a job without an email", async () => {
    jobs.getJob.mockResolvedValue({ id: ID, email: null, reviewOptOut: false });
    expect((await actions.sendReviewNow(ID, {}, form({}))).error).toMatch(/no email/i);
    expect(sendReviewRequest).not.toHaveBeenCalled();
  });

  it("will not send when review requests are turned off", async () => {
    jobs.getJob.mockResolvedValue({ id: ID, email: "dana@example.com", reviewOptOut: true });
    expect((await actions.sendReviewNow(ID, {}, form({}))).error).toMatch(/turned off/i);
  });

  it("reports a failed send inline", async () => {
    sendReviewRequest.mockRejectedValue(new Error("GOOGLE_REVIEW_URL is not set"));
    expect((await actions.sendReviewNow(ID, {}, form({}))).error).toMatch(/could not send/i);
  });

  it("saves the opt-out as the signed-in owner", async () => {
    await actions.saveReviewOptOut(ID, true);
    expect(reviewsDb.setReviewOptOut).toHaveBeenCalledWith(ID, true, "owner@example.com");
  });

  it("creates the referral link", async () => {
    expect(await actions.createReferralLink(ID, {}, form({}))).toEqual({ ok: true });
    expect(referrals.ensureReferralCode).toHaveBeenCalledWith(ID);
  });

  it("marks a reward paid, or says it is not owed", async () => {
    expect(await actions.payReferral("r1", ID, {}, form({}))).toEqual({ ok: true });
    expect(referrals.markReferralPaid).toHaveBeenCalledWith("r1", "owner@example.com");
    referrals.markReferralPaid.mockResolvedValue(false);
    expect((await actions.payReferral("r1", ID, {}, form({}))).error).toMatch(/not owed/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/admin/actions.test.ts --maxWorkers=2`
Expected: FAIL, because the actions do not exist.

- [ ] **Step 3: Implement**

In `app/admin/jobs/actions.ts`:

1. Change the jobs import and add the new ones:

```ts
import { addNote, createJob, getJob, setStage, updateDetails } from "@/lib/admin/jobs";
import { ensureReferralCode, markReferralPaid } from "@/lib/referrals/db";
import { setReviewOptOut } from "@/lib/reviews/db";
import { sendReviewRequest } from "@/lib/reviews/send";
```

2. Append:

```ts
export async function sendReviewNow(id: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const job = await getJob(id);
  if (!job) return MISSING;
  if (!job.email) return { error: "This job has no email address." };
  if (job.reviewOptOut) return { error: "Review requests are turned off for this job." };
  try {
    await sendReviewRequest(job, email);
  } catch (error) {
    console.error("Review request failed", error);
    return { error: "Could not send the review request. Check the settings and try again." };
  }
  refresh(id);
  return { ok: true };
}

export async function saveReviewOptOut(id: string, optOut: boolean): Promise<void> {
  const { email } = await requireAdmin();
  await setReviewOptOut(id, optOut, email);
  refresh(id);
}

export async function createReferralLink(id: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  await requireAdmin();
  const code = await ensureReferralCode(id);
  if (!code) return MISSING;
  refresh(id);
  return { ok: true };
}

export async function payReferral(
  referredId: string, referrerId: string, _prev: FormState, _formData: FormData,
): Promise<FormState> {
  const { email } = await requireAdmin();
  const paid = await markReferralPaid(referredId, email);
  if (!paid) return { error: "That reward is not owed yet, or it was already paid." };
  refresh(referrerId);
  refresh(referredId);
  return { ok: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/admin --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/jobs/actions.ts tests/admin/actions.test.ts
git commit -m "feat: admin actions for review requests and referral rewards"
```

---

### Task 9: Admin job page sections and board badge

**Files:**
- Create: `app/admin/jobs/[id]/ReviewSection.tsx`, `app/admin/jobs/[id]/ReferralSection.tsx`, `app/admin/jobs/[id]/ReferralsList.tsx`
- Modify: `app/admin/jobs/[id]/page.tsx`, `app/admin/JobCard.tsx`
- Test: `tests/admin/referrals-ui.test.tsx`, `tests/admin/board.test.tsx` (extend)

**Interfaces:**
- Consumes: the actions from Task 8; `Referral` (Task 2); `referralUrl` (Task 1); `formatWhen` (existing)
- Produces:
  - `ReviewSection({ job }: { job: Job })`
  - `ReferralSection({ job }: { job: Job })`
  - `ReferralsList({ referrerId, referrals }: { referrerId: string; referrals: Referral[] })`

- [ ] **Step 1: Write the failing tests**

`tests/admin/referrals-ui.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

const sendReviewNow = vi.fn(async () => ({ error: "This job has no email address." }));
const saveReviewOptOut = vi.fn(async () => {});
const createReferralLink = vi.fn(async () => ({ ok: true }));
const payReferral = vi.fn(async () => ({ ok: true }));
vi.mock("@/app/admin/jobs/actions", () => ({ sendReviewNow, saveReviewOptOut, createReferralLink, payReferral }));

const { ReviewSection } = await import("@/app/admin/jobs/[id]/ReviewSection");
const { ReferralSection } = await import("@/app/admin/jobs/[id]/ReferralSection");
const { ReferralsList } = await import("@/app/admin/jobs/[id]/ReferralsList");
const { business } = await import("@/content/business");

const job: Job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date(), name: "Dana Reyes",
  phone: "7025550134", email: "dana@example.com", address: null, city: "Henderson", treatments: [],
  windowCount: null, heardVia: null, notes: null, source: "contact", status: "installed",
  stageChangedAt: new Date(), visitAt: null, quoteCents: null, soldCents: null, depositCents: null,
  brands: [], orderedOn: null, installOn: null, lostReason: null,
  referralCode: null, referredBy: null, referralPaidAt: null, reviewRequestedAt: null, reviewOptOut: false,
};

describe("review section", () => {
  it("says when nothing has been sent and offers to send now", () => {
    render(<ReviewSection job={job} />);
    expect(screen.getByText(/not sent/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send now" })).toBeInTheDocument();
  });

  it("shows a send error inline", async () => {
    render(<ReviewSection job={job} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Send now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no email/i);
  });

  it("saves the opt-out when the box is ticked", async () => {
    render(<ReviewSection job={job} />);
    await userEvent.setup().click(screen.getByRole("checkbox", { name: /don't send/i }));
    expect(saveReviewOptOut).toHaveBeenCalledWith(job.id, true);
  });
});

describe("referral section", () => {
  it("offers to create a link when the job has none", () => {
    render(<ReferralSection job={job} />);
    expect(screen.getByRole("button", { name: "Get referral link" })).toBeInTheDocument();
  });

  it("shows the link once the job has a code", () => {
    render(<ReferralSection job={{ ...job, referralCode: "K7M2QX" }} />);
    expect(screen.getByText(`${business.domain}/r/K7M2QX`)).toBeInTheDocument();
  });
});

describe("referrals list", () => {
  it("shows each referral's reward and a pay button only when owed", () => {
    render(
      <ReferralsList
        referrerId={job.id}
        referrals={[
          { id: "a", name: "Ana Diaz", status: "sold", referralPaidAt: null, reward: "pending" },
          { id: "b", name: "Ben Ortiz", status: "installed", referralPaidAt: null, reward: "owed" },
          { id: "c", name: "Cy Park", status: "installed", referralPaidAt: new Date("2026-09-01T18:00:00Z"), reward: "paid" },
        ]}
      />,
    );
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("$100 owed")).toBeInTheDocument();
    expect(screen.getByText(/^Paid /)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Mark paid" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Ana Diaz" })).toHaveAttribute("href", "/admin/jobs/a");
  });
});
```

Also add a case to `tests/admin/board.test.tsx`:

```tsx
  it("marks referred jobs with a Referral badge", () => {
    render(<JobCard job={job({ referredBy: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6d" })} now={new Date("2026-09-10T00:00:00Z")} />);
    expect(screen.getByRole("link", { name: /dana reyes/i })).toHaveTextContent("Referral");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/admin/referrals-ui.test.tsx tests/admin/board.test.tsx --maxWorkers=2`
Expected: FAIL. The components are missing, and the card has no badge.

- [ ] **Step 3: Implement the components**

`app/admin/jobs/[id]/ReviewSection.tsx`:

```tsx
"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { Job } from "@/lib/admin/jobs";
import { formatWhen } from "@/lib/admin/time";
import { saveReviewOptOut, sendReviewNow, type FormState } from "../actions";

export function ReviewSection({ job }: { job: Job }) {
  const [state, action, sending] = useActionState<FormState, FormData>(sendReviewNow.bind(null, job.id), {});
  const [, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-ink-soft">
        {job.reviewRequestedAt ? `Sent ${formatWhen(job.reviewRequestedAt)}` : "Not sent yet"}
        {job.email ? null : " · no email address on this job"}
      </p>
      <label htmlFor="review-opt-out" className="flex min-h-11 items-center gap-2">
        <input
          id="review-opt-out"
          type="checkbox"
          defaultChecked={job.reviewOptOut}
          onChange={(event) => {
            const optOut = event.target.checked;
            startTransition(() => saveReviewOptOut(job.id, optOut));
          }}
        />
        Don&apos;t send a review request
      </label>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={sending}>{sending ? "Sending…" : "Send now"}</Button>
        {state.error ? <p role="alert">{state.error}</p> : null}
        {state.ok ? <p role="status" className="text-ink-soft">Sent</p> : null}
      </form>
    </div>
  );
}
```

`app/admin/jobs/[id]/ReferralSection.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Job } from "@/lib/admin/jobs";
import { referralUrl } from "@/lib/referrals/codes";
import { createReferralLink, type FormState } from "../actions";

export function ReferralSection({ job }: { job: Job }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createReferralLink.bind(null, job.id), {});
  const [copied, setCopied] = useState(false);

  if (!job.referralCode) {
    return (
      <form action={action} className="flex flex-wrap items-center gap-3 text-sm">
        <Button type="submit" variant="outline" disabled={pending}>Get referral link</Button>
        {state.error ? <p role="alert">{state.error}</p> : null}
      </form>
    );
  }

  const link = referralUrl(job.referralCode);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <code className="break-all border border-rule bg-ivory px-3 py-2">{link}</code>
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
```

`app/admin/jobs/[id]/ReferralsList.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { Referral } from "@/lib/referrals/db";
import { stageLabel } from "@/lib/admin/stages";
import { formatWhen } from "@/lib/admin/time";
import { payReferral, type FormState } from "../actions";

export function ReferralsList({ referrerId, referrals }: { referrerId: string; referrals: Referral[] }) {
  return (
    <ul className="flex flex-col gap-3 text-sm">
      {referrals.map((referral) => (
        <li key={referral.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule pb-3">
          <Link href={`/admin/jobs/${referral.id}`} className="font-display text-charcoal underline-offset-4 hover:underline">
            {referral.name}
          </Link>
          <span className="text-ink-soft">{stageLabel(referral.status)}</span>
          <Reward referrerId={referrerId} referral={referral} />
        </li>
      ))}
    </ul>
  );
}

function Reward({ referrerId, referral }: { referrerId: string; referral: Referral }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    payReferral.bind(null, referral.id, referrerId),
    {},
  );

  if (referral.reward === "pending") return <span>Pending</span>;
  if (referral.reward === "none") return <span>No reward</span>;
  if (referral.reward === "paid") return <span>Paid {formatWhen(referral.referralPaidAt!)}</span>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <span>$100 owed</span>
      <Button type="submit" variant="outline" disabled={pending}>Mark paid</Button>
      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
```

`app/admin/JobCard.tsx`: inside the `<Link>`, directly after the name `<span>`, add:

```tsx
      {job.referredBy ? (
        <span className="w-fit border border-champagne-ink px-1.5 font-display text-[0.65rem] uppercase tracking-[0.12em] text-champagne-ink">
          Referral
        </span>
      ) : null}
```

- [ ] **Step 4: Wire the job page**

In `app/admin/jobs/[id]/page.tsx`:

1. Add imports:

```tsx
import { listReferrals } from "@/lib/referrals/db";
import { STAGES } from "@/lib/admin/stages";
import { ReferralSection } from "./ReferralSection";
import { ReferralsList } from "./ReferralsList";
import { ReviewSection } from "./ReviewSection";
```

2. Replace `const events = await getEvents(id);` with:

```tsx
  const [events, referrals, referrer] = await Promise.all([
    getEvents(id),
    listReferrals(id),
    job.referredBy ? getJob(job.referredBy) : Promise.resolve(null),
  ]);
  const soldIndex = STAGES.findIndex((s) => s.value === "sold");
  const soldOrLater = STAGES.findIndex((s) => s.value === job.status) >= soldIndex;
```

3. In the contact `<dl>`, after the "Came in via" pair, add:

```tsx
          {referrer ? (
            <>
              <dt>Referred by</dt>
              <dd><Link href={`/admin/jobs/${referrer.id}`} className="underline underline-offset-4">{referrer.name}</Link></dd>
            </>
          ) : null}
```

4. Between the "Job details" section and the "Activity" section, add:

```tsx
      {soldOrLater ? (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Review request</h2>
            <ReviewSection job={job} />
          </section>
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Referral link</h2>
            <ReferralSection job={job} />
          </section>
        </>
      ) : null}

      {referrals.length ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Referrals</h2>
          <ReferralsList referrerId={job.id} referrals={referrals} />
        </section>
      ) : null}
```

`soldOrLater` is false for `lost`, because `findIndex` returns -1. Activity entries of kind `email` and `reward` already render through the existing `event.body` branch.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/admin --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit 2>&1 | grep -v ".next/dev/types"`
Expected: no output.
Run: `npx eslint app/admin lib/referrals lib/reviews "app/(site)/r" app/api components/forms`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/jobs/[id]/ReviewSection.tsx" "app/admin/jobs/[id]/ReferralSection.tsx" "app/admin/jobs/[id]/ReferralsList.tsx" "app/admin/jobs/[id]/page.tsx" app/admin/JobCard.tsx tests/admin/referrals-ui.test.tsx tests/admin/board.test.tsx
git commit -m "feat: review request, referral link, and referrals on the job page"
```

---

### Task 10: End-to-end referral journey, full verification, deploy

**Files:**
- Modify: `e2e/admin.spec.ts`

**Interfaces:**
- Consumes: everything above, through the browser

- [ ] **Step 1: Add the e2e test** at the end of `e2e/admin.spec.ts`:

```ts
test("a referral link attributes the friend and the reward can be paid", async ({ page }) => {
  const referrerName = `E2E Tracker Referrer ${Date.now()}`;
  const friendName = `E2E Tracker Friend ${Date.now()}`;
  const code = `E${String(Date.now()).slice(-5).replace(/[01]/g, "9")}`;
  await sql()`insert into leads (name, phone, email, city, source, status, referral_code)
    values (${referrerName}, '7025550100', 'e2e-referrer@example.com', 'Henderson', 'phone', 'installed', ${code})`;

  await page.goto(`/r/${code.toLowerCase()}`);
  await expect(page).toHaveURL(/\/contact\?ref=friend/);
  await expect(page.getByText("E2E sent you.")).toBeVisible();
  await expect(page.getByLabel(/how did you hear/i)).toHaveValue("Referral from a friend");

  await page.getByLabel("Name", { exact: true }).fill(friendName);
  await page.getByLabel("Phone", { exact: true }).fill("(702) 555-0101");
  await page.getByLabel("Email", { exact: true }).fill("e2e-friend@example.com");
  await page.getByRole("button", { name: /request free consultation/i }).click();
  await expect(page).toHaveURL(/\/thank-you$/);

  await signIn(page);
  const [referrer] = await sql()`select id from leads where referral_code = ${code}`;
  await page.goto(`/admin/jobs/${referrer.id}`);
  await expect(page.getByRole("link", { name: friendName })).toBeVisible();
  await expect(page.getByText("Pending")).toBeVisible();

  await page.getByRole("link", { name: friendName }).click();
  await expect(page.getByRole("link", { name: referrerName })).toBeVisible();
  await page.getByLabel("Set stage").selectOption("installed");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(page.getByText("Stage:")).toContainText("Installed");

  await page.getByRole("link", { name: referrerName }).click();
  await page.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByText(/^Paid /)).toBeVisible();
  await expect(page.getByText(`Referral reward paid for ${friendName}`)).toBeVisible();
});
```

The code starts with `E` and keeps only digits 2–9, so it always passes `normalizeCode`. The referrer's first name is `E2E` (the first word of the name), which is why the note reads "E2E sent you." The file's existing `afterAll` deletes every `E2E Tracker %` lead.

- [ ] **Step 2: Run the whole unit suite**

Run: `npx vitest run --maxWorkers=2`
Expected: every test passes (about 205 before this plan, plus the new ones).

- [ ] **Step 3: Typecheck and lint the whole project**

Run: `npx tsc --noEmit 2>&1 | grep -v ".next/dev/types"`
Expected: no output.
Run: `npx eslint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add e2e/admin.spec.ts
git commit -m "test: end-to-end referral link, attribution, and reward payment"
```

- [ ] **Step 5: Run the e2e suite** (only when a Neon branch URL is available)

Run: `E2E_POSTGRES_URL=<neon branch url> npx playwright test e2e/admin.spec.ts --project=desktop`
Expected: PASS. First apply migration 003 to the branch: `DATABASE_URL=<branch url> node scripts/migrate.mjs`. If no branch URL is available, report that the e2e test was written but not run.

- [ ] **Step 6: Launch. Ask the user before each of these; they touch production.**

1. Apply the migration to production: `node scripts/migrate.mjs` (reads `DATABASE_URL` from `.env.local`). The output lists the new `leads` columns.
2. Set `CRON_SECRET` (a random string: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) and `GOOGLE_REVIEW_URL` (from the user) in Vercel for Production, with `npx vercel env add <NAME> production`.
3. Deploy: `npx vercel --prod`. Git push does not deploy this project.
4. Verify the live site:
   - `curl -sI https://premiershadesolutions.com/r/ZZZZZZ` → 307 to `/contact`
   - `curl -s -o /dev/null -w "%{http_code}" https://premiershadesolutions.com/api/cron/review-requests` → `401`
   - The Vercel dashboard's Cron Jobs tab lists `/api/cron/review-requests` at `0 17 * * *`.
