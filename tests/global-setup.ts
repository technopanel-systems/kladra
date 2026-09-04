import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORIGIN = "http://localhost:3100";
const APP_CONTAINER = "kladra-app-1";
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");

/**
 * True when anything at all answers on :3100 — any status, any body. It must
 * NOT require parseable JSON or a 200: a stale container answering with an
 * error page is exactly the case this guard exists to catch.
 */
async function somethingAnswers(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    await fetch(ORIGIN, { signal: controller.signal, redirect: "manual" });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** True when the compose app container is up (README.md "Deployment"). */
function isAppContainerRunning(): boolean {
  try {
    const out = execSync('docker ps --format "{{.Names}}"', { encoding: "utf8" });
    return out
      .split(/\r?\n/)
      .map((name) => name.trim())
      .includes(APP_CONTAINER);
  } catch {
    // Docker is not reachable from here, so nothing of its can be shadowing.
    return false;
  }
}

/**
 * `docker compose up` publishes the app on the same loopback address
 * `next dev` uses, 127.0.0.1:3100 (README.md "Deployment"). On Windows that
 * container then answers every probe in place of the dev server, and
 * `webServer.reuseExistingServer: true` in playwright.config.ts happily
 * attaches to it — the whole suite would run against the container's stale
 * build instead of this checkout, silently.
 *
 * Playwright starts the `webServer` BEFORE globalSetup (its plugin setup runs
 * first), so by the time this executes something is already answering either
 * way; the container check is what actually decides. Fail loudly and let the
 * operator stop it — global-setup never stops containers itself (CLAUDE.md,
 * hook H12: nothing outside compose project `kladra` is ever stopped, and
 * even inside it that is the operator's call).
 */
async function assertNotShadowedByComposeContainer(): Promise<void> {
  if (!isAppContainerRunning()) return;
  if (!(await somethingAnswers())) return;
  throw new Error(
    `Something is answering on ${ORIGIN} AND the "${APP_CONTAINER}" compose container is ` +
      `running — it publishes 127.0.0.1:3100 itself, so the tests would run against that ` +
      `container's build, not this checkout. Stop it yourself (docker compose stop app, in ` +
      `the kladra project) and re-run — global-setup does not stop containers.`,
  );
}

function run(command: string): void {
  execSync(command, { cwd: repoRoot, stdio: "inherit" });
}

/**
 * Runs once before the whole suite (playwright.config.ts `globalSetup`): guard
 * against the shadowed port above, then reseed. One database backs the entire
 * run — reseeded once here, which is why playwright.config.ts sets
 * `fullyParallel: false` and `workers: 1`.
 */
export default async function globalSetup(): Promise<void> {
  await assertNotShadowedByComposeContainer();
  run("npm run db:clear");
  run("npm run seed:demo");
}
