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

/**
 * The kind chip on an appointment row. It has to be scoped to the row's own spans: every row also
 * carries a Reschedule dialog holding a <label>Measure</label>, so the card as a whole matches the
 * kind twice, exact text and all. This still fails if the chip itself goes.
 */
const kindChip = (page: Page, kind: string) => card(page).locator("li > span").filter({ hasText: kind });

test("a measure stays off the schedule until it is confirmed", async ({ page }) => {
  const MEASURE_NAME = `E2E Appt Measure ${STAMP}`;
  const MEASURE_DAY = lasVegasDay(3);
  const measureJobId = await lead(MEASURE_NAME);
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
  await expect(kindChip(page, "Measure")).toBeVisible();

  // The behavioural proof of the confirmed-only rule: a pending appointment is not a commitment,
  // so the Schedule page must not show it.
  await page.goto(`/admin/schedule?week=${MEASURE_DAY}`);
  await expect(page.getByRole("link", { name: new RegExp(MEASURE_NAME) })).toHaveCount(0);

  await page.goto(`/admin/jobs/${measureJobId}`);
  await card(page).getByRole("button", { name: "Confirm schedule" }).click();
  await expect(card(page).getByText("Confirmed", { exact: true })).toBeVisible();

  const [row] = await sql()`select kind, confirmed_at is not null as confirmed
    from appointments where lead_id = ${measureJobId}`;
  expect(row).toMatchObject({ kind: "measure", confirmed: true });

  // The e2e server runs with RESEND_API_KEY empty on purpose, so the customer is never told. The
  // confirmation stands anyway (the row above), and the reason survives in the job's Activity —
  // which is where it has to survive, because the card's alert unmounts with the Confirm button.
  const emails = await sql()`select body from job_events where lead_id = ${measureJobId} and kind = 'email'`;
  expect(emails.map((event) => event.body as string).join("\n"))
    .toMatch(/Appointment email not sent to e2e-appt@example\.com/);

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

// This lives here rather than in call.spec.ts: the assertions that matter are the appointment row,
// the Appointments card and the Schedule page, and this file already carries the helpers for all
// three (lasVegasDay for ?week=, the card scoping, the appointments cleanup by cascade).
test("a visit booked on a call is a confirmed consultation, and reaches the schedule", async ({ page }) => {
  const name = `E2E Appt Call ${STAMP}`;
  const day = lasVegasDay(6);
  const id = await lead(name);
  await signIn(page);
  await page.goto(`/admin/jobs/${id}/call`);

  await page.getByRole("button", { name: "Booked a visit" }).click();
  await page.getByLabel("Visit date and time").fill(`${day}T13:00`);
  await page.getByRole("button", { name: "Save booked visit" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${id}$`));

  // (a) the row exists and is confirmed — the call screen must not leave a pending appointment,
  // and leads.visit_at must have been mirrored from it, not written by the call statement.
  const [row] = await sql()`select kind, all_day, confirmed_at is not null as confirmed,
      to_char(starts_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI') as starts_local,
      (select to_char(l.visit_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI')
         from leads l where l.id = ${id}) as visit_local
    from appointments where lead_id = ${id}`;
  expect(row).toMatchObject({
    kind: "consultation", all_day: false, confirmed: true,
    starts_local: `${day} 13:00`, visit_local: `${day} 13:00`,
  });

  // (b) the job shows it, confirmed, and the booked call still moved the stage.
  await expect(card(page).getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(kindChip(page, "Consultation")).toBeVisible();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Appointment booked");

  // (c) the assertion that would have caught the bug: the Schedule page reads confirmed appointments.
  await page.goto(`/admin/schedule?week=${day}`);
  const booked = page.getByRole("link", { name: new RegExp(name) });
  await expect(booked).toBeVisible();
  await expect(booked).toContainText("Consultation");
});

test("cancelling asks first, then takes the appointment off the schedule", async ({ page }) => {
  // This books its own appointment rather than reusing the first test's: a failure there would
  // otherwise surface here as a confusing failure against a job that was never created.
  const name = `E2E Appt Cancel ${STAMP}`;
  const day = lasVegasDay(5);
  const id = await lead(name);
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);

  // Cancel only appears on a confirmed appointment, so this one has to be confirmed first.
  await card(page).getByRole("button", { name: "Schedule" }).click();
  const modal = scheduleModal(page);
  await modal.getByLabel("Date and time").fill(`${day}T09:00`);
  await modal.getByRole("radio", { name: "Service" }).check();
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(kindChip(page, "Service")).toBeVisible();
  await card(page).getByRole("button", { name: "Confirm schedule" }).click();
  await expect(card(page).getByText("Confirmed", { exact: true })).toBeVisible();

  // The first press only asks; it must not delete anything.
  await card(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(card(page).getByText("Cancel this appointment? It will be removed from the calendar.")).toBeVisible();
  const [still] = await sql()`select count(*)::int as n from appointments where lead_id = ${id}`;
  expect(still.n).toBe(1);

  // Keeping it puts the row back as it was, still cancellable.
  await card(page).getByRole("button", { name: "Keep it" }).click();
  await expect(card(page).getByText("Cancel this appointment?")).toHaveCount(0);

  await card(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await card(page).getByRole("button", { name: "Yes, cancel" }).click();
  await expect(card(page).getByText("Nothing scheduled")).toBeVisible();

  const gone = await sql()`select id from appointments where lead_id = ${id}`;
  expect(gone).toEqual([]);

  await page.goto(`/admin/schedule?week=${day}`);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
});

test("designer notes and the gate code are booked in the dialog, and Edit notes never un-confirms", async ({ page }) => {
  const name = `E2E Appt Notes ${STAMP}`;
  const day = lasVegasDay(7);
  const gate = `#E2E-${STAMP}`;
  const id = await lead(name);
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);

  // The gate code sits at the top of the booking dialog and the notes below the time fields.
  await card(page).getByRole("button", { name: "Schedule" }).click();
  const modal = scheduleModal(page);
  await modal.getByLabel("Gate code").fill(gate);
  await modal.getByLabel("Date and time").fill(`${day}T10:00`);
  await modal.getByRole("radio", { name: "Measure" }).check();
  await modal.getByLabel("Designer notes").fill("Side gate sticks\nBring motorized samples");
  await modal.getByRole("button", { name: "Save", exact: true }).click();

  // The row shows the notes. Scoped to the notes paragraph: the row's dialogs hold the same text in their textareas.
  const notes = card(page).locator("li p.whitespace-pre-wrap");
  await expect(notes).toContainText("Side gate sticks");
  await card(page).getByRole("button", { name: "Confirm schedule" }).click();
  await expect(card(page).getByText("Confirmed", { exact: true })).toBeVisible();

  // Edit notes changes the notes only: the appointment stays confirmed.
  await card(page).getByRole("button", { name: "Edit notes" }).click();
  const notesModal = page.getByRole("dialog", { name: "Edit notes" });
  await expect(notesModal.getByLabel("Gate code")).toHaveValue(gate);
  await notesModal.getByLabel("Designer notes").fill("Measure the patio door too");
  await notesModal.getByRole("button", { name: "Save notes" }).click();
  await expect(notes).toContainText("Measure the patio door too");
  await expect(card(page).getByText("Confirmed", { exact: true })).toBeVisible();

  const [row] = await sql()`select a.designer_notes, a.confirmed_at is not null as confirmed, l.gate_code
    from appointments a join leads l on l.id = a.lead_id where a.lead_id = ${id}`;
  expect(row).toMatchObject({ designer_notes: "Measure the patio door too", confirmed: true, gate_code: gate });

  // The gate code is owner-only: it never reaches the activity log.
  const events = await sql()`select coalesce(body, '') as body from job_events where lead_id = ${id}`;
  expect(events.map((event) => event.body as string).join("\n")).not.toContain(gate);
});
