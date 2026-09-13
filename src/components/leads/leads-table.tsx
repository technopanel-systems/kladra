"use client";

import { useLocale, useTranslations } from "next-intl";
import { ReassignLeadDialog } from "@/components/leads/reassign-lead-dialog";
import { Avatar } from "@/components/ui-ext/avatar";
import { DayText } from "@/components/ui-ext/day-text";
import { LinkPending } from "@/components/ui-ext/link-pending";
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
import { Link } from "@/i18n/navigation";
import type { Day } from "@/lib/dates";
import type { LeadStage } from "@/lib/leads";
import type { PickerOption } from "@/lib/picker-option";
import { TONE_TEXT, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * What has been brought in, and what became of it (SPEC §3, P12-7, P13).
 *
 * One row per lead, the ones nobody has picked up first and the oldest of those
 * at the top: a customer who rang on Sunday and has heard nothing by Wednesday
 * is the first thing here, red, with how many working days it has sat.
 *
 * The last column is the founder's question for marketing — "what became of
 * each lead it passed: acknowledged, contacted, quoted, won" — as the furthest
 * of those the company's own records show (`LEAD_STAGE` in src/lib/leads.ts),
 * one word in the tone of the state (DESIGN §6) and never the tone alone.
 *
 * For the manager each row also carries Reassign, which is his (P13, `mayHandOver`),
 * and the customer's name is a door to the drawer he may open (S8). Marketing's
 * rows open nothing: a lead is on somebody else's floor the moment it is filed,
 * and a list of doors that refuse the person looking is worse than plain rows.
 *
 * Two layouts, one data shape, like every list here: a table from `md` up and a
 * card per row below it, because the person who files a lead is often doing it
 * from a phone with the customer still on the line.
 */

export type LeadRow = {
  id: string;
  name: string;
  query: string;
  /** Who found it. Shown to management, whose screen covers everybody's. */
  fromId: string;
  fromName: string;
  /** Whose floor it is on now. */
  repId: string;
  repName: string;
  givenOn: Day;
  acknowledgedOn: Day | null;
  stage: LeadStage;
  /** Working days it has been sitting, and whether that is too long. */
  waited: { days: number; late: boolean } | null;
  city: string;
};

/** The tone a stage wears: amber while it waits, red once it is late, green once won. */
function toneOf(row: LeadRow): StateTone {
  switch (row.stage) {
    case "waiting":
      return row.waited?.late ? "bad" : "wait";
    case "won":
      return "good";
    default:
      return "open";
  }
}

/** Where it got to — one word, and the day or the wait under it. */
function Stage({ row }: { row: LeadRow }) {
  const t = useTranslations();
  const locale = useLocale();
  const tone = toneOf(row);

  // Written out rather than computed, so every word is a key the message check
  // can see (rules/words.md).
  const word: Record<LeadStage, string> = {
    waiting: t("leads.notAcknowledged"),
    acknowledged: t("leads.acknowledged"),
    contacted: t("leads.contacted"),
    quoted: t("leads.quoted"),
    won: t("leads.won"),
  };

  return (
    <span data-slot="lead-stage" data-stage={row.stage} className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StateBadge tone={tone}>{word[row.stage]}</StateBadge>
      {row.stage === "waiting" ? (
        <span className={cn("text-xs", row.waited?.late ? TONE_TEXT.bad : "text-muted-foreground")}>
          {t("team.waitingDays", { count: row.waited?.days ?? 0 })}
        </span>
      ) : row.stage === "acknowledged" && row.acknowledgedOn ? (
        <span className="text-xs text-muted-foreground">
          <DayText day={row.acknowledgedOn} locale={locale} />
        </span>
      ) : null}
    </span>
  );
}

/** The customer's name: a door for a reader who may open the drawer, words otherwise. */
function CompanyName({ row, opens, wrap = false }: { row: LeadRow; opens: boolean; wrap?: boolean }) {
  const t = useTranslations();
  // A card on a phone has a line to itself for the name, so it wraps rather than
  // cutting a long Arabic firm name down to its last two words.
  const fit = wrap ? "min-w-0 break-words" : "min-w-0 truncate";
  if (!opens) {
    return (
      <span className={cn(fit, "font-medium")}>
        <bdi>{row.name}</bdi>
      </span>
    );
  }
  return (
    <Link
      href={`/companies?open=${row.id}`}
      aria-label={t("companies.openCompany", { name: row.name })}
      className="flex min-w-0 items-center gap-1.5 font-medium underline-offset-2 hover:underline"
    >
      <span className={fit}>
        <bdi>{row.name}</bdi>
      </span>
      <LinkPending />
    </Link>
  );
}

export function LeadsTable({
  rows,
  showFinder,
  opens,
  people,
}: {
  rows: LeadRow[];
  showFinder: boolean;
  /** The reader may open any company's drawer (S8). */
  opens: boolean;
  /** Everybody a lead may be given to, for a reader who may reassign; null otherwise. */
  people: PickerOption[] | null;
}) {
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
              {people ? (
                <TableHead>
                  <span className="sr-only">{t("leads.reassign")}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} data-lead={row.id} className="hover-tint">
                <TableCell className="max-w-[16rem]">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar
                      id={row.id}
                      name={row.name}
                      kind="company"
                      size="sm"
                      ring={row.stage === "waiting" ? "wait" : undefined}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <CompanyName row={row} opens={opens} />
                      {row.city ? (
                        <span className="truncate text-xs text-muted-foreground">
                          <bdi>{row.city}</bdi>
                        </span>
                      ) : null}
                    </span>
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
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar id={row.fromId} name={row.fromName} size="sm" />
                      <span className="min-w-0 truncate">
                        <bdi>{row.fromName}</bdi>
                      </span>
                    </span>
                  </TableCell>
                ) : null}
                <TableCell className="max-w-[10rem]">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar id={row.repId} name={row.repName} size="sm" />
                    <span className="min-w-0 truncate">
                      <bdi>{row.repName}</bdi>
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <DayText day={row.givenOn} locale={locale} />
                </TableCell>
                <TableCell>
                  <Stage row={row} />
                </TableCell>
                {people ? (
                  <TableCell className="text-end">
                    <ReassignLeadDialog
                      companyId={row.id}
                      companyName={row.name}
                      holderId={row.repId}
                      people={people}
                      reveal
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul aria-label={t("leads.listLabel")} className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.id} data-lead={row.id} className="card-face flex flex-col gap-2 p-3">
            <div className="flex items-start gap-2">
              <Avatar
                id={row.id}
                name={row.name}
                kind="company"
                size="md"
                ring={row.stage === "waiting" ? "wait" : undefined}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-start justify-between gap-3">
                  <CompanyName row={row} opens={opens} wrap />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <span className="sr-only">{t("leads.givenOn")}</span>
                    <DayText day={row.givenOn} locale={locale} />
                  </span>
                </div>
                {row.city ? (
                  <span className="truncate text-xs text-muted-foreground">
                    <bdi>{row.city}</bdi>
                  </span>
                ) : null}
              </div>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Stage row={row} />
              {people ? (
                <ReassignLeadDialog
                  companyId={row.id}
                  companyName={row.name}
                  holderId={row.repId}
                  people={people}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
