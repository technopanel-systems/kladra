import { getLocale, getTranslations } from "next-intl/server";
import { PeriodSwitch } from "@/components/reports/period-switch";
import { PersonReports } from "@/components/reports/person-reports";
import { ReportFilters } from "@/components/reports/report-filters";
import { NothingWritten, TeamDay, TeamNav, TeamWeek } from "@/components/reports/team-reports";
import { Avatar } from "@/components/ui-ext/avatar";
import { DayText } from "@/components/ui-ext/day-text";
import { Empty } from "@/components/ui-ext/empty";
import { Button } from "@/components/ui/button";
import { CHANNELS, type Channel } from "@/db/schema";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/authz";
import { listNonWorkingDays } from "@/lib/calendar";
import { addDays, type Day } from "@/lib/dates";
import { seesAllRoles } from "@/lib/floor";
import {
  isFiltered,
  nothingWritten,
  parseReportQuery,
  periodFor,
  reportsHref,
  weekOf,
} from "@/lib/report-view";
import {
  listOutcomes,
  recordedFor,
  recordedOn,
  reportCounts,
  reportEntries,
  reportedCompanies,
  reportingPeople,
  reportPerson,
  wroteOn,
  type ReportFilter,
} from "@/lib/reports";
import { chosen, rememberedChoices } from "@/lib/screen-choice";
import { todayRiyadh } from "@/lib/dates";
import { isWorkingDay, stepWorkingDay } from "@/lib/workdays";

