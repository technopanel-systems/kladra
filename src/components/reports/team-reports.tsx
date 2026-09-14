import { ChevronLeft, ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ActivityList } from "@/components/activities/activity-list";
import { RecordedLane } from "@/components/reports/recorded-lane";
import { Avatar } from "@/components/ui-ext/avatar";
import { Clip } from "@/components/ui-ext/clip";
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
                  className="hover-tint touch inline-flex items-center gap-2 rounded-lg border border-line py-1 ps-1 pe-3 text-sm"
                >
                  <Avatar id={person.id} name={person.name} size="sm" />
                  <Clip text={person.name} />
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
 * week either side. On the last one there is, Next is not drawn: its place is
 * kept, so the label does not move, and a greyed arrow would be a control that
 * cannot be used (DESIGN §5). "Today" beside the label already says why.
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
        <span aria-hidden="true" data-slot="team-next-none" className="size-8 shrink-0" />
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
 *
 * Who wrote how much is counted in SQL over the whole day (`reportCounts`), and
 * the entries drawn are only the newest of them (D80). It was counted off the
 * drawn rows, so on a busy day somebody who wrote at nine — past the cap by
 * four — read "Nothing written" under his own name, and under a filter he was
 * not on the screen at all (P13 review). A person the cap cut short says how
 * many more he wrote, and that line is the door to his whole day.
 */
export async function TeamDay({
  people,
  entries,
  total,
  counts,
  recorded,
  nonWorking,
  day,
  today,
  query,
  filtered,
  hidden,
}: {
  people: readonly ReportPerson[];
  entries: readonly ReportEntry[];
  total: number;
  /**
   * How many of the day's reports the filter hides when it hides every one —
   * the "filtered out" empty says how many and how to show them (DESIGN §8).
   */
  hidden: number;
  /** Entries per person on this day under the screen's filter, keyed person then day. */
  counts: Readonly<Record<string, Readonly<Record<Day, number>>>>;
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
  const countOf = (person: ReportPerson) =>
    Math.max(counts[person.id]?.[day] ?? 0, byPerson.get(person.id)?.length ?? 0);
  const shown = filtered ? people.filter((person) => countOf(person) > 0) : people;

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
        {hidden > 0 ? t("hiddenOnDay", { count: hidden }) : t("nothingWrittenDay")}
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {shown.map((person) => {
        const written = byPerson.get(person.id) ?? [];
        const count = countOf(person);
        const more = count - written.length;
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
              className="hover-tint -m-2 flex min-w-0 items-center gap-3 rounded-lg p-2"
            >
              <Avatar id={person.id} name={person.name} ring={reason === "leave" ? "over" : undefined} />
              <span className="flex min-w-0 flex-1 flex-col">
                <Clip id={headingId} text={person.name} className="text-sm font-medium" column />
                <span className="text-xs text-muted-foreground">
                  {tc(person.role)}
                  {" · "}
                  <span data-slot="person-count">{t("reportsCount", { count })}</span>
                </span>
              </span>
              <LinkPending />
            </Link>
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div role="region" aria-label={t("written")} className="flex min-w-0 flex-col gap-2">
                {/* Nothing written is said only of somebody who wrote nothing —
                    never of somebody whose entries the cap left undrawn. */}
                {written.length > 0 || more === 0 ? (
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
                ) : null}
                {more > 0 ? (
                  <Link
                    href={personHref(query, person.id, day)}
                    data-slot="person-more"
                    className="hover-tint inline-flex w-fit items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground underline underline-offset-2"
                  >
                    {t("moreOnDay", { count: more })}
                    <LinkPending />
                  </Link>
                ) : null}
              </div>
              <RecordedLane recorded={recorded(person)} personId={person.id} day={day} />
            </div>
          </section>
        );
      })}
      {/* There is no calendar on the team's day, so the way to the rest is a
          person, not a day. */}
      <ListTail
        shown={entries.length}
        total={total}
        hint={t("teamListTail", { shown: entries.length, total })}
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
      {/*
       * Fixed columns, each day as wide as the widest date either script prints:
       * «28/أغسطس/2026» is 106px in the caption face against 80px for the widest
       * English one, and sized by their content the seven days pushed the table
       * 59px past its card at 1366 in Arabic, cutting «المجموع» off the inline
       * end while English fitted (P13 review; DESIGN §5: a width that fits in
       * English is a coincidence). 7.25rem holds that date and its padding. The
       * person column takes what is left and its name truncates, which a name
       * may; below the minimum the whole table scrolls in its StickyScroll.
       */}
      <table
        data-slot="team-week"
        className="w-full min-w-[64rem] table-fixed border-collapse text-sm"
      >
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="ps-3 pe-2 py-2 text-start text-xs font-medium text-muted-foreground">
              {t("person")}
            </th>
            {week.map((day) => (
              <th key={day} scope="col" className="w-29 px-1 py-2 text-center text-xs font-medium">
                {day <= today ? (
                  <Link
                    href={reportsHref(query, { period: "day", day, person: null, month: null })}
                    className="hover-tint inline-flex flex-col items-center rounded-md px-1 py-1"
                    data-day={day}
                  >
                    <span>{nameOfDay(day)}</span>
                    <DayText day={day} locale={locale} className="text-xs font-normal text-muted-foreground" />
                  </Link>
                ) : (
                  <span className="inline-flex flex-col items-center px-0.5 py-1 text-faint">
                    <span>{nameOfDay(day)}</span>
                    <DayText day={day} locale={locale} className="text-xs font-normal" />
                  </span>
                )}
              </th>
            ))}
            <th scope="col" className="w-16 px-2 py-2 text-end text-xs font-medium text-muted-foreground">
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
                <th scope="row" className="ps-3 pe-2 py-2 text-start font-normal">
                  <Link
                    href={personHref(query, person.id, null)}
                    title={person.name}
                    className="flex min-w-0 items-center gap-2"
                  >
                    <Avatar id={person.id} name={person.name} size="sm" />
                    <Clip text={person.name} className="font-medium" />
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
                <td className="px-2 py-2 text-end">
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
