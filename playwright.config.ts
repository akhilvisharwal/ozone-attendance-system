import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.resolve("qa", ".env.qa"),
  override: false,
  quiet: true,
});

const baseURL = process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";
const localRun = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseURL);

const widthProjects = [320, 375, 390, 414, 768, 1024, 1440, 1920].map((width) => ({
  name: `width-${width}`,
  use: {
    browserName: "chromium" as const,
    viewport: { width, height: width < 768 ? 844 : 1000 },
  },
}));

export default defineConfig({
  testDir: "./qa",
  outputDir: "test-results/playwright",
  snapshotDir: "qa/snapshots",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  use: {
    baseURL,
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer:
    localRun && process.env.QA_NO_WEBSERVER !== "1"
      ? [
          {
            command: "npm --prefix backend run dev",
            url: "http://127.0.0.1:4000/api/health",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
          {
            command: "npm --prefix frontend run dev -- --host 127.0.0.1",
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ]
      : undefined,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "edge-chromium",
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "tablet", use: { ...devices["iPad Pro 11"] } },
    { name: "android-mobile", use: { ...devices["Pixel 7"] } },
    ...widthProjects,
  ],
});
