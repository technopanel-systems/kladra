"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setTargetAction } from "@/actions/admin";
import { useRowFlash } from "@/components/admin/row-kit";
import { useWireGuard } from "@/components/ui-ext/action-outcome";
import { Avatar } from "@/components/ui-ext/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { TargetsThisMonth } from "@/lib/admin";
import { cn } from "@/lib/utils";

/**
 * This month's targets: the company's, then one box per person (SPEC S43, S44).
 *
 * There is no other month to go to (SPEC §3 P13). The Back and Next that sat
 * above these boxes are gone: a month that has closed is the figure people were
 * measured against, and it is read in the table under this panel, not reopened.
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
 * and the difference between the two is a fact the manager may want to see. So
 * it is a group of its own above the people's, not the first of them (P13-G6):
 * as eight cards in one column it read as one more person. The people are rows
 * of one card, each led by the person — the same round avatar the earlier
 * months' table heads its columns with (DESIGN §1b).
 */
export function TargetsPanel({ targets }: { targets: TargetsThisMonth }) {
  const t = useTranslations();
  const { flash, flashOf } = useRowFlash();

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-muted-foreground">{t("admin.targetsHint")}</p>

      <ul className="card-face flex flex-col">
        <TargetBox
          month={targets.month}
          label={t("admin.companyTarget")}
          value={targets.company}
          previous={targets.companyPrevious}
          flash={flashOf("company")}
          onSaved={() => flash(["company"])}
        />
      </ul>

      <ul className="card-face flex flex-col">
        {targets.people.map((person) => (
          <TargetBox
            key={person.userId}
            month={targets.month}
            userId={person.userId}
            label={person.name}
            value={person.sqm}
            previous={person.previous}
            flash={flashOf(person.userId)}
            onSaved={() => flash([person.userId])}
          />
        ))}
      </ul>
    </div>
  );
}

function TargetBox({
  month,
  userId,
  label,
  value,
  previous,
  flash,
  onSaved,
}: {
  month: string;
  userId?: string;
  label: string;
  value: string | null;
  /** Last month's figure, or null when there was none (D115). */
  previous: string | null;
  flash: ReturnType<ReturnType<typeof useRowFlash>["flashOf"]>;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const id = `target-${userId ?? "company"}`;
  // Whole metres in the box: a target is a round number somebody agreed out
  // loud, and ".00" on every row is noise.
  const [typed, setTyped] = useState(value === null ? "" : String(Number(value)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guarded = useWireGuard();

  function save() {
    startTransition(async () => {
      const form = new FormData();
      form.set("month", month);
      if (userId) form.set("userId", userId);
      form.set("sqm", typed.trim());
      const result = await guarded(setTargetAction)(null, form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.success(t("admin.targetSaved"));
      onSaved();
      router.refresh();
    });
  }

  return (
    <li
      onAnimationEnd={flash.onAnimationEnd}
      className={cn("border-b border-line last:border-0", flash.className)}
    >
      {/* A form, so Enter in the box saves it (D114): five boxes a month, and
          the hand was leaving the keyboard for each one. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) save();
        }}
        noValidate
        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 md:px-4 md:py-1"
      >
        {/* The avatar beside the label, not inside it: a label's text is the
            box's name, and the initials are not part of anybody's name. */}
        <span className="flex min-w-40 flex-1 items-center gap-2">
          {userId ? <Avatar id={userId} name={label} size="sm" /> : null}
          <Label htmlFor={id} className="leading-normal">
            {label}
          </Label>
        </span>
        {/* The box, its unit and its Save are one row, and what sits under the box
            belongs to the box — so a row with last month's figure and a row without
            wrap the same way at 375, and the unit never reads twice on one line. */}
        <span className="flex flex-col gap-2 md:gap-1">
          <span className="flex items-center gap-3">
            <Input
              id={id}
              dir="ltr"
              className="num w-36"
              inputMode="numeric"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              // Read-only while it saves, not disabled: the caret stays where a
              // refusal is corrected (DESIGN §8: busy is not disabled).
              readOnly={pending}
              aria-invalid={error ? true : undefined}
              placeholder={t("admin.noTarget")}
            />
            <span className="text-sm text-muted-foreground">{t("common.sqm")}</span>
            <Button type="submit" variant="outline" aria-busy={pending || undefined}>
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
            <span className="flex flex-wrap items-center gap-2 pb-1 text-xs text-muted-foreground">
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
    </li>
  );
}
