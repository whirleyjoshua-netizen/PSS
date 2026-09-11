import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : [["list"]],

  use: {
    baseURL,
    trace: "on-first-retry",
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  // Tests run against a production build, so what is verified is what ships.
  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // Admin tests need a database. They run only against a Neon branch passed in
    // E2E_POSTGRES_URL, never production, and are skipped when it is absent.
    env: process.env.E2E_POSTGRES_URL
      ? {
          POSTGRES_URL: process.env.E2E_POSTGRES_URL,
          ADMIN_EMAILS: "e2e-owner@example.com",
          ADMIN_BASE_URL: baseURL,
        }
      : {},
  },
});
