"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useArrived, useLanded } from "@/hooks/use-arrived";
import { Link } from "@/i18n/navigation";
import { DayText } from "@/components/ui-ext/day-text";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { PhoneLinks } from "@/components/ui-ext/phone-links";
import type { E164 } from "@/lib/phone";
import { followUpClass } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * The rep's home list. One row per company, newest activity first, and a click
 * anywhere on it opens the drawer through `?open=<id>` (SPEC §3) — the whole
 * row is one link, so it is reachable by keyboard and shows a focus ring.
 *
 * Two layouts, one data shape: a real table from `md` up, and a card per row
 * below it. A table that scrolls sideways on a 375px phone is a table nobody
 * reads, and the rep works standing in a lobby.
 *
 * The next-follow-up colour is waiting time and nothing else (DESIGN §1):
 * overdue red, due today amber, anything else faint. `today` is the Riyadh day
 * computed on the server, so the colours cannot drift with the browser's clock
 * or flicker at hydration.
 */

export type CompanyRow = {
  id: string;
  name: string;
  /** The picked city, or the free text a non-Saudi company carries. */
  city: string | null;
  contactName: string | null;
  /** E.164, as stored. Displayed local, tapped to open WhatsApp. */
  contactPhone: E164 | null;
  lastActivityOn: string | null;
  nextFollowUp: string | null;
};

type RowProps = {
  row: CompanyRow;
  href: string;
  today: string;
  /** True for the row whose drawer is open, so the list says where you are. */
  current: boolean;
};

function DeskRow({ row, href, today, current }: RowProps) {
  const t = useTranslations();
  const locale = useLocale();
  const arrived = useArrived(row.id);

  return (
    <TableRow className={cn("row-door", arrived && "row-arrived", current && "bg-surface-2")}>
      <TableCell className="max-w-[20rem] font-medium">
        <Link
          data-door
          href={href}
          aria-current={current ? "true" : undefined}
          aria-label={t("companies.openCompany", { name: row.name })}
        >
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate">{row.name}</span>
            <LinkPending />
          </span>
        </Link>
      </TableCell>
      <TableCell className="max-w-[10rem] text-muted-foreground">
        <span className="block truncate">{row.city ?? "—"}</span>
      </TableCell>
      <TableCell className="max-w-[16rem]">
        {row.contactName || row.contactPhone ? (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate">{row.contactName ?? "—"}</span>
            {row.contactPhone ? (
              <PhoneLinks name={row.contactName ?? row.name} phone={row.contactPhone} />
            ) : null}
          </span>
        ) : (
          <span className="text-faint">{t("companies.noContact")}</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        <DayText day={row.lastActivityOn} locale={locale} />
      </TableCell>
      <TableCell className={cn("font-medium", followUpClass(row.nextFollowUp, today))}>
        <DayText day={row.nextFollowUp} locale={locale} />
      </TableCell>
    </TableRow>
  );
}

function CardRow({ row, href, today, current }: RowProps) {
  const t = useTranslations();
  const locale = useLocale();
  const arrived = useArrived(row.id);

  return (
    <li
      className={cn(
        "card-face row-door px-3 py-3",
        arrived && "row-arrived",
        current && "bg-surface-2",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          data-door
          href={href}
          aria-current={current ? "true" : undefined}
          aria-label={t("companies.openCompany", { name: row.name })}
          className="min-w-0 flex-1 font-medium"
        >
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate">{row.name}</span>
            <LinkPending />
          </span>
        </Link>
        <span className={cn("shrink-0 text-xs", followUpClass(row.nextFollowUp, today))}>
          <span className="sr-only">{t("common.nextFollowUp")}</span>
          <DayText day={row.nextFollowUp} locale={locale} />
        </span>
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate">{row.city ?? "—"}</span>
        <span className="shrink-0 text-faint">
          <span className="sr-only">{t("companies.lastActivity")}</span>
          <DayText day={row.lastActivityOn} locale={locale} />
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {row.contactName || row.contactPhone ? (
          <>
            <span className="truncate text-foreground">{row.contactName ?? "—"}</span>
            {row.contactPhone ? (
              <PhoneLinks name={row.contactName ?? row.name} phone={row.contactPhone} />
            ) : null}
          </>
        ) : (
          <span className="text-faint">{t("companies.noContact")}</span>
        )}
      </div>
    </li>
  );
}

export function CompaniesTable({
  rows,
  q,
  filter,
  openId,
  rep,
  today,
}: {
  rows: CompanyRow[];
  q: string;
  filter: string | null;
  openId: string | null;
  /** Whose floor a manager is reading (S8): opening a row keeps him on it (P11G). */
  rep: string | null;
  today: string;
}) {
  const t = useTranslations();
  // The rows are on screen: whatever arrived while the refresh was in flight
  // starts its two seconds now (D105).
  useLanded(rows);

  // Local on purpose: the files that build a /companies URL each own their own
  // copy rather than share one across the client/server boundary.
  function href(id: string): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filter) params.set("filter", filter);
    if (rep) params.set("rep", rep);
    params.set("open", id);
    return `/companies?${params.toString()}`;
  }

  return (
    <>
      <div className="card-face hidden md:block">
        <Table>
          <TableCaption className="sr-only">{t("companies.listLabel")}</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.company")}</TableHead>
              <TableHead>{t("common.city")}</TableHead>
              <TableHead>{t("companies.mainContact")}</TableHead>
              <TableHead>{t("companies.lastActivity")}</TableHead>
              <TableHead>{t("common.nextFollowUp")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <DeskRow
                key={row.id}
                row={row}
                href={href(row.id)}
                today={today}
                current={row.id === openId}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <ul aria-label={t("companies.listLabel")} className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <CardRow
            key={row.id}
            row={row}
            href={href(row.id)}
            today={today}
            current={row.id === openId}
          />
        ))}
      </ul>
    </>
  );
}
