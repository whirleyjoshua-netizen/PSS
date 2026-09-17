import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
import { SKIP_LATITUDE, startOptimizerStub, STUB_PORT } from "./fixtures/optimizer-stub";

/*
 * Route creator end to end. It writes to the database, so it runs only when BOTH are set:
 *   E2E_POSTGRES_URL   a Neon test branch (never production)
 *   E2E_DB_HOST_ALLOW  part of that branch's host, e.g. its endpoint id; the URL's host must contain it
 * With E2E_POSTGRES_URL set and the host not allowed, loading this file throws.
 * Optimizing goes to a local stub on port 3199 (see playwright.config.ts).
 */
const url = process.env.E2E_POSTGRES_URL;
if (url) {
  const allow = process.env.E2E_DB_HOST_ALLOW;
  const host = new URL(url).hostname;
  if (!allow || !host.includes(allow)) {
    throw new Error(`routes.spec.ts refuses to run: E2E_DB_HOST_ALLOW must be set to part of the test branch host, and ${host} must contain it.`);
  }
}
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run route tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-routes-owner@example.com";
const STAMP = Date.now();
// Far enough ahead that no other spec's appointments share the day.
const lasVegasDay = (days: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(Date.now() + days * 86_400_000));
const DAY = lasVegasDay(40);
const ANA = `E2E Route Ana ${STAMP}`;
const BO = `E2E Route Bo ${STAMP}`;
const JOB = (n: number) => `E2E Route Job ${n} ${STAMP}`;

let stub: Awaited<ReturnType<typeof startOptimizerStub>>;
let bo: string;
/** The week card's "Route: 9:00 AM" for the branch's route_settings day start, where the stub starts every route. */
let routeLabel: RegExp;
/** Jobs 1 and 2 have coordinates; job 3 has no address; the stub never fits job 4. */
const jobs: string[] = [];

