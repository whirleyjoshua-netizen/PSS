# Outlook Calendar Sync and Schedule Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep job visit and install dates in two-way sync with one shared Outlook calendar, and add an admin Schedule tab with a week view.

**Architecture:**
- The client-credentials flow to Microsoft Graph uses plain `fetch` (no SDK).
- One reconcile function per job decides whether to create, patch, delete or pull, and every trigger uses it: tracker saves, the Graph webhook, and a daily cron.
- The Graph `changeKey` stored for each job event decides which side changed.
- The whole feature does nothing unless five environment variables are set.

**Tech Stack:** Next.js 16 App Router (route handlers, `after()` from `next/server`), Neon Postgres (the `db()` tagged template and `.query`), Vitest with Testing Library, Playwright, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-09-14-outlook-calendar-schedule-design.md`

## Global Constraints

- The feature is on only when `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `CALENDAR_MAILBOX` and `CALENDAR_CLIENT_STATE` are all non-empty. Otherwise every sync call does nothing, the webhook returns 404, and the Schedule tab uses tracker dates only.
- Sync never throws into a caller and never fails a job save. Failures are written to `calendar_sync_state.last_error`.
- Time zone: every Graph request sends `Prefer: outlook.timezone="Pacific Standard Time"`, and every event written uses `timeZone: "Pacific Standard Time"`. Tracker conversions use `lib/admin/time.ts` (`fromLocalInput`, `toLocalInput`, `lasVegasDate`).
- Subjects: `Visit · <name>` and `Install · <name>`, where the middle character is U+00B7.
- A visit is a 1-hour timed event. An install is all-day (from midnight on the date to midnight the next day).
- Webhook: a validation request gets `200 text/plain` echoing the decoded `validationToken`. A notification is answered `202` immediately and processed in `after()`. `clientState` is compared in constant time.
- Subscription: resource `users/<CALENDAR_MAILBOX>/events`, changeType `created,updated,deleted`, renewed to now + 6 days 23 hours when it has fewer than 3 days left.
- Daily cron: `/api/cron/calendar` at `0 16 * * *`, requiring `Authorization: Bearer <CRON_SECRET>` like the review cron.
- Admin pages and actions call `requireAdmin()` first. Admin UI uses only palette tokens (no color literals). Icons are decorative and every control has a text label.
- Job history entries use `job_events.kind = 'edit'`. No new kinds.
- Tests run with `npx vitest run --maxWorkers=2`. In a fresh worktree, run `npx next typegen` before `npx tsc --noEmit`. E2E runs only against `next build` plus `next start --hostname 127.0.0.1 --port 3100` and a Neon test branch.
- Commit only files that belong to your task. Another session shares this repo.

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/007_outlook_calendar.sql` | The `job_calendar_events` and `calendar_sync_state` tables |
| `lib/calendar/config.ts` | Reads the env vars: `calendarConfig()`, `calendarEnabled()` |
| `lib/calendar/graph.ts` | Token cache, `graphFetch`, `GraphError` |
| `lib/calendar/events.ts` | Pure functions: event bodies, reading Graph dates back into tracker values |
| `lib/calendar/store.ts` | Database access for links, job dates, sync state, and reconcile targets |
| `lib/calendar/sync.ts` | `reconcileJob`, `syncJobCalendar`, `applyOutlookChange`, `reconcileCalendar` |
| `lib/calendar/subscription.ts` | `ensureSubscription` |
| `lib/calendar/week.ts` | Week math and `getWeek` for the Schedule page |
| `app/api/calendar/notifications/route.ts` | The Graph webhook |
| `app/api/cron/calendar/route.ts` | The daily cron |
| `app/admin/schedule/page.tsx` | The Schedule tab |
| `app/admin/AdminNav.tsx` | Adds the Schedule link |
| `app/admin/settings/page.tsx` | The Outlook status line |
| `app/admin/jobs/actions.ts` | Sync hooks |
| `vercel.json` | The second cron |
| `e2e/admin.spec.ts` | The Schedule journey |
| `docs/outlook-setup.md` | The owner's Microsoft 365 checklist |

---

### Task 1: Migration, config and the Graph client

**Files:**
- Create: `db/migrations/007_outlook_calendar.sql`
- Create: `lib/calendar/config.ts`
- Create: `lib/calendar/graph.ts`
- Test: `tests/calendar/graph.test.ts`

**Interfaces:**
- Produces:
  - `calendarConfig(): CalendarConfig | null`, where `CalendarConfig = { tenantId; clientId; clientSecret; mailbox; clientState }` (all strings).
  - `calendarEnabled(): boolean`.
  - `graphFetch(path: string, init?: { method?: string; body?: unknown }): Promise<Response>`. `path` is relative to `https://graph.microsoft.com/v1.0/`, and an absolute `https://` URL is also accepted.
  - `class GraphError extends Error { status: number }`.
  - `graphJson<T>(path, init?): Promise<T>`, which throws `GraphError` on a non-2xx response.
  - `resetGraphTokenForTests()`.

- [ ] **Step 1: Write the migration**

```sql
-- Outlook calendar sync: which Outlook event belongs to which job date,
-- and the Graph subscription that tells us when those events change.
--
-- Every statement is safe to re-run: the migrate script applies all files.

create table if not exists job_calendar_events (
  lead_id    uuid not null references leads (id) on delete cascade,
  kind       text not null check (kind in ('visit', 'install')),
  event_id   text not null unique,
  change_key text not null,
  synced_at  timestamptz not null default now(),
  primary key (lead_id, kind)
);

-- A single row (id = 1).
create table if not exists calendar_sync_state (
  id              int primary key default 1 check (id = 1),
  subscription_id text,
  expires_at      timestamptz,
  last_error      text,
  last_error_at   timestamptz,
  updated_at      timestamptz not null default now()
);

insert into calendar_sync_state (id) values (1) on conflict (id) do nothing;
```

- [ ] **Step 2: Write the failing test** `tests/calendar/graph.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { calendarConfig, calendarEnabled } = await import("@/lib/calendar/config");
const graph = await import("@/lib/calendar/graph");

const ENV = {
  MS_TENANT_ID: "tenant", MS_CLIENT_ID: "client", MS_CLIENT_SECRET: "secret",
  CALENDAR_MAILBOX: "jobs@example.com", CALENDAR_CLIENT_STATE: "x".repeat(32),
};
const fetchMock = vi.fn();

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  graph.resetGraphTokenForTests();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const token = () => Response.json({ access_token: "tok", expires_in: 3600 });

describe("config", () => {
  it("is enabled only when all five settings are present", () => {
    expect(calendarEnabled()).toBe(true);
    expect(calendarConfig()?.mailbox).toBe("jobs@example.com");
    vi.stubEnv("CALENDAR_CLIENT_STATE", "");
    expect(calendarEnabled()).toBe(false);
    expect(calendarConfig()).toBeNull();
  });
});

describe("graphFetch", () => {
  it("gets a client-credentials token once and sends the Las Vegas time zone", async () => {
    fetchMock.mockResolvedValueOnce(token())
      .mockResolvedValueOnce(Response.json({ ok: 1 }))
      .mockResolvedValueOnce(Response.json({ ok: 2 }));
    await graph.graphFetch("users/jobs@example.com/events");
    await graph.graphFetch("users/jobs@example.com/events");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://login.microsoftonline.com/tenant/oauth2/v2.0/token");
    expect(String(tokenInit.body)).toContain("grant_type=client_credentials");
    expect(String(tokenInit.body)).toContain("scope=https%3A%2F%2Fgraph.microsoft.com%2F.default");
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://graph.microsoft.com/v1.0/users/jobs@example.com/events");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers.Prefer).toBe('outlook.timezone="Pacific Standard Time"');
  });

  it("sends JSON bodies and accepts absolute Graph URLs", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await graph.graphFetch("https://graph.microsoft.com/v1.0/subscriptions/1", { method: "PATCH", body: { a: 1 } });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://graph.microsoft.com/v1.0/subscriptions/1");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe('{"a":1}');
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("retries once on 429, honoring Retry-After", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(token())
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(Response.json({}));
    const pending = graph.graphFetch("me");
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).status).toBe(200);
    vi.useRealTimers();
  });

  it("graphJson throws GraphError with the status on failure", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response("nope", { status: 404 }));
    await expect(graph.graphJson("x")).rejects.toMatchObject({ name: "GraphError", status: 404 });
  });

  it("throws when the token request fails, without leaking the secret", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 401 }));
    const error = await graph.graphFetch("x").catch((e) => e);
    expect(error).toBeInstanceOf(graph.GraphError);
    expect(String(error.message)).not.toContain("secret");
  });
});
```

- [ ] **Step 3: Run it and check that it fails.** Run `npx vitest run tests/calendar/graph.test.ts --maxWorkers=2`. Expected: FAIL, because the modules can't be resolved.

- [ ] **Step 4: Implement** `lib/calendar/config.ts`

```ts
export type CalendarConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailbox: string;
  clientState: string;
};

/** The Outlook settings, or null when any is missing, in which case the calendar feature is off. */
export function calendarConfig(): CalendarConfig | null {
  const config = {
    tenantId: process.env.MS_TENANT_ID ?? "",
    clientId: process.env.MS_CLIENT_ID ?? "",
    clientSecret: process.env.MS_CLIENT_SECRET ?? "",
    mailbox: process.env.CALENDAR_MAILBOX ?? "",
    clientState: process.env.CALENDAR_CLIENT_STATE ?? "",
  };
  return Object.values(config).every((value) => value.trim() !== "") ? config : null;
}

export const calendarEnabled = (): boolean => calendarConfig() !== null;
```

- [ ] **Step 5: Implement** `lib/calendar/graph.ts`

```ts
import "server-only";
import { calendarConfig } from "./config";

const GRAPH = "https://graph.microsoft.com/v1.0/";
const TIMEOUT_MS = 10_000;

export class GraphError extends Error {
  name = "GraphError";
  constructor(message: string, public status: number) {
    super(message);
  }
}

let cached: { token: string; expiresAt: number } | null = null;
export const resetGraphTokenForTests = () => { cached = null; };

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const config = calendarConfig();
  if (!config) throw new GraphError("Outlook is not configured", 0);
  const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new GraphError(`Microsoft sign-in failed (${response.status})`, response.status);
  const { access_token, expires_in } = (await response.json()) as { access_token: string; expires_in: number };
  // Refresh five minutes early so a token never expires mid-request.
  cached = { token: access_token, expiresAt: Date.now() + (expires_in - 300) * 1000 };
  return access_token;
}

/** One Graph request. Retries once on 429/503, honoring Retry-After. Callers check the status. */
export async function graphFetch(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const url = path.startsWith("https://") ? path : GRAPH + path.replace(/^\/+/, "");
  const send = async () =>
    fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        Prefer: 'outlook.timezone="Pacific Standard Time"',
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  const first = await send();
  if (first.status !== 429 && first.status !== 503) return first;
  const wait = Math.min(Number(first.headers.get("Retry-After")) || 2, 10) * 1000;
  await new Promise((resolve) => setTimeout(resolve, wait));
  return send();
}

export async function graphJson<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await graphFetch(path, init);
  if (!response.ok) throw new GraphError(`Graph ${init?.method ?? "GET"} failed (${response.status})`, response.status);
  return (response.status === 204 ? undefined : await response.json()) as T;
}
```

- [ ] **Step 6: Run the test.** Expected: PASS. Then run `npx next typegen` and `npx tsc --noEmit`, and check there are no errors.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/007_outlook_calendar.sql lib/calendar/config.ts lib/calendar/graph.ts tests/calendar/graph.test.ts
git commit -m "feat: calendar tables, Outlook config and Graph client"
```

---

### Task 2: Event bodies and date conversion (pure)

**Files:**
- Create: `lib/calendar/events.ts`
- Test: `tests/calendar/events.test.ts`

**Interfaces:**
- Consumes: `fromLocalInput` and `toLocalInput` from `lib/admin/time.ts`.
- Produces:
  - `type Kind = "visit" | "install"`.
  - `type GraphEvent = { id: string; changeKey: string; subject?: string; isAllDay?: boolean; start: { dateTime: string; timeZone: string }; end: { dateTime: string; timeZone: string }; type?: string; seriesMasterId?: string | null }`.
  - `type EventJob = { id: string; name: string; phone: string; email: string | null; address: string | null; city: string; treatments: string[] }`.
  - `newEventBody(kind: Kind, job: EventJob, value: Date | string, jobUrl: string): object`.
  - `movedTimes(kind: Kind, value: Date | string, current: GraphEvent): { start; end }`.
  - `trackerValue(kind: Kind, event: GraphEvent): Date | string`. A visit returns a `Date`. An install returns a `"YYYY-MM-DD"` string.
  - `sameValue(kind: Kind, a: Date | string | null, b: Date | string | null): boolean`.

- [ ] **Step 1: Write the failing test** `tests/calendar/events.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { newEventBody, movedTimes, trackerValue, sameValue, type GraphEvent } from "@/lib/calendar/events";

