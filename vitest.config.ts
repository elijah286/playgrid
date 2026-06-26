import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // The Playwright functional specs (tests/functional/*.spec.ts) are a
    // SEPARATE suite run by `playwright test` — they import @playwright/test,
    // not vitest. Exclude that dir while keeping vitest's default discovery for
    // every other unit/spec test (src/** and evals/**).
    exclude: [...configDefaults.exclude, "tests/functional/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next.js's `server-only` marker throws at import in non-server
      // contexts; vitest runs in jsdom and would fail to resolve it.
      // Stub to an empty module so server-tagged files can be unit-
      // tested. The marker still does its job in real Next builds
      // (which use the real package).
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
