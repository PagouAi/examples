import { defineConfig } from "vitest/config";

// Coverage targets the reusable logic: the HTTP client, error mapping, logging
// redaction, reconciliation and the webhook parser/store/processor. The runnable
// example entrypoints (CLI scripts, HTTP/browser servers) are thin wrappers that
// require the sandbox and are exercised manually, so they are excluded.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
      reportsDirectory: "coverage",
      include: ["src/lib/**/*.ts", "webhooks/handlers.ts", "webhooks/store.ts", "webhooks/processor.ts"],
      exclude: ["src/lib/config.ts", "src/lib/format.ts", "src/lib/sdk.ts"],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
