import { test, expect, type BrowserContext } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";

// Runs only from playwright.face-id.config.ts (http://localhost, a domain RP ID WebAuthn accepts).
// The main config ignores this file: on 127.0.0.1 there is no valid RP ID.
const url = process.env.E2E_POSTGRES_URL;
test.skip(!url, "Set E2E_POSTGRES_URL to a Neon branch to run admin tests");

const sql = () => neon(url!);
const EMAIL = "e2e-faceid-owner@example.com";
const challenges = new Set<string>();

/** Sign-in challenges carry no address, so they are found by the id in the challenge cookies. */
async function rememberChallenges(context: BrowserContext) {
  for (const cookie of await context.cookies()) {
    if (cookie.name === "pss_webauthn_signin" || cookie.name === "pss_webauthn_reg") challenges.add(cookie.value);
  }
}

test.afterAll(async () => {
  if (!url) return;
  await sql()`delete from admin_login_tokens where email = ${EMAIL}`;
  await sql()`delete from admin_sessions where email = ${EMAIL}`;
  await sql()`delete from admin_passkeys where email = ${EMAIL}`;
  await sql()`delete from admin_webauthn_challenges where email = ${EMAIL}`;
  if (challenges.size > 0) await sql()`delete from admin_webauthn_challenges where id = any(${[...challenges]})`;
});

test("Face ID sign-in with a virtual authenticator", async ({ page, context }) => {
  // A platform authenticator that holds discoverable credentials and always passes user
  // verification: what Face ID is to WebAuthn.
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
  });

  await sql()`delete from admin_login_tokens where email = ${EMAIL}`;
  await sql()`delete from admin_passkeys where email = ${EMAIL}`;
  const [{ now: before }] = await sql()`select now() as now`;

  // 1. Sign in by code.
  await page.goto("/admin/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("a sign-in code and link are on their way");
  let tokenHash: string | undefined;
  await expect
    .poll(
      async () => {
        const rows = await sql()`select token_hash from admin_login_tokens
          where email = ${EMAIL} and created_at >= ${before} and code_hash is not null
          order by created_at desc limit 1`;
        tokenHash = rows[0]?.token_hash as string | undefined;
        return tokenHash;
      },
      { timeout: 10_000 },
    )
    .toBeTruthy();
  const known = createHash("sha256").update(`${EMAIL}:123456`).digest("hex");
  await sql()`update admin_login_tokens set code_hash = ${known} where token_hash = ${tokenHash!}`;
  await rememberChallenges(context);
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();

  // 2. Turn on Face ID from the board's card.
  const card = page.getByRole("region", { name: "Face ID" });
  const turnOn = card.getByRole("button", { name: /Turn on Face ID for this/ });
  await expect(turnOn).toBeEnabled();
  await rememberChallenges(context);
  await turnOn.click();
  await expect(card.getByRole("status")).toHaveText(/Face ID is on for this/);
  const stored = await sql()`select count(*)::int as n from admin_passkeys where email = ${EMAIL}`;
  expect(stored[0].n).toBe(1);
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  expect(credentials).toHaveLength(1);
  expect(credentials[0].isResidentCredential).toBe(true);

  // 3. Sign out.
  await page.getByRole("button", { name: /Sign out/ }).click();
  await expect(page).toHaveURL(/\/admin\/sign-in/);

  // 4. Sign in with Face ID: no address typed, straight to Jobs.
  const faceId = page.getByRole("button", { name: "Sign in with Face ID" });
  await expect(faceId).toBeEnabled();
  await rememberChallenges(context);
  await faceId.click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
  const used = await sql()`select last_used_at from admin_passkeys where email = ${EMAIL}`;
  expect(used[0].last_used_at).not.toBeNull();
  await rememberChallenges(context);
});
