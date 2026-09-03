/**
 * Prove the newest dump restores, and that what comes back is the same
 * database. `npm run backup:verify`.
 *
 * **This is the point of the backup scripts.** What protects the data is not
 * a backup but a restore that has been watched working. A dump nobody has
 * restored is not evidence of anything.
 *
 * **It asserts by identity, not by "pg_restore raised no error."** pg_restore
 * can succeed having skipped objects, so the check compares the SET of tables
 * first — a skipped table is present on one side and absent on the other — and
 * then an exact `count(*)` for each, printed as `schema.table: N = N`. The
 * sweep covers every non-system schema, which puts
 * `drizzle.__drizzle_migrations` in it without naming it; the ledger's last row
 * is then printed on both sides as well, because that row is what
 * `drizzle-kit migrate` reads on the restored copy's next migration.
 *
 * **It refuses to pass on nothing.** A comparison of 0 = 0 across forty empty
 * tables is green and proves nothing at all, so a comparison with no tables or
 * no rows is a failure, and every comparison prints how many of each it read.
 *
 * **Two restores, into two different kinds of empty.**
 *
 *   1. A scratch database in the running cluster. Fast, and it proves the
 *      archive carries the schema, the enums, the data and the ledger.
 *   2. A throwaway Postgres container on an EMPTY VOLUME, started for this run
 *      and removed after it. This is the nearest available stand-in for a
 *      second machine: a same-cluster restore silently reuses roles, extensions
 *      and settings that a real restore has to bring with it, so on its own it
 *      proves less than it looks like it proves. The image is read off the live
 *      container rather than written here, so the restore can never be tested
 *      against a server version the dump did not come from.
 *
 * Neither is a second machine. A restore onto another machine is a step a
 * person does by hand, and the backup is not fully proven until one has been.
 */

import {
  type Container,
  backupDir,
  countTables,
  createDatabase,
  databaseExists,
  docker,
  dropDatabase,
  formatBytes,
  ledgerLastRow,
  listDumps,
  loadEnv,
  requireEnv,
  restoreInto,
} from "./backup-shared";

const THROWAWAY = "kladra-backup-verify";
const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 2_000;

type Comparison = { label: string; ok: boolean };

/**
 * Restores, then counts. Both stages go through here, so a defect fed in at
 * this one point shows up in both — which is how the row comparison can be
 * watched going red before it is believed.
 */
function restoreAndCount(
  container: Container,
  database: string,
  dumpPath: string,
): Map<string, number> {
  restoreInto(container, database, dumpPath);
  return countTables(container, database);
}

function compare(
  label: string,
  source: Map<string, number>,
  restored: Map<string, number>,
): Comparison {
  console.log(`\n--- ${label} ---`);

  const names = [...new Set([...source.keys(), ...restored.keys()])].sort();
  let mismatches = 0;
  let rows = 0;

  for (const name of names) {
    const a = source.get(name);
    const b = restored.get(name);
    if (a === undefined || b === undefined) {
      console.log(
        `  ${name}: ${a ?? "ABSENT"} = ${b ?? "ABSENT"}   MISMATCH — table missing on one side`,
      );
      mismatches += 1;
      continue;
    }
    rows += a;
    console.log(`  ${name}: ${a} = ${b}${a === b ? "" : "   MISMATCH"}`);
    if (a !== b) {
      mismatches += 1;
    }
  }

  console.log(`  compared ${names.length} tables, ${rows} rows`);

  if (names.length === 0 || rows === 0) {
    console.log(
      `  FAILED — nothing was compared. ${names.length} tables and ${rows} rows\n` +
        "  is a green result over an empty read, which proves nothing.",
    );
    return { label, ok: false };
  }
  if (mismatches > 0) {
    console.log(`  FAILED — ${mismatches} of ${names.length} tables do not match.`);
    return { label, ok: false };
  }
  console.log("  OK — every table matches.");
  return { label, ok: true };
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/** The live container's own image, so client and server can never differ. */
function liveImage(): string {
  const id = docker(["compose", "ps", "-q", "db"]).stdout.trim();
  if (!id) {
    throw new Error("The db container is not running. `docker compose up -d db`.");
  }
  const image = docker(["inspect", "-f", "{{.Config.Image}}", id]).stdout.trim();
  if (!image) {
    throw new Error(`Could not read the image of container ${id}.`);
  }
  return image;
}

function removeThrowaway(): void {
  docker(["rm", "-f", THROWAWAY]);
}

async function waitForThrowaway(database: string): Promise<void> {
  const script =
    'PGPASSWORD=$POSTGRES_PASSWORD psql -U "$POSTGRES_USER" ' +
    `-d ${database} -At -c "SELECT 1"`;
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const probe = docker(["exec", "-i", THROWAWAY, "sh", "-c", script], { input: "" });
    if (probe.status === 0 && probe.stdout.trim() === "1") {
      return;
    }
    await sleep(READY_POLL_MS);
  }

  const logs = docker(["logs", "--tail", "20", THROWAWAY]);
  throw new Error(
    "The throwaway container did not accept connections within " +
      `${READY_TIMEOUT_MS / 1000}s.\n${logs.stdout.trim()}\n${logs.stderr.trim()}`,
  );
}

