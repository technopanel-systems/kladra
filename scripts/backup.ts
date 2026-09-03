/**
 * One consistent dump of the live Kladra database.
 * `npm run backup`.
 *
 * **Why this exists, and what it is not.** The office NAS already sweeps
 * every company PC at file level. That does NOT cover PostgreSQL: the data
 * directory is copied while it is being written, so what reaches the NAS is a
 * torn copy that may not restore. This script does not add a backup system —
 * it adds the one thing the NAS cannot take for itself, a consistent dump,
 * written into a folder the NAS is already sweeping. The belief that the NAS
 * has the database covered is the belief that loses it.
 *
 * **pg_dump runs INSIDE the container**, deliberately. The Windows host has no
 * Postgres client tools, and a host `pg_dump` that is not exactly server 17's
 * fails in ways that read like corruption rather than like a version error.
 * Inside the container the client is the server's own by construction.
 *
 * **It fails loudly.** A backup script that exits 0 having written nothing is
 * worse than no script at all — a database tool that reports success may have
 * changed nothing, and this is the same shape. So three things are asserted
 * after the dump: a zero exit status, a plausible size, and the `PGDMP` magic
 * that starts a custom-format archive. A file failing any of them is DELETED
 * rather than left to be picked up as "the newest dump" later.
 *
 * **The dump holds every row and every password hash.** It is exactly as
 * sensitive as the database. Nothing here prints, or names a file after,
 * POSTGRES_PASSWORD — see `backup-shared.ts` for how the secret is passed.
 *
 * There is deliberately no NODE_ENV guard. This is the one script here that
 * must run in production.
 */

import { statSync, mkdirSync, openSync, closeSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import {
  DUMP_MAGIC,
  DUMP_PREFIX,
  DUMP_SUFFIX,
  assertIsArchive,
  backupDir,
  docker,
  formatBytes,
  listDumps,
  loadEnv,
  requireEnv,
} from "./backup-shared";

/** Kept generations. Older files are removed after a successful dump. */
const KEEP = 30;

/**
 * A liveness floor, not a size expectation. A schema-only dump of this database
 * is tens of kilobytes; anything under a kilobyte is an error message or an
 * empty file, not an archive. Whether the dump actually RESTORES is not a
 * question a size can answer — that is `npm run backup:verify`.
 */
const MIN_BYTES = 1024;

/** Host local time, so a nightly 02:00 task sorts the way a person reads it. */
function stamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

function prune(directory: string): void {
  const stale = listDumps(directory).slice(KEEP);
  for (const dump of stale) {
    unlinkSync(dump.path);
    console.log(`  pruned ${dump.path}`);
  }
  if (stale.length > 0) {
    console.log(`  kept the newest ${KEEP}`);
  }
}

function main(): void {
  loadEnv();
  requireEnv();

  const directory = backupDir();
  mkdirSync(directory, { recursive: true });

  const file = join(directory, `${DUMP_PREFIX}${stamp(new Date())}${DUMP_SUFFIX}`);
  console.log(`→ pg_dump ${process.env.POSTGRES_DB} (inside the db container)`);
  console.log(`  ${file}`);

  // The password and the database name are read from the container's own
  // environment, never passed from the host.
  const script =
    'PGPASSWORD=$POSTGRES_PASSWORD pg_dump -U "$POSTGRES_USER" ' +
    '-d "$POSTGRES_DB" -Fc';

  const fd = openSync(file, "w");
  let result: ReturnType<typeof docker>;
  try {
    result = docker(
      ["compose", "exec", "-T", "db", "sh", "-c", script],
      { stdout: fd },
    );
  } finally {
    closeSync(fd);
  }

  const fail = (reason: string): never => {
    unlinkSync(file);
    throw new Error(
      `${reason}\n  The partial file was deleted, so it cannot be mistaken for\n` +
        "  a good dump later. Is the db container up? `docker compose ps db`.",
    );
  };

  if (result.status !== 0) {
    fail(`pg_dump exited ${result.status}.\n${result.stderr.trim()}`);
  }

  const size = statSync(file).size;
  if (size < MIN_BYTES) {
    fail(`pg_dump wrote ${size} bytes, which is not an archive.`);
  }

  try {
    assertIsArchive(file);
  } catch {
    fail(`pg_dump wrote ${formatBytes(size)} that does not start with ${DUMP_MAGIC}.`);
  }

  console.log(`  wrote ${formatBytes(size)}, starts with ${DUMP_MAGIC}`);
  prune(directory);
  console.log(
    "\nA dump is not a backup until it has been restored. " +
      "`npm run backup:verify` proves this one.",
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
