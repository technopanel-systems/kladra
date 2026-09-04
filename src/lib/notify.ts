/**
 * Notifications — the stored kind + params (SPEC §4 D13), and the live nudge
 * that makes the bell move without anybody refreshing (DESIGN §2).
 *
 * `createNotification` is the only writer. It inserts and announces inside the
 * caller's transaction, so the bell's number and the row behind it commit
 * together: a reader who follows the notice always finds the notification.
 *
 * `unreadCount` is the ONE definition of "unread" (rules/data.md § one
 * definition per figure). The bell, the SSE payload and /api/notifications/count
 * all call it; a second count beside it is the drift trap.
 *
 * No `import "server-only"` here for the reason given in src/lib/live.ts.
 */
import { and, count, eq, isNull } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { notifications } from "@/db/schema";
import { notifyLive } from "@/lib/live";

/**
 * Everything Kladra tells anybody, by name.
 *
 * A kind IS the message key: the notifications screen renders
 * `notifications.<kind>` in the reader's language, with the params below (D13).
 * Listing them here rather than typing a string at each call site is what keeps
 * the writer and the reader from drifting — the seed wrote
 * `quotation_requested` while the actions wrote `quotationRequested`, and
 * neither side would have noticed until a rep saw a raw key on a screen.
 *
 * The params are a fixed vocabulary too: `label` is always the quotation's own
 * name (Q-12), `smacNumber` is always SMAC's, `rep` is a person, `reason` is
 * what somebody wrote.
 */
export const NOTIFICATION_KINDS = [
  "quotationRequested",
  "quotationIssued",
  "quotationReturned",
  "quotationAccepted",
  "quotationRejected",
  "quotationCancelled",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NewNotification = {
  /** Who is being told. */
  userId: string;
  /** What happened, as a key rendered in the reader's language (D13). */
  kind: NotificationKind;
  /** The words that key needs — a quotation number, a rep's name, a reason. */
  params?: Record<string, string | number>;
  /** Where clicking it goes, locale-free (e.g. "/quotations/…"). */
  link: string;
};

/** How many notifications this user has not read yet. */
export async function unreadCount(tx: Tx | Db, userId: string): Promise<number> {
  const [row] = await tx
    .select({ unread: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.unread ?? 0;
}

/**
 * Store a notification and tell its reader at once. Returns the new row's id.
 * Pass the transaction that made the change being announced.
 */
export async function createNotification(tx: Tx | Db, input: NewNotification): Promise<string> {
  const [row] = await tx
    .insert(notifications)
    .values({
      userId: input.userId,
      kind: input.kind,
      params: input.params ?? {},
      link: input.link,
    })
    .returning({ id: notifications.id });

  // Counted in the same transaction, so the number sent is the number the
  // reader's next request will compute for itself.
  const unread = await unreadCount(tx, input.userId);
  await notifyLive(tx, [input.userId], { type: "notification", id: row.id, unread });
  return row.id;
}

/**
 * Mark notifications read and re-announce the count, so the bell drops in every
 * tab this user has open. `notificationId` omitted means all of them. Returns
 * the new unread count. One writer for "read", beside the one writer for "new".
 */
export async function markNotificationsRead(
  tx: Tx | Db,
  userId: string,
  notificationId?: string,
): Promise<number> {
  const mine = and(eq(notifications.userId, userId), isNull(notifications.readAt));
  const read = await tx
    .update(notifications)
    .set({ readAt: new Date() })
    .where(notificationId ? and(mine, eq(notifications.id, notificationId)) : mine)
    .returning({ id: notifications.id });
  if (read.length === 0) return unreadCount(tx, userId);

  const unread = await unreadCount(tx, userId);
  await notifyLive(tx, [userId], { type: "notification", id: read[read.length - 1].id, unread });
  return unread;
}
