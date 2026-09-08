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
import { spawn, spawnSync } from "node:child_process";
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
  /*
   * A ceiling on the compiler's heap, because the failure this file already
   * describes has now happened three times and always the same way: a dev
   * server that has hot-reloaded through hours of edits grows without plateau —
   * 2.9 GB the second time, 6.7 GB the third — and the third one starved a full
   * acceptance run, which the machine killed halfway through. Four gigabytes is
   * far above anything a healthy run of this codebase uses (about 600 MB fresh),
   * so it changes nothing until the server is already pathological, and then it
   * dies at once and says why instead of taking the suite down with it.
   */
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl(),
    NEXT_DIST_DIR: DIST_DIR,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=4096"]
      .filter(Boolean)
      .join(" "),
  },
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});

/*
 * The server dies with this process (P11A, WORKFLOW §5 #68). Playwright stops
 * the command it started, but on Windows that is the shell in front of npx,
 * and `next dev` two processes down kept running: every later run reused it
 * as-is (reuseExistingServer), it hot-reloaded through hours of edits, reached
 * three gigabytes, and the suite slowed until a thirty-second walk timed out.
 * So the whole tree goes when this does, on a signal or a plain exit.
 */
let stopped = false;
function stopServer() {
  if (stopped || child.pid === undefined) return;
  stopped = true;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    stopServer();
    process.exit(0);
  });
}
process.on("exit", stopServer);

// And when whatever started this is gone without a word — a force-killed npm
// runs no handler here — the server does not outlive it: the parent is checked
// every few seconds, and an orphan takes its tree down and leaves.
const parent = process.ppid;
setInterval(() => {
  try {
    process.kill(parent, 0);
  } catch {
    stopServer();
    process.exit(0);
  }
}, 5_000).unref();
