import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run stage tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-stages-owner@example.com";
const STAMP = Date.now();

async function signIn(page: Page) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash}, ${OWNER}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

async function lead(name: string, status = "new"): Promise<string> {
  const [row] = await sql()`insert into leads (name, phone, email, city, source, status)
    values (${name}, '7025550190', 'e2e-stages@example.com', 'Henderson', 'phone', ${status}) returning id`;
  return row.id as string;
}

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from leads where name like 'E2E Stages %'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

// Booking used to be a "Visit date and time" field on Job details. That field is gone: a
// consultation is booked in the Schedule dialog and only advances the stage once it is confirmed.
test("confirming a consultation books a new lead's appointment", async ({ page }) => {
  const id = await lead(`E2E Stages Book ${STAMP}`);
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);
  // The job page has more than one Schedule control, so this is scoped to the Appointments card.
  const card = page.getByRole("region", { name: "Appointments" });
  await card.getByRole("button", { name: "Schedule" }).click();
  const modal = page.getByRole("dialog", { name: "Schedule" });
  await modal.getByLabel("Date and time").fill("2026-10-14T14:00");
  await modal.getByRole("radio", { name: "Consultation" }).check();
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.getByText("Pending confirmation")).toBeVisible();
  await card.getByRole("button", { name: "Confirm schedule" }).click();
  await expect(card.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Appointment booked");
  const [row] = await sql()`select status from leads where id = ${id}`;
  expect(row.status).toBe("visit_booked");
  const stages = await sql()`select from_status, to_status from job_events where lead_id = ${id} and kind = 'stage' order by created_at`;
  expect(stages).toEqual([{ from_status: "new", to_status: "visit_booked" }]);
});

test("confirming a consultation books a contacted lead", async ({ page }) => {
  const id = await lead(`E2E Stages Book Contacted ${STAMP}`, "contacted");
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);
  const card = page.getByRole("region", { name: "Appointments" });
  await card.getByRole("button", { name: "Schedule" }).click();
  const modal = page.getByRole("dialog", { name: "Schedule" });
  await modal.getByLabel("Date and time").fill("2026-10-15T10:00");
  await modal.getByRole("radio", { name: "Consultation" }).check();
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.getByText("Pending confirmation")).toBeVisible();
  await card.getByRole("button", { name: "Confirm schedule" }).click();
  await expect(card.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Appointment booked");
  const [row] = await sql()`select status from leads where id = ${id}`;
  expect(row.status).toBe("visit_booked");
  const stages = await sql()`select from_status, to_status from job_events where lead_id = ${id} and kind = 'stage' order by created_at`;
  expect(stages).toEqual([{ from_status: "contacted", to_status: "visit_booked" }]);
});

test("mark contacted logs how, shows last contacted, and moves a new lead to Contacted", async ({ page }) => {
  const name = `E2E Stages Contact ${STAMP}`;
  const id = await lead(name);
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);
  await page.getByLabel("More actions").click();
  await page.getByLabel("Mark contacted").check();
  await page.getByLabel("Called").check();
  await page.getByLabel("Texted").check();
  await page.getByLabel("Note (optional)").fill("left details on price");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^Last contacted /)).toBeVisible();
  await expect(page.getByText("Contacted · Called, Texted — left details on price")).toBeVisible();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Contacted");
  const [event] = await sql()`select kind, body from job_events where lead_id = ${id} and kind = 'contact'`;
  expect(event).toEqual({ kind: "contact", body: "Contacted · Called, Texted — left details on price" });
  const [row] = await sql()`select status from leads where id = ${id}`;
  expect(row.status).toBe("contacted");
  const stages = await sql()`select from_status, to_status from job_events where lead_id = ${id} and kind = 'stage' order by created_at`;
  expect(stages).toEqual([{ from_status: "new", to_status: "contacted" }]);

  // On the board the card now sits in the Contacted column, and no longer in New lead.
  await page.goto("/admin");
  const board = page.getByRole("region", { name: "Board" });
  await expect(board.getByRole("region", { name: /^Contacted ·/ }).getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await expect(board.getByRole("region", { name: /^New lead ·/ }).getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
});

test("completing an installed job moves it from the board to the list", async ({ page }) => {
  const name = `E2E Stages Complete ${STAMP}`;
  const id = await lead(name);
  await sql()`update leads set status = 'installed' where id = ${id}`;
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);
  await page.getByLabel("More actions").click();
  await page.getByText("Change stage…").click();
  await page.getByLabel("Set stage").selectOption("completed");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Completed");

  await page.goto("/admin");
  await expect(page.getByRole("region", { name: "Board" }).getByRole("heading", { name: /^Installed ·/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Board" }).getByText(name)).toHaveCount(0);
  await page.getByLabel("Stage", { exact: true }).selectOption("completed");
  await expect(page).toHaveURL(/list=completed/);
  await expect(page.getByRole("region", { name: /all jobs/i }).getByRole("link", { name })).toBeVisible();
});

test("the list shows lost jobs", async ({ page }) => {
  const name = `E2E Stages Lost ${STAMP}`;
  const id = await lead(name);
  await sql()`update leads set status = 'lost' where id = ${id}`;
  await signIn(page);
  await page.goto("/admin?list=lost");
  await expect(page.getByRole("region", { name: /all jobs/i }).getByRole("link", { name })).toBeVisible();
});
