"use client";

import { CalendarDays, Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { addNonWorkingAction, removeNonWorkingAction } from "@/actions/admin";
import { HostedConfirm, sendForm, useOpener, useRowFlash } from "@/components/admin/row-kit";
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
import { useRouter } from "@/i18n/navigation";
import { addDays, formatDay, todayRiyadh, type Day } from "@/lib/dates";
import type { NonWorkingRow } from "@/lib/admin";
import { cn } from "@/lib/utils";

/**
 * Holidays and leave (SPEC S48).
 *
 * One list, because both do the same thing: they come out of the working-day
 * count, so pace and reminders skip them. A holiday has nobody's name on it and
 * applies to everyone; leave has one person's. That is the only difference, and
 * it is the "Whose day" box.
 *
 * It is also the only difference a reader needs to see from across the room, so
 * the two kinds lead with different things (P13-G6, S12.9): a leave row with its
 * PERSON — the avatar and the name, because "Saad is away" is what the admin
 * reads it for — and a holiday row with its DATE, because a holiday belongs to
 * nobody and the day is the whole of it. They differed only by a small badge
 * after the date. The word for the kind stays, beside what follows the lead.
 *
 * A day here is removed rather than archived — the one place in the app where
 * that is right. A holiday entered on the wrong date is not history, it is a
 * typo, and leaving it would quietly shorten somebody's month for ever.
 */
export function HolidaysPanel({
  title,
  rows,
  people,
}: {
  title: string;
  rows: NonWorkingRow[];
  people: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const { flash, flashOf } = useRowFlash();

  const [subject, setSubject] = useState<NonWorkingRow | null>(null);
  const [asking, setAsking] = useState(false);
  const remember = useOpener(asking);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        <AddDayDialog
          people={people}
          onAdded={(keys) => {
            flash(keys);
            refresh();
          }}
        />
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">{t("admin.dayHint")}</p>

      {rows.length === 0 ? (
        <Empty>{t("shell.emptyHolidays")}</Empty>
      ) : (
        <ul className="card-face flex flex-col">
          {rows.map((row) => {
            const marked = flashOf(dayKey(row.day, row.userId));
            return (
              <li
                key={row.id}
                data-kind={row.kind}
                onAnimationEnd={marked.onAnimationEnd}
                className={cn(
                  "flex items-center gap-3 border-b border-line px-3 py-1 last:border-0 md:px-4 md:py-2",
                  marked.className,
                )}
              >
                {/* The lead: a column of its own on a desk, so what follows it
                    starts at one edge down the whole list. */}
                <span className="flex min-w-0 flex-1 flex-col gap-1 py-2 md:flex-row md:items-center md:gap-3 md:py-0">
                  <span className="flex min-w-0 items-center gap-2 font-medium md:w-56 md:shrink-0">
                    {row.kind === "leave" && row.userId ? (
                      <>
                        <Avatar id={row.userId} name={row.userName ?? ""} size="sm" />
                        <span className="min-w-0 truncate">{row.userName}</span>
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
                          <CalendarDays className="size-4" />
                        </span>
                        <DayText day={row.day} locale={locale} />
                      </>
                    )}
                  </span>

                  {/* Under the lead's words on a phone, not under its mark. */}
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 ps-8 text-sm text-muted-foreground md:ps-0">
                    <span>
                      {row.kind === "leave" ? t("admin.kind.leave") : t("admin.kind.holiday")}
                    </span>
                    <span aria-hidden="true">·</span>
                    {row.kind === "leave" ? (
                      <DayText day={row.day} locale={locale} />
                    ) : (
                      <span>{t("admin.everyone")}</span>
                    )}
                    {row.note ? (
                      <>
                        {/* On a desk the note continues the line; on a phone it
                            is a line of its own, so no mark is left hanging at
                            the end of the one above it. */}
                        <span aria-hidden="true" className="hidden md:inline">
                          ·
                        </span>
                        {/* Typed by whoever added the day, in their direction. */}
                        <span className="min-w-0 basis-full md:basis-auto">
                          <bdi>{row.note}</bdi>
                        </span>
                      </>
                    ) : null}
                  </span>
                </span>

                <Button
                  variant="ghost"
                  size="xs"
                  className="shrink-0"
                  onClick={(event) => {
                    remember(event.currentTarget);
                    setSubject(row);
                    setAsking(true);
                  }}
                >
                  {t("admin.removeDay")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {subject ? (
        <HostedConfirm
          open={asking}
          onOpenChange={setAsking}
          destructive
          title={t("admin.removeDayTitle", { date: formatDay(subject.day, locale) })}
          description={t("admin.removeDayHint")}
          confirmLabel={t("admin.removeDay")}
          successMessage={t("admin.dayRemoved", { date: formatDay(subject.day, locale) })}
          onConfirm={() => sendForm(removeNonWorkingAction, { id: String(subject.id) })}
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

function AddDayDialog({
  people,
  onAdded,
}: {
  people: { id: string; name: string }[];
  /** The days the form wrote, so their rows can take the arrived flash. */
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
