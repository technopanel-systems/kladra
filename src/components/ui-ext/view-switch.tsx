"use client";

import { LayoutGrid, List as ListIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { viewCookie, type ListView } from "@/lib/view";
import { cn } from "@/lib/utils";

/**
 * List or board, and the memory of which (SPEC §3 P8, DESIGN §6).
 *
 * Two links rather than a toggle button, for the reason the filter chips are
 * links: the view is in the URL, so it is a place, and a coordinator can send
 * somebody "the board" as an address.
 *
 * The memory is a cookie written here in the browser, not a server action. It
 * is a preference, not data: nothing else reads it, losing it costs a click,
 * and a round trip to store it would make pressing the switch slower than
 * pressing it does anything. The server reads it only when the URL says
 * nothing.
 */
export function ViewSwitch({
  screen,
  view,
  listHref,
  boardHref,
}: {
  /** Names the cookie: quotations and dispatches remember separately. */
  screen: string;
  view: ListView;
  listHref: string;
  boardHref: string;
}) {
  const t = useTranslations();

  useEffect(() => {
    // A year, and `lax` so it survives following a link in from an email.
    document.cookie = `${viewCookie(screen)}=${view}; path=/; max-age=31536000; samesite=lax`;
  }, [screen, view]);

  return (
    <div
      role="group"
      aria-label={t("common.view")}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 p-0.5"
    >
      <Choice href={listHref} active={view === "list"} label={t("common.viewList")}>
        <ListIcon aria-hidden="true" className="size-3.5" />
      </Choice>
      <Choice href={boardHref} active={view === "board"} label={t("common.viewBoard")}>
        <LayoutGrid aria-hidden="true" className="size-3.5" />
      </Choice>
    </div>
  );
}

function Choice({
  href,
  active,
  label,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      asChild
      size="sm"
      variant="ghost"
      className={cn("h-7 gap-1.5 rounded-full px-2.5 text-xs", active && "bg-surface shadow-xs")}
    >
      <Link href={href} aria-current={active ? "true" : undefined}>
        {children}
        {label}
      </Link>
    </Button>
  );
}
