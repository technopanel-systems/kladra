/**
 * The bell's number, on demand. The count arrives with every live event, so
 * this exists for exactly one moment: the browser reconnecting after a gap,
 * when whatever happened during the gap was never delivered.
 *
 * It counts through src/lib/notify.ts — the one definition of "unread".
 */
import { NextResponse } from "next/server";
import { db } from "@/db";
import { NotAllowed, requireActor } from "@/lib/authz";
import { unreadCount } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let userId: string;
  try {
    userId = (await requireActor()).id;
  } catch (err) {
    if (err instanceof NotAllowed) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw err;
  }

  const unread = await unreadCount(db, userId);
  return NextResponse.json({ unread }, { headers: { "Cache-Control": "no-store" } });
}
