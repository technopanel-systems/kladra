import { getLocale, getTranslations } from "next-intl/server";
import { DayText } from "@/components/ui-ext/day-text";
import { Prose } from "@/components/ui-ext/prose";
import type { DispatchEvent } from "@/lib/dispatches";

/**
 * What happened to this dispatch, oldest first (D143).
 *
 * The quotation drawer has said this since P9 and the dispatch drawer said
 * nothing: it carried the day it was raised and the day it was approved, and
 * everything between — the quantities edited, the refusal and its reason, the
 * SMAC number corrected — existed only in the audit log. So "why did this go
 * out four days late" had no answer on the screen that was being asked about,
 * and the one thing a refused-then-resubmitted dispatch has in common with a
 * quotation sent back twice is that the rework IS the story.
 *
 * The same list, the same rule down its side, the same three things per line —
 * what, when, who — with the words under the line that carried them. Written as
 * its own component rather than a shared one taking a namespace: two trails
 * that must not drift is a job for two tests, and a component parameterised by
 * message prefix is the kind of cleverness that hides which sentences exist.
 */
export async function DispatchHistory({ history }: { history: readonly DispatchEvent[] }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  if (history.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t("dispatches.history")}</h3>

      {/* One rule down the whole list, not one per line — the quotation trail
          learned that off the pixels (P9A). */}
      <ol className="flex flex-col gap-2 border-s-2 border-line ps-3">
        {history.map((event, index) => (
          <li
            key={`${event.what}-${event.day}-${index}`}
            data-event={event.what}
            className="flex flex-col gap-1"
          >
            <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{t(`dispatches.event.${event.what}`)}</span>
              <DayText day={event.day} locale={locale} className="text-xs text-muted-foreground" />
              {event.who ? (
                <span className="text-xs text-faint">{t("common.by", { name: event.who })}</span>
              ) : null}
            </span>
            {event.note && event.what === "correctNumber" ? (
              // The old number, not a sentence (D88). One key for both chains,
              // because it is one sentence: the loader isolates the run of
              // digits, so it reads the same way on either page.
              <span className="text-xs text-muted-foreground">
                {t("common.wasNumber", { number: event.note })}
              </span>
            ) : event.note ? (
              <Prose line text={event.note} className="text-xs text-muted-foreground" />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
