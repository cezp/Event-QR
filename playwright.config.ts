import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
        command: "npm run dev:e2e",
        env: {
          LOCAL_DATA_PATH: join(
            tmpdir(),
            "eventqr-e2e",
            randomUUID() + ".json",
          ),
        },
        url: "http://127.0.0.1:5173/api/health",
        reuseExistingServer: false,
        timeout: 120000,
      },
});
