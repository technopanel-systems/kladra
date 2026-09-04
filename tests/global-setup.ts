import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { testDatabaseUrl } from "../src/lib/env";
import { testDatabaseName } from "../scripts/test-database";

const ORIGIN = "http://localhost:3101";
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");

/**
 * The next thing this file does is delete every row and seed fresh ones, so it
 * first makes the server say which database it is on — `/api/health` reports
 * `database` outside production — and stops unless that is the test one.
 *
 * `reuseExistingServer` in playwright.config.ts attaches to whatever already
 * answers on the port, and Playwright starts the web server BEFORE globalSetup,
 * so by now something is up either way. Anything but `npm run dev:test` put it
 * there, and the wrong DATABASE_URL behind that port means this run wipes the
 * database somebody is working in. That is not hypothetical: it cost a review
 * pass, whose findings were records vanishing mid-session.
 */
async function assertServerIsOnTheTestDatabase(): Promise<void> {
  const expected = testDatabaseName();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let payload: { database?: string };
  try {
    const response = await fetch(`${ORIGIN}/api/health`, { signal: controller.signal });
    payload = (await response.json()) as { database?: string };
  } catch (error) {
    throw new Error(
      `${ORIGIN}/api/health did not answer, so the database behind it could not be ` +
        `checked and nothing was cleared. Start it with \`npm run dev:test\`. (${String(error)})`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (payload.database !== expected) {
    throw new Error(
      `Refusing to clear and reseed: the server on ${ORIGIN} is connected to ` +
        `"${payload.database ?? "an unreported database"}", not "${expected}". Something ` +
        `other than \`npm run dev:test\` is holding that port — stop it and re-run. ` +
        `Nothing was deleted.`,
    );
  }
}

/**
 * Every child runs against the TEST database, never the one in `.env`, for the
 * same reason (src/lib/env.ts `testDatabaseUrl`).
 */
function run(command: string): void {
  execSync(command, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
  });
}

/**
 * Runs once before the whole suite (playwright.config.ts `globalSetup`): prove
 * the port is the test one, then migrate and reseed. One database backs the
 * entire run — reseeded once, here — which is why playwright.config.ts sets
 * `fullyParallel: false` and `workers: 1`.
 */
export default async function globalSetup(): Promise<void> {
  await assertServerIsOnTheTestDatabase();
  run("npm run db:migrate");
  run("npm run db:clear");
  run("npm run seed:demo");
}
