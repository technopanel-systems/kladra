import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ActivityList } from "@/components/activities/activity-list";
import { RecordedLane } from "@/components/reports/recorded-lane";
import { DayText } from "@/components/ui-ext/day-text";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { ListTail } from "@/components/ui-ext/list-tail";
import { Link } from "@/i18n/navigation";
import type { Day } from "@/lib/dates";
import type { Recorded } from "@/lib/report-figures";
import type { ReportEntry } from "@/lib/reports";

/**
 * One person's reports, newest first, a day at a time — and beside each day,
 * in its own lane, what Kladra recorded on it (SPEC §3 P13, 13.8).
 *
 * Two regions per day, side by side from `lg` and one under the other below it,
 * and never one list: what he wrote is his, what the records show is the
 * system's, and interleaving them is the one thing the founder's sentence rules
 * out. The written list comes first in the reading order on every width,
 * because it is the report.
 *
 * Each entry names its customer and not the day or the writer — those are the
 * heading this list sits under (D162: a record says what its screen does not
 * already know).
 *
 * A day's figure is the day's, counted in SQL over the whole window — the same
 * number the calendar beside it prints — and never the rows this list happened
 * to draw: the list is capped (D80), and a heading that counted what was drawn
 * read "3 reports" over a day the calendar called seven (P13 review). Where the
 * cap cut a day short, the day says how many more there are and is a door to
 * the whole of it.
 */
export async function ReportDays({
  personId,
  days,
  entries,
  total,
  counts,
  dayHref,
  recorded,
  correct,
  empty,
}: {
  /** Whose days these are: the lane's doors open his lists. */
  personId: string;
  /** The days to draw, newest first. A day with no entries is drawn only when it was asked for. */
  days: readonly Day[];
  entries: readonly ReportEntry[];
  /** How many entries the window holds, which is not how many are drawn (D80). */
  total: number;
  /** How many entries each day holds under the screen's filter (`reportCounts`). */
  counts: Readonly<Record<Day, number>>;
  /** Where the whole of a day is read, or null where this list already is that day. */
  dayHref: (day: Day) => string | null;
  /** The lane for each day. */
  recorded: (day: Day) => Recorded;
  /** Offer corrections on the reader's own entries (D70). */
  correct: boolean;
  /** What a day with nothing written says. */
  empty: ReactNode;
}) {
  const [t, locale] = await Promise.all([getTranslations("reports"), getLocale()]);
  const byDay = new Map<Day, ReportEntry[]>();
  for (const entry of entries) {
    const list = byDay.get(entry.happenedOn) ?? [];
    list.push(entry);
    byDay.set(entry.happenedOn, list);
  }

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => {
        const written = byDay.get(day) ?? [];
        const count = Math.max(counts[day] ?? 0, written.length);
        const more = count - written.length;
        const whole = more > 0 ? dayHref(day) : null;
        const headingId = `report-day-${day}`;
        return (
          <section
            key={day}
            aria-labelledby={headingId}
            data-slot="report-day"
            data-day={day}
            className="flex flex-col gap-3"
          >
            <h3 id={headingId} className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
              <DayText day={day} locale={locale} />
              <span data-slot="day-count" className="text-xs font-normal text-muted-foreground">
                {t("reportsCount", { count })}
              </span>
            </h3>
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div
                role="region"
                aria-label={t("written")}
                data-slot="written-list"
                className="flex min-w-0 flex-col gap-2"
              >
                {/* A day the cap cut off entirely says only how many there are,
                    never "nothing written" over a day that has reports. */}
                {written.length > 0 || !whole ? (
                  <ActivityList context="day" activities={written} correct={correct} empty={empty} />
                ) : null}
                {whole ? (
                  <Link
                    href={whole}
                    scroll={false}
                    data-slot="day-more"
                    className="hover-tint inline-flex w-fit items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground underline underline-offset-2"
                  >
                    {t("moreOnDay", { count: more })}
                    <LinkPending />
                  </Link>
                ) : null}
              </div>
              <RecordedLane recorded={recorded(day)} personId={personId} day={day} />
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
