import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { KIND_ICON } from "@/components/activities/kinds";
import { Badge } from "@/components/ui/badge";
import { DayText } from "@/components/ui-ext/day-text";
import { Link } from "@/i18n/navigation";
import { Prose } from "@/components/ui-ext/prose";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import type { ActivityChannel, ActivityRow } from "@/lib/activities";
import { ActivityActions } from "./activity-actions";

/**
 * Reports, newest first (SPEC §3 P13, S24/S27 — a company's history is what the
 * people who worked it wrote, so it reads like a story, not a table).
 *
 * Ordering belongs to the query, never to the screen: this renders the rows in
 * the order it is handed. What happened and what came of it are two quiet
 * NEUTRAL badges — words, with the kind's picture — because DESIGN §1b keeps
 * colour for the five states, and "a call" is not a state.
 *
 * Shared, not client-only: rendered from the company drawer it stays on the
 * server; a client parent (the project sheet) gets the same component through
 * the client build of next-intl's hooks.
 */

export type { ActivityChannel };

/** One report as a list draws it. The row the queries return, handed straight through (D64). */
export type ActivityEntry = Omit<ActivityRow, "mine" | "dayOpen"> & {
  mine?: boolean;
  dayOpen?: boolean;
};

/**
 * Drawn from plain entries (D82): the only client leaf per row is the pair of
 * corrections, and only on the reader's own reports.
 */
export function ActivityList({
  activities,
  empty = null,
  correct,
  context = "company",
}: {
  activities: readonly ActivityEntry[];
  /** Shown instead of the list: one sentence. */
  empty?: ReactNode;
  /**
   * Which screen this list is on, and therefore what each entry has to say for
   * itself (S24, S27). On a customer's drawer the customer is the context and
   * the DAY and the writer are what the entry adds. On one person's day it is
   * the other way round — the day and the writer are the heading the list sits
   * under, and the CUSTOMER is the thing a reader is reading for. Printing all
   * four either way is how a list stops being read.
   */
  context?: "company" | "day";
  /**
   * Whether to offer a correction on the reader's OWN entries (D70). Off where
   * a screen only reads the reports.
   */
  correct?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();

  if (activities.length === 0) return <>{empty}</>;

  return (
    <ol className="flex flex-col gap-2">
      {activities.map((entry) => {
        const Icon = KIND_ICON[entry.channel];
        const onADay = context === "day";
        const quotation =
          entry.quotationNumber !== null && entry.quotationRevision !== null
            ? quotationLabel(entry.quotationNumber, entry.quotationRevision)
            : null;
        const dispatch = entry.dispatchNumber !== null ? dispatchLabel(entry.dispatchNumber) : null;
        const named = entry.contactName || entry.projectName || quotation || dispatch;
        return (
          <li
            key={entry.id}
            data-slot="report-entry"
            className="card-face flex flex-col gap-1.5 p-3"
          >
            {/* The customer, first, on the screen where the entry is about him
                rather than filed under him — and a door to him, because a
                reader of a day is one press from wanting the whole history. Not
                a heading element: the list sits under headings of more than one
                level, and the entries are a list a screen reader walks as one. */}
            {onADay ? (
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
              <Badge variant="outline" data-slot="report-outcome">
                <span className="sr-only">{t("reports.dialog.outcome")}: </span>
                <bdi>{entry.outcomeName}</bdi>
              </Badge>
              {/* Both of these are the heading this list sits under when the
                  list is a person's day: every line would say the same date and
                  the same name. */}
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
                      companyId: entry.companyId,
                      companyName: entry.companyName,
                      text: entry.text,
                      kind: entry.channel,
                      outcomeId: entry.outcomeId,
                      contactId: entry.contactId ?? null,
                      projectId: entry.projectId ?? null,
                      quotationId: entry.quotationId ?? null,
                      dispatchId: entry.dispatchId ?? null,
                    }}
                    dayOpen={entry.dayOpen === true}
                  />
                </span>
              ) : null}
            </div>

            {/* His words, in his direction, whichever page it is on. */}
            <Prose text={entry.text} slot="report-text" className="text-sm" />

            {named ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {/* Each name is a run of its own, with a mark between them: two
                    values side by side in a gap read in the page's order only
                    when something says they are two (rules/words.md). */}
                {[
                  entry.contactName ? (
                    <span key="contact">
                      <span className="sr-only">{t("common.contact")}: </span>
                      <bdi>{entry.contactName}</bdi>
                    </span>
                  ) : null,
                  entry.projectName ? (
                    <span key="project">
                      <span className="sr-only">{t("common.project")}: </span>
                      <bdi>{entry.projectName}</bdi>
                    </span>
                  ) : null,
                  quotation ? (
                    <span key="quotation">
                      <span className="sr-only">{t("common.quotation")}: </span>
                      <span dir="ltr" className="num">
                        {quotation}
                      </span>
                    </span>
                  ) : null,
                  dispatch ? (
                    <span key="dispatch">
                      <span className="sr-only">{t("common.dispatch")}: </span>
                      <span dir="ltr" className="num">
                        {dispatch}
                      </span>
                    </span>
                  ) : null,
                ]
                  .filter(Boolean)
                  .flatMap((part, index) =>
                    index === 0
                      ? [part]
                      : [
                          <span key={`dot-${index}`} aria-hidden="true" className="text-faint">
                            ·
                          </span>,
                          part,
                        ],
                  )}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
