import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  timeout: 120000,
  expect: { timeout: 15000 },
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_URL || "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHANNEL || "chromium",
      },
    },
  ],
  webServer: process.env.E2E_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:5173/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
