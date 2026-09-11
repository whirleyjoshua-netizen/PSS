# Job Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner-only `/admin` job tracker where website leads and hand-entered jobs move through seven stages, with email sign-in links.

**Architecture:** Lives inside the existing Next.js 16 site. Marketing routes move into an `app/(site)` route group so `/admin` gets its own chrome under the same root layout. The existing `leads` table becomes the jobs table; new tables hold the activity log, sign-in tokens, and sessions. All authorization runs through one server-only module, and `proxy.ts` is only an optimistic cookie check.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions, `proxy.ts`), React 19 `useActionState`, `@neondatabase/serverless`, zod 4, Resend, Tailwind 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-job-tracker-design.md`

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before using any Next API; this Next version differs from older ones (`middleware.ts` is now `proxy.ts`; `cookies()` and `headers()` are async).
- Stages, in order: `new`, `contacted`, `visit_booked`, `quoted`, `sold`, `ordered`, `installed`, plus `lost`. Labels: New lead, Contacted, Visit booked, Quoted, Sold, Ordered, Installed, Lost.
- Sign-in link: single use, expires after 15 minutes. Session: 30 days, cookie `pss_admin`, `httpOnly`, `sameSite=lax`, `secure` in production.
- Tokens are 32 random bytes, base64url. Only SHA-256 hex hashes are stored.
- Allowlist from `ADMIN_EMAILS` (comma-separated, trimmed, case-insensitive). Initial value `whirleyjoshua@gmail.com`.
- Sign-in link origin from `ADMIN_BASE_URL`, default `business.domain`. Never from request headers.
- At most 5 sign-in emails per address per hour.
- Money is stored as integer cents and entered as dollars.
- Brands: `Superior Blinds MFG`, `Alta Window Fashions`, `Hunter Douglas`.
- Hand-entered sources: `phone`, `referral`, `walk-in`, `other`.
- Times are entered and shown in `America/Los_Angeles` (Las Vegas).
- `/admin` is disallowed in robots and every admin page is `noindex`.
- Every admin page and Server Action calls `requireAdmin()` before touching data.
- Match the surrounding code: comment density, naming, Tailwind tokens (`charcoal`, `ivory`, `sand`, `rule`, `ink-soft`, `champagne`, `champagne-ink`), `font-display` for labels.
- Commit after each task. End commit messages with the attribution lines from the session instructions.

## File Structure

| File | Responsibility |
|---|---|
| `app/layout.tsx` | Root: `<html>`, fonts, base metadata only |
| `app/(site)/layout.tsx` | Marketing chrome: skip link, Header, `<main>`, Footer, LocalBusiness JSON-LD |
| `app/(site)/**` | Every existing marketing route, moved unchanged |
| `lib/db.ts` | `connectionString()` and `db()` shared by leads and admin |
| `db/migrations/002_job_tracker.sql` | Schema changes for the tracker |
| `lib/admin/stages.ts` | Stage list, labels, `nextStage()` |
| `lib/admin/tokens.ts` | Random token and hash |
| `lib/admin/allowlist.ts` | `ADMIN_EMAILS` parsing |
| `lib/admin/money.ts` | Dollars to cents and back |
| `lib/admin/time.ts` | Las Vegas local time to `Date` and back |
| `lib/admin/login.ts` | Server-only: issue, rate-limit, email, and consume sign-in tokens |
| `lib/admin/session.ts` | Server-only: sessions, `getAdmin()`, `requireAdmin()` |
| `lib/admin/schema.ts` | zod schemas for admin forms |
| `lib/admin/jobs.ts` | Server-only: job queries and mutations, each writing its event |
| `proxy.ts` | Optimistic redirect when the session cookie is absent |
| `app/admin/layout.tsx` | Admin chrome, `noindex` |
| `app/admin/sign-in/*` | Sign-in page, form, action |
| `app/admin/auth/route.ts` | Consumes a sign-in link, starts a session |
| `app/admin/actions.ts` | Sign out |
| `app/admin/page.tsx` | The board |
| `app/admin/jobs/actions.ts` | Job Server Actions |
| `app/admin/jobs/[id]/*` | Job page and its client forms |
| `app/admin/jobs/new/*` | New job page and form |

---

### Task 1: Move marketing routes into a route group

**Files:**
- Move: `app/page.tsx`, `app/[category]`, `app/about`, `app/accessibility`, `app/contact`, `app/gallery`, `app/privacy`, `app/service-area`, `app/thank-you`, `app/opengraph-image.tsx` → `app/(site)/…`
- Create: `app/(site)/layout.tsx`
- Modify: `app/layout.tsx`
- Modify: `tests/home.test.tsx:3`, `tests/routes/cities.test.ts:5`, `tests/routes/thank-you.test.tsx:3`, `tests/routes/products.test.ts:2-3`
- Stay put: `app/api`, `app/robots.ts`, `app/sitemap.ts`, `app/globals.css`, `app/favicon.ico`, `app/icon.svg`

**Interfaces:**
- Produces: a root layout that renders only `{children}` inside `<body>`, so `/admin` can supply its own chrome.

- [ ] **Step 1: Move the routes with git**

```bash
mkdir -p "app/(site)"
for p in page.tsx "[category]" about accessibility contact gallery privacy service-area thank-you opengraph-image.tsx; do git mv "app/$p" "app/(site)/$p"; done
```

- [ ] **Step 2: Create `app/(site)/layout.tsx`**

```tsx
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { JsonLd } from "@/components/seo/JsonLd";
import { localBusinessSchema } from "@/lib/seo/schema";

/** Chrome for every public page. The admin area supplies its own. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-charcoal focus:px-4 focus:py-2 focus:text-ivory"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <JsonLd schema={localBusinessSchema()} />
    </>
  );
}
```

- [ ] **Step 3: Slim `app/layout.tsx`**

Delete the `Header`, `Footer`, `JsonLd`, and `localBusinessSchema` imports, and replace the `<body>` contents so the component reads:

```tsx
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jost.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Update test imports**

In each file, replace `@/app/` with `@/app/(site)/` for the moved routes only:
- `tests/home.test.tsx`: `import Home from "@/app/(site)/page";`
- `tests/routes/cities.test.ts`: `from "@/app/(site)/service-area/[city]/page";`
- `tests/routes/thank-you.test.tsx`: `from "@/app/(site)/thank-you/page";`
- `tests/routes/products.test.ts`: `from "@/app/(site)/[category]/page";` and `from "@/app/(site)/[category]/[product]/page";`

`tests/leads/route.test.ts` and `tests/seo/sitemap.test.ts` stay unchanged.

- [ ] **Step 5: Verify nothing changed for visitors**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean, all tests pass, and the build lists the same routes as before (`/`, `/about`, `/contact`, …) with no `(site)` in any URL.

Run: `npx playwright test e2e/navigation.spec.ts e2e/consultation.spec.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A app tests
git commit -m "refactor: move marketing routes into a (site) route group"
```

---

### Task 2: Database migration and stage list

**Files:**
- Create: `lib/db.ts`, `db/migrations/002_job_tracker.sql`, `lib/admin/stages.ts`
- Modify: `lib/leads/db.ts` (import `connectionString` from `lib/db.ts`)
- Test: `tests/admin/stages.test.ts`

**Interfaces:**
- Produces: `connectionString(): string`, `db(): NeonQueryFunction<false, false>` from `@/lib/db`.
- Produces from `@/lib/admin/stages`: `type Stage`, `STAGES: readonly { value: Stage; label: string }[]` (the seven active stages in order), `ALL_STAGES: readonly Stage[]` (seven plus `lost`), `isStage(value: unknown): value is Stage`, `stageLabel(stage: Stage): string`, `nextStage(stage: Stage): Stage | null`.

- [ ] **Step 1: Write the failing test** — `tests/admin/stages.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { STAGES, ALL_STAGES, isStage, stageLabel, nextStage } from "@/lib/admin/stages";

describe("stages", () => {
  it("runs from new lead to installed, in order", () => {
    expect(STAGES.map((s) => s.value)).toEqual([
      "new", "contacted", "visit_booked", "quoted", "sold", "ordered", "installed",
    ]);
  });

  it("includes lost as a stage but not in the active sequence", () => {
    expect(ALL_STAGES).toContain("lost");
    expect(STAGES.map((s) => s.value)).not.toContain("lost");
  });

  it("advances one stage at a time and stops at installed", () => {
    expect(nextStage("new")).toBe("contacted");
    expect(nextStage("ordered")).toBe("installed");
    expect(nextStage("installed")).toBeNull();
    expect(nextStage("lost")).toBeNull();
  });

  it("labels stages the way the owners read them", () => {
    expect(stageLabel("new")).toBe("New lead");
    expect(stageLabel("visit_booked")).toBe("Visit booked");
    expect(stageLabel("lost")).toBe("Lost");
  });

  it("rejects anything that is not a stage", () => {
    expect(isStage("sold")).toBe(true);
    expect(isStage("Sold")).toBe(false);
    expect(isStage(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/admin/stages.test.ts`
Expected: FAIL, cannot resolve `@/lib/admin/stages`.

- [ ] **Step 3: Implement `lib/admin/stages.ts`**

```ts
/**
 * The one definition of the job stages. The database enforces the same list
 * with a check constraint in 002_job_tracker.sql; keep the two in step.
 */
export const STAGES = [
  { value: "new", label: "New lead" },
  { value: "contacted", label: "Contacted" },
  { value: "visit_booked", label: "Visit booked" },
  { value: "quoted", label: "Quoted" },
  { value: "sold", label: "Sold" },
  { value: "ordered", label: "Ordered" },
  { value: "installed", label: "Installed" },
] as const;

