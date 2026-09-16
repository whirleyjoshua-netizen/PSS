# Route Creator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Route** view on the admin schedule that pins a day's appointments on a Google map, asks Google Route Optimization to split them between the installers and order each list around arrival windows, lets the owner adjust, and saves the approved routes — plus arrival windows and lengths on every appointment and a geocode on every job address.

**Architecture:** Pure modules do the thinking and are tested without Google or a database: `lib/routes/optimize-request.ts` (request builders), `lib/routes/optimize-response.ts` (parser), `lib/routes/stale.ts` (staleness), `lib/routes/window.ts` (window labels), `lib/routes/maps-link.ts`. Thin I/O modules sit around them: `lib/routes/google-auth.ts` (service-account token), `lib/routes/optimize.ts` (the HTTP call), `lib/routes/geocode.ts`, `lib/routes/settings.ts`, `lib/routes/day.ts` (load a day, load and save routes). `app/admin/schedule/route-actions.ts` holds the three server actions; `app/admin/schedule/RouteView.tsx` (client) renders the lists and hands the pins to `RouteMap.tsx`. Building is a preview; only **Save routes** writes.

**Tech Stack:** Next.js 16.3 App Router (this repo's version — read `node_modules/next/dist/docs/` before using any Next API; `after()` is in `01-app/03-api-reference/04-functions/after.md`, `revalidatePath` beside it), React 19 server/client components, Tailwind v4 tokens, Neon Postgres via `db()` with plain SQL migrations, zod v4, `google-auth-library` (new), `@vis.gl/react-google-maps` (new), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-route-creator-design.md`

## Where this plan corrects or settles the spec

Read these before any task; each task already follows them.

1. **Re-checking a hand-edited route does not use `VALIDATE_ONLY`.** Google's reference says `VALIDATE_ONLY` "Only validates the model without solving it: populates as many OptimizeToursResponse.validation_errors as possible" — it returns no routes and no times. And `injectedFirstSolutionRoutes` is only a starting hint the solver may rearrange. The re-check therefore sends `solvingMode` `DEFAULT_SOLVE` with an **`injectedSolutionConstraint`** holding the edited routes and one `constraintRelaxations` entry at level `RELAX_VISIT_TIMES_AFTER_THRESHOLD` with `thresholdVisitCount: 0` for every vehicle ("Visit start times and vehicle start/end times will be relaxed, but each visit remains bound to the same vehicle and the visit sequence must be observed"). So Google recomputes times but keeps the owner's order and assignment. In the re-check, windows are sent as **soft** (`softStartTime`/`softEndTime` with `costPerHourBeforeSoftStartTime`/`costPerHourAfterSoftEndTime`) so a broken window comes back as a late or early arrival we can flag, instead of the stop disappearing. `considerRoadTraffic: false` in both calls.
2. **Travel cost is `costPerTraveledHour`, not `costPerHour`.** `costPerHour` charges waiting and service time too; the spec's intent ("the least driving wins") is `costPerTraveledHour`.
3. **A vehicle with no `startLocation` "starts at its first pickup"** (the Vehicle reference). This model has deliveries only, so the solver treats the first visit as the start; the first transition's `travelDuration` is 0 or absent, and we store `driveMinutes: 0` for it. No `endLocation` either.
4. **Durations in JSON are strings like `"5400s"`**, timestamps RFC 3339. The parser accepts `"5400s"` and `"12.5s"`; a missing duration is 0.
5. **Skipped reasons.** Real `SkippedShipment.Reason.Code` values: `CODE_UNSPECIFIED`, `NO_VEHICLE`, `DEMAND_EXCEEDS_VEHICLE_CAPACITY`, `CANNOT_BE_PERFORMED_WITHIN_VEHICLE_DISTANCE_LIMIT`, `CANNOT_BE_PERFORMED_WITHIN_VEHICLE_DURATION_LIMIT`, `CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TRAVEL_DURATION_LIMIT`, `CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TIME_WINDOWS`, `VEHICLE_NOT_ALLOWED`, `VEHICLE_IGNORED`, `SHIPMENT_IGNORED`, `SKIPPED_IN_INJECTED_SOLUTION_CONSTRAINT`, `VEHICLE_ROUTE_IS_FULLY_SEQUENCE_CONSTRAINED`, `ZERO_PENALTY_COST`. A skipped shipment often has **no** reasons (it simply didn't fit profitably); that gets its own plain-English line.
6. **Auth: `google-auth-library`.** Route Optimization needs an OAuth access token with scope `https://www.googleapis.com/auth/cloud-platform` (no API keys). `new GoogleAuth({ credentials, scopes })` signs the RS256 JWT from the service-account JSON, exchanges it, and caches and refreshes the token for us. Hand-rolling the JWT with `node:crypto` would save a dependency but re-implements token caching and clock-skew handling that Google's own library already maintains; it is server-only, so it never reaches the browser bundle.
7. **Addresses cannot be edited in the admin today.** `updateDetails` does not touch `address` or `city`, and no admin form does. The spec's "Needs address → fix it on the job page; saving re-geocodes" needs an edit path, so Task 5 adds **Address** and **City** to the job's Details form, and `updateDetails` re-geocodes only when either actually changed. The questionnaire (`saveQuestionnaire`) also writes `address`, so it re-geocodes too.
8. **A lead with no street address** is not geocoded to the city centre (that would route an installer to a city hall). It is stamped `geocode_status = 'not_found'`, `geocoded_at = now()` and appears under **Needs address**.
9. **Which appointments are routed:** every appointment on that Las Vegas date whose job is not `lost`, confirmed **and** pending (planning happens before confirming). Pending stops are labelled "Pending" in the list. The staleness rule uses the same set.
10. **Save races** need a build time. The plan object carries `builtAt` (ISO); `saveRoutes` refuses when any of the day's appointments has `updated_at > builtAt` or the set of appointment ids differs from the plan's.
11. **Advanced markers need a Map ID.** `@vis.gl/react-google-maps`'s `AdvancedMarker` requires `mapId`. The setup adds `NEXT_PUBLIC_GOOGLE_MAP_ID` (a Map ID created in Cloud Console) beside the spec's four env vars.
12. **The Playwright optimizer stub** cannot be a `page.route` (the call is server-side). `lib/routes/optimize.ts` reads an optional `ROUTE_OPTIMIZATION_URL` and `ROUTE_OPTIMIZATION_TOKEN`; when both are set it posts there with that bearer token and skips the service account. Only `playwright.config.ts` sets them, pointing at a stub server the spec starts.
13. **The 08:00 → 09:00 all-day move** does not bump `updated_at` (no route exists yet, and it must not look like an owner edit). The comment in `lib/calendar/week.ts` that names 08:00 is updated. New all-day bookings keep whatever time the dialog sends; only the backfill moved.

## Global Constraints

- Migration number is **017** (`db/migrations/017_routes.sql`). Do not add `project_no` — another branch owns 016 and it.
- Time zone `America/Los_Angeles` everywhere; reuse `fromLocalInput`, `lasVegasDate`, `formatTime` from `lib/admin/time.ts`.
- Working day defaults to 9:00–18:00; default lengths consultation 60, measure 60, install 240, service 90 minutes. `duration_minutes between 15 and 720`.
- Windows are 30-minute steps; lengths are hours in 0.25 steps.
- Google, not an AI model, builds the route. Nothing is written until **Save routes**.
- Geocoding never rewrites `address` or `city`; only `lat`, `lng`, `geocoded_at`, `geocode_status`. Query is `"<address>, <city>, NV"` with `components=country:US`.
- Env vars: `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (browser, referrer-restricted), `NEXT_PUBLIC_GOOGLE_MAP_ID`, `GOOGLE_GEOCODING_KEY`, `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` (server-only). Test-only: `ROUTE_OPTIMIZATION_URL`, `ROUTE_OPTIMIZATION_TOKEN`.
- Google calls time out at **15 s**. Any Google failure shows "Route planning is unavailable right now" and never breaks booking or job saves.
- Installers are `team_members` with role `installer`; nothing is hard-coded.
- Every server action calls `requireAdmin()` before reading its input.
- Copy, verbatim: "Build routes", "Save routes", "Route is out of date — rebuild", "Didn't fit", "Needs address", "Open in Google Maps", "Route planning is unavailable right now", "This day changed — rebuild first.", "We'll arrive between 8:00 and 10:00 am" (shape), "Any time", "Arrival window", "Length".
- Tailwind class names are complete literals, never concatenated. Everything works at ~400px; below `md` the map sits above the list.
- Migrations: idempotent, whole-line `--` comments only, no `;` inside comments. `scripts/migrate.mjs` re-applies every file on every run.
- Unit tests: `npx vitest run --maxWorkers=2 <paths>`. Memory is tight: never run vitest alongside typecheck/lint/build; if a run is killed, re-run with `--maxWorkers=1` or a narrower path.
- Typecheck `npm run typecheck`. Lint only changed files by path (`npx eslint <paths>`). Then `npm run build` where a task says so.
- Do NOT run `scripts/migrate.mjs`, `scripts/geocode-backfill.mjs`, Playwright, or anything against a database or Google — `.env.local` holds PRODUCTION credentials. Mock `db()` and `fetch` in tests.
- Never use `git stash`. Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SRgcefTxGGJeDZ8LFGUHKc
  ```

## File map

| File | Responsibility |
|---|---|
| `db/migrations/017_routes.sql` | Columns, `route_settings`, `route_stops`, the 08:00→09:00 move |
| `lib/routes/types.ts` | Client-safe shared types (`DayStop`, `RoutePlan`, …) |
| `lib/routes/window.ts` | Client-safe: `"HH:MM"` helpers, `windowLabel`, `emailWindowLine`, 30-minute options |
| `lib/routes/settings.ts` | Read/write `route_settings`, `defaultMinutes` |
| `lib/routes/geocode.ts` | Geocoding API call and `geocodeLead(id)` |
| `scripts/geocode-backfill.mjs` | One-off backfill |
| `lib/routes/google-auth.ts` | Service-account access token |
| `lib/routes/optimize-request.ts` | Pure `buildOptimizeRequest`, `buildRecheckRequest` |
| `lib/routes/optimize-response.ts` | Pure `parseOptimizeResponse`, `reasonText` |
| `lib/routes/optimize.ts` | `optimizeTours(body)` HTTP call, config check |
| `lib/routes/stale.ts` | Pure `isRouteStale` |
| `lib/routes/day.ts` | `loadDay`, `loadSavedPlan`, `saveRoutePlan`, `routeNotes` |
| `lib/routes/maps-link.ts` | Client-safe `mapsDirectionsUrl` |
| `app/admin/schedule/route-actions.ts` | `buildRoutes`, `recheckRoutes`, `saveRoutes` |
| `app/admin/schedule/RouteView.tsx`, `RouteMap.tsx` | The Route view |
| `app/admin/settings/RoutesSection.tsx` | Settings → Routes |

---

### Task 1: Migration 017

**Files:**
- Create: `db/migrations/017_routes.sql`, `tests/db/migration-017.test.ts`

**Interfaces:**
- Produces: columns `appointments.window_start time`, `window_end time`, `duration_minutes integer`; `leads.lat`, `lng double precision`, `geocoded_at timestamptz`, `geocode_status text`; tables `route_settings` (single row, seeded) and `route_stops`.

- [ ] **Step 1: Write the failing test** — `tests/db/migration-017.test.ts`, same parsing as `tests/db/migration-014.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FILE = "db/migrations/017_routes.sql";
const statements = readFileSync(FILE, "utf8")
  .split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const all = statements.join(" ");

describe("migration 017", () => {
  it("adds the window and length to appointments", () => {
    expect(all).toContain("alter table appointments add column if not exists window_start time");
    expect(all).toContain("alter table appointments add column if not exists window_end time");
    expect(all).toContain("alter table appointments add column if not exists duration_minutes integer");
  });

  it("drops then re-adds the length and window checks", () => {
    for (const name of ["appointments_duration_minutes_check", "appointments_window_check"]) {
      const dropAt = statements.findIndex((s) => s.includes(`drop constraint if exists ${name}`));
      const addAt = statements.findIndex((s) => s.includes(`add constraint ${name}`));
      expect(dropAt).toBeGreaterThanOrEqual(0);
      expect(addAt).toBeGreaterThan(dropAt);
    }
    expect(all).toContain("duration_minutes is null or duration_minutes between 15 and 720");
    expect(all).toContain(
      "(window_start is null and window_end is null) or (window_start is not null and window_end is not null and window_start < window_end)",
    );
  });

  it("moves 08:00 all-day installs to 09:00 without touching updated_at, so a re-run changes nothing", () => {
    const move = statements.find((s) => s.startsWith("update appointments"));
    expect(move).toBeDefined();
    expect(move).toContain("all_day");
    expect(move).toContain("(starts_at at time zone 'America/Los_Angeles')::time = '08:00'");
    expect(move).not.toContain("updated_at");
  });

  it("adds the geocode columns to leads", () => {
    expect(all).toContain("alter table leads add column if not exists lat double precision");
    expect(all).toContain("alter table leads add column if not exists lng double precision");
    expect(all).toContain("alter table leads add column if not exists geocoded_at timestamptz");
    expect(all).toContain("alter table leads add column if not exists geocode_status text");
    expect(all).toContain("geocode_status is null or geocode_status in ('ok','not_found','error')");
  });

  it("creates the single-row route settings and seeds it once", () => {
    const table = statements.find((s) => s.startsWith("create table if not exists route_settings"));
    expect(table).toContain("id boolean primary key default true check (id)");
    expect(table).toContain("day_start time not null default '09:00'");
    expect(table).toContain("day_end time not null default '18:00'");
    expect(table).toContain("install_minutes integer not null default 240");
    expect(all).toContain("insert into route_settings (id) values (true) on conflict (id) do nothing");
  });

  it("creates route_stops with one stop per appointment and one position per installer per day", () => {
    const table = statements.find((s) => s.startsWith("create table if not exists route_stops"));
    expect(table).toContain("appointment_id uuid not null unique references appointments(id) on delete cascade");
    expect(table).toContain("team_member_id uuid not null references team_members(id) on delete cascade");
    expect(table).toContain("unique (route_date, team_member_id, position)");
    // How many stops the day had when saved: a cancelled appointment cascades its stop away, and this is how that is noticed.
    expect(table).toContain("saved_count integer not null default 0");
    expect(all).toContain("create index if not exists route_stops_date_idx on route_stops (route_date)");
  });

  it("is re-runnable", () => {
    for (const s of statements) {
      expect(s).toMatch(
        /^(create table if not exists|create index if not exists|alter table (appointments|leads) (add column if not exists|drop constraint if exists|add constraint)|update appointments|insert into route_settings)/,
      );
    }
  });

  it("keeps comments to whole lines, with no semicolons inside them", () => {
    for (const line of readFileSync(FILE, "utf8").split("\n")) {
      if (line.includes("--")) {
        expect(line.trim().startsWith("--")).toBe(true);
        expect(line).not.toContain(";");
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run --maxWorkers=2 tests/db/migration-017.test.ts` → FAIL (ENOENT).

- [ ] **Step 3: Implement** — `db/migrations/017_routes.sql`:

```sql
-- The route creator: arrival windows and lengths, geocoded addresses, route settings and saved routes.
-- Every statement is safe to re-run.

alter table appointments add column if not exists window_start time;

alter table appointments add column if not exists window_end time;

alter table appointments add column if not exists duration_minutes integer;

alter table appointments drop constraint if exists appointments_duration_minutes_check;

alter table appointments add constraint appointments_duration_minutes_check check (
  duration_minutes is null or duration_minutes between 15 and 720
);

alter table appointments drop constraint if exists appointments_window_check;

alter table appointments add constraint appointments_window_check check (
  (window_start is null and window_end is null)
  or (window_start is not null and window_end is not null and window_start < window_end)
);

-- All-day installs were stored at 08:00 Las Vegas time. The working day now starts at 09:00.
-- updated_at is left alone so this never looks like an owner edit. A second run matches nothing.

update appointments
   set starts_at = starts_at + interval '1 hour'
 where all_day
   and (starts_at at time zone 'America/Los_Angeles')::time = '08:00';

alter table leads add column if not exists lat double precision;

alter table leads add column if not exists lng double precision;

alter table leads add column if not exists geocoded_at timestamptz;

alter table leads add column if not exists geocode_status text;

alter table leads drop constraint if exists leads_geocode_status_check;

alter table leads add constraint leads_geocode_status_check check (
  geocode_status is null or geocode_status in ('ok','not_found','error')
);

create table if not exists route_settings (
  id boolean primary key default true check (id),
  day_start time not null default '09:00',
  day_end time not null default '18:00',
  consultation_minutes integer not null default 60,
  measure_minutes integer not null default 60,
  install_minutes integer not null default 240,
  service_minutes integer not null default 90
);

insert into route_settings (id) values (true) on conflict (id) do nothing;

create table if not exists route_stops (
  id uuid primary key default gen_random_uuid(),
  route_date date not null,
  appointment_id uuid not null unique references appointments(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  position integer not null,
  planned_arrival timestamptz not null,
  drive_minutes integer not null,
  saved_count integer not null default 0,
  saved_at timestamptz not null default now(),
  unique (route_date, team_member_id, position)
);

create index if not exists route_stops_date_idx on route_stops (route_date);
```

The re-runnable regex allows `alter table leads drop constraint if exists`/`add constraint` through the `(appointments|leads)` group. Because the move checks `= '08:00'`, a re-run finds nothing (rows are now 09:00).

In `lib/calendar/week.ts`, change the comment in `trackerItems` from "stored at 08:00 America/Los_Angeles (migration 014)" to "stored at 09:00 America/Los_Angeles (migration 014, moved by 017)".

- [ ] **Step 4: Run** — `npx vitest run --maxWorkers=2 tests/db/migration-017.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add db/migrations/017_routes.sql tests/db/migration-017.test.ts lib/calendar/week.ts` → `feat: migration 017 for routes, windows and geocodes`

---

### Task 2: Route settings and the Settings → Routes section

**Files:**
- Create: `lib/routes/types.ts`, `lib/routes/window.ts`, `lib/routes/settings.ts`, `app/admin/settings/RoutesSection.tsx`, `tests/routes/window.test.ts`, `tests/routes/settings.test.ts`, `tests/admin/routes-section.test.tsx`
- Modify: `lib/admin/schema.ts` (`routeSettingsSchema`), `app/admin/settings/actions.ts` (`saveRouteSettingsAction`), `app/admin/settings/page.tsx`, `tests/admin/settings-page.test.tsx`, `tests/admin/settings-actions.test.ts`

Note: the existing test folder `tests/routes/` holds *site route* tests (`thank-you.test.tsx` etc.). New route-creator unit tests go in `tests/routes/planner/` to keep them apart — use that path everywhere below.

**Interfaces (Produces):**

`lib/routes/types.ts` (no imports except `AppointmentKind` type):
```ts
import type { AppointmentKind } from "@/lib/admin/appointment-kinds";

/** "HH:MM", 24-hour, Las Vegas wall time. */
export type Clock = string;

export type RouteSettings = {
  dayStart: Clock; dayEnd: Clock;
  minutes: Record<AppointmentKind, number>;
};

/** One appointment on the day being planned, with everything the planner needs. */
export type DayStop = {
  appointmentId: string;
  jobId: string;
  name: string;
  address: string | null;
  city: string;
  kind: AppointmentKind;
  startsAt: string;          // ISO
  allDay: boolean;
  confirmed: boolean;
  windowStart: Clock | null;
  windowEnd: Clock | null;
  durationMinutes: number;   // resolved: own value, else the kind's default
  lat: number | null;
  lng: number | null;
  assignedTo: string | null;
  updatedAt: string;         // ISO
};

export type Installer = { id: string; name: string };

export type PlanStop = { appointmentId: string; arrival: string; driveMinutes: number; outsideWindow: boolean };
export type PlanRoute = { teamMemberId: string; stops: PlanStop[]; polyline: string | null; driveMinutes: number };
export type SkippedStop = { appointmentId: string; reason: string };
export type RoutePlan = { day: string; builtAt: string; routes: PlanRoute[]; skipped: SkippedStop[] };

export type SavedRoute = { plan: RoutePlan; savedAt: string; stale: boolean };
```

`lib/routes/window.ts` (client-safe, pure):
```ts
export const clockMinutes = (clock: Clock): number  // "09:30" → 570
export const minutesClock = (minutes: number): Clock // 570 → "09:30"
export const WINDOW_OPTIONS: { value: Clock; label: string }[] // 06:00..20:00 every 30 min, label "8:00 am"
export const clockLabel = (clock: Clock): string     // "08:00" → "8:00 am", "13:30" → "1:30 pm", "12:00" → "12:00 pm"
export const windowLabel = (start: Clock | null, end: Clock | null): string | null // "8:00 – 10:00 am" | "11:30 am – 1:00 pm" | null
export const emailWindowLine = (start: Clock | null, end: Clock | null): string | null // "We'll arrive between 8:00 and 10:00 am." | null
export const hoursLabel = (minutes: number): string  // 90 → "1.5", 240 → "4"
```

`lib/routes/settings.ts`:
```ts
export const DEFAULT_ROUTE_SETTINGS: RouteSettings
export async function getRouteSettings(): Promise<RouteSettings>   // falls back to defaults if the row/table is missing (logs)
export async function saveRouteSettings(input: RouteSettings): Promise<void>
export const defaultMinutes = (settings: RouteSettings, kind: AppointmentKind): number
```

`lib/admin/schema.ts`: `routeSettingsSchema` → output `RouteSettings`.
`app/admin/settings/actions.ts`: `saveRouteSettingsAction(_prev: RouteSettingsState, formData: FormData): Promise<RouteSettingsState>` with `export type RouteSettingsState = { error?: string; ok?: boolean }`.

- [ ] **Step 1: Write the failing tests**

`tests/routes/planner/window.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  clockLabel, clockMinutes, emailWindowLine, hoursLabel, minutesClock, windowLabel, WINDOW_OPTIONS,
} from "@/lib/routes/window";

describe("window helpers", () => {
  it("converts clocks and minutes both ways", () => {
    expect(clockMinutes("09:30")).toBe(570);
    expect(minutesClock(570)).toBe("09:30");
    expect(minutesClock(clockMinutes("18:00"))).toBe("18:00");
  });

  it("labels times the way customers read them", () => {
    expect(clockLabel("08:00")).toBe("8:00 am");
    expect(clockLabel("12:00")).toBe("12:00 pm");
    expect(clockLabel("13:30")).toBe("1:30 pm");
  });

  it("shares the am/pm when both ends are on the same side of noon", () => {
    expect(windowLabel("08:00", "10:00")).toBe("8:00 – 10:00 am");
    expect(windowLabel("11:30", "13:00")).toBe("11:30 am – 1:00 pm");
    expect(windowLabel(null, null)).toBeNull();
  });

  it("writes the email line only when a window is set", () => {
    expect(emailWindowLine("08:00", "10:00")).toBe("We'll arrive between 8:00 and 10:00 am.");
    expect(emailWindowLine("11:30", "13:00")).toBe("We'll arrive between 11:30 am and 1:00 pm.");
    expect(emailWindowLine(null, null)).toBeNull();
  });

  it("offers 30-minute steps", () => {
    expect(WINDOW_OPTIONS[0].value).toBe("06:00");
    expect(WINDOW_OPTIONS[1].value).toBe("06:30");
    expect(WINDOW_OPTIONS.at(-1)!.value).toBe("20:00");
  });

  it("shows lengths in hours", () => {
    expect(hoursLabel(90)).toBe("1.5");
    expect(hoursLabel(240)).toBe("4");
    expect(hoursLabel(75)).toBe("1.25");
  });
});
```

`tests/routes/planner/settings.test.ts` (db mock as in `tests/admin/jobs.test.ts`):
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { getRouteSettings, saveRouteSettings, defaultMinutes, DEFAULT_ROUTE_SETTINGS } = await import("@/lib/routes/settings");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

beforeEach(() => { sql.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("route settings", () => {
  it("reads the single row, trimming seconds from the times", async () => {
    sql.mockResolvedValue([{ day_start: "08:30:00", day_end: "17:00:00", consultation_minutes: 45,
      measure_minutes: 60, install_minutes: 300, service_minutes: 90 }]);
    expect(await getRouteSettings()).toEqual({
      dayStart: "08:30", dayEnd: "17:00",
      minutes: { consultation: 45, measure: 60, install: 300, service: 90 },
    });
  });

  it("falls back to the defaults when the row or table is missing", async () => {
    sql.mockResolvedValueOnce([]);
    expect(await getRouteSettings()).toEqual(DEFAULT_ROUTE_SETTINGS);
    sql.mockRejectedValueOnce(new Error('relation "route_settings" does not exist'));
    expect(await getRouteSettings()).toEqual(DEFAULT_ROUTE_SETTINGS);
  });

  it("upserts the single row", async () => {
    sql.mockResolvedValue([]);
    await saveRouteSettings({ dayStart: "09:00", dayEnd: "18:00", minutes: { consultation: 60, measure: 60, install: 240, service: 90 } });
    expect(text(sql.mock.calls[0])).toContain("insert into route_settings");
    expect(text(sql.mock.calls[0])).toContain("on conflict (id) do update set");
  });

  it("gives each kind its default length", () => {
    expect(defaultMinutes(DEFAULT_ROUTE_SETTINGS, "install")).toBe(240);
    expect(DEFAULT_ROUTE_SETTINGS).toEqual({ dayStart: "09:00", dayEnd: "18:00",
      minutes: { consultation: 60, measure: 60, install: 240, service: 90 } });
  });
});
```

In `tests/admin/schema.test.ts` add `routeSettingsSchema` cases: valid form (`dayStart "09:00"`, `dayEnd "18:00"`, `consultationHours "1"`, `measureHours "1"`, `installHours "4"`, `serviceHours "1.5"`) → `{ dayStart, dayEnd, minutes: { …, service: 90 } }`; `dayEnd` before `dayStart` → "The day must end after it starts"; `installHours "0.1"` → "Lengths are between 0.25 and 12 hours"; `"1.3"` → "Use quarter hours".

`tests/admin/settings-actions.test.ts` add: `saveRouteSettingsAction` rejects without a session before touching `saveRouteSettings` (mock `@/lib/routes/settings`); saves parsed values and returns `{ ok: true }`; returns the first zod message on bad input; revalidates `/admin/settings` and `/admin/schedule`.

`tests/admin/routes-section.test.tsx`: renders "Routes" heading, working-day selects defaulted to the settings (`getByLabelText("Day starts")` has value `09:00`), one "hours" input per kind labelled "Consultation length (hours)" etc., and a "Save" button. Mock `@/app/admin/settings/actions`.

`tests/admin/settings-page.test.tsx`: add `vi.mock("@/lib/routes/settings", () => ({ getRouteSettings: vi.fn(async () => DEFAULTS) }))` and assert the Routes heading renders.

- [ ] **Step 2: Run to verify failure** — `npx vitest run --maxWorkers=2 tests/routes/planner tests/admin/schema.test.ts tests/admin/settings-actions.test.ts tests/admin/routes-section.test.tsx tests/admin/settings-page.test.tsx`.

- [ ] **Step 3: Implement**

`lib/routes/window.ts`:
```ts
import type { Clock } from "./types";

export const clockMinutes = (clock: Clock): number => {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
};

export const minutesClock = (minutes: number): Clock =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const parts = (clock: Clock) => {
  const total = clockMinutes(clock);
  const h24 = Math.floor(total / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { time: `${h12}:${String(total % 60).padStart(2, "0")}`, period: h24 < 12 ? "am" : "pm" };
};

export const clockLabel = (clock: Clock): string => {
  const p = parts(clock);
  return `${p.time} ${p.period}`;
};

export const WINDOW_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const value = minutesClock(360 + i * 30);
  return { value, label: clockLabel(value) };
});

const joined = (start: Clock, end: Clock, separator: string): string => {
  const a = parts(start);
  const b = parts(end);
  return a.period === b.period
    ? `${a.time}${separator}${b.time} ${b.period}`
    : `${a.time} ${a.period}${separator}${b.time} ${b.period}`;
};

export const windowLabel = (start: Clock | null, end: Clock | null): string | null =>
  start && end ? joined(start, end, " – ") : null;

export const emailWindowLine = (start: Clock | null, end: Clock | null): string | null =>
  start && end ? `We'll arrive between ${joined(start, end, " and ")}.` : null;

export const hoursLabel = (minutes: number): string => String(minutes / 60);
```

`lib/routes/settings.ts`:
```ts
import "server-only";
import { db } from "@/lib/db";
import type { AppointmentKind } from "@/lib/admin/appointment-kinds";
import type { RouteSettings } from "./types";

export const DEFAULT_ROUTE_SETTINGS: RouteSettings = {
  dayStart: "09:00", dayEnd: "18:00",
  minutes: { consultation: 60, measure: 60, install: 240, service: 90 },
};

export const defaultMinutes = (settings: RouteSettings, kind: AppointmentKind): number => settings.minutes[kind];

/** Never throws: a missing row or table (migration 017 not applied) plans with the defaults. */
export async function getRouteSettings(): Promise<RouteSettings> {
  try {
    const [row] = await db()`
      select day_start::text as day_start, day_end::text as day_end, consultation_minutes,
             measure_minutes, install_minutes, service_minutes
        from route_settings where id`;
    if (!row) return DEFAULT_ROUTE_SETTINGS;
    return {
      dayStart: String(row.day_start).slice(0, 5),
      dayEnd: String(row.day_end).slice(0, 5),
      minutes: {
        consultation: Number(row.consultation_minutes), measure: Number(row.measure_minutes),
        install: Number(row.install_minutes), service: Number(row.service_minutes),
      },
    };
  } catch (error) {
    console.error("Could not read route settings", error);
    return DEFAULT_ROUTE_SETTINGS;
  }
}

export async function saveRouteSettings(s: RouteSettings): Promise<void> {
  await db()`
    insert into route_settings (id, day_start, day_end, consultation_minutes, measure_minutes, install_minutes, service_minutes)
    values (true, ${s.dayStart}::time, ${s.dayEnd}::time, ${s.minutes.consultation}, ${s.minutes.measure},
            ${s.minutes.install}, ${s.minutes.service})
    on conflict (id) do update set
      day_start = excluded.day_start, day_end = excluded.day_end,
      consultation_minutes = excluded.consultation_minutes, measure_minutes = excluded.measure_minutes,
      install_minutes = excluded.install_minutes, service_minutes = excluded.service_minutes`;
}
```

`lib/admin/schema.ts` — add (and export a shared `hoursField`, reused by Task 3):
```ts
const CLOCK = /^([01]\d|2[0-3]):(00|30)$/;
export const clockField = z.string().regex(CLOCK, "Pick a time");

/** Hours in quarter steps, stored as minutes. */
export const hoursField = z.coerce
  .number({ error: "Enter the length in hours" })
  .refine((h) => h >= 0.25 && h <= 12, "Lengths are between 0.25 and 12 hours")
  .refine((h) => Number.isInteger(h * 4), "Use quarter hours")
  .transform((h) => Math.round(h * 60));

export const routeSettingsSchema = z
  .object({
    dayStart: clockField, dayEnd: clockField,
    consultationHours: hoursField, measureHours: hoursField, installHours: hoursField, serviceHours: hoursField,
  })
  .refine((v) => v.dayStart < v.dayEnd, { message: "The day must end after it starts", path: ["dayEnd"] })
  .transform((v) => ({
    dayStart: v.dayStart, dayEnd: v.dayEnd,
    minutes: { consultation: v.consultationHours, measure: v.measureHours, install: v.installHours, service: v.serviceHours },
  }));
```

`app/admin/settings/actions.ts` — add:
```ts
export type RouteSettingsState = { error?: string; ok?: boolean };

export async function saveRouteSettingsAction(_prev: RouteSettingsState, formData: FormData): Promise<RouteSettingsState> {
  await requireAdmin();
  const parsed = routeSettingsSchema.safeParse({
    dayStart: formData.get("dayStart"), dayEnd: formData.get("dayEnd"),
    consultationHours: formData.get("consultationHours"), measureHours: formData.get("measureHours"),
    installHours: formData.get("installHours"), serviceHours: formData.get("serviceHours"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await saveRouteSettings(parsed.data);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/schedule");
  return { ok: true };
}
```

`app/admin/settings/RoutesSection.tsx` — `"use client"`, `useActionState(saveRouteSettingsAction, {})`, a `<section aria-labelledby="routes-heading">` with `<h2 id="routes-heading">Routes</h2>`, two `<select>`s labelled "Day starts"/"Day ends" over `WINDOW_OPTIONS`, and for each of `APPOINTMENT_KINDS` an `<input type="number" step="0.25" min="0.25" max="12" name={`${kind.value}Hours`}>` labelled `` `${kind.label} length (hours)` `` defaulted to `hoursLabel(settings.minutes[kind.value])`, a solid `Button` "Save", `role="status"` "Saved." on ok, `role="alert"` on error. Controls use `min-h-11 w-full border border-rule bg-ivory px-4 py-3`.

`app/admin/settings/page.tsx` — add `getRouteSettings()` to the existing `Promise.all` and render `<RoutesSection settings={routeSettings} />` after `<TeamSection />`. (The install-calculator branch also adds a Settings section here; keep both on merge.)

- [ ] **Step 4: Focused tests, then the full suite once (`npx vitest run --maxWorkers=2`), typecheck, lint changed paths.**
- [ ] **Step 5: Commit** — `feat: route settings for the working day and default lengths`

---

### Task 3: Arrival window and length at booking

**Files:**
- Modify: `lib/admin/appointments.ts` (`Appointment`, `toAppointment`, `listAppointments`, `saveAppointment`, and the `returning` lists in `confirmAppointment`/`cancelAppointment`), `lib/admin/schema.ts` (`appointmentSchema`), `app/admin/jobs/appointment-actions.ts` (`bookAppointment`), `app/admin/jobs/[id]/ScheduleDialog.tsx`, `app/admin/jobs/[id]/AppointmentsCard.tsx`, `app/admin/jobs/[id]/page.tsx` (pass route settings), tests `tests/admin/appointments.test.ts`, `tests/admin/schema.test.ts`, `tests/admin/appointment-actions.test.ts`, `tests/admin/schedule-dialog.test.tsx`, `tests/admin/appointments-card.test.tsx`

**Interfaces:**
- Consumes: `clockField`, `hoursField` (Task 2), `WINDOW_OPTIONS`, `windowLabel`, `hoursLabel` (Task 2), `getRouteSettings` (Task 2).
- Produces:
  - `Appointment` gains `windowStart: string | null; windowEnd: string | null; durationMinutes: number | null`.
  - `export type AppointmentTiming = { windowStart: string | null; windowEnd: string | null; durationMinutes: number | null }`.
  - `saveAppointment(jobId, kind, startsAt, allDay, timing: AppointmentTiming, actor): Promise<SaveResult>` — **new 5th parameter**; actor moves to 6th.
  - `appointmentSchema` output gains `windowStart`, `windowEnd`, `durationMinutes`.
  - `ScheduleDialog` props gain `windowStart?: string | null; windowEnd?: string | null; durationMinutes?: number | null; defaultMinutes: Record<AppointmentKind, number>`.

- [ ] **Step 1: Write the failing tests**

`tests/admin/schema.test.ts`:
```ts
describe("appointmentSchema timing", () => {
  const base = { kind: "install", startsAt: "2026-09-24T09:00", allDay: false };

  it("stores 'Any time' as no window", () => {
    const out = appointmentSchema.parse({ ...base, windowStart: "", windowEnd: "", hours: "4" });
    expect(out).toMatchObject({ windowStart: null, windowEnd: null, durationMinutes: 240 });
  });

  it("stores a window in 30-minute steps", () => {
    const out = appointmentSchema.parse({ ...base, windowStart: "08:00", windowEnd: "10:00", hours: "1.5" });
    expect(out).toMatchObject({ windowStart: "08:00", windowEnd: "10:00", durationMinutes: 90 });
  });

  it("needs both ends, in order", () => {
    expect(appointmentSchema.safeParse({ ...base, windowStart: "08:00", windowEnd: "", hours: "1" }).error!.issues[0].message)
      .toBe("Pick both ends of the arrival window, or Any time");
    expect(appointmentSchema.safeParse({ ...base, windowStart: "10:00", windowEnd: "08:00", hours: "1" }).error!.issues[0].message)
      .toBe("The window must end after it starts");
  });

  it("leaves the length unset when blank, so the kind's default applies", () => {
    expect(appointmentSchema.parse({ ...base, windowStart: "", windowEnd: "", hours: "" }).durationMinutes).toBeNull();
  });

  it("rejects lengths outside quarter hours between 0.25 and 12", () => {
    expect(appointmentSchema.safeParse({ ...base, windowStart: "", windowEnd: "", hours: "13" }).success).toBe(false);
  });
});
```

`tests/admin/appointments.test.ts` — extend: `saveAppointment(JOB, "install", STARTS, false, { windowStart: "08:00", windowEnd: "10:00", durationMinutes: 240 }, ACTOR)` emits SQL containing `window_start, window_end, duration_minutes`, casts `?::time`, and in the `on conflict … do update set` includes `window_start = excluded.window_start, window_end = excluded.window_end, duration_minutes = excluded.duration_minutes` alongside the existing `confirmed_at = null` (a timing change resets confirmation). `toAppointment` maps `window_start: "08:00:00"` → `"08:00"`, `duration_minutes: 240`, and absent columns → `null`. `listAppointments` selects the three columns as `window_start::text`/`window_end::text`.

`tests/admin/appointment-actions.test.ts` — change the existing expectation to
```ts
expect(appointments.saveAppointment).toHaveBeenCalledWith(
  JOB, "consultation", STARTS, false, { windowStart: null, windowEnd: null, durationMinutes: null }, "owner@example.com",
);
```
and add: `booking({ windowStart: "08:00", windowEnd: "10:00", hours: "1.5" })` passes `{ windowStart: "08:00", windowEnd: "10:00", durationMinutes: 90 }`; a half window returns the zod error with `values` echoing `windowStart`.

`tests/admin/schedule-dialog.test.tsx` — the form has "Arrival window" (a group with two selects labelled "From"/"To", each with a first option "Any time"), and "Length (hours)" pre-filled from `defaultMinutes` for the selected kind (`4` for Install); choosing the Measure radio changes the pre-fill to `1` **only while the owner has not typed a length**; a reschedule dialog with `durationMinutes={90}` shows `1.5`.

`tests/admin/appointments-card.test.tsx` — a row with `windowStart "08:00"`, `windowEnd "10:00"` shows "Arrives 8:00 – 10:00 am"; with `durationMinutes 240` shows "4 h"; the Reschedule dialog receives the window and length.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`lib/admin/schema.ts` — replace `appointmentSchema`:
```ts
const optionalClock = z.preprocess(blank, clockField.optional());
const optionalHours = z.preprocess(blank, hoursField.optional());

export const appointmentSchema = z
  .object({
    kind: z.enum(APPOINTMENT_KIND_VALUES, { error: "Pick what this is for" }),
    startsAt: z.string({ error: "Pick a date and time" }).refine(isValidLocalInput, "Pick a date and time"),
    allDay: z.boolean().default(false),
    windowStart: optionalClock,
    windowEnd: optionalClock,
    hours: optionalHours,
  })
  .refine((v) => Boolean(v.windowStart) === Boolean(v.windowEnd), {
    message: "Pick both ends of the arrival window, or Any time", path: ["windowEnd"],
  })
  .refine((v) => !v.windowStart || !v.windowEnd || v.windowStart < v.windowEnd, {
    message: "The window must end after it starts", path: ["windowEnd"],
  })
  .transform((value) => ({
    kind: value.kind,
    startsAt: fromLocalInput(value.startsAt),
    allDay: value.allDay,
    windowStart: value.windowStart ?? null,
    windowEnd: value.windowEnd ?? null,
    durationMinutes: value.hours ?? null,
  }));
```
(`blank` already exists in this file and turns `""` into `undefined`; `clockField`/`hoursField` must be declared above this schema — move them up from Task 2's position if needed.)

`lib/admin/appointments.ts`:
```ts
export type AppointmentTiming = { windowStart: string | null; windowEnd: string | null; durationMinutes: number | null };

export type Appointment = {
  id: string; jobId: string; kind: AppointmentKind; startsAt: Date; allDay: boolean;
  confirmedAt: Date | null; confirmedBy: string | null;
} & AppointmentTiming;

const clock = (value: unknown): string | null => (typeof value === "string" ? value.slice(0, 5) : null);

function toAppointment(row: Record<string, unknown>): Appointment {
  return {
    id: row.id as string,
    jobId: row.lead_id as string,
    kind: row.kind as AppointmentKind,
    startsAt: new Date(row.starts_at as string | Date),
    allDay: row.all_day === true,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string | Date) : null,
    confirmedBy: (row.confirmed_by as string | null) ?? null,
    windowStart: clock(row.window_start),
    windowEnd: clock(row.window_end),
    durationMinutes: typeof row.duration_minutes === "number" ? row.duration_minutes : null,
  };
}

const COLUMNS_NOTE = "window_start::text as window_start, window_end::text as window_end, duration_minutes";
```
Every `select`/`returning` column list in this file (`listAppointments`, `confirmAppointment` both the CTE `returning` and the outer `select c.…`, `cancelAppointment`) gains `window_start::text as window_start, window_end::text as window_end, duration_minutes` (in the outer select of `confirmAppointment`, `c.window_start, c.window_end, c.duration_minutes`, since the CTE already cast them). Write the columns literally in each tagged template — `COLUMNS_NOTE` is only a comment aid; a tagged template cannot interpolate SQL text, so do not interpolate it.

`saveAppointment` signature and SQL:
```ts
export async function saveAppointment(
  jobId: string, kind: AppointmentKind, startsAt: Date, allDay: boolean, timing: AppointmentTiming, actor: string,
): Promise<SaveResult> {
  // …bodies unchanged…
    saved as (
      insert into appointments (lead_id, kind, starts_at, all_day, window_start, window_end, duration_minutes, confirmed_at, confirmed_by)
      select id, ${kind}, ${startsAt}::timestamptz, ${allDay}::boolean,
             ${timing.windowStart}::time, ${timing.windowEnd}::time, ${timing.durationMinutes}::integer, null, null
        from target
      on conflict (lead_id, kind) do update set
        starts_at = excluded.starts_at, all_day = excluded.all_day,
        window_start = excluded.window_start, window_end = excluded.window_end,
        duration_minutes = excluded.duration_minutes,
        confirmed_at = null, confirmed_by = null, updated_at = now()
      returning id
    ),
```

`app/admin/jobs/appointment-actions.ts` — `bookAppointment`:
```ts
const values = captureValues(formData, ["kind", "startsAt", "allDay", "windowStart", "windowEnd", "hours"]);
const parsed = appointmentSchema.safeParse({
  kind: formData.get("kind") ?? "",
  startsAt: formData.get("startsAt") ?? "",
  allDay: formData.get("allDay") === "on",
  windowStart: formData.get("windowStart") ?? "",
  windowEnd: formData.get("windowEnd") ?? "",
  hours: formData.get("hours") ?? "",
});
if (!parsed.success) return { error: parsed.error.issues[0].message, values };
const { kind, startsAt, allDay, windowStart, windowEnd, durationMinutes } = parsed.data;
const saved = await saveAppointment(jobId, kind, startsAt, allDay, { windowStart, windowEnd, durationMinutes }, email);
```
(and use `kind` in the `after` call).

`ScheduleDialog.tsx` — below "All day", add:
```tsx
<fieldset className="flex flex-col gap-2">
  <legend className="mb-2">Arrival window</legend>
  <div className="grid grid-cols-2 gap-2">
    <label htmlFor={`windowStart-${uid}`} className="flex flex-col gap-1">From
      <select id={`windowStart-${uid}`} name="windowStart" className={CONTROL} defaultValue={windowStart ?? ""}>
        <option value="">Any time</option>
        {WINDOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
    <label htmlFor={`windowEnd-${uid}`} className="flex flex-col gap-1">To
      <select id={`windowEnd-${uid}`} name="windowEnd" className={CONTROL} defaultValue={windowEnd ?? ""}>
        <option value="">Any time</option>
        {WINDOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  </div>
</fieldset>
<label htmlFor={`hours-${uid}`} className="flex flex-col gap-2">
  Length (hours)
  <input id={`hours-${uid}`} name="hours" type="number" step="0.25" min="0.25" max="12" inputMode="decimal"
    className={CONTROL} value={hours} onChange={(e) => { setHours(e.target.value); setTouched(true); }} />
</label>
```
State: `const [selectedKind, setSelectedKind] = useState(kind); const [touched, setTouched] = useState(durationMinutes != null); const [hours, setHours] = useState(hoursLabel(durationMinutes ?? defaultMinutes[kind]));` and each kind radio gets `onChange={() => { setSelectedKind(option.value); if (!touched) setHours(hoursLabel(defaultMinutes[option.value])); }}`. (The `<details>` no-JS fallback renders the same `fields`, so it gets the input too; without JS the value is the server-rendered default.)

`AppointmentsCard.tsx` — `AppointmentsCard` gains prop `defaultMinutes: Record<AppointmentKind, number>` and passes it to every `ScheduleDialog`. In `Row`, after the `when` span:
```tsx
{windowLabel(appointment.windowStart, appointment.windowEnd)
  ? <span className="text-xs text-ink-soft">Arrives {windowLabel(appointment.windowStart, appointment.windowEnd)}</span> : null}
{appointment.durationMinutes ? <span className="text-xs text-ink-soft">{hoursLabel(appointment.durationMinutes)} h</span> : null}
```
and the Reschedule `ScheduleDialog` receives `windowStart`, `windowEnd`, `durationMinutes`.

`app/admin/jobs/[id]/page.tsx` — load `getRouteSettings()` in the page's existing parallel loads and pass `defaultMinutes={routeSettings.minutes}` to `AppointmentsCard` and to the header's `ScheduleDialog`. `grep -rn "<ScheduleDialog" app` and update every call site (including `JobHeader.tsx`) so the required prop is always given; fix the page tests' mocks by adding `vi.mock("@/lib/routes/settings", …)` wherever the page is rendered (`tests/admin/job-page*.test.tsx`).

- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths.**
- [ ] **Step 5: Commit** — `feat: arrival window and length when booking an appointment`

---

### Task 4: The window in the confirmation email

**Files:**
- Modify: `lib/appointments/send.ts`, `tests/appointments/send.test.ts`

**Interfaces:**
- Consumes: `emailWindowLine` (Task 2), `Appointment.windowStart/windowEnd` (Task 3).
- Produces: `AppointmentEmailInput` gains `windowStart: string | null; windowEnd: string | null`.

- [ ] **Step 1: Write the failing tests** in `tests/appointments/send.test.ts`:
```ts
it("says when we'll arrive when a window is set", () => {
  const text = appointmentEmailText({ ...input, allDay: true, windowStart: "08:00", windowEnd: "10:00" });
  expect(text).toContain("We'll arrive between 8:00 and 10:00 am.");
  expect(text.indexOf("We'll arrive")).toBeGreaterThan(text.indexOf("is booked for"));
  expect(text.indexOf("We'll arrive")).toBeLessThan(text.indexOf("We'll come to"));
});

it("adds nothing new without a window", () => {
  const text = appointmentEmailText({ ...input, windowStart: null, windowEnd: null });
  expect(text).not.toContain("arrive");
});
```
and `sendAppointmentConfirmation` passes the appointment's window through (assert the mocked Resend `text` contains the line). Update the file's shared `input` fixture with `windowStart: null, windowEnd: null`.

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — in `appointmentEmailText`:
```ts
const arrival = emailWindowLine(input.windowStart, input.windowEnd);
return [
  `Hi ${input.firstName},`,
  "",
  `Your ${KIND_WORDS[input.kind]} is booked for ${when}.`,
  ...(arrival ? ["", arrival] : []),
  "",
  `We'll come to ${input.address}.`,
  // …rest unchanged
].join("\n");
```
and in `sendAppointmentConfirmation` pass `windowStart: appointment.windowStart, windowEnd: appointment.windowEnd`.
- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths.**
- [ ] **Step 5: Commit** — `feat: the arrival window in the appointment email`

---

### Task 5: Geocoding and editable addresses

**Files:**
- Create: `lib/routes/geocode.ts`, `scripts/geocode-backfill.mjs`, `tests/routes/planner/geocode.test.ts`
- Modify: `lib/admin/jobs.ts` (`updateDetails` returns address change), `lib/admin/schema.ts` (`detailsSchema` gains `address`, `city`), `app/admin/jobs/actions.ts` (`createJobAction`/whatever calls `createJob`, and `saveDetails`), `app/admin/jobs/[id]/DetailsForm.tsx`, `app/api/consultation/route.ts`, `lib/leads/questionnaire.ts` (`saveQuestionnaire` returns the lead id), `app/(site)/thank-you/actions.ts`, `.env.example`; tests `tests/admin/jobs.test.ts`, `tests/admin/actions.test.ts`, `tests/admin/details-form.test.tsx`, `tests/admin/schema.test.ts`, `tests/leads/route.test.ts`, `tests/leads/questionnaire.test.ts`, `tests/leads/questionnaire-action.test.ts`

**Interfaces (Produces):**
```ts
// lib/routes/geocode.ts
export type GeocodeResult = { status: "ok"; lat: number; lng: number } | { status: "not_found" } | { status: "error" };
export function geocodeQuery(address: string, city: string): string            // "12 Sample St, Henderson, NV"
export async function geocodeAddress(address: string | null, city: string): Promise<GeocodeResult>
export async function geocodeLead(id: string): Promise<void>                    // never throws
```
- `updateDetails(id, input, actor): Promise<{ saved: boolean; addressChanged: boolean }>` — **return type changes**; update `saveDetails` accordingly.
- `saveQuestionnaire(key, a): Promise<string | null>` — the lead id, or null. `submitQuestionnaire`'s `if (!saved)` still works.
- `DetailsInput` gains `address: string | null; city: string`.

- [ ] **Step 1: Write the failing tests**

`tests/routes/planner/geocode.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sql = Object.assign(vi.fn(), { query: vi.fn() });
vi.mock("@/lib/db", () => ({ db: () => sql }));
const { geocodeAddress, geocodeLead, geocodeQuery } = await import("@/lib/routes/geocode");
const text = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");
const ID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  sql.mockReset().mockResolvedValue([]);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GOOGLE_GEOCODING_KEY", "server-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("geocodeAddress", () => {
  it("asks Google for the Nevada address, restricted to the US", async () => {
    fetchMock.mockResolvedValue(json({ status: "OK", results: [{ geometry: { location: { lat: 36.03, lng: -115.04 } } }] }));
    expect(await geocodeAddress("12 Sample St", "Henderson")).toEqual({ status: "ok", lat: 36.03, lng: -115.04 });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    expect(url.searchParams.get("address")).toBe("12 Sample St, Henderson, NV");
    expect(url.searchParams.get("components")).toBe("country:US");
    expect(url.searchParams.get("key")).toBe("server-key");
  });

  it("reports zero results as not found", async () => {
    fetchMock.mockResolvedValue(json({ status: "ZERO_RESULTS", results: [] }));
    expect(await geocodeAddress("nowhere", "Henderson")).toEqual({ status: "not_found" });
  });

  it("reports quota, denial, network failure and missing config as errors", async () => {
    fetchMock.mockResolvedValueOnce(json({ status: "OVER_QUERY_LIMIT", results: [] }));
    expect(await geocodeAddress("12 Sample St", "Henderson")).toEqual({ status: "error" });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await geocodeAddress("12 Sample St", "Henderson")).toEqual({ status: "error" });
    vi.stubEnv("GOOGLE_GEOCODING_KEY", "");
    expect(await geocodeAddress("12 Sample St", "Henderson")).toEqual({ status: "error" });
  });

  it("never geocodes a job with no street address to the city centre", async () => {
    expect(await geocodeAddress(null, "Henderson")).toEqual({ status: "not_found" });
    expect(await geocodeAddress("  ", "Henderson")).toEqual({ status: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds the query text", () => {
    expect(geocodeQuery(" 12 Sample St ", "Henderson")).toBe("12 Sample St, Henderson, NV");
  });
});

describe("geocodeLead", () => {
  it("stores coordinates only, never the address", async () => {
    sql.mockResolvedValueOnce([{ address: "12 Sample St", city: "Henderson" }]);
    fetchMock.mockResolvedValue(json({ status: "OK", results: [{ geometry: { location: { lat: 1, lng: 2 } } }] }));
    await geocodeLead(ID);
    const update = text(sql.mock.calls[1]);
    expect(update).toContain("update leads set lat = ?, lng = ?, geocode_status = ?, geocoded_at = now()");
    expect(update).not.toMatch(/address\s*=|city\s*=|updated_at/);
  });

  it("stamps not_found and error without coordinates", async () => {
    sql.mockResolvedValueOnce([{ address: null, city: "Henderson" }]);
    await geocodeLead(ID);
    expect(sql.mock.calls[1].slice(1)).toEqual([null, null, "not_found", ID]);
  });

  it("does nothing for a bad id or a missing job, and never throws", async () => {
    await geocodeLead("nope");
    expect(sql).not.toHaveBeenCalled();
    sql.mockRejectedValueOnce(new Error("db down"));
    await expect(geocodeLead(ID)).resolves.toBeUndefined();
  });
});
```

`tests/admin/jobs.test.ts` — `updateDetails` sets `address = ?` and `city = ?`, and its statement selects `(prev.address is distinct from ? or prev.city is distinct from ?) as address_changed` from a `prev` CTE read **before** the update; returns `{ saved: true, addressChanged: true }` for `[{ id: ID, address_changed: true }]` and `{ saved: false, addressChanged: false }` for `[]`.

`tests/admin/actions.test.ts` — mock `@/lib/routes/geocode` (`geocodeLead: vi.fn()`) and `next/server` `after` to run the callback: `saveDetails` calls `geocodeLead(id)` when `addressChanged` is true and **not** when false; the create-job action calls `geocodeLead(newId)`; a rejected `geocodeLead` never changes the action's result (`after` swallows — assert the action returns `{ ok: true }`/redirects as before even when `geocodeLead` is mocked to reject, by having the `after` mock `cb()?.catch?.(() => {})`).

`tests/admin/details-form.test.tsx` — "Address" and "City" text fields defaulted from the job.

`tests/admin/schema.test.ts` — `detailsSchema` accepts `address "12 Sample St"`, `city "Henderson"`; blank address → `null`; blank city → "Please choose your city" (whatever message `consultationSchema.shape.city` gives — copy it from `lib/leads/schema.ts`).

`tests/leads/route.test.ts` — mock `@/lib/routes/geocode` and `next/server`'s `after`: a stored lead schedules `geocodeLead(id)`; a failed insert schedules nothing.

`tests/leads/questionnaire.test.ts` — `saveQuestionnaire` resolves to `"e1"` instead of `true` for `[{ id: "e1" }]`, `null` for `[]`. The `insert … returning` must return `lead_id as id`. `tests/leads/questionnaire-action.test.ts` — when an address was given and the save returned an id, `after` schedules `geocodeLead(id)`; with no address it does not.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`lib/routes/geocode.ts`:
```ts
import "server-only";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/admin/jobs";

export type GeocodeResult = { status: "ok"; lat: number; lng: number } | { status: "not_found" } | { status: "error" };

const ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

export const geocodeQuery = (address: string, city: string): string => `${address.trim()}, ${city.trim()}, NV`;

export async function geocodeAddress(address: string | null, city: string): Promise<GeocodeResult> {
  if (!address?.trim()) return { status: "not_found" };
  const key = process.env.GOOGLE_GEOCODING_KEY;
  if (!key) {
    console.error("Geocoding skipped: GOOGLE_GEOCODING_KEY is not set");
    return { status: "error" };
  }
  const url = new URL(ENDPOINT);
  url.searchParams.set("address", geocodeQuery(address, city));
  url.searchParams.set("components", "country:US");
  url.searchParams.set("key", key);
  try {
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000), cache: "no-store" });
    const body = (await response.json()) as { status: string; results?: { geometry: { location: { lat: number; lng: number } } }[] };
    if (body.status === "OK" && body.results?.[0]) {
      const { lat, lng } = body.results[0].geometry.location;
      return { status: "ok", lat, lng };
    }
    if (body.status === "ZERO_RESULTS") return { status: "not_found" };
    console.error("Geocoding failed", body.status);
    return { status: "error" };
  } catch (error) {
    console.error("Geocoding failed", error);
    return { status: "error" };
  }
}

/** Looks the job's address up and stores only coordinates. Runs inside after(), so it never throws. */
export async function geocodeLead(id: string): Promise<void> {
  if (!isUuid(id)) return;
  try {
    const [lead] = await db()`select address, city from leads where id = ${id}`;
    if (!lead) return;
    const result = await geocodeAddress(lead.address as string | null, lead.city as string);
    const lat = result.status === "ok" ? result.lat : null;
    const lng = result.status === "ok" ? result.lng : null;
    await db()`update leads set lat = ${lat}, lng = ${lng}, geocode_status = ${result.status}, geocoded_at = now() where id = ${id}`;
  } catch (error) {
    console.error("Could not geocode job", id, error);
  }
}
```
`geocoded_at` is stamped on `error` too, so the spec's "the next build retries it" is done by `loadDay` (Task 8), which re-geocodes stops whose `geocode_status = 'error'`.

`lib/admin/schema.ts` — `detailsSchema` object gains `address: z.preprocess(blank, site.address)` and `city: site.city`, and the transform passes `address: rest.address ?? null`. (Move the `const site = consultationSchema.shape;` line above `detailsSchema`.)

`lib/admin/jobs.ts` — `updateDetails`:
```ts
export async function updateDetails(
  id: string, input: DetailsInput, actor: string,
): Promise<{ saved: boolean; addressChanged: boolean }> {
  if (!isUuid(id)) return { saved: false, addressChanged: false };
  const rows = await db()`
    with prev as (select address, city from leads where id = ${id}),
    changed as (
      update leads set
        address = ${input.address}, city = ${input.city},
        quote_cents = ${input.quoteCents},
        -- …the existing assignments unchanged…
        updated_at = now()
      where id = ${id}
      returning id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select id, ${actor}, 'edit', 'Updated job details' from changed
      returning id
    )
    select changed.id,
           (prev.address is distinct from ${input.address}::text or prev.city is distinct from ${input.city}::text) as address_changed
      from changed, prev`;
  return { saved: rows.length > 0, addressChanged: rows[0]?.address_changed === true };
}
```
(Do not put the `--` comment into the real SQL; it marks where existing lines stay.)

`app/admin/jobs/actions.ts` — `saveDetails` adds `"address", "city"` to `captureValues` and `address: formData.get("address") ?? "", city: formData.get("city") ?? ""` to the parse, then:
```ts
const { saved, addressChanged } = await updateDetails(id, parsed.data, email);
if (!saved) return MISSING;
if (addressChanged) after(() => geocodeLead(id));
```
In the action that calls `createJob` (find it with `grep -n "createJob(" app/admin/jobs/actions.ts`), right after `const id = await createJob(…)`: `after(() => geocodeLead(id));`.

`DetailsForm.tsx` — at the top of the grid: `<TextField id="address" name="address" label="Address" defaultValue={field("address", job.address ?? "")} />` and a City select mirroring the new-job form's city control (copy from `app/admin/jobs/new/` — `grep -rn "name=\"city\"" app/admin/jobs/new`).

`app/api/consultation/route.ts` — import `after` from `next/server` and `geocodeLead`; after the `Promise.allSettled`:
```ts
// Coordinates for the route planner. Never blocks or fails the visitor's request.
if (stored.status === "fulfilled") after(() => geocodeLead(stored.value.id));
```

`lib/leads/questionnaire.ts` — `saveQuestionnaire` returns `Promise<string | null>`; the final insert ends `returning lead_id as id` and the function returns `(rows[0]?.id as string | undefined) ?? null`. `app/(site)/thank-you/actions.ts`:
```ts
const saved = await saveQuestionnaire(key, parsed.data);
if (!saved) return { error: QUESTIONNAIRE_EXPIRED, values };
if (parsed.data.address) after(() => geocodeLead(saved));
```
Keep `after` outside the `try` so `redirect` is unaffected; declare `let savedId: string | null = null` before the try, assign inside, and call `after` after the try block.

`scripts/geocode-backfill.mjs` — same env loading as `scripts/migrate.mjs` (copy `loadEnv` and the `MIGRATE_DATABASE_URL` precedence, printing the host); reads `GOOGLE_GEOCODING_KEY` the same way; then:
```js
const rows = await sql`select id, address, city from leads where geocoded_at is null order by created_at`;
console.log(`${rows.length} jobs to geocode`);
let ok = 0, notFound = 0, failed = 0;
for (const row of rows) {
  let status = "not_found", lat = null, lng = null;
  if (row.address?.trim()) {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", `${row.address.trim()}, ${row.city.trim()}, NV`);
    url.searchParams.set("components", "country:US");
    url.searchParams.set("key", key);
    try {
      const body = await (await fetch(url, { signal: AbortSignal.timeout(15_000) })).json();
      if (body.status === "OK" && body.results[0]) ({ lat, lng } = body.results[0].geometry.location), (status = "ok");
      else if (body.status !== "ZERO_RESULTS") status = "error";
    } catch { status = "error"; }
  }
  await sql`update leads set lat = ${lat}, lng = ${lng}, geocode_status = ${status}, geocoded_at = now() where id = ${row.id}`;
  status === "ok" ? ok++ : status === "not_found" ? notFound++ : failed++;
  await new Promise((r) => setTimeout(r, 60));
}
console.log(`ok ${ok}, not found ${notFound}, errors ${failed}`);
```
The header comment says: "Run once after deploying migration 017: `node scripts/geocode-backfill.mjs`. Re-running only touches jobs never geocoded."

`.env.example` — add `GOOGLE_GEOCODING_KEY=`, `GOOGLE_CLOUD_PROJECT_ID=`, `GOOGLE_SERVICE_ACCOUNT_JSON=`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY=`, `NEXT_PUBLIC_GOOGLE_MAP_ID=`.

- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths.**
- [ ] **Step 5: Commit** — `feat: geocode job addresses, and edit a job's address`

---

### Task 6: Talking to Route Optimization — auth, request, response

**Files:**
- Create: `lib/routes/google-auth.ts`, `lib/routes/optimize-request.ts`, `lib/routes/optimize-response.ts`, `lib/routes/optimize.ts`, `tests/routes/planner/optimize-request.test.ts`, `tests/routes/planner/optimize-response.test.ts`, `tests/routes/planner/optimize.test.ts`
- Modify: `package.json` (`npm install google-auth-library`)

**Interfaces:**
- Consumes: `DayStop`, `Installer`, `RouteSettings`, `RoutePlan`, `PlanRoute` (Task 2 types), `fromLocalInput` (`lib/admin/time.ts`).
- Produces:
```ts
// lib/routes/optimize-request.ts  (pure; no server-only so tests import it directly)
export type OptimizeInput = { day: string; stops: DayStop[]; installers: Installer[]; settings: RouteSettings };
export function buildOptimizeRequest(input: OptimizeInput): { body: OptimizeToursRequest; shipments: string[]; vehicles: string[] };
export function buildRecheckRequest(input: OptimizeInput, routes: { teamMemberId: string; appointmentIds: string[] }[]): { body: OptimizeToursRequest; shipments: string[]; vehicles: string[] };
export function windowFor(stop: DayStop, day: string, settings: RouteSettings): { start: string; end: string };
export type OptimizeToursRequest = Record<string, unknown>;

// lib/routes/optimize-response.ts  (pure)
export function parseOptimizeResponse(
  response: OptimizeToursResponse, ctx: { day: string; builtAt: string; shipments: string[]; vehicles: string[]; stops: DayStop[]; settings: RouteSettings },
): RoutePlan;
export function reasonText(code: string | undefined): string;
export const durationSeconds: (value: string | undefined) => number;

// lib/routes/google-auth.ts
export async function routeAccessToken(): Promise<string>;

// lib/routes/optimize.ts
export class RoutePlanningUnavailable extends Error {}
export function routePlanningConfigured(): boolean;
export async function optimizeTours(body: OptimizeToursRequest): Promise<OptimizeToursResponse>; // throws RoutePlanningUnavailable
```
`shipments[i]` is the appointment id of shipment `i`; `vehicles[j]` the team member id of vehicle `j`. Labels are set too (`label: appointmentId`, `label: teamMemberId`).

- [ ] **Step 1: Write the failing tests**

`tests/routes/planner/optimize-request.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildOptimizeRequest, buildRecheckRequest, windowFor } from "@/lib/routes/optimize-request";
import type { DayStop, RouteSettings } from "@/lib/routes/types";

const DAY = "2026-09-24"; // a Thursday in PDT (UTC-7)
const SETTINGS: RouteSettings = { dayStart: "09:00", dayEnd: "18:00", minutes: { consultation: 60, measure: 60, install: 240, service: 90 } };
const ANA = { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Ana" };
const BO = { id: "bbbbbbbb-0000-4000-8000-000000000002", name: "Bo" };
const stop = (over: Partial<DayStop>): DayStop => ({
  appointmentId: "11111111-0000-4000-8000-000000000001", jobId: "j1", name: "Dana", address: "12 Sample St", city: "Henderson",
  kind: "install", startsAt: "2026-09-24T16:00:00.000Z", allDay: true, confirmed: true,
  windowStart: null, windowEnd: null, durationMinutes: 240, lat: 36.03, lng: -115.04, assignedTo: null,
  updatedAt: "2026-09-20T00:00:00.000Z", ...over,
});

describe("buildOptimizeRequest", () => {
  it("makes one delivery per appointment at the job's coordinates, with its length", () => {
    const { body, shipments } = buildOptimizeRequest({ day: DAY, stops: [stop({})], installers: [ANA, BO], settings: SETTINGS });
    const model = body.model as any;
    expect(shipments).toEqual(["11111111-0000-4000-8000-000000000001"]);
    expect(model.shipments[0]).toMatchObject({
      label: "11111111-0000-4000-8000-000000000001",
      deliveries: [{ arrivalLocation: { latitude: 36.03, longitude: -115.04 }, duration: "14400s" }],
    });
  });

  it("uses the promised window, or the working day when there is none", () => {
    expect(windowFor(stop({ windowStart: "08:00", windowEnd: "10:00" }), DAY, SETTINGS))
      .toEqual({ start: "2026-09-24T15:00:00.000Z", end: "2026-09-24T17:00:00.000Z" });
    expect(windowFor(stop({}), DAY, SETTINGS))
      .toEqual({ start: "2026-09-24T16:00:00.000Z", end: "2026-09-25T01:00:00.000Z" });
    const { body } = buildOptimizeRequest({ day: DAY, stops: [stop({ windowStart: "08:00", windowEnd: "10:00" })], installers: [ANA], settings: SETTINGS });
    expect((body.model as any).shipments[0].deliveries[0].timeWindows)
      .toEqual([{ startTime: "2026-09-24T15:00:00.000Z", endTime: "2026-09-24T17:00:00.000Z" }]);
  });

  it("keeps a job with its assigned installer only when that installer is selected", () => {
    const locked = buildOptimizeRequest({ day: DAY, stops: [stop({ assignedTo: BO.id })], installers: [ANA, BO], settings: SETTINGS });
    expect((locked.body.model as any).shipments[0].allowedVehicleIndices).toEqual([1]);
    const free = buildOptimizeRequest({ day: DAY, stops: [stop({ assignedTo: BO.id })], installers: [ANA], settings: SETTINGS });
    expect((free.body.model as any).shipments[0].allowedVehicleIndices).toBeUndefined();
    const designer = buildOptimizeRequest({ day: DAY, stops: [stop({ assignedTo: "someone-else" })], installers: [ANA], settings: SETTINGS });
    expect((designer.body.model as any).shipments[0].allowedVehicleIndices).toBeUndefined();
  });

  it("adds one vehicle per selected installer, with no start or end location, the working day, and a travel cost", () => {
    const { body, vehicles } = buildOptimizeRequest({ day: DAY, stops: [stop({})], installers: [ANA, BO], settings: SETTINGS });
    const model = body.model as any;
    expect(vehicles).toEqual([ANA.id, BO.id]);
    expect(model.vehicles).toHaveLength(2);
    for (const vehicle of model.vehicles) {
      expect(vehicle.startLocation).toBeUndefined();
      expect(vehicle.endLocation).toBeUndefined();
      expect(vehicle.startTimeWindows).toEqual([{ startTime: "2026-09-24T16:00:00.000Z", endTime: "2026-09-25T01:00:00.000Z" }]);
      expect(vehicle.endTimeWindows).toEqual([{ startTime: "2026-09-24T16:00:00.000Z", endTime: "2026-09-25T01:00:00.000Z" }]);
      expect(vehicle.costPerTraveledHour).toBe(60);
      expect(vehicle.costPerHour).toBeUndefined();
      expect(vehicle.travelMode).toBe("DRIVING");
    }
    expect(model.globalStartTime).toBe("2026-09-24T16:00:00.000Z");
    expect(model.globalEndTime).toBe("2026-09-25T01:00:00.000Z");
  });

  it("widens the global range to cover a window outside the working day", () => {
    const { body } = buildOptimizeRequest({ day: DAY, stops: [stop({ windowStart: "07:00", windowEnd: "08:00" })], installers: [ANA], settings: SETTINGS });
    expect((body.model as any).globalStartTime).toBe("2026-09-24T14:00:00.000Z");
  });

  it("solves normally, without traffic, with polylines and a 15 s timeout, skipping stops with no coordinates", () => {
    const { body, shipments } = buildOptimizeRequest({
      day: DAY, stops: [stop({}), stop({ appointmentId: "no-coords", lat: null, lng: null })], installers: [ANA], settings: SETTINGS,
    });
    expect(shipments).toEqual(["11111111-0000-4000-8000-000000000001"]);
    expect(body).toMatchObject({ solvingMode: "DEFAULT_SOLVE", considerRoadTraffic: false, populatePolylines: true, timeout: "15s" });
  });

  it("uses Las Vegas winter time after the clocks change", () => {
    expect(windowFor(stop({}), "2026-12-03", SETTINGS).start).toBe("2026-12-03T17:00:00.000Z");
  });
});

describe("buildRecheckRequest", () => {
  const stops = [
    stop({ appointmentId: "s1", windowStart: "08:00", windowEnd: "10:00" }),
    stop({ appointmentId: "s2" }),
    stop({ appointmentId: "s3" }),
  ];

  it("fixes each installer's order and assignment and lets Google recompute only the times", () => {
    const { body, shipments, vehicles } = buildRecheckRequest(
      { day: DAY, stops, installers: [ANA, BO], settings: SETTINGS },
      [{ teamMemberId: ANA.id, appointmentIds: ["s2", "s1"] }, { teamMemberId: BO.id, appointmentIds: ["s3"] }],
    );
    expect(shipments).toEqual(["s1", "s2", "s3"]);
    expect(vehicles).toEqual([ANA.id, BO.id]);
    expect(body.solvingMode).toBe("DEFAULT_SOLVE");
    expect(body.injectedFirstSolutionRoutes).toBeUndefined();
    expect(body.injectedSolutionConstraint).toEqual({
      routes: [
        { vehicleIndex: 0, visits: [{ shipmentIndex: 1, isPickup: false }, { shipmentIndex: 0, isPickup: false }] },
        { vehicleIndex: 1, visits: [{ shipmentIndex: 2, isPickup: false }] },
      ],
      constraintRelaxations: [{
        relaxations: [{ level: "RELAX_VISIT_TIMES_AFTER_THRESHOLD", thresholdVisitCount: 0 }],
        vehicleIndices: [0, 1],
      }],
    });
    expect(body.considerRoadTraffic).toBe(false);
  });

  it("sends windows as soft, so a broken window comes back as a time instead of a skipped stop", () => {
    const { body } = buildRecheckRequest(
      { day: DAY, stops, installers: [ANA, BO], settings: SETTINGS },
      [{ teamMemberId: ANA.id, appointmentIds: ["s1", "s2"] }, { teamMemberId: BO.id, appointmentIds: ["s3"] }],
    );
    const tw = (body.model as any).shipments[0].deliveries[0].timeWindows[0];
    expect(tw.startTime).toBeUndefined();
    expect(tw).toMatchObject({
      softStartTime: "2026-09-24T15:00:00.000Z", softEndTime: "2026-09-24T17:00:00.000Z",
      costPerHourBeforeSoftStartTime: 1000, costPerHourAfterSoftEndTime: 1000,
    });
  });

  it("leaves out stops that are not on any route (they stay under Didn't fit)", () => {
    const { shipments } = buildRecheckRequest(
      { day: DAY, stops, installers: [ANA, BO], settings: SETTINGS },
      [{ teamMemberId: ANA.id, appointmentIds: ["s1"] }, { teamMemberId: BO.id, appointmentIds: [] }],
    );
    expect(shipments).toEqual(["s1"]);
  });
});
```

`tests/routes/planner/optimize-response.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { durationSeconds, parseOptimizeResponse, reasonText } from "@/lib/routes/optimize-response";
import type { DayStop, RouteSettings } from "@/lib/routes/types";

const SETTINGS: RouteSettings = { dayStart: "09:00", dayEnd: "18:00", minutes: { consultation: 60, measure: 60, install: 240, service: 90 } };
const base = { appointmentId: "", jobId: "j", name: "n", address: "a", city: "c", kind: "install", startsAt: "", allDay: true,
  confirmed: true, windowStart: null, windowEnd: null, durationMinutes: 60, lat: 1, lng: 1, assignedTo: null, updatedAt: "" } as DayStop;
const stops: DayStop[] = [
  { ...base, appointmentId: "s1", windowStart: "08:00", windowEnd: "10:00" },
  { ...base, appointmentId: "s2" },
  { ...base, appointmentId: "s3" },
];
const ctx = { day: "2026-09-24", builtAt: "2026-09-23T20:00:00.000Z", shipments: ["s1", "s2", "s3"], vehicles: ["ana", "bo"], stops, settings: SETTINGS };

describe("parseOptimizeResponse", () => {
  it("returns each installer's stops in visit order with arrivals and drive minutes", () => {
    const plan = parseOptimizeResponse({
      routes: [
        {
          vehicleIndex: 0,
          visits: [{ shipmentIndex: 1, startTime: "2026-09-24T16:00:00Z" }, { shipmentIndex: 0, startTime: "2026-09-24T17:25:00Z" }],
          transitions: [{ travelDuration: "0s" }, { travelDuration: "1500s" }, {}],
          routePolyline: { points: "abc" },
          metrics: { travelDuration: "1500s" },
        },
        { vehicleIndex: 1 },
      ],
    }, ctx);
    expect(plan.day).toBe("2026-09-24");
    expect(plan.builtAt).toBe(ctx.builtAt);
    expect(plan.routes).toEqual([
      { teamMemberId: "ana", polyline: "abc", driveMinutes: 25, stops: [
        { appointmentId: "s2", arrival: "2026-09-24T16:00:00.000Z", driveMinutes: 0, outsideWindow: false },
        { appointmentId: "s1", arrival: "2026-09-24T17:25:00.000Z", driveMinutes: 25, outsideWindow: true },
      ] },
      { teamMemberId: "bo", polyline: null, driveMinutes: 0, stops: [] },
    ]);
  });

  it("gives every vehicle a route even when Google omits an empty one, and treats a missing index as 0", () => {
    const plan = parseOptimizeResponse({ routes: [{ visits: [{ startTime: "2026-09-24T16:00:00Z" }] }] }, ctx);
    expect(plan.routes.map((r) => r.teamMemberId)).toEqual(["ana", "bo"]);
    expect(plan.routes[0].stops[0].appointmentId).toBe("s1");
  });

  it("lists skipped appointments with the reason in plain English", () => {
    const plan = parseOptimizeResponse({
      skippedShipments: [
        { index: 2, reasons: [{ code: "CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TIME_WINDOWS" }] },
        { reasons: [] },
      ],
    }, ctx);
    expect(plan.skipped).toEqual([
      { appointmentId: "s3", reason: "It can't be reached within anyone's working day." },
      { appointmentId: "s1", reason: "It didn't fit around the other stops and their windows." },
    ]);
  });

  it("maps every documented reason code", () => {
    expect(reasonText("NO_VEHICLE")).toBe("No installer was selected for this day.");
    expect(reasonText("VEHICLE_NOT_ALLOWED")).toBe("It is assigned to an installer who can't fit it in.");
    expect(reasonText("SOMETHING_NEW")).toBe("It didn't fit around the other stops and their windows.");
  });

  it("reads protobuf durations", () => {
    expect(durationSeconds("5400s")).toBe(5400);
    expect(durationSeconds("12.5s")).toBe(12.5);
    expect(durationSeconds(undefined)).toBe(0);
  });
});
```

`tests/routes/planner/optimize.test.ts` — mock `@/lib/routes/google-auth` (`routeAccessToken` resolves `"tok"`), stub `fetch`:
- `routePlanningConfigured()` is false without `GOOGLE_CLOUD_PROJECT_ID` or `GOOGLE_SERVICE_ACCOUNT_JSON`, true with both, and true with only `ROUTE_OPTIMIZATION_URL` + `ROUTE_OPTIMIZATION_TOKEN`.
- `optimizeTours(body)` posts JSON to `https://routeoptimization.googleapis.com/v1/projects/pss-proj:optimizeTours` with `authorization: Bearer tok`, `content-type: application/json`, and an `AbortSignal`.
- with `ROUTE_OPTIMIZATION_URL=http://127.0.0.1:3199/optimize` and `ROUTE_OPTIMIZATION_TOKEN=test`, it posts there with `Bearer test` and never calls `routeAccessToken`.
- a non-2xx response, a thrown fetch (timeout), a token failure, and missing config each reject with `RoutePlanningUnavailable` (`await expect(...).rejects.toBeInstanceOf(RoutePlanningUnavailable)`), logging the Google message with `console.error`.

`lib/routes/google-auth.ts` is a thin wrapper and is covered through `optimize.test.ts`'s mock plus one test in the same file with `vi.mock("google-auth-library", () => ({ GoogleAuth: vi.fn(function (opts) { this.opts = opts; this.getAccessToken = async () => "abc"; }) }))` asserting the constructor gets `{ credentials: JSON.parse(env), scopes: ["https://www.googleapis.com/auth/cloud-platform"] }` and the result is `"abc"`; and that invalid JSON rejects with "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON".

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`npm install google-auth-library`.

`lib/routes/optimize-request.ts`:
```ts
import { fromLocalInput } from "@/lib/admin/time";
import type { DayStop, Installer, RouteSettings } from "./types";

export type OptimizeToursRequest = Record<string, unknown>;
export type OptimizeInput = { day: string; stops: DayStop[]; installers: Installer[]; settings: RouteSettings };

/** A soft window this expensive is only broken when the owner's order leaves no other way. */
const LATE_COST_PER_HOUR = 1000;
const TRAVEL_COST_PER_HOUR = 60;

const at = (day: string, clock: string): string => fromLocalInput(`${day}T${clock}`).toISOString();

export function windowFor(stop: DayStop, day: string, settings: RouteSettings): { start: string; end: string } {
  return stop.windowStart && stop.windowEnd
    ? { start: at(day, stop.windowStart), end: at(day, stop.windowEnd) }
    : { start: at(day, settings.dayStart), end: at(day, settings.dayEnd) };
}

const routable = (stops: DayStop[]) => stops.filter((s) => s.lat !== null && s.lng !== null);

function model(input: OptimizeInput, stops: DayStop[], soft: boolean) {
  const { day, installers, settings } = input;
  const dayStart = at(day, settings.dayStart);
  const dayEnd = at(day, settings.dayEnd);
  const windows = stops.map((s) => windowFor(s, day, settings));
  const globalStartTime = [dayStart, ...windows.map((w) => w.start)].sort()[0];
  const globalEndTime = [dayEnd, ...windows.map((w) => w.end)].sort().at(-1)!;
  const shipments = stops.map((stop, i) => {
    const lockedTo = stop.assignedTo ? installers.findIndex((it) => it.id === stop.assignedTo) : -1;
    const timeWindow = soft
      ? { softStartTime: windows[i].start, softEndTime: windows[i].end,
          costPerHourBeforeSoftStartTime: LATE_COST_PER_HOUR, costPerHourAfterSoftEndTime: LATE_COST_PER_HOUR }
      : { startTime: windows[i].start, endTime: windows[i].end };
    return {
      label: stop.appointmentId,
      deliveries: [{
        arrivalLocation: { latitude: stop.lat, longitude: stop.lng },
        duration: `${stop.durationMinutes * 60}s`,
        timeWindows: [timeWindow],
      }],
      ...(lockedTo >= 0 && !soft ? { allowedVehicleIndices: [lockedTo] } : {}),
    };
  });
  const vehicles = installers.map((installer) => ({
    label: installer.id,
    travelMode: "DRIVING",
    startTimeWindows: [{ startTime: dayStart, endTime: dayEnd }],
    endTimeWindows: [{ startTime: dayStart, endTime: dayEnd }],
    costPerTraveledHour: TRAVEL_COST_PER_HOUR,
  }));
  return { globalStartTime, globalEndTime, shipments, vehicles };
}

const COMMON = { considerRoadTraffic: false, populatePolylines: true, timeout: "15s" };

export function buildOptimizeRequest(input: OptimizeInput) {
  const stops = routable(input.stops);
  return {
    body: { ...COMMON, solvingMode: "DEFAULT_SOLVE", model: model(input, stops, false) } as OptimizeToursRequest,
    shipments: stops.map((s) => s.appointmentId),
    vehicles: input.installers.map((i) => i.id),
  };
}

export function buildRecheckRequest(input: OptimizeInput, routes: { teamMemberId: string; appointmentIds: string[] }[]) {
  const onRoute = new Set(routes.flatMap((r) => r.appointmentIds));
  const stops = routable(input.stops).filter((s) => onRoute.has(s.appointmentId));
  const shipments = stops.map((s) => s.appointmentId);
  const vehicles = input.installers.map((i) => i.id);
  const injectedRoutes = routes
    .map((route) => ({
      vehicleIndex: vehicles.indexOf(route.teamMemberId),
      visits: route.appointmentIds.filter((id) => shipments.includes(id))
        .map((id) => ({ shipmentIndex: shipments.indexOf(id), isPickup: false })),
    }))
    .filter((route) => route.vehicleIndex >= 0);
  return {
    body: {
      ...COMMON,
      solvingMode: "DEFAULT_SOLVE",
      model: model(input, stops, true),
      injectedSolutionConstraint: {
        routes: injectedRoutes,
        constraintRelaxations: [{
          relaxations: [{ level: "RELAX_VISIT_TIMES_AFTER_THRESHOLD", thresholdVisitCount: 0 }],
          vehicleIndices: vehicles.map((_, i) => i),
        }],
      },
    } as OptimizeToursRequest,
    shipments,
    vehicles,
  };
}
```
Note: the recheck omits `allowedVehicleIndices` because the injected constraint already binds each visit to its vehicle — the owner's "move to" must win over the job's previous assignee. The test for soft windows expects this.

`lib/routes/optimize-response.ts`:
```ts
import { windowFor } from "./optimize-request";
import type { DayStop, PlanRoute, RoutePlan, RouteSettings } from "./types";

type Visit = { shipmentIndex?: number; isPickup?: boolean; startTime?: string };
type Transition = { travelDuration?: string };
type Route = { vehicleIndex?: number; visits?: Visit[]; transitions?: Transition[]; routePolyline?: { points?: string }; metrics?: { travelDuration?: string } };
export type OptimizeToursResponse = { routes?: Route[]; skippedShipments?: { index?: number; reasons?: { code?: string }[] }[] };

// Proto3 JSON omits zero values, so index 0 arrives as a missing field.
export const durationSeconds = (value: string | undefined): number => (value ? Number.parseFloat(value) : 0);
const minutes = (seconds: number) => Math.round(seconds / 60);

const FALLBACK = "It didn't fit around the other stops and their windows.";
const REASONS: Record<string, string> = {
  NO_VEHICLE: "No installer was selected for this day.",
  CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TIME_WINDOWS: "It can't be reached within anyone's working day.",
  CANNOT_BE_PERFORMED_WITHIN_VEHICLE_DURATION_LIMIT: "It is too long for the working day.",
  CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TRAVEL_DURATION_LIMIT: "It is too far to drive in the working day.",
  CANNOT_BE_PERFORMED_WITHIN_VEHICLE_DISTANCE_LIMIT: "It is too far to drive in the working day.",
  VEHICLE_NOT_ALLOWED: "It is assigned to an installer who can't fit it in.",
  DEMAND_EXCEEDS_VEHICLE_CAPACITY: FALLBACK,
  VEHICLE_IGNORED: FALLBACK, SHIPMENT_IGNORED: FALLBACK, SKIPPED_IN_INJECTED_SOLUTION_CONSTRAINT: FALLBACK,
  VEHICLE_ROUTE_IS_FULLY_SEQUENCE_CONSTRAINED: FALLBACK, ZERO_PENALTY_COST: FALLBACK, CODE_UNSPECIFIED: FALLBACK,
};
export const reasonText = (code: string | undefined): string => (code && REASONS[code]) || FALLBACK;

export function parseOptimizeResponse(
  response: OptimizeToursResponse,
  ctx: { day: string; builtAt: string; shipments: string[]; vehicles: string[]; stops: DayStop[]; settings: RouteSettings },
): RoutePlan {
  const byId = new Map(ctx.stops.map((s) => [s.appointmentId, s]));
  const routes: PlanRoute[] = ctx.vehicles.map((teamMemberId) => ({ teamMemberId, stops: [], polyline: null, driveMinutes: 0 }));
  for (const route of response.routes ?? []) {
    const target = routes[route.vehicleIndex ?? 0];
    if (!target) continue;
    const visits = route.visits ?? [];
    target.stops = visits.map((visit, i) => {
      const appointmentId = ctx.shipments[visit.shipmentIndex ?? 0];
      const arrival = new Date(visit.startTime ?? ctx.builtAt).toISOString();
      const stop = byId.get(appointmentId);
      const w = stop ? windowFor(stop, ctx.day, ctx.settings) : null;
      return {
        appointmentId,
        arrival,
        driveMinutes: i === 0 ? 0 : minutes(durationSeconds(route.transitions?.[i]?.travelDuration)),
        outsideWindow: Boolean(stop?.windowStart && w && (arrival < w.start || arrival > w.end)),
      };
    });
    target.polyline = visits.length ? route.routePolyline?.points ?? null : null;
    target.driveMinutes = target.stops.reduce((sum, s) => sum + s.driveMinutes, 0);
  }
  const skipped = (response.skippedShipments ?? []).map((s) => ({
    appointmentId: ctx.shipments[s.index ?? 0],
    reason: reasonText(s.reasons?.[0]?.code),
  }));
  return { day: ctx.day, builtAt: ctx.builtAt, routes, skipped };
}
```
`outsideWindow` flags only stops with a *promised* window; the working day is already a vehicle constraint. Route `driveMinutes` is the sum of the stop minutes (so the first stop's leg from "nowhere" never counts), which also makes the first test's `25` hold regardless of `metrics`.

`lib/routes/google-auth.ts`:
```ts
import "server-only";
import { GoogleAuth } from "google-auth-library";

let auth: GoogleAuth | null = null;

/** An OAuth token for Route Optimization. GoogleAuth signs the JWT and caches/refreshes the token. */
export async function routeAccessToken(): Promise<string> {
  if (!auth) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "");
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
    auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  }
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Google returned no access token");
  return token;
}
```
Export `resetRouteAuthForTests = () => { auth = null; }` and call it in the test's `beforeEach`.

`lib/routes/optimize.ts`:
```ts
import "server-only";
import { routeAccessToken } from "./google-auth";
import type { OptimizeToursRequest } from "./optimize-request";
import type { OptimizeToursResponse } from "./optimize-response";

export class RoutePlanningUnavailable extends Error {}

const stub = () => {
  const url = process.env.ROUTE_OPTIMIZATION_URL;
  const token = process.env.ROUTE_OPTIMIZATION_TOKEN;
  return url && token ? { url, token } : null;
};

export const routePlanningConfigured = (): boolean =>
  Boolean(stub() || (process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GOOGLE_SERVICE_ACCOUNT_JSON));

export async function optimizeTours(body: OptimizeToursRequest): Promise<OptimizeToursResponse> {
  if (!routePlanningConfigured()) throw new RoutePlanningUnavailable("Route Optimization is not configured");
  try {
    const test = stub();
    const url = test?.url ??
      `https://routeoptimization.googleapis.com/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}:optimizeTours`;
    const token = test?.token ?? (await routeAccessToken());
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      // 15 s is also the solver's own timeout in the body. The extra second lets Google answer first.
      signal: AbortSignal.timeout(16_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Route Optimization ${response.status}: ${await response.text()}`);
    return (await response.json()) as OptimizeToursResponse;
  } catch (error) {
    console.error("Route planning failed", error);
    throw new RoutePlanningUnavailable(error instanceof Error ? error.message : String(error));
  }
}
```
(The test for the endpoint URL uses a 16 s signal — assert `signal` is an `AbortSignal`, not its duration.)

- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths.**
- [ ] **Step 5: Commit** — `feat: Route Optimization request builder, parser and client`

---

### Task 7: Loading a day, staleness, and saving routes

**Files:**
- Create: `lib/routes/stale.ts`, `lib/routes/day.ts`, `tests/routes/planner/stale.test.ts`, `tests/routes/planner/day.test.ts`

**Interfaces:**
- Consumes: types (Task 2), `getRouteSettings`/`defaultMinutes` (Task 2), `geocodeLead` (Task 5), `fromLocalInput`, `lasVegasDate`, `addDays` (`lib/calendar/week.ts` — import it only if that does not pull in the Graph client at import time; otherwise copy the 3-line `addDays` into `lib/routes/day.ts`. `lib/calendar/week.ts` imports `./graph`, so **copy it**).
- Produces:
```ts
// lib/routes/stale.ts (pure)
export type SavedStopRow = { appointmentId: string; savedAt: string; routeDate: string };
export function isRouteStale(saved: SavedStopRow[], day: DayStop[], date: string): boolean;

// lib/routes/day.ts
export const isRouteDay: (value: string | undefined) => value is string;   // valid YYYY-MM-DD
export async function loadDay(date: string): Promise<DayStop[]>;
export async function listInstallers(): Promise<Installer[]>;
export async function loadSavedPlan(date: string, day: DayStop[]): Promise<SavedRoute | null>;
export type SaveRouteResult = "ok" | "changed" | "unknown-installer";
export async function saveRoutePlan(plan: RoutePlan, actor: string): Promise<SaveRouteResult>;
export type RouteNote = { windowStart: string | null; windowEnd: string | null; plannedArrival: Date | null };
export async function routeNotes(from: Date, to: Date): Promise<Map<string, RouteNote>>; // key `${leadId}:${kind}`
```

- [ ] **Step 1: Write the failing tests**

`tests/routes/planner/stale.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isRouteStale } from "@/lib/routes/stale";
import type { DayStop } from "@/lib/routes/types";

const D = "2026-09-24";
const stop = (id: string, updatedAt: string): DayStop => ({
  appointmentId: id, jobId: "j", name: "n", address: "a", city: "c", kind: "install", startsAt: "", allDay: true,
  confirmed: true, windowStart: null, windowEnd: null, durationMinutes: 60, lat: 1, lng: 1, assignedTo: null, updatedAt,
});
const saved = (id: string, savedAt = "2026-09-22T12:00:00.000Z", routeDate = D) => ({ appointmentId: id, savedAt, routeDate });

describe("isRouteStale", () => {
  it("is fresh when every appointment is saved and none changed since", () => {
    expect(isRouteStale([saved("a"), saved("b")], [stop("a", "2026-09-21T00:00:00.000Z"), stop("b", "2026-09-22T12:00:00.000Z")], D)).toBe(false);
  });

  it("is stale when an appointment changed after the save", () => {
    expect(isRouteStale([saved("a")], [stop("a", "2026-09-22T12:00:01.000Z")], D)).toBe(true);
  });

  it("is stale when a saved stop's appointment moved to another day", () => {
    expect(isRouteStale([saved("a"), saved("b")], [stop("a", "2026-09-21T00:00:00.000Z")], D)).toBe(true);
  });

  it("is stale when the day has an appointment with no stop", () => {
    expect(isRouteStale([saved("a")], [stop("a", "2026-09-21T00:00:00.000Z"), stop("new", "2026-09-21T00:00:00.000Z")], D)).toBe(true);
  });

  it("uses the latest save time across the day's stops", () => {
    expect(isRouteStale([saved("a", "2026-09-22T12:00:00.000Z"), saved("b", "2026-09-23T12:00:00.000Z")],
      [stop("a", "2026-09-23T00:00:00.000Z"), stop("b", "2026-09-21T00:00:00.000Z")], D)).toBe(false);
  });

  it("is not stale when nothing was ever saved", () => {
    expect(isRouteStale([], [stop("a", "2026-09-21T00:00:00.000Z")], D)).toBe(false);
  });
});
```
A cancelled appointment cascades its `route_stops` row away and also leaves `loadDay` — so the saved set equals the day set and nothing *else* is stale. The spec wants it counted: `loadSavedPlan` passes a `stopCountAtSave` that it reads from the `saved_count` stored on every row (see below), and the test adds:
```ts
it("is stale when a stop was removed since the save (a cancelled appointment cascades away)", () => {
  expect(isRouteStale([{ ...saved("a"), savedCount: 2 }], [stop("a", "2026-09-21T00:00:00.000Z")], D)).toBe(true);
});
```
So `SavedStopRow` is `{ appointmentId; savedAt; routeDate; savedCount: number }` and every `saved(...)` helper above includes `savedCount: <number of saved rows in that call>` — write the helper as `const rows = (...items) => items.map((r) => ({ ...r, savedCount: items.length }))` and wrap each array literal in `rows(...)`.

(`saved_count` is created by Task 1's migration.)

`tests/routes/planner/day.test.ts` (db mock; `@/lib/routes/settings` mocked to defaults; `@/lib/routes/geocode` mocked):
- `isRouteDay("2026-09-24")` true; `"2026-02-30"`, `"x"`, `undefined` false.
- `loadDay(D)` query selects from `appointments a join leads l`, filters `l.status <> 'lost'` and `a.starts_at >= ? and a.starts_at < ?` with the Las Vegas midnight bounds (`2026-09-24T07:00:00.000Z` → `2026-09-25T07:00:00.000Z`), selects `l.lat, l.lng, l.geocode_status, l.assigned_to, a.window_start::text, a.window_end::text, a.duration_minutes, a.updated_at`, and maps a row with `duration_minutes: null`, `kind: "install"` to `durationMinutes: 240`; `confirmed_at` null → `confirmed: false`.
- `loadDay` re-geocodes rows with `geocode_status = 'error'` (awaits `geocodeLead` for each, then re-reads once) and never for `not_found`.
- `listInstallers()` selects `where role = 'installer' order by lower(name)`.
- `loadSavedPlan(D, day)` returns `null` for no rows; otherwise groups rows by `team_member_id` ordered by `position`, with `arrival` ISO, `driveMinutes`, `outsideWindow: false`, `polyline: null`, route `driveMinutes` summed, `skipped: []`, `savedAt` = max, `stale` from `isRouteStale`.
- `saveRoutePlan(plan, actor)`: a single `sql` call; the statement contains `delete from route_stops where route_date = ?::date`, `insert into route_stops (route_date, appointment_id, team_member_id, position, planned_arrival, drive_minutes, saved_count)`, `jsonb_to_recordset(?::jsonb)`, `update leads set assigned_to`, `insert into job_events` with `'edit'` and `'Assigned to ' || m.name || ' (Installer) by route'`, and the race guard `a.updated_at > ?::timestamptz`; params include the JSON of stops `[{ appointment_id, team_member_id, position, planned_arrival, drive_minutes }]` in route order (positions 1..n per installer). Returns `"changed"` for `[{ changed: 1 }]`, `"unknown-installer"` for `[{ changed: 0, unknown: 1 }]`, `"ok"` for `[{ changed: 0, unknown: 0, saved: 3 }]`.
- `routeNotes(from, to)` returns a map keyed `"<lead>:<kind>"` with `plannedArrival` from a `left join route_stops`.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`lib/routes/stale.ts`:
```ts
import type { DayStop } from "./types";

export type SavedStopRow = { appointmentId: string; savedAt: string; routeDate: string; savedCount: number };

/** Computed, never stored: see spec §3 "Out of date". */
export function isRouteStale(saved: SavedStopRow[], day: DayStop[], date: string): boolean {
  if (saved.length === 0) return false;
  const savedAt = saved.map((s) => s.savedAt).sort().at(-1)!;
  const onDay = new Set(day.map((s) => s.appointmentId));
  const savedIds = new Set(saved.filter((s) => s.routeDate === date).map((s) => s.appointmentId));
  if (day.some((s) => s.updatedAt > savedAt)) return true;
  if ([...savedIds].some((id) => !onDay.has(id))) return true;
  if (day.some((s) => !savedIds.has(s.appointmentId))) return true;
  return saved.some((s) => s.savedCount !== saved.length);
}
```
(ISO strings from `toISOString()` compare correctly as text; always normalise with `new Date(x).toISOString()` when mapping rows.)

`lib/routes/day.ts` — key pieces:
```ts
import "server-only";
import { db } from "@/lib/db";
import { fromLocalInput } from "@/lib/admin/time";
import type { AppointmentKind } from "@/lib/admin/appointment-kinds";
import { geocodeLead } from "./geocode";
import { defaultMinutes, getRouteSettings } from "./settings";
import { isRouteStale } from "./stale";
import type { DayStop, Installer, RoutePlan, SavedRoute } from "./types";

const noon = (date: string) => new Date(`${date}T12:00:00Z`);
const nextDate = (date: string) => { const d = noon(date); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
export const isRouteDay = (value: string | undefined): value is string =>
  Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(noon(value).getTime()) && noon(value).toISOString().slice(0, 10) === value);

const iso = (v: unknown) => new Date(v as string | Date).toISOString();
const clock = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : null);

async function readDay(date: string) {
  const from = fromLocalInput(`${date}T00:00`);
  const to = fromLocalInput(`${nextDate(date)}T00:00`);
  return db()`
    select a.id, a.lead_id, a.kind, a.starts_at, a.all_day, a.confirmed_at, a.updated_at,
           a.window_start::text as window_start, a.window_end::text as window_end, a.duration_minutes,
           l.name, l.address, l.city, l.lat, l.lng, l.geocode_status, l.assigned_to
      from appointments a join leads l on l.id = a.lead_id
     where l.status <> 'lost' and a.starts_at >= ${from} and a.starts_at < ${to}
     order by a.starts_at`;
}

export async function loadDay(date: string): Promise<DayStop[]> {
  let rows = await readDay(date);
  const retry = [...new Set(rows.filter((r) => r.geocode_status === "error").map((r) => r.lead_id as string))];
  if (retry.length) {
    for (const id of retry) await geocodeLead(id);
    rows = await readDay(date);
  }
  const settings = await getRouteSettings();
  return rows.map((r) => ({
    appointmentId: r.id as string, jobId: r.lead_id as string, name: r.name as string,
    address: (r.address as string | null) ?? null, city: r.city as string, kind: r.kind as AppointmentKind,
    startsAt: iso(r.starts_at), allDay: r.all_day === true, confirmed: r.confirmed_at !== null,
    windowStart: clock(r.window_start), windowEnd: clock(r.window_end),
    durationMinutes: (r.duration_minutes as number | null) ?? defaultMinutes(settings, r.kind as AppointmentKind),
    lat: (r.lat as number | null) ?? null, lng: (r.lng as number | null) ?? null,
    assignedTo: (r.assigned_to as string | null) ?? null, updatedAt: iso(r.updated_at),
  }));
}

export async function listInstallers(): Promise<Installer[]> {
  const rows = await db()`select id, name from team_members where role = 'installer' order by lower(name), created_at`;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string }));
}
```
`loadSavedPlan`:
```ts
export async function loadSavedPlan(date: string, day: DayStop[]): Promise<SavedRoute | null> {
  const rows = await db()`
    select appointment_id, team_member_id, position, planned_arrival, drive_minutes, saved_at, saved_count,
           route_date::text as route_date
      from route_stops where route_date = ${date}::date order by team_member_id, position`;
  if (!rows.length) return null;
  const routes = new Map<string, RoutePlan["routes"][number]>();
  for (const r of rows) {
    const id = r.team_member_id as string;
    const route = routes.get(id) ?? { teamMemberId: id, stops: [], polyline: null, driveMinutes: 0 };
    route.stops.push({ appointmentId: r.appointment_id as string, arrival: iso(r.planned_arrival),
      driveMinutes: r.drive_minutes as number, outsideWindow: false });
    route.driveMinutes += r.drive_minutes as number;
    routes.set(id, route);
  }
  const savedRows = rows.map((r) => ({ appointmentId: r.appointment_id as string, savedAt: iso(r.saved_at),
    routeDate: r.route_date as string, savedCount: r.saved_count as number }));
  const savedAt = savedRows.map((r) => r.savedAt).sort().at(-1)!;
  return {
    plan: { day: date, builtAt: savedAt, routes: [...routes.values()], skipped: [] },
    savedAt,
    stale: isRouteStale(savedRows, day, date),
  };
}
```
A saved route has no polyline (it is not stored); the view draws straight segments between the numbered pins for a saved route until the owner rebuilds or re-checks, which returns fresh polylines.

`saveRoutePlan` — one statement:
```ts
export type SaveRouteResult = "ok" | "changed" | "unknown-installer";

export async function saveRoutePlan(plan: RoutePlan, actor: string): Promise<SaveRouteResult> {
  const stops = plan.routes.flatMap((route) => route.stops.map((stop, i) => ({
    appointment_id: stop.appointmentId, team_member_id: route.teamMemberId, position: i + 1,
    planned_arrival: stop.arrival, drive_minutes: stop.driveMinutes,
  })));
  const planned = [...stops.map((s) => s.appointment_id), ...plan.skipped.map((s) => s.appointmentId)];
  const from = fromLocalInput(`${plan.day}T00:00`);
  const to = fromLocalInput(`${nextDate(plan.day)}T00:00`);
  const [result] = await db()`
    with input as (
      select * from jsonb_to_recordset(${JSON.stringify(stops)}::jsonb)
        as x(appointment_id uuid, team_member_id uuid, position int, planned_arrival timestamptz, drive_minutes int)
    ),
    day as (
      select a.id, a.lead_id, a.updated_at from appointments a join leads l on l.id = a.lead_id
       where l.status <> 'lost' and a.starts_at >= ${from} and a.starts_at < ${to}
    ),
    guard as (
      select (exists (select 1 from day where updated_at > ${plan.builtAt}::timestamptz)
          or (select count(*) from day) <> cardinality(${planned}::uuid[])
          or exists (select 1 from day where not (id = any(${planned}::uuid[])))
          or exists (select 1 from input where appointment_id not in (select id from day))) as changed,
             exists (select 1 from input i where not exists (
               select 1 from team_members m where m.id = i.team_member_id and m.role = 'installer')) as unknown
    ),
    cleared as (
      delete from route_stops where route_date = ${plan.day}::date
        and not (select changed or unknown from guard)
      returning id
    ),
    inserted as (
      insert into route_stops (route_date, appointment_id, team_member_id, position, planned_arrival, drive_minutes, saved_count)
      select ${plan.day}::date, i.appointment_id, i.team_member_id, i.position, i.planned_arrival, i.drive_minutes,
             (select count(*) from input)::int
        from input i where not (select changed or unknown from guard)
      on conflict (appointment_id) do update set
        route_date = excluded.route_date, team_member_id = excluded.team_member_id, position = excluded.position,
        planned_arrival = excluded.planned_arrival, drive_minutes = excluded.drive_minutes,
        saved_count = excluded.saved_count, saved_at = now()
      returning appointment_id, team_member_id
    ),
    reassigned as (
      update leads l set assigned_to = i.team_member_id, updated_at = now()
        from inserted i join day d on d.id = i.appointment_id
       where l.id = d.lead_id and l.assigned_to is distinct from i.team_member_id
      returning l.id, i.team_member_id
    ),
    logged as (
      insert into job_events (lead_id, actor, kind, body)
      select r.id, ${actor}, 'edit', 'Assigned to ' || m.name || ' (Installer) by route'
        from reassigned r join team_members m on m.id = r.team_member_id
      returning id
    )
    select (select changed from guard)::int as changed, (select unknown from guard)::int as unknown,
           (select count(*) from inserted)::int as saved, (select count(*) from logged)::int as logged`;
  if (result?.changed) return "changed";
  if (result?.unknown) return "unknown-installer";
  return "ok";
}
```
Postgres data-modifying CTEs all see the same snapshot, so the `delete` and the `insert … on conflict (appointment_id)` must not collide on the same row: the `on conflict … do update` covers a stop whose row the delete also targets. **Verify this on the Neon test branch in Task 13**; if Postgres reports "tuple to be updated was already modified", split into `sql.transaction([deleteQuery, insertQuery])` using `@neondatabase/serverless`'s `transaction` (still atomic) and adjust the test to assert one `transaction` call with two queries. Only the owner's reassignment writes `leads.updated_at` — it does not touch `appointments.updated_at`, so saving never makes its own route stale. A job whose lead has two appointments on the same day (e.g. measure and install) gets the installer of the later-positioned one; that is acceptable and logged.

`routeNotes`:
```ts
export type RouteNote = { windowStart: string | null; windowEnd: string | null; plannedArrival: Date | null };

export async function routeNotes(from: Date, to: Date): Promise<Map<string, RouteNote>> {
  const rows = await db()`
    select a.lead_id, a.kind, a.window_start::text as window_start, a.window_end::text as window_end, s.planned_arrival
      from appointments a left join route_stops s on s.appointment_id = a.id
     where a.starts_at >= ${from} and a.starts_at < ${to}
       and (a.window_start is not null or s.planned_arrival is not null)`;
  return new Map(rows.map((r) => [`${r.lead_id}:${r.kind}`, {
    windowStart: clock(r.window_start), windowEnd: clock(r.window_end),
    plannedArrival: r.planned_arrival ? new Date(r.planned_arrival as string | Date) : null,
  }]));
}
```

- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths.**
- [ ] **Step 5: Commit** — `feat: load a route day, detect stale routes, and save routes`

---

### Task 8: The route server actions

**Files:**
- Create: `app/admin/schedule/route-actions.ts`, `lib/routes/plan-schema.ts`, `tests/admin/route-actions.test.ts`

**Interfaces:**
- Consumes: `loadDay`, `listInstallers`, `saveRoutePlan`, `isRouteDay` (Task 7); `getRouteSettings` (Task 2); `buildOptimizeRequest`, `buildRecheckRequest`, `parseOptimizeResponse`, `optimizeTours`, `RoutePlanningUnavailable`, `routePlanningConfigured` (Task 6); `requireAdmin`.
- Produces:
```ts
export type RouteActionResult = { ok: true; plan: RoutePlan } | { ok: false; error: string };
export async function buildRoutes(day: string, installerIds: string[]): Promise<RouteActionResult>;
export async function recheckRoutes(day: string, plan: RoutePlan, installerIds: string[]): Promise<RouteActionResult>;
export async function saveRoutes(day: string, plan: RoutePlan): Promise<{ ok: true } | { ok: false; error: string }>;
// lib/routes/plan-schema.ts
export const routePlanSchema: z.ZodType<RoutePlan>;
export const UNAVAILABLE = "Route planning is unavailable right now";
export const CHANGED = "This day changed — rebuild first.";
```
`recheckRoutes` takes `installerIds` too (the spec's two-argument signature cannot know which vehicles exist once a route is emptied).

- [ ] **Step 1: Write the failing tests** — `tests/admin/route-actions.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/session", () => ({ requireAdmin }));
const day = { loadDay: vi.fn(), listInstallers: vi.fn(), saveRoutePlan: vi.fn(), isRouteDay: (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) };
vi.mock("@/lib/routes/day", () => day);
vi.mock("@/lib/routes/settings", () => ({ getRouteSettings: vi.fn(async () => ({ dayStart: "09:00", dayEnd: "18:00", minutes: { consultation: 60, measure: 60, install: 240, service: 90 } })) }));
class RoutePlanningUnavailable extends Error {}
const optimize = { optimizeTours: vi.fn(), routePlanningConfigured: vi.fn(() => true), RoutePlanningUnavailable };
vi.mock("@/lib/routes/optimize", () => optimize);
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const actions = await import("@/app/admin/schedule/route-actions");
const D = "2026-09-24";
const ANA = "aaaaaaaa-0000-4000-8000-000000000001";
const S1 = "11111111-0000-4000-8000-000000000001";
const STOP = { appointmentId: S1, jobId: "j", name: "Dana", address: "12 Sample St", city: "Henderson", kind: "install",
  startsAt: "2026-09-24T16:00:00.000Z", allDay: true, confirmed: true, windowStart: null, windowEnd: null,
  durationMinutes: 240, lat: 36, lng: -115, assignedTo: null, updatedAt: "2026-09-20T00:00:00.000Z" };
const PLAN = { day: D, builtAt: "2026-09-23T20:00:00.000Z", skipped: [],
  routes: [{ teamMemberId: ANA, polyline: null, driveMinutes: 0, stops: [{ appointmentId: S1, arrival: "2026-09-24T16:00:00.000Z", driveMinutes: 0, outsideWindow: false }] }] };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ email: "owner@example.com" });
  day.loadDay.mockResolvedValue([STOP]);
  day.listInstallers.mockResolvedValue([{ id: ANA, name: "Ana" }]);
  day.saveRoutePlan.mockResolvedValue("ok");
  optimize.routePlanningConfigured.mockReturnValue(true);
  optimize.optimizeTours.mockResolvedValue({ routes: [{ visits: [{ startTime: "2026-09-24T16:00:00Z" }], transitions: [{}] }] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("without a session", () => {
  beforeEach(() => { requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT")); });
  it.each([
    ["buildRoutes", () => actions.buildRoutes(D, [ANA])],
    ["recheckRoutes", () => actions.recheckRoutes(D, PLAN, [ANA])],
    ["saveRoutes", () => actions.saveRoutes(D, PLAN)],
  ])("%s touches nothing", async (_n, run) => {
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");
    for (const fn of [day.loadDay, day.saveRoutePlan, optimize.optimizeTours]) expect(fn).not.toHaveBeenCalled();
  });
});

describe("buildRoutes", () => {
  it("returns a preview plan and writes nothing", async () => {
    const result = await actions.buildRoutes(D, [ANA]);
    expect(result).toMatchObject({ ok: true, plan: { day: D, routes: [{ teamMemberId: ANA, stops: [{ appointmentId: S1 }] }] } });
    expect(day.saveRoutePlan).not.toHaveBeenCalled();
  });

  it("only routes selected installers that really are installers", async () => {
    await actions.buildRoutes(D, [ANA, "not-a-member"]);
    expect((optimize.optimizeTours.mock.calls[0][0] as any).model.vehicles).toHaveLength(1);
  });

  it("says why it can't build", async () => {
    expect(await actions.buildRoutes("nope", [ANA])).toEqual({ ok: false, error: "Pick a day." });
    expect(await actions.buildRoutes(D, [])).toEqual({ ok: false, error: "Pick at least one installer." });
    day.loadDay.mockResolvedValueOnce([]);
    expect(await actions.buildRoutes(D, [ANA])).toEqual({ ok: false, error: "Nothing is scheduled that day." });
    day.loadDay.mockResolvedValueOnce([{ ...STOP, lat: null, lng: null }]);
    expect(await actions.buildRoutes(D, [ANA])).toEqual({ ok: false, error: "No appointment that day has a mappable address." });
  });

  it("reports Google failures and missing config the same way", async () => {
    optimize.optimizeTours.mockRejectedValueOnce(new RoutePlanningUnavailable("boom"));
    expect(await actions.buildRoutes(D, [ANA])).toEqual({ ok: false, error: "Route planning is unavailable right now" });
    optimize.routePlanningConfigured.mockReturnValueOnce(false);
    expect(await actions.buildRoutes(D, [ANA])).toEqual({ ok: false, error: "Route planning is unavailable right now" });
  });
});

describe("recheckRoutes", () => {
  it("sends the owner's order as a constraint and returns the new times", async () => {
    const result = await actions.recheckRoutes(D, PLAN, [ANA]);
    const body = optimize.optimizeTours.mock.calls[0][0] as any;
    expect(body.injectedSolutionConstraint.routes).toEqual([{ vehicleIndex: 0, visits: [{ shipmentIndex: 0, isPickup: false }] }]);
    expect(result.ok).toBe(true);
  });

  it("keeps the plan's skipped list", async () => {
    const result = await actions.recheckRoutes(D, { ...PLAN, skipped: [{ appointmentId: "x", reason: "r" }] }, [ANA]);
    expect(result.ok && result.plan.skipped).toEqual([{ appointmentId: "x", reason: "r" }]);
  });

  it("rejects a malformed plan", async () => {
    expect(await actions.recheckRoutes(D, { day: D } as never, [ANA])).toEqual({ ok: false, error: "That route could not be read. Build again." });
  });
});

describe("saveRoutes", () => {
  it("saves as the signed-in owner and refreshes the schedule and jobs", async () => {
    expect(await actions.saveRoutes(D, PLAN)).toEqual({ ok: true });
    expect(day.saveRoutePlan).toHaveBeenCalledWith(PLAN, "owner@example.com");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/schedule");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/jobs/[id]", "page");
  });

  it("refuses when the day changed after the build", async () => {
    day.saveRoutePlan.mockResolvedValueOnce("changed");
    expect(await actions.saveRoutes(D, PLAN)).toEqual({ ok: false, error: "This day changed — rebuild first." });
  });

  it("refuses an unknown installer, or a plan for another day", async () => {
    day.saveRoutePlan.mockResolvedValueOnce("unknown-installer");
    expect(await actions.saveRoutes(D, PLAN)).toEqual({ ok: false, error: "An installer on this route no longer exists. Build again." });
    expect(await actions.saveRoutes("2026-09-25", PLAN)).toEqual({ ok: false, error: "That route could not be read. Build again." });
  });
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`lib/routes/plan-schema.ts`:
```ts
import { z } from "zod";
import type { RoutePlan } from "./types";

export const UNAVAILABLE = "Route planning is unavailable right now";
export const CHANGED = "This day changed — rebuild first.";

const uuid = z.uuid();
const isoTime = z.iso.datetime({ offset: true });

export const routePlanSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  builtAt: isoTime,
  routes: z.array(z.object({
    teamMemberId: uuid,
    polyline: z.string().nullable(),
    driveMinutes: z.number().int().min(0),
    stops: z.array(z.object({
      appointmentId: uuid, arrival: isoTime, driveMinutes: z.number().int().min(0), outsideWindow: z.boolean(),
    })),
  })),
  skipped: z.array(z.object({ appointmentId: z.string(), reason: z.string() })),
}) satisfies z.ZodType<RoutePlan>;
```
(`z.uuid()` and `z.iso.datetime` are zod v4 top-level formats. The test's plain `"x"` skipped id passes because `skipped.appointmentId` is `z.string()`.)

`app/admin/schedule/route-actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { isRouteDay, listInstallers, loadDay, saveRoutePlan } from "@/lib/routes/day";
import { buildOptimizeRequest, buildRecheckRequest } from "@/lib/routes/optimize-request";
import { parseOptimizeResponse } from "@/lib/routes/optimize-response";
import { optimizeTours, routePlanningConfigured, RoutePlanningUnavailable } from "@/lib/routes/optimize";
import { CHANGED, routePlanSchema, UNAVAILABLE } from "@/lib/routes/plan-schema";
import { getRouteSettings } from "@/lib/routes/settings";
import type { RoutePlan } from "@/lib/routes/types";

export type RouteActionResult = { ok: true; plan: RoutePlan } | { ok: false; error: string };
const UNREADABLE = { ok: false, error: "That route could not be read. Build again." } as const;

// Every action calls requireAdmin() before reading its input.

async function context(day: string, installerIds: string[]) {
  const [stops, team, settings] = await Promise.all([loadDay(day), listInstallers(), getRouteSettings()]);
  const installers = team.filter((i) => installerIds.includes(i.id));
  return { stops, installers, settings };
}

async function solve(run: () => Promise<RoutePlan>): Promise<RouteActionResult> {
  if (!routePlanningConfigured()) return { ok: false, error: UNAVAILABLE };
  try {
    return { ok: true, plan: await run() };
  } catch (error) {
    if (error instanceof RoutePlanningUnavailable) return { ok: false, error: UNAVAILABLE };
    throw error;
  }
}

export async function buildRoutes(day: string, installerIds: string[]): Promise<RouteActionResult> {
  await requireAdmin();
  if (!isRouteDay(day)) return { ok: false, error: "Pick a day." };
  const { stops, installers, settings } = await context(day, installerIds);
  if (!installers.length) return { ok: false, error: "Pick at least one installer." };
  if (!stops.length) return { ok: false, error: "Nothing is scheduled that day." };
  if (!stops.some((s) => s.lat !== null)) return { ok: false, error: "No appointment that day has a mappable address." };
  return solve(async () => {
    const builtAt = new Date().toISOString();
    const request = buildOptimizeRequest({ day, stops, installers, settings });
    const response = await optimizeTours(request.body);
    return parseOptimizeResponse(response, { day, builtAt, stops, settings, ...request });
  });
}

export async function recheckRoutes(day: string, plan: RoutePlan, installerIds: string[]): Promise<RouteActionResult> {
  await requireAdmin();
  const parsed = routePlanSchema.safeParse(plan);
  if (!isRouteDay(day) || !parsed.success || parsed.data.day !== day) return UNREADABLE;
  const { stops, installers, settings } = await context(day, installerIds);
  const routes = parsed.data.routes
    .filter((r) => installers.some((i) => i.id === r.teamMemberId))
    .map((r) => ({ teamMemberId: r.teamMemberId, appointmentIds: r.stops.map((s) => s.appointmentId) }));
  return solve(async () => {
    const request = buildRecheckRequest({ day, stops, installers, settings }, routes);
    const response = await optimizeTours(request.body);
    const next = parseOptimizeResponse(response, { day, builtAt: parsed.data.builtAt, stops, settings, ...request });
    return { ...next, skipped: parsed.data.skipped };
  });
}

export async function saveRoutes(day: string, plan: RoutePlan): Promise<{ ok: true } | { ok: false; error: string }> {
  const { email } = await requireAdmin();
  const parsed = routePlanSchema.safeParse(plan);
  if (!isRouteDay(day) || !parsed.success || parsed.data.day !== day) return UNREADABLE;
  const result = await saveRoutePlan(parsed.data, email);
  if (result === "changed") return { ok: false, error: CHANGED };
  if (result === "unknown-installer") return { ok: false, error: "An installer on this route no longer exists. Build again." };
  revalidatePath("/admin/schedule");
  revalidatePath("/admin");
  revalidatePath("/admin/jobs/[id]", "page");
  return { ok: true };
}
```
`builtAt` is kept from the original build through every re-check, so a save after edits still refuses if an appointment changed since the build. Note the ordering in `buildRoutes`: `routePlanningConfigured()` is checked inside `solve`, after the cheap validations, which matches the test order.

- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths.**
- [ ] **Step 5: Commit** — `feat: build, re-check and save routes`

---

### Task 9: The Route view — page, switch and lists

**Files:**
- Create: `app/admin/schedule/RouteView.tsx` (client), `app/admin/schedule/RouteLists.tsx`, `lib/routes/maps-link.ts`, `lib/routes/edit.ts`, `tests/admin/route-view.test.tsx`, `tests/routes/planner/maps-link.test.ts`, `tests/routes/planner/edit.test.ts`
- Modify: `app/admin/schedule/page.tsx`, `app/admin/schedule/ViewSwitch.tsx`, `app/admin/schedule/ScheduleHeader.tsx`, `app/admin/schedule/WeekView.tsx`, `app/admin/schedule/MonthView.tsx` (pass the new `routeHref`), `tests/admin/schedule-page.test.tsx`

**Interfaces:**
- Consumes: Task 7's loaders, Task 8's actions, `windowLabel`, `formatTime` (`lib/admin/time.ts`), `lasVegasDate`.
- Produces:
```ts
// lib/routes/maps-link.ts (client-safe)
export function mapsDirectionsUrl(points: { lat: number; lng: number }[]): string | null;
// lib/routes/edit.ts (client-safe, pure)
export function moveStop(plan: RoutePlan, appointmentId: string, toTeamMemberId: string): RoutePlan;  // appends to the end
export function shiftStop(plan: RoutePlan, appointmentId: string, by: -1 | 1): RoutePlan;
// RouteView props
export type RouteViewProps = {
  day: string; today: string; stops: DayStop[]; installers: Installer[];
  saved: SavedRoute | null; configured: boolean; mapsKey: string | null; mapId: string | null;
};
// ViewSwitch: props become { weekHref; monthHref; routeHref; active: "week" | "month" | "route" }
```

- [ ] **Step 1: Write the failing tests**

`tests/routes/planner/maps-link.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mapsDirectionsUrl } from "@/lib/routes/maps-link";

describe("mapsDirectionsUrl", () => {
  it("lists the stops in order as a google.com/maps/dir URL", () => {
    expect(mapsDirectionsUrl([{ lat: 36.1, lng: -115.1 }, { lat: 36.2, lng: -115.2 }]))
      .toBe("https://www.google.com/maps/dir/36.1,-115.1/36.2,-115.2");
  });
  it("has nothing to open for an empty route", () => {
    expect(mapsDirectionsUrl([])).toBeNull();
  });
});
```

`tests/routes/planner/edit.test.ts` — `moveStop` removes the stop from Ana's list and appends it to Bo's; moving to the same installer is a no-op; `shiftStop(-1)` on the first stop and `shiftStop(1)` on the last are no-ops; `shiftStop` swaps neighbours; neither mutates the input (`Object.freeze` the fixture deeply and assert no throw); both clear `polyline` on the changed routes.

`tests/admin/route-view.test.tsx` — mock `@/app/admin/schedule/route-actions` and `@/app/admin/schedule/RouteMap` (render `<div data-testid="map" />`). Fixture: two installers (Ana, Bo), three stops (one with `lat: null`).
- **Before any build**: shows a checkbox per installer, all checked (`getByRole("checkbox", { name: "Ana" })` checked); lists the day's appointments sorted by time with their windows ("Arrives 8:00 – 10:00 am") and "Pending" for an unconfirmed one; **Save routes** disabled.
- **Needs address (1)**: a heading with the count and a link to `/admin/jobs/<jobId>` named by the job's name.
- **Build disabled with a reason**: unchecking both installers disables "Build routes" and shows "Pick at least one installer."; with `stops=[]` it shows "Nothing is scheduled that day."; with `configured={false}` the button is enabled but clicking it shows "Route planning is unavailable right now" without calling `buildRoutes` (the page already knows).
- **After a build** (`buildRoutes` resolves a plan): per installer a list headed "Ana · 25 min driving", ordered stops "1", "2" with arrival times ("9:00 AM" via `formatTime`), an "Open in Google Maps" link with the directions URL, "Didn't fit (1)" with the reason; **Save routes** enabled.
- **Move**: each stop has a select "Move <name> to" with the other installers and buttons "Move <name> up"/"Move <name> down"; choosing Bo calls `recheckRoutes(day, editedPlan, [ANA, BO])` and renders the returned plan; while pending, buttons are disabled; a stop with `outsideWindow` shows "Misses its window".
- **Save**: clicking "Save routes" calls `saveRoutes(day, plan)`; on `{ ok: false, error: "This day changed — rebuild first." }` the error is shown with `role="alert"`; on ok shows "Routes saved." and **Save routes** disables again.
- **Saved and stale**: `saved={{ plan, savedAt, stale: true }}` renders the saved lists and `role="status"` "Route is out of date — rebuild".
- Previous/next day links point to `/admin/schedule?view=route&day=2026-09-23` and `…25`.

`tests/admin/schedule-page.test.tsx` — mock `@/lib/routes/day`, `@/lib/routes/optimize` (`routePlanningConfigured`), and `./RouteView`; `?view=route&day=2026-09-24` renders `RouteView` with `day`, `stops`, `installers`, `saved`; an invalid `day` falls back to today in Las Vegas; the existing week/month cases still pass, and the view switch shows a third link "Route".

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`lib/routes/maps-link.ts`:
```ts
/** Google Maps turn-by-turn for the whole day, stops in order. */
export function mapsDirectionsUrl(points: { lat: number; lng: number }[]): string | null {
  if (!points.length) return null;
  return `https://www.google.com/maps/dir/${points.map((p) => `${p.lat},${p.lng}`).join("/")}`;
}
```

`lib/routes/edit.ts`:
```ts
import type { RoutePlan } from "./types";

export function moveStop(plan: RoutePlan, appointmentId: string, to: string): RoutePlan {
  const from = plan.routes.find((r) => r.stops.some((s) => s.appointmentId === appointmentId));
  if (!from || from.teamMemberId === to) return plan;
  const stop = from.stops.find((s) => s.appointmentId === appointmentId)!;
  return {
    ...plan,
    routes: plan.routes.map((r) =>
      r.teamMemberId === from.teamMemberId ? { ...r, polyline: null, stops: r.stops.filter((s) => s !== stop) }
      : r.teamMemberId === to ? { ...r, polyline: null, stops: [...r.stops, stop] }
      : r),
  };
}

export function shiftStop(plan: RoutePlan, appointmentId: string, by: -1 | 1): RoutePlan {
  return {
    ...plan,
    routes: plan.routes.map((r) => {
      const i = r.stops.findIndex((s) => s.appointmentId === appointmentId);
      const j = i + by;
      if (i < 0 || j < 0 || j >= r.stops.length) return r;
      const stops = [...r.stops];
      [stops[i], stops[j]] = [stops[j], stops[i]];
      return { ...r, polyline: null, stops };
    }),
  };
}
```

`ViewSwitch.tsx` — props `{ weekHref, monthHref, routeHref, active: "week" | "month" | "route" }`, third `<SwitchLink href={routeHref} current={active === "route"}>Route</SwitchLink>`. `ScheduleHeader.tsx` — `view: "week" | "month" | "route"`, `switchHrefs: { week; month; route }`. `WeekView` passes `route: \`/admin/schedule?view=route&day=${today}\`` (clamp: if today is in `days` use today, else `days[0]`); `MonthView` passes `route: \`/admin/schedule?view=route&day=${day ?? month + "-01"}\``.

`page.tsx`:
```tsx
if (view === "route") {
  const requested = pick(params.day);
  const today = lasVegasDate(now);
  const day = isRouteDay(requested) ? requested : today;
  const [stops, installers] = await Promise.all([loadDay(day), listInstallers()]);
  const saved = await loadSavedPlan(day, stops);
  return (
    <RouteView day={day} today={today} stops={stops} installers={installers} saved={saved}
      configured={routePlanningConfigured()}
      mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || null}
      mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || null} />
  );
}
```
`searchParams` is a `Promise` in this Next version and is already awaited above — keep that pattern.

`RouteView.tsx` (`"use client"`) — state: `selected: string[]` (all installer ids), `plan: RoutePlan | null` (initially `saved?.plan ?? null`), `dirty: boolean` (false), `error: string | null`, `notice: string | null`, `pending` via `useTransition`. Layout:
```tsx
<div className="mx-auto flex max-w-[110rem] flex-col gap-6">
  <ScheduleHeader label={dayLabel} view="route"
    switchHrefs={{ week: `/admin/schedule?week=${day}`, month: `/admin/schedule?view=month&month=${day.slice(0, 7)}`, route: `/admin/schedule?view=route&day=${day}` }}
    nav={{ label: "Days",
      previous: { href: `/admin/schedule?view=route&day=${shift(day, -1)}`, text: "← Previous day" },
      current: { href: "/admin/schedule?view=route", text: "Today", icon: true },
      next: { href: `/admin/schedule?view=route&day=${shift(day, 1)}`, text: "Next day →" } }} />
  <div className="flex flex-wrap items-center gap-3">
    <fieldset className="flex flex-wrap gap-2"><legend className="sr-only">Installers</legend>
      {installers.map((i) => (
        <label key={i.id} className="flex min-h-11 items-center gap-2 border border-rule px-3 text-sm">
          <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} />{i.name}
        </label>))}
    </fieldset>
    <Button variant="solid" disabled={pending || Boolean(buildBlocker)} onClick={build}>Build routes</Button>
    <Button variant="outline" disabled={pending || !dirty} onClick={save}>Save routes</Button>
    {buildBlocker ? <p className="text-sm text-ink-soft">{buildBlocker}</p> : null}
  </div>
  {saved?.stale && !dirty ? <p role="status" className="text-sm text-overdue">Route is out of date — rebuild</p> : null}
  {error ? <p role="alert" className="text-sm text-overdue">{error}</p> : null}
  {notice ? <p role="status" className="text-sm text-ink-soft">{notice}</p> : null}
  <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <RouteMap … />
    <RouteLists … />
  </div>
</div>
```
`buildBlocker` = `selected.length === 0 ? "Pick at least one installer." : stops.length === 0 ? "Nothing is scheduled that day." : null`. `build` = `configured ? startTransition(async () => { const r = await buildRoutes(day, selected); r.ok ? (setPlan(r.plan), setDirty(true), setError(null)) : setError(r.error); }) : setError("Route planning is unavailable right now")`. `edit(next: RoutePlan)` = `setPlan(next); setDirty(true); startTransition(async () => { const r = await recheckRoutes(day, next, selected); r.ok ? setPlan(r.plan) : setError(r.error); })`. `save` = `startTransition(async () => { const r = await saveRoutes(day, plan!); if (r.ok) { setDirty(false); setNotice("Routes saved."); } else setError(r.error); })`. The grid places the map first so below `md` it stacks above the list. The day label is `new Date(\`${day}T12:00:00Z\`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" })`; `shift` is the same noon-UTC date arithmetic as `addDays` (copy it; `lib/calendar/week.ts` is server-only).

`RouteLists.tsx` — pure presentational (no `"use client"` needed, but it is imported by the client view, so no server imports): props `{ stops, installers, plan, pending, onMove, onShift }`.
- Without a plan: `<ol>` of routable stops sorted by `startsAt`, each "name · city", "Arrives …" when a window exists, "Pending" when `!confirmed`.
- With a plan: per route `<section aria-labelledby>` headed `` `${installer.name} · ${route.driveMinutes} min driving` ``, `<ol>` of stops each showing position, name, `formatTime(new Date(stop.arrival))`, "Misses its window" when `outsideWindow`, a `<select aria-label={\`Move ${name} to\`}>` (options: current installer disabled, others), and two icon buttons `aria-label={\`Move ${name} up\`}`/`down`, then `<a href={mapsDirectionsUrl(...)} target="_blank" rel="noreferrer">Open in Google Maps</a>` when non-null.
- "Didn't fit (n)" section when `plan.skipped.length`: name + reason.
- "Needs address (n)" section for `stops.filter((s) => s.lat === null)`: `<Link href={\`/admin/jobs/${s.jobId}\`}>{s.name}</Link>` + "Add or fix the address on the job page."
- Controls use `min-h-11`; the select `border border-rule bg-ivory px-3`.

For this task `RouteMap.tsx` is created as a placeholder-free minimal component that renders nothing but a bordered `<div aria-hidden className="hidden md:block min-h-80 border border-rule bg-sand/40" />` — Task 10 replaces its body. (It must exist so the view compiles and the test's mock path resolves.)

- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths, `npm run build`.**
- [ ] **Step 5: Commit** — `feat: the Route view on the schedule`

---

### Task 10: The map

**Files:**
- Modify: `app/admin/schedule/RouteMap.tsx`, `package.json` (`npm install @vis.gl/react-google-maps`), `next.config.ts` only if the CSP (check `grep -rn "Content-Security-Policy" next.config.* proxy.ts middleware.ts`) must allow `maps.googleapis.com`, `maps.gstatic.com`, `*.googleapis.com` for scripts, images and connect
- Create: `lib/routes/colors.ts`, `tests/admin/route-map.test.tsx`

**Interfaces:**
- Consumes: `DayStop`, `RoutePlan`, `Installer`.
- Produces:
```ts
// lib/routes/colors.ts — complete literal hex values, used as Pin/Polyline colours (not Tailwind classes)
export const ROUTE_COLORS: readonly string[]; // ["#8a6d3b", "#2f5d62", "#7a3e48", "#4a5a2f", "#3d4f7a", "#6b4e7a"]
export const routeColor: (index: number) => string;
// RouteMap props
export type RouteMapProps = { stops: DayStop[]; plan: RoutePlan | null; installers: Installer[]; apiKey: string | null; mapId: string | null };
```

- [ ] **Step 1: Write the failing tests** — `tests/admin/route-map.test.tsx` mocks `@vis.gl/react-google-maps`:
```ts
const status = { value: "LOADED" };
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: any) => <div data-testid="provider">{children}</div>,
  Map: ({ children }: any) => <div data-testid="google-map">{children}</div>,
  AdvancedMarker: ({ title, children }: any) => <div data-testid="marker" title={title}>{children}</div>,
  Pin: ({ glyphText, background }: any) => <span data-testid="pin" data-bg={background}>{glyphText}</span>,
  useMap: () => null,
  useMapsLibrary: () => null,
  useApiLoadingStatus: () => status.value,
  APILoadingStatus: { FAILED: "FAILED", AUTH_FAILURE: "AUTH_FAILURE", LOADED: "LOADED" },
}));
```
- No `apiKey` → renders nothing (`container` empty), so the lists stand alone.
- `useApiLoadingStatus` `FAILED` or `AUTH_FAILURE` → renders nothing.
- Without a plan → one grey marker per stop with coordinates (`data-bg="#9ca3af"`), titled by the job's name, none for stops without coordinates.
- With a plan → numbered pins "1", "2" per route in that installer's colour (`routeColor(installerIndex)`), and skipped stops stay grey.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — `npm install @vis.gl/react-google-maps`.

```tsx
"use client";

import { useEffect } from "react";
import {
  AdvancedMarker, APILoadingStatus, APIProvider, Map, Pin, useApiLoadingStatus, useMap, useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { routeColor } from "@/lib/routes/colors";
import type { DayStop, Installer, RoutePlan } from "@/lib/routes/types";

const GREY = "#9ca3af";
const LAS_VEGAS = { lat: 36.1147, lng: -115.1728 };

export type RouteMapProps = { stops: DayStop[]; plan: RoutePlan | null; installers: Installer[]; apiKey: string | null; mapId: string | null };

export function RouteMap(props: RouteMapProps) {
  if (!props.apiKey) return null;
  return (
    <APIProvider apiKey={props.apiKey} libraries={["geometry"]}>
      <LoadedMap {...props} />
    </APIProvider>
  );
}

function LoadedMap({ stops, plan, installers, mapId }: RouteMapProps) {
  const status = useApiLoadingStatus();
  // A map-script failure shows the lists without the map.
  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) return null;
  const located = stops.filter((s) => s.lat !== null && s.lng !== null);
  const byId = new Map(located.map((s) => [s.appointmentId, s]));
  const routed = new Set(plan?.routes.flatMap((r) => r.stops.map((s) => s.appointmentId)) ?? []);

  return (
    <div className="h-80 border border-rule md:h-[36rem]">
      <Map mapId={mapId ?? undefined} defaultCenter={LAS_VEGAS} defaultZoom={10} gestureHandling="greedy" disableDefaultUI={false}>
        {located.filter((s) => !routed.has(s.appointmentId)).map((s) => (
          <AdvancedMarker key={s.appointmentId} position={{ lat: s.lat!, lng: s.lng! }} title={s.name}>
            <Pin background={GREY} borderColor={GREY} glyphColor="#ffffff" />
          </AdvancedMarker>
        ))}
        {plan?.routes.map((route) => {
          const color = routeColor(installers.findIndex((i) => i.id === route.teamMemberId));
          const points = route.stops.map((s) => byId.get(s.appointmentId)).filter((s): s is DayStop => Boolean(s));
          return [
            ...points.map((s, i) => (
              <AdvancedMarker key={s.appointmentId} position={{ lat: s.lat!, lng: s.lng! }} title={s.name}>
                <Pin background={color} borderColor={color} glyphColor="#ffffff" glyphText={String(i + 1)} />
              </AdvancedMarker>
            )),
            <RouteLine key={`line-${route.teamMemberId}`} color={color} encoded={route.polyline}
              fallback={points.map((s) => ({ lat: s.lat!, lng: s.lng! }))} />,
          ];
        })}
        <FitBounds points={located.map((s) => ({ lat: s.lat!, lng: s.lng! }))} />
      </Map>
    </div>
  );
}

/** Google's encoded road path when we have one; straight segments between stops for a saved or edited route. */
function RouteLine({ color, encoded, fallback }: { color: string; encoded: string | null; fallback: google.maps.LatLngLiteral[] }) {
  const map = useMap();
  const geometry = useMapsLibrary("geometry");
  useEffect(() => {
    if (!map || (encoded && !geometry)) return;
    const path = encoded && geometry ? geometry.encoding.decodePath(encoded) : fallback;
    if (path.length < 2) return;
    const line = new google.maps.Polyline({ map, path, strokeColor: color, strokeOpacity: 0.85, strokeWeight: 4 });
    return () => line.setMap(null);
  }, [map, geometry, encoded, color, fallback]);
  return null;
}

function FitBounds({ points }: { points: google.maps.LatLngLiteral[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !points.length) return;
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
  }, [map, points]);
  return null;
}
```
Check the installed version's exports before writing: `grep -n "export" node_modules/@vis.gl/react-google-maps/dist/index.d.ts | grep -E "APILoadingStatus|useApiLoadingStatus|Pin|AdvancedMarker|useMapsLibrary"`. If `Pin` uses `glyph` instead of `glyphText` in the installed version, use `glyph` and update the test mock. `fallback` is recomputed each render — wrap it in `useMemo` in `LoadedMap` keyed on the route's stop ids to avoid redrawing on every render. Add `@types/google.maps` as a devDependency if `google.maps` types are not already pulled in by the library.

Wire it in `RouteView`: `<RouteMap stops={stops} plan={plan} installers={installers} apiKey={mapsKey} mapId={mapId} />`.

- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths, `npm run build`.**
- [ ] **Step 5: Commit** — `feat: the route map with numbered pins and road paths`

---

### Task 11: Windows and planned arrivals on the week view

**Files:**
- Modify: `lib/calendar/week.ts` (`ScheduleItem` gains `note`), `app/admin/schedule/ScheduleCard.tsx`, `tests/calendar/week.test.ts`, `tests/admin/schedule-page.test.tsx` (or a new `tests/admin/schedule-card.test.tsx`)

**Interfaces:**
- Consumes: `routeNotes` (Task 7), `windowLabel` (Task 2), `formatTime`.
- Produces: `ScheduleItem.note?: { window: string | null; plannedArrival: Date | null }` — optional so existing fixtures still type-check.

`lib/routes/day.ts` imports nothing from `lib/calendar`, so `lib/calendar/week.ts` may import `routeNotes` from it without a cycle.

- [ ] **Step 1: Write the failing tests**
- `tests/calendar/week.test.ts` — mock `@/lib/routes/day` (`routeNotes` resolves `new Map([["job1:install", { windowStart: "08:00", windowEnd: "10:00", plannedArrival: new Date("2026-09-24T16:10:00Z") }]])`): a tracker item for `job1` install carries `note: { window: "8:00 – 10:00 am", plannedArrival: <that date> }`; an Outlook item linked to `job1` install carries the same note; an unlinked Outlook event has no note; a `routeNotes` rejection logs and leaves notes off (the week still loads).
- `tests/admin/schedule-card.test.tsx` — a card with a note shows "Arrives 8:00 – 10:00 am" and "Route: 9:10 AM"; without a note shows neither.

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — at the end of `loadRange`, before each `return`, decorate:
```ts
async function withNotes(items: ScheduleItem[], from: Date, to: Date): Promise<ScheduleItem[]> {
  let notes: Map<string, RouteNote>;
  try {
    notes = await routeNotes(from, to);
  } catch (error) {
    console.error("Schedule could not read route notes", error);
    return items;
  }
  return items.map((item) => {
    const note = item.job ? notes.get(`${item.job.id}:${item.job.kind}`) : undefined;
    return note ? { ...item, note: { window: windowLabel(note.windowStart, note.windowEnd), plannedArrival: note.plannedArrival } } : item;
  });
}
```
and wrap each `return { items: … }` in `loadRange` as `items: await withNotes(…, from, to)`. In `ScheduleCard`, below the time line for a job card:
```tsx
{item.note?.window ? <span className="text-ink-soft">Arrives {item.note.window}</span> : null}
{item.note?.plannedArrival ? <span className="font-medium text-charcoal">Route: {formatTime(item.note.plannedArrival)}</span> : null}
```
- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths.**
- [ ] **Step 5: Commit** — `feat: arrival windows and route times on the week view`

---

### Task 12: End-to-end

**Files:**
- Create: `e2e/routes.spec.ts`, `e2e/fixtures/optimizer-stub.ts`
- Modify: `playwright.config.ts`

SCOPE: write the spec and run local checks. Do **NOT** run Playwright, migrations, or a deploy — the controller runs Playwright against `next start` on 127.0.0.1 with a Neon test branch (`E2E_POSTGRES_URL`) after migration 017 is applied to that branch.

**Interfaces:**
- Consumes: `ROUTE_OPTIMIZATION_URL`/`ROUTE_OPTIMIZATION_TOKEN` (Task 6), the Route view's accessible names (Task 9).
- Produces: `startOptimizerStub(port: number): Promise<{ close(): Promise<void>; requests: unknown[] }>` in `e2e/fixtures/optimizer-stub.ts`.

- [ ] **Step 1: The stub** — `e2e/fixtures/optimizer-stub.ts`:
```ts
import { createServer } from "node:http";

/**
 * Stands in for routeoptimization.googleapis.com. It answers any request by visiting every shipment
 * on vehicle 0 in the order given (or, for a re-check, in the injected order per vehicle), one hour apart
 * from the global start, with 10 minutes of driving between stops.
 */
export async function startOptimizerStub(port: number) {
  const requests: any[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      requests.push(body);
      if (req.headers.authorization !== "Bearer e2e-token") { res.writeHead(401).end("{}"); return; }
      const start = Date.parse(body.model.globalStartTime);
      const injected = body.injectedSolutionConstraint?.routes as { vehicleIndex: number; visits: { shipmentIndex: number }[] }[] | undefined;
      const plan = injected ?? [{ vehicleIndex: 0, visits: body.model.shipments.map((_: unknown, i: number) => ({ shipmentIndex: i })) }];
      const routes = plan.map((route) => ({
        vehicleIndex: route.vehicleIndex,
        visits: route.visits.map((v, i) => ({ shipmentIndex: v.shipmentIndex, startTime: new Date(start + i * 3_600_000).toISOString() })),
        transitions: route.visits.map((_, i) => ({ travelDuration: i === 0 ? "0s" : "600s" })),
      }));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ routes }));
    });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { requests, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
```

- [ ] **Step 2: Config** — in `playwright.config.ts`: add `routes` to the mobile project's `testIgnore` group; add `e2e-routes-owner@example.com` to `ADMIN_EMAILS`; add to the `env` block `ROUTE_OPTIMIZATION_URL: "http://127.0.0.1:3199/optimize"`, `ROUTE_OPTIMIZATION_TOKEN: "e2e-token"`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY: ""`, `GOOGLE_GEOCODING_KEY: ""` (geocoding must never reach Google from e2e; coordinates are seeded).

- [ ] **Step 3: The spec** — `e2e/routes.spec.ts`, following `e2e/appointments.spec.ts` (serial, desktop, `signIn`, cleanup):
```ts
import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
import { startOptimizerStub } from "./fixtures/optimizer-stub";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run route tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-routes-owner@example.com";
const STAMP = Date.now();
// Far enough ahead that no other spec's appointments share the day.
const lasVegasDay = (days: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(Date.now() + days * 86_400_000));
const DAY = lasVegasDay(40);

let stub: Awaited<ReturnType<typeof startOptimizerStub>>;
let ana: string, bo: string;
const jobs: string[] = [];

async function signIn(page: Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

test.beforeAll(async () => {
  stub = await startOptimizerStub(3199);
  [{ id: ana }] = await sql()`insert into team_members (name, role) values (${`E2E Route Ana ${STAMP}`}, 'installer') returning id`;
  [{ id: bo }] = await sql()`insert into team_members (name, role) values (${`E2E Route Bo ${STAMP}`}, 'installer') returning id`;
  for (const [n, lat, lng] of [[1, 36.03, -115.04], [2, 36.1, -115.2]] as const) {
    const [{ id }] = await sql()`insert into leads (name, phone, email, city, address, source, status, lat, lng, geocode_status, geocoded_at)
      values (${`E2E Route Job ${n} ${STAMP}`}, '7025550188', 'e2e-routes@example.com', 'Henderson', ${`${n} Sample St`}, 'phone', 'sold',
              ${lat}, ${lng}, 'ok', now()) returning id`;
    jobs.push(id);
    await sql()`insert into appointments (lead_id, kind, starts_at, all_day, duration_minutes, confirmed_at, confirmed_by)
      values (${id}, 'install', (${DAY}::text || ' 09:00')::timestamp at time zone 'America/Los_Angeles', true, 120, now(), 'e2e')`;
  }
});

test.afterAll(async () => {
  if (!url) return;
  await stub?.close();
  // route_stops and appointments cascade from leads and team_members.
  await sql()`delete from leads where name like 'E2E Route Job %'`;
  await sql()`delete from team_members where name like 'E2E Route %'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

test("build, move a stop, save, and see it on the job and the week", async ({ page }) => {
  await signIn(page);
  await page.goto(`/admin/schedule?view=route&day=${DAY}`);
  await expect(page.getByRole("link", { name: "Route" })).toHaveAttribute("aria-current", "page");

  // Other installers from other specs may exist: route only ours.
  for (const box of await page.getByRole("checkbox").all()) {
    const name = await box.evaluate((el) => el.parentElement?.textContent ?? "");
    if (!name.includes(String(STAMP))) await box.uncheck();
  }
  await expect(page.getByRole("button", { name: "Save routes" })).toBeDisabled();
  await page.getByRole("button", { name: "Build routes" }).click();

  const anaRoute = page.getByRole("region", { name: new RegExp(`E2E Route Ana ${STAMP}`) });
  await expect(anaRoute.getByText(`E2E Route Job 1 ${STAMP}`)).toBeVisible();
  await expect(anaRoute.getByText(`E2E Route Job 2 ${STAMP}`)).toBeVisible();
  await expect(anaRoute.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute("href", /google\.com\/maps\/dir\//);

  await anaRoute.getByRole("combobox", { name: `Move E2E Route Job 2 ${STAMP} to` }).selectOption({ label: `E2E Route Bo ${STAMP}` });
  const boRoute = page.getByRole("region", { name: new RegExp(`E2E Route Bo ${STAMP}`) });
  await expect(boRoute.getByText(`E2E Route Job 2 ${STAMP}`)).toBeVisible();
  // The move was re-checked with the owner's order fixed.
  expect(stub.requests.at(-1).injectedSolutionConstraint).toBeDefined();

  await page.getByRole("button", { name: "Save routes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Routes saved." })).toBeVisible();

  const [assigned] = await sql()`select assigned_to from leads where id = ${jobs[1]}`;
  expect(assigned.assigned_to).toBe(bo);
  const [stops] = await sql()`select count(*)::int as n from route_stops where route_date = ${DAY}::date`;
  expect(stops.n).toBe(2);

  await page.goto(`/admin/jobs/${jobs[1]}`);
  await expect(page.getByText(`E2E Route Bo ${STAMP}`).first()).toBeVisible();

  // The stub puts every route's first stop at the start of the working day: 9:00 AM.
  await page.goto(`/admin/schedule?week=${DAY}`);
  const card = page.getByRole("link", { name: new RegExp(`E2E Route Job 2 ${STAMP}`) });
  await expect(card.getByText("Route: 9:00 AM")).toBeVisible();
});

test("a changed appointment makes the saved route out of date, and saving a stale build is refused", async ({ page }) => {
  await signIn(page);
  await sql()`update appointments set updated_at = now() where lead_id = ${jobs[0]}`;
  await page.goto(`/admin/schedule?view=route&day=${DAY}`);
  await expect(page.getByText("Route is out of date — rebuild")).toBeVisible();

  for (const box of await page.getByRole("checkbox").all()) {
    const name = await box.evaluate((el) => el.parentElement?.textContent ?? "");
    if (!name.includes(String(STAMP))) await box.uncheck();
  }
  await page.getByRole("button", { name: "Build routes" }).click();
  await expect(page.getByRole("button", { name: "Save routes" })).toBeEnabled();
  await sql()`update appointments set updated_at = now() + interval '1 second' where lead_id = ${jobs[0]}`;
  await page.getByRole("button", { name: "Save routes" }).click();
  await expect(page.getByRole("alert")).toHaveText("This day changed — rebuild first.");
});
```
If the week view's source is Outlook on the test branch (it is not — `calendarEnabled()` is false without Outlook env), the tracker path is what renders; that is the path asserted.

- [ ] **Step 4: Local checks** — `npx tsc --noEmit -p .` (typecheck includes `e2e/`), `npx eslint e2e/routes.spec.ts e2e/fixtures/optimizer-stub.ts playwright.config.ts`, full vitest suite once, `npm run build`.
- [ ] **Step 5: Commit** — `test: end-to-end route build, move and save`

---

### Task 13: Owner setup and live check

**Files:**
- Create: `docs/route-setup.md` (matches the existing `docs/outlook-setup.md` pattern the Settings page already points to)
- Modify: `app/admin/settings/RoutesSection.tsx` (one status line), `tests/admin/routes-section.test.tsx`

**Interfaces:**
- Consumes: `routePlanningConfigured()` (Task 6).
- Produces: `RoutesSection` prop `planningConfigured: boolean`, rendering "Route planning is connected." or "Route planning is not set up yet. Follow docs/route-setup.md." — so the owner can see from Settings whether the keys landed.

- [ ] **Step 1: Write the failing test** — `routes-section.test.tsx`: with `planningConfigured={false}` shows "Route planning is not set up yet. Follow docs/route-setup.md."; with `true` shows "Route planning is connected." Pass `routePlanningConfigured()` from `app/admin/settings/page.tsx` (mock `@/lib/routes/optimize` in `settings-page.test.tsx`).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** the status line, then write `docs/route-setup.md` with exactly these sections:

**1. Google Cloud project** — create or choose a project; turn on billing (usage is expected to stay within the monthly free credit); set a budget alert at $10. Enable **Maps JavaScript API**, **Geocoding API**, **Route Optimization API**.

**2. Browser key** → `NEXT_PUBLIC_GOOGLE_MAPS_KEY`. Credentials → Create API key. Application restriction: *Websites*, `https://premiershadesolutions.com/*` (apex only — the site has no www host). API restriction: *Maps JavaScript API* only.

**3. Map ID** → `NEXT_PUBLIC_GOOGLE_MAP_ID`. Maps Management → Create Map ID, type *JavaScript*, *Vector*.

**4. Server geocoding key** → `GOOGLE_GEOCODING_KEY`. A second API key restricted to *Geocoding API*; no application restriction (Vercel's outbound IPs are not fixed).

**5. Service account** → `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`. IAM → Service accounts → Create `pss-routes`; grant **Route Optimization Editor** (`roles/routeoptimization.editor`). Keys → Add key → JSON; paste the whole file's contents as the env var value. Project ID from the dashboard.

**6. Vercel** — `npx vercel env add <NAME> production` for each of the five (the two `NEXT_PUBLIC_` values are build-time, so redeploy after adding). Never add `ROUTE_OPTIMIZATION_URL` or `ROUTE_OPTIMIZATION_TOKEN` to Vercel — they are test-only and would bypass Google.

**7. Deploy order** (the controller runs these, not an implementer):
1. Apply migration 017 to production: `node scripts/migrate.mjs`.
2. Deploy: `npx vercel --prod` (git push does not deploy), then load the live site.
3. Backfill: `node scripts/geocode-backfill.mjs`; note the ok / not found / error counts.
4. Settings → Routes shows "Route planning is connected."; check the working day and lengths.

**8. Live check (required before calling this done)**
- [ ] Settings shows the connected line.
- [ ] A job page: book an install with an arrival window 8:00–10:00 and length 4; confirm; the customer email (send to an owner address) says "We'll arrive between 8:00 and 10:00 am."
- [ ] Edit that job's address; within a minute `select lat, lng, geocode_status from leads where id = '<id>'` shows `ok` and new coordinates, and `address` is unchanged as typed.
- [ ] Schedule → Route on a real day with at least three appointments and two installers: the map shows grey pins; **Build routes** returns within ~15 s; each installer has coloured numbered pins, a road-following line, arrival times, and drive minutes; every promised window is met or listed under "Didn't fit" with a reason.
- [ ] Move one stop to the other installer and one stop up: times refresh; any broken window shows "Misses its window".
- [ ] **Save routes**; the moved job's page shows the new assignee and its Activity has "Assigned to … (Installer) by route"; the week view card shows "Route: <time>".
- [ ] Reschedule one of those appointments; the Route view shows "Route is out of date — rebuild".
- [ ] On a phone: the map sits above the lists, and **Open in Google Maps** opens the Maps app with every stop in order.
- [ ] In Vercel logs, confirm no "Route planning failed" or "Geocoding failed" errors from the check.
- [ ] Google Cloud → Billing → Reports: the check's cost is within the free credit.

- [ ] **Step 4: Focused tests, full suite, typecheck, lint changed paths, `npm run build`.**
- [ ] **Step 5: Commit** — `docs: route planner setup and live check`

---

## Self-review against the spec

**Coverage** (spec section → task):
- §1 success criteria: build within seconds (6, 8, 9), windows met or "Didn't fit" with reason (6, 9), Open in Google Maps (9), a third installer is routed with no code change (7 `listInstallers` by role; 9 checkboxes).
- §2 decisions: Google solver (6); Maps JS/Geocoding/Route Optimization (5, 6, 10); no start location (6, test asserts); windows and lengths at booking and in the email (3, 4); installers by role with per-day checkbox (7, 9); working day 9–18 editable (1, 2); preview until save (8, 9); list controls not dragging, every change re-checks (9, 8); geocoding never rewrites the address (5, test asserts).
- §3 data model: all columns, checks, `route_settings`, `route_stops` (plus `saved_count`), 08:00→09:00 (1). Save deletes/inserts, sets `assigned_to`, logs `job_events` (7). Staleness incl. cancelled appointments (7).
- §4 geocoding: module, `after()` on createJob, updateDetails-on-change, public lead insert (+ questionnaire), statuses, retry on next build, backfill, Needs address link (5, 7, 9).
- §5 booking: window selects in 30-min steps / Any time, length in 0.25 h pre-filled by kind, schema + `saveAppointment`, confirmation reset (3); email line (4); week card window and planned arrival (11).
- §6 Route view: URL, third ViewSwitch link, default today, layout and `md` stacking, header controls, grey pins before build, saved route with stale banner, colours/numbered pins/polylines, per-installer times/drive/maps link, Didn't fit, Needs address (9, 10); `@vis.gl/react-google-maps` with `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (10).
- §7 actions: `buildRoutes`, `recheckRoutes`, `saveRoutes` with `requireAdmin` and zod, pure builder/parser separate from HTTP (6, 8). Re-check mechanism corrected (see note 1).
- §8 errors: missing config / Google errors / 15 s timeout → message, booking unaffected (6, 8, 9); disabled Build with reason (9); map-script failure → lists only (10); save race message (7, 8).
- §9 Settings → Routes (2, 13).
- §10 testing: every listed Vitest area (2–11), Playwright with stubbed optimizer (12), live check (13).
- §11 owner setup (13, plus the Map ID in note 11).
- §12 not built: nothing here adds AI, start locations, breaks, multi-day, traffic, dragging, or an installer view.
- §13 other sessions: no `project_no` or `JOB_COLUMNS` change in this plan; Settings page merge noted in Task 2.

**Placeholder scan:** no TBD/TODO. Two "verify then adapt" instructions remain deliberately, each with the exact fallback spelled out: the CTE delete-then-upsert in Task 7 (fallback: `sql.transaction` with two queries), and the `Pin` prop name in Task 10 (fallback: `glyph`).

**Type consistency:** `RoutePlan`/`PlanRoute`/`PlanStop`/`SkippedStop`/`DayStop`/`Installer`/`RouteSettings`/`SavedRoute` defined in Task 2 and used unchanged in 6–12. `saveAppointment`'s new `timing` parameter (Task 3) is matched in `bookAppointment` and its test. `updateDetails` return type change (Task 5) is matched in `saveDetails`. `saveQuestionnaire` → `string | null` (Task 5) matched in `submitQuestionnaire`. `recheckRoutes(day, plan, installerIds)` (Task 8) matched in `RouteView` (Task 9). `SavedStopRow.savedCount` (Task 7) matches the `saved_count` column created in Task 1. `ViewSwitch`/`ScheduleHeader` gain `route` in Task 9 and every caller (Week, Month, Route) is updated there.
