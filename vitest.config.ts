import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Rendering is CPU-bound and deterministic; keep tests stable and not flaky.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    reporters: ["default"],
  },
});
