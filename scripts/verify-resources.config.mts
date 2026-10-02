import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/**
 * Runs scripts/verify-resources.ts and nothing else. Its own config, like verify-tasks, so the script
 * gets the `@` alias and the server-only stub without ever being swept into `npm test`.
 */
export default defineConfig({
  root,
  test: { environment: "node", include: ["scripts/verify-resources.ts"], testTimeout: 60_000, hookTimeout: 60_000 },
  resolve: {
    alias: {
      "@": root,
      "server-only": path.resolve(root, "tests/server-only-stub.ts"),
    },
  },
});
