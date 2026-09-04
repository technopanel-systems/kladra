"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebar } from "@/hooks/use-sidebar";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";
import { BrandMark } from "./brand-mark";
import { isActive, navFor, type NavItem } from "./nav";

/**
 * The rail, from `md` up (below that the bottom bar takes over). Collapses to
 * icons; the width transition is 200 ms, inside DESIGN §2's 150–250 ms window.
 * The brand gradient is deliberately absent here — DESIGN §1 keeps it on the
 * primary button — so the active row is a wash plus stronger text.
 */
export function Sidebar({ role, direction }: { role: Role; direction: "ltr" | "rtl" }) {
  const t = useTranslations();
  const pathname = usePathname();
  const { collapsed, ready, toggle } = useSidebar();
  const groups = navFor(role);
  const tooltipSide = direction === "rtl" ? "left" : "right";
  // The chevron points the way the rail is about to move; RTL mirrors it.
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  function row(item: NavItem) {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    const label = t(item.labelKey);
    const link = (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-9 items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors",
          collapsed ? "w-10 justify-center px-0" : "px-2.5",
          active
            ? "bg-rail-active text-rail-strong"
            : "text-rail-text hover:bg-rail-active hover:text-rail-strong",
        )}
      >
        <Icon className="size-[18px] shrink-0" />
        <span className={cn("truncate", collapsed && "sr-only")}>{label}</span>
      </Link>
    );

    if (!collapsed) return <li key={item.href}>{link}</li>;
    return (
      <li key={item.href} className="flex justify-center">
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side={tooltipSide} sideOffset={10}>
            {label}
          </TooltipContent>
        </Tooltip>
      </li>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        aria-label={t("shell.mainNav")}
        data-collapsed={collapsed}
        className={cn(
          "sticky top-0 z-30 hidden h-svh shrink-0 flex-col overflow-hidden border-e border-line bg-rail glass md:flex",
          ready && "transition-[width] duration-200 ease-out",
          collapsed ? "w-[4.5rem]" : "w-60",
        )}
      >
        <div className={cn("flex h-14 shrink-0 items-center gap-2.5", collapsed ? "px-4" : "px-3")}>
          <BrandMark />
          <span
            className={cn(
              "truncate text-[15px] font-semibold text-rail-strong",
              collapsed && "sr-only",
            )}
          >
            {t("common.app")}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((group, index) => (
            <div key={group.labelKey ?? index}>
              {group.labelKey ? (
                <p
                  className={cn(
                    "px-2.5 pt-5 pb-1.5 text-[11px] font-medium text-rail-text/70",
                    collapsed && "sr-only",
                  )}
                >
                  {t(group.labelKey)}
                </p>
              ) : null}
              {group.labelKey && collapsed ? <div className="my-3 h-px bg-line" /> : null}
              <ul className="flex flex-col gap-0.5">{group.items.map(row)}</ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line p-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={t(collapsed ? "common.expand" : "common.collapse")}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-lg text-[13px] font-medium text-rail-text transition-colors hover:bg-rail-active hover:text-rail-strong",
              collapsed ? "w-10 justify-center px-0" : "w-full px-2.5",
            )}
          >
            <ToggleIcon className="size-[18px] shrink-0 rtl:-scale-x-100" />
            <span className={cn("truncate", collapsed && "sr-only")}>{t("common.collapse")}</span>
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
