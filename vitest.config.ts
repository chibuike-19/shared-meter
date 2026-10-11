import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    passWithNoTests: true,
    // Live DB integration tests (RUN_DB_IT) share one Supabase project and some
    // mutate global state (e.g. price), so run files serially to avoid races.
    fileParallelism: false,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
