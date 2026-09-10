"use client";

import { LayoutGrid, List as ListIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { Link } from "@/i18n/navigation";
import { useRemembered } from "@/hooks/use-remembered";
import { DEFAULT_VIEW, parseView, type ListView } from "@/lib/view";
import { cn } from "@/lib/utils";

/**
 * List or board, and the memory of which (SPEC §3 P8, DESIGN §6).
 *
 * Two links rather than a toggle button, for the reason the filter chips are
 * links: the view is in the URL, so it is a place, and a coordinator can send
 * somebody "the board" as an address.
 *
 * The memory belongs to the PERSON (SPEC §3, D164). It was a cookie, on the
 * argument that a preference is not worth a table and a round trip would make
 * pressing the switch slower than pressing it does anything — and the second
 * half of that was about the wrong moment: the press navigates, the new screen
 * renders, and only then does `useRemembered` mention what he is looking at.
 * The first half was answered by the founder: a cookie is per browser, so the
 * rep who chose the board at his desk got the list back on his phone. The
 * server reads the row only when the URL says nothing.
 */
export function ViewSwitch({
  screen,
  view,
  remembered,
  listHref,
  boardHref,
}: {
  /** Names the row: quotations and dispatches remember separately. */
  screen: string;
  view: ListView;
  /** What was remembered when this page was drawn — nothing, on a first visit. */
  remembered?: string;
  listHref: string;
  boardHref: string;
}) {
  const t = useTranslations();

  useRemembered("view", screen, view, parseView(remembered) ?? DEFAULT_VIEW);

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
        <LinkPending />
      </Link>
    </Button>
  );
}
