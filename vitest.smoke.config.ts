import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/smoke.browser.test.ts"],
    testTimeout: 90_000,
  },
});
