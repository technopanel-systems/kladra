"use client";

import { Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { addNonWorkingAction, removeNonWorkingAction } from "@/actions/admin";
import { useSubmitAction } from "@/components/ui-ext/action-outcome";
import { ConfirmDialog } from "@/components/ui-ext/confirm-dialog";
import { DatePicker } from "@/components/ui-ext/date-picker";
import { DayText } from "@/components/ui-ext/day-text";
import { useFocusFirstError } from "@/components/ui-ext/focus-first-error";
import { FormBody, FormFooter } from "@/components/ui-ext/form-shell";
import { ResponsiveDialog } from "@/components/ui-ext/responsive-dialog";
import { SearchableSelect } from "@/components/ui-ext/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { formatDay, todayRiyadh, type Day } from "@/lib/dates";
import type { NonWorkingRow } from "@/lib/admin";
import type { ActionResult } from "@/lib/types";

/**
 * Holidays and leave (SPEC S48).
 *
 * One list, because both do the same thing: they come out of the working-day
 * count, so pace and reminders skip them. A holiday has nobody's name on it and
 * applies to everyone; leave has one person's. That is the only difference, and
 * it is the "Whose day" box.
 *
 * A day here is removed rather than archived — the one place in the app where
 * that is right. A holiday entered on the wrong date is not history, it is a
 * typo, and leaving it would quietly shorten somebody's month for ever.
 */
export function HolidaysPanel({
  rows,
  people,
}: {
  rows: NonWorkingRow[];
  people: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-muted-foreground">{t("admin.dayHint")}</p>

      <div className="flex">
        <AddDayDialog people={people} />
      </div>

      {rows.length === 0 ? (
        <p className="card-face px-6 py-10 text-center text-sm text-muted-foreground">
          {t("shell.emptyHolidays")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            /*
             * Two lines on a phone, one from `sm` up. Four things on one line
             * squeezed the name-and-note column to 34px at 375: every word
             * landed on its own line and Remove, centred in the row, sat in the
             * middle of them — it read as part of the sentence.
             */
            <li key={row.id} className="card-face flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
              <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <span className="flex flex-wrap items-center gap-2">
                  <DayText day={row.day} locale={locale} className="text-sm font-medium" />
                  <Badge variant="secondary">
                    {row.kind === "leave" ? t("admin.kind.leave") : t("admin.kind.holiday")}
                  </Badge>
                </span>
                <span className="min-w-0 text-sm text-muted-foreground">
                  {row.userName ?? t("admin.everyone")}
                  {row.note ? ` · ${row.note}` : ""}
                </span>
              </span>
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm">
                    {t("admin.removeDay")}
                  </Button>
                }
                title={t("admin.removeDayTitle", { date: formatDay(row.day, locale) })}
                description={t("admin.removeDayHint")}
                confirmLabel={t("admin.removeDay")}
                successMessage={t("admin.dayRemoved")}
                onConfirm={() => send(removeNonWorkingAction, { id: String(row.id) })}
                onDone={refresh}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function send(
  action: (
    prev: ActionResult<undefined> | null,
    form: FormData,
  ) => Promise<ActionResult<undefined>>,
  values: Record<string, string>,
): Promise<ActionResult<unknown>> {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return action(null, form);
}

function AddDayDialog({ people }: { people: { id: string; name: string }[] }) {
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
      <AddDayForm people={people} onClose={() => setOpen(false)} />
    </ResponsiveDialog>
  );
}

/** Everyone, or one person. "Everyone" is a holiday; a name is leave. */
const EVERYONE = "";

function AddDayForm({
  people,
  onClose,
}: {
  people: { id: string; name: string }[];
  onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [day, setDay] = useState<Day | null>(todayRiyadh());
  const [who, setWho] = useState<string>(EVERYONE);
  const [note, setNote] = useState("");

  const { submit, pending, error, fieldErrors, answer } = useSubmitAction(
    addNonWorkingAction,
    () => {
      toast.success(t("admin.dayAdded"));
      onClose();
      router.refresh();
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
      {who ? <input type="hidden" name="userId" value={who} /> : null}

      <FormBody>
        <div className="flex flex-col gap-1.5">
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

        <div className="flex flex-col gap-1.5">
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

        <div className="flex flex-col gap-1.5">
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
