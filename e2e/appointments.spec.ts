import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run appointment tests");
// These tests hand work to each other (the measure booked in the first is cancelled in the last),
// and the cleanup runs once per worker, so they run serially, desktop only.
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-appt-owner@example.com";
const STAMP = Date.now();

/** The Las Vegas date `days` from now, as YYYY-MM-DD: what the Schedule page's ?week= expects. */
const lasVegasDay = (days: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" })
    .format(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

async function signIn(page: Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

async function lead(name: string): Promise<string> {
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550193', 'e2e-appt@example.com', 'Henderson', 'phone', 'new') returning id`;
  return row.id as string;
}

test.afterAll(async () => {
  if (!url) return;
  // appointments.lead_id is "on delete cascade" (migration 014), so deleting the leads takes the
  // appointment rows with them; there is deliberately no separate delete for them here.
  await sql()`delete from leads where name like 'E2E Appt %'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

/** The job page's Appointments card. The page holds several "Schedule" controls; this scopes them. */
const card = (page: Page) => page.getByRole("region", { name: "Appointments" });

/** The one open booking modal. Every ScheduleDialog on the page is labelled by its trigger's text. */
const scheduleModal = (page: Page) => page.getByRole("dialog", { name: "Schedule" });

const MEASURE_NAME = `E2E Appt Measure ${STAMP}`;
const MEASURE_DAY = lasVegasDay(3);
let measureJobId = "";

test("a measure stays off the schedule until it is confirmed", async ({ page }) => {
  measureJobId = await lead(MEASURE_NAME);
  await signIn(page);
  await page.goto(`/admin/jobs/${measureJobId}`);
  await expect(card(page).getByText("Nothing scheduled")).toBeVisible();

  // The empty card carries its own Schedule button; the header has another, hence the scoping.
  await card(page).getByRole("button", { name: "Schedule" }).click();
  const modal = scheduleModal(page);
  await modal.getByLabel("Date and time").fill(`${MEASURE_DAY}T10:00`);
  await modal.getByRole("radio", { name: "Measure" }).check();
  await modal.getByRole("button", { name: "Save", exact: true }).click();

  // Saved bookings are pending: nothing is on the calendar and the customer has not been told.
  await expect(card(page).getByText("Pending confirmation")).toBeVisible();
  await expect(card(page).getByText("Measure")).toBeVisible();

  // The behavioural proof of the confirmed-only rule: a pending appointment is not a commitment,
  // so the Schedule page must not show it.
  await page.goto(`/admin/schedule?week=${MEASURE_DAY}`);
  await expect(page.getByRole("link", { name: new RegExp(MEASURE_NAME) })).toHaveCount(0);

  await page.goto(`/admin/jobs/${measureJobId}`);
  await card(page).getByRole("button", { name: "Confirm schedule" }).click();
  await expect(card(page).getByText("Confirmed", { exact: true })).toBeVisible();
  // The e2e server runs with RESEND_API_KEY empty on purpose, so the send fails and the card says
  // why — the confirmation itself stands, which is the behaviour this asserts.
  await expect(card(page).getByRole("alert")).toHaveText("Confirmed, but the email could not be sent.");

  const [row] = await sql()`select kind, confirmed_at is not null as confirmed
    from appointments where lead_id = ${measureJobId}`;
  expect(row).toMatchObject({ kind: "measure", confirmed: true });

  await page.goto(`/admin/schedule?week=${MEASURE_DAY}`);
  const booked = page.getByRole("link", { name: new RegExp(MEASURE_NAME) });
  await expect(booked).toBeVisible();
  await expect(booked).toContainText("Measure");
});

test("confirming a consultation books the job and mirrors the date onto the lead", async ({ page }) => {
  const name = `E2E Appt Consult ${STAMP}`;
  const id = await lead(name);
  const day = lasVegasDay(4);
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);

  await card(page).getByRole("button", { name: "Schedule" }).click();
  const modal = scheduleModal(page);
  await modal.getByLabel("Date and time").fill(`${day}T11:00`);
  // Consultation is the default, but checking it keeps the test honest if that default moves.
  await modal.getByRole("radio", { name: "Consultation" }).check();
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card(page).getByText("Pending confirmation")).toBeVisible();

  // A pending consultation does not move the job either.
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("New lead");

  await card(page).getByRole("button", { name: "Confirm schedule" }).click();
  await expect(card(page).getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Appointment booked");

  // mirrorToJob against a real database: leads.visit_at is a mirror of the confirmed consultation.
  // Read it back in Las Vegas time so the assertion doesn't depend on the client's zone.
  const [row] = await sql()`select status,
      to_char(visit_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI') as visit_local
    from leads where id = ${id}`;
  expect(row).toMatchObject({ status: "visit_booked", visit_local: `${day} 11:00` });
});

test("cancelling asks first, then takes the appointment off the schedule", async ({ page }) => {
  await signIn(page);
  await page.goto(`/admin/jobs/${measureJobId}`);

  // The first press only asks; it must not delete anything.
  await card(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(card(page).getByText("Cancel this appointment? It will be removed from the calendar.")).toBeVisible();
  const [still] = await sql()`select count(*)::int as n from appointments where lead_id = ${measureJobId}`;
  expect(still.n).toBe(1);

  // Keeping it puts the row back as it was, still cancellable.
  await card(page).getByRole("button", { name: "Keep it" }).click();
  await expect(card(page).getByText("Cancel this appointment?")).toHaveCount(0);

  await card(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await card(page).getByRole("button", { name: "Yes, cancel" }).click();
  await expect(card(page).getByText("Nothing scheduled")).toBeVisible();

  const gone = await sql()`select id from appointments where lead_id = ${measureJobId}`;
  expect(gone).toEqual([]);

  await page.goto(`/admin/schedule?week=${MEASURE_DAY}`);
  await expect(page.getByRole("link", { name: new RegExp(MEASURE_NAME) })).toHaveCount(0);
});
