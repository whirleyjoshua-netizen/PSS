# The Route Creator — Design

**Date:** 2026-09-16
**Status:** Approved in conversation, pending the owner's review of this spec.
**Scope:** A **Route** view on the admin schedule. It pins a day's appointments on a Google map, asks Google Route Optimization to split them between the installers and order each list around arrival windows, and saves the approved routes. Appointments gain an arrival window and an estimated length. Every job address is geocoded.

## 1. Purpose

**The problem.**
- Planning an installer's day by hand means reading addresses, guessing which ones are close together, and checking promised arrival times in your head.
- Appointments store only a start time. Nothing records how long a job takes or the window the customer was promised, so no tool could plan a day even if one existed.

**The fix.** Record a window and a length when booking, geocode every address once, and let Google's routing service build the routes. The owner reviews them on a map, adjusts them, and saves.

**Success means:**
- The owner opens Thursday, clicks **Build routes**, and within seconds sees both installers' stops, in order, on a map with arrival times.
- Every promised window is met, or the job is listed under "Didn't fit" with the reason.
- An installer taps **Open in Google Maps** and gets the whole day as turn-by-turn directions.
- Adding a third installer on the Team page is all it takes for them to be routed.

## 2. Decisions made in conversation

- **Google, not an AI model, builds the route.** Google Route Optimization (`optimizeTours`) uses real drive times and treats windows as hard constraints. An AI helper that turns plain-English requests into constraints is a possible later slice and is not built here.
- **Google Maps everywhere:** Maps JavaScript for display, Geocoding for addresses, Route Optimization for solving.
- **A route starts at the installer's first job.** No home or shop start location: vehicles get no start location.
- **Windows and lengths are set at booking** (option A). The customer's confirmation email shows the window.
- **Installers are the team members with role `installer`.** Nothing is hard-coded. A per-day checkbox leaves out anyone who is off.
- **Working day defaults to 9:00–18:00** America/Los_Angeles, editable in Settings.
- **Building is a preview.** Nothing is written until **Save routes**.
- **Adjusting uses list controls, not map dragging.** Each stop has "move to <installer>" and up/down, which works on a phone. Every change re-checks times with Google.
- **Geocoding never rewrites the address.** It only stores coordinates. The customer project page (another session) displays `address`/`city` as typed.

## 3. Data model — migration `017_routes.sql`

Numbers are coordinated: 016 belongs to the customer project page (`project_no`) and 018 to the install calculator. Like every migration, it is safe to re-run.

### Appointments

```sql
alter table appointments add column if not exists window_start time;      -- null = working-day start
alter table appointments add column if not exists window_end   time;      -- null = working-day end
alter table appointments add column if not exists duration_minutes integer
  check (duration_minutes between 15 and 720);                            -- null = default for kind
```

- If a window is set, both ends must be set and `window_start < window_end` (check constraint).
- Existing all-day installs stored at 08:00 local time move to 09:00 local time, so they match the new working day. The Outlook mirror follows through the existing sync.

### Leads

```sql
alter table leads add column if not exists lat double precision;
alter table leads add column if not exists lng double precision;
alter table leads add column if not exists geocoded_at timestamptz;
alter table leads add column if not exists geocode_status text
  check (geocode_status in ('ok','not_found','error'));
```

Only the geocoder writes these columns. The customer project page reads leads and never writes them.

### Route settings (a single row)

```sql
create table if not exists route_settings (
  id boolean primary key default true check (id),
  day_start time not null default '09:00',
  day_end   time not null default '18:00',
  consultation_minutes integer not null default 60,
  measure_minutes      integer not null default 60,
  install_minutes      integer not null default 240,
  service_minutes      integer not null default 90
);
```

### Saved routes

```sql
create table if not exists route_stops (
  id uuid primary key default gen_random_uuid(),
  route_date date not null,
  appointment_id uuid not null unique references appointments on delete cascade,
  team_member_id uuid not null references team_members on delete cascade,
  position integer not null,
  planned_arrival timestamptz not null,
  drive_minutes integer not null,          -- from the previous stop; 0 for the first
  saved_at timestamptz not null default now(),
  unique (route_date, team_member_id, position)
);
```

- Saving a day deletes that date's rows and inserts the new ones in one statement. It also sets `leads.assigned_to` for each stop's job and writes a `job_events` log row per reassigned job.
- **Out of date:** a day's route is stale when any of its appointments has `updated_at` later than the route's `saved_at`, when a stop's appointment is no longer on that date, or when that date has an appointment with no stop. Cancelled appointments cascade away and also count as stale, because the stop count changes. This check is computed, not stored.

## 4. Geocoding

- `lib/routes/geocode.ts` calls the Google Geocoding API with `"<address>, <city>, NV"`, restricted to the US.
- It runs after `createJob`, and after `updateDetails` when `address` or `city` changed. It is called with `after()` so saving a job never waits on Google or fails because of it. The public site's lead insert gets the same `after()` call.
- Results set `lat`/`lng`, `geocode_status='ok'` and `geocoded_at`. A zero-result lookup sets `not_found`; a network or quota failure sets `error`, and the next build retries it.
- Backfill: `scripts/geocode-backfill.mjs` geocodes every lead with `geocoded_at is null`, run once after deploy.
- The Route tab's "Needs address" link opens the job page to fix it; saving re-geocodes.

