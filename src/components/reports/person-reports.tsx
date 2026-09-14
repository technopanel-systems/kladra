import { getLocale, getTranslations } from "next-intl/server";
import { ReportCalendar } from "@/components/reports/report-calendar";
import { ReportDays } from "@/components/reports/report-days";
import { Empty } from "@/components/ui-ext/empty";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listNonWorkingDays } from "@/lib/calendar";
import { firstOfMonth, formatMonth, lastOfMonth, type Day } from "@/lib/dates";
import { isFiltered, reportsHref, type ReportQuery } from "@/lib/report-view";
import {
  recordedFor,
  recordedOn,
  reportCounts,
  reportEntries,
  type ReportFilter,
  type ReportPerson,
} from "@/lib/reports";
import type { SessionUser } from "@/lib/types";

/** No filter at all: what a month holds before anybody narrows it. */
const UNFILTERED: ReportFilter = { companyId: null, kind: null, outcomeId: null };

/**
 * One person's reports (SPEC §3 P13, 13.8): his days, a calendar, and beside
 * each day what Kladra recorded on it.
 *
 * It is the whole screen for a rep, marketing and the coordinator — each reads
 * his own and nobody else's — and the screen a manager drills into when he
 * presses a person. The same component both times, so the manager reads exactly
 * the page the rep reads.
 *
 * With no day chosen the list is the month the calendar shows, newest first;
 * pressing a day narrows it to that day, and a day with nothing written still
 * opens, with its lane, because "what did the records say about Tuesday" is a
 * question whether or not he wrote anything.
 *
 * **A month with nothing in it says which kind of nothing** (P13-G6, S12.8;
 * DESIGN §8: empty has four kinds). "Nothing written this month yet" was said
 * of July in September, which is a sentence about a month that is over; it
 * says the month's name now. And a filter that hides every report says how many
 * it is hiding and offers the way back — "nothing matched" over a month of
 * twelve reports reads as a month of none. The hidden figure is one more count
 * of the same rows without the filter, asked only when the list came back
 * empty under one.
 */
export async function PersonReports({
  user,
  person,
  query,
  filter,
  today,
}: {
  user: SessionUser;
  person: ReportPerson;
  query: ReportQuery;
  filter: ReportFilter;
  today: Day;
}) {
  const [t, locale] = await Promise.all([getTranslations("reports"), getLocale()]);

  const month = query.day ? firstOfMonth(query.day) : (query.month ?? firstOfMonth(today));
  const monthEnd = lastOfMonth(month);
  const from = query.day ?? month;
  const to = query.day ?? (monthEnd < today ? monthEnd : today);
  const current = month === firstOfMonth(today);

  const [counts, list, nonWorking] = await Promise.all([
    reportCounts(user, { personId: person.id, from: month, to: monthEnd, filter }),
    reportEntries(user, { personId: person.id, from, to, filter }),
    listNonWorkingDays(month, monthEnd),
  ]);

  // The days drawn: the one asked for, or every day the list has something on.
  const days = query.day
    ? [query.day]
    : [...new Set(list.rows.map((row) => row.happenedOn))];
  const recorded =
    days.length > 0
      ? await recordedFor([person], days[days.length - 1], days[0], filter.companyId)
      : new Map();

  const filtered = isFiltered(query);

  // How many the filter is hiding, when it is hiding all of them.
  const hidden =
    days.length === 0 && filtered
      ? Object.values(
          (await reportCounts(user, { personId: person.id, from: month, to: monthEnd, filter: UNFILTERED }))[
            person.id
          ] ?? {},
        ).reduce((sum, n) => sum + n, 0)
      : 0;

  const clear = (
    <Button asChild variant="outline" size="sm">
      <Link href={reportsHref(query, { company: null, kind: null, outcome: null })}>
        {t("clearFilters")}
      </Link>
    </Button>
  );

  const nothingInMonth = current
    ? t("nothingThisMonth")
    : t("nothingInMonth", { month: formatMonth(month, locale) });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-20">
        <ReportCalendar
          month={month}
          counts={counts[person.id] ?? {}}
          nonWorking={nonWorking}
          personId={person.id}
          selected={query.day}
          today={today}
          query={query}
          filtered={filtered}
        />
      </div>

      <div className="min-w-0">
        {days.length === 0 ? (
          hidden > 0 ? (
            // Filtered out: how many, and the way back to them.
            <Empty action={clear}>
              {t("hiddenInMonth", { count: hidden, month: formatMonth(month, locale) })}
            </Empty>
          ) : (
            // Nothing written at all — clearing a filter would find nothing more.
            <Empty>{nothingInMonth}</Empty>
          )
        ) : (
          <ReportDays
            personId={person.id}
            days={days}
            entries={list.rows}
            total={list.total}
            // The day's own figure, the calendar's, from SQL — not the rows the
            // capped list drew (D80, P13 review).
            counts={counts[person.id] ?? {}}
            dayHref={(day) => (query.day === day ? null : reportsHref(query, { day }))}
            recorded={(day) => recordedOn(recorded, person, day)}
            correct={person.id === user.id && !user.viewedBy}
            empty={
              <Empty size="panel" action={filtered ? clear : undefined}>
                {filtered ? t("nothingMatchedDay") : t("nothingWrittenDay")}
              </Empty>
            }
          />
        )}
      </div>
    </div>
  );
}
