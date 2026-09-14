import { getTranslations } from "next-intl/server";
import { ReportCalendar } from "@/components/reports/report-calendar";
import { ReportDays } from "@/components/reports/report-days";
import { Empty } from "@/components/ui-ext/empty";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listNonWorkingDays } from "@/lib/calendar";
import { firstOfMonth, lastOfMonth, type Day } from "@/lib/dates";
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
  const t = await getTranslations("reports");

  const month = query.day ? firstOfMonth(query.day) : (query.month ?? firstOfMonth(today));
  const monthEnd = lastOfMonth(month);
  const from = query.day ?? month;
  const to = query.day ?? (monthEnd < today ? monthEnd : today);

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
  const clear = (
    <Button asChild variant="outline" size="sm">
      <Link href={reportsHref(query, { company: null, kind: null, outcome: null })}>
        {t("clearFilters")}
      </Link>
    </Button>
  );

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
        />
      </div>

      <div className="min-w-0">
        {days.length === 0 ? (
          <Empty action={filtered ? clear : undefined}>
            {filtered ? t("nothingMatched") : t("nothingThisMonth")}
          </Empty>
        ) : (
          <ReportDays
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
