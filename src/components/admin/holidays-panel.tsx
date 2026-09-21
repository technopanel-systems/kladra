"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { addNonWorkingAction, removeNonWorkingAction } from "@/actions/admin";
import { sendForm } from "@/components/admin/send-form";
import { ExportButton } from "@/components/ui-ext/export-button";
import { useOpener } from "@/components/ui-ext/use-opener";
import { useRowFlash } from "@/components/ui-ext/use-row-flash";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { useSubmitAction } from "@/components/ui-ext/action-outcome";
import { Avatar } from "@/components/ui-ext/avatar";
import { DatePicker } from "@/components/ui-ext/date-picker";
import { DayText } from "@/components/ui-ext/day-text";
import { Empty } from "@/components/ui-ext/empty";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { avatarTint } from "@/lib/avatar";
import { addDays, formatDay, formatMonth, parseDay, todayRiyadh, type Day } from "@/lib/dates";
import { monthGrid } from "@/lib/report-view";
import { isWeekend } from "@/lib/workdays";
import type { DayMark, NonWorkingPeriod } from "@/lib/admin";
import { cn } from "@/lib/utils";

/**
 * Holidays and leave (SPEC S48, rethought in P14).
 *
 * Two people read this screen — the admin, and the sales manager since P14 —
 * and they open it with two questions: **who is off, and when are they back**,
 * and **is the office shut on that day**. Everything here answers one of those
 * and the screen is in that order.
 *
 * **A period, not thirty rows** (the founder's own words). Storage does not
 * change: one row per day in `non_working_days` is what the working-day
 * arithmetic counts, what pace skips and what the daily report marks a day off
 * from. This draws the same rows as one entry per stretch — its dates and how
 * many working days it actually takes out — and opens to the days inside it,
 * because a day in the middle of a fortnight does get cancelled and the entry
 * has to allow it. Removing the entry removes the whole stretch; removing a
 * day inside removes the day. A holiday and a weekend inside somebody's leave
 * never break the stretch and are never counted in its length: the office was
 * shut, and he was not going to work them (`nonWorkingPeriods`).
 *
 * **The month strip earns its place.** It is not a chart and it is not
 * decoration (DESIGN §1): it answers "is the office open on the 23rd" and "who
 * is away in the week I am planning" in one look, which a list sorted by start
 * date cannot — you would have to read every row and do the arithmetic. A
 * shaded day is a company holiday; a dot is one person's leave, in that
 * person's own avatar tint, which is the colour he already wears on every other
 * screen (DESIGN §1b: a per-person series takes that person's tint, so the
 * legend is one everybody has already learned). Which month is in the address,
 * so a link lands on the month the sender was reading and a refresh keeps it.
 *
 * The list under it is not the month: it is everything from the start of this
 * month forward, soonest first, so Eid in two months is on the screen without
 * anybody stepping to find it. The strip says what a month looks like; the list
 * says what is coming.
 *
 * A day here is removed rather than archived — the one place in the app where
 * that is right. A holiday entered on the wrong date is not history, it is a
 * typo, and leaving it would quietly shorten somebody's month for ever.
 */