async function main(): Promise<void> {
  loadEnv();
  requireEnv();

  const live: Container = { compose: "db" };
  const liveDb = process.env.POSTGRES_DB as string;

  const directory = backupDir();
  const [newest] = listDumps(directory);
  if (!newest) {
    throw new Error(`No dumps in ${directory}.\n  Run \`npm run backup\` first.`);
  }

  console.log(`dump      ${newest.path}`);
  console.log(
    `          ${formatBytes(newest.size)}, written ${new Date(newest.mtimeMs).toISOString()}`,
  );
  console.log(`source    ${liveDb} in the running db container`);

  const sourceCounts = countTables(live, liveDb);
  const sourceLedger = ledgerLastRow(live, liveDb);

  const results: Comparison[] = [];

  // Stage 1 — a scratch database beside the live one.
  const scratch = `${liveDb}_restore_check`;
  console.log(`\n=== STAGE 1 — scratch database ${scratch}, same cluster ===`);
  if (databaseExists(live, scratch)) {
    dropDatabase(live, scratch);
  }
  createDatabase(live, scratch);
  const scratchCounts = restoreAndCount(live, scratch, newest.path);
  results.push(
    compare(`${liveDb} vs ${scratch} (same cluster)`, sourceCounts, scratchCounts),
  );
  console.log(`  ledger source   ${sourceLedger}`);
  console.log(`  ledger restored ${ledgerLastRow(live, scratch)}`);

  // Stage 2 — a cluster that has never seen this application. It publishes no
  // port and joins no network; everything reaches it through `docker exec`.
  const image = liveImage();
  console.log(`\n=== STAGE 2 — throwaway ${image} on an empty volume ===`);
  removeThrowaway();
  const throwaway: Container = { name: THROWAWAY };
  try {
    const started = docker([
      "run",
      "-d",
      "--name",
      THROWAWAY,
      // Names only. The values are copied from this process's environment, so
      // POSTGRES_PASSWORD never appears on a command line or in shell history.
      "-e",
      "POSTGRES_USER",
      "-e",
      "POSTGRES_PASSWORD",
      "-e",
      "POSTGRES_DB",
      image,
    ]);
    if (started.status !== 0) {
      throw new Error(
        `Could not start the throwaway container.\n${started.stderr.trim()}`,
      );
    }
    await waitForThrowaway(liveDb);
    console.log(`  started, ${liveDb} created empty by the entrypoint`);

    const throwawayCounts = restoreAndCount(throwaway, liveDb, newest.path);
    results.push(
      compare(`${liveDb} vs ${liveDb} (empty cluster)`, sourceCounts, throwawayCounts),
    );
    console.log(`  ledger source   ${sourceLedger}`);
    console.log(`  ledger restored ${ledgerLastRow(throwaway, liveDb)}`);
  } finally {
    removeThrowaway();
    console.log("  throwaway removed");
  }

  console.log("\n=== RESULT ===");
  for (const result of results) {
    console.log(`  ${result.ok ? "PASS" : "FAIL"}  ${result.label}`);
  }
  if (results.some((result) => !result.ok)) {
    throw new Error("The dump does not match its source. Do not trust it as a backup.");
  }
  console.log(
    "\nBoth restores match the live database. Neither is a second machine —\n" +
      "a restore onto another machine is still a step a person does by hand.",
  );
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
