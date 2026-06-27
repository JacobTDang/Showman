import { defineConfig } from "vitest/config";

// Opt-in config for LIVE tests (network/LLM). Run with `npm run test:live` and a
// key set (e.g. OPENROUTER_API_KEY). Never part of the default `npm test` / CI run.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.live.test.ts"],
    testTimeout: 200_000,
    hookTimeout: 200_000,
  },
});
