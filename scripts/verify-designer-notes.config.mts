import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/**
 * Runs scripts/verify-designer-notes.ts and nothing else.
 *
 * It needs a config of its own because the script imports the real
 * lib/admin/appointments.ts, lib/admin/jobs.ts and lib/calendar/store.ts, which need the `@` alias
 * and the server-only stub — the same resolution the unit suite uses. It is deliberately NOT reachable from
 * vitest.config.mts, whose `include` is tests/**\/*.test.ts: this script must
 * never be swept into `npm test` and counted as coverage. It is run by hand.
 */
export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["scripts/verify-designer-notes.ts"],
    // Real network round trips to a Neon branch, so more generous than a unit test.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": root,
      "server-only": path.resolve(root, "tests/server-only-stub.ts"),
    },
  },
});
