import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    // Integration tests share one real Postgres dev database (no
    // per-test/per-worker isolation exists yet — see the various
    // "no dedicated test database" notes throughout this project's
    // history). Running test *files* in parallel let two files' fixtures
    // transiently overlap in global, unscoped aggregate queries (observed:
    // a payment fixture in payments/service.test.ts landing inside
    // dashboard/repository.test.ts's date-range aggregate window, flaking
    // ~2 in 3 runs). Disabling file parallelism trades some wall-clock
    // speed for determinism until real test-DB isolation exists.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/generated/**", "src/components/ui/**"],
    },
  },
});
