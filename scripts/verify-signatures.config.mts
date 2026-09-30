import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/**
 * Runs scripts/verify-signatures.ts and nothing else. Deliberately NOT reachable from
 * vitest.config.mts (whose include is tests/**): this script must never be swept into npm test
 * and counted as coverage. It is run by hand against a Neon test branch.
 */
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["scripts/verify-signatures.ts"],
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