const job = {
  id: "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c", name: "Dana Reyes", phone: "7025550134",
  email: "dana@example.com", address: "12 Elm St", city: "Henderson", treatments: ["Shades"],
};
const URL_ = "https://example.com/admin?job=" + job.id;
const PST = "Pacific Standard Time";
const ev = (start: string, end: string, isAllDay = false): GraphEvent => ({
  id: "e1", changeKey: "ck", isAllDay, start: { dateTime: start, timeZone: PST }, end: { dateTime: end, timeZone: PST },
});

describe("newEventBody", () => {
  it("builds a 1-hour visit in Las Vegas time with contact details", () => {
    // 17:00Z in September is 10:00 in Las Vegas (UTC-7).
    const body = newEventBody("visit", job, new Date("2026-09-20T17:00:00Z"), URL_) as Record<string, any>;
    expect(body.subject).toBe("Visit · Dana Reyes");
    expect(body.isAllDay).toBe(false);
    expect(body.start).toEqual({ dateTime: "2026-09-20T10:00:00", timeZone: PST });
    expect(body.end).toEqual({ dateTime: "2026-09-20T11:00:00", timeZone: PST });
    expect(body.location).toEqual({ displayName: "12 Elm St, Henderson" });
    expect(body.body.contentType).toBe("text");
    expect(body.body.content).toContain("(702) 555-0134");
    expect(body.body.content).toContain("dana@example.com");
    expect(body.body.content).toContain("Shades");
    expect(body.body.content).toContain(URL_);
  });

  it("builds an all-day install ending the next midnight", () => {
    const body = newEventBody("install", job, "2026-12-31", URL_) as Record<string, any>;
    expect(body.subject).toBe("Install · Dana Reyes");
    expect(body.isAllDay).toBe(true);
    expect(body.start).toEqual({ dateTime: "2026-12-31T00:00:00", timeZone: PST });
    expect(body.end).toEqual({ dateTime: "2027-01-01T00:00:00", timeZone: PST });
  });

  it("uses the city alone when there is no address", () => {
    const body = newEventBody("visit", { ...job, address: null }, new Date("2026-09-20T17:00:00Z"), URL_) as Record<string, any>;
    expect(body.location).toEqual({ displayName: "Henderson" });
  });
});

describe("movedTimes", () => {
  it("keeps the visit's current length in Outlook", () => {
    const current = ev("2026-09-20T10:00:00.0000000", "2026-09-20T11:30:00.0000000");
    expect(movedTimes("visit", new Date("2026-09-21T16:00:00Z"), current)).toEqual({
      start: { dateTime: "2026-09-21T09:00:00", timeZone: PST },
      end: { dateTime: "2026-09-21T10:30:00", timeZone: PST },
    });
  });

  it("moves an install as a whole day", () => {
    const current = ev("2026-09-20T00:00:00.0000000", "2026-09-21T00:00:00.0000000", true);
    expect(movedTimes("install", "2026-10-02", current)).toEqual({
      start: { dateTime: "2026-10-02T00:00:00", timeZone: PST },
      end: { dateTime: "2026-10-03T00:00:00", timeZone: PST },
    });
  });
});

describe("trackerValue", () => {
  it("reads a visit start as an instant, across daylight saving", () => {
    expect(trackerValue("visit", ev("2026-09-20T10:00:00.0000000", "2026-09-20T11:00:00.0000000")))
      .toEqual(new Date("2026-09-20T17:00:00Z"));
    // 1 Nov 2026 is after the fall-back switch: 10:00 is UTC-8.
    expect(trackerValue("visit", ev("2026-11-02T10:00:00.0000000", "2026-11-02T11:00:00.0000000")))
      .toEqual(new Date("2026-11-02T18:00:00Z"));
  });

  it("reads an install's start date, even from a timed event", () => {
    expect(trackerValue("install", ev("2026-10-02T00:00:00.0000000", "2026-10-03T00:00:00.0000000", true))).toBe("2026-10-02");
    expect(trackerValue("install", ev("2026-10-02T08:00:00.0000000", "2026-10-02T12:00:00.0000000"))).toBe("2026-10-02");
  });
});