## 5. Booking changes

- The appointment card on the job page gets **Arrival window** (two time selects in 30-minute steps, or "Any time") and **Length** (hours, 0.25 steps, pre-filled from `route_settings` for the kind).
- The zod schema and `saveAppointment` accept and store the new fields. Changing them counts as a change: confirmation resets, as it does today.
- `lib/appointments/send.ts` adds "We'll arrive between 8:00 and 10:00 am" when a window is set, and says nothing new otherwise.
- The week view card shows the window, and the planned arrival once a route is saved.

## 6. The Route view

**Route:** `/admin/schedule?view=route&day=YYYY-MM-DD`. `ViewSwitch` gains a third link. The default day is today.

**Layout:** a map on the left and the list on the right. Below `md` the map is on top.
- Header: previous/next day, a checkbox per installer (all checked), **Build routes**, **Save routes** (enabled only after a build or an edit).
- Before any build: the day's appointments as grey pins, with a time-sorted list.
- A saved route loads as-is, with the "Route is out of date — rebuild" banner when stale.
- After a build: one colour per installer, numbered pins, polylines from Google's encoded route, and per installer the stops with arrival times, total drive time and **Open in Google Maps** (a `google.com/maps/dir/` URL with the stops in order).
- **Didn't fit (n)**: skipped appointments with Google's reason in plain English.
- **Needs address (n)**: appointments whose lead has no coordinates, each linking to the job.

**Client map:** `@vis.gl/react-google-maps` with a browser key `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, restricted by HTTP referrer to the site's domain.

## 7. Building and saving

`app/admin/schedule/route-actions.ts` holds three server actions. Each calls `requireAdmin()`.

1. **`buildRoutes(day, installerIds)`** loads the day's appointments with coordinates, windows and lengths, then calls `lib/routes/optimize.ts`, which:
   - builds an `optimizeTours` request with a shipment per appointment: one delivery at the lead's lat/lng, `duration` = length, `timeWindows` = window or working day, and `allowedVehicleIndices` limited to the assigned installer when the lead is already assigned *and* that installer is selected.
   - adds one vehicle per selected installer, with no start location, `startTimeWindows`/`endTimeWindows` = working day, and `costPerHour` on travel so the least driving wins.
   - posts to `routeoptimization.googleapis.com/v1/projects/<id>:optimizeTours` using a service account (`GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, server-only).
   - parses the response into `{ routes: [{ teamMemberId, stops: [{ appointmentId, arrival, driveMinutes }], polyline, driveMinutes }], skipped: [{ appointmentId, reason }] }`.
   It returns that plan. Nothing is written.
2. **`recheckRoutes(day, plan)`** runs after a manual move. It sends the same request with each vehicle's stops fixed as an ordered route (`injectedFirstSolutionRoutes` plus `considerRoadTraffic: false`, with the solve mode set to validate only), then returns the times and any window now broken, which is flagged on that stop.
3. **`saveRoutes(day, plan)`** validates with zod that every appointment belongs to that day and every installer exists, then writes as described in section 3 and revalidates the schedule.

The request builder and response parser are pure functions, kept separate from the HTTP call so they can be tested without Google.

## 8. Errors

- Missing Google config, or Google errors or timeouts (15 s): the view still shows pins and the list, **Build** shows "Route planning is unavailable right now", and booking is unaffected.
- No installers checked, or no appointments that day: **Build** is disabled with the reason shown beside it.
- A map-script failure shows the lists without the map.
- Save races: if an appointment changed after the build, `saveRoutes` refuses with "This day changed — rebuild first."

## 9. Settings

A **Routes** section in Settings edits `route_settings`: working day start and end, and default length per appointment kind.

## 10. Testing

- **Vitest:**
  - the request builder (windows, defaults, locked assignments, deselected installers) and the response parser (order, arrivals, skipped reasons)
  - staleness rules
  - booking schema and `saveAppointment` with the new fields
  - the email's window line
  - re-geocoding only when address or city changes
  - `saveRoutes` writing stops and assignments
  - Route view rendering its states

  Google is mocked throughout.
- **Playwright:** against `next start` and a Neon test branch, with the optimizer route stubbed. It opens the Route view, builds, moves a stop, saves, and checks the assignment and the week-view arrival time.
- **Live check:** one real build with the production keys on a real day before this is called done.

## 11. Setup the owner does

A Google Cloud project with billing turned on (usage is expected to stay within the monthly free credit), with the Maps JavaScript, Geocoding and Route Optimization APIs enabled. It needs a browser key restricted to the site and a service account with the Route Optimization Editor role. These go into Vercel env vars as `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `GOOGLE_GEOCODING_KEY`, `GOOGLE_CLOUD_PROJECT_ID` and `GOOGLE_SERVICE_ACCOUNT_JSON`.

## 12. Not built

- AI helper for plain-English routing requests.
- Home or shop start locations, breaks, and multi-day routes.
- Live traffic and real-time installer tracking.
- Dragging pins on the map.
- A view for installers themselves (they don't sign in); they use the Google Maps link.

## 13. Other sessions

- **pss-48** (customer project page) adds `project_no` to `JOB_COLUMNS`/`toJob` in `lib/admin/jobs.ts` and lands first. Keep both sides when merging.
- **pss-c7** (install calculator) owns migration 018 and a Settings section; that Settings file may need a merge.