export type Stage = (typeof STAGES)[number]["value"] | "lost";

export const ALL_STAGES: readonly Stage[] = [...STAGES.map((s) => s.value), "lost"];

export const isStage = (value: unknown): value is Stage =>
  typeof value === "string" && (ALL_STAGES as readonly string[]).includes(value);

export const stageLabel = (stage: Stage): string =>
  stage === "lost" ? "Lost" : STAGES.find((s) => s.value === stage)!.label;

/** The stage the primary button moves to, or null when there is none. */
export function nextStage(stage: Stage): Stage | null {
  const index = STAGES.findIndex((s) => s.value === stage);
  return index === -1 || index === STAGES.length - 1 ? null : STAGES[index + 1].value;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/admin/stages.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Create `lib/db.ts` and point `lib/leads/db.ts` at it**

`lib/db.ts`:

```ts
import { neon } from "@neondatabase/serverless";

/**
 * POSTGRES_URL is preferred over DATABASE_URL, and the order matters.
 *
 * The Neon integration sets both to the same value. DATABASE_URL is also a
 * conventional name that other projects define machine-wide, and a real
 * environment variable takes precedence over .env.local — so a developer with
 * an unrelated local Postgres can silently point this app at the wrong
 * database. POSTGRES_URL is specific enough not to collide.
 */
export function connectionString(): string {
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("No database connection string (POSTGRES_URL or DATABASE_URL)");
  }
  return url;
}

export const db = () => neon(connectionString());
```

In `lib/leads/db.ts`, delete the local `connectionString` function and its comment, replace `import { neon } from "@neondatabase/serverless";` with `import { db } from "@/lib/db";`, and change `const sql = neon(connectionString());` to `const sql = db();`.

- [ ] **Step 6: Write `db/migrations/002_job_tracker.sql`**

```sql
-- The owners' job tracker. Leads from the website become jobs; the status
-- column that 001_leads.sql left open now holds the stage.
--
-- Every statement is safe to re-run: the migrate script applies all files.

alter table leads drop constraint if exists leads_status_check;
alter table leads add constraint leads_status_check check (
  status in ('new','contacted','visit_booked','quoted','sold','ordered','installed','lost')
);

-- Hand-entered jobs (a phone call, a referral) may arrive without an email.
alter table leads alter column email drop not null;

alter table leads add column if not exists stage_changed_at timestamptz not null default now();
alter table leads add column if not exists visit_at        timestamptz;
alter table leads add column if not exists quote_cents     integer;
alter table leads add column if not exists sold_cents      integer;
alter table leads add column if not exists deposit_cents   integer;
alter table leads add column if not exists brands          text[] not null default '{}';
alter table leads add column if not exists ordered_on      date;
alter table leads add column if not exists install_on      date;
alter table leads add column if not exists lost_reason     text;
alter table leads add column if not exists updated_at      timestamptz not null default now();

create index if not exists leads_stage_changed_idx on leads (stage_changed_at desc);

create table if not exists job_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads (id) on delete cascade,
  created_at  timestamptz not null default now(),
  actor       text not null,
  kind        text not null check (kind in ('stage','note','edit')),
  from_status text,
  to_status   text,
  body        text
);

create index if not exists job_events_lead_idx on job_events (lead_id, created_at desc);

create table if not exists admin_login_tokens (
  token_hash text primary key,
  email      text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

create index if not exists admin_login_tokens_email_idx on admin_login_tokens (email, created_at desc);

create table if not exists admin_sessions (
  token_hash text primary key,
  email      text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
```

Do not run it against production here. Task 10 runs it.

- [ ] **Step 7: Verify and commit**

Run: `npm run typecheck && npm test`
Expected: clean, all pass (the consultation route tests still pass against the refactored `lib/leads/db.ts`).

```bash
git add lib/db.ts lib/leads/db.ts lib/admin/stages.ts db/migrations/002_job_tracker.sql tests/admin/stages.test.ts
git commit -m "feat: job tracker schema and stage list"
```

---

### Task 3: Pure helpers — tokens, allowlist, money, time

**Files:**
- Create: `lib/admin/tokens.ts`, `lib/admin/allowlist.ts`, `lib/admin/money.ts`, `lib/admin/time.ts`
- Test: `tests/admin/helpers.test.ts`

**Interfaces:**
- Produces: `newToken(): string`, `hashToken(token: string): string` (64 hex chars).
- Produces: `parseAllowlist(raw: string | undefined): string[]`, `isAllowed(email: string, raw?: string): boolean` (defaults `raw` to `process.env.ADMIN_EMAILS`).
- Produces: `dollarsToCents(input: string): number | null` (empty → `null`; invalid → throws `Error("Enter an amount like 4500 or 4,500.00")`), `formatCents(cents: number | null): string` (`null` → `"—"`, `450000` → `"$4,500"`, `450050` → `"$4,500.50"`).
- Produces: `fromLocalInput(value: string): Date` (a `datetime-local` value read as Las Vegas time), `toLocalInput(date: Date): string` (`YYYY-MM-DDTHH:mm` in Las Vegas time), `formatWhen(date: Date): string` (e.g. `Sat, Sep 12, 2:30 PM`).

- [ ] **Step 1: Write the failing test** — `tests/admin/helpers.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { newToken, hashToken } from "@/lib/admin/tokens";
import { parseAllowlist, isAllowed } from "@/lib/admin/allowlist";
import { dollarsToCents, formatCents } from "@/lib/admin/money";
import { fromLocalInput, toLocalInput } from "@/lib/admin/time";

describe("tokens", () => {
  it("are long, url-safe, and never repeat", () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
  });

  it("hash to a stable 64-character hex digest", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

describe("allowlist", () => {
  it("trims, lowercases, and drops blanks", () => {
    expect(parseAllowlist(" A@x.com, ,b@Y.com ")).toEqual(["a@x.com", "b@y.com"]);
    expect(parseAllowlist(undefined)).toEqual([]);
  });

  it("matches regardless of case or surrounding space", () => {
    expect(isAllowed("  Owner@Example.com ", "owner@example.com")).toBe(true);
    expect(isAllowed("someone@example.com", "owner@example.com")).toBe(false);
    expect(isAllowed("owner@example.com", "")).toBe(false);
  });
});

describe("money", () => {
  it("reads dollars the way people type them", () => {
    expect(dollarsToCents("4500")).toBe(450000);
    expect(dollarsToCents("$4,500.50")).toBe(450050);
    expect(dollarsToCents("  ")).toBeNull();
  });

  it("refuses anything that is not an amount", () => {
    expect(() => dollarsToCents("about 4k")).toThrow(/amount/);
    expect(() => dollarsToCents("-5")).toThrow(/amount/);
  });

  it("formats cents for display", () => {
    expect(formatCents(450000)).toBe("$4,500");
    expect(formatCents(450050)).toBe("$4,500.50");
    expect(formatCents(null)).toBe("—");
  });
});

describe("Las Vegas time", () => {
  it("reads a summer time as Pacific Daylight Time", () => {
    expect(fromLocalInput("2026-07-15T14:30").toISOString()).toBe("2026-07-15T21:30:00.000Z");
  });

  it("reads a winter time as Pacific Standard Time", () => {
    expect(fromLocalInput("2026-12-15T14:30").toISOString()).toBe("2026-12-15T22:30:00.000Z");
  });

  it("round-trips back to the input format", () => {
    expect(toLocalInput(new Date("2026-12-15T22:30:00.000Z"))).toBe("2026-12-15T14:30");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/admin/helpers.test.ts`
Expected: FAIL, cannot resolve the modules.

- [ ] **Step 3: Implement the four modules**

`lib/admin/tokens.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes. Only the hash is ever stored, so a leaked table is useless. */
export const newToken = (): string => randomBytes(32).toString("base64url");

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
```

`lib/admin/allowlist.ts`:

```ts
export const parseAllowlist = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

/** Read on every request, so removing an address locks it out immediately. */
export const isAllowed = (email: string, raw = process.env.ADMIN_EMAILS): boolean =>
  parseAllowlist(raw).includes(email.trim().toLowerCase());
```

`lib/admin/money.ts`:

```ts
const AMOUNT = /^\d+(\.\d{1,2})?$/;

/** "$4,500.50" → 450050. Blank means "not set". */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!AMOUNT.test(cleaned)) throw new Error("Enter an amount like 4500 or 4,500.00");
  return Math.round(Number(cleaned) * 100);
}

export function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}
```

`lib/admin/time.ts`:

```ts
/** Las Vegas shares Pacific time, including daylight saving. */
const ZONE = "America/Los_Angeles";

/** Minutes the zone is behind UTC at `date`: 420 in summer, 480 in winter. */
function offsetMinutes(date: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, timeZoneName: "shortOffset" })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")!.value; // e.g. "GMT-7"
  const [, sign, hours, minutes = "0"] = name.match(/GMT([+-])(\d+)(?::(\d+))?/)!;
  const total = Number(hours) * 60 + Number(minutes);
  return sign === "-" ? total : -total;
}

/** A `datetime-local` value typed in Las Vegas, as an instant. */
export function fromLocalInput(value: string): Date {
  const asUtc = new Date(`${value}:00Z`);
  const first = new Date(asUtc.getTime() + offsetMinutes(asUtc) * 60_000);
  // Re-check at the resolved instant so times near a DST switch land correctly.
  return new Date(asUtc.getTime() + offsetMinutes(first) * 60_000);
}

export function toLocalInput(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export const formatWhen = (date: Date): string =>
  date.toLocaleString("en-US", {
    timeZone: ZONE, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/admin/helpers.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/tokens.ts lib/admin/allowlist.ts lib/admin/money.ts lib/admin/time.ts tests/admin/helpers.test.ts
git commit -m "feat: token, allowlist, money, and Las Vegas time helpers"
```

---

### Task 4: Sign-in tokens and sessions

**Files:**
- Modify: `package.json` (add `server-only`), `vitest.config.mts` (alias `server-only` to an empty module for tests)
- Create: `tests/server-only-stub.ts`, `lib/admin/login.ts`, `lib/admin/session.ts`
- Test: `tests/admin/login.test.ts`, `tests/admin/session.test.ts`

**Interfaces:**
- Consumes: `db()` (Task 2), `newToken`, `hashToken`, `isAllowed` (Task 3).
- Produces from `@/lib/admin/login`: `requestSignIn(email: string): Promise<{ ok: true } | { ok: false; error: string }>`, `consumeSignIn(token: string): Promise<string | null>` (the email, or `null`).
- Produces from `@/lib/admin/session`: `SESSION_COOKIE = "pss_admin"`, `createSession(email: string): Promise<void>`, `getAdmin(): Promise<{ email: string } | null>`, `requireAdmin(): Promise<{ email: string }>` (redirects to `/admin/sign-in` when null), `destroySession(): Promise<void>`.

- [ ] **Step 1: Install and stub `server-only`**

```bash
npm install server-only
```

`tests/server-only-stub.ts`:

```ts
// The real package throws outside a React Server Components build. Tests import
// server modules directly, so they get this empty stand-in instead.
export {};
```

In `vitest.config.mts`, change the alias line to:

```ts
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts"),
    },
```

- [ ] **Step 2: Write the failing login test** — `tests/admin/login.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

const { requestSignIn, consumeSignIn } = await import("@/lib/admin/login");
const { hashToken } = await import("@/lib/admin/tokens");

const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  send.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("ADMIN_BASE_URL", "https://pss.test");
});

describe("requestSignIn", () => {
  it("emails an allowlisted owner a link on the configured origin", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 0 }] : [],
    );

    expect(await requestSignIn(" Owner@Example.com ")).toEqual({ ok: true });

    const message = send.mock.calls[0][0];
    expect(message.to).toBe("owner@example.com");
    expect(message.text).toMatch(/https:\/\/pss\.test\/admin\/auth\?token=[A-Za-z0-9_-]{43}/);
  });

  it("stores only the hash of the token it sends", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 0 }] : [],
    );
    await requestSignIn("owner@example.com");

    const token = send.mock.calls[0][0].text.match(/token=([A-Za-z0-9_-]+)/)[1];
    const insert = sql.mock.calls.find((call) => text(call).includes("insert into admin_login_tokens"))!;
    expect(insert).toContain(hashToken(token));
    expect(insert).not.toContain(token);
  });

  it("says the same thing to a stranger but sends nothing", async () => {
    expect(await requestSignIn("stranger@example.com")).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  it("stops sending after five links in an hour", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 5 }] : [],
    );

    expect(await requestSignIn("owner@example.com")).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
  });

  it("reports a failed email so the owner can try again", async () => {
    sql.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join("?").includes("count(*)") ? [{ count: 0 }] : [],
    );
    send.mockResolvedValue({ error: { message: "down" } });

    const result = await requestSignIn("owner@example.com");
    expect(result.ok).toBe(false);
  });
});

describe("consumeSignIn", () => {
  it("returns the email for a fresh, unused, allowlisted token", async () => {
    sql.mockResolvedValue([{ email: "owner@example.com" }]);
    expect(await consumeSignIn("tok")).toBe("owner@example.com");
    expect(sql.mock.calls[0]).toContain(hashToken("tok"));
  });

  it("returns null when the token is unknown, used, or expired", async () => {
    sql.mockResolvedValue([]);
    expect(await consumeSignIn("tok")).toBeNull();
  });

  it("returns null when the address has since been removed from the allowlist", async () => {
    sql.mockResolvedValue([{ email: "former@example.com" }]);
    expect(await consumeSignIn("tok")).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/admin/login.test.ts`
Expected: FAIL, cannot resolve `@/lib/admin/login`.

- [ ] **Step 4: Implement `lib/admin/login.ts`**

```ts
import "server-only";
import { Resend } from "resend";
import { business } from "@/content/business";
import { db } from "@/lib/db";
import { isAllowed } from "./allowlist";
import { hashToken, newToken } from "./tokens";

const LINK_MINUTES = 15;
const LINKS_PER_HOUR = 5;

/**
 * Emails a one-time sign-in link to an allowlisted owner.
 *
 * Returns ok for strangers and for rate-limited owners too, so the form never
 * reveals who has access or how many links were sent.
 */
export async function requestSignIn(
  rawEmail: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!isAllowed(email)) return { ok: true };

  const sql = db();
  await sql`delete from admin_login_tokens where expires_at < now() - interval '1 day'`;

  const [{ count }] = await sql`
    select count(*)::int as count from admin_login_tokens
    where email = ${email} and created_at > now() - interval '1 hour'`;
  if (Number(count) >= LINKS_PER_HOUR) return { ok: true };

  const token = newToken();
  await sql`
    insert into admin_login_tokens (token_hash, email, expires_at)
    values (${hashToken(token)}, ${email}, now() + ${`${LINK_MINUTES} minutes`}::interval)`;

  // The origin comes from configuration, never from the request's Host header.
  const origin = process.env.ADMIN_BASE_URL ?? business.domain;
  const link = `${origin}/admin/auth?token=${token}`;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL ?? "leads@premiershadesolutions.com";
  if (!apiKey) return { ok: false, error: "Sign-in email is not configured." };

  const { error } = await new Resend(apiKey).emails.send({
    from: `${business.name} <${from}>`,
    to: email,
    subject: "Your PSS sign-in link",
    text: [
      "Sign in to the PSS job tracker:",
      "",
      link,
      "",
      `This link works once and expires in ${LINK_MINUTES} minutes.`,
      "If you did not ask for it, ignore this email.",
    ].join("\n"),
  });

  if (error) {
    console.error("Sign-in email failed", error);
    return { ok: false, error: "We could not send the email. Try again in a minute." };
  }
  return { ok: true };
}

/** Marks a sign-in token used and returns its email, or null if it cannot be used. */
export async function consumeSignIn(token: string): Promise<string | null> {
  const rows = await db()`
    update admin_login_tokens set used_at = now()
    where token_hash = ${hashToken(token)} and used_at is null and expires_at > now()
    returning email`;
  const email = rows[0]?.email as string | undefined;
  return email && isAllowed(email) ? email : null;
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `npx vitest run tests/admin/login.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Write the failing session test** — `tests/admin/session.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sql }));

const jar = new Map<string, string>();
const cookieStore = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  set: vi.fn((name: string, value: string) => jar.set(name, value)),
  delete: vi.fn((name: string) => jar.delete(name)),
};
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const redirect = vi.fn(() => { throw new Error("NEXT_REDIRECT"); });
vi.mock("next/navigation", () => ({ redirect }));

const { createSession, getAdmin, requireAdmin, destroySession, SESSION_COOKIE } =
  await import("@/lib/admin/session");
const { hashToken } = await import("@/lib/admin/tokens");

beforeEach(() => {
  jar.clear();
  sql.mockReset().mockResolvedValue([]);
  cookieStore.set.mockClear();
  redirect.mockClear();
  vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
});

describe("sessions", () => {
  it("sets an httpOnly 30-day cookie and stores only its hash", async () => {
    await createSession("owner@example.com");

    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(options.maxAge).toBe(60 * 60 * 24 * 30);
    expect(sql.mock.calls[0]).toContain(hashToken(value));
    expect(sql.mock.calls[0]).not.toContain(value);
  });

  it("finds the owner for a live session", async () => {
    jar.set(SESSION_COOKIE, "tok");
    sql.mockResolvedValue([{ email: "owner@example.com" }]);
    expect(await getAdmin()).toEqual({ email: "owner@example.com" });
  });

  it("returns null without a cookie, and never queries", async () => {
    expect(await getAdmin()).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns null for an expired or deleted session", async () => {
    jar.set(SESSION_COOKIE, "tok");
    sql.mockResolvedValue([]);
    expect(await getAdmin()).toBeNull();
  });

  it("returns null once the address is off the allowlist", async () => {
    jar.set(SESSION_COOKIE, "tok");
    sql.mockResolvedValue([{ email: "former@example.com" }]);
    expect(await getAdmin()).toBeNull();
  });

  it("requireAdmin redirects to sign-in when there is no owner", async () => {
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/admin/sign-in");
  });

  it("signing out deletes the row and the cookie", async () => {
    jar.set(SESSION_COOKIE, "tok");
    await destroySession();
    expect(sql.mock.calls[0]).toContain(hashToken("tok"));
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });
});
```

- [ ] **Step 7: Run it to see it fail**

Run: `npx vitest run tests/admin/session.test.ts`
Expected: FAIL, cannot resolve `@/lib/admin/session`.

- [ ] **Step 8: Implement `lib/admin/session.ts`**

```ts
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isAllowed } from "./allowlist";
import { hashToken, newToken } from "./tokens";

export const SESSION_COOKIE = "pss_admin";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export async function createSession(email: string): Promise<void> {
  const token = newToken();
  await db()`
    insert into admin_sessions (token_hash, email, expires_at)
    values (${hashToken(token)}, ${email}, now() + interval '30 days')`;

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

/**
 * The signed-in owner, or null. Checks the database and the allowlist on every
 * request, so deleting a session row or an address takes effect immediately.
 * Cached per request, so a page and its actions share one lookup.
 */
export const getAdmin = cache(async (): Promise<{ email: string } | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db()`
    select email from admin_sessions
    where token_hash = ${hashToken(token)} and expires_at > now()`;
  const email = rows[0]?.email as string | undefined;
  return email && isAllowed(email) ? { email } : null;
});

/** The only guard admin pages and actions rely on. proxy.ts is a courtesy. */
export async function requireAdmin(): Promise<{ email: string }> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/sign-in");
  return admin;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db()`delete from admin_sessions where token_hash = ${hashToken(token)}`;
  store.delete(SESSION_COOKIE);
}
```

- [ ] **Step 9: Run both tests to see them pass**

Run: `npx vitest run tests/admin`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vitest.config.mts tests/server-only-stub.ts lib/admin/login.ts lib/admin/session.ts tests/admin/login.test.ts tests/admin/session.test.ts
git commit -m "feat: email sign-in links and database-backed admin sessions"
```

---

### Task 5: Sign-in pages, proxy, and admin chrome

**Files:**
- Create: `app/admin/layout.tsx`, `app/admin/sign-in/page.tsx`, `app/admin/sign-in/SignInForm.tsx`, `app/admin/sign-in/actions.ts`, `app/admin/auth/route.ts`, `app/admin/actions.ts`, `proxy.ts`
- Modify: `app/robots.ts`
- Test: `tests/admin/sign-in.test.tsx`, `tests/seo/robots.test.ts`

**Interfaces:**
- Consumes: `requestSignIn`, `consumeSignIn` (Task 4), `createSession`, `destroySession`, `getAdmin`, `SESSION_COOKIE` (Task 4).
- Produces: `requestSignInAction(prev: SignInState, formData: FormData): Promise<SignInState>` where `type SignInState = { status: "idle" | "sent" | "error"; message?: string }`; `signOut(): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`tests/admin/sign-in.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

const requestSignInAction = vi.fn(async () => ({ status: "sent" as const }));
vi.mock("@/app/admin/sign-in/actions", () => ({ requestSignInAction }));

const { SignInForm } = await import("@/app/admin/sign-in/SignInForm");

describe("SignInForm", () => {
  it("labels the email field and confirms without revealing access", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText(/email/i), "owner@example.com");
    await user.click(screen.getByRole("button", { name: /email me a sign-in link/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/if that address has access/i);
  });

  it("shows the expired-link message when sent back from a bad link", () => {
    render(<SignInForm expired />);
    expect(screen.getByRole("alert")).toHaveTextContent(/expired or was already used/i);
  });
});
```

`tests/seo/robots.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import robots from "@/app/robots";

describe("robots", () => {
  it("keeps crawlers out of the API and the admin area", () => {
    const [rule] = [robots().rules].flat();
    expect(rule.disallow).toEqual(expect.arrayContaining(["/api/", "/admin"]));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/admin/sign-in.test.tsx tests/seo/robots.test.ts`
Expected: FAIL, `SignInForm` does not resolve and `disallow` is the string `"/api/"`.

- [ ] **Step 3: Implement**

`app/robots.ts`: change the rule to `{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] }`.

`app/admin/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PSS Jobs",
  robots: { index: false, follow: false },
};

/** Owner-only area. Deliberately plain: it is a tool, not a page to market. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex-1 bg-ivory px-4 py-6 text-charcoal sm:px-6">{children}</main>;
}
```

`app/admin/sign-in/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { requestSignIn } from "@/lib/admin/login";

export type SignInState = { status: "idle" | "sent" | "error"; message?: string };

const email = z.string().trim().email("Enter a valid email address");

export async function requestSignInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };

  const result = await requestSignIn(parsed.data);
  return result.ok ? { status: "sent" } : { status: "error", message: result.error };
}
```

`app/admin/sign-in/SignInForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/forms/Field";
import { requestSignInAction, type SignInState } from "./actions";

export function SignInForm({ expired = false }: { expired?: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(
    requestSignInAction,
    { status: "idle" },
  );

  if (state.status === "sent") {
    return (
      <p role="status" className="border border-champagne bg-sand/60 p-5 text-sm">
        If that address has access, a sign-in link is on its way. It works once and
        expires in 15 minutes.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {expired && state.status === "idle" ? (
        <p role="alert" className="border border-rule bg-sand/60 p-4 text-sm">
          That link has expired or was already used. Request a new one.
        </p>
      ) : null}
      <TextField id="admin-email" name="email" label="Email" type="email" autoComplete="email" required />
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-charcoal">{state.message}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
```

`app/admin/sign-in/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/admin/session";
import { SignInForm } from "./SignInForm";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getAdmin()) redirect("/admin");
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-16">
      <h1 className="font-display text-2xl font-light">PSS job tracker</h1>
      <SignInForm expired={error === "expired"} />
    </div>
  );
}
```

`app/admin/auth/route.ts`:

```ts
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { consumeSignIn } from "@/lib/admin/login";
import { createSession } from "@/lib/admin/session";

/** The link in the sign-in email lands here. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const email = token ? await consumeSignIn(token) : null;
  if (!email) redirect("/admin/sign-in?error=expired");

  await createSession(email);
  redirect("/admin");
}
```

`app/admin/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/admin/session";

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/admin/sign-in");
}
```

`proxy.ts` (project root). Before writing it, confirm the export name and `config.matcher` shape in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`:

```ts
import { NextResponse, type NextRequest } from "next/server";

/**
 * A courtesy redirect for visitors with no session cookie at all. It checks
 * only that the cookie exists; requireAdmin() does the real verification on
 * every page and action.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("pss_admin")) {
    return NextResponse.redirect(new URL("/admin/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/((?!sign-in|auth).*)"],
};
```

- [ ] **Step 4: Run the tests and the build**

Run: `npx vitest run tests/admin tests/seo && npm run typecheck && npm run build`
Expected: tests pass; the build lists `/admin/sign-in` and `/admin/auth` as dynamic and reports the proxy.

- [ ] **Step 5: Commit**

```bash
git add app/admin app/robots.ts proxy.ts tests/admin/sign-in.test.tsx tests/seo/robots.test.ts
git commit -m "feat: admin sign-in page, link handler, sign out, and proxy check"
```

---

### Task 6: Job data layer and form schemas

**Files:**
- Create: `lib/admin/schema.ts`, `lib/admin/jobs.ts`
- Test: `tests/admin/schema.test.ts`, `tests/admin/jobs.test.ts`

**Interfaces:**
- Consumes: `db()`, `Stage`, `isStage`, `dollarsToCents`, `fromLocalInput`.
- Produces from `@/lib/admin/schema`: `BRANDS` (the three brand names), `HAND_SOURCES = ["phone","referral","walk-in","other"]`, `detailsSchema`, `noteSchema`, `lostSchema`, `newJobSchema`, and inferred types `DetailsInput`, `NewJobInput`.
- Produces from `@/lib/admin/jobs`: `type Job`, `type JobEvent`, `listJobs(opts: { includeLost: boolean }): Promise<Job[]>`, `getJob(id: string): Promise<Job | null>`, `getEvents(id: string): Promise<JobEvent[]>`, `setStage(id: string, to: Stage, actor: string, reason?: string): Promise<void>`, `updateDetails(id: string, input: DetailsInput, actor: string): Promise<void>`, `addNote(id: string, body: string, actor: string): Promise<void>`, `createJob(input: NewJobInput, actor: string): Promise<string>`.

- [ ] **Step 1: Write the failing schema test** — `tests/admin/schema.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { detailsSchema, newJobSchema, noteSchema, lostSchema } from "@/lib/admin/schema";

describe("detailsSchema", () => {
  it("turns form strings into typed values, with blanks as null", () => {
    const parsed = detailsSchema.parse({
      visitAt: "2026-12-15T14:30", quote: "$4,500", sold: "", deposit: "2250",
      brands: ["Alta Window Fashions"], orderedOn: "", installOn: "2027-01-10",
    });
    expect(parsed).toEqual({
      visitAt: new Date("2026-12-15T22:30:00.000Z"),
      quoteCents: 450000, soldCents: null, depositCents: 225000,
      brands: ["Alta Window Fashions"], orderedOn: null, installOn: "2027-01-10",
    });
  });

  it("rejects an unknown brand and a nonsense amount", () => {
    expect(detailsSchema.safeParse({ brands: ["Acme"] }).success).toBe(false);
    expect(detailsSchema.safeParse({ quote: "lots" }).success).toBe(false);
  });
});

describe("newJobSchema", () => {
  it("accepts a phone lead without an email", () => {
    const parsed = newJobSchema.parse({
      name: "Dana Reyes", phone: "(702) 555-0134", email: "", city: "Henderson", source: "phone",
    });
    expect(parsed.phone).toBe("7025550134");
    expect(parsed.email).toBeUndefined();
  });

  it("requires a known source and a service-area city", () => {
    expect(newJobSchema.safeParse({ name: "Dana", phone: "7025550134", city: "Henderson", source: "hero" }).success).toBe(false);
    expect(newJobSchema.safeParse({ name: "Dana", phone: "7025550134", city: "Phoenix", source: "phone" }).success).toBe(false);
  });
});

describe("notes and lost reasons", () => {
  it("must not be empty", () => {
    expect(noteSchema.safeParse({ body: "  " }).success).toBe(false);
    expect(lostSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(lostSchema.parse({ reason: " Went with a cheaper quote " }).reason).toBe("Went with a cheaper quote");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/admin/schema.test.ts`
Expected: FAIL, cannot resolve `@/lib/admin/schema`.

- [ ] **Step 3: Implement `lib/admin/schema.ts`**

```ts
import { z } from "zod";
import { consultationSchema } from "@/lib/leads/schema";
import { dollarsToCents } from "./money";
import { fromLocalInput } from "./time";

export const BRANDS = ["Superior Blinds MFG", "Alta Window Fashions", "Hunter Douglas"] as const;
export const HAND_SOURCES = ["phone", "referral", "walk-in", "other"] as const;

const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const cents = z
  .string()
  .optional()
  .transform((value, ctx) => {
    try {
      return dollarsToCents(value ?? "");
    } catch (error) {
      ctx.addIssue({ code: "custom", message: (error as Error).message });
      return z.NEVER;
    }
  });

const day = z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date").optional())
  .transform((value) => value ?? null);

export const detailsSchema = z
  .object({
    visitAt: z.preprocess(blank, z.string().optional()),
    quote: cents,
    sold: cents,
    deposit: cents,
    brands: z.array(z.enum(BRANDS)).default([]),
    orderedOn: day,
    installOn: day,
  })
  .transform(({ visitAt, quote, sold, deposit, ...rest }) => ({
    visitAt: visitAt ? fromLocalInput(visitAt) : null,
    quoteCents: quote,
    soldCents: sold,
    depositCents: deposit,
    ...rest,
  }));

export const noteSchema = z.object({ body: z.string().trim().min(1, "Write a note first").max(2000) });
export const lostSchema = z.object({ reason: z.string().trim().min(1, "Say why it was lost").max(200) });

// Reuses the website form's rules, so a hand-entered phone number is stored the same way.
const site = consultationSchema.shape;

export const newJobSchema = z.object({
  name: site.name,
  phone: site.phone,
  email: z.preprocess(blank, site.email.optional()),
  city: site.city,
  address: z.preprocess(blank, site.address),
  notes: z.preprocess(blank, site.notes),
  source: z.enum(HAND_SOURCES),
});

export type DetailsInput = z.output<typeof detailsSchema>;
export type NewJobInput = z.output<typeof newJobSchema>;
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/admin/schema.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing jobs test** — `tests/admin/jobs.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Reads use sql.query (the column list is SQL text); writes use the tagged template.
const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));

const jobs = await import("@/lib/admin/jobs");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

const row = {
  id: ID, created_at: new Date("2026-09-01T00:00:00Z"), name: "Dana Reyes", phone: "7025550134",
  email: "dana@example.com", address: null, city: "Henderson", treatments: ["Shades"],
  window_count: null, heard_via: null, notes: null, source: "contact", status: "quoted",
  stage_changed_at: new Date("2026-09-05T00:00:00Z"), visit_at: null, quote_cents: 450000,
  sold_cents: null, deposit_cents: null, brands: [], ordered_on: null, install_on: null, lost_reason: null,
};

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  sql.query.mockReset().mockResolvedValue([]);
});

describe("reading jobs", () => {
  it("maps database rows to camelCase jobs", async () => {
    sql.query.mockResolvedValue([row]);
    const [job] = await jobs.listJobs({ includeLost: false });
    expect(job).toMatchObject({ id: ID, status: "quoted", quoteCents: 450000, stageChangedAt: row.stage_changed_at });
  });

  it("hides lost jobs unless asked", async () => {
    await jobs.listJobs({ includeLost: false });
    expect(sql.query.mock.calls[0][1]).toEqual([false]);
    await jobs.listJobs({ includeLost: true });
    expect(sql.query.mock.calls[1][1]).toEqual([true]);
  });

  it("returns null for an id that is not a uuid, without querying", async () => {
    expect(await jobs.getJob("../etc")).toBeNull();
    expect(sql.query).not.toHaveBeenCalled();
  });
});

describe("changing jobs", () => {
  it("moves the stage and logs who did it in one statement", async () => {
    await jobs.setStage(ID, "sold", "owner@example.com");
    expect(sql).toHaveBeenCalledOnce();
    const statement = text(sql.mock.calls[0]);
    expect(statement).toContain("update leads");
    expect(statement).toContain("insert into job_events");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([ID, "sold", "owner@example.com"]));
  });

  it("refuses a stage that does not exist", async () => {
    await expect(jobs.setStage(ID, "shipped" as never, "owner@example.com")).rejects.toThrow(/stage/);
    expect(sql).not.toHaveBeenCalled();
  });

  it("records the lost reason with the stage change", async () => {
    await jobs.setStage(ID, "lost", "owner@example.com", "Went with a cheaper quote");
    expect(sql.mock.calls[0]).toContain("Went with a cheaper quote");
  });

  it("logs a note against the job", async () => {
    await jobs.addNote(ID, "Wants the patio in spring", "owner@example.com");
    expect(text(sql.mock.calls[0])).toContain("insert into job_events");
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([ID, "owner@example.com", "Wants the patio in spring"]));
  });

  it("creates a hand-entered job and returns its id", async () => {
    sql.mockResolvedValue([{ id: ID }]);
    const id = await jobs.createJob(
      { name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone" },
      "owner@example.com",
    );
    expect(id).toBe(ID);
    expect(text(sql.mock.calls[0])).toContain("insert into leads");
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `npx vitest run tests/admin/jobs.test.ts`
Expected: FAIL, cannot resolve `@/lib/admin/jobs`.

- [ ] **Step 7: Implement `lib/admin/jobs.ts`**

```ts
import "server-only";
import { db } from "@/lib/db";
import type { DetailsInput, NewJobInput } from "./schema";
import { isStage, type Stage } from "./stages";

export type Job = {
  id: string;
  createdAt: Date;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string;
  treatments: string[];
  windowCount: string | null;
  heardVia: string | null;
  notes: string | null;
  source: string;
  status: Stage;
  stageChangedAt: Date;
  visitAt: Date | null;
  quoteCents: number | null;
  soldCents: number | null;
  depositCents: number | null;
  brands: string[];
  orderedOn: string | null;
  installOn: string | null;
  lostReason: string | null;
};

export type JobEvent = {
  id: string;
  createdAt: Date;
  actor: string;
  kind: "stage" | "note" | "edit";
  fromStatus: Stage | null;
  toStatus: Stage | null;
  body: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Date columns come back as strings so an install date never shifts across time zones.
const COLUMNS = `id, created_at, name, phone, email, address, city, treatments, window_count,
  heard_via, notes, source, status, stage_changed_at, visit_at, quote_cents, sold_cents,
  deposit_cents, brands, ordered_on::text as ordered_on, install_on::text as install_on, lost_reason`;

function toJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    createdAt: new Date(row.created_at as string),
    name: row.name as string,
    phone: row.phone as string,
    email: (row.email as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    city: row.city as string,
    treatments: (row.treatments as string[]) ?? [],
    windowCount: (row.window_count as string | null) ?? null,
    heardVia: (row.heard_via as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    source: row.source as string,
    status: row.status as Stage,
    stageChangedAt: new Date(row.stage_changed_at as string),
    visitAt: row.visit_at ? new Date(row.visit_at as string) : null,
    quoteCents: (row.quote_cents as number | null) ?? null,
    soldCents: (row.sold_cents as number | null) ?? null,
    depositCents: (row.deposit_cents as number | null) ?? null,
    brands: (row.brands as string[]) ?? [],
    orderedOn: (row.ordered_on as string | null) ?? null,
    installOn: (row.install_on as string | null) ?? null,
    lostReason: (row.lost_reason as string | null) ?? null,
  };
}

export async function listJobs({ includeLost }: { includeLost: boolean }): Promise<Job[]> {
  const rows = await db().query(
    `select ${COLUMNS} from leads where ($1 or status <> 'lost') order by stage_changed_at desc`,
    [includeLost],
  );
  return rows.map(toJob);
}

export async function getJob(id: string): Promise<Job | null> {
  if (!UUID.test(id)) return null;
  const rows = await db().query(`select ${COLUMNS} from leads where id = $1`, [id]);
  return rows[0] ? toJob(rows[0]) : null;
}

export async function getEvents(id: string): Promise<JobEvent[]> {
  if (!UUID.test(id)) return [];
  const rows = await db()`
    select id, created_at, actor, kind, from_status, to_status, body
    from job_events where lead_id = ${id} order by created_at desc`;
  return rows.map((row) => ({
    id: row.id as string,
    createdAt: new Date(row.created_at as string),
    actor: row.actor as string,
    kind: row.kind as JobEvent["kind"],
    fromStatus: (row.from_status as Stage | null) ?? null,
    toStatus: (row.to_status as Stage | null) ?? null,
    body: (row.body as string | null) ?? null,
  }));
}

/** One statement, so the stage and its log entry are saved together or not at all. */
export async function setStage(id: string, to: Stage, actor: string, reason?: string): Promise<void> {
  if (!isStage(to)) throw new Error(`Unknown stage: ${String(to)}`);
  const lostReason = to === "lost" ? (reason ?? null) : null;
  await db()`
    with prev as (select status from leads where id = ${id}),
    moved as (
      update leads set status = ${to}, lost_reason = ${lostReason},
        stage_changed_at = now(), updated_at = now()
      where id = ${id} and status <> ${to}
      returning id
    )
    insert into job_events (lead_id, actor, kind, from_status, to_status, body)
    select ${id}, ${actor}, 'stage', prev.status, ${to}, ${lostReason} from prev, moved`;
}

export async function updateDetails(id: string, input: DetailsInput, actor: string): Promise<void> {
  await db()`
    with changed as (
      update leads set
        visit_at = ${input.visitAt}, quote_cents = ${input.quoteCents},
        sold_cents = ${input.soldCents}, deposit_cents = ${input.depositCents},
        brands = ${input.brands}, ordered_on = ${input.orderedOn}::date,
        install_on = ${input.installOn}::date, updated_at = now()
      where id = ${id}
      returning id
    )
    insert into job_events (lead_id, actor, kind, body)
    select id, ${actor}, 'edit', 'Updated job details' from changed`;
}

export async function addNote(id: string, body: string, actor: string): Promise<void> {
  await db()`
    insert into job_events (lead_id, actor, kind, body) values (${id}, ${actor}, 'note', ${body})`;
}

export async function createJob(input: NewJobInput, actor: string): Promise<string> {
  const rows = await db()`
    with created as (
      insert into leads (name, phone, email, city, address, notes, source)
      values (${input.name}, ${input.phone}, ${input.email ?? null}, ${input.city},
              ${input.address ?? null}, ${input.notes ?? null}, ${input.source})
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, to_status, body)
      select id, ${actor}, 'stage', 'new', 'Added by hand' from created
    )
    select id from created`;
  return rows[0].id as string;
}
```

- [ ] **Step 8: Run it to see it pass**

Run: `npx vitest run tests/admin`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/admin/schema.ts lib/admin/jobs.ts tests/admin/schema.test.ts tests/admin/jobs.test.ts
git commit -m "feat: job queries, mutations with activity log, and admin form schemas"
```

---

### Task 7: Job Server Actions and access checks

**Files:**
- Create: `app/admin/jobs/actions.ts`
- Test: `tests/admin/actions.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 4); `setStage`, `updateDetails`, `addNote`, `createJob` (Task 6); schemas (Task 6).
- Produces: `type FormState = { error?: string; ok?: boolean }` and actions, each `(prev: FormState, formData: FormData) => Promise<FormState>` unless noted:
  - `moveStage(id: string, to: Stage): Promise<void>` (bound, used by plain `<form action>`)
  - `markLost(id: string, prev: FormState, formData: FormData)`
  - `saveDetails(id: string, prev: FormState, formData: FormData)`
  - `saveNote(id: string, prev: FormState, formData: FormData)`
  - `addJob(prev: FormState, formData: FormData)` (redirects to the new job on success)

- [ ] **Step 1: Write the failing test** — `tests/admin/actions.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const jobs = { setStage: vi.fn(), updateDetails: vi.fn(), addNote: vi.fn(), createJob: vi.fn() };
vi.mock("@/lib/admin/jobs", () => jobs);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirect = vi.fn(() => { throw new Error("NEXT_REDIRECT"); });
vi.mock("next/navigation", () => ({ redirect }));

const actions = await import("@/app/admin/jobs/actions");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const form = (entries: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) [value].flat().forEach((v) => data.append(key, v));
  return data;
};

