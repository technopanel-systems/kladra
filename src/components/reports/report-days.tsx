import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ActivityList } from "@/components/activities/activity-list";
import { RecordedLane } from "@/components/reports/recorded-lane";
import { DayText } from "@/components/ui-ext/day-text";
import { ListTail } from "@/components/ui-ext/list-tail";
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
 */
export async function ReportDays({
  days,
  entries,
  total,
  recorded,
  correct,
  empty,
}: {
  /** The days to draw, newest first. A day with no entries is drawn only when it was asked for. */
  days: readonly Day[];
  entries: readonly ReportEntry[];
  /** How many entries the window holds, which is not how many are drawn (D80). */
  total: number;
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
              <span className="text-xs font-normal text-muted-foreground">
                {t("reportsCount", { count: written.length })}
              </span>
            </h3>
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div
                role="region"
                aria-label={t("written")}
                data-slot="written-list"
                className="min-w-0"
              >
                <ActivityList context="day" activities={written} correct={correct} empty={empty} />
              </div>
              <RecordedLane recorded={recorded(day)} />
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
