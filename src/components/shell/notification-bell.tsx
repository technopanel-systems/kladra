"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLive } from "@/components/live/live-provider";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * The count comes from the live channel, never from a poll (DESIGN §2). Past
 * ninety-nine it stops counting — the number stops being information and the
 * badge stops fitting. The badge hangs off the bell rather than off the
 * button, so it stays attached at the phone's 44px target size.
 */
export function NotificationBell() {
  const t = useTranslations();
  const { unread } = useLive();
  const label = unread > 0 ? t("shell.unreadCount", { count: unread }) : t("common.notifications");

  return (
    <Button asChild variant="ghost" size="icon" className="size-11 md:size-8" aria-label={label}>
      <Link href="/notifications">
        <span className="relative inline-flex">
          <Bell className="size-5 md:size-4" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="num absolute -top-1.5 -end-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-ink"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </span>
      </Link>
    </Button>
  );
}
