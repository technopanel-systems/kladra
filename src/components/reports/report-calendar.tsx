import { ChevronLeft, ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { addMonths, firstOfMonth, formatDay, formatMonth, parseDay, type Day } from "@/lib/dates";
import { monthGrid, offReason, reportsHref, type ReportQuery } from "@/lib/report-view";
import { cn } from "@/lib/utils";
import type { NonWorking } from "@/lib/workdays";

/**
 * A person's month of reports (SPEC §3 P13, 13.8: "his days, a calendar").
 *
 * Each day says how many reports were written on it, under the same filter the
 * list below is under — a count counts the rows its list shows (D108) — and
 * pressing it narrows the list to that day. Pressing the chosen day again lets
 * go of it. A Friday, a Saturday, a company holiday and the person's own leave
 * are muted, never hidden: a report written on one still counts and still opens
 * (D57, D97, D113). A day that has not happened yet is not a door.
 *
 * A grid of links rather than the kit's date picker: this is a place a manager
 * can send as an address, not a question with one answer.
 *
 * **The figure under a day says what it is** (P13-G6, S12.8). Each cell was a
 * date over a bare number, named only for a screen reader, so a sighted reader
 * had to guess whether "9" under the 9th counted reports, calls or something
 * the system did. A line under the grid says it in words — and says "that
 * match the filters" when a filter is on, because then the figure is not the
 * day's whole count and the grid must not look as though it were.
 */
export async function ReportCalendar({
  month,
  counts,
  nonWorking,
  personId,
  selected,
  today,
  query,
  filtered,
}: {
  /** The month shown, as its first day. */
  month: Day;
  counts: Readonly<Record<Day, number>>;
  nonWorking: readonly NonWorking[];
  personId: string;
  selected: Day | null;
  today: Day;
  query: ReportQuery;
  /** A filter is on, so each figure counts only the reports that match it. */
  filtered: boolean;
}) {
  const [t, locale] = await Promise.all([getTranslations("reports"), getLocale()]);
  const weekdays = new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en-GB", {
    weekday: "narrow",
    timeZone: "UTC",
  });
  const rows = monthGrid(month);
  const previous = addMonths(month, -1);
  const next = addMonths(month, 1);
  const hasNext = next <= firstOfMonth(today);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <section
      aria-labelledby="report-calendar-title"
      data-slot="report-calendar"
      className="card-face flex flex-col gap-3 p-3 md:p-4"
    >
      <div className="flex items-center gap-2">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t("previousMonth")}
        >
          <Link href={reportsHref(query, { month: previous })} scroll={false}>
            <ChevronLeft aria-hidden="true" className="rtl:rotate-180" />
          </Link>
        </Button>
        <h2 id="report-calendar-title" className="flex-1 text-center text-sm font-medium">
          {formatMonth(month, locale)}
          <span className="sr-only">
            {" · "}
            {t("reportsCount", { count: total })}
          </span>
        </h2>
        {hasNext ? (
          <Button asChild variant="ghost" size="icon" className="size-8" aria-label={t("nextMonth")}>
            <Link href={reportsHref(query, { month: next })} scroll={false}>
              <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
            </Link>
          </Button>
        ) : (
          // This month is the last one with anything to show. Its place is kept so
          // the month stays centred; a greyed arrow would be a control that
          // cannot be used (DESIGN §5).
          <span aria-hidden="true" className="size-8 shrink-0" />
        )}
      </div>

      <table className="w-full table-fixed border-separate border-spacing-1 text-center">
        <thead>
          <tr>
            {rows[0].map((_, index) => (
              <th key={index} scope="col" className="text-xs font-normal text-faint">
                {/* 4 Jan 1970 was a Sunday; the week here starts on one. */}
                {weekdays.format(new Date(Date.UTC(1970, 0, 4 + index)))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((day, c) => {
                if (!day) return <td key={c} />;
                const n = counts[day] ?? 0;
                const off = offReason(day, nonWorking, personId) !== null;
                const future = day > today;
                const chosen = day === selected;
                const label = t("calendarDay", { count: n });
                const inner = (
                  <>
                    <span className={cn("leading-none", day === today && "font-semibold")}>
                      {parseDay(day).d}
                    </span>
                    <span
                      className={cn(
                        "num text-xs leading-none",
                        n > 0 ? "font-medium text-foreground" : "text-transparent",
                      )}
                      dir="ltr"
                      aria-hidden="true"
                    >
                      {n > 0 ? n : "0"}
                    </span>
                  </>
                );
                const cell = cn(
                  "touch flex h-11 w-full flex-col items-center justify-center gap-1 rounded-lg border border-transparent text-sm",
                  off ? "text-faint" : "text-muted-foreground",
                  n > 0 && !off && "bg-surface-2",
                  day === today && "border-line-strong",
                  chosen && "border-foreground/40 bg-secondary text-foreground",
                );
                return (
                  <td key={c} className="p-0">
                    {future ? (
                      <span className={cell} aria-disabled="true">
                        {inner}
                      </span>
                    ) : (
                      <Link
                        href={reportsHref(query, chosen ? { day: null, month } : { day })}
                        scroll={false}
                        aria-current={chosen ? "date" : undefined}
                        aria-label={`${formatDay(day, locale)} · ${label}`}
                        data-day={day}
                        className={cn(cell, "hover-tint relative")}
                      >
                        {inner}
                        <LinkPending className="absolute end-1 top-1" />
                      </Link>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p data-slot="calendar-legend" className="text-xs text-muted-foreground">
        {filtered ? t("calendarLegendFiltered") : t("calendarLegend")}
      </p>
    </section>
  );
}