/**
 * Reports (SPEC §3 P13, 13.8; D167).
 *
 * A report is what a person wrote — one entry per thing that happened, against
 * its customer, with what kind of thing it was and what came of it — and this is
 * where they are read. The system's own events sit beside them in a marked lane
 * and are never mixed in.
 *
 * Two screens behind one address, decided by who is reading:
 *
 * - A rep, marketing and the coordinator read their own: a calendar of the
 *   month, the days newest first, filters by customer, kind and outcome.
 * - The manager and the admin read everyone: the team by day or by week, the
 *   same filters and a person, who has written nothing today, and every person
 *   and every day a door into that person's own screen — the same one the rep
 *   reads.
 *
 * Everything the screen is showing is in the address (D145), so a manager can
 * send "Faisal's Tuesday" as a link. The day-or-week choice is also remembered
 * for the person (D164).
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, raw, locale, t] = await Promise.all([
    requireUser(),
    searchParams,
    getLocale(),
    getTranslations(),
  ]);

  const today = todayRiyadh();
  const query = parseReportQuery(raw, today, CHANNELS);
  const filter: ReportFilter = {
    companyId: query.company,
    kind: query.kind as Channel | null,
    outcomeId: query.outcome,
  };
  const manager = seesAllRoles(user.role);

  const allOutcomes = await listOutcomes(locale);
  // The admin's active list, and a retired one only while it is the filter a
  // link arrived with — a chip for a word nobody can choose any more would be
  // a door onto a room that only ever empties.
  const outcomes = allOutcomes.filter((row) => row.active || row.id === query.outcome);

  /* ---- one person's reports ------------------------------------------------ */

  const personId = manager ? query.person : user.id;
  if (personId) {
    const person = await reportPerson(user, personId);
    const companies = person ? await reportedCompanies(user, person.id) : [];
    const people = manager
      ? (await reportingPeople(locale)).map((row) => ({ value: row.id, label: row.name }))
      : null;

    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold">{t("reports.title")}</h1>
          {manager && person ? (
            <div className="flex flex-wrap items-center gap-3">
              <Avatar id={person.id} name={person.name} size="lg" />
              <div className="flex min-w-0 flex-col">
                <p className="truncate text-base font-medium" data-slot="report-person">
                  <bdi>{person.name}</bdi>
                </p>
                <p className="text-xs text-muted-foreground">{t(`common.${person.role}`)}</p>
              </div>
              <Button asChild variant="ghost" size="sm" className="ms-auto">
                <Link href={reportsHref(query, { person: null, month: null })}>
                  {t("reports.everyone")}
                </Link>
              </Button>
            </div>
          ) : null}
          <ReportFilters
            query={query}
            outcomes={outcomes}
            companies={companies}
            people={people}
          />
        </header>

        {person ? (
          <PersonReports user={user} person={person} query={query} filter={filter} today={today} />
        ) : (
          <Empty>{t("reports.personGone")}</Empty>
        )}
      </div>
    );
  }

  /* ---- the team ------------------------------------------------------------ */

  const remembered = await rememberedChoices(user.id);
  const storedPeriod = chosen(remembered, "view", "reports");
  const period = periodFor(query.period, storedPeriod);

  // The day read: the one asked for, or today when today is a working day and
  // otherwise the last one there was — a manager opening this on a Saturday
  // wants Thursday, not an empty weekend.
  const around = await listNonWorkingDays(addDays(query.day ?? today, -28), today);
  const latest = isWorkingDay(today, around) ? today : stepWorkingDay(today, -1, around);
  const day: Day = query.day ?? latest;

  const [people, wrote, todayOff, companies] = await Promise.all([
    reportingPeople(locale),
    wroteOn(user, today),
    listNonWorkingDays(today, today),
    reportedCompanies(user, null),
  ]);
  const silent = nothingWritten(people, wrote, todayOff, today);
  const workingToday = isWorkingDay(today, todayOff);

  const filters = (
    <ReportFilters
      query={query}
      outcomes={outcomes}
      companies={companies}
      people={people.map((row) => ({ value: row.id, label: row.name }))}
    />
  );

  const head = (nav: React.ReactNode) => (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("reports.title")}</h1>
        <PeriodSwitch
          period={period}
          remembered={storedPeriod}
          dayHref={reportsHref(query, { period: "day" })}
          weekHref={reportsHref(query, { period: "week" })}
        />
      </div>
      {nav}
      {filters}
    </header>
  );

  const nothing = (
    <NothingWritten people={silent} working={workingToday} today={today} query={query} />
  );

  if (period === "week") {
    const week = weekOf(day);
    const [counts, weekOff] = await Promise.all([
      reportCounts(user, { personId: null, from: week[0], to: week[6], filter }),
      listNonWorkingDays(week[0], week[6]),
    ]);
    const nextWeek = addDays(week[0], 7);
    return (
      <div className="flex flex-col gap-6">
        {head(
          <TeamNav
            label={
              <>
                <DayText day={week[0]} locale={locale} />
                {" – "}
                <DayText day={week[6]} locale={locale} />
              </>
            }
            previous={reportsHref(query, { period: "week", day: addDays(week[0], -7) })}
            next={nextWeek <= today ? reportsHref(query, { period: "week", day: nextWeek }) : null}
            todayHref={reportsHref(query, { period: "week", day: null })}
            isToday={week.includes(today)}
          />,
        )}
        {nothing}
        <TeamWeek
          people={people}
          week={week}
          counts={counts}
          nonWorking={weekOff}
          today={today}
          query={query}
        />
      </div>
    );
  }

  const aroundDay = await listNonWorkingDays(addDays(day, -21), addDays(day, 21));
  const previousDay = stepWorkingDay(day, -1, aroundDay);
  const nextDay = stepWorkingDay(day, 1, aroundDay);
  const [list, dayCounts, recorded, dayOff] = await Promise.all([
    reportEntries(user, { personId: null, from: day, to: day, filter, limit: 200 }),
    // Who wrote how much, over the whole day and under the same filter, in SQL:
    // the list above is capped, and a count read off it named somebody who wrote
    // in the morning as having written nothing (rules/data.md, D80).
    reportCounts(user, { personId: null, from: day, to: day, filter }),
    recordedFor(people, day, day, filter.companyId),
    listNonWorkingDays(day, day),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {head(
        <TeamNav
          label={
            <>
              <DayText day={day} locale={locale} />
              {day === today ? (
                <span className="ms-2 text-xs font-normal text-muted-foreground">
                  {t("reports.today")}
                </span>
              ) : null}
            </>
          }
          previous={reportsHref(query, { period: "day", day: previousDay })}
          next={nextDay <= today ? reportsHref(query, { period: "day", day: nextDay }) : null}
          todayHref={reportsHref(query, { period: "day", day: null })}
          isToday={day === latest}
        />,
      )}
      {nothing}
      <TeamDay
        people={people}
        entries={list.rows}
        total={list.total}
        counts={dayCounts}
        recorded={(person) => recordedOn(recorded, person, day)}
        nonWorking={dayOff}
        day={day}
        today={today}
        query={query}
        filtered={isFiltered(query)}
      />
    </div>
  );
}
