import {
  Activity,
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
  NotebookPen,
  PhoneIncoming,
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

/**
 * The daily report sits second for every role — right after whatever that role
 * calls home — and is therefore always on the phone's bottom bar. It is the one
 * screen somebody opens at six in the evening, on a phone, having decided to
 * spend one minute on it; a screen that costs two taps to find is a screen that
 * loses to WhatsApp (SPEC D55).
 */
const reports: NavItem = {
  href: "/reports",
  labelKey: "reports.title",
  shortKey: "shell.shortReports",
  icon: NotebookPen,
};

/**
 * Marketing's own module, and the one screen no rep has (SPEC §3, P12-7).
 *
 * A telephone with an arrow coming in, because that is what a lead is: somebody
 * rang, and this is the list of who has been rung back.
 */
const leads: NavItem = {
  href: "/leads",
  labelKey: "leads.title",
  icon: PhoneIncoming,
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
  { href: "/admin/use", labelKey: "admin.use", icon: Activity },
  { href: "/admin/archive", labelKey: "admin.archive", icon: Archive },
  { href: "/admin/export", labelKey: "common.export", icon: Download },
];

/**
 * The admin's paths, read off the rail's own list: the specs that sweep the
 * admin screens read this rather than a list typed beside it, which is how one
 * of seven went unswept for three phases (D99).
 */
export const ADMIN_PATHS: readonly string[] = adminItems.map((item) => item.href);

export function navFor(role: Role): NavGroup[] {
  switch (role) {
    case "marketing":
      // Leads first, and therefore home (SPEC §3): filing one IS handing a
      // customer to a rep, so the module the founder asked for is the screen
      // this role opens Kladra to do. Its day and its floor come after — a lead
      // filed onto its own floor is an ordinary customer from then on, with the
      // follow-ups and the log any customer has.
      //
      // No quotations and no dispatches: marketing finds customers and hands
      // them on, and a screen it can only read is a screen it stops opening.
      return [{ items: [leads, reports, day, companies, projects] }];
    case "coordinator":
      // Her desk first, and her own floor after it. She is a selling role since
      // SPEC §3 — companies, projects and quotations of her own — and the queue
      // stays home, because the work waiting on her is what she opens Kladra
      // for and her own customers are what she opens it for second. Her day
      // sits with them rather than at the front for the same reason.
      return [{ items: [queue, reports, quotations, dispatches, day, companies, projects] }];
    // Leads last for the two roles that read every screen: it is a window onto
    // somebody else's module rather than work of their own, and what the
    // manager actually needs from it — the ones nobody has picked up — is
    // already a band on his own screen. Last also keeps his phone bar the four
    // it was.
    case "manager":
      return [{ items: [team, reports, companies, projects, quotations, dispatches, leads] }];
    case "admin":
      return [
        { items: [team, reports, companies, projects, quotations, dispatches, leads] },
        { labelKey: "shell.adminSection", items: adminItems },
      ];
    default:
      return [{ items: [day, reports, companies, projects, quotations, dispatches] }];
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
