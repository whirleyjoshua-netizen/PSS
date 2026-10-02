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
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
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

test("logging a booked call from a computer moves the lead to Appointment booked", async ({ page }) => {
  const id = await lead(`E2E Call Booked ${STAMP}`, "new");
  await signIn(page);
  await page.goto(`/admin/jobs/${id}`);
  await page.locator("header").getByRole("link", { name: "Log a call" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Call E2E Call Booked ${STAMP}`);

  await page.getByLabel("Shutters").check();
  await page.getByLabel("Windows", { exact: true }).selectOption("8");
  await page.getByLabel("Mid-range").check();
  await page.getByRole("button", { name: "Booked a visit" }).click();
  await page.getByLabel("Visit date and time").fill("2026-10-14T14:00");
  await page.getByRole("button", { name: "Save booked visit" }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${id}$`));
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Appointment booked");
  await expect(page.getByText("Call: booked visit Wed 10/14, 2:00 PM · Shutters · 8 windows · Mid-range")).toBeVisible();
  const [row] = await sql()`select budget_tier, window_count_exact, treatment_types from leads where id = ${id}`;
  expect(row).toMatchObject({ budget_tier: "mid", window_count_exact: 8, treatment_types: ["shutters"] });

  const events = await sql()`select kind, from_status, to_status, body from job_events where lead_id = ${id} order by created_at`;
  const stageEvents = events.filter((e) => e.kind === "stage");
  expect(stageEvents).toHaveLength(1);
  expect(stageEvents[0]).toMatchObject({ from_status: "new", to_status: "visit_booked" });
  const noteEvents = events.filter((e) => e.kind === "note");
  expect(noteEvents).toHaveLength(1);
  expect(noteEvents[0].body).toMatch(/^Call: booked visit/);
});

test("a missed call is logged and the lead stays new", async ({ page }) => {
  const id = await lead(`E2E Call Missed ${STAMP}`, "new");
  await signIn(page);
  await page.goto(`/admin/jobs/${id}/call`);
  await page.getByRole("button", { name: "No answer" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${id}$`));
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("New lead");
  await expect(page.getByText("Call: no answer")).toBeVisible();

  const events = await sql()`select kind, from_status, to_status, body from job_events where lead_id = ${id} order by created_at`;
  expect(events.filter((e) => e.kind === "stage")).toHaveLength(0);
  const noteEvents = events.filter((e) => e.kind === "note");
  expect(noteEvents).toHaveLength(1);
  expect(noteEvents[0].body).toBe("Call: no answer");
});

test("a call never moves a job backwards", async ({ page }) => {
  const id = await lead(`E2E Call Quoted ${STAMP}`, "quoted");
  await signIn(page);
  await page.goto(`/admin/jobs/${id}/call`);
  await page.getByRole("button", { name: "Talked, no visit yet" }).click();
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Quoted");
  await expect(page.getByText("Call: talked, no visit yet")).toBeVisible();

  const events = await sql()`select kind, from_status, to_status, body from job_events where lead_id = ${id} order by created_at`;
  expect(events.filter((e) => e.kind === "stage")).toHaveLength(0);
});

test("a talked call moves a new lead to Contacted", async ({ page }) => {
  const id = await lead(`E2E Call Talked ${STAMP}`, "new");
  await signIn(page);
  await page.goto(`/admin/jobs/${id}/call`);
  await page.getByRole("button", { name: "Talked, no visit yet" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/jobs/${id}$`));
  await expect(page.getByRole("list", { name: "Stage" }).locator('[aria-current="step"]')).toContainText("Contacted");
  await expect(page.getByText("Call: talked, no visit yet")).toBeVisible();

  const [row] = await sql()`select status from leads where id = ${id}`;
  expect(row.status).toBe("contacted");
  const events = await sql()`select kind, from_status, to_status, body from job_events where lead_id = ${id} order by created_at`;
  expect(events.filter((e) => e.kind === "stage").map(({ from_status, to_status }) => ({ from_status, to_status }))).toEqual([
    { from_status: "new", to_status: "contacted" },
  ]);
});