describe("sameValue", () => {
  it("compares visits to the minute and installs by date", () => {
    expect(sameValue("visit", new Date("2026-09-20T17:00:00Z"), new Date("2026-09-20T17:00:30Z"))).toBe(true);
    expect(sameValue("visit", new Date("2026-09-20T17:00:00Z"), new Date("2026-09-20T18:00:00Z"))).toBe(false);
    expect(sameValue("install", "2026-10-02", "2026-10-02")).toBe(true);
    expect(sameValue("install", null, "2026-10-02")).toBe(false);
    expect(sameValue("visit", null, null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and check that it fails.** Run `npx vitest run tests/calendar/events.test.ts --maxWorkers=2`. Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement** `lib/calendar/events.ts`

```ts
import { fromLocalInput, toLocalInput } from "@/lib/admin/time";

export type Kind = "visit" | "install";
type GraphTime = { dateTime: string; timeZone: string };
export type GraphEvent = {
  id: string;
  changeKey: string;
  subject?: string;
  isAllDay?: boolean;
  start: GraphTime;
  end: GraphTime;
  type?: string;
  seriesMasterId?: string | null;
};
export type EventJob = {
  id: string; name: string; phone: string; email: string | null;
  address: string | null; city: string; treatments: string[];
};

const ZONE = "Pacific Standard Time"; // Windows zone name Graph uses for Las Vegas, DST included
const HOUR = 3_600_000;

const local = (instant: Date): GraphTime => ({ dateTime: `${toLocalInput(instant)}:00`, timeZone: ZONE });
const midnight = (date: string): GraphTime => ({ dateTime: `${date}T00:00:00`, timeZone: ZONE });

/** The calendar day after YYYY-MM-DD. Noon UTC keeps the arithmetic clear of any zone. */
export function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Graph's "2026-09-20T10:00:00.0000000" (already in Las Vegas time) as an instant. */
const instantOf = (time: GraphTime): Date => fromLocalInput(time.dateTime.slice(0, 16));

const formatPhone = (digits: string) =>
  digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits;

export function newEventBody(kind: Kind, job: EventJob, value: Date | string, jobUrl: string): object {
  const lines = [
    `Phone: ${formatPhone(job.phone)}`,
    job.email ? `Email: ${job.email}` : null,
    job.treatments.length ? `Interested in: ${job.treatments.join(", ")}` : null,
    "",
    `Open the job: ${jobUrl}`,
  ].filter((line) => line !== null);
  const timing =
    kind === "visit"
      ? { isAllDay: false, start: local(value as Date), end: local(new Date((value as Date).getTime() + HOUR)) }
      : { isAllDay: true, start: midnight(value as string), end: midnight(nextDay(value as string)) };
  return {
    subject: `${kind === "visit" ? "Visit" : "Install"} · ${job.name}`,
    ...timing,
    location: { displayName: job.address ? `${job.address}, ${job.city}` : job.city },
    body: { contentType: "text", content: lines.join("\n") },
  };
}

/** New start and end for a date moved in the tracker. A visit keeps its current length in Outlook. */
export function movedTimes(kind: Kind, value: Date | string, current: GraphEvent): { start: GraphTime; end: GraphTime } {
  if (kind === "install") return { start: midnight(value as string), end: midnight(nextDay(value as string)) };
  const length = instantOf(current.end).getTime() - instantOf(current.start).getTime();
  const start = value as Date;
  return { start: local(start), end: local(new Date(start.getTime() + (length > 0 ? length : HOUR))) };
}

/** The tracker value an Outlook event implies: an instant for a visit, a date for an install. */
export function trackerValue(kind: Kind, event: GraphEvent): Date | string {
  return kind === "visit" ? instantOf(event.start) : event.start.dateTime.slice(0, 10);
}

export function sameValue(kind: Kind, a: Date | string | null, b: Date | string | null): boolean {
  if (a === null || b === null) return a === b;
  if (kind === "install") return a === b;
  return Math.floor((a as Date).getTime() / 60_000) === Math.floor((b as Date).getTime() / 60_000);
}
```

- [ ] **Step 4: Run the test.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar/events.ts tests/calendar/events.test.ts
git commit -m "feat: Outlook event bodies and date conversion"
```

---

### Task 3: Store and the per-job reconcile (tracker → Outlook)

**Files:**
- Create: `lib/calendar/store.ts`
- Create: `lib/calendar/sync.ts`
- Test: `tests/calendar/store.test.ts`, `tests/calendar/sync.test.ts`

**Interfaces:**
- Consumes: Task 1 `graphFetch`, `graphJson`, `GraphError`, `calendarConfig`. Task 2's whole module. `portalOrigin()` from `lib/portal/login.ts` (the site origin without a trailing slash).
- Produces (`store.ts`, all `server-only`):
  - `type CalendarJob = EventJob & { status: Stage; visitAt: Date | null; installOn: string | null }`.
  - `type Link = { leadId: string; kind: Kind; eventId: string; changeKey: string }`.
  - `getCalendarJob(leadId): Promise<CalendarJob | null>`.
  - `getLinks(leadId): Promise<Link[]>`.
  - `getLinkByEvent(eventId): Promise<Link | null>`.
  - `saveLink(link: Link): Promise<void>` (upsert on `(lead_id, kind)`).
  - `deleteLink(leadId, kind): Promise<void>`.
  - `setJobDate(leadId, kind, value: Date | string | null, note: string): Promise<void>`. One statement that updates `visit_at` or `install_on` and inserts a `job_events` row with kind `'edit'` and actor `'Outlook'`.
  - `recordError(message: string): Promise<void>`.
  - `clearError(): Promise<void>`.
  - `getSyncState(): Promise<{ subscriptionId: string | null; expiresAt: Date | null; lastError: string | null; lastErrorAt: Date | null }>`.
  - `saveSubscription(id: string | null, expiresAt: Date | null): Promise<void>`.
  - `reconcileTargets(): Promise<string[]>`. Lead ids that are non-lost with `visit_at >= now() - 30 days` or `install_on >= current_date - 30`, unioned with every lead id in `job_calendar_events`.
- Produces (`sync.ts`):
  - `reconcileJob(leadId: string, mode: "push" | "auto"): Promise<void>` (throws `GraphError`).
  - `syncJobCalendar(leadId: string): Promise<void>` (never throws, does nothing when disabled).
  - `jobUrl(id: string): string`.

**Decision rules for `reconcileJob`**, applied per kind (`visit` → `visitAt`, `install` → `installOn`). The wanted value is `null` when the job is lost.
1. **No link:** if wanted is non-null, POST `users/<mailbox>/events` with `newEventBody`, then `saveLink` using the response's id and changeKey.
2. **Link exists:** GET `users/<mailbox>/events/<eventId>`.
   - **404:** Outlook deleted it.
     - In `auto` mode: `deleteLink`, and if the tracker still has a value, `setJobDate(null, "Visit removed in Outlook")` (or "Install removed in Outlook").
     - In `push` mode: `deleteLink`, then apply rule 1 (re-create when wanted is non-null).
   - **Wanted is null (cleared or lost):** DELETE the event (404 is fine), then `deleteLink`.
   - **`auto` mode and the event's changeKey ≠ the link's:** Outlook changed. Compute `trackerValue`. If it isn't `sameValue` to the tracker's, call `setJobDate(value, "Visit moved in Outlook to <formatWhen(value)>")` (or "Install moved in Outlook to <formatDate>"). Then `saveLink` with the new changeKey.
   - **Otherwise (tracker wins):** if `trackerValue(event)` isn't `sameValue` to wanted, PATCH with `movedTimes(kind, wanted, event)` and `saveLink` with the PATCH response's changeKey. If they're the same, do nothing.
3. **Recurring series:** if the GET response has `type === "seriesMaster"`, use it as it is. Its `start` is the series start.

- [ ] **Step 1: Write the failing store test** `tests/calendar/store.test.ts`. It uses the mocking pattern from `tests/admin/jobs.test.ts`.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const store = await import("@/lib/calendar/store");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

beforeEach(() => { sql.mockReset().mockResolvedValue([]); sql.query.mockReset().mockResolvedValue([]); });

describe("calendar store", () => {
  it("maps a job row for syncing, with the install date as text", async () => {
    sql.mockResolvedValue([{ id: ID, name: "Dana", phone: "7025550134", email: null, address: null, city: "Henderson",
      treatments: [], status: "quoted", visit_at: "2026-09-20T17:00:00Z", install_on: "2026-10-02" }]);
    const job = await store.getCalendarJob(ID);
    expect(job).toMatchObject({ id: ID, visitAt: new Date("2026-09-20T17:00:00Z"), installOn: "2026-10-02" });
    expect(text(sql.mock.calls[0])).toMatch(/install_on::text/);
  });

  it("returns null for a non-uuid without querying", async () => {
    expect(await store.getCalendarJob("nope")).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("upserts a link on (lead_id, kind)", async () => {
    await store.saveLink({ leadId: ID, kind: "visit", eventId: "e1", changeKey: "ck" });
    expect(text(sql.mock.calls[0])).toMatch(/on conflict \(lead_id, kind\) do update/);
  });

  it("sets a visit date and logs it as an Outlook edit in one statement", async () => {
    await store.setJobDate(ID, "visit", new Date("2026-09-20T17:00:00Z"), "Visit moved in Outlook to Sun, Sep 20, 10:00 AM");
    const q = text(sql.mock.calls[0]);
    expect(q).toMatch(/update leads set visit_at/);
    expect(q).toMatch(/insert into job_events/);
    expect(sql.mock.calls[0]).toContain("Outlook");
    expect(sql.mock.calls[0]).toContain("edit");
  });

  it("sets an install date through the install column", async () => {
    await store.setJobDate(ID, "install", null, "Install removed in Outlook");
    expect(text(sql.mock.calls[0])).toMatch(/update leads set install_on/);
  });

  it("records and clears the last error", async () => {
    await store.recordError("Graph GET failed (401)");
    expect(text(sql.mock.calls[0])).toMatch(/last_error = /);
    await store.clearError();
    expect(text(sql.mock.calls[1])).toMatch(/last_error = null/);
  });
});
```

- [ ] **Step 2: Implement** `lib/calendar/store.ts`

```ts
import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";
import type { Stage } from "@/lib/admin/stages";
import type { EventJob, Kind } from "./events";

export type CalendarJob = EventJob & { status: Stage; visitAt: Date | null; installOn: string | null };
export type Link = { leadId: string; kind: Kind; eventId: string; changeKey: string };

const toLink = (row: Record<string, unknown>): Link => ({
  leadId: row.lead_id as string, kind: row.kind as Kind,
  eventId: row.event_id as string, changeKey: row.change_key as string,
});

export async function getCalendarJob(leadId: string): Promise<CalendarJob | null> {
  if (!isUuid(leadId)) return null;
  const rows = await db()`
    select id, name, phone, email, address, city, treatments, status, visit_at, install_on::text as install_on
    from leads where id = ${leadId}`;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string, name: row.name as string, phone: row.phone as string,
    email: (row.email as string | null) ?? null, address: (row.address as string | null) ?? null,
    city: row.city as string, treatments: (row.treatments as string[]) ?? [],
    status: row.status as Stage,
    visitAt: row.visit_at ? new Date(row.visit_at as string) : null,
    installOn: (row.install_on as string | null) ?? null,
  };
}

export async function getLinks(leadId: string): Promise<Link[]> {
  const rows = await db()`select lead_id, kind, event_id, change_key from job_calendar_events where lead_id = ${leadId}`;
  return rows.map(toLink);
}

export async function getLinkByEvent(eventId: string): Promise<Link | null> {
  const rows = await db()`select lead_id, kind, event_id, change_key from job_calendar_events where event_id = ${eventId}`;
  return rows[0] ? toLink(rows[0]) : null;
}

export async function saveLink(link: Link): Promise<void> {
  await db()`
    insert into job_calendar_events (lead_id, kind, event_id, change_key, synced_at)
    values (${link.leadId}, ${link.kind}, ${link.eventId}, ${link.changeKey}, now())
    on conflict (lead_id, kind) do update
      set event_id = excluded.event_id, change_key = excluded.change_key, synced_at = now()`;
}

export async function deleteLink(leadId: string, kind: Kind): Promise<void> {
  await db()`delete from job_calendar_events where lead_id = ${leadId} and kind = ${kind}`;
}

/** Changes a job date from Outlook and logs it, in one statement. */
export async function setJobDate(leadId: string, kind: Kind, value: Date | string | null, note: string): Promise<void> {
  if (kind === "visit") {
    await db()`
      with changed as (update leads set visit_at = ${value}, updated_at = now() where id = ${leadId} returning id)
      insert into job_events (lead_id, actor, kind, body) select id, ${"Outlook"}, ${"edit"}, ${note} from changed`;
  } else {
    await db()`
      with changed as (update leads set install_on = ${value}::date, updated_at = now() where id = ${leadId} returning id)
      insert into job_events (lead_id, actor, kind, body) select id, ${"Outlook"}, ${"edit"}, ${note} from changed`;
  }
}

export async function recordError(message: string): Promise<void> {
  await db()`update calendar_sync_state set last_error = ${message.slice(0, 500)}, last_error_at = now(), updated_at = now() where id = 1`;
}

export async function clearError(): Promise<void> {
  await db()`update calendar_sync_state set last_error = null, last_error_at = null, updated_at = now() where id = 1`;
}

export async function getSyncState() {
  const rows = await db()`select subscription_id, expires_at, last_error, last_error_at from calendar_sync_state where id = 1`;
  const row = rows[0] ?? {};
  return {
    subscriptionId: (row.subscription_id as string | null) ?? null,
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    lastError: (row.last_error as string | null) ?? null,
    lastErrorAt: row.last_error_at ? new Date(row.last_error_at as string) : null,
  };
}

export async function saveSubscription(id: string | null, expiresAt: Date | null): Promise<void> {
  await db()`
    insert into calendar_sync_state (id, subscription_id, expires_at, updated_at) values (1, ${id}, ${expiresAt}, now())
    on conflict (id) do update set subscription_id = excluded.subscription_id, expires_at = excluded.expires_at, updated_at = now()`;
}

export async function reconcileTargets(): Promise<string[]> {
  const rows = await db()`
    select id from leads
     where status <> 'lost'
       and (visit_at >= now() - interval '30 days' or install_on >= current_date - 30)
    union
    select lead_id as id from job_calendar_events`;
  return rows.map((row) => row.id as string);
}
```

- [ ] **Step 3: Run the store test.** Expected: PASS.

- [ ] **Step 4: Write the failing sync test** `tests/calendar/sync.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = {
  getCalendarJob: vi.fn(), getLinks: vi.fn(), getLinkByEvent: vi.fn(), saveLink: vi.fn(), deleteLink: vi.fn(),
  setJobDate: vi.fn(), recordError: vi.fn(), clearError: vi.fn(), reconcileTargets: vi.fn(),
};
vi.mock("@/lib/calendar/store", () => store);
const graphFetch = vi.fn();
vi.mock("@/lib/calendar/graph", async () => {
  const real = await vi.importActual<typeof import("@/lib/calendar/graph")>("@/lib/calendar/graph");
  return { ...real, graphFetch };
});
const enabled = vi.fn(() => true);
vi.mock("@/lib/calendar/config", () => ({
  calendarEnabled: () => enabled(),
  calendarConfig: () => (enabled() ? { mailbox: "jobs@example.com" } : null),
}));
vi.mock("@/lib/portal/login", () => ({ portalOrigin: () => "https://pss.example" }));

const sync = await import("@/lib/calendar/sync");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const PST = "Pacific Standard Time";
const job = {
  id: ID, name: "Dana Reyes", phone: "7025550134", email: null, address: null, city: "Henderson", treatments: [],
  status: "visit_booked", visitAt: new Date("2026-09-20T17:00:00Z"), installOn: null,
};
const event = (over: Record<string, unknown> = {}) => ({
  id: "e1", changeKey: "ck1", isAllDay: false,
  start: { dateTime: "2026-09-20T10:00:00.0000000", timeZone: PST },
  end: { dateTime: "2026-09-20T11:00:00.0000000", timeZone: PST }, ...over,
});
const link = { leadId: ID, kind: "visit", eventId: "e1", changeKey: "ck1" };
const calls = () => graphFetch.mock.calls.map(([path, init]) => `${init?.method ?? "GET"} ${path}`);

beforeEach(() => {
  Object.values(store).forEach((fn) => fn.mockReset());
  graphFetch.mockReset();
  enabled.mockReturnValue(true);
  store.getCalendarJob.mockResolvedValue(job);
  store.getLinks.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncJobCalendar (tracker wins)", () => {
  it("creates an event for a new date and stores the link", async () => {
    graphFetch.mockResolvedValue(Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["POST users/jobs@example.com/events"]);
    expect(graphFetch.mock.calls[0][1].body.subject).toBe("Visit · Dana Reyes");
    expect(graphFetch.mock.calls[0][1].body.body.content).toContain(`https://pss.example/admin?job=${ID}`);
    expect(store.saveLink).toHaveBeenCalledWith(link);
  });

  it("patches a moved visit, keeping its length, and stores the new changeKey", async () => {
    store.getLinks.mockResolvedValue([link]);
    store.getCalendarJob.mockResolvedValue({ ...job, visitAt: new Date("2026-09-21T16:00:00Z") });
    graphFetch
      .mockResolvedValueOnce(Response.json(event({ end: { dateTime: "2026-09-20T11:30:00.0000000", timeZone: PST } })))
      .mockResolvedValueOnce(Response.json({ id: "e1", changeKey: "ck2" }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1", "PATCH users/jobs@example.com/events/e1"]);
    expect(graphFetch.mock.calls[1][1].body.end.dateTime).toBe("2026-09-21T10:30:00");
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck2" });
  });

  it("does nothing when Outlook already matches", async () => {
    store.getLinks.mockResolvedValue([link]);
    graphFetch.mockResolvedValueOnce(Response.json(event()));
    await sync.syncJobCalendar(ID);
    expect(calls()).toEqual(["GET users/jobs@example.com/events/e1"]);
    expect(store.saveLink).not.toHaveBeenCalled();
  });

  it("deletes the event when the date is cleared or the job is lost", async () => {
    store.getLinks.mockResolvedValue([link]);
    store.getCalendarJob.mockResolvedValue({ ...job, status: "lost" });
    graphFetch.mockResolvedValueOnce(Response.json(event())).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await sync.syncJobCalendar(ID);
    expect(calls()).toContain("DELETE users/jobs@example.com/events/e1");
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "visit");
  });

  it("re-creates an event Outlook no longer has", async () => {
    store.getLinks.mockResolvedValue([link]);
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ id: "e9", changeKey: "ck9" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "visit");
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, eventId: "e9", changeKey: "ck9" });
    expect(store.setJobDate).not.toHaveBeenCalled();
  });

  it("records a Graph failure and never throws", async () => {
    graphFetch.mockResolvedValue(new Response("down", { status: 500 }));
    await expect(sync.syncJobCalendar(ID)).resolves.toBeUndefined();
    expect(store.recordError).toHaveBeenCalledWith(expect.stringMatching(/500/));
  });

  it("does nothing when Outlook is not configured", async () => {
    enabled.mockReturnValue(false);
    await sync.syncJobCalendar(ID);
    expect(graphFetch).not.toHaveBeenCalled();
    expect(store.getCalendarJob).not.toHaveBeenCalled();
  });

  it("creates an all-day install", async () => {
    store.getCalendarJob.mockResolvedValue({ ...job, visitAt: null, installOn: "2026-10-02" });
    graphFetch.mockResolvedValue(Response.json({ id: "e2", changeKey: "c" }, { status: 201 }));
    await sync.syncJobCalendar(ID);
    expect(graphFetch.mock.calls[0][1].body.isAllDay).toBe(true);
    expect(store.saveLink).toHaveBeenCalledWith({ leadId: ID, kind: "install", eventId: "e2", changeKey: "c" });
  });
});
```

- [ ] **Step 5: Run it and check that it fails.** Run `npx vitest run tests/calendar/sync.test.ts --maxWorkers=2`. Expected: FAIL, because the module isn't found.

- [ ] **Step 6: Implement** `lib/calendar/sync.ts`. Task 4 extends this file.

```ts
import "server-only";
import { formatWhen } from "@/lib/admin/time";
import { portalOrigin } from "@/lib/portal/login";
import { calendarConfig, calendarEnabled } from "./config";
import { movedTimes, newEventBody, sameValue, trackerValue, type GraphEvent, type Kind } from "./events";
import { GraphError, graphFetch } from "./graph";
import * as store from "./store";

