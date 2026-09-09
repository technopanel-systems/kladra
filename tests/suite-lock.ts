/**
 * One suite at a time, enforced rather than remembered.
 *
 * `playwright.config.ts` runs the whole suite against ONE database that
 * `global-setup.ts` clears and reseeds, so a second run started while the first
 * is walking does not slow it down — it deletes the rows underneath it. That
 * happened: a run was stopped from the outside, the stop killed the shell in
 * front of `npm run test` and nothing below it, and the replacement run cleared
 * the database while the first one's browser was still signing people in. The
 * failures read like the app was broken — a login that never left /login, a
 * dev-server worker crashing — and nothing in the app was wrong.
 *
 * So the run takes a lock and says who holds it. A lock whose process is gone
 * is stale and gets taken; a lock whose process is alive stops the new run
 * before a single row is deleted, and names the process to end.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const LOCK = path.join(repoRoot, ".next-test", "suite.lock");

type Held = { pid: number; startedAt: string };

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function held(): Held | null {
  let raw: string;
  try {
    raw = fs.readFileSync(LOCK, "utf8");
  } catch {
    return null;
  }
  let lock: Held;
  try {
    lock = JSON.parse(raw) as Held;
  } catch {
    return null;
  }
  if (typeof lock.pid !== "number" || !alive(lock.pid)) return null;
  // A PID is reused eventually, and a suite that has been "running" for hours
  // is a machine that was put to sleep, not a run to defer to.
  const age = Date.now() - new Date(lock.startedAt).getTime();
  if (!Number.isFinite(age) || age > 2 * 60 * 60 * 1000) return null;
  return lock;
}

export function takeSuiteLock(): void {
  const other = held();
  if (other) {
    throw new Error(
      `Another acceptance run is already going: process ${other.pid}, started ` +
        `${other.startedAt}. Both runs share one database and this one would clear ` +
        `it, so nothing was deleted. Stop that run first — on Windows the whole ` +
        `tree has to go, \`taskkill /PID ${other.pid} /T /F\`, because stopping the ` +
        `shell in front of it leaves the server and the browser behind.`,
    );
  }
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(
    LOCK,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() } satisfies Held),
  );
}

export function releaseSuiteLock(): void {
  try {
    fs.rmSync(LOCK, { force: true });
  } catch {
    // A lock that cannot be removed is stale by its own pid check next time.
  }
}
