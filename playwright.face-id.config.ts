import { defineConfig, devices } from "@playwright/test";
// Importing the main config runs its database guard first: never production, only the test branch.
import base from "./playwright.config";

// WebAuthn refuses an IP address as its RP ID, and the app takes its RP ID from ADMIN_BASE_URL. So
// Face ID runs on its own server at http://localhost, with ADMIN_BASE_URL to match. Its own port,
// so it never meets the main config's 127.0.0.1 server.
const PORT = Number(process.env.E2E_FACE_ID_PORT ?? 3120);
const baseURL = `http://localhost:${PORT}`;
const mainEnv = (base.webServer && !Array.isArray(base.webServer) ? base.webServer.env : undefined) ?? {};

export default defineConfig({
  ...base,
  testDir: "./e2e",
  testMatch: /face-id\.spec\.ts/,
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "face-id", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: process.env.E2E_POSTGRES_URL
      ? { ...mainEnv, ADMIN_EMAILS: "e2e-faceid-owner@example.com", ADMIN_BASE_URL: baseURL }
      : {},
  },
});
