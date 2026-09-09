"use client";

import { useLocale, useTranslations } from "next-intl";
import { DayText } from "@/components/ui-ext/day-text";
import { Prose } from "@/components/ui-ext/prose";
import { StateBadge } from "@/components/ui-ext/state-badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Day } from "@/lib/dates";
import { TONE_TEXT } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * What marketing has brought in, and what happened to it (SPEC §3, P12-7).
 *
 * One row per lead, the ones nobody has picked up first and the oldest of those
 * at the top: this screen exists so that a customer who rang on Sunday and has
 * heard nothing by Wednesday is the first thing on it. A list newest-first
 * would bury exactly the row it was built to show.
 *
 * Two layouts, one data shape, like every list here: a table from `md` up and a
 * card per row below it, because the person who files a lead is often doing it
 * from a phone with the customer still on the line.
 *
 * No row opens anything. A lead sits on somebody else's floor the moment it is
 * filed, and marketing may not read that customer's drawer (S8) — a list of
 * doors that refuse most of the people looking at them is worse than a list of
 * plain rows (DESIGN §5). What the reader needs is here: who has it, what they
 * asked for, and whether it has been picked up.
 */

export type LeadRow = {
  id: string;
  name: string;
  query: string;
  /** Who found it. Shown to management, whose screen covers everybody's. */
  fromName: string;
  /** Whose floor it is on now. */
  repName: string;
  givenOn: Day;
  acknowledgedOn: Day | null;
  /** Working days it has been sitting, and whether that is too long. */
  waited: { days: number; late: boolean } | null;
  city: string;
};

/** Picked up, or still waiting — the one thing this screen is asked. */
function State({ row }: { row: LeadRow }) {
  const t = useTranslations();
  const locale = useLocale();

  if (row.acknowledgedOn) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StateBadge tone="good">{t("leads.acknowledged")}</StateBadge>
        <span className="text-xs text-muted-foreground">
          <DayText day={row.acknowledgedOn} locale={locale} />
        </span>
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {/* Amber while somebody owes an answer, red once it is late — the two
          tones the rest of the app uses for exactly this (DESIGN §6). */}
      <StateBadge tone={row.waited?.late ? "bad" : "wait"}>{t("leads.notAcknowledged")}</StateBadge>
      <span className={cn("text-xs", row.waited?.late ? TONE_TEXT.bad : "text-muted-foreground")}>
        {t("team.waitingDays", { count: row.waited?.days ?? 0 })}
      </span>
    </span>
  );
}

export function LeadsTable({ rows, showFinder }: { rows: LeadRow[]; showFinder: boolean }) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <>
      <div className="card-face hidden md:block">
        <Table>
          <TableCaption className="sr-only">{t("leads.listLabel")}</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("common.company")}</TableHead>
              <TableHead>{t("leads.query")}</TableHead>
              {showFinder ? <TableHead>{t("leads.foundBy")}</TableHead> : null}
              <TableHead>{t("leads.with")}</TableHead>
              <TableHead>{t("leads.givenOn")}</TableHead>
              <TableHead>{t("leads.state")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-[16rem] font-medium">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate">
                      <bdi>{row.name}</bdi>
                    </span>
                    {row.city ? (
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        <bdi>{row.city}</bdi>
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                {/* The customer's own words, so they run their own way
                    (rules/words.md) — a line, because the cell beside it is a
                    name and the two must stay on one baseline. */}
                <TableCell className="max-w-[22rem] text-muted-foreground">
                  <Prose line text={row.query} className="line-clamp-2 text-sm" />
                </TableCell>
                {showFinder ? (
                  <TableCell className="max-w-[10rem]">
                    <span className="block truncate">
                      <bdi>{row.fromName}</bdi>
                    </span>
                  </TableCell>
                ) : null}
                <TableCell className="max-w-[10rem]">
                  <span className="block truncate">
                    <bdi>{row.repName}</bdi>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <DayText day={row.givenOn} locale={locale} />
                </TableCell>
                <TableCell>
                  <State row={row} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul aria-label={t("leads.listLabel")} className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="card-face flex flex-col gap-1.5 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 flex-1 truncate font-medium">
                <bdi>{row.name}</bdi>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                <span className="sr-only">{t("leads.givenOn")}</span>
                <DayText day={row.givenOn} locale={locale} />
              </span>
            </div>
            <Prose line text={row.query} className="text-sm text-muted-foreground" />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {/* Two names either side of a separator, each in its own run
                  (rules/words.md). */}
              <span className="text-muted-foreground">
                {t("leads.with")}
                {": "}
                <bdi className="text-foreground">{row.repName}</bdi>
              </span>
              {showFinder ? (
                <>
                  <span aria-hidden="true" className="text-faint">
                    ·
                  </span>
                  <span className="text-muted-foreground">
                    {t("leads.foundBy")}
                    {": "}
                    <bdi className="text-foreground">{row.fromName}</bdi>
                  </span>
                </>
              ) : null}
            </div>
            <State row={row} />
          </li>
        ))}
      </ul>
    </>
  );
}
