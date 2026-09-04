/**
 * Reading notifications. Writing them is src/lib/notify.ts, which is also where
 * the vocabulary of kinds lives.
 *
 * A notification is not a copy of what happened; it is a pointer at it. The
 * sentence is built at read time from the kind and its params, in the reader's
 * language (D13) — so a rep who switches to English sees English on a notice
 * that was written while he was in Arabic. And `link` is where the thing itself
 * is, because a notice a person cannot act on is a notice they learn to ignore
 * (S52: a reminder is cleared by doing the work).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import type { NotificationKind } from "@/lib/notify";

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  params: Record<string, string | number>;
  link: string;
  read: boolean;
  /** The Riyadh day it arrived, as text (rules/data.md). */
  day: string;
};

/**
 * The most recent notices for one person, read and unread together.
 *
 * Capped rather than paged: a notice from three weeks ago is history, and the
 * things it points at are all still on their own screens. Fifty is more than
 * anybody scrolls.
 */
export async function listNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      params: notifications.params,
      link: notifications.link,
      readAt: notifications.readAt,
      day: sql<string>`to_char((${notifications.createdAt} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as NotificationKind,
    params: (row.params ?? {}) as Record<string, string | number>,
    link: row.link,
    read: row.readAt !== null,
    day: row.day,
  }));
}
