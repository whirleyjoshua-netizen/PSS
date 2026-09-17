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
    // admin-mobile.spec.ts is the mirror image: phone-width only, so desktop skips it.
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /admin-mobile\.spec\.ts/ },
    // admin.spec.ts, portal.spec.ts, and call.spec.ts run serially, desktop-only
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /(admin|portal|call|follow-ups|questionnaire|stages|team|appointments|install|routes)\.spec\.ts/ },
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
          // Each spec signs in as its own owner so their cleanups can't collide
          ADMIN_EMAILS: "e2e-owner@example.com,e2e-mobile@example.com,e2e-portal-owner@example.com,e2e-call-owner@example.com,e2e-followup-owner@example.com,e2e-questionnaire-owner@example.com,e2e-stages-owner@example.com,e2e-team-owner@example.com,e2e-appt-owner@example.com,e2e-install@example.com,e2e-routes-owner@example.com",
          ADMIN_BASE_URL: baseURL,
          // The e2e run posts real leads to the consultation API; this must
          // never send real email through Resend.
          RESEND_API_KEY: "",
          BLOB_READ_WRITE_TOKEN: process.env.E2E_BLOB_READ_WRITE_TOKEN ?? "",
          // Route planning goes to the local stub that routes.spec.ts starts, never to Google.
          ROUTE_OPTIMIZATION_URL: "http://127.0.0.1:3199/optimize",
          ROUTE_OPTIMIZATION_TOKEN: "e2e-token",
          // No map and no geocoding from e2e: the lists still work, and coordinates are seeded.
          NEXT_PUBLIC_GOOGLE_MAPS_KEY: "",
          NEXT_PUBLIC_GOOGLE_MAP_ID: "",
          GOOGLE_GEOCODING_KEY: "",
        }
      : {},
  },
});
