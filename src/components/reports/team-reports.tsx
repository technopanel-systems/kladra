import { ChevronLeft, ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ActivityList } from "@/components/activities/activity-list";
import { RecordedLane } from "@/components/reports/recorded-lane";
import { Avatar } from "@/components/ui-ext/avatar";
import { DayText } from "@/components/ui-ext/day-text";
import { Empty } from "@/components/ui-ext/empty";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { ListTail } from "@/components/ui-ext/list-tail";
import { StickyScroll } from "@/components/ui-ext/sticky-scroll";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { weekday, type Day } from "@/lib/dates";
import type { Recorded } from "@/lib/report-figures";
import { offReason, reportsHref, type OffReason, type ReportQuery } from "@/lib/report-view";
import type { ReportEntry, ReportPerson } from "@/lib/reports";
import { cn } from "@/lib/utils";
import type { NonWorking } from "@/lib/workdays";

/**
 * The manager's Reports screen (SPEC §3 P13, 13.8): the team by day and by
 * week, who has written nothing today, and every person and every day a door
 * into that person's own reports.
 *
 * Alphabetical, never by how much anybody wrote (D56): a screen that sorts
 * people by output is a leaderboard, and fourteen people all know who is second
 * without being shown. Nothing here carries a target, a pace or a percentage.
 */

/** Which drill a person's name opens: his reports on that day, filters kept. */
function personHref(query: ReportQuery, personId: string, day: Day | null): string {
  return reportsHref(query, { person: personId, period: null, day, month: null });
}

/** The words for a day somebody owed nothing on (D57). Each key written out. */
async function offWords(): Promise<Record<OffReason, string>> {
  const t = await getTranslations("reports");
  return {
    weekend: t("stateWeekend"),
    holiday: t("stateHoliday"),
    leave: t("stateLeave"),
  };
}

/**
 * Who has written nothing today (SPEC §3, 13.8; D57).
 *
 * The people who write reports, not on leave, with nothing written today. The
 * day is not over, so the list is "nothing yet" and says so — it is a list of
 * who to look for this evening, not a mark against anybody at ten in the
 * morning. On a day nobody works it says that instead, because nobody owes one.
 * Each name is a door into that person's today.
 */
