import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/**
 * Runs scripts/verify-deposit-flow.ts and nothing else. Its own config because the script imports the
 * real lib/payments/deposits.ts and lib/admin/jobs.ts, which need the `@` alias and the server-only stub.
 * Deliberately NOT reachable from vitest.config.mts (whose include is tests/**\/*.test.ts): it is run by hand.
 */
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["scripts/verify-deposit-flow.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": root,
      "server-only": path.resolve(root, "tests/server-only-stub.ts"),
    },
  },
});
