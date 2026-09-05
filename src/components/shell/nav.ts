import {
  Archive,
  Building2,
  CalendarCheck,
  CalendarDays,
  Download,
  FileText,
  FolderKanban,
  Inbox,
  ListTree,
  type LucideIcon,
  Target,
  Truck,
  Users,
  UsersRound,
} from "lucide-react";
import type { Role } from "@/lib/types";

/**
 * What each role sees in the rail. The list is the whole navigation model —
 * the sidebar, the phone bottom bar and the phone menu sheet all read it, so
 * a role never gains a screen in one place and loses it in another.
 *
 * The first item of a role's first group IS that role's home (src/lib/authz.ts
 * `homeFor`), named by what it shows rather than by the word "Home": for a rep
 * his Day, for the coordinator the Queue, for a manager the Team. A separate
 * "Home" entry pointing at a screen already in the list would light two rows at
 * once and teach the rep nothing — which is also why Your day is a screen of
 * its own rather than a second name for Companies.
 */

export type NavItem = {
  href: string;
  /** Message key, e.g. "common.companies". */
  labelKey: string;
  /** Shorter label for the 375px bottom bar; falls back to `labelKey`. */
  shortKey?: string;
  icon: LucideIcon;
};

export type NavGroup = {
  /** Message key for a group heading; the main group has none. */
  labelKey?: string;
  items: NavItem[];
};

const day: NavItem = {
  href: "/day",
  labelKey: "day.title",
  icon: CalendarCheck,
};

const companies: NavItem = {
  href: "/companies",
  labelKey: "common.companies",
  icon: Building2,
};

const projects: NavItem = {
  href: "/projects",
  labelKey: "common.projects",
  icon: FolderKanban,
};

const quotations: NavItem = {
  href: "/quotations",
  labelKey: "common.quotations",
  shortKey: "shell.shortQuotations",
  icon: FileText,
};

const dispatches: NavItem = {
  href: "/dispatches",
  labelKey: "common.dispatches",
  icon: Truck,
};

const queue: NavItem = {
  href: "/queue",
  labelKey: "common.queue",
  shortKey: "shell.shortQueue",
  icon: Inbox,
};

const team: NavItem = {
  href: "/team",
  labelKey: "shell.team",
  icon: UsersRound,
};

const adminItems: NavItem[] = [
  { href: "/admin/users", labelKey: "common.users", icon: Users },
  { href: "/admin/targets", labelKey: "common.targets", icon: Target },
  { href: "/admin/lookups", labelKey: "common.lookups", icon: ListTree },
  { href: "/admin/holidays", labelKey: "common.holidays", icon: CalendarDays },
  { href: "/admin/archive", labelKey: "admin.archive", icon: Archive },
  { href: "/admin/export", labelKey: "common.export", icon: Download },
];

export function navFor(role: Role): NavGroup[] {
  switch (role) {
    case "coordinator":
      return [{ items: [queue, quotations, dispatches] }];
    case "manager":
      return [{ items: [team, companies, projects, quotations, dispatches] }];
    case "admin":
      return [
        { items: [team, companies, projects, quotations, dispatches] },
        { labelKey: "shell.adminSection", items: adminItems },
      ];
    default:
      return [{ items: [day, companies, projects, quotations, dispatches] }];
  }
}

/** Every item, flat — the phone menu sheet lists all of them. */
export function navItemsFor(role: Role): NavItem[] {
  return navFor(role).flatMap((group) => group.items);
}

/** The phone bottom bar: four at most, so each keeps a 44px touch target. */
export function bottomBarFor(role: Role): NavItem[] {
  return navItemsFor(role).slice(0, 4);
}

/** `/companies` is active on `/companies` and `/companies/x`, never on `/companiesx`. */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
