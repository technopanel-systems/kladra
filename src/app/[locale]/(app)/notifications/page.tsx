import { getTranslations } from "next-intl/server";
import { NotificationsList } from "@/components/shell/notifications-list";
import { Empty } from "@/components/ui-ext/empty";
import { ListTail } from "@/components/ui-ext/list-tail";
import { requireUser } from "@/lib/authz";
import { countNotifications, listNotifications } from "@/lib/notifications";

/**
 * What Kladra told this person (SPEC S53).
 *
 * The bell has counted unread notices since P2 and had nowhere to send anybody
 * — a control that goes to a sentence saying the screen is coming. The
 * quotation chain is the first thing that actually writes them: a request sent
 * back, or refused, reaches the rep with its written reason, and this is where
 * he reads it.
 */
export default async function NotificationsPage() {
  const user = await requireUser();
  const [t, rows, total] = await Promise.all([
    getTranslations(),
    listNotifications(user.id),
    countNotifications(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("common.notifications")}</h1>

      {rows.length === 0 ? (
        // No action: an empty list has nothing to mark read, and offering
        // "Mark all read" under "everything is read" argues with itself. The
        // kit's empty, not a card: a card is a thing at rest, and this is the
        // space where notices will be (P13-G6).
        <Empty>{t("shell.emptyNotifications")}</Empty>
      ) : (
        <>
          <NotificationsList rows={rows} canWrite={!user.viewedBy} />
          {/* The list is capped, and a capped list says so (D80). There is no
              search here, so the sentence says where the rest went instead. */}
          <ListTail
            shown={rows.length}
            total={total}
            hint={t("notifications.olderNotShown", { shown: rows.length, total })}
          />
        </>
      )}
    </div>
  );
}