const KINDS: Kind[] = ["visit", "install"];
const LABEL: Record<Kind, string> = { visit: "Visit", install: "Install" };

export const jobUrl = (id: string): string => `${portalOrigin()}/admin?job=${id}`;

const formatDate = (date: string): string =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

async function expectOk(response: Response, what: string): Promise<Response> {
  if (!response.ok) throw new GraphError(`Outlook ${what} failed (${response.status})`, response.status);
  return response;
}

/** Brings one job's visit and install events in line. "push": the tracker wins. "auto": the side whose changeKey moved wins. */
export async function reconcileJob(leadId: string, mode: "push" | "auto"): Promise<void> {
  const mailbox = calendarConfig()!.mailbox;
  const events = `users/${mailbox}/events`;
  const job = await store.getCalendarJob(leadId);
  const links = await store.getLinks(leadId);

  for (const kind of KINDS) {
    const link = links.find((l) => l.kind === kind) ?? null;
    const current = kind === "visit" ? job?.visitAt ?? null : job?.installOn ?? null;
    const wanted = job && job.status !== "lost" ? current : null;

    const create = async () => {
      if (!job || wanted === null) return;
      const response = await expectOk(
        await graphFetch(events, { method: "POST", body: newEventBody(kind, job, wanted, jobUrl(job.id)) }), "create",
      );
      const created = (await response.json()) as { id: string; changeKey: string };
      await store.saveLink({ leadId, kind, eventId: created.id, changeKey: created.changeKey });
    };

    if (!link) {
      await create();
      continue;
    }

    const got = await graphFetch(`${events}/${link.eventId}`);
    if (got.status === 404) {
      await store.deleteLink(leadId, kind);
      if (mode === "push") await create();
      else if (current !== null) await store.setJobDate(leadId, kind, null, `${LABEL[kind]} removed in Outlook`);
      continue;
    }
    const event = (await (await expectOk(got, "read")).json()) as GraphEvent;

    if (wanted === null) {
      const removed = await graphFetch(`${events}/${link.eventId}`, { method: "DELETE" });
      if (removed.status !== 404) await expectOk(removed, "delete");
      await store.deleteLink(leadId, kind);
      continue;
    }

    if (mode === "auto" && event.changeKey !== link.changeKey) {
      const value = trackerValue(kind, event);
      if (!sameValue(kind, value, current)) {
        const when = kind === "visit" ? formatWhen(value as Date) : formatDate(value as string);
        await store.setJobDate(leadId, kind, value, `${LABEL[kind]} moved in Outlook to ${when}`);
      }
      await store.saveLink({ ...link, changeKey: event.changeKey });
      continue;
    }

    if (!sameValue(kind, trackerValue(kind, event), wanted)) {
      const patched = await expectOk(
        await graphFetch(`${events}/${link.eventId}`, { method: "PATCH", body: movedTimes(kind, wanted, event) }), "update",
      );
      const { changeKey } = (await patched.json()) as { changeKey: string };
      await store.saveLink({ ...link, changeKey });
    }
  }
}

/** Called after a tracker save. Never throws, and does nothing when Outlook is not connected. */
export async function syncJobCalendar(leadId: string): Promise<void> {
  if (!calendarEnabled()) return;
  try {
    await reconcileJob(leadId, "push");
  } catch (error) {
    console.error("Calendar sync failed", error);
    await store.recordError(error instanceof Error ? error.message : String(error)).catch(() => {});
  }
}
```

- [ ] **Step 7: Run both tests.** Expected: PASS. Run `npx tsc --noEmit`, and check that it's clean.

- [ ] **Step 8: Commit**

```bash
git add lib/calendar/store.ts lib/calendar/sync.ts tests/calendar/store.test.ts tests/calendar/sync.test.ts
git commit -m "feat: sync job visit and install dates to Outlook"
```

---

### Task 4: Outlook → tracker (`applyOutlookChange`, `reconcileCalendar`)

**Files:**
- Modify: `lib/calendar/sync.ts` (append)
- Test: `tests/calendar/sync-inbound.test.ts`

**Interfaces:**
- Consumes: `reconcileJob` and the store from Task 3.
- Produces:
  - `applyOutlookChange(eventId: string): Promise<void>`. Does nothing for events that aren't linked to a job. Otherwise runs `reconcileJob(link.leadId, "auto")`. Errors are recorded, not thrown.
  - `reconcileCalendar(): Promise<{ jobs: number; failed: number }>`. Runs `reconcileJob(id, "auto")` for each target, one at a time. Each failure is recorded and the loop continues. Calls `clearError()` when `failed === 0`.

The reconcile cases in spec §7 all follow from `reconcileJob` in `auto` mode:
- changeKey differs → pull.
- changeKey matches but the dates differ → push.
- No link → create.
- 404 → clear the date.

- [ ] **Step 1: Write the failing test** `tests/calendar/sync-inbound.test.ts`. Start with the same setup as `tests/calendar/sync.test.ts`. Copy everything from its first `import` down to the end of its `beforeEach` block verbatim: the mocks, `sync`, `ID`, `PST`, `job`, `event`, `link` and `calls`. Then add:

```ts
describe("applyOutlookChange (Outlook wins when its changeKey moved)", () => {
  beforeEach(() => { store.getLinkByEvent.mockResolvedValue(link); store.getLinks.mockResolvedValue([link]); });

  it("moves the job's visit to the time set in Outlook and logs it", async () => {
    graphFetch.mockResolvedValueOnce(Response.json(event({
      changeKey: "ck2", start: { dateTime: "2026-09-22T14:00:00.0000000", timeZone: PST },
      end: { dateTime: "2026-09-22T15:00:00.0000000", timeZone: PST },
    })));
    await sync.applyOutlookChange("e1");
    expect(store.setJobDate).toHaveBeenCalledWith(ID, "visit", new Date("2026-09-22T21:00:00Z"),
      expect.stringMatching(/^Visit moved in Outlook to Tue, Sep 22/));
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck2" });
    expect(calls()).not.toContain("PATCH users/jobs@example.com/events/e1");
  });

  it("ignores its own write echoing back (same changeKey)", async () => {
    graphFetch.mockResolvedValueOnce(Response.json(event()));
    await sync.applyOutlookChange("e1");
    expect(store.setJobDate).not.toHaveBeenCalled();
    expect(store.saveLink).not.toHaveBeenCalled();
  });

  it("stores the new changeKey but keeps the date for a text-only edit", async () => {
    graphFetch.mockResolvedValueOnce(Response.json(event({ changeKey: "ck3", subject: "Visit · Dana (gate code 1234)" })));
    await sync.applyOutlookChange("e1");
    expect(store.setJobDate).not.toHaveBeenCalled();
    expect(store.saveLink).toHaveBeenCalledWith({ ...link, changeKey: "ck3" });
  });

  it("clears the visit when the event was deleted in Outlook", async () => {
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await sync.applyOutlookChange("e1");
    expect(store.deleteLink).toHaveBeenCalledWith(ID, "visit");
    expect(store.setJobDate).toHaveBeenCalledWith(ID, "visit", null, "Visit removed in Outlook");
  });

  it("ignores Outlook events that are not job events", async () => {
    store.getLinkByEvent.mockResolvedValue(null);
    await sync.applyOutlookChange("other");
    expect(graphFetch).not.toHaveBeenCalled();
  });

  it("records a failure instead of throwing", async () => {
    graphFetch.mockResolvedValue(new Response("x", { status: 500 }));
    await expect(sync.applyOutlookChange("e1")).resolves.toBeUndefined();
    expect(store.recordError).toHaveBeenCalled();
  });
});

