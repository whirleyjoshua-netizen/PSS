import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run team tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-team-owner@example.com";
const STAMP = Date.now();

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
    values (${name}, '7025550191', 'e2e-team@example.com', 'Henderson', 'phone', 'new') returning id`;
  return row.id as string;
}

test.afterAll(async () => {
  if (!url) return;
  // leads.assigned_to is ON DELETE SET NULL, so either order is safe.
  await sql()`delete from leads where name like 'E2E Team %'`;
  await sql()`delete from team_members where name like 'E2E Team %'`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
});

test("add a person, assign a job, see it on the board, remove them", async ({ page }) => {
  const person = `E2E Team Designer ${STAMP}`;
  const jobName = `E2E Team Job ${STAMP}`;
  const id = await lead(jobName);
  await signIn(page);

  // The Team region scopes Name/Role away from the rest of Settings.
  await page.goto("/admin/settings");
  const team = page.getByRole("region", { name: "Team" });
  await team.getByLabel("Name").fill(person);
  await team.getByLabel("Role").selectOption("designer");
  await team.getByRole("button", { name: "Add" }).click();
  await expect(team).toContainText(`${person} — Designer`);

  await page.goto(`/admin/jobs/${id}`);
  await page.getByLabel("Assigned to").selectOption({ label: `${person} — Designer` });
  await expect(page.getByText(`Assigned to ${person} (Designer)`)).toBeVisible();

  await page.goto("/admin");
  await expect(
    page.getByRole("region", { name: "Board" }).getByRole("link", { name: new RegExp(jobName) }),
  ).toContainText(`${person} · Designer`);

  await page.goto("/admin/settings");
  await page.getByRole("button", { name: `Remove ${person}` }).click();
  await expect(page.getByRole("region", { name: "Team" })).not.toContainText(person);
  const [row] = await sql()`select assigned_to from leads where id = ${id}`;
  expect(row.assigned_to).toBeNull();
});
