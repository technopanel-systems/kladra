import { getTranslations } from "next-intl/server";
import { NotificationsList } from "@/components/shell/notifications-list";
import { requireUser } from "@/lib/authz";
import { listNotifications } from "@/lib/notifications";

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
  const [t, rows] = await Promise.all([getTranslations(), listNotifications(user.id)]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("common.notifications")}</h1>

      {rows.length === 0 ? (
        // No action: an empty list has nothing to mark read, and offering
        // "Mark all read" under "everything is read" argues with itself.
        <div className="card-face flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("shell.emptyNotifications")}
          </p>
        </div>
      ) : (
        <NotificationsList rows={rows} />
      )}
    </div>
  );
}
