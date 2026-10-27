import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", ...devices["Pixel 7"], trace: "retain-on-failure" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
