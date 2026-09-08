"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { Link } from "@/i18n/navigation";
import { tabCookie, type Tab } from "@/lib/tabs";
import { cn } from "@/lib/utils";

/**
 * The tabs across the top of a home screen (D151).
 *
 * Links, not buttons, for the reason the view switch and the filter chips are
 * links: the tab is in the URL, so it is a place, and a manager can send
 * somebody his metrics as an address.
 *
 * It is deliberately NOT the pill-shaped control the list-and-board switch
 * wears. That one is a control inside a screen and this one is the structure OF
 * the screen, and two things that mean different things should not be the same
 * object (DESIGN §3). An underline under the live one is the plainest thing
 * that reads as "you are here" without a second colour or a filled shape, and
 * the label is bolder as well, so the state is never colour alone.
 *
 * The memory is a cookie written in the browser rather than a server action,
 * for the reason `ViewSwitch` gives: it is a preference, nothing else reads it,
 * and a round trip would make pressing it slower than it is to act on.
 */
export function PageTabs({
  screen,
  tab,
  tabs,
}: {
  /** Names the cookie: the day and the team remember separately. */
  screen: string;
  tab: Tab;
  /** In the order they are read, each with the address it lives at. */
  tabs: { value: Tab; href: string }[];
}) {
  const t = useTranslations();

  useEffect(() => {
    // A year, and `lax` so it survives following a link in from an email.
    document.cookie = `${tabCookie(screen)}=${tab}; path=/; max-age=31536000; samesite=lax`;
  }, [screen, tab]);

  if (tabs.length < 2) return null;

  return (
    <nav
      aria-label={t("common.sections")}
      data-slot="page-tabs"
      // The rule runs the width of the screen and the live tab sits on it, so
      // the row reads as one object rather than as three loose links.
      className="-mb-px flex items-end gap-1 overflow-x-auto border-b border-line"
    >
      {tabs.map((entry) => {
        const live = entry.value === tab;
        return (
          <Link
            key={entry.value}
            href={entry.href}
            aria-current={live ? "page" : undefined}
            data-slot="page-tab"
            data-live={live ? "true" : undefined}
            className={cn(
              // 44px tall so it is a thumb target on a phone without looking
              // oversized at a desk, and it never wraps: a tab that breaks in
              // two lines stops reading as a tab.
              "relative flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 text-sm",
              "transition-colors hover:bg-surface-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/50",
              live
                ? "font-semibold text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand after:content-['']"
                : "text-muted-foreground",
            )}
          >
            {t(`common.tab.${entry.value}`)}
            <LinkPending />
          </Link>
        );
      })}
    </nav>
  );
}
