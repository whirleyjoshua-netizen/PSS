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
  try {
    // Only this run's agent. Its agent_items and agent_replies go with it (on delete cascade).
    await sql()`delete from agents where slug = ${SLUG}`;
    await sql()`delete from admin_sessions where email = ${OWNER}`;
    await sql()`delete from admin_login_tokens where email = ${OWNER}`;
  } finally {
    // Restored even if a delete fails.
    if (readSettings) await sql()`update agent_settings set mailing_address = ${savedMailingAddress} where id`;
  }
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
  await page.goto(`/admin/agents?agent=${SLUG}`);
  await expect(page.getByRole("heading", { name: "Agents", exact: true })).toBeVisible();
  // The nav may render twice (desktop + drawer), and its name carries the needs-you count.
  await expect(page.getByRole("navigation").getByRole("link", { name: /^Agents/ }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Agents" }).getByRole("link", { name: /^E2E Agent/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "E2E Agent", level: 2 })).toBeVisible();

  // The email card sends nothing itself: Review & send opens the whole email in the reading pane.
  const emailCard = page.getByRole("article", { name: "Email: E2E intro" });
  await expect(emailCard.getByRole("button", { name: /send/i })).toHaveCount(0);
  await emailCard.getByRole("link", { name: "Review & send" }).click();
  await expect(page).toHaveURL(/[?&]item=[0-9a-f-]{36}/);
  await expect(emailCard).toHaveAttribute("aria-current", "true");
  const email = page.getByRole("article", { name: "Email from E2E Agent: E2E intro" });
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

  // A decision opens in the pane, where My response takes a note.
  const decisionCard = page.getByRole("article", { name: "Decision: E2E pick a tagline" });
  await decisionCard.getByRole("link", { name: "Expand" }).click();
  await expect(page.getByRole("heading", { name: "E2E pick a tagline", level: 2 })).toBeVisible();
  await expect(page.getByRole("article", { name: "E2E pick a tagline", exact: true }).getByText("Option A or B?")).toBeVisible();
  const response = page.getByRole("region", { name: "My response" });
  await response.getByLabel(/Note to E2E Agent/).fill("Go with A");
  await response.getByRole("button", { name: "Approve", exact: true }).click();
  // Once decided it no longer waits on the owner: the card moves to Done, and the pane shows the outcome.
  await expect(decisionCard).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Done" }).getByRole("listitem", { name: "Decision: E2E pick a tagline" })).toBeVisible();
  await expect(response.getByText("Your note: Go with A")).toBeVisible();
  const d1 = await sql()`select status, owner_note, decided_by from agent_items where agent_slug = ${SLUG} and external_id = 'd1'`;
  expect(d1[0]).toMatchObject({ status: "approved", owner_note: "Go with A", decided_by: OWNER });
  // The email is still waiting.
  await expect(emailCard).toBeVisible();

  // A report opens in the pane and is marked read.
  await page.getByRole("article", { name: "Daily report: E2E daily brief" }).getByRole("link", { name: "Expand" }).click();
  await expect(page.getByRole("heading", { name: "E2E daily brief", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hello" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect.poll(async () => (await sql()`select status from agent_items where agent_slug = ${SLUG} and external_id = 'r1'`)[0].status).toBe("read");
  // My response on a report: a note the agent reads on its next run.
  await response.getByLabel("Note to E2E Agent").fill("More on Henderson");
  await response.getByRole("button", { name: "Send to E2E Agent" }).click();
  await expect(response.getByRole("status")).toContainText("Sent to E2E Agent. They'll read it on their next run.");
  await expect(response.getByText(/Your note: More on Henderson \(sent /)).toBeVisible();
  // The box keeps the note just sent, ready to change.
  await expect(response.getByLabel("Note to E2E Agent")).toHaveValue("More on Henderson");
  const r1 = await sql()`select id, status, owner_note from agent_items where agent_slug = ${SLUG} and external_id = 'r1'`;
  expect(r1[0]).toMatchObject({ status: "answered", owner_note: "More on Henderson" });

  // Old links still work: the item page redirects into the reading pane.
  await page.goto(`/admin/agents/${SLUG}/${r1[0].id}`);
  await expect(page).toHaveURL((url) => url.pathname === "/admin/agents" && url.search === `?agent=${SLUG}&item=${r1[0].id}`);
  await expect(page.getByRole("heading", { name: "E2E daily brief", level: 2 })).toBeVisible();

  const pull = await (await request.get("/api/agents/sync", { headers: auth })).json();
  expect(pull.agent).toBe(SLUG);
  expect(pull.updates).toHaveLength(2);
  expect(pull.updates).toEqual(expect.arrayContaining([
    expect.objectContaining({ external_id: "d1", kind: "decision", status: "approved", owner_note: "Go with A" }),
    expect.objectContaining({ external_id: "r1", kind: "report", status: "answered", owner_note: "More on Henderson" }),
  ]));
  expect(pull.stats).toBeNull();
  expect(pull.replies).toEqual([]);
  // Delivered once: the next pull has nothing new.
  expect((await (await request.get("/api/agents/sync", { headers: auth })).json()).updates).toEqual([]);

  // A decided item can't be rewritten by the agent.
  const again = await request.post("/api/agents/sync", { headers: auth, data: { items: [{ kind: "decision", external_id: "d1", title: "changed" }] } });
  expect((await again.json()).results[0].result).toBe("locked");
  expect((await sql()`select title from agent_items where agent_slug = ${SLUG} and external_id = 'd1'`)[0].title).toBe("E2E pick a tagline");
});
