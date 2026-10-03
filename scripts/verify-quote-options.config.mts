import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/**
 * Runs scripts/verify-quote-options.ts and nothing else. Its own config for the `@` alias and the server-only stub,
 * and deliberately NOT reachable from vitest.config.mts (tests/** only): this script must never be counted as
 * coverage. It is run by hand.
 */
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["scripts/verify-quote-options.ts"],
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
