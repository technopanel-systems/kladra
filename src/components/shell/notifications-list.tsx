"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { markReadAction } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { DayText } from "@/components/ui-ext/day-text";
import type { NotificationRow } from "@/lib/notifications";

/**
 * What Kladra told this person, newest first.
 *
 * Each row is the sentence and the thing it is about, and pressing it goes
 * there and marks it read in one move — because the point of a notice is the
 * work at the other end of it, and a rep who has to press "read" as well learns
 * to press nothing (S52, S53).
 *
 * The sentence is built here from the kind and its params, in the reader's
 * language: `notifications.<kind>` (D13). The stored row holds no English.
 */
export function NotificationsList({ rows }: { rows: NotificationRow[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const unread = rows.filter((row) => !row.read).length;

  function markAll() {
    startTransition(async () => {
      const outcome = await markReadAction();
      if (!outcome.ok) {
        toast.error(outcome.error);
        return;
      }
      router.refresh();
    });
  }

  function open(row: NotificationRow) {
    if (row.read) return;
    // Fire and forget: the navigation is the point, and a notice that stayed
    // bold because a write was slow is not worth holding the rep up for.
    startTransition(async () => {
      await markReadAction(row.id);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {unread > 0 ? (
        <div className="flex">
          <Button type="button" variant="outline" onClick={markAll} disabled={pending}>
            {t("common.markAllRead")}
          </Button>
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={row.link}
              onClick={() => open(row)}
              className="card-face flex items-start gap-3 p-3 transition-colors hover:bg-surface-2"
            >
              {/* The one mark that says "you have not seen this". A word would
                  be read aloud on every row; the label carries it instead. */}
              <span
                aria-hidden="true"
                className={
                  row.read ? "mt-2 size-2 shrink-0 rounded-full" : "mt-2 size-2 shrink-0 rounded-full bg-brand"
                }
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm">
                  {t(`notifications.${row.kind}`, row.params)}
                  {row.read ? null : (
                    <span className="sr-only"> · {t("notifications.unreadMark")}</span>
                  )}
                </span>
                <DayText day={row.day} locale={locale} className="text-xs text-muted-foreground" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