export async function NothingWritten({
  people,
  working,
  today,
  query,
}: {
  people: readonly ReportPerson[];
  /** Whether today is a working day for the company at all. */
  working: boolean;
  today: Day;
  query: ReportQuery;
}) {
  const t = await getTranslations("reports");

  return (
    <section
      aria-labelledby="nothing-written-title"
      data-slot="nothing-written"
      className="card-face flex flex-col gap-3 p-4"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="nothing-written-title" className="text-sm font-medium">
          {t("nothingYetTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {working ? t("nothingYetMeans") : t("notWorkingToday")}
        </p>
      </div>
      {working ? (
        people.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("everyoneWrote")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {people.map((person) => (
              <li key={person.id}>
                <Link
                  href={personHref(
                    { ...query, company: null, kind: null, outcome: null },
                    person.id,
                    today,
                  )}
                  data-slot="silent-person"
                  className="hover-tint touch inline-flex items-center gap-2 rounded-full border border-line py-1 ps-1 pe-3 text-sm"
                >
                  <Avatar id={person.id} name={person.name} size="sm" />
                  <span className="min-w-0 truncate">
                    <bdi>{person.name}</bdi>
                  </span>
                  <LinkPending />
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}

/**
 * The arrows over the team's day or week: the working day either side, or the
 * week either side. Next is disabled on the last one there is.
 */
export async function TeamNav({
  label,
  previous,
  next,
  todayHref,
  isToday,
}: {
  label: React.ReactNode;
  previous: string;
  next: string | null;
  todayHref: string;
  isToday: boolean;
}) {
  const t = await getTranslations("reports");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="icon" className="size-8" aria-label={t("previous")}>
        <Link href={previous} scroll={false}>
          <ChevronLeft aria-hidden="true" className="rtl:rotate-180" />
        </Link>
      </Button>
      {next ? (
        <Button asChild variant="outline" size="icon" className="size-8" aria-label={t("next")}>
          <Link href={next} scroll={false}>
            <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="icon" className="size-8" aria-label={t("next")} disabled>
          <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
        </Button>
      )}
      <p className="text-sm font-medium" data-slot="team-period">
        {label}
      </p>
      {isToday ? null : (
        <Button asChild variant="ghost" size="sm" className="ms-auto">
          <Link href={todayHref} scroll={false}>
            {t("today")}
          </Link>
        </Button>
      )}
    </div>
  );
}

/**
 * The team's day: every person who writes reports, what each wrote, and beside
 * it what Kladra recorded for them (SPEC §3 P13). A person with nothing written
 * says why in a word — the day is not over, a weekend, a holiday, leave, or
 * nothing written — never a colour and never a badge (D57).
 *
 * Under a filter the day is the people it matches: a manager who asked for the
 * calls that reached nobody is reading calls, not a roll of the floor.
 */
export async function TeamDay({
  people,
  entries,
  total,
  recorded,
  nonWorking,
  day,
  today,
  query,
  filtered,
}: {
  people: readonly ReportPerson[];
  entries: readonly ReportEntry[];
  total: number;
  recorded: (person: ReportPerson) => Recorded;
  nonWorking: readonly NonWorking[];
  day: Day;
  today: Day;
  query: ReportQuery;
  filtered: boolean;
}) {
  const [t, tc, off] = await Promise.all([
    getTranslations("reports"),
    getTranslations("common"),
    offWords(),
  ]);
  const byPerson = new Map<string, ReportEntry[]>();
  for (const entry of entries) {
    const list = byPerson.get(entry.userId) ?? [];
    list.push(entry);
    byPerson.set(entry.userId, list);
  }
  const shown = filtered ? people.filter((person) => byPerson.has(person.id)) : people;

  if (shown.length === 0) {
    return (
      <Empty
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={reportsHref(query, { company: null, kind: null, outcome: null })}>
              {t("clearFilters")}
            </Link>
          </Button>
        }
      >
        {t("nothingMatchedDay")}
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {shown.map((person) => {
        const written = byPerson.get(person.id) ?? [];
        const reason = offReason(day, nonWorking, person.id);
        const headingId = `team-person-${person.id}`;
        return (
          <section
            key={person.id}
            aria-labelledby={headingId}
            data-slot="team-person"
            className="card-face flex flex-col gap-3 p-3 md:p-4"
          >
            <Link
              href={personHref(query, person.id, day)}
              className="hover-tint -m-1.5 flex min-w-0 items-center gap-2.5 rounded-lg p-1.5"
            >
              <Avatar id={person.id} name={person.name} ring={reason === "leave" ? "over" : undefined} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span id={headingId} className="truncate text-sm font-medium">
                  <bdi>{person.name}</bdi>
                </span>
                <span className="text-xs text-muted-foreground">
                  {tc(person.role)}
                  {" · "}
                  {t("reportsCount", { count: written.length })}
                </span>
              </span>
              <LinkPending />
            </Link>
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div role="region" aria-label={t("written")} className="min-w-0">
                <ActivityList
                  context="day"
                  activities={written}
                  empty={
                    <p data-slot="person-state" className="text-sm text-muted-foreground">
                      {reason
                        ? off[reason]
                        : day >= today
                          ? t("stateOpen")
                          : t("stateSilent")}
                    </p>
                  }
                />
              </div>
              <RecordedLane recorded={recorded(person)} />
            </div>
          </section>
        );
      })}
      <ListTail
        shown={entries.length}
        total={total}
        hint={t("listTail", { shown: entries.length, total })}
      />
    </div>
  );
}

/**
 * The team's week: a person to a row, a day to a column, the number written in
 * each (SPEC §3 P13, 13.8). Every figure is a door into that person's day, and
 * every column heading a door into the team's day. A weekend, a holiday and a
 * person's leave are muted and say so, never blank (D57); a day that has not
 * happened yet is empty.
 */
export async function TeamWeek({
  people,
  week,
  counts,
  nonWorking,
  today,
  query,
}: {
  people: readonly ReportPerson[];
  week: readonly Day[];
  counts: Readonly<Record<string, Record<Day, number>>>;
  nonWorking: readonly NonWorking[];
  today: Day;
  query: ReportQuery;
}) {
  const [t, locale, off] = await Promise.all([
    getTranslations("reports"),
    getLocale(),
    offWords(),
  ]);
  const weekdays = new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
  const nameOfDay = (day: Day) => weekdays.format(new Date(Date.UTC(1970, 0, 4 + weekday(day))));

  return (
    <StickyScroll label={t("byWeek")} barClassName="top-14" className="card-face">
      <table data-slot="team-week" className="w-full min-w-[44rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">
              {t("person")}
            </th>
            {week.map((day) => (
              <th key={day} scope="col" className="px-2 py-2 text-center text-xs font-medium">
                {day <= today ? (
                  <Link
                    href={reportsHref(query, { period: "day", day, person: null, month: null })}
                    className="hover-tint inline-flex flex-col items-center rounded-md px-1.5 py-1"
                    data-day={day}
                  >
                    <span>{nameOfDay(day)}</span>
                    <DayText day={day} locale={locale} className="text-xs font-normal text-muted-foreground" />
                  </Link>
                ) : (
                  <span className="inline-flex flex-col items-center px-1.5 py-1 text-faint">
                    <span>{nameOfDay(day)}</span>
                    <DayText day={day} locale={locale} className="text-xs font-normal" />
                  </span>
                )}
              </th>
            ))}
            <th scope="col" className="px-3 py-2 text-end text-xs font-medium text-muted-foreground">
              {t("total")}
            </th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => {
            const mine = counts[person.id] ?? {};
            const total = week.reduce((sum, day) => sum + (mine[day] ?? 0), 0);
            return (
              <tr key={person.id} data-slot="team-week-row" className="hover-tint border-b border-line last:border-0">
                <th scope="row" className="px-3 py-2 text-start font-normal">
                  <Link
                    href={personHref(query, person.id, null)}
                    className="flex min-w-0 items-center gap-2"
                  >
                    <Avatar id={person.id} name={person.name} size="sm" />
                    <span className="truncate font-medium">
                      <bdi>{person.name}</bdi>
                    </span>
                  </Link>
                </th>
                {week.map((day) => {
                  const n = mine[day] ?? 0;
                  const reason = offReason(day, nonWorking, person.id);
                  if (day > today) return <td key={day} className="px-2 py-2" />;
                  return (
                    <td
                      key={day}
                      className={cn("px-2 py-2 text-center", reason && "bg-surface-2/60")}
                    >
                      {n > 0 ? (
                        <Link
                          href={personHref(query, person.id, day)}
                          aria-label={`${person.name} · ${t("reportsCount", { count: n })}`}
                          className="touch inline-flex min-w-8 items-center justify-center rounded-md px-2 py-1 font-medium underline underline-offset-2"
                        >
                          <span dir="ltr" className="num">
                            {n}
                          </span>
                        </Link>
                      ) : reason ? (
                        <span className="text-xs text-faint">{off[reason]}</span>
                      ) : (
                        <span dir="ltr" className="num text-faint">
                          0
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-end">
                  <span dir="ltr" className="num font-medium">
                    {total}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </StickyScroll>
  );
}