describe("reconcileCalendar", () => {
  it("pushes a date whose earlier sync failed (same changeKey, different date)", async () => {
    store.reconcileTargets.mockResolvedValue([ID]);
    store.getLinks.mockResolvedValue([link]);
    store.getCalendarJob.mockResolvedValue({ ...job, visitAt: new Date("2026-09-21T16:00:00Z") });
    graphFetch.mockResolvedValueOnce(Response.json(event())).mockResolvedValueOnce(Response.json({ changeKey: "ck2" }));
    expect(await sync.reconcileCalendar()).toEqual({ jobs: 1, failed: 0 });
    expect(calls()).toContain("PATCH users/jobs@example.com/events/e1");
    expect(store.clearError).toHaveBeenCalled();
  });

  it("creates events for dated jobs that have none", async () => {
    store.reconcileTargets.mockResolvedValue([ID]);
    graphFetch.mockResolvedValue(Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    await sync.reconcileCalendar();
    expect(store.saveLink).toHaveBeenCalledWith(link);
  });

  it("keeps going after one job fails and does not clear the error", async () => {
    const ID_B = "4a3c9d2f-9d63-4b64-8b2d-2e3f4a5b6c7d";
    store.reconcileTargets.mockResolvedValue([ID, ID_B]);
    graphFetch.mockResolvedValueOnce(new Response("x", { status: 500 }))
      .mockResolvedValue(Response.json({ id: "e1", changeKey: "ck1" }, { status: 201 }));
    expect(await sync.reconcileCalendar()).toEqual({ jobs: 2, failed: 1 });
    expect(store.recordError).toHaveBeenCalledTimes(1);
    expect(store.clearError).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and check that it fails.** Expected: FAIL, because `applyOutlookChange` isn't a function.

- [ ] **Step 3: Append to** `lib/calendar/sync.ts`

```ts
async function record(error: unknown): Promise<void> {
  console.error("Calendar sync failed", error);
  await store.recordError(error instanceof Error ? error.message : String(error)).catch(() => {});
}

/** A Graph notification for one event. Only job events matter; the rest are ignored. */
export async function applyOutlookChange(eventId: string): Promise<void> {
  try {
    const link = await store.getLinkByEvent(eventId);
    if (!link) return;
    await reconcileJob(link.leadId, "auto");
  } catch (error) {
    await record(error);
  }
}

/** The daily catch-up: every recently dated job and every linked one, one at a time. */
export async function reconcileCalendar(): Promise<{ jobs: number; failed: number }> {
  const ids = await store.reconcileTargets();
  let failed = 0;
  for (const id of ids) {
    try {
      await reconcileJob(id, "auto");
    } catch (error) {
      failed += 1;
      await record(error);
    }
  }
  if (failed === 0) await store.clearError();
  return { jobs: ids.length, failed };
}
```

Also change `syncJobCalendar`'s catch block to call `record(error)`, and move `record` above `syncJobCalendar`, so there is one error path.

- [ ] **Step 4: Run both sync test files.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar/sync.ts tests/calendar/sync-inbound.test.ts
git commit -m "feat: apply Outlook moves and deletions to jobs, daily reconcile"
```

---

### Task 5: Subscription, webhook route, cron route

**Files:**
- Create: `lib/calendar/subscription.ts`
- Create: `app/api/calendar/notifications/route.ts`
- Create: `app/api/cron/calendar/route.ts`
- Modify: `vercel.json`
- Test: `tests/calendar/subscription.test.ts`, `tests/calendar/routes.test.ts`

**Interfaces:**
- Consumes: `graphFetch`, `calendarConfig`, `calendarEnabled`, `store.getSyncState`, `store.saveSubscription`, `applyOutlookChange`, `reconcileCalendar`, and `portalOrigin`.
- Produces:
  - `ensureSubscription(force?: boolean): Promise<{ id: string; expiresAt: Date }>`. It throws `GraphError` on failure.
  - `NOTIFICATION_PATH = "/api/calendar/notifications"`.

**`ensureSubscription` logic:**
1. `target = new Date(Date.now() + (6 * 24 + 23) * 3_600_000)`.
2. Read the state. If `subscriptionId` exists, `!force`, and `expiresAt` is more than 3 days away, return it unchanged.
3. If `subscriptionId` exists, PATCH `subscriptions/<id>` with `{ expirationDateTime: target.toISOString() }`. On 200, save and return. On 404, fall through to create. On anything else, throw.
4. Otherwise POST `subscriptions` with:
   - `changeType: "created,updated,deleted"`
   - `notificationUrl` and `lifecycleNotificationUrl`, both `${portalOrigin()}/api/calendar/notifications`
   - `resource: "users/<mailbox>/events"`
   - `expirationDateTime`
   - `clientState`

   On 201, save and return. On 409, GET `subscriptions`, find the entry whose `resource` is `users/<mailbox>/events` (compared case-insensitively) and whose `notificationUrl` matches, PATCH it as in step 3, then save and return it. Otherwise, throw.

**Webhook `POST`:**
- If `!calendarEnabled()`, return `404`.
- If the URL has `validationToken`, return `new Response(token, { status: 200, headers: { "Content-Type": "text/plain" } })`. `URLSearchParams` has already decoded it.
- Otherwise:
  1. Parse `{ value: Notification[] }`. Invalid JSON returns 400.
  2. Keep only the notifications where `timingSafeEqual(clientState, config.clientState)` (lengths compared first) and `subscriptionId === state.subscriptionId`.
  3. Return `202` straight away, with `after(async () => …)` doing the work:
     - A notification with `lifecycleEvent` of `reauthorizationRequired` or `subscriptionRemoved` calls `ensureSubscription(true)`.
     - `missed` calls `reconcileCalendar()`.
     - Anything else calls `applyOutlookChange(n.resourceData?.id)` when the id is present.
     - Every branch is wrapped in try/catch and logs with `console.error`.
- Reading the stored subscription id is one DB query. That's fine within 3 seconds. Graph work happens only in `after`.

**Cron `GET`:**
- The same bearer check as `app/api/cron/review-requests/route.ts`.
- If disabled: `Response.json({ skipped: "Outlook is not configured" })` with status 200.
- Otherwise: try `ensureSubscription()`, then `reconcileCalendar()`. The result is `{ subscriptionExpires, jobs, failed }`, with status 500 if the subscription throws or `failed > 0`. Record the subscription error with `store.recordError`.

- [ ] **Step 1: Write the failing tests.**

`tests/calendar/subscription.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = { getSyncState: vi.fn(), saveSubscription: vi.fn() };
vi.mock("@/lib/calendar/store", () => store);
const graphFetch = vi.fn();
vi.mock("@/lib/calendar/graph", async () => ({
  ...(await vi.importActual<typeof import("@/lib/calendar/graph")>("@/lib/calendar/graph")), graphFetch,
}));
vi.mock("@/lib/calendar/config", () => ({
  calendarConfig: () => ({ mailbox: "jobs@example.com", clientState: "state" }), calendarEnabled: () => true,
}));
vi.mock("@/lib/portal/login", () => ({ portalOrigin: () => "https://pss.example" }));
const { ensureSubscription } = await import("@/lib/calendar/subscription");
const DAY = 86_400_000;

beforeEach(() => { store.getSyncState.mockReset(); store.saveSubscription.mockReset(); graphFetch.mockReset(); });

describe("ensureSubscription", () => {
  it("leaves a subscription with more than 3 days left alone", async () => {
    store.getSyncState.mockResolvedValue({ subscriptionId: "s1", expiresAt: new Date(Date.now() + 5 * DAY) });
    await ensureSubscription();
    expect(graphFetch).not.toHaveBeenCalled();
  });

  it("renews one that expires within 3 days to just under 7 days", async () => {
    store.getSyncState.mockResolvedValue({ subscriptionId: "s1", expiresAt: new Date(Date.now() + DAY) });
    graphFetch.mockResolvedValue(Response.json({ id: "s1", expirationDateTime: "2026-09-21T00:00:00Z" }));
    await ensureSubscription();
    const [path, init] = graphFetch.mock.calls[0];
    expect(path).toBe("subscriptions/s1");
    expect(init.method).toBe("PATCH");
    const ms = new Date(init.body.expirationDateTime).getTime() - Date.now();
    expect(ms).toBeGreaterThan(6.9 * DAY);
    expect(ms).toBeLessThan(7 * DAY);
    expect(store.saveSubscription).toHaveBeenCalledWith("s1", new Date("2026-09-21T00:00:00Z"));
  });

  it("creates a new subscription when the old one is gone", async () => {
    store.getSyncState.mockResolvedValue({ subscriptionId: "s1", expiresAt: new Date(Date.now() + DAY) });
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ id: "s2", expirationDateTime: "2026-09-21T00:00:00Z" }, { status: 201 }));
    await ensureSubscription();
    const [path, init] = graphFetch.mock.calls[1];
    expect(path).toBe("subscriptions");
    expect(init.body).toMatchObject({
      changeType: "created,updated,deleted", resource: "users/jobs@example.com/events", clientState: "state",
      notificationUrl: "https://pss.example/api/calendar/notifications",
      lifecycleNotificationUrl: "https://pss.example/api/calendar/notifications",
    });
    expect(store.saveSubscription).toHaveBeenCalledWith("s2", expect.any(Date));
  });

  it("adopts the existing subscription when creating returns 409", async () => {
    store.getSyncState.mockResolvedValue({ subscriptionId: null, expiresAt: null });
    graphFetch.mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ value: [{ id: "s7", resource: "Users/jobs@example.com/Events",
        notificationUrl: "https://pss.example/api/calendar/notifications" }] }))
      .mockResolvedValueOnce(Response.json({ id: "s7", expirationDateTime: "2026-09-21T00:00:00Z" }));
    const result = await ensureSubscription();
    expect(result.id).toBe("s7");
    expect(graphFetch.mock.calls[2][0]).toBe("subscriptions/s7");
  });

  it("forces a renewal when asked", async () => {
    store.getSyncState.mockResolvedValue({ subscriptionId: "s1", expiresAt: new Date(Date.now() + 5 * DAY) });
    graphFetch.mockResolvedValue(Response.json({ id: "s1", expirationDateTime: "2026-09-21T00:00:00Z" }));
    await ensureSubscription(true);
    expect(graphFetch).toHaveBeenCalledTimes(1);
  });
});
```

`tests/calendar/routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const afterCbs: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (cb: () => unknown) => { afterCbs.push(cb); } }));
const enabled = vi.fn(() => true);
vi.mock("@/lib/calendar/config", () => ({
  calendarEnabled: () => enabled(), calendarConfig: () => (enabled() ? { clientState: "state-secret" } : null),
}));
const store = { getSyncState: vi.fn(), recordError: vi.fn() };
vi.mock("@/lib/calendar/store", () => store);
const sync = { applyOutlookChange: vi.fn(), reconcileCalendar: vi.fn() };
vi.mock("@/lib/calendar/sync", () => sync);
const ensureSubscription = vi.fn();
vi.mock("@/lib/calendar/subscription", () => ({ ensureSubscription }));

const hook = await import("@/app/api/calendar/notifications/route");
const cron = await import("@/app/api/cron/calendar/route");
const post = (query: string, body?: unknown) =>
  hook.POST(new Request(`http://localhost/api/calendar/notifications${query}`, {
    method: "POST", body: body === undefined ? undefined : JSON.stringify(body),
  }));
const runAfter = async () => { for (const cb of afterCbs.splice(0)) await cb(); };
const note = (over: Record<string, unknown> = {}) => ({
  subscriptionId: "s1", clientState: "state-secret", changeType: "updated", resourceData: { id: "e1" }, ...over,
});