beforeEach(() => {
  Object.values(jobs).forEach((fn) => fn.mockReset());
  requireAdmin.mockReset().mockResolvedValue({ email: "owner@example.com" });
});

describe("without a session", () => {
  beforeEach(() => requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT")));

  it.each([
    ["moveStage", () => actions.moveStage(ID, "sold")],
    ["markLost", () => actions.markLost(ID, {}, form({ reason: "x" }))],
    ["saveDetails", () => actions.saveDetails(ID, {}, form({}))],
    ["saveNote", () => actions.saveNote(ID, {}, form({ body: "x" }))],
    ["addJob", () => actions.addJob({}, form({ name: "Dana", phone: "7025550134", city: "Henderson", source: "phone" }))],
  ])("%s touches nothing", async (_name, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");
    Object.values(jobs).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
});

describe("with a session", () => {
  it("records the signed-in owner as the actor", async () => {
    await actions.moveStage(ID, "sold");
    expect(jobs.setStage).toHaveBeenCalledWith(ID, "sold", "owner@example.com");
  });

  it("returns the validation message instead of saving", async () => {
    const state = await actions.saveNote(ID, {}, form({ body: "  " }));
    expect(state.error).toMatch(/note/i);
    expect(jobs.addNote).not.toHaveBeenCalled();
  });

  it("saves details parsed from the form", async () => {
    const state = await actions.saveDetails(ID, {}, form({ quote: "4,500", brands: ["Hunter Douglas"] }));
    expect(state).toEqual({ ok: true });
    expect(jobs.updateDetails).toHaveBeenCalledWith(
      ID, expect.objectContaining({ quoteCents: 450000, brands: ["Hunter Douglas"] }), "owner@example.com",
    );
  });

  it("opens the new job after adding it", async () => {
    jobs.createJob.mockResolvedValue(ID);
    await expect(
      actions.addJob({}, form({ name: "Dana Reyes", phone: "7025550134", city: "Henderson", source: "phone" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(`/admin/jobs/${ID}`);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/admin/actions.test.ts`
Expected: FAIL, cannot resolve `@/app/admin/jobs/actions`.

- [ ] **Step 3: Implement `app/admin/jobs/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/session";
import { addNote, createJob, setStage, updateDetails } from "@/lib/admin/jobs";
import { detailsSchema, lostSchema, newJobSchema, noteSchema } from "@/lib/admin/schema";
import type { Stage } from "@/lib/admin/stages";

export type FormState = { error?: string; ok?: boolean };

const refresh = (id: string) => {
  revalidatePath("/admin");
  revalidatePath(`/admin/jobs/${id}`);
};

// Every action calls requireAdmin() before reading its input.

export async function moveStage(id: string, to: Stage): Promise<void> {
  const { email } = await requireAdmin();
  await setStage(id, to, email);
  refresh(id);
}

export async function markLost(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const parsed = lostSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await setStage(id, "lost", email, parsed.data.reason);
  refresh(id);
  return { ok: true };
}

export async function saveDetails(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const parsed = detailsSchema.safeParse({
    visitAt: formData.get("visitAt") ?? "",
    quote: formData.get("quote") ?? "",
    sold: formData.get("sold") ?? "",
    deposit: formData.get("deposit") ?? "",
    brands: formData.getAll("brands"),
    orderedOn: formData.get("orderedOn") ?? "",
    installOn: formData.get("installOn") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await updateDetails(id, parsed.data, email);
  refresh(id);
  return { ok: true };
}

export async function saveNote(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const parsed = noteSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await addNote(id, parsed.data.body, email);
  refresh(id);
  return { ok: true };
}

export async function addJob(_prev: FormState, formData: FormData): Promise<FormState> {
  const { email } = await requireAdmin();
  const parsed = newJobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = await createJob(parsed.data, email);
  revalidatePath("/admin");
  redirect(`/admin/jobs/${id}`);
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/admin/actions.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add app/admin/jobs/actions.ts tests/admin/actions.test.ts
git commit -m "feat: job Server Actions guarded by requireAdmin"
```

---

### Task 8: The board

**Files:**
- Create: `app/admin/page.tsx`, `app/admin/JobCard.tsx`
- Test: `tests/admin/board.test.tsx`

**Interfaces:**
- Consumes: `requireAdmin`, `listJobs`, `Job`, `STAGES`, `stageLabel`, `signOut`.
- Produces: `JobCard({ job, now }: { job: Job; now: Date })`, and exported for tests `groupByStage(jobs: Job[], includeLost: boolean): { stage: Stage; label: string; jobs: Job[] }[]` from `app/admin/JobCard.tsx`.

- [ ] **Step 1: Write the failing test** — `tests/admin/board.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { JobCard, groupByStage } from "@/app/admin/JobCard";
import type { Job } from "@/lib/admin/jobs";

const job = (overrides: Partial<Job>): Job => ({
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date("2026-09-01T00:00:00Z"),
  name: "Dana Reyes", phone: "7025550134", email: null, address: null, city: "Henderson",
  treatments: ["Shades", "Shutters"], windowCount: null, heardVia: null, notes: null, source: "contact",
  status: "new", stageChangedAt: new Date("2026-09-07T00:00:00Z"), visitAt: null, quoteCents: null,
  soldCents: null, depositCents: null, brands: [], orderedOn: null, installOn: null, lostReason: null,
  ...overrides,
});

describe("board", () => {
  it("groups jobs into the seven stages, in order, even when empty", () => {
    const groups = groupByStage([job({ status: "sold" })], false);
    expect(groups.map((g) => g.label)).toEqual([
      "New lead", "Contacted", "Visit booked", "Quoted", "Sold", "Ordered", "Installed",
    ]);
    expect(groups.find((g) => g.stage === "sold")!.jobs).toHaveLength(1);
  });

  it("adds a Lost group only when asked", () => {
    expect(groupByStage([], true).at(-1)!.label).toBe("Lost");
    expect(groupByStage([], false).some((g) => g.stage === "lost")).toBe(false);
  });

  it("shows the name, city, interests, and days in stage, and links to the job", () => {
    render(<JobCard job={job({})} now={new Date("2026-09-10T00:00:00Z")} />);
    const link = screen.getByRole("link", { name: /dana reyes/i });
    expect(link).toHaveAttribute("href", "/admin/jobs/3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c");
    expect(link).toHaveTextContent("Henderson");
    expect(link).toHaveTextContent("Shades, Shutters");
    expect(link).toHaveTextContent("3 days");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/admin/board.test.tsx`
Expected: FAIL, cannot resolve `@/app/admin/JobCard`.

- [ ] **Step 3: Implement `app/admin/JobCard.tsx`**

```tsx
import Link from "next/link";
import type { Job } from "@/lib/admin/jobs";
import { STAGES, stageLabel, type Stage } from "@/lib/admin/stages";

export function groupByStage(jobs: Job[], includeLost: boolean) {
  const stages: Stage[] = [...STAGES.map((s) => s.value), ...(includeLost ? (["lost"] as const) : [])];
  return stages.map((stage) => ({
    stage,
    label: stageLabel(stage),
    jobs: jobs.filter((job) => job.status === stage),
  }));
}

const daysSince = (from: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));

export function JobCard({ job, now }: { job: Job; now: Date }) {
  const days = daysSince(job.stageChangedAt, now);
  return (
    <Link
      href={`/admin/jobs/${job.id}`}
      className="flex flex-col gap-1 border border-rule bg-ivory p-3 text-sm transition-colors hover:border-champagne-ink"
    >
      <span className="font-display text-base text-charcoal">{job.name}</span>
      <span className="text-ink-soft">{job.city}</span>
      {job.treatments.length ? <span className="text-ink-soft">{job.treatments.join(", ")}</span> : null}
      <span className="font-display text-xs uppercase tracking-[0.12em] text-champagne-ink">
        {days === 1 ? "1 day" : `${days} days`} in stage
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: Implement `app/admin/page.tsx`**

```tsx
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { listJobs } from "@/lib/admin/jobs";
import { requireAdmin } from "@/lib/admin/session";
import { signOut } from "./actions";
import { JobCard, groupByStage } from "./JobCard";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ lost?: string }>;
}) {
  const { email } = await requireAdmin();
  const includeLost = (await searchParams).lost === "1";
  const groups = groupByStage(await listJobs({ includeLost }), includeLost);
  const now = new Date();

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-light">Jobs</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={includeLost ? "/admin" : "/admin?lost=1"} className="underline underline-offset-4">
            {includeLost ? "Hide lost" : "Show lost"}
          </Link>
          <ButtonLink href="/admin/jobs/new">New job</ButtonLink>
          <form action={signOut}>
            <button type="submit" className="text-ink-soft underline underline-offset-4" title={email}>
              Sign out
            </button>
          </form>
        </div>
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
              group.jobs.map((job) => <JobCard key={job.id} job={job} now={now} />)
            ) : (
              <p className="text-sm text-ink-soft">Nothing here.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run tests/admin && npm run typecheck`
Expected: PASS and clean.

- [ ] **Step 6: Commit**

```bash
git add app/admin/page.tsx app/admin/JobCard.tsx tests/admin/board.test.tsx
git commit -m "feat: job board grouped by stage"
```

---

### Task 9: Job page and new-job page

**Files:**
- Create: `app/admin/jobs/[id]/page.tsx`, `app/admin/jobs/[id]/not-found.tsx`, `app/admin/jobs/[id]/StageControls.tsx`, `app/admin/jobs/[id]/DetailsForm.tsx`, `app/admin/jobs/[id]/NoteForm.tsx`, `app/admin/jobs/new/page.tsx`, `app/admin/jobs/new/NewJobForm.tsx`
- Test: `tests/admin/job-page.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3, 6, and 7.
- Produces: `StageControls({ job }: { job: Job })`, `DetailsForm({ job }: { job: Job })`, `NoteForm({ jobId }: { jobId: string })`, `NewJobForm()`.

- [ ] **Step 1: Write the failing test** — `tests/admin/job-page.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { Job } from "@/lib/admin/jobs";

const moveStage = vi.fn(async () => {});
const saveNote = vi.fn(async () => ({ error: "Write a note first" }));
vi.mock("@/app/admin/jobs/actions", () => ({
  moveStage, saveNote,
  markLost: vi.fn(async () => ({})), saveDetails: vi.fn(async () => ({ ok: true })),
}));

const { StageControls } = await import("@/app/admin/jobs/[id]/StageControls");
const { NoteForm } = await import("@/app/admin/jobs/[id]/NoteForm");
const { DetailsForm } = await import("@/app/admin/jobs/[id]/DetailsForm");

const job: Job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", createdAt: new Date(), name: "Dana Reyes",
  phone: "7025550134", email: null, address: null, city: "Henderson", treatments: [], windowCount: null,
  heardVia: null, notes: null, source: "phone", status: "quoted", stageChangedAt: new Date(),
  visitAt: null, quoteCents: 450000, soldCents: null, depositCents: null, brands: ["Hunter Douglas"],
  orderedOn: null, installOn: null, lostReason: null,
};

describe("job page", () => {
  it("offers the next stage as the main button", () => {
    render(<StageControls job={job} />);
    expect(screen.getByRole("button", { name: "Move to Sold" })).toBeInTheDocument();
  });

  it("offers no next step once a job is installed", () => {
    render(<StageControls job={{ ...job, status: "installed" }} />);
    expect(screen.queryByRole("button", { name: /^Move to/ })).toBeNull();
  });

  it("shows a note validation error inline", async () => {
    const user = userEvent.setup();
    render(<NoteForm jobId={job.id} />);
    await user.click(screen.getByRole("button", { name: /add note/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Write a note first");
  });

  it("prefills saved details as dollars and checked brands", () => {
    render(<DetailsForm job={job} />);
    expect(screen.getByLabelText(/quote/i)).toHaveValue("4500.00");
    expect(screen.getByRole("checkbox", { name: "Hunter Douglas" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Alta Window Fashions" })).not.toBeChecked();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/admin/job-page.test.tsx`
Expected: FAIL, cannot resolve the components.

- [ ] **Step 3: Implement the client components**

`app/admin/jobs/[id]/StageControls.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { Job } from "@/lib/admin/jobs";
import { ALL_STAGES, nextStage, stageLabel } from "@/lib/admin/stages";
import { markLost, moveStage, type FormState } from "../actions";

export function StageControls({ job }: { job: Job }) {
  const next = nextStage(job.status);
  const [lostState, lostAction, losing] = useActionState<FormState, FormData>(
    markLost.bind(null, job.id),
    {},
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">
        Stage: <span className="font-display text-charcoal">{stageLabel(job.status)}</span>
        {job.lostReason ? ` — ${job.lostReason}` : null}
      </p>

      {next ? (
        <form action={moveStage.bind(null, job.id, next)}>
          <Button type="submit" className="w-full sm:w-auto">Move to {stageLabel(next)}</Button>
        </form>
      ) : null}

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

      {job.status !== "lost" ? (
        <form action={lostAction} className="flex flex-wrap items-end gap-3">
          <label htmlFor="lost-reason" className="flex flex-1 flex-col gap-1 text-sm">
            Mark lost — reason
            <input id="lost-reason" name="reason" className="min-h-11 border border-rule bg-ivory px-3" />
          </label>
          <Button type="submit" variant="outline" disabled={losing}>Mark lost</Button>
          {lostState.error ? <p role="alert" className="w-full text-sm">{lostState.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
```

`app/admin/jobs/[id]/NoteForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/forms/Field";
import { saveNote, type FormState } from "../actions";

export function NoteForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveNote.bind(null, jobId), {});
  return (
    // A fresh key after each save clears the textarea.
    <form key={state.ok ? Date.now() : "note"} action={action} className="flex flex-col gap-3">
      <TextAreaField id="note-body" name="body" label="Add a note" rows={3} />
      {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
      <Button type="submit" variant="outline" disabled={pending} className="self-start">Add note</Button>
    </form>
  );
}
```

`app/admin/jobs/[id]/DetailsForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/forms/Field";
import type { Job } from "@/lib/admin/jobs";
import { BRANDS } from "@/lib/admin/schema";
import { toLocalInput } from "@/lib/admin/time";
import { saveDetails, type FormState } from "../actions";

const dollars = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));
const CONTROL = "min-h-11 w-full border border-rule bg-ivory px-4 py-3";

export function DetailsForm({ job }: { job: Job }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveDetails.bind(null, job.id), {});

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label htmlFor="visitAt" className="flex flex-col gap-2 text-sm">
        Visit date and time
        <input id="visitAt" name="visitAt" type="datetime-local" className={CONTROL}
          defaultValue={job.visitAt ? toLocalInput(job.visitAt) : ""} />
      </label>
      <Money id="quote" label="Quote" value={dollars(job.quoteCents)} />
      <Money id="sold" label="Sold amount" value={dollars(job.soldCents)} />
      <Money id="deposit" label="Deposit received" value={dollars(job.depositCents)} />
      <label htmlFor="orderedOn" className="flex flex-col gap-2 text-sm">
        Order date
        <input id="orderedOn" name="orderedOn" type="date" className={CONTROL} defaultValue={job.orderedOn ?? ""} />
      </label>
      <label htmlFor="installOn" className="flex flex-col gap-2 text-sm">
        Install date
        <input id="installOn" name="installOn" type="date" className={CONTROL} defaultValue={job.installOn ?? ""} />
      </label>
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="text-sm">Brands on this job</legend>
        <div className="flex flex-wrap gap-2">
          {BRANDS.map((brand) => (
            <label key={brand} htmlFor={`brand-${brand}`} className="flex min-h-11 items-center gap-2 border border-rule px-3 text-sm">
              <input id={`brand-${brand}`} type="checkbox" name="brands" value={brand}
                defaultChecked={job.brands.includes(brand)} />
              {brand}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-4 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save details"}</Button>
        {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
        {state.ok ? <p role="status" className="text-sm text-ink-soft">Saved</p> : null}
      </div>
    </form>
  );
}

function Money({ id, label, value }: { id: string; label: string; value: string }) {
  return <TextField id={id} name={id} label={label} inputMode="numeric" placeholder="$" defaultValue={value} />;
}
```

`TextField` in `components/forms/Field.tsx` has no `defaultValue` prop. Add one: add `defaultValue?: string;` to its props type, destructure it, and pass `defaultValue={defaultValue}` to the `<input>`. It is optional, so existing callers are unaffected.

- [ ] **Step 4: Implement the pages**

`app/admin/jobs/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPhone } from "@/lib/leads/schema";
import { getEvents, getJob } from "@/lib/admin/jobs";
import { formatCents } from "@/lib/admin/money";
import { requireAdmin } from "@/lib/admin/session";
import { stageLabel } from "@/lib/admin/stages";
import { formatWhen } from "@/lib/admin/time";
import { DetailsForm } from "./DetailsForm";
import { NoteForm } from "./NoteForm";
import { StageControls } from "./StageControls";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const events = await getEvents(id);

  const mapHref = `https://maps.google.com/?q=${encodeURIComponent([job.address, job.city, "NV"].filter(Boolean).join(", "))}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <Link href="/admin" className="text-sm underline underline-offset-4">← All jobs</Link>

      <section className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-light">{job.name}</h1>
        <a href={`tel:+1${job.phone}`} className="text-lg underline-offset-4 hover:underline">{formatPhone(job.phone)}</a>
        {job.email ? <a href={`mailto:${job.email}`} className="underline-offset-4 hover:underline">{job.email}</a> : null}
        <a href={mapHref} className="text-ink-soft underline-offset-4 hover:underline">
          {[job.address, job.city].filter(Boolean).join(", ")}
        </a>
        <dl className="mt-2 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1 text-sm text-ink-soft">
          <dt>Interested in</dt><dd>{job.treatments.join(", ") || "—"}</dd>
          <dt>Windows</dt><dd>{job.windowCount ?? "—"}</dd>
          <dt>Heard about us</dt><dd>{job.heardVia ?? "—"}</dd>
          <dt>Came in via</dt><dd>{job.source}</dd>
          <dt>Quote / sold</dt><dd>{formatCents(job.quoteCents)} / {formatCents(job.soldCents)}</dd>
        </dl>
        {job.notes ? <p className="mt-2 whitespace-pre-line border-l-2 border-champagne pl-4 text-sm">{job.notes}</p> : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Stage</h2>
        <StageControls job={job} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Job details</h2>
        <DetailsForm job={job} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-champagne-ink">Activity</h2>
        <NoteForm jobId={job.id} />
        <ol className="flex flex-col gap-3 text-sm">
          {events.map((event) => (
            <li key={event.id} className="border-b border-rule pb-3">
              <p className="text-charcoal">
                {event.kind === "stage" && event.toStatus
                  ? `${event.fromStatus ? `${stageLabel(event.fromStatus)} → ` : ""}${stageLabel(event.toStatus)}`
                  : event.body}
              </p>
              {event.kind === "stage" && event.body ? <p className="text-ink-soft">{event.body}</p> : null}
              <p className="text-xs text-ink-soft">{event.actor} · {formatWhen(event.createdAt)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
```

`app/admin/jobs/[id]/not-found.tsx`:

```tsx
import Link from "next/link";

export default function JobNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 py-16">
      <h1 className="font-display text-2xl font-light">No job with that link</h1>
      <Link href="/admin" className="underline underline-offset-4">Back to all jobs</Link>
    </div>
  );
}
```

`app/admin/jobs/new/NewJobForm.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/forms/Field";
import { business } from "@/content/business";
import { HAND_SOURCES } from "@/lib/admin/schema";
import { addJob, type FormState } from "../actions";

export function NewJobForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addJob, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <TextField id="job-name" name="name" label="Name" required />
      <TextField id="job-phone" name="phone" label="Phone" type="tel" inputMode="tel" required />
      <TextField id="job-email" name="email" label="Email (optional)" type="email" />
      <SelectField id="job-city" name="city" label="City" options={business.serviceArea} defaultValue={business.serviceArea[0]} />
      <TextField id="job-address" name="address" label="Street address (optional)" />
      <SelectField id="job-source" name="source" label="How they reached us" options={HAND_SOURCES} defaultValue="phone" />
      <TextAreaField id="job-notes" name="notes" label="Notes (optional)" />
      {state.error ? <p role="alert" className="text-sm">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="self-start">{pending ? "Adding…" : "Add job"}</Button>
    </form>
  );
}
```

`app/admin/jobs/new/page.tsx`:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import { NewJobForm } from "./NewJobForm";

export default async function NewJobPage() {
  await requireAdmin();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link href="/admin" className="text-sm underline underline-offset-4">← All jobs</Link>
      <h1 className="font-display text-2xl font-light">New job</h1>
      <NewJobForm />
    </div>
  );
}
```

- [ ] **Step 5: Run everything**

Run: `npm run typecheck && npm test && npm run lint`
Expected: typecheck clean; all tests pass; lint shows only the known pre-existing `ConsultationForm.tsx` set-state-in-effect error and nothing new.

- [ ] **Step 6: Commit**

```bash
git add app/admin/jobs components/forms/Field.tsx tests/admin/job-page.test.tsx
git commit -m "feat: job page with stage controls, details, notes, and a new-job form"
```

---

### Task 10: End-to-end test, migration, and launch

**Files:**
- Create: `e2e/admin.spec.ts`
- Modify: `playwright.config.ts` (pass test database and admin settings to the web server when `E2E_POSTGRES_URL` is set)

**Interfaces:**
- Consumes: the whole tracker; `hashToken` from `lib/admin/tokens.ts`.

- [ ] **Step 1: Pass test settings to the web server** — in `playwright.config.ts`, inside `webServer`, add:

```ts
    // Admin tests need a database. They run only against a Neon branch passed in
    // E2E_POSTGRES_URL, never production, and are skipped when it is absent.
    env: process.env.E2E_POSTGRES_URL
      ? {
          POSTGRES_URL: process.env.E2E_POSTGRES_URL,
          ADMIN_EMAILS: "e2e-owner@example.com",
          ADMIN_BASE_URL: baseURL,
        }
      : {},
```

- [ ] **Step 2: Write `e2e/admin.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run admin tests");

const sql = () => neon(url!);
const NAME = `E2E Tracker ${Date.now()}`;

async function signIn(page: import("@playwright/test").Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at)
    values (${hash}, 'e2e-owner@example.com', now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
}

test.afterAll(async () => {
  if (url) await sql()`delete from leads where name like 'E2E Tracker %'`;
});

test("an admin page without a session goes to sign-in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/sign-in$/);
});

test("a used sign-in link is refused", async ({ page }) => {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at, used_at)
    values (${hash}, 'e2e-owner@example.com', now() + interval '15 minutes', now())`;
  await page.goto(`/admin/auth?token=${token}`);
  await expect(page.getByRole("alert")).toContainText(/expired or was already used/i);
});

test("an owner adds a job, advances it, and leaves a note", async ({ page }) => {
  await signIn(page);

  await page.getByRole("link", { name: "New job" }).click();
  await page.getByLabel("Name", { exact: true }).fill(NAME);
  await page.getByLabel("Phone", { exact: true }).fill("(702) 555-0134");
  await page.getByRole("button", { name: "Add job" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAME);
  await page.getByRole("button", { name: "Move to Contacted" }).click();
  await expect(page.getByText("Stage:")).toContainText("Contacted");

  await page.getByLabel("Add a note").fill("Call back after 5pm");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Call back after 5pm")).toBeVisible();
  await expect(page.getByText("New lead → Contacted")).toBeVisible();

  await page.getByRole("link", { name: "← All jobs" }).click();
  await expect(page.getByRole("region", { name: /contacted/i }).getByRole("link", { name: new RegExp(NAME) })).toBeVisible();
});
```

- [ ] **Step 3: Run the e2e suite without a database**

Run: `npx playwright test`
Expected: all existing tests pass; `admin.spec.ts` reports its tests as skipped.

- [ ] **Step 4: Run the admin e2e tests against a Neon branch**

Ask the user for a Neon branch connection string (or create one in the Neon console from the production branch). Apply the migration to it, then run the tests:

```bash
DATABASE_URL="<branch url>" node scripts/migrate.mjs
E2E_POSTGRES_URL="<branch url>" npx playwright test e2e/admin.spec.ts --project=desktop
```

`scripts/migrate.mjs` reads `.env.local` first; if `.env.local` defines `DATABASE_URL`, temporarily run it with a copy of the script pointed at the branch instead, so production is not touched.

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add e2e/admin.spec.ts playwright.config.ts
git commit -m "test: end-to-end coverage for the admin tracker"
```

- [ ] **Step 6: Launch (confirm each item with the user before running it)**

1. Add production settings: `npx vercel env add ADMIN_EMAILS production` with `whirleyjoshua@gmail.com`, and `npx vercel env add ADMIN_BASE_URL production` with `https://premiershadesolutions.com`.
2. Apply `002_job_tracker.sql` to the production database. Every statement is additive or re-runnable, and existing rows all have `status = 'new'`, which satisfies the new check.
3. Deploy with `npx vercel --prod` (the project deploys by CLI, not by git push).
4. Verify on the live site: `/admin` redirects to `/admin/sign-in`; `robots.txt` disallows `/admin`; the owner receives a sign-in link, it opens the board, existing website leads appear under New lead, and a test job can be moved and then marked Lost.