async function signIn(page: Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

const openRouteView = async (page: Page) => {
  await page.goto(`/admin/schedule?view=route&day=${DAY}`);
  await expect(page.getByRole("link", { name: "Route", exact: true })).toHaveAttribute("aria-current", "page");
};

/** Installers from other specs may exist: route only ours. */
async function selectOurInstallers(page: Page) {
  for (const box of await page.getByRole("group", { name: "Installers" }).getByRole("checkbox").all()) {
    const name = await box.evaluate((el) => el.parentElement?.textContent ?? "");
    if (!name.includes(String(STAMP))) await box.uncheck();
  }
}

const route = (page: Page, installer: string) => page.getByRole("region", { name: new RegExp(`^${installer} ·`) });
const needsAddress = (page: Page) => page.getByRole("region", { name: /^Needs address/ });
const staleBanner = (page: Page) => page.getByRole("status").getByText("Route is out of date — rebuild");

test.beforeAll(async () => {
  if (!url) return;
  stub = await startOptimizerStub(STUB_PORT);
  const [settings] = await sql()`select day_start::text as day_start from route_settings`;
  // The app falls back to 09:00 when route_settings has no row, so the expected label does too.
  if (!settings) console.log("routes.spec: route_settings has no row; expecting the 09:00 default day start");
  const [h, m] = String(settings?.day_start ?? "09:00").split(":").map(Number);
  routeLabel = new RegExp(`^Route: ${h % 12 || 12}:${String(m).padStart(2, "0")}\\s${h < 12 ? "AM" : "PM"}$`);
  await sql()`insert into team_members (name, role) values (${ANA}, 'installer') returning id`;
  [{ id: bo }] = await sql()`insert into team_members (name, role) values (${BO}, 'installer') returning id`;
  const seeds = [[1, "1 Sample St", 36.03, -115.04], [2, "2 Sample St", 36.1, -115.2], [3, null, null, null],
    [4, "4 Sample St", SKIP_LATITUDE, -115.1]] as const;
  for (const [n, address, lat, lng] of seeds) {
    const [{ id }] = await sql()`insert into leads (name, phone, email, city, address, source, status, lat, lng, geocode_status, geocoded_at)
      values (${JOB(n)}, '7025550188', 'e2e-routes@example.com', 'Henderson', ${address}, 'phone', 'sold',
              ${lat}, ${lng}, ${lat === null ? null : "ok"}, ${lat === null ? null : new Date()}) returning id`;
    jobs.push(id);
    await sql()`insert into appointments (lead_id, kind, starts_at, all_day, duration_minutes, confirmed_at, confirmed_by)
      values (${id}, 'install', (${DAY}::text || ' 09:00')::timestamp at time zone 'America/Los_Angeles', true, 120, now(), 'e2e')`;
  }
});

test.afterAll(async () => {
  if (!url) return;
  await stub?.close();
  // route_stops, appointments and job_events cascade from leads and team_members.
  await sql()`delete from leads where name like ${`E2E Route Job % ${STAMP}`}`;
  await sql()`delete from team_members where name like ${`E2E Route % ${STAMP}`}`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

test("build, move a stop, save, and see it on the job and the week", async ({ page }) => {
  await signIn(page);
  await openRouteView(page);
  // A job with no address is listed to fix, and never blocks the day.
  await expect(needsAddress(page).getByRole("link", { name: JOB(3) })).toBeVisible();

  await selectOurInstallers(page);
  await expect(page.getByRole("button", { name: "Save routes" })).toBeDisabled();
  await page.getByRole("button", { name: "Build routes" }).click();

  await expect(route(page, ANA).getByText(JOB(1))).toBeVisible();
  await expect(route(page, ANA).getByText(JOB(2))).toBeVisible();
  await expect(route(page, ANA).getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute("href", /google\.com\/maps\/dir\//);
  expect(stub.requests.at(-1)?.injectedSolutionConstraint).toBeUndefined();
  await expect(page.getByRole("region", { name: /^Didn't fit/ })
    .getByText(`${JOB(4)} — It can't be reached within anyone's working day.`)).toBeVisible();
  const built = stub.requests.length;

  await route(page, ANA).getByRole("combobox", { name: `Move ${JOB(2)} to` }).selectOption({ label: BO });
  await expect(route(page, BO).getByText(JOB(2))).toBeVisible();
  await expect(route(page, ANA).getByText(JOB(2))).toHaveCount(0);
  // The list moves at once; the re-check with the owner's order fixed follows.
  await expect.poll(() => stub.requests.length).toBe(built + 1);
  expect(stub.requests.at(-1)?.injectedSolutionConstraint).toBeDefined();
  await expect(page.getByRole("button", { name: "Save routes" })).toBeEnabled();

  await page.getByRole("button", { name: "Save routes" }).click();
  await expect(page.getByRole("status").getByText("Routes saved.")).toBeVisible();
  await expect(page.getByRole("alert")).toBeEmpty();
  await expect(needsAddress(page).getByRole("link", { name: JOB(3) })).toBeVisible();

  const [assigned] = await sql()`select assigned_to from leads where id = ${jobs[1]}`;
  expect(assigned.assigned_to).toBe(bo);
  const [stops] = await sql()`select count(*)::int as n from route_stops s join appointments a on a.id = s.appointment_id
    where s.route_date = ${DAY}::date and a.lead_id = any(${jobs}::uuid[])`;
  expect(stops.n).toBe(2);

  await page.goto(`/admin/jobs/${jobs[1]}`);
  await expect(page.getByLabel("Assigned to")).toHaveValue(bo);

  // The stub puts every route's first stop at the start of the working day: 9:00 AM.
  await page.goto(`/admin/schedule?week=${DAY}`);
  const card = page.getByRole("link", { name: new RegExp(JOB(2)) });
  await expect(card.getByText(routeLabel)).toBeVisible();
});

test("the saved plan loads and saves again unchanged", async ({ page }) => {
  await signIn(page);
  await openRouteView(page);
  await expect(route(page, BO).getByText(JOB(2))).toBeVisible();
  await expect(staleBanner(page)).toHaveCount(0);
  await selectOurInstallers(page);

  // Out and back: the plan ends as it was loaded, still stamped with the saved time.
  await expect(page.getByRole("region", { name: /^Didn't fit/ }).getByText(JOB(4))).toBeVisible();
  const loaded = stub.requests.length;
  await route(page, BO).getByRole("combobox", { name: `Move ${JOB(2)} to` }).selectOption({ label: ANA });
  await expect.poll(() => stub.requests.length).toBe(loaded + 1);
  await expect(route(page, ANA).getByRole("combobox", { name: `Move ${JOB(2)} to` })).toBeEnabled();
  await route(page, ANA).getByRole("combobox", { name: `Move ${JOB(2)} to` }).selectOption({ label: BO });
  await expect.poll(() => stub.requests.length).toBe(loaded + 2);
  await expect(route(page, BO).getByRole("combobox", { name: `Move ${JOB(2)} to` })).toBeEnabled();

  await page.getByRole("button", { name: "Save routes" }).click();
  await expect(page.getByRole("status").getByText("Routes saved.")).toBeVisible();
  await expect(page.getByRole("alert")).toBeEmpty();
  const rows = await sql()`select l.name, m.name as installer, s.position from route_stops s
    join appointments a on a.id = s.appointment_id join leads l on l.id = a.lead_id
    join team_members m on m.id = s.team_member_id where s.route_date = ${DAY}::date and a.lead_id = any(${jobs}::uuid[]) order by l.name`;
  expect(rows).toEqual([
    { name: JOB(1), installer: ANA, position: 1 },
    { name: JOB(2), installer: BO, position: 1 },
  ]);
});

test("saving details without an address change keeps the pin", async ({ page }) => {
  await signIn(page);
  await page.goto(`/admin/jobs/${jobs[1]}?edit=details`);
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status").getByText("Saved", { exact: true })).toBeVisible();
  const [lead] = await sql()`select lat, lng, geocode_status from leads where id = ${jobs[1]}`;
  expect(lead).toEqual({ lat: 36.1, lng: -115.2, geocode_status: "ok" });

  await openRouteView(page);
  await expect(staleBanner(page)).toHaveCount(0);
});

// Depends on test 1's save: only a saved route can go out of date.
test("an appointment edit after test 1's save makes the route out of date", async ({ page }) => {
  await signIn(page);
  await page.goto(`/admin/jobs/${jobs[1]}`);
  const appointments = page.getByRole("region", { name: "Appointments" });
  await appointments.getByRole("button", { name: "Reschedule" }).click();
  const dialog = page.getByRole("dialog", { name: "Reschedule" });
  await dialog.getByLabel("From").selectOption("08:00");
  await dialog.getByLabel("To").selectOption("10:00");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(appointments.getByRole("button", { name: "Confirm schedule" })).toBeVisible();
  await appointments.getByRole("button", { name: "Confirm schedule" }).click();
  await expect(appointments.getByText("Confirmed", { exact: true })).toBeVisible();

  await openRouteView(page);
  await expect(staleBanner(page)).toBeVisible();

  await page.goto(`/admin/schedule?week=${DAY}`);
  const card = page.getByRole("link", { name: new RegExp(JOB(2)) });
  await expect(card.getByText(/^Arrives 8:00\s–\s10:00\sAM$/)).toBeVisible();
});

test("changing a job's address clears its pin and lists it under Needs address", async ({ page }) => {
  await signIn(page);
  await page.goto(`/admin/jobs/${jobs[0]}?edit=details`);
  await page.getByLabel("Address").fill("10 Moved Ave");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status").getByText("Saved", { exact: true })).toBeVisible();
  // Geocoding is off in e2e, so the lookup errors and the pin stays cleared.
  await expect.poll(async () => (await sql()`select geocode_status from leads where id = ${jobs[0]}`)[0].geocode_status)
    .toBe("error");
  const [lead] = await sql()`select address, lat, lng from leads where id = ${jobs[0]}`;
  expect(lead).toEqual({ address: "10 Moved Ave", lat: null, lng: null });

  await openRouteView(page);
  await expect(needsAddress(page).getByRole("link", { name: JOB(1) })).toBeVisible();
  await expect(needsAddress(page).getByRole("link", { name: JOB(3) })).toBeVisible();
});
