import { NextResponse } from "next/server";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

/** {"ok":true,"app":"up","db":"up","checkedAt":"…"} — 503 when the db is down. */
export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    await pool.query("select 1");
    return NextResponse.json({ ok: true, app: "up", db: "up", checkedAt });
  } catch {
    return NextResponse.json({ ok: false, app: "up", db: "down", checkedAt }, { status: 503 });
  }
}
