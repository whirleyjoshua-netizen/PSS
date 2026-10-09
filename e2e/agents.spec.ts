import { test, expect, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";

const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run the agent dashboard tests");
test.describe.configure({ mode: "serial" });

const sql = () => neon(url!);
const OWNER = "e2e-agents-owner@example.com";
const SLUG = `e2e-${Date.now().toString(36)}`;
const KEY = randomBytes(32).toString("base64url");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

async function signInAs(page: Page, email: string) {
  const token = randomBytes(32).toString("base64url");
  await sql()`insert into admin_login_tokens (token_hash, email, expires_at) values (${hash(token)}, ${email}, now() + interval '15 minutes')`;
  await page.goto(`/admin/auth?token=${token}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for the session to land before navigating, or the goto can cancel the sign-in.
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
}

// The branch's mailing address is put back exactly as it was, not left blank.
let savedMailingAddress: string | null = null;
let readSettings = false;

test.beforeAll(async () => {
  if (!url) return;
  const rows = await sql()`select mailing_address from agent_settings where id`;
  savedMailingAddress = (rows[0]?.mailing_address as string | null | undefined) ?? null;
  readSettings = true;
  await sql()`insert into agents (slug, name, role, key_hash) values (${SLUG}, 'E2E Agent', 'Testing', ${hash(KEY)})`;
  await sql()`update agent_settings set mailing_address = null where id`;
});

test.afterAll(async () => {
  if (!url) return;
  // agent_items and agent_replies go with the agent (on delete cascade).
  await sql()`delete from agents where slug like 'e2e-%'`;
  await sql()`delete from admin_sessions where email = ${OWNER}`;
  await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  if (readSettings) await sql()`update agent_settings set mailing_address = ${savedMailingAddress} where id`;
});

test("a pushed report, email and decision reach the dashboard, and the owner's decision reaches the agent", async ({ page, request }) => {
  const auth = { authorization: `Bearer ${KEY}` };
  expect((await request.get("/api/agents/sync")).status()).toBe(401);
  expect((await request.get("/api/agents/sync", { headers: { authorization: `Bearer ${randomBytes(32).toString("base64url")}` } })).status()).toBe(401);

  const push = await request.post("/api/agents/sync", { headers: auth, data: { run: { status: "ok" }, items: [
    { kind: "report", external_id: "r1", title: "E2E daily brief", summary: "One line", report_type: "daily", body_md: "# Hello\n\n| a | b |\n|---|---|\n| 1 | 2 |" },
    { kind: "email", external_id: "e1", title: "E2E intro", email_to: "pat@example.com", email_subject: "Hello", email_body: "Hi Pat", reason: "test" },
    { kind: "decision", external_id: "d1", title: "E2E pick a tagline", body_md: "Option A or B?" },
  ] } });
  expect(push.status()).toBe(200);
  expect((await push.json()).results.map((r: { result: string }) => r.result)).toEqual(["created", "created", "created"]);

  await signInAs(page, OWNER);
  await page.goto("/admin/agents");
  await expect(page.getByRole("heading", { name: "Agents", exact: true })).toBeVisible();
  // The nav may render twice (desktop + drawer), and its name carries the needs-you count.
  await expect(page.getByRole("navigation").getByRole("link", { name: /^Agents/ }).first()).toBeVisible();

  const email = page.getByRole("article", { name: /E2E intro/ });
  await expect(email.getByLabel("To", { exact: true })).toHaveValue("pat@example.com");
  await expect(email.getByLabel("Subject")).toHaveValue("Hello");
  await expect(email.getByLabel("Body")).toHaveValue("Hi Pat");
  // No mailing address saved, so the card says so in place of the footer.
  await expect(email.getByText(/Add a mailing address in Settings → Agents before this can be sent/)).toBeVisible();
  await email.getByRole("button", { name: "Approve & send" }).click();
  // Outlook is off in e2e (MS_TENANT_ID is blank), and that is the first blocker sendBlocker checks, so the
  // refusal names Outlook. Either way the send is refused before anything is saved, claimed or sent.
  await expect(email.getByRole("status")).toContainText("Outlook is not connected");
  const e1 = await sql()`select status, final_to, sent_at from agent_items where agent_slug = ${SLUG} and external_id = 'e1'`;
  expect(e1[0]).toMatchObject({ status: "pending", final_to: null, sent_at: null });

  const decision = page.getByRole("article", { name: /E2E pick a tagline/ });
  await expect(decision.getByText("Option A or B?")).toBeVisible();
  await decision.getByLabel(/Note/).fill("Go with A");
  await decision.getByRole("button", { name: "Approve", exact: true }).click();
  // Once decided it no longer needs the owner, so the card leaves the list.
  await expect(decision).toHaveCount(0);
  const d1 = await sql()`select status, owner_note, decided_by from agent_items where agent_slug = ${SLUG} and external_id = 'd1'`;
  expect(d1[0]).toMatchObject({ status: "approved", owner_note: "Go with A", decided_by: OWNER });
  // The email is still waiting.
  await expect(email).toBeVisible();

  await page.getByRole("link", { name: "E2E Agent", exact: true }).click();
  await expect(page.getByRole("heading", { name: "E2E Agent", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: /E2E daily brief/ }).click();
  await expect(page.getByRole("heading", { name: "E2E daily brief", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hello" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  // Opening the report marks it read.
  await expect.poll(async () => (await sql()`select status from agent_items where agent_slug = ${SLUG} and external_id = 'r1'`)[0].status).toBe("read");

  const pull = await (await request.get("/api/agents/sync", { headers: auth })).json();
  expect(pull.agent).toBe(SLUG);
  expect(pull.updates).toEqual([expect.objectContaining({ external_id: "d1", kind: "decision", status: "approved", owner_note: "Go with A" })]);
  expect(pull.stats).toBeNull();
  expect(pull.replies).toEqual([]);
  // Delivered once: the next pull has nothing new.
  expect((await (await request.get("/api/agents/sync", { headers: auth })).json()).updates).toEqual([]);

  // A decided item can't be rewritten by the agent.
  const again = await request.post("/api/agents/sync", { headers: auth, data: { items: [{ kind: "decision", external_id: "d1", title: "changed" }] } });
  expect((await again.json()).results[0].result).toBe("locked");
  expect((await sql()`select title from agent_items where agent_slug = ${SLUG} and external_id = 'd1'`)[0].title).toBe("E2E pick a tagline");
});
