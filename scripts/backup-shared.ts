/**
 * Shared machinery for `npm run backup`, `npm run restore` and
 * `npm run backup:verify`.
 *
 * **Everything speaks to Postgres from inside the container.** The host has no
 * client tools, and a host `pg_dump` that is not exactly server 17's fails in
 * ways that look like corruption rather than like a version error — a dump that
 * writes, exits 0 and will not restore. Running `pg_dump`, `pg_restore` and
 * `psql` inside the container makes the client the server's own by construction.
 * It is also why nothing here touches the host port: `docker-compose.yml`
 * publishes Postgres at 127.0.0.1:5433 for `npm run dev` and drizzle-kit, but
 * inside the container it listens on 5432, and `docker compose exec db` needs
 * no port at all.
 *
 * **The password never reaches a host command line.** Every call is
 * `sh -c 'PGPASSWORD=$POSTGRES_PASSWORD …'`, so the value is read from the
 * container's own environment — the one `docker-compose.yml` already sets. It
 * is never in shell history, a process list, a filename or this repository.
 * The throwaway container in `backup-verify.ts` is started with
 * `-e POSTGRES_PASSWORD`, the NAME only, which tells docker to copy the value
 * across from this process's environment rather than take it as an argument.
 *
 * **`spawnSync` is called with an args array and `shell: false`.** This is a
 * Windows host and `cmd.exe` does not treat `'` as a quote character, so a
 * shell-interpolated `sh -c '…'` would be split on spaces and reach `sh` in
 * pieces. An args array has no shell in it to get this wrong.
 *
 * **Paths resolve from this file, not from the working directory.** Windows
 * Task Scheduler runs `npm run backup` from wherever it is pointed, and
 * `docker compose` has to find `docker-compose.yml` (compose project `kladra`,
 * so the database container is `kladra-db-1` and the service is `db`).
 * `loadEnv()` therefore chdirs to the repository root before anything runs.
 */

import { spawnSync } from "node:child_process";
import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The first five bytes of a `pg_dump -Fc` archive. */
export const DUMP_MAGIC = "PGDMP";

/** Every dump this repository writes. Also the prune and "newest" filter. */
export const DUMP_PREFIX = "kladra-";
export const DUMP_SUFFIX = ".dump";

/**
 * A Postgres identifier, checked before it is ever interpolated into the
 * in-container `sh -c` string. Target database names arrive from the command
 * line, and this is the only thing between one and the shell.
 */
const DB_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/** Where a command runs: the compose `db` service, or a named container. */
export type Container = { compose: string } | { name: string };

export function containerLabel(container: Container): string {
  return "compose" in container ? `compose:${container.compose}` : container.name;
}

function dockerArgs(container: Container, script: string): string[] {
  return "compose" in container
    ? ["compose", "exec", "-T", container.compose, "sh", "-c", script]
    : ["exec", "-i", container.name, "sh", "-c", script];
}

/**
 * Loads `.env` from the repository root and moves there. Throws with something
 * readable rather than Node's ENOENT — this is the first thing every entry
 * point calls, and on the office PC it is the first thing that can go wrong.
 */
export function loadEnv(): void {
  const envPath = join(REPO_ROOT, ".env");
  try {
    process.loadEnvFile(envPath);
  } catch {
    throw new Error(
      `No .env at ${envPath}.\n` +
        "  Copy .env.example to .env and fill it in. The backup scripts read\n" +
        "  POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB and BACKUP_DIR from it.",
    );
  }
  process.chdir(REPO_ROOT);
}

/**
 * Checked before anything runs. `backup` deliberately has no NODE_ENV guard —
 * it is the one script here that MUST work in production, and the office PC's
 * container sets NODE_ENV=production. Do not add one by symmetry with the
 * development-only database scripts.
 *
 * POSTGRES_DB is required rather than defaulted to `kladra`: the value the db
 * container was started with is the only one that names a real database, and a
 * host-side default that disagreed with it would fail one step later with a
 * message about a database that does not exist.
 */
export function requireEnv(): void {
  const missing = ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"].filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(", ")} in .env.\n` +
        "  docker-compose.yml interpolates these into the db service, and the\n" +
        "  backup scripts read them back to name the database and the role.",
    );
  }
}

export function assertDbName(name: string, what: string): string {
  if (!DB_NAME.test(name)) {
    throw new Error(
      `${what} is not a valid database name: ${JSON.stringify(name)}.\n` +
        "  Letters, digits and underscores, starting with a letter or underscore.",
    );
  }
  return name;
}

/** A docker invocation. Never `shell: true` — see the file header. */
export function docker(
  args: string[],
  options: { stdin?: number; stdout?: number; input?: string } = {},
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    shell: false,
    stdio: [
      options.stdin ?? (options.input === undefined ? "ignore" : "pipe"),
      options.stdout ?? "pipe",
      "pipe",
    ],
    input: options.input,
  });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/**
 * Runs SQL on stdin, so the statement text never passes through `sh` and needs
 * no quoting of its own. `ON_ERROR_STOP=1` is what makes a failed statement a
 * non-zero exit rather than a printed notice.
 */