export function HolidaysPanel({
  title,
  periods,
  month,
  back,
  next,
  marks,
  today,
  people,
}: {
  title: string;
  periods: NonWorkingPeriod[];
  /** The month the strip is showing, as its first day — from the address. */
  month: Day;
  /** The months either side, or null at the edge of what this screen shows. */
  back: Day | null;
  next: Day | null;
  marks: Record<Day, DayMark>;
  today: Day;
  people: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const { flash, flashOf } = useRowFlash();

  const [subject, setSubject] = useState<NonWorkingPeriod | null>(null);
  const [oneDay, setOneDay] = useState<{ id: number; day: Day } | null>(null);
  const [asking, setAsking] = useState(false);
  const remember = useOpener(asking);

  const ask = (opener: HTMLElement | null) => {
    remember(opener);
    setAsking(true);
  };

  /**
   * An entry takes the arrived flash when any day inside it is one the form
   * just wrote — the form knows the days it asked for, and a stretch it joined
   * may now start before them.
   */
  const markOf = (period: NonWorkingPeriod) => {
    for (const day of period.days) {
      const mark = flashOf(dayKey(day.day, period.userId));
      if (mark.className) return mark;
    }
    return flashOf(period.key);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* The month the strip is showing, as a file: one row per period with
              the working days it really costs (P14 14.10, D210). */}
          <ExportButton files={[{ name: "leave", title }]} />
          <AddDayDialog
            people={people}
            onAdded={(keys) => {
              flash(keys);
              refresh();
            }}
          />
        </div>
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">{t("admin.dayHint")}</p>

      <MonthStrip
        month={month}
        back={back}
        next={next}
        marks={marks}
        today={today}
        locale={locale}
      />

      {periods.length === 0 ? (
        <Empty>{t("shell.emptyHolidays")}</Empty>
      ) : (
        <ul className="card-face flex flex-col">
          {periods.map((period) => (
            <PeriodRow
              key={period.key}
              period={period}
              locale={locale}
              marked={markOf(period)}
              onRemovePeriod={(opener) => {
                setOneDay(null);
                setSubject(period);
                ask(opener);
              }}
              onRemoveDay={(day, opener) => {
                setSubject(period);
                setOneDay(day);
                ask(opener);
              }}
            />
          ))}
        </ul>
      )}

      {subject ? (
        <ConfirmDialog
          open={asking}
          onOpenChange={setAsking}
          destructive
          title={
            oneDay
              ? t("admin.removeDayTitle", { date: formatDay(oneDay.day, locale) })
              : t("admin.removePeriodTitle")
          }
          description={
            oneDay
              ? t("admin.removeDayHint")
              : t("admin.removePeriodHint", { count: subject.days.length })
          }
          confirmLabel={t("admin.removeDay")}
          successMessage={
            oneDay
              ? t("admin.dayRemoved", { date: formatDay(oneDay.day, locale) })
              : t("admin.periodRemoved", { count: subject.days.length })
          }
          onConfirm={() =>
            sendForm(removeNonWorkingAction, {
              ids: (oneDay ? [oneDay.id] : subject.days.map((day) => day.id)).join(","),
            })
          }
          onDone={refresh}
        />
      ) : null}
    </div>
  );
}

/** One day on one calendar: a person's, or everyone's. */
function dayKey(day: Day, userId: string | null): string {
  return `${day}|${userId ?? ""}`;
}

/** `?month=2026-09` — the one thing this screen carries in its address. */
function monthHref(month: Day): string {
  return `/admin/holidays?month=${month.slice(0, 7)}`;
}

/**
 * The month at a glance.
 *
 * A grid of the month's days, read and not pressed: each cell says its number,
 * a shaded one is a day the office is shut, and a dot under the number is one
 * person's leave in that person's own tint. Nothing here is a door — the list
 * below is already every entry, in full, with the names on it — so the cells
 * are text rather than links, and the marks they carry are written out for a
 * reader who cannot see them.
 */
