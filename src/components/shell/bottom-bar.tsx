"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";
import { bottomBarFor, isActive, navFor } from "./nav";

/**
 * The phone shell (below `md`): the rail becomes a bar under the thumb, four
 * items wide, and everything the role can reach — including the admin group —
 * opens in a bottom sheet. Every target is at least 44px tall.
 */
export function BottomBar({ role }: { role: Role }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const bar = bottomBarFor(role);
  const groups = navFor(role);

  return (
    <>
      <nav
        aria-label={t("shell.mainNav")}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-rail glass pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {bar.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 transition-colors",
                active ? "text-rail-strong" : "text-rail-text",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className="max-w-full truncate text-[10px] font-medium">
                {t(item.shortKey ?? item.labelKey)}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-14 min-w-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-rail-text"
        >
          <Menu className="size-5 shrink-0" />
          <span className="max-w-full truncate text-[10px] font-medium">{t("common.menu")}</span>
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80svh] overflow-y-auto rounded-t-xl pb-6">
          <SheetHeader>
            <SheetTitle>{t("common.menu")}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-3 pb-2">
            {groups.map((group, index) => (
              <div key={group.labelKey ?? index} className="flex flex-col gap-1">
                {group.labelKey ? (
                  <p className="px-2 pt-3 pb-1 text-[11px] font-medium text-muted-foreground">
                    {t(group.labelKey)}
                  </p>
                ) : null}
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <SheetClose asChild key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm font-medium transition-colors",
                          active ? "bg-secondary text-foreground" : "text-muted-foreground",
                        )}
                      >
                        <Icon className="size-[18px] shrink-0" />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </Link>
                    </SheetClose>
                  );
                })}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