export function psql(container: Container, database: string, sql: string): string {
  assertDbName(database, "database");
  const script =
    'PGPASSWORD=$POSTGRES_PASSWORD psql -U "$POSTGRES_USER" ' +
    `-d ${database} -At -F "|" -v ON_ERROR_STOP=1 -f -`;
  const result = docker(dockerArgs(container, script), { input: sql });
  if (result.status !== 0) {
    throw new Error(
      `psql failed on ${database} in ${containerLabel(container)} ` +
        `(exit ${result.status}).\n${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

/**
 * Exact per-table counts for every non-system schema — which puts
 * `drizzle.__drizzle_migrations` in the sweep without naming it, so a whole
 * missing schema shows up as missing tables rather than as nothing at all.
 * `query_to_xml` runs one `count(*)` per table inside a single round trip;
 * `reltuples` would have been an estimate, and an estimate cannot prove
 * identity.
 */
const COUNT_SQL = `
SELECT n.nspname || '.' || c.relname AS name,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname),
                           false, true, '')))[1]::text::bigint AS rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\\_%'
ORDER BY 1;
`;

export function countTables(container: Container, database: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of psql(container, database, COUNT_SQL).split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const [name, rows] = trimmed.split("|");
    counts.set(name, Number(rows));
  }
  return counts;
}

/** The ledger row `drizzle-kit migrate` compares against on the next run. */
export function ledgerLastRow(container: Container, database: string): string {
  const sql =
    "SELECT id || ' | ' || hash || ' | ' || created_at " +
    "FROM drizzle.__drizzle_migrations ORDER BY created_at DESC, id DESC LIMIT 1;";
  return psql(container, database, sql).trim() || "(no rows)";
}

export function databaseExists(container: Container, database: string): boolean {
  assertDbName(database, "database");
  const sql = `SELECT 1 FROM pg_database WHERE datname = '${database}';`;
  return psql(container, "postgres", sql).trim() === "1";
}

/**
 * `WITH (FORCE)` terminates other backends first — Postgres 13 and later. The
 * app container holds connections to the live database, so without it a drop
 * fails with "is being accessed by other users".
 */
export function dropDatabase(container: Container, database: string): void {
  assertDbName(database, "database");
  psql(container, "postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
}

export function createDatabase(container: Container, database: string): void {
  assertDbName(database, "database");
  psql(container, "postgres", `CREATE DATABASE ${database};`);
}

/** Reads the archive's first bytes. A dump that is not one fails here rather
 *  than inside pg_restore, where the error reads like a corrupt database. */
export function assertIsArchive(dumpPath: string): void {
  const head = Buffer.alloc(DUMP_MAGIC.length);
  const fd = openSync(dumpPath, "r");
  let read = 0;
  try {
    read = readSync(fd, head, 0, head.length, 0);
  } finally {
    closeSync(fd);
  }
  if (read < head.length || head.toString("latin1") !== DUMP_MAGIC) {
    throw new Error(
      `${dumpPath} is not a pg_dump custom-format archive ` +
        `(expected it to start with ${DUMP_MAGIC}).`,
    );
  }
}

/**
 * Restores an archive into an existing database, reading it from stdin so the
 * dump is never written inside a container. `--exit-on-error` is the point:
 * without it pg_restore reports every skipped object as a warning and still
 * exits 0, which is the failure these scripts exist to catch. Owner and
 * privilege clauses are kept deliberately — carrying them is part of what a
 * restore onto another machine has to survive.
 */
export function restoreInto(
  container: Container,
  database: string,
  dumpPath: string,
): void {
  assertDbName(database, "database");
  assertIsArchive(dumpPath);
  const script =
    'PGPASSWORD=$POSTGRES_PASSWORD pg_restore -U "$POSTGRES_USER" ' +
    `-d ${database} --exit-on-error`;
  const fd = openSync(dumpPath, "r");
  try {
    const result = docker(dockerArgs(container, script), { stdin: fd });
    if (result.status !== 0) {
      throw new Error(
        `pg_restore failed into ${database} in ${containerLabel(container)} ` +
          `(exit ${result.status}).\n${result.stderr.trim()}`,
      );
    }
  } finally {
    closeSync(fd);
  }
}

/** `BACKUP_DIR` from .env, resolved against the repository root; `./backups`
 *  when unset. The folder holds every row and every password hash — it needs
 *  the database's own access control, and it is already in `.gitignore`. */
export function backupDir(): string {
  const configured = process.env.BACKUP_DIR;
  return configured && configured.trim() !== ""
    ? resolve(REPO_ROOT, configured.trim())
    : join(REPO_ROOT, "backups");
}

export function listDumps(directory: string): { path: string; mtimeMs: number; size: number }[] {
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.startsWith(DUMP_PREFIX) && name.endsWith(DUMP_SUFFIX))
    .map((name) => {
      const path = join(directory, name);
      const stats = statSync(path);
      return { path, mtimeMs: stats.mtimeMs, size: stats.size };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}
