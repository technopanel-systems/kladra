import { NextResponse } from "next/server";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

/**
 * {"ok":true,"app":"up","db":"up","checkedAt":"…"} — 503 when the db is down.
 *
 * Outside production it also reports `database`, the name it is actually
 * connected to. tests/global-setup.ts refuses to clear and reseed a server that
 * answers with anything but the test database: the suite attaches to a server
 * that is already up (`reuseExistingServer`), so "which database is behind this
 * port" has to be asked, not assumed. Withheld in production, where nothing
 * asks and an unauthenticated endpoint should not volunteer it.
 */
export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const result = await pool.query<{ database: string }>("select current_database() as database");
    const database =
      process.env.NODE_ENV === "production" ? undefined : result.rows[0]?.database;
    return NextResponse.json({ ok: true, app: "up", db: "up", database, checkedAt });
  } catch {
    return NextResponse.json({ ok: false, app: "up", db: "down", checkedAt }, { status: 503 });
  }
}
