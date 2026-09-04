/**
 * `npm run dev:test` — the dev server the Playwright suite runs against.
 *
 * Port 3101, database `kladra_test`. Both facts live here and nowhere else, so
 * the pair cannot come apart: playwright.config.ts only names the port it
 * connects to, and whoever runs this by hand gets the same database the suite
 * gets rather than the one `npm run dev` is showing.
 *
 * The suite clears and reseeds on every run. Pointing it at the developer's
 * database destroys work in progress — that happened, and half of one review's
 * findings turned out to be a test run deleting the records under review.
 *
 * Bound to 127.0.0.1, like every other port Kladra opens (.claude/rules/deploy.md):
 * `next dev` otherwise listens on 0.0.0.0 and a seeded, signed-in copy of the
 * CRM answers on the office Wi-Fi.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { testDatabaseUrl } from "../src/lib/env";
import { ensureTestDatabase } from "./test-database";

const PORT = "3101";
// Next 16 locks `<distDir>/lock` and refuses a second dev server in the same
// directory; a separate build directory gives this one its own lock, so 3100
// keeps running (next.config.ts reads NEXT_DIST_DIR).
const DIST_DIR = ".next-test";
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");

// Next connects on the first request, and Playwright's readiness probe hits
// /api/health, which runs a query — so the database has to exist before boot.
await ensureTestDatabase();

const child = spawn("npx", ["next", "dev", "-H", "127.0.0.1", "-p", PORT], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: testDatabaseUrl(), NEXT_DIST_DIR: DIST_DIR },
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