beforeEach(() => {
  afterCbs.length = 0;
  enabled.mockReturnValue(true);
  [store.getSyncState, store.recordError, sync.applyOutlookChange, sync.reconcileCalendar, ensureSubscription].forEach((f) => f.mockReset());
  store.getSyncState.mockResolvedValue({ subscriptionId: "s1" });
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/calendar/notifications", () => {
  it("echoes the validation token as plain text", async () => {
    const res = await post("?validationToken=a%20b%3Cc");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe("a b<c");
  });

  it("answers 202 at once and applies the change afterwards", async () => {
    const res = await post("", { value: [note()] });
    expect(res.status).toBe(202);
    expect(sync.applyOutlookChange).not.toHaveBeenCalled();
    await runAfter();
    expect(sync.applyOutlookChange).toHaveBeenCalledWith("e1");
  });

  it("drops notifications with the wrong clientState or subscription", async () => {
    await post("", { value: [note({ clientState: "nope" }), note({ subscriptionId: "other" })] });
    await runAfter();
    expect(sync.applyOutlookChange).not.toHaveBeenCalled();
  });

  it("renews on reauthorizationRequired and reconciles on missed", async () => {
    await post("", { value: [note({ lifecycleEvent: "reauthorizationRequired" }), note({ lifecycleEvent: "missed" })] });
    await runAfter();
    expect(ensureSubscription).toHaveBeenCalledWith(true);
    expect(sync.reconcileCalendar).toHaveBeenCalled();
  });

  it("is 404 when Outlook is not configured", async () => {
    enabled.mockReturnValue(false);
    expect((await post("?validationToken=x")).status).toBe(404);
  });

  it("rejects a body that is not JSON", async () => {
    const res = await hook.POST(new Request("http://localhost/api/calendar/notifications", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/cron/calendar", () => {
  const get = (auth?: string) => cron.GET(new Request("http://localhost/api/cron/calendar", {
    headers: auth ? { authorization: auth } : {},
  }));

  it("refuses a missing or wrong secret", async () => {
    expect((await get()).status).toBe(401);
    expect((await get("Bearer nope")).status).toBe(401);
    expect(ensureSubscription).not.toHaveBeenCalled();
  });

  it("renews the subscription and reconciles", async () => {
    ensureSubscription.mockResolvedValue({ id: "s1", expiresAt: new Date("2026-09-21T00:00:00Z") });
    sync.reconcileCalendar.mockResolvedValue({ jobs: 3, failed: 0 });
    const res = await get("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subscriptionExpires: "2026-09-21T00:00:00.000Z", jobs: 3, failed: 0 });
  });

  it("fails the run when anything failed", async () => {
    ensureSubscription.mockRejectedValue(new Error("Graph POST failed (403)"));
    sync.reconcileCalendar.mockResolvedValue({ jobs: 0, failed: 0 });
    expect((await get("Bearer s3cret")).status).toBe(500);
    expect(store.recordError).toHaveBeenCalledWith("Graph POST failed (403)");
  });

  it("skips quietly when Outlook is not configured", async () => {
    enabled.mockReturnValue(false);
    const res = await get("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: "Outlook is not configured" });
  });
});
```

- [ ] **Step 2: Run both files and check that they fail.**

- [ ] **Step 3: Implement** `lib/calendar/subscription.ts`

```ts
import "server-only";
import { portalOrigin } from "@/lib/portal/login";
import { calendarConfig } from "./config";
import { GraphError, graphFetch } from "./graph";
import { getSyncState, saveSubscription } from "./store";

export const NOTIFICATION_PATH = "/api/calendar/notifications";
const HOUR = 3_600_000;
const RENEW_WITHIN = 3 * 24 * HOUR;
const LIFETIME = (6 * 24 + 23) * HOUR; // Graph allows under 7 days for Outlook events

type Sub = { id: string; expirationDateTime: string; resource?: string; notificationUrl?: string };

async function saved(sub: Sub) {
  const expiresAt = new Date(sub.expirationDateTime);
  await saveSubscription(sub.id, expiresAt);
  return { id: sub.id, expiresAt };
}

async function renew(id: string): Promise<Response> {
  return graphFetch(`subscriptions/${id}`, {
    method: "PATCH", body: { expirationDateTime: new Date(Date.now() + LIFETIME).toISOString() },
  });
}

/** Keeps the one Graph subscription on the shared calendar alive, creating or adopting it as needed. */
export async function ensureSubscription(force = false): Promise<{ id: string; expiresAt: Date }> {
  const config = calendarConfig()!;
  const state = await getSyncState();
  if (state.subscriptionId && state.expiresAt && !force && state.expiresAt.getTime() - Date.now() > RENEW_WITHIN) {
    return { id: state.subscriptionId, expiresAt: state.expiresAt };
  }
  if (state.subscriptionId) {
    const renewed = await renew(state.subscriptionId);
    if (renewed.ok) return saved((await renewed.json()) as Sub);
    if (renewed.status !== 404) throw new GraphError(`Graph PATCH failed (${renewed.status})`, renewed.status);
  }
  const resource = `users/${config.mailbox}/events`;
  const url = `${portalOrigin()}${NOTIFICATION_PATH}`;
  const created = await graphFetch("subscriptions", {
    method: "POST",
    body: {
      changeType: "created,updated,deleted", notificationUrl: url, lifecycleNotificationUrl: url,
      resource, expirationDateTime: new Date(Date.now() + LIFETIME).toISOString(), clientState: config.clientState,
    },
  });
  if (created.ok) return saved((await created.json()) as Sub);
  if (created.status === 409) {
    const list = await graphFetch("subscriptions");
    const { value } = (await list.json()) as { value: Sub[] };
    const mine = value.find((s) => s.resource?.toLowerCase() === resource.toLowerCase() && s.notificationUrl === url);
    if (mine) {
      const adopted = await renew(mine.id);
      if (adopted.ok) return saved((await adopted.json()) as Sub);
    }
  }
  throw new GraphError(`Graph POST failed (${created.status})`, created.status);
}
```

- [ ] **Step 4: Implement** `app/api/calendar/notifications/route.ts`

```ts
import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { calendarConfig, calendarEnabled } from "@/lib/calendar/config";
import { getSyncState } from "@/lib/calendar/store";
import { ensureSubscription } from "@/lib/calendar/subscription";
import { applyOutlookChange, reconcileCalendar } from "@/lib/calendar/sync";

type Notification = {
  subscriptionId?: string;
  clientState?: string;
  lifecycleEvent?: "reauthorizationRequired" | "subscriptionRemoved" | "missed";
  resourceData?: { id?: string };
};

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Microsoft Graph calls this when an event on the shared calendar changes. It must answer
 * within 3 seconds, so it answers first and does the Outlook work in after().
 */
export async function POST(request: Request) {
  if (!calendarEnabled()) return new Response("Not found", { status: 404 });
  const token = new URL(request.url).searchParams.get("validationToken");
  if (token !== null) return new Response(token, { status: 200, headers: { "Content-Type": "text/plain" } });

  let payload: { value?: Notification[] };
  try {
    payload = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const { clientState } = calendarConfig()!;
  const { subscriptionId } = await getSyncState();
  const valid = (payload.value ?? []).filter(
    (n) => typeof n.clientState === "string" && same(n.clientState, clientState) && n.subscriptionId === subscriptionId,
  );

  after(async () => {
    for (const n of valid) {
      try {
        if (n.lifecycleEvent === "missed") await reconcileCalendar();
        else if (n.lifecycleEvent) await ensureSubscription(true);
        else if (n.resourceData?.id) await applyOutlookChange(n.resourceData.id);
      } catch (error) {
        console.error("Calendar notification failed", error);
      }
    }
  });
  return new Response(null, { status: 202 });
}
```

- [ ] **Step 5: Implement** `app/api/cron/calendar/route.ts`

```ts
import { calendarEnabled } from "@/lib/calendar/config";
import { recordError } from "@/lib/calendar/store";
import { ensureSubscription } from "@/lib/calendar/subscription";
import { reconcileCalendar } from "@/lib/calendar/sync";

/**
 * Daily (vercel.json): keeps the Outlook subscription alive and catches anything the
 * webhook missed. Same Bearer CRON_SECRET check as the review-request cron.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!calendarEnabled()) return Response.json({ skipped: "Outlook is not configured" });

  let subscriptionExpires: string | null = null;
  let subscriptionError: string | null = null;
  try {
    subscriptionExpires = (await ensureSubscription()).expiresAt.toISOString();
  } catch (error) {
    console.error("Calendar subscription failed", error);
    subscriptionError = error instanceof Error ? error.message : String(error);
  }
  const { jobs, failed } = await reconcileCalendar();
  // Recorded after the reconcile, whose clean run clears last_error, so this failure stays visible.
  if (subscriptionError) await recordError(subscriptionError);
  return Response.json({ subscriptionExpires, jobs, failed }, { status: subscriptionError || failed > 0 ? 500 : 200 });
}
```

- [ ] **Step 6: Update** `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/review-requests", "schedule": "0 17 * * *" },
    { "path": "/api/cron/calendar", "schedule": "0 16 * * *" }
  ]
}
```

- [ ] **Step 7: Run all the calendar tests, then typegen and tsc.** Expected: PASS and no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/calendar/subscription.ts app/api/calendar/notifications/route.ts app/api/cron/calendar/route.ts vercel.json tests/calendar/subscription.test.ts tests/calendar/routes.test.ts
git commit -m "feat: Outlook change notifications and the daily calendar cron"
```

---

### Task 6: Sync hooks in the job actions

**Files:**
- Modify: `app/admin/jobs/actions.ts`
- Modify: `tests/admin/actions.test.ts`

**Interfaces:**
- Consumes: `syncJobCalendar` from `@/lib/calendar/sync`.
- Hooks (always `after(() => syncJobCalendar(id))`, so a slow Graph call never delays the owner's save):
  - `saveDetails`, after `updateDetails` returns true.
  - `markLost`, after `setStage` returns true.
  - `moveStage`, when `changed` is true. This covers reopening a lost job, whose dates then get events again.
- **Ruling:** `addJob` gets no hook. `createJob` never stores dates (the new-job form has none), so there is nothing to sync. The daily reconcile would catch dates anyway.
- **pss-5d's call flow:** if `app/admin/jobs/call-actions.ts` exists on your base, add `after(() => syncJobCalendar(id))` after its logCall success branch, and add a matching test. If it doesn't exist, skip this. That session will add the call when it merges.

- [ ] **Step 1: Write the failing tests.** In `tests/admin/actions.test.ts`, add the mock next to the others:

```ts
const syncJobCalendar = vi.fn();
vi.mock("@/lib/calendar/sync", () => ({ syncJobCalendar }));
```

Reset it in `beforeEach` with `syncJobCalendar.mockReset();`. Add `syncJobCalendar` to the list of functions in the "touches nothing" test. Then add:

```ts
describe("Outlook calendar sync", () => {
  it("syncs after details are saved", async () => {
    await actions.saveDetails(ID, {}, form({ visitAt: "2026-09-20T10:00" }));
    expect(syncJobCalendar).toHaveBeenCalledWith(ID);
  });

  it("does not sync when the details did not save", async () => {
    jobs.updateDetails.mockResolvedValue(false);
    await actions.saveDetails(ID, {}, form({}));
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });

  it("syncs after a job is marked lost, so its events are removed", async () => {
    await actions.markLost(ID, {}, form({ reason: "Went with another company" }));
    expect(syncJobCalendar).toHaveBeenCalledWith(ID);
  });

  it("syncs after a stage move, so a reopened job gets its events back", async () => {
    await actions.moveStage(ID, "quoted");
    expect(syncJobCalendar).toHaveBeenCalledWith(ID);
  });

  it("does not sync a stage move that changed nothing", async () => {
    jobs.setStage.mockResolvedValue(false);
    await actions.moveStage(ID, "quoted");
    expect(syncJobCalendar).not.toHaveBeenCalled();
  });
});
```

If the `lostSchema` reason rules reject the sample reason, use any reason the existing markLost tests use.

- [ ] **Step 2: Run the file and check that it fails.**

- [ ] **Step 3: Implement.** In `app/admin/jobs/actions.ts`, add `import { syncJobCalendar } from "@/lib/calendar/sync";`. Then:
  - `moveStage`: after `const changed = …`, add `if (changed) after(() => syncJobCalendar(id));`.
  - `markLost`: after the `if (!changed) return MISSING;` line, add `after(() => syncJobCalendar(id));`.
  - `saveDetails`: after `if (!saved) return MISSING;`, add `after(() => syncJobCalendar(id));`.
  - Add one comment above `moveStage`'s hook: `// Outlook follows the tracker's dates; syncJobCalendar never throws and is a no-op until Outlook is set up.`

- [ ] **Step 4: Run** `npx vitest run tests/admin --maxWorkers=2`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/jobs/actions.ts tests/admin/actions.test.ts
git commit -m "feat: sync Outlook after job dates or stage change"
```

---

### Task 7: The Schedule tab

**Files:**
- Create: `lib/calendar/week.ts`
- Create: `app/admin/schedule/page.tsx`
- Modify: `app/admin/AdminNav.tsx` (the `LINKS` array)
- Test: `tests/calendar/week.test.ts`, `tests/admin/schedule-page.test.tsx`, `tests/admin/admin-nav.test.tsx`

**Interfaces:**
- Consumes: `calendarEnabled`, `calendarConfig`, `graphJson`, `lasVegasDate`, `fromLocalInput`, `nextDay` (exported from `events.ts` in Task 2), `STAGE_STYLE`, `Stage`, and `db`.
- Produces (`week.ts`):
  - `weekDays(param: string | undefined, now: Date): string[]`. Seven `YYYY-MM-DD` dates, Sunday first. An invalid or missing param means the week containing `lasVegasDate(now)`.
  - `type ScheduleItem = { key: string; day: string; allDay: boolean; start: Date | null; title: string; job: { id: string; name: string; city: string; status: Stage; kind: "visit" | "install" } | null }`.
  - `type Week = { days: string[]; items: ScheduleItem[]; source: "outlook" | "tracker"; notice: string | null }`.
  - `getWeek(param: string | undefined, now?: Date): Promise<Week>`.
- **Behavior of `getWeek`:**
  1. Compute `days`, then `from = fromLocalInput(`${days[0]}T00:00`)` and `to = fromLocalInput(`${nextDay(days[6])}T00:00`)`.
  2. **Tracker rows:** one query for non-lost leads with `visit_at >= from and visit_at < to` or `install_on between days[0] and days[6]`. Each row becomes up to two items: the visit at `start = visit_at`, `day = lasVegasDate(visit_at)`; the install as an all-day item on `install_on`.
  3. **If disabled:** return the tracker items with `source: "tracker"` and `notice: "Outlook isn't connected yet."`.
  4. **Otherwise:** `graphJson<{ value: GraphEvent[] }>(`users/${mailbox}/calendar/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$select=id,subject,start,end,isAllDay&$top=200&$orderby=start/dateTime`)`.
     - Load the links for the returned ids: `select l.event_id, l.kind, j.id, j.name, j.city, j.status from job_calendar_events l join leads j on j.id = l.lead_id where l.event_id = any(${ids})`.
     - Map each event: `day = start.dateTime.slice(0,10)`, `allDay = isAllDay`, `start = allDay ? null : fromLocalInput(start.dateTime.slice(0,16))`, `title = subject ?? "(no title)"`, `job` from the link or null.
     - An all-day event spanning several days appears only on its first day. That's acceptable, because installs are one day.
     - If the Graph call throws, return the tracker items with `source: "tracker"` and `notice: "Couldn't reach Outlook, showing tracker dates only."`.
  5. Sort the items by day, then all-day first, then start time.

- **Page (`app/admin/schedule/page.tsx`):**
  - Call `requireAdmin()` first, then read `searchParams: Promise<{ week?: string | string[] }>` and take the first value.
  - Header: the eyebrow `PSS Operations`, `<h1>Schedule</h1>`, and the range label from `rangeLabel(days)`, for example `Sep 13 – 19, 2026`, or `Sep 27 – Oct 3, 2026` across months, or `Dec 27, 2026 – Jan 2, 2027` across years. `rangeLabel` goes in `week.ts` and is tested.
  - Navigation links:
    - `← Previous week` → `/admin/schedule?week=<days[0] minus 7 days>`.
    - `This week` → `/admin/schedule`.
    - `Next week →` → `/admin/schedule?week=<days[0] plus 7 days>`.
    - Use an `addDays(date, n)` helper exported from `week.ts`.
  - If `notice` is set: `<p role="status">` with the notice text.
  - If there are no items: `<p>Nothing scheduled this week.</p>`, with the day grid still rendered.
  - **Grid:** `<ol className="grid gap-3 md:grid-cols-7">`, with one `<li aria-labelledby>` per day.
    - Day heading: `<h2 id="day-<date>">`, reading for example `Sun 13`, and today reads `Today · Sun 13`.
    - Today's column gets `border-champagne-ink`. The others get `border-rule`.
    - Inside each day, all-day items come first, then timed items.
  - **Job item:** `<Link href={`/admin?job=${id}`}>` with a left edge (`border-l-4`) in the stage color. Add a `left` field to `STAGE_STYLE` (see below) and use it.
    - Link text: the time (`formatTime(start)`, for example "10:00 AM") or `All day`, then `Visit` or `Install`, then the customer name and the city.
    - The accessible name must include the customer name.
  - **Other item:** a non-link `<div className="… text-ink-soft opacity-70">` with the time or `All day` and the title.
- **Stage style addition:** in `lib/admin/stages.ts`, add `left` to each `STAGE_STYLE` entry:
  - `border-l-stage-new`, `border-l-stage-contacted`, `border-l-stage-visit`, `border-l-stage-quoted`, `border-l-stage-sold`, `border-l-stage-ordered`, `border-l-stage-installed`.
  - Lost uses `border-l-taupe`.
  - Update the type to `{ icon; edge; tint; left }`, and extend `tests/admin/stages.test.ts` if it snapshots the keys.
- **Nav:** insert `{ href: "/admin/schedule", label: "Schedule", icon: "calendar" }` after Jobs in `LINKS`. `isActive` already matches exact paths, so no change is needed there.

- [ ] **Step 1: Write the failing tests.**

`tests/calendar/week.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const enabled = vi.fn(() => false);
vi.mock("@/lib/calendar/config", () => ({
  calendarEnabled: () => enabled(), calendarConfig: () => (enabled() ? { mailbox: "jobs@example.com" } : null),
}));
const graphJson = vi.fn();
vi.mock("@/lib/calendar/graph", () => ({ graphJson }));
const week = await import("@/lib/calendar/week");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const NOW = new Date("2026-09-16T19:00:00Z"); // Wed Sep 16, noon in Las Vegas
const PST = "Pacific Standard Time";

beforeEach(() => { sql.mockReset().mockResolvedValue([]); graphJson.mockReset(); enabled.mockReturnValue(false); });

describe("weekDays", () => {
  it("runs Sunday to Saturday around today in Las Vegas", () => {
    expect(week.weekDays(undefined, NOW)).toEqual([
      "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19",
    ]);
  });

  it("uses any date inside the requested week and ignores junk", () => {
    expect(week.weekDays("2026-10-01", NOW)[0]).toBe("2026-09-27");
    expect(week.weekDays("2026-13-45", NOW)[0]).toBe("2026-09-13");
    expect(week.weekDays("nope", NOW)[0]).toBe("2026-09-13");
  });

  it("uses Las Vegas's date late on Saturday evening, not UTC's", () => {
    // 04:00Z Sunday is still Saturday 9 PM in Las Vegas.
    expect(week.weekDays(undefined, new Date("2026-09-20T04:00:00Z"))[0]).toBe("2026-09-13");
  });
});

describe("rangeLabel and addDays", () => {
  it("labels weeks within a month, across months and across years", () => {
    expect(week.rangeLabel(week.weekDays("2026-09-13", NOW))).toBe("Sep 13 – 19, 2026");
    expect(week.rangeLabel(week.weekDays("2026-09-27", NOW))).toBe("Sep 27 – Oct 3, 2026");
    expect(week.rangeLabel(week.weekDays("2026-12-27", NOW))).toBe("Dec 27, 2026 – Jan 2, 2027");
    expect(week.addDays("2026-09-13", -7)).toBe("2026-09-06");
  });
});

describe("getWeek", () => {
  const trackerRow = { id: ID, name: "Dana Reyes", city: "Henderson", status: "visit_booked",
    visit_at: "2026-09-17T17:00:00Z", install_on: "2026-09-19" };

  it("shows tracker dates with a notice when Outlook is not connected", async () => {
    sql.mockResolvedValueOnce([trackerRow]);
    const result = await week.getWeek(undefined, NOW);
    expect(result.source).toBe("tracker");
    expect(result.notice).toBe("Outlook isn't connected yet.");
    expect(result.items).toEqual([
      expect.objectContaining({ day: "2026-09-17", allDay: false, job: expect.objectContaining({ id: ID, kind: "visit" }) }),
      expect.objectContaining({ day: "2026-09-19", allDay: true, job: expect.objectContaining({ kind: "install" }) }),
    ]);
  });

  it("merges Outlook events with their jobs, and greys the rest", async () => {
    enabled.mockReturnValue(true);
    graphJson.mockResolvedValue({ value: [
      { id: "e1", changeKey: "c", subject: "Visit · Dana Reyes", isAllDay: false,
        start: { dateTime: "2026-09-17T10:00:00.0000000", timeZone: PST }, end: { dateTime: "2026-09-17T11:00:00.0000000", timeZone: PST } },
      { id: "e2", changeKey: "c", subject: "Dentist", isAllDay: false,
        start: { dateTime: "2026-09-17T08:00:00.0000000", timeZone: PST }, end: { dateTime: "2026-09-17T09:00:00.0000000", timeZone: PST } },
    ] });
    sql.mockResolvedValueOnce([]) // tracker rows
      .mockResolvedValueOnce([{ event_id: "e1", kind: "visit", id: ID, name: "Dana Reyes", city: "Henderson", status: "visit_booked" }]);
    const result = await week.getWeek(undefined, NOW);
    expect(result.source).toBe("outlook");
    expect(result.notice).toBeNull();
    expect(result.items.map((i) => i.title)).toEqual(["Dentist", "Visit · Dana Reyes"]);
    expect(result.items[0].job).toBeNull();
    expect(result.items[1].job).toMatchObject({ id: ID, kind: "visit" });
    expect(result.items[1].start).toEqual(new Date("2026-09-17T17:00:00Z"));
    expect(String(graphJson.mock.calls[0][0])).toMatch(/^users\/jobs@example.com\/calendar\/calendarView\?startDateTime=2026-09-13T07:00:00.000Z&endDateTime=2026-09-20T07:00:00.000Z/);
  });

  it("falls back to tracker dates when Outlook can't be reached", async () => {
    enabled.mockReturnValue(true);
    graphJson.mockRejectedValue(new Error("down"));
    sql.mockResolvedValueOnce([trackerRow]);
    const result = await week.getWeek(undefined, NOW);
    expect(result.source).toBe("tracker");
    expect(result.notice).toBe("Couldn't reach Outlook, showing tracker dates only.");
  });
});
```

The implementation must run the tracker query first and the link query second, matching the order of the mocks above. It must also skip the link query when there are no Graph events.

`tests/admin/schedule-page.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const getWeek = vi.fn();
vi.mock("@/lib/calendar/week", async () => ({
  ...(await vi.importActual<typeof import("@/lib/calendar/week")>("@/lib/calendar/week")), getWeek,
}));
const requireAdmin = vi.fn(async () => ({ email: "owner@example.com" }));
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const { default: SchedulePage } = await import("@/app/admin/schedule/page");
const days = ["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"];
const open = async (week?: string) => render(await SchedulePage({ searchParams: Promise.resolve(week ? { week } : {}) }));

beforeEach(() => {
  requireAdmin.mockClear();
  getWeek.mockReset().mockResolvedValue({
    days, source: "outlook", notice: null, items: [
      { key: "e1", day: "2026-09-17", allDay: false, start: new Date("2026-09-17T17:00:00Z"), title: "Visit · Dana Reyes",
        job: { id: ID, name: "Dana Reyes", city: "Henderson", status: "visit_booked", kind: "visit" } },
      { key: "e2", day: "2026-09-17", allDay: false, start: new Date("2026-09-17T15:00:00Z"), title: "Dentist", job: null },
    ],
  });
});

describe("schedule page", () => {
  it("checks the session first and shows the week's range and navigation", async () => {
    await open();
    expect(requireAdmin).toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "Schedule" })).toBeInTheDocument();
    expect(screen.getByText("Sep 13 – 19, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /previous week/i })).toHaveAttribute("href", "/admin/schedule?week=2026-09-06");
    expect(screen.getByRole("link", { name: /next week/i })).toHaveAttribute("href", "/admin/schedule?week=2026-09-20");
    expect(screen.getByRole("link", { name: "This week" })).toHaveAttribute("href", "/admin/schedule");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(7);
  });

  it("links job appointments to the job and leaves other appointments as plain text", async () => {
    await open();
    const thursday = within(screen.getByRole("listitem", { name: /thu 17/i }));
    expect(thursday.getByRole("link", { name: /dana reyes/i })).toHaveAttribute("href", `/admin?job=${ID}`);
    expect(thursday.getByText(/10:00 AM/)).toBeInTheDocument();
    expect(thursday.getByText("Dentist")).toBeInTheDocument();
    expect(thursday.queryByRole("link", { name: /dentist/i })).toBeNull();
  });

  it("explains when it is showing tracker dates only", async () => {
    getWeek.mockResolvedValue({ days, source: "tracker", notice: "Outlook isn't connected yet.", items: [] });
    await open();
    expect(screen.getByRole("status")).toHaveTextContent("Outlook isn't connected yet.");
    expect(screen.getByText("Nothing scheduled this week.")).toBeInTheDocument();
  });

  it("passes the week parameter through", async () => {
    await open("2026-10-01");
    expect(getWeek).toHaveBeenCalledWith("2026-10-01");
  });
});
```

In `tests/admin/admin-nav.test.tsx`:
- Extend the first test to also expect `nav.getByRole("link", { name: "Schedule" })` to have `href` `/admin/schedule`.
- Add a test that with `pathname` `/admin/schedule`, the Schedule link has `aria-current="page"` and Jobs doesn't.

- [ ] **Step 2: Run the three files and check that they fail.**

- [ ] **Step 3: Implement** `lib/calendar/week.ts`

```ts
import "server-only";
import { db } from "@/lib/db";
import { fromLocalInput, lasVegasDate } from "@/lib/admin/time";
import type { Stage } from "@/lib/admin/stages";
import { calendarConfig, calendarEnabled } from "./config";
import { nextDay, type GraphEvent } from "./events";
import { graphJson } from "./graph";

export type ScheduleItem = {
  key: string; day: string; allDay: boolean; start: Date | null; title: string;
  job: { id: string; name: string; city: string; status: Stage; kind: "visit" | "install" } | null;
};
export type Week = { days: string[]; items: ScheduleItem[]; source: "outlook" | "tracker"; notice: string | null };

const noon = (date: string) => new Date(`${date}T12:00:00Z`);
export function addDays(date: string, n: number): string {
  const d = noon(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Sunday-to-Saturday dates of the week containing `param` (YYYY-MM-DD), or today in Las Vegas. */
export function weekDays(param: string | undefined, now: Date): string[] {
  const valid = param && /^\d{4}-\d{2}-\d{2}$/.test(param) && noon(param).toISOString().slice(0, 10) === param;
  const anchor = valid ? param : lasVegasDate(now);
  const sunday = addDays(anchor, -noon(anchor).getUTCDay());
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

const fmt = (date: string, opts: Intl.DateTimeFormatOptions) => noon(date).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

/** "Sep 13 – 19, 2026", "Sep 27 – Oct 3, 2026", "Dec 27, 2026 – Jan 2, 2027". */
export function rangeLabel(days: string[]): string {
  const [a, b] = [days[0], days[6]];
  if (a.slice(0, 4) !== b.slice(0, 4)) {
    return `${fmt(a, { month: "short", day: "numeric", year: "numeric" })} – ${fmt(b, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  const end = a.slice(0, 7) === b.slice(0, 7) ? fmt(b, { day: "numeric" }) : fmt(b, { month: "short", day: "numeric" });
  return `${fmt(a, { month: "short", day: "numeric" })} – ${end}, ${a.slice(0, 4)}`;
}

const order = (a: ScheduleItem, b: ScheduleItem) =>
  a.day.localeCompare(b.day) || Number(b.allDay) - Number(a.allDay) || (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0);

async function trackerItems(days: string[], from: Date, to: Date): Promise<ScheduleItem[]> {
  const rows = await db()`
    select id, name, city, status, visit_at, install_on::text as install_on from leads
     where status <> 'lost'
       and ((visit_at >= ${from} and visit_at < ${to}) or install_on between ${days[0]}::date and ${days[6]}::date)`;
  const items: ScheduleItem[] = [];
  for (const row of rows) {
    const base = { id: row.id as string, name: row.name as string, city: row.city as string, status: row.status as Stage };
    const visit = row.visit_at ? new Date(row.visit_at as string) : null;
    if (visit && visit >= from && visit < to) {
      items.push({ key: `${base.id}:visit`, day: lasVegasDate(visit), allDay: false, start: visit,
        title: `Visit · ${base.name}`, job: { ...base, kind: "visit" } });
    }
    const install = row.install_on as string | null;
    if (install && install >= days[0] && install <= days[6]) {
      items.push({ key: `${base.id}:install`, day: install, allDay: true, start: null,
        title: `Install · ${base.name}`, job: { ...base, kind: "install" } });
    }
  }
  return items;
}

export async function getWeek(param: string | undefined, now = new Date()): Promise<Week> {
  const days = weekDays(param, now);
  const from = fromLocalInput(`${days[0]}T00:00`);
  const to = fromLocalInput(`${nextDay(days[6])}T00:00`);
  const tracker = (await trackerItems(days, from, to)).sort(order);
  if (!calendarEnabled()) return { days, items: tracker, source: "tracker", notice: "Outlook isn't connected yet." };
  try {
    const mailbox = calendarConfig()!.mailbox;
    const { value } = await graphJson<{ value: GraphEvent[] }>(
      `users/${mailbox}/calendar/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}` +
        "&$select=id,subject,start,end,isAllDay&$top=200&$orderby=start/dateTime",
    );
    const ids = value.map((e) => e.id);
    const links = ids.length
      ? await db()`
          select l.event_id, l.kind, j.id, j.name, j.city, j.status
          from job_calendar_events l join leads j on j.id = l.lead_id where l.event_id = any(${ids})`
      : [];
    const byEvent = new Map(links.map((row) => [row.event_id as string, row]));
    const items = value.map((event): ScheduleItem => {
      const link = byEvent.get(event.id);
      const allDay = event.isAllDay === true;
      return {
        key: event.id, day: event.start.dateTime.slice(0, 10), allDay,
        start: allDay ? null : fromLocalInput(event.start.dateTime.slice(0, 16)),
        title: event.subject || "(no title)",
        job: link ? { id: link.id as string, name: link.name as string, city: link.city as string,
          status: link.status as Stage, kind: link.kind as "visit" | "install" } : null,
      };
    });
    return { days, items: items.sort(order), source: "outlook", notice: null };
  } catch (error) {
    console.error("Schedule could not read Outlook", error);
    return { days, items: tracker, source: "tracker", notice: "Couldn't reach Outlook, showing tracker dates only." };
  }
}
```

The test mocks' query order is tracker first, then links. `getWeek` runs the tracker query before Graph, so it matches.

- [ ] **Step 4: Implement** `app/admin/schedule/page.tsx`

```tsx
import Link from "next/link";
import { Icon } from "@/components/admin/icons";
import { requireAdmin } from "@/lib/admin/session";
import { STAGE_STYLE } from "@/lib/admin/stages";
import { lasVegasDate } from "@/lib/admin/time";
import { addDays, getWeek, rangeLabel, type ScheduleItem } from "@/lib/calendar/week";

const formatTime = (date: Date) =>
  date.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
const dayName = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", day: "numeric" });

function Item({ item }: { item: ScheduleItem }) {
  const when = item.allDay || !item.start ? "All day" : formatTime(item.start);
  if (!item.job) {
    return (
      <div className="rounded-lg border border-rule bg-ivory/60 p-2 text-xs text-ink-soft opacity-70">
        <p>{when}</p>
        <p>{item.title}</p>
      </div>
    );
  }
  const { job } = item;
  return (
    <Link
      href={`/admin?job=${job.id}`}
      className={`flex flex-col gap-0.5 rounded-lg border border-rule border-l-4 ${STAGE_STYLE[job.status].left} bg-ivory p-2 text-xs shadow-sm hover:shadow-md`}
    >
      <span className="text-ink-soft">{when} · {job.kind === "visit" ? "Visit" : "Install"}</span>
      <span className="text-sm font-semibold text-charcoal">{job.name}</span>
      <span className="text-ink-soft">{job.city}</span>
    </Link>
  );
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  await requireAdmin();
  const params = await searchParams;
  const param = Array.isArray(params.week) ? params.week[0] : params.week;
  const { days, items, notice } = await getWeek(param);
  const today = lasVegasDate(new Date());

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-soft">PSS Operations</p>
          <h1 className="text-3xl font-semibold text-charcoal">Schedule</h1>
          <p className="text-sm text-ink-soft">{rangeLabel(days)}</p>
        </div>
        <nav aria-label="Weeks" className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={`/admin/schedule?week=${addDays(days[0], -7)}`} className="underline underline-offset-4">← Previous week</Link>
          <Link href="/admin/schedule" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-charcoal px-4 font-medium text-ivory">
            <Icon name="calendar" className="size-4" />
            This week
          </Link>
          <Link href={`/admin/schedule?week=${addDays(days[0], 7)}`} className="underline underline-offset-4">Next week →</Link>
        </nav>
      </header>

      {notice ? <p role="status" className="text-sm text-ink-soft">{notice}</p> : null}
      {items.length === 0 ? <p className="text-sm text-ink-soft">Nothing scheduled this week.</p> : null}

      <ol className="grid gap-3 md:grid-cols-7">
        {days.map((day) => {
          const isToday = day === today;
          const dayItems = items.filter((item) => item.day === day);
          return (
            <li
              key={day}
              aria-labelledby={`day-${day}`}
              className={`flex min-h-32 flex-col gap-2 rounded-xl border bg-sand/40 p-2 ${isToday ? "border-champagne-ink" : "border-rule"}`}
            >
              <h2 id={`day-${day}`} className="text-sm font-semibold text-charcoal">
                {isToday ? `Today · ${dayName(day)}` : dayName(day)}
              </h2>
              {dayItems.map((item) => <Item key={item.key} item={item} />)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

`dayName` produces "Thu 17". If the runtime's `Intl` puts the day first, fix the order explicitly so the text reads `Thu 17`. The test matches `/thu 17/i`.

- [ ] **Step 5: Add `left` to `STAGE_STYLE`** as described in this task's "Stage style addition" bullets, and **add the Schedule link to `LINKS`** in `AdminNav.tsx`.

- [ ] **Step 6: Run** `npx vitest run tests/calendar tests/admin --maxWorkers=2`, then typegen and tsc. Expected: everything passes.

- [ ] **Step 7: Commit**

```bash
git add lib/calendar/week.ts app/admin/schedule/page.tsx app/admin/AdminNav.tsx lib/admin/stages.ts tests/calendar/week.test.ts tests/admin/schedule-page.test.tsx tests/admin/admin-nav.test.tsx tests/admin/stages.test.ts
git commit -m "feat: Schedule tab with a week view of the shared calendar"
```

(Leave `tests/admin/stages.test.ts` out of the commit if it didn't change.)

---

### Task 8: Settings status, E2E, and the owner's setup checklist

**Files:**
- Modify: `app/admin/settings/page.tsx`
- Create: `tests/admin/settings-page.test.tsx`
- Modify: `e2e/admin.spec.ts` (append one test)
- Create: `docs/outlook-setup.md`

**Interfaces:**
- Consumes: `calendarEnabled`, and `getSyncState` from the store.

- **Settings:** keep the heading. Replace the "coming soon" paragraph with an `<section aria-labelledby="outlook-heading">` whose `<h2 id="outlook-heading">` reads `Outlook calendar`. Its contents:
  - When disabled: `Not connected. Follow docs/outlook-setup.md to connect the shared PSS Jobs calendar.`
  - When enabled and `lastError` is set: `Connected, but the last sync failed on <formatWhen(lastErrorAt)>: <lastError>`, in `text-overdue`.
  - When enabled with no error: `Connected. Updates from Outlook are on until <formatWhen(expiresAt)>.`, or, if `expiresAt` is null, `Connected. Waiting for the first daily check to switch on updates from Outlook.`
- **Settings test:** mock `@/lib/admin/session`, `@/lib/calendar/config` and `@/lib/calendar/store`, and assert all four texts.
- **E2E:** append this to `e2e/admin.spec.ts`. It relies on the file's existing `signIn`, `sql` and `NAME` helpers, and on the MS variables being absent, which is what `run-e2e.mjs` gives the server.

```ts
test("the schedule shows this week's visits from the tracker and opens the job", async ({ page }) => {
  const visit = new Date(Date.now() + 60 * 60 * 1000); // an hour from now is always this week or just into next
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status, visit_at)
    values (${`${NAME} Schedule`}, '7025550188', 'sched@example.com', 'Henderson', 'phone', 'visit_booked', ${visit})
    returning id`;
  await signIn(page);
  // Visiting the week that contains the visit keeps this stable on a Saturday night.
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(visit);
  await page.goto(`/admin/schedule?week=${day}`);
  await expect(page.getByRole("heading", { level: 1, name: "Schedule" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Outlook isn't connected yet." })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`${NAME} Schedule`) }).click();
  await expect(page).toHaveURL(new RegExp(`/admin\\?job=${row.id}`));
  await expect(page.getByRole("complementary", { name: new RegExp(`${NAME} Schedule`) })).toBeVisible();
});
```

Before relying on `signIn`, `sql` and `NAME`, check their exact names and signatures at the top of `e2e/admin.spec.ts` and adjust to match. The status assertion is filtered by text, because the route announcer is also a live region.

- **`docs/outlook-setup.md`:** the owner's checklist. Write it in plain language, numbered, with every value to copy clearly marked. It covers spec §4 steps 1–4 exactly, including:
  - The PowerShell commands, verbatim from spec §4.
  - The warning not to add Graph permissions in Entra, because Exchange grants access to the one mailbox.
  - The 30-minute to 2-hour wait.
  - Where to paste each Vercel variable, and that `CALENDAR_CLIENT_STATE` can be made with `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
  - Writing down the client secret's expiry date.
  - A final "check it works" section: redeploy, run the cron once from the Vercel dashboard's Cron Jobs page (Run), set a visit on a test job and see it in Outlook within a minute, move it in Outlook and see the job update within a few minutes, then clear the date.

- [ ] **Step 1: Write the settings test** (four cases, as above) **and check that it fails.**
- [ ] **Step 2: Implement the settings section.** Run the test. Expected: PASS.
- [ ] **Step 3: Append the e2e test.** The controller runs it with `run-e2e.mjs` against a Neon test branch. The implementer only needs to make sure the spec file type-checks (`npx tsc --noEmit`).
- [ ] **Step 4: Write `docs/outlook-setup.md`.**
- [ ] **Step 5: Run the full check.** `npx vitest run --maxWorkers=2`, `npx tsc --noEmit`, `npx next build`, all passing.
- [ ] **Step 6: Commit**

```bash
git add app/admin/settings/page.tsx tests/admin/settings-page.test.tsx e2e/admin.spec.ts docs/outlook-setup.md
git commit -m "feat: Outlook status in Settings, schedule e2e, setup checklist"
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| §3 Platform facts (lifetime, validation, 3s/202, 409, RBAC) | Tasks 1, 5, and the Task 8 checklist |
| §4 Setup and feature switch | Task 1 (`calendarEnabled`), Task 8 (checklist, Settings) |
| §5 Migration 007 | Task 1 |
| §6 Tracker → Outlook, event content, keeping the length, call sites | Tasks 2, 3, 6 |
| §7 Webhook, lifecycle, echo, cron reconcile, conflict rule | Tasks 4, 5 |
| §8 Schedule tab | Task 7 |
| §9 Code layout | All tasks |
| §10 Errors and edge cases | Tasks 3–5 (recorded errors, 404, echo, text-only edit, series master) |
| §12 Testing | Tests in every task, plus the Task 8 e2e |

**Rulings made while planning** (the controller copies these into the ledger):
- `addJob` gets no sync hook, because `createJob` never stores dates. The spec's "createJob, when the new job has dates" never happens, and the cron covers it anyway.
- Subject and body are written only when an event is created. No path in the tracker edits a customer's name or address, so the spec's "refreshed when name or address changed" never applies.
- Jobs are deleted only through the database cascade, which drops the link row. There's no job-delete action, so no Outlook delete call is added (spec §10: "if a delete path exists").
- Visit notes include the job link through `portalOrigin()`. That's the same origin rule as sign-in links: `ADMIN_BASE_URL`, falling back to the business domain.
