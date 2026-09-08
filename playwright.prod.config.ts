import { defineConfig, devices } from "@playwright/test";

/** Runs the e2e suite against a deployed URL instead of a local build. */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "https://premiershadesolutions.com" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
