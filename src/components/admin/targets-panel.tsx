"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setTargetAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { addMonths, formatMonth } from "@/lib/dates";
import type { TargetsForMonth } from "@/lib/admin";
import { useLocale } from "next-intl";

/**
 * The month's targets: the company's, then one box per person (SPEC S43, S44).
 *
 * Each box saves on its own. A single Save for the whole screen would mean an
 * admin who fixed one number and left the page had changed nothing, and a
 * screen of eight boxes is exactly where that happens.
 *
 * A blank box is not a zero. It means no target, which is a dash on the team
 * screen and every other figure on that row still real (S45) — a zero would say
 * "aim for nothing", which is a different sentence.
 *
 * The company figure is not the sum of the others and is never computed from
 * them (S44): the admin sets it, the reps' add up to whatever they add up to,
 * and the difference between the two is a fact the manager may want to see.
 */
export function TargetsPanel({ targets }: { targets: TargetsForMonth }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(month: string) {
    startTransition(() => {
      router.replace(`/admin/targets?month=${month}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => go(addMonths(targets.month, -1))}
        >
          {t("common.back")}
        </Button>
        <span className="text-sm font-medium">{formatMonth(targets.month, locale)}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => go(addMonths(targets.month, 1))}
        >
          {t("common.next")}
        </Button>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{t("admin.targetsHint")}</p>

      <div className="flex flex-col gap-2">
        <TargetBox
          month={targets.month}
          label={t("admin.companyTarget")}
          value={targets.company}
          previous={targets.companyPrevious}
        />
        {targets.people.map((person) => (
          <TargetBox
            key={person.userId}
            month={targets.month}
            userId={person.userId}
            label={person.name}
            value={person.sqm}
            previous={person.previous}
          />
        ))}
      </div>
    </div>
  );
}

function TargetBox({
  month,
  userId,
  label,
  value,
  previous,
}: {
  month: string;
  userId?: string;
  label: string;
  value: string | null;
  /** Last month's figure, or null when there was none (D115). */
  previous: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const id = `target-${userId ?? "company"}`;
  // Whole metres in the box: a target is a round number somebody agreed out
  // loud, and ".00" on every row is noise.
  const [typed, setTyped] = useState(value === null ? "" : String(Number(value)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const form = new FormData();
      form.set("month", month);
      if (userId) form.set("userId", userId);
      form.set("sqm", typed.trim());
      const result = await setTargetAction(null, form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.success(t("admin.targetSaved"));
      router.refresh();
    });
  }

  return (
    // A form, so Enter in the box saves it (D114): five boxes a month, and the
    // hand was leaving the keyboard for each one.
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending) save();
      }}
      noValidate
      className="card-face flex flex-wrap items-center gap-3 p-3"
    >
      <Label htmlFor={id} className="min-w-40 flex-1 text-sm font-medium">
        {label}
      </Label>
      {/* The box, its unit and its Save are one row, and what sits under the box
          belongs to the box — so a row with last month's figure and a row without
          wrap the same way at 375, and the unit never reads twice on one line. */}
      <span className="flex flex-col gap-1.5">
        <span className="flex items-center gap-3">
          <Input
            id={id}
            dir="ltr"
            className="num w-36"
            inputMode="numeric"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={pending}
            aria-invalid={error ? true : undefined}
            placeholder={t("admin.noTarget")}
          />
          <span className="text-sm text-muted-foreground">{t("common.sqm")}</span>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? t("common.saving") : t("common.save")}
          </Button>
        </span>
        {error ? (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        ) : null}
        {/* An empty box says what last month was, and one press keeps it;
            the admin still presses Save, because a target is a number
            somebody agreed out loud (D115). */}
        {value === null && previous !== null ? (
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span data-slot="target-previous">
              {t("admin.lastMonthWas", { sqm: String(Number(previous)) })}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => setTyped(String(Number(previous)))}
              className="underline underline-offset-2 hover:text-foreground"
            >
              {t("admin.keepLastMonth")}
            </button>
          </span>
        ) : null}
      </span>
    </form>
  );
}
