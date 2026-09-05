import { getLocale, getTranslations } from "next-intl/server";
import { DayText } from "@/components/ui-ext/day-text";
import { Prose } from "@/components/ui-ext/prose";
import type { QuotationEvent } from "@/lib/quotations";

/**
 * What happened to this quotation, oldest first (SPEC D72, 9A item 5).
 *
 * Sent back twice and sent back five times read the same on the board, and the
 * rework in between is the thing the coordinator and the manager both wanted to
 * see. One line per transition — what, when, and who — with the coordinator's
 * own words under the line that carried them.
 *
 * A list and not a chart: five events is the long case, and a timeline drawn
 * for five points is decoration. The count of returns is said in words above it,
 * because that is the figure somebody is actually counting on their fingers.
 */
export async function QuotationHistory({ history }: { history: readonly QuotationEvent[] }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  if (history.length === 0) return null;

  const returns = history.filter((event) => event.what === "sendBack").length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-sm font-medium">{t("quotations.history")}</h3>
        {returns > 0 ? (
          <p className="text-xs text-state-wait-fg">
            {t("quotations.sentBackTimes", { count: returns })}
          </p>
        ) : null}
      </div>

      {/*
        The rule is drawn once, down the whole list, and not once per line. Per
        line it came out as four separate ticks of unequal length — each one as
        tall as its own event, so the two carrying her words were twice the
        height of the two that did not — which reads as four unrelated notes
        rather than as one thread through a fortnight. Measured off the pixels,
        not guessed: four segments with an eight-pixel gap between them.
      */}
      <ol className="flex flex-col gap-2 border-s-2 border-line ps-3">
        {history.map((event, index) => (
          <li
            key={`${event.what}-${event.day}-${index}`}
            data-event={event.what}
            className="flex flex-col gap-1"
          >
            <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{t(`quotations.event.${event.what}`)}</span>
              <DayText day={event.day} locale={locale} className="text-xs text-muted-foreground" />
              {event.who ? (
                <span className="text-xs text-faint">{t("common.by", { name: event.who })}</span>
              ) : null}
            </span>
            {event.note ? (
              <Prose text={event.note} className="text-xs text-muted-foreground" />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
