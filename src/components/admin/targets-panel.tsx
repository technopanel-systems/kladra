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
        />
        {targets.people.map((person) => (
          <TargetBox
            key={person.userId}
            month={targets.month}
            userId={person.userId}
            label={person.name}
            value={person.sqm}
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
}: {
  month: string;
  userId?: string;
  label: string;
  value: string | null;
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
    <div className="card-face flex flex-wrap items-end gap-3 p-3">
      <Label htmlFor={id} className="min-w-40 flex-1 text-sm font-medium">
        {label}
      </Label>
      <span className="flex flex-col gap-1.5">
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
        {error ? (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        ) : null}
      </span>
      <span className="self-end text-sm text-muted-foreground">{t("common.sqm")}</span>
      <Button variant="outline" onClick={save} disabled={pending}>
        {pending ? t("common.saving") : t("common.save")}
      </Button>
    </div>
  );
}
