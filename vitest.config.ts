import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
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
