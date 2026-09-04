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
}
