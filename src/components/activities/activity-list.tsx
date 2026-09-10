"use client";

import { Ellipsis, MapPin, MessageCircle, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { DayText } from "@/components/ui-ext/day-text";
import { Link } from "@/i18n/navigation";
import { Prose } from "@/components/ui-ext/prose";
import { ActivityActions } from "./activity-actions";

/**
 * The log, newest first (SPEC S24/S27 — a company's history is the manager's
 * daily report, so it has to read like a story, not a table).
 *
 * Ordering belongs to the query, never to the screen: this renders the rows in
 * the order it is handed. The channel is a small NEUTRAL badge — DESIGN §1 says
 * status is a word, not a colour, and §4 rules out a colour-per-status map.
 *
 * Shared, not client-only: rendered from the company drawer it stays on the
 * server; a client parent (the project drawer) gets the same component through
 * the client build of next-intl's hooks.
 */

export type ActivityChannel = "visit" | "call" | "whatsapp" | "other";

export type ActivityEntry = {
  id: string;
  text: string;
  channel: ActivityChannel;
  /** A Riyadh day, "YYYY-MM-DD". */
  happenedOn: string;
  /** Who wrote it, as a name. Never a user id. */
  userName: string;
  /**
   * Which customer it is about. Every entry has one (S24). A screen where the
   * customer is the context prints neither; a screen showing one person's day
   * prints the name, and both need the id — a correction is filed against the
   * customer wherever it is made from.
   */
  companyId: string;
  companyName: string;
  contactName?: string | null;
  projectName?: string | null;
  contactId?: string | null;
  projectId?: string | null;
  /** The reader wrote this one, so it is theirs to correct or unfile (D70). */
  mine?: boolean;
  /** …and its day is still open, so the words can still change (D58). */
  dayOpen?: boolean;
};

const CHANNEL_ICON = {
  visit: MapPin,
  call: Phone,
  whatsapp: MessageCircle,
  other: Ellipsis,
} as const;

/**
 * A client list, drawn from plain entries (D82). The history is the one list
 * deliberately left whole (D80), so it is the one most exposed to the cost of
 * a server loop over client leaves: with three hundred entries the drawer
 * weighed 1.7 MB and half of that was each entry's words a second time, as
 * props to the Correct button beside it. As one client component the entries
 * travel once, as data.
 */
export function ActivityList({
  activities,
  empty = null,
  correct,
  context = "company",
}: {
  activities: readonly ActivityEntry[];
  /** Shown instead of the list: one sentence and its primary action. */
  empty?: ReactNode;
  /**
   * Which screen this list is on, and therefore what each entry has to say for
   * itself (S24, S27). On a customer's drawer the customer is the context and
   * the DAY and the writer are what the entry adds. On one person's day it is
   * the other way round — the day and the writer are the heading of the card
   * the list sits in, and the CUSTOMER is the thing a manager is reading for.
   * Printing all four either way is how a list stops being read: three of them
   * would be the same on every line.
   */
  context?: "company" | "day";
  /**
   * Whether to offer a correction on the reader's OWN entries (D70). Off where
   * a screen only reads the log: every card on the report but the reader's own,
   * and the manager's view of anybody's.
   *
   * It used to carry the customer's id, which each drawer knew and handed down.
   * The entry carries its own now, which is what let the daily report offer
   * this at all: one person's day crosses several customers, and a list-wide id
   * would have filed every correction against the first of them (P12-13).
   */
  correct?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();

  if (activities.length === 0) return <>{empty}</>;

  return (
    <ol className="flex flex-col gap-2">
      {activities.map((entry) => {
        const Icon = CHANNEL_ICON[entry.channel];
        const named = entry.contactName || entry.projectName;
        const onADay = context === "day";
        return (
          <li key={entry.id} className="card-face flex flex-col gap-1.5 p-3">
            {/* The customer, first, on the screen where the entry is about him
                rather than filed under him — and a door to him, because a
                manager reading a day is one press from wanting the whole
                history. */}
            {onADay && entry.companyName ? (
              // Not a heading element: this list is inside a card whose own
              // heading is an h2 on the reader's card and an h3 on everybody
              // else's, so a fixed level here would skip one of them. The
              // entries are a list and a screen reader walks them as one.
              <p className="min-w-0 text-sm font-medium">
                <Link
                  href={`/companies?open=${entry.companyId}`}
                  className="hover:underline"
                  data-slot="trail-company"
                >
                  <bdi>{entry.companyName}</bdi>
                </Link>
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant="secondary" className="gap-1">
                <Icon aria-hidden="true" />
                {t(`common.${entry.channel}`)}
              </Badge>
              {/* Both of these are the heading of the card this list is inside
                  when the list is a person's day: every line would say the same
                  date and the same name. */}
              {onADay ? null : (
                <>
                  <DayText
                    day={entry.happenedOn}
                    locale={locale}
                    className="text-xs text-muted-foreground"
                  />
                  <span className="text-xs text-faint">
                    {t("common.by", { name: entry.userName })}
                  </span>
                </>
              )}

              {correct && entry.mine ? (
                <span className="ms-auto">
                  <ActivityActions
                    entry={{
                      id: entry.id,
                      text: entry.text,
                      channel: entry.channel,
                      contactId: entry.contactId ?? null,
                      projectId: entry.projectId ?? null,
                    }}
                    companyId={entry.companyId}
                    dayOpen={entry.dayOpen === true}
                  />
                </span>
              ) : null}
            </div>

            {/* His words, in his direction, whichever page it is on. */}
            <Prose text={entry.text} className="text-sm" />

            {named ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {/* Each name is a run of its own: a contact and a job are both
                    typed by people and either can be in either script, and two
                    unwrapped values with a neutral mark between them settle
                    against the paragraph rather than against each other
                    (rules/words.md). */}
                {entry.contactName ? (
                  <span>
                    <span className="sr-only">{t("common.contact")}: </span>
                    <bdi>{entry.contactName}</bdi>
                  </span>
                ) : null}
                {entry.contactName && entry.projectName ? (
                  <span aria-hidden="true" className="text-faint">
                    ·
                  </span>
                ) : null}
                {entry.projectName ? (
                  <span>
                    <span className="sr-only">{t("common.project")}: </span>
                    <bdi>{entry.projectName}</bdi>
                  </span>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );

}
