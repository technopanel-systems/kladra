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
import { Avatar } from "@/components/ui-ext/avatar";
import { DayText } from "@/components/ui-ext/day-text";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { PhoneLinks } from "@/components/ui-ext/phone-links";
import type { FollowUpState } from "@/lib/followups";
import type { E164 } from "@/lib/phone";
import { followUpTone, TONE_TEXT } from "@/lib/state-tone";
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
 * Every row leads with the company's avatar (DESIGN §1b, P13-G6): 24px, the
 * rounded square a company is drawn in, in the tint of its own id — the same
 * square the lead cards above the list and the drawer's head draw for the same
 * customer, so a rep who opens one sees the thing he pressed. A ring only where
 * a state exists: red around a company whose follow-up is late, and the word
 * "Overdue" under the red date on the same row, because a ring is the one part
 * of this a reader with deuteranopia cannot see.
 *
 * The next-follow-up colour is waiting time and nothing else (DESIGN §1):
 * overdue red, due today amber, anything else faint. The state is the query's
 * own (`followUpStateSql`, Riyadh's today in SQL), so the colour, the word and
 * the strip's count above the list are one reading of one date.
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
  /** Overdue, today or later, as the list's own query read it. */
  followUpState: FollowUpState | null;
};

type RowProps = {
  row: CompanyRow;
  href: string;
  /** True for the row whose drawer is open, so the list says where you are. */
  current: boolean;
};

/**
 * A name that has to fit its row, cut at its OWN end (S12.1, `Clip` in the
 * palette). A truncating box around a `<bdi>` keeps the page's direction, so an
 * Arabic company on an English row lost its first word; this box takes the
 * name's direction and is never wider than its text, so only the ellipsis moves.
 */
function Name({ text }: { text: string }) {
  return (
    <span dir="auto" className="min-w-0 truncate">
      {text}
    </span>
  );
}

/** The follow-up's word and tone, read once for the row. */
function useFollowUp(row: CompanyRow) {
  const t = useTranslations();
  const tone = followUpTone(row.followUpState);
  const word =
    row.followUpState === "overdue"
      ? t("common.overdue")
      : row.followUpState === "today"
        ? t("common.dueToday")
        : null;
  return {
    /** Red for late, nothing else: DESIGN §1b keeps a ring for a state that went wrong. */
    ring: row.followUpState === "overdue" ? ("bad" as const) : undefined,
    textClass: tone ? TONE_TEXT[tone] : "text-faint",
    word,
  };
}

function DeskRow({ row, href, current }: RowProps) {
  const t = useTranslations();
  const locale = useLocale();
  const arrived = useArrived(row.id);
  const followUp = useFollowUp(row);

  return (
    <TableRow className={cn("row-door", arrived && "row-arrived", current && "bg-surface-2")}>
      <TableCell className="max-w-[20rem] font-medium">
        <Link
          data-door
          href={href}
          aria-current={current ? "true" : undefined}
          aria-label={t("companies.openCompany", { name: row.name })}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Avatar id={row.id} name={row.name} kind="company" size="sm" ring={followUp.ring} />
            <Name text={row.name} />
            <LinkPending />
          </span>
        </Link>
      </TableCell>
      <TableCell className="max-w-[10rem] text-muted-foreground">
        <span className="block truncate">{row.city ?? "—"}</span>
      </TableCell>
      <TableCell className="max-w-[16rem]">
        {row.contactName || row.contactPhone ? (
          // items-start: a stretched column would make the name's own box as
          // wide as the cell, and an Arabic name would sit at its far side.
          <span className="flex min-w-0 flex-col items-start gap-1">
            <Name text={row.contactName ?? "—"} />
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
      <TableCell>
        <span className={cn("flex flex-col gap-1 font-medium", followUp.textClass)}>
          <DayText day={row.nextFollowUp} locale={locale} />
          {followUp.word ? <span className="text-xs">{followUp.word}</span> : null}
        </span>
      </TableCell>
    </TableRow>
  );
}

function CardRow({ row, href, current }: RowProps) {
  const t = useTranslations();
  const locale = useLocale();
  const arrived = useArrived(row.id);
  const followUp = useFollowUp(row);

  return (
    <li
      className={cn(
        "card-face row-door flex items-start gap-3 p-3",
        arrived && "row-arrived",
        current && "bg-surface-2",
      )}
    >
      <Avatar
        id={row.id}
        name={row.name}
        kind="company"
        size="sm"
        ring={followUp.ring}
        className="mt-px"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* The name gives way last: the date beside it never shrinks, and the
            name takes every pixel the date leaves (DESIGN §5). */}
        <div className="flex items-start justify-between gap-3">
          <Link
            data-door
            href={href}
            aria-current={current ? "true" : undefined}
            aria-label={t("companies.openCompany", { name: row.name })}
            className="flex min-w-0 items-center gap-2 font-medium"
          >
            <Name text={row.name} />
            <LinkPending />
          </Link>
          <span className={cn("shrink-0 text-xs font-medium", followUp.textClass)}>
            <span className="sr-only">{t("common.nextFollowUp")}</span>
            <DayText day={row.nextFollowUp} locale={locale} />
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate">{row.city ?? "—"}</span>
            <span aria-hidden="true" className="text-faint">
              ·
            </span>
            <span className="shrink-0 text-faint">
              <span className="sr-only">{t("companies.lastActivity")}</span>
              <DayText day={row.lastActivityOn} locale={locale} />
            </span>
          </span>
          {/* The word the date's colour stands for, under the date. */}
          {followUp.word ? (
            <span className={cn("shrink-0 font-medium", followUp.textClass)}>{followUp.word}</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {row.contactName || row.contactPhone ? (
            <>
              <Name text={row.contactName ?? "—"} />
              {row.contactPhone ? (
                <PhoneLinks name={row.contactName ?? row.name} phone={row.contactPhone} />
              ) : null}
            </>
          ) : (
            <span className="text-faint">{t("companies.noContact")}</span>
          )}
        </div>
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
}: {
  rows: CompanyRow[];
  q: string;
  filter: string | null;
  openId: string | null;
  /** Whose floor a manager is reading (S8): opening a row keeps him on it (P11G). */
  rep: string | null;
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
        <Table label={t("companies.listLabel")}>
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
              <DeskRow key={row.id} row={row} href={href(row.id)} current={row.id === openId} />
            ))}
          </TableBody>
        </Table>
      </div>

      <ul aria-label={t("companies.listLabel")} className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <CardRow key={row.id} row={row} href={href(row.id)} current={row.id === openId} />
        ))}
      </ul>
    </>
  );
}
