import { defineConfig } from "@playwright/test";

const port = 4173;

export default defineConfig({
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  reporter: process.env.CI ? "github" : "list",
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 15_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command: `bun run tests/server.ts ${port}`,
    reuseExistingServer: !process.env.CI,
    url: `http://127.0.0.1:${port}`,
  },
  workers: 1,
});
