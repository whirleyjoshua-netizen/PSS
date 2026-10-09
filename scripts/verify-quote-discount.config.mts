import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/** Runs scripts/verify-quote-discount.ts and nothing else, by hand. Not reachable from vitest.config.mts. */
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["scripts/verify-quote-discount.ts"],
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
