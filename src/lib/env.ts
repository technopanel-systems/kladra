import { existsSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

/**
 * Load `.env` from the repo root into process.env for host-side scripts
 * (drizzle-kit, seed, migrate, tests). Next.js loads .env itself; inside the
 * container the variables are already real environment, and loadEnvFile never
 * overrides an existing value. Safe to call more than once.
 */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = resolve(process.cwd(), ".env");
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
  if (process.env.DATABASE_URL) {
    // A trailing carriage return in an inline value connects to a database
    // that does not exist — trim once, here.
    process.env.DATABASE_URL = process.env.DATABASE_URL.trim();
  }
  if (process.env.TEST_DATABASE_URL) {
    process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL.trim();
  }
}

/**
 * The database the test suite owns, on the same server as the app's.
 *
 * Tests reseed from scratch — `db:clear` then `seed:demo` — so pointing them at
 * DATABASE_URL wipes whatever the developer was looking at. That happened: a
 * screenshot pass and a test run overlapped, and half the review's findings were
 * records disappearing mid-session and sessions being signed out, not bugs.
 *
 * Derived rather than configured, so nobody has to remember a second variable
 * and no `.env` can point the suite at production by omission. `TEST_DATABASE_URL`
 * overrides it when the test database lives somewhere else entirely.
 */
export function testDatabaseUrl(): string {
  loadEnv();
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) return explicit;

  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      "DATABASE_URL is not set, so the test database name cannot be derived from it. " +
        "Copy .env.example to .env (see README.md), or set TEST_DATABASE_URL.",
    );
  }
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "");
  if (!name) throw new Error(`DATABASE_URL names no database: ${base}`);
  if (name.endsWith("_test")) return base;
  url.pathname = `/${name}_test`;
  return url.toString();
}
