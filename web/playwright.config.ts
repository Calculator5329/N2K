/**
 * Playwright smoke-test config for the v3 web app.
 *
 * The dev server port is configurable via the `N2K_E2E_PORT`
 * environment variable so multiple worktrees / running instances
 * don't collide on a single port. Defaults to 5173 (Vite's default)
 * when nothing is set.
 *
 * `reuseExistingServer` is on locally so iterative test runs piggyback
 * on an already-running `npm run dev` instead of spinning up a fresh
 * one each time.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env["N2K_E2E_PORT"] ?? 5173);
// Vite binds to localhost only by default — using `localhost` lets
// Node resolve to whichever family (IPv4 or IPv6) is actually bound.
// `127.0.0.1` would skip an IPv6-only Vite instance and trick
// Playwright into thinking no server is running.
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port=${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
