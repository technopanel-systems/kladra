import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // One pool per process, survives Next.js hot reloads.
  var __kladraPool: Pool | undefined;
}

function makePool(): Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString: url, max: 10 });
}

export const pool: Pool = globalThis.__kladraPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalThis.__kladraPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
