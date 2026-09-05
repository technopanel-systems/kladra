"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveReportAction } from "@/actions/reports";
import { Button } from "@/components/ui/button";
import { Prose } from "@/components/ui-ext/prose";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { Day } from "@/lib/dates";

/**
 * The one thing on the report screen a person types (SPEC D55, D58).
 *
 * One box. Not a form of dropdowns, not "what went well / what went badly", not
 * a mood, not a rating — Jerom's brief said it outright and the research says
 * the same thing: the daily reports that survive are the ones where the tool
 * fills in what it can see and asks a human only for the part it cannot. Every
 * figure above this box was assembled from records the rep already made; what is
 * left for him is the sentence that says what any of it meant.
 *
 * It grows with what is typed (`field-sizing-content`), so three lines on a
 * phone look like three lines and not like a scrollbar.
 *
 * Saving twice on one day replaces, and that is deliberate: a rep who writes at
 * five and remembers something at six should not produce two reports of one day.
 * The unique index on (user_id, day) makes it true in the database as well.
 */
export function ReportBox({
  day,
  note,
  canWrite,
  closed,
}: {
  day: Day;
  /** What is already saved for this day, or null. */
  note: string | null;
  /** Today and the last working day, and not while viewing as somebody (D58, D42). */
  canWrite: boolean;
  /** The write window has passed. Distinct from `canWrite`, which is also false
   *  for a reader on a day that is still open — and telling that reader the day
   *  is closed would be telling them something untrue. */
  closed: boolean;
}) {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(note ?? "");

  if (!canWrite) {
    if (note) return <Prose text={note} className="text-sm" />;
    return closed ? <p className="text-sm text-muted-foreground">{t("dayClosed")}</p> : null;
  }

  const changed = text.trim() !== (note ?? "").trim();

  function save() {
    startTransition(async () => {
      const result = await saveReportAction(day, text);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(tc("saved"));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id="report-note"
        value={text}
        rows={3}
        maxLength={2000}
        disabled={pending}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("placeholder")}
        aria-label={t("yourDay")}
        className="break-words"
      />
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {/* Only after something is saved, and only while it is unchanged: it is
            the answer to "did that go through", which on a phone at six in the
            evening is the only question left. */}
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {note && !changed ? tc("saved") : ""}
        </span>
        <Button
          type="button"
          onClick={save}
          disabled={pending || !changed || text.trim() === ""}
          className="w-full sm:w-auto"
        >
          {pending ? tc("saving") : tc("save")}
        </Button>
      </div>
    </div>
  );
}
