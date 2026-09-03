/**
 * Restore a dump into a NAMED target database.
 * `npm run restore -- <dump-file> --to <database> [--force]`
 *
 * **It never restores anywhere by default.** `--to` is required, so a restore
 * cannot land in the live database because someone forgot an argument. Naming
 * the live database is allowed, but only with `--force`, and on a terminal it
 * also asks for the name to be typed back. The typed confirmation is there
 * because the office PC's `.env` is copied from the same `.env.example` as a
 * development machine's, so no environment variable can tell the two apart.
 *
 * An existing non-live target is also refused without `--force`, because
 * restoring over a database someone is using is the same mistake one step
 * removed. With `--force` the target is dropped and recreated, so what comes
 * back is the dump and nothing else — a restore into a database that still
 * holds older rows would compare equal on the tables the dump happens to
 * cover, and that is not a restore.
 *
 * pg_restore runs inside the container and reads the archive from stdin, so
 * nothing is ever written inside the container. `--exit-on-error` is what makes
 * a skipped object a failure: pg_restore's default is to warn and still exit 0.
 *
 * **The dump holds every row and every password hash.** Restoring one onto a
 * machine puts the whole database there.
 */

import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

import {
  assertDbName,
  assertIsArchive,
  createDatabase,
  databaseExists,
  dropDatabase,
  loadEnv,
  requireEnv,
  restoreInto,
} from "./backup-shared";

type Args = { dump: string; target: string; force: boolean };

function parseArgs(argv: string[]): Args {
  const force = argv.includes("--force");
  const rest = argv.filter((arg) => arg !== "--force");

  const toIndex = rest.indexOf("--to");
  if (toIndex === -1 || rest[toIndex + 1] === undefined) {
    throw new Error(
      "restore needs a target database.\n" +
        "    npm run restore -- <dump-file> --to <database>\n" +
        "  --to is required so a restore can never land in the live database\n" +
        "  because an argument was forgotten.",
    );
  }
  const target = assertDbName(rest[toIndex + 1], "--to");
  const positional = rest.filter((arg, index) => index !== toIndex && index !== toIndex + 1);

  if (positional.length !== 1) {
    throw new Error(
      "restore needs exactly one dump file.\n" +
        "    npm run restore -- <dump-file> --to <database>",
    );
  }
  return { dump: resolve(positional[0]), target, force };
}

/**
 * Typed-back confirmation before the live database is overwritten. Only on a
 * terminal: a non-interactive caller already had to pass `--force` to get here.
 */
async function confirmLive(target: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return true; // --force was already required to get here.
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `This OVERWRITES the live database. Every row in ${target} is replaced by\n` +
        `the contents of the dump, and it cannot be undone.\n` +
        `Type the database name (${target}) to continue: `,
    );
    return answer.trim() === target;
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  loadEnv();
  requireEnv();

  const { dump, target, force } = parseArgs(process.argv.slice(2));
  const live = process.env.POSTGRES_DB as string;

  if (!existsSync(dump)) {
    throw new Error(`No such dump file: ${dump}`);
  }
  assertIsArchive(dump);

  const db = { compose: "db" };
  const exists = databaseExists(db, target);

  if (target === live && !force) {
    throw new Error(
      `${target} is the live database named by POSTGRES_DB.\n` +
        "  restore refuses to overwrite it without --force:\n" +
        `    npm run restore -- ${dump} --to ${target} --force\n` +
        "  Restore into a new name instead if you only want to read the dump.",
    );
  }
  if (target !== live && exists && !force) {
    throw new Error(
      `${target} already exists.\n` +
        "  Pass --force to drop and recreate it, or choose a name that is free.\n" +
        "  Restoring into a database that still holds rows is not a restore.",
    );
  }
  if (target === live && !(await confirmLive(target))) {
    throw new Error("Cancelled — nothing was touched.");
  }

  if (exists) {
    console.log(`→ dropping ${target}`);
    dropDatabase(db, target);
  }
  console.log(`→ creating ${target}`);
  createDatabase(db, target);

  console.log(`→ pg_restore into ${target} (inside the db container)`);
  restoreInto(db, target, dump);

  console.log(
    `\nRestored ${dump}\n  into ${target}.\n` +
      "  `npm run backup:verify` is what proves a dump matches its source; this\n" +
      "  command only proves pg_restore raised no error.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
