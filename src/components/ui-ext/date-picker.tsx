"use client";

import { CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import type { Matcher } from "react-day-picker";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDay, formatMonth, parseDay, todayRiyadh, type Day } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * The one date control (SPEC §3: dates are picked, never typed, and always read
 * 04/Aug/2026). Follow-ups, the day a visit happened, anything else with a day
 * on it.
 *
 * `value` is a Day — "YYYY-MM-DD" in Riyadh — and never a Date, because a Date
 * is an instant and an instant is a different day either side of midnight. The
 * two conversions below are the only place the app turns one into the other,
 * and they go through the calendar numbers rather than through UTC, so a
 * browser set to any timezone highlights the day the string names.
 *
 * "Today" is Riyadh's today (`src/lib/dates.ts`), not the browser's — a rep
 * abroad, or a laptop with the wrong clock, still sees the company's day ringed.
 */

/** Noon, so a daylight-saving jump at midnight cannot move the date. */
function toDate(day: Day | null | undefined): Date | undefined {
  if (!day) return undefined;
  const { y, m, d } = parseDay(day);
  return new Date(y, m - 1, d, 12);
}

function toDay(date: Date): Day {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}

export function DatePicker({
  value,
  onChange,
  id,
  min,
  max,
  placeholder,
  disabled,
  invalid,
  "aria-describedby": ariaDescribedBy,
  className,
}: {
  value: Day | null;
  onChange: (day: Day | null) => void;
  id?: string;
  /** Earliest day that may be picked, inclusive. */
  min?: Day;
  /** Latest day that may be picked, inclusive. */
  max?: Day;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  "aria-describedby"?: string;
  className?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  // The calendar's own words. The month heading reuses the app's one month
  // format so it reads "أغسطس 2026" like every other heading, and the weekday
  // strip asks Intl for the reader's language with Western digits forced —
  // Arabic defaults to Arabic-Indic and the founder wants ٠٤ nowhere.
  const formatters = useMemo(() => {
    const weekdays = new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en-GB", {
      weekday: "short",
    });
    return {
      formatCaption: (month: Date) => formatMonth(toDay(month), locale),
      formatWeekdayName: (weekday: Date) => weekdays.format(weekday),
    };
  }, [locale]);

  const today = todayRiyadh();
  const selected = toDate(value);
  const before = toDate(min);
  const after = toDate(max);
  const todayBlocked = (min !== undefined && today < min) || (max !== undefined && today > max);

  // Two matchers, never one `{ before, after }` object: react-day-picker reads
  // that pair as a single interval and disables everything BETWEEN the bounds,
  // which is the exact inverse of a range limit. An array is an OR — earlier
  // than `min` or later than `max`. Both ends stay pickable, because a day is
  // never before or after itself.
  const blocked: Matcher[] = [];
  if (before) blocked.push({ before });
  if (after) blocked.push({ after });

  function pick(day: Day | null) {
    onChange(day);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={ariaDescribedBy}
          className={cn(
            "h-9 w-full justify-start gap-2 px-2.5 font-normal",
            value === null && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="size-4 shrink-0 opacity-70" />
          {/* 04/أغسطس/2026 keeps its order only when the run is isolated; the
              placeholder is a sentence and takes the page's direction. */}
          <span dir={value ? "ltr" : undefined} className="truncate">
            {value ? formatDay(value, locale) : (placeholder ?? t("common.pickDate"))}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto gap-0 p-0">
        <Calendar
          mode="single"
          autoFocus
          selected={selected}
          onSelect={(date) => pick(date ? toDay(date) : null)}
          defaultMonth={selected ?? toDate(today)}
          today={toDate(today)}
          startMonth={before}
          endMonth={after}
          disabled={blocked}
          // Friday and Saturday are the weekend, so the week starts Sunday (SPEC S47).
          weekStartsOn={0}
          formatters={formatters}
          className="p-2.5"
        />
        <div className="flex items-center justify-between gap-2 border-t border-line p-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={todayBlocked}
            onClick={() => pick(today)}
          >
            {t("common.today")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={value === null}
            onClick={() => pick(null)}
          >
            {t("common.clear")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