function MonthStrip({
  month,
  back,
  next,
  marks,
  today,
  locale,
}: {
  month: Day;
  back: Day | null;
  next: Day | null;
  marks: Record<Day, DayMark>;
  today: Day;
  locale: string;
}) {
  const t = useTranslations();
  const rows = monthGrid(month);
  // Western digits in both languages (D6); the weekday names carry none.
  const weekdays = new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
  const marked = Object.keys(marks).length > 0;

  return (
    <section
      aria-labelledby="holidays-month"
      data-slot="holidays-month"
      className="card-face flex flex-col gap-3 p-3 md:p-4"
    >
      <div className="flex items-center gap-2">
        {/* At the edge of what this screen shows, the arrow goes and its room
            stays, so the month stays centred: a greyed arrow would be a control
            that cannot be used (DESIGN §5). */}
        {back ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t("admin.previousMonth")}
          >
            <Link href={monthHref(back)} scroll={false}>
              <ChevronLeft aria-hidden="true" className="rtl:rotate-180" />
            </Link>
          </Button>
        ) : (
          <span aria-hidden="true" className="size-8 shrink-0" />
        )}
        <h2 id="holidays-month" className="flex-1 text-center text-sm font-medium">
          {formatMonth(month, locale)}
        </h2>
        {next ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t("admin.nextMonth")}
          >
            <Link href={monthHref(next)} scroll={false}>
              <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
            </Link>
          </Button>
        ) : (
          <span aria-hidden="true" className="size-8 shrink-0" />
        )}
      </div>

      <table className="w-full table-fixed border-separate border-spacing-1 text-center">
        <caption className="sr-only">{formatMonth(month, locale)}</caption>
        <thead>
          <tr>
            {rows[0].map((_, index) => (
              <th key={index} scope="col" className="text-2xs font-normal text-faint md:text-xs">
                {/* 4 Jan 1970 was a Sunday; the Saudi week starts on one (S47). */}
                {weekdays.format(new Date(Date.UTC(1970, 0, 4 + index)))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((week, r) => (
            <tr key={r}>
              {week.map((day, c) => {
                if (!day) return <td key={c} />;
                const mark = marks[day];
                const away = mark?.away ?? [];
                const shut = mark?.shut ?? false;
                return (
                  <td key={c} className="p-0">
                    <span
                      data-day={day}
                      data-shut={shut ? "true" : undefined}
                      data-away={away.length > 0 ? String(away.length) : undefined}
                      className={cn(
                        "flex h-11 w-full flex-col items-center justify-center gap-1 rounded-lg border border-transparent text-sm",
                        isWeekend(day) ? "text-faint" : "text-muted-foreground",
                        shut && "bg-state-over text-state-over-fg",
                        day === today && "border-line-strong font-semibold text-foreground",
                      )}
                    >
                      <span className="leading-none">{parseDay(day).d}</span>
                      {/* The dots keep their room whether or not anybody is
                          away, so a week does not jog up and down its rows. */}
                      <span aria-hidden="true" className="flex h-1.5 items-center gap-0.5">
                        {away.slice(0, AWAY_DOTS).map((person) => (
                          <span
                            key={person.id}
                            className="size-1.5 rounded-full bg-(--dot)"
                            style={
                              {
                                "--dot": `var(--avatar-${avatarTint(person.id)}-fg)`,
                              } as React.CSSProperties
                            }
                          />
                        ))}
                        {away.length > AWAY_DOTS ? (
                          <span className="text-2xs leading-none">+{away.length - AWAY_DOTS}</span>
                        ) : null}
                      </span>
                      {shut || away.length > 0 ? (
                        <span className="sr-only">
                          {shut ? ` ${t("admin.kind.holiday")}` : null}
                          {away.length > 0 ? ` ${t("admin.dayAway", { count: away.length })}` : null}
                        </span>
                      ) : null}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p data-slot="month-legend" className="text-xs text-muted-foreground">
        {marked ? t("admin.monthLegend") : t("admin.monthClear", { month: formatMonth(month, locale) })}
      </p>
    </section>
  );
}

/** How many people a cell draws before it counts the rest. */
const AWAY_DOTS = 3;

/**
 * One entry: a stretch of days off, with what it costs and who it belongs to.
 *
 * Leave leads with its PERSON — "Saad is away" is what the screen is read for —
 * and a holiday with its DATES, because a holiday belongs to nobody and the
 * days are the whole of it (P13-G6, S12.9; the same rule, now that a date is a
 * range). The word for the kind stays beside what follows the lead.
 */
function PeriodRow({
  period,
  locale,
  marked,
  onRemovePeriod,
  onRemoveDay,
}: {
  period: NonWorkingPeriod;
  locale: string;
  marked: ReturnType<ReturnType<typeof useRowFlash>["flashOf"]>;
  onRemovePeriod: (opener: HTMLElement | null) => void;
  onRemoveDay: (day: { id: number; day: Day }, opener: HTMLElement | null) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const daysId = useId();
  const many = period.days.length > 1;

  return (
    <li
      data-kind={period.kind}
      data-days={period.days.length}
      onAnimationEnd={marked.onAnimationEnd}
      className={cn("flex flex-col border-b border-line last:border-0", marked.className)}
    >
      <div className="flex items-center gap-3 px-3 py-1 md:px-4 md:py-2">
        {/* The lead: a column of its own on a desk, so what follows it starts
            at one edge down the whole list. */}
        <span className="flex min-w-0 flex-1 flex-col gap-1 py-2 md:flex-row md:items-center md:gap-3 md:py-0">
          <span className="flex min-w-0 items-center gap-2 font-medium md:w-56 md:shrink-0">
            {period.kind === "leave" && period.userId ? (
              <>
                <Avatar id={period.userId} name={period.userName ?? ""} size="sm" />
                <span className="min-w-0 truncate">{period.userName}</span>
              </>
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center text-muted-foreground"
                >
                  <CalendarDays className="size-4" />
                </span>
                <Dates period={period} locale={locale} />
              </>
            )}
          </span>

          {/* Under the lead's words on a phone, not under its mark. */}
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 ps-8 text-sm text-muted-foreground md:ps-0">
            <span>{period.kind === "leave" ? t("admin.kind.leave") : t("admin.kind.holiday")}</span>
            <span aria-hidden="true">·</span>
            {period.kind === "leave" ? (
              <Dates period={period} locale={locale} />
            ) : (
              <span>{t("admin.everyone")}</span>
            )}
            {many ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{t("admin.workingDaysOff", { count: period.workingDays })}</span>
              </>
            ) : null}
            {period.note ? (
              <>
                {/* On a desk the note continues the line; on a phone it is a
                    line of its own, so no mark is left hanging at the end of
                    the one above it. */}
                <span aria-hidden="true" className="hidden md:inline">
                  ·
                </span>
                {/* Typed by whoever added the days, in their direction. */}
                <span className="min-w-0 basis-full md:basis-auto">
                  <bdi>{period.note}</bdi>
                </span>
              </>
            ) : null}
          </span>
        </span>

        <span data-slot="period-actions" className="flex shrink-0 items-center gap-1">
          {many ? (
            <Button
              variant="ghost"
              size="xs"
              aria-expanded={open}
              // Only while there is something to point at: a control that names
              // an id nothing has is a control a reader is told a lie about.
              aria-controls={open ? daysId : undefined}
              onClick={() => setOpen((was) => !was)}
            >
              <ChevronDown
                aria-hidden="true"
                className={cn("transition-transform duration-150", open && "rotate-180")}
              />
              {t("admin.daysInside", { count: period.days.length })}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="xs"
            onClick={(event) => onRemovePeriod(event.currentTarget)}
          >
            {t("admin.removeDay")}
          </Button>
        </span>
      </div>

      {many && open ? (
        <ul id={daysId} data-slot="period-days" className="flex flex-col gap-0 pb-2 ps-3 md:ps-14">
          {period.days.map((day) => (
            <li
              key={day.id}
              data-day={day.day}
              className="flex items-center gap-3 px-1 py-0.5 text-sm"
            >
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
                <DayText day={day.day} locale={locale} />
                {isWeekend(day.day) ? (
                  <span className="text-xs text-faint">{t("admin.notAWorkingDay")}</span>
                ) : null}
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0"
                aria-label={t("admin.removeDayTitle", { date: formatDay(day.day, locale) })}
                onClick={(event) => onRemoveDay(day, event.currentTarget)}
              >
                {t("admin.removeDay")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * A period's dates: one day, or the first and the last with an en dash between
 * them.
 *
 * Two dates joined by a mark are two values in one line, so each keeps its own
 * direction and the mark says "two values, in the page's order" — the rule
 * rules/words.md gives for a company and its project, and a date is no
 * different. `DayText` already settles each date's own run (D68).
 */
function Dates({ period, locale }: { period: { from: Day; until: Day }; locale: string }) {
  if (period.from === period.until) return <DayText day={period.from} locale={locale} />;
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <DayText day={period.from} locale={locale} />
      <span aria-hidden="true">–</span>
      <DayText day={period.until} locale={locale} />
    </span>
  );
}

function AddDayDialog({
  people,
  onAdded,
}: {
  people: { id: string; name: string }[];
  /** The days the form wrote, so their entry can take the arrived flash. */
  onAdded: (keys: string[]) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title={t("admin.addDay")}
      description={t("admin.dayHint")}
      trigger={
        <Button variant="brand">
          <Plus aria-hidden="true" />
          {t("admin.addDay")}
        </Button>
      }
    >
      <AddDayForm people={people} onClose={() => setOpen(false)} onAdded={onAdded} />
    </ResponsiveDialog>
  );
}

/** Everyone, or one person. "Everyone" is a holiday; a name is leave. */
const EVERYONE = "";

function AddDayForm({
  people,
  onClose,
  onAdded,
}: {
  people: { id: string; name: string }[];
  onClose: () => void;
  onAdded: (keys: string[]) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [day, setDay] = useState<Day | null>(todayRiyadh());
  // The last day of the span. Null means "the same day", which is the usual
  // answer; Eid and a fortnight's leave are the other one (D113).
  const [until, setUntil] = useState<Day | null>(null);
  const [who, setWho] = useState<string>(EVERYONE);
  const [note, setNote] = useState("");

  const { submit, pending, error, fieldErrors, answer } = useSubmitAction(
    addNonWorkingAction,
    (data) => {
      const added = data?.added ?? 1;
      toast.success(
        added === 1 && day
          ? t("admin.dayAdded", { date: formatDay(day, locale) })
          : t("admin.daysAdded", { count: added }),
      );
      onClose();
      const keys: string[] = [];
      if (day) {
        for (let d = day; d <= (until ?? day) && keys.length < 62; d = addDays(d, 1)) {
          keys.push(dayKey(d, who || null));
        }
      }
      onAdded(keys);
    },
  );

  const form = useRef<HTMLFormElement>(null);
  useFocusFirstError(form, answer);

  const options = [
    { value: EVERYONE, label: t("admin.everyone") },
    ...people.map((person) => ({ value: person.id, label: person.name })),
  ];

  return (
    <form ref={form} action={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="day" value={day ?? ""} />
      {until ? <input type="hidden" name="until" value={until} /> : null}
      {who ? <input type="hidden" name="userId" value={who} /> : null}

      <FormBody>
        <div className="flex flex-col gap-2">
          <Label htmlFor="day-picker">{t("common.date")}</Label>
          <DatePicker
            id="day-picker"
            value={day}
            onChange={setDay}
            disabled={pending}
            invalid={fieldErrors.day ? true : undefined}
            aria-describedby={fieldErrors.day ? "day-error" : undefined}
          />
          {fieldErrors.day ? (
            <p id="day-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.day}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="until-picker">{t("admin.lastDay")}</Label>
          <DatePicker
            id="until-picker"
            value={until}
            onChange={setUntil}
            min={day ?? undefined}
            disabled={pending}
            invalid={fieldErrors.until ? true : undefined}
            aria-describedby={fieldErrors.until ? "until-error" : "until-hint"}
          />
          {fieldErrors.until ? (
            <p id="until-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.until}
            </p>
          ) : (
            <p id="until-hint" className="text-xs text-muted-foreground">
              {t("admin.lastDayHint")}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label id="who-label">{t("admin.whoseDay")}</Label>
          <SearchableSelect
            aria-labelledby="who-label"
            options={options}
            value={who}
            onChange={setWho}
            disabled={pending}
            placeholder={t("admin.everyone")}
            searchPlaceholder={t("forms.searchList")}
            emptyText={t("forms.noMatch")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="day-note">{t("common.note")}</Label>
          <Input
            id="day-note"
            name="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={pending}
            aria-invalid={fieldErrors.note ? true : undefined}
            aria-describedby={fieldErrors.note ? "day-note-error" : undefined}
          />
          {fieldErrors.note ? (
            <p id="day-note-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.note}
            </p>
          ) : null}
        </div>
      </FormBody>

      <FormFooter error={error} pending={pending} onCancel={onClose} />
    </form>
  );
}
