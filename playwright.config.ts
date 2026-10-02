import { defineConfig, devices } from "@playwright/test";

// E2E_PORT moves the app server off 3100 when another checkout's server holds it: reuseExistingServer
// would otherwise run this checkout's specs against that server's build and database.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

// The e2e specs write to and delete from whatever database this names, so it must be the Neon test
// branch. Checked here, before any spec or the web server runs. Production (cold-term) is refused
// first, always. The pinned test branch (ep-lingering-fog) can be deleted and replaced, so a run may
// name its own test-branch endpoint in E2E_TEST_ENDPOINT (an ep-… id, never production). Messages
// name the endpoint id only: never print the URL, which carries the password.
const e2eDatabase = process.env.E2E_POSTGRES_URL;
if (e2eDatabase) {
  let host = "";
  try {
    host = new URL(e2eDatabase).hostname;
  } catch {
    throw new Error("E2E_POSTGRES_URL is not a valid URL. It must point at a Neon test branch.");
  }
  if (host.includes("cold-term")) throw new Error("E2E_POSTGRES_URL points at production (cold-term). Refusing to run e2e against it.");
  const namedEndpoint = process.env.E2E_TEST_ENDPOINT;
  if (namedEndpoint !== undefined && (!namedEndpoint.startsWith("ep-") || namedEndpoint.includes("cold-term"))) {
    throw new Error("E2E_TEST_ENDPOINT must be a Neon test-branch endpoint (ep-…), never production.");
  }
  const requiredEndpoint = namedEndpoint ?? "ep-lingering-fog";
  if (!host.includes(requiredEndpoint)) throw new Error(`E2E_POSTGRES_URL must point at the Neon test branch (${requiredEndpoint}).`);
}

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
    // face-id.spec.ts needs a localhost RP ID, so only playwright.face-id.config.ts runs it.
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /(admin-mobile|face-id)\.spec\.ts/ },
    // admin.spec.ts, portal.spec.ts, and call.spec.ts run serially, desktop-only
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /(admin|admin-access|portal|call|follow-ups|questionnaire|stages|team|appointments|install|routes|dc-quote|documents|tasks|face-id)\.spec\.ts/ },
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
          ADMIN_EMAILS: "e2e-owner@example.com,e2e-mobile@example.com,e2e-portal-owner@example.com,e2e-call-owner@example.com,e2e-followup-owner@example.com,e2e-questionnaire-owner@example.com,e2e-stages-owner@example.com,e2e-team-owner@example.com,e2e-appt-owner@example.com,e2e-install@example.com,e2e-routes-owner@example.com,e2e-access-owner@example.com,e2e-dc-owner@example.com,e2e-docs-owner@example.com,e2e-tasks-owner@example.com,e2e-tasks-mate@example.com",
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
          // Stripe goes to the local stub dc-quote.spec.ts starts (e2e/fixtures/stripe-stub.ts), never to Stripe.
          // The same three values are exported by the stub; card payments are proved by signed test webhooks.
          STRIPE_SECRET_KEY: "sk_test_e2e",
          STRIPE_WEBHOOK_SECRET: "whsec_e2e_test_secret",
          STRIPE_API_URL: "http://127.0.0.1:3198",
        }
      : {},
  },
});
