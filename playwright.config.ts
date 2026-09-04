import { defineConfig, devices } from "@playwright/test";

/**
 * One Postgres database backs the whole run — tests/global-setup.ts reseeds it
 * once — so nothing runs in parallel and spec files share state in file order,
 * exactly like the acceptance scripts in WORKFLOW.md §3.
 *
 * `npm run test` drives this from cold. `npx playwright test tests/<file>.spec.ts
 * --project=en` (or `--project=ar`) runs one file against a server that is
 * already up: `reuseExistingServer` attaches to it instead of booting a second.
 *
 * The suite runs on **3101 against `kladra_test`**, never on 3100 against the
 * developer's database. It clears and reseeds on every run, so sharing either
 * one destroys work in progress — that happened, and half of a review's
 * findings turned out to be a test run deleting the records being reviewed.
 * 3101 is a test port only: it is never deployed and never in docker-compose.
 *
 * The two projects are not a browser matrix — one browser, two locales. The app
 * locale is the URL prefix, and the `locale`/`t` fixtures in tests/helpers/i18n.ts
 * read it straight off `testInfo.project.name`, so "en"/"ar" here are both the
 * `--project` values and the locale codes.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://localhost:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Riyadh, so a "today" the browser computes agrees with the one the app
    // computes in SQL (.claude/rules/data.md).
    timezoneId: "Asia/Riyadh",
  },
  projects: [
    {
      name: "en",
      use: { ...devices["Desktop Chrome"], locale: "en-GB" },
    },
    {
      name: "ar",
      use: { ...devices["Desktop Chrome"], locale: "ar-SA" },
    },
  ],
  globalSetup: "./tests/global-setup.ts",
  webServer: {
    command: "npm run dev:test",
    url: "http://localhost:3101/api/health",
    // A dev server that is already up is reused as-is. Playwright starts this
    // before globalSetup, which is where "is that actually the test database
    // behind this port?" gets asked before anything is deleted.
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
