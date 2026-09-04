import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // One pool per process, survives Next.js hot reloads.
  var __kladraPool: Pool | undefined;
}

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * The connection, opened on FIRST USE rather than on import.
 *
 * It used to be opened while this module was being evaluated, and refused to
 * evaluate at all without DATABASE_URL. That reads as strict and was in fact a
 * broken deploy: `next build` imports every route module to read its config,
 * so building the Docker image — which has no `.env` and gets its database from
 * compose at RUN time — died on "Failed to collect page data for /api/health".
 * The documented `docker compose up --build -d` could not work, and nothing
 * said so, because the only build anybody ran was the one on a machine with a
 * `.env` beside it.
 *
 * Opening a socket is not something a module should do because somebody
 * imported it. The check is still here, still loud, and now happens the first
 * time somebody actually asks the database a question.
 */
let opened: { pool: Pool; db: Db } | null = null;

function open(): { pool: Pool; db: Db } {
  if (opened) return opened;

  const existing = globalThis.__kladraPool;
  const pool = existing ?? makePool();
  if (process.env.NODE_ENV !== "production") globalThis.__kladraPool = pool;

  opened = { pool, db: drizzle(pool, { schema }) };
  return opened;
}

function makePool(): Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString: url, max: 10 });
}

/**
 * `pool` and `db` stay values that thirty modules import by name; each one is a
 * stand-in that opens the connection on the first property somebody reads.
 *
 * Methods are bound to the real object on the way out: `pool.query` and
 * `db.transaction` both use `this`, and handing back an unbound function is how
 * a proxy like this passes every type check and fails at the first call.
 */
function standIn<T extends object>(real: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const target = real() as unknown as Record<string | symbol, unknown>;
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    },
    has(_target, property) {
      return property in (real() as object);
    },
  });
}

export const pool: Pool = standIn(() => open().pool);
export const db: Db = standIn(() => open().db);
export { schema };
