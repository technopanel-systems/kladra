import { defineConfig, devices } from "@playwright/test";

/** The one spec the `edge` project runs, and the one the locale projects skip. */
const EDGE_SPEC = /(^|[\\/])edge\.spec\.ts$/;

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
 * The first two projects are not a browser matrix — one browser, two locales. The
 * app locale is the URL prefix, and the `locale`/`t` fixtures in tests/helpers/i18n.ts
 * read it straight off `testInfo.project.name`, so "en"/"ar" here are both the
 * `--project` values and the locale codes.
 *
 * The third is the browser matrix, and it is one spec wide (D172). `edge` drives
 * the Microsoft Edge installed on the machine (`channel: "msedge"`) through
 * tests/edge.spec.ts alone, which opens every kind of popup on every role's
 * screens in both locales — the founder's report was dropdowns that did not open
 * in Edge (SPEC §3, P13). Running the whole suite a third time would add half an
 * hour to every gate and prove nothing about popups that spec does not. Its name
 * is a browser, not a locale, so the spec walks both locales itself and never
 * asks for the `locale` fixture; and `en`/`ar` ignore it, so it runs once.
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
      testIgnore: EDGE_SPEC,
      use: { ...devices["Desktop Chrome"], locale: "en-GB" },
    },
    {
      name: "ar",
      testIgnore: EDGE_SPEC,
      use: { ...devices["Desktop Chrome"], locale: "ar-SA" },
    },
    {
      name: "edge",
      testMatch: EDGE_SPEC,
      // The browser's own language stays English, like the office machines; the
      // app's language is the URL prefix, and the spec walks both.
      use: { ...devices["Desktop Edge"], channel: "msedge", locale: "en-GB" },
    },
  ],
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
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
