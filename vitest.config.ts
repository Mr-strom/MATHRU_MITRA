import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Server-side test configuration.
 * Runs tests in Node environment using vitest.
 * Does NOT process client-side React components.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["server/tests/**/*.test.ts"],
    setupFiles: ["server/tests/_setup.ts"],
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts"],
      exclude: ["server/tests/**", "server/db/migrations/**"],
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
});
