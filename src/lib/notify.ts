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
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { notifications, type NotificationSubjectType } from "@/db/schema";
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
 * The params are a fixed vocabulary too: `label` is always the record's own
 * name (Q-12, D-3, and a customer's name where a handover is concerned),
 * `smacNumber` is always SMAC's, `rep` is a person, `reason` is what somebody
 * wrote.
 */
export const NOTIFICATION_KINDS = [
  "quotationRequested",
  "quotationIssued",
  "quotationReturned",
  "quotationAccepted",
  "quotationRejected",
  "quotationCancelled",
  "dispatchRequested",
  "dispatchApproved",
  "dispatchRefused",
  "companyHandedOver",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** The record a notice is about, and where the work at the end of it lives. */
export type NotificationSubject = { type: NotificationSubjectType; id: string };

/**
 * What takes a notice off the screen for good (D79).
 *
 * Two answers and no third. **work** — the notice points at something somebody
 * still has to do, and it is cleared by doing it: the coordinator answers the
 * request, the rep fixes what came back, the customer's decision is recorded.
 * That is S52 said about the bell rather than about a follow-up date, and it is
 * why the clearing lives in the action that makes the change rather than in a
 * sweep that runs later and can be wrong for an hour. **reading** — the notice
 * announces something already finished, so there is nothing to do with it but
 * read it, and the reading is the acting: it is deleted when it is marked read
 * rather than greyed out and kept for ever.
 *
 * A `Record` of every kind, so a new kind cannot be added without answering
 * this question: the compiler asks for it, which is the only place that will
 * ask at the right time. Defaulting an unclassified kind to either answer is
 * how a notice about work somebody must still do would quietly disappear the
 * first time he read it.
 */
const CLEARED_BY: Record<NotificationKind, "work" | "reading"> = {
  quotationRequested: "work",
  quotationReturned: "work",
  quotationIssued: "work",
  dispatchRequested: "work",
  quotationAccepted: "reading",
  quotationRejected: "reading",
  quotationCancelled: "reading",
  dispatchApproved: "reading",
  dispatchRefused: "reading",
  companyHandedOver: "reading",
};

/** The kinds that die when they are read. Derived, never listed twice. */
const READING_KINDS = NOTIFICATION_KINDS.filter((kind) => CLEARED_BY[kind] === "reading");

/**
 * Whether reading one of these is the whole of acting on it.
 *
 * Exported for the seed, which writes `read_at` straight onto a row and is
 * therefore the one writer that could produce a state the app cannot: a
 * finished fact somebody has already read is not a row anywhere, so a demo
 * carrying one would be showing something this rule makes impossible.
 */
export function clearedByReading(kind: NotificationKind): boolean {
  return CLEARED_BY[kind] === "reading";
}

export type NewNotification = {
  /** Who is being told. */
  userId: string;
  /** What happened, as a key rendered in the reader's language (D13). */
  kind: NotificationKind;
  /** The words that key needs — a quotation number, a rep's name, a reason. */
  params?: Record<string, string | number>;
  /** Where clicking it goes, locale-free (e.g. "/quotations/…"). */
  link: string;
  /**
   * What it is ABOUT. The link is where a person goes; this is what the app
   * asks about later, when the work is done and the notice has to go (D79).
   */
  subject: NotificationSubject;
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
      subjectType: input.subject.type,
      subjectId: input.subject.id,
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
  const scope = notificationId ? and(mine, eq(notifications.id, notificationId)) : mine;

  // The ones that announce something finished go rather than grey: there is
  // nothing at the end of them to do, so reading one IS acting on it, and a
  // list that keeps them is a log nobody asked for (D79). What stays behind on
  // this screen after "Mark all read" is exactly the work still open.
  const gone = await tx
    .delete(notifications)
    .where(and(scope, inArray(notifications.kind, READING_KINDS)))
    .returning({ id: notifications.id });

  const read = await tx
    .update(notifications)
    .set({ readAt: new Date() })
    .where(scope)
    .returning({ id: notifications.id });

  const touched = [...gone, ...read];
  if (touched.length === 0) return unreadCount(tx, userId);

  const unread = await unreadCount(tx, userId);
  await notifyLive(tx, [userId], { type: "notification", id: touched[touched.length - 1].id, unread });
  return unread;
}

/**
 * Take back what a notice was about, because it is no longer true (D79).
 *
 * Called by the action that settles the work, inside its transaction, so the
 * bell and the row it points at stop existing at the same instant the thing
 * they described stops being the case. Deleted rather than marked: a notice is
 * a pointer, and what actually happened is on the audit log, which is the
 * record (rules/data.md).
 *
 * It clears everybody's, not the actor's — several coordinators can each hold a
 * notice about one request, and the person who answers it is the reason all of
 * them are stale. Only the ones that were still unread change a bell, so only
 * those readers are told.
 */
export async function clearNotifications(
  tx: Tx | Db,
  subject: NotificationSubject,
  kinds: readonly NotificationKind[],
): Promise<void> {
  if (kinds.length === 0) return;

  const gone = await tx
    .delete(notifications)
    .where(
      and(
        eq(notifications.subjectType, subject.type),
        eq(notifications.subjectId, subject.id),
        inArray(notifications.kind, [...kinds]),
      ),
    )
    .returning({
      id: notifications.id,
      userId: notifications.userId,
      readAt: notifications.readAt,
    });

  const bells = gone.filter((row) => row.readAt === null);
  for (const userId of new Set(bells.map((row) => row.userId))) {
    const unread = await unreadCount(tx, userId);
    await notifyLive(tx, [userId], {
      type: "notification",
      id: bells.find((row) => row.userId === userId)!.id,
      unread,
    });
  }
}
