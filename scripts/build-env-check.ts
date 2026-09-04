/**
 * Builds the app the way the Docker image builds it: with no database, no auth
 * secret and no `.env` values in the environment at all.
 *
 * `next build` imports every route module to read its config. A module that
 * opens a connection, or reads a secret, while it is being evaluated therefore
 * builds fine on a developer's machine — where `.env` sits beside it — and
 * fails inside the image, where the database only arrives at RUN time. That
 * shipped: `docker compose up --build -d` was in README.md for five phases and
 * could not have worked, because the only build anybody ran was the local one.
 *
 * Next does not overwrite a variable that is already in `process.env`, so
 * setting each one to an empty string is what stops `.env` from filling it back
 * in. Empty is not absent, and `process.env.X?.trim()` is falsy either way —
 * which is the check every one of these values goes through.
 *
 * Its own build directory, because Next 16 takes an exclusive lock on one and
 * the developer's server is usually holding `.next`.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/** Everything .env carries. Absent here, exactly as in the image. */
const BLANK = [
  "DATABASE_URL",
  "TEST_DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_URL",
  "PUBLIC_URL",
  "POSTGRES_PASSWORD",
  "SEED_PASSWORD",
  "BACKUP_DIR",
];

const DIST = ".next-build-check";

function main(): void {
  const env: NodeJS.ProcessEnv = { ...process.env, NEXT_DIST_DIR: DIST };
  for (const name of BLANK) env[name] = "";

  // `next build` rewrites tsconfig.json — it reformats it and adds its build
  // directory's generated types to `include`. This build's directory is a
  // throwaway, so those two lines would point at nothing for ever. Put the file
  // back exactly as it was, whatever the build does.
  const tsconfig = resolve(process.cwd(), "tsconfig.json");
  const before = readFileSync(tsconfig, "utf8");

  // Next's own entry point under this Node, rather than `npx` through a shell.
  // `npx` needs a shell to resolve on Windows, a shell concatenates the
  // arguments instead of passing them, and a spawn that cannot find its command
  // exits non-zero — which this script would have reported as a broken build.
  const next = resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const result = spawnSync(process.execPath, [next, "build"], { env, stdio: "inherit" });

  if (result.error) {
    console.error(`check:build-env — could not start the build: ${result.error.message}`);
    process.exit(1);
  }

  // The directory is a throwaway; leaving it behind would be a second build
  // tree for `next dev` to trip over.
  rmSync(resolve(process.cwd(), DIST), { recursive: true, force: true });
  if (readFileSync(tsconfig, "utf8") !== before) writeFileSync(tsconfig, before);

  if (result.status !== 0) {
    console.error(
      "\ncheck:build-env — the build needs something from .env.\n" +
        "Something is read while a module is being IMPORTED rather than when it is used.\n" +
        "The error above names the route; the cause is usually a connection, a secret or a\n" +
        "query builder at module scope (src/db/index.ts explains it).",
    );
    process.exit(result.status ?? 1);
  }

  console.log("check:build-env — the app builds with no .env, as the image does");
}

main();
