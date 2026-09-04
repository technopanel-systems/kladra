"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLive } from "@/components/live/live-provider";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * The count comes from the live channel, never from a poll (DESIGN §2). Over
 * ninety-nine it stops counting — the number stops being information and the
 * badge stops fitting.
 */
export function NotificationBell() {
  const t = useTranslations();
  const { unread } = useLive();
  const label = unread > 0 ? t("shell.unreadCount", { count: unread }) : t("common.notifications");

  return (
    <Button asChild variant="ghost" size="icon" className="relative" aria-label={label}>
      <Link href="/notifications">
        <Bell />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="num absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-ink"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
