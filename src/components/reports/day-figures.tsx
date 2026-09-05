import { getTranslations } from "next-intl/server";
import { Sqm } from "@/components/ui-ext/figures";
import { figuresOf, whatMoved } from "@/lib/report-figures";
import type { DayWork } from "@/lib/reports";
import { TONE_TEXT } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * A day's figures, in the two densities the report screen needs (SPEC D55).
 *
 * Nobody types any of this. Every number is read out of records the person made
 * in the course of the work itself — a log entry, a quotation, a dispatch — and
 * that is the whole reason the report can take under a minute: the half a
 * machine can know is already written by the time the rep opens the screen.
 *
 * `DayBoard` is the grid on a person's own card, noughts and all, because he is
 * checking it against his memory. `MovedLine` is the compressed run on the team
 * list, where a nought is noise.
 */

/** The whole day, on the card of the person whose day it is. */
export async function DayBoard({ work }: { work: DayWork }) {
  const t = await getTranslations("reports");
  const figures = figuresOf(work);

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      {figures.map((figure) => (
        <div
          key={figure.key}
          data-figure={figure.key}
          className="flex min-w-0 flex-col gap-0.5"
        >
          <dt className="text-[0.6875rem] leading-tight font-medium tracking-wide text-balance text-muted-foreground uppercase">
            {t(figure.key)}
          </dt>
          <dd
            className={cn(
              "text-lg leading-tight font-semibold",
              // A nought is still shown — it is a fact — but it is not the
              // thing the eye should land on.
              Number(figure.value) === 0 && "font-normal text-faint",
            )}
          >
            {figure.sqm ? (
              <Sqm value={figure.value} className="text-lg font-semibold" />
            ) : (
              <span dir="ltr" className="num">
                {figure.value}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What moved, on one wrapping line. Empty when nothing did. */
export async function MovedLine({ work }: { work: DayWork }) {
  const t = await getTranslations("reports");
  const figures = whatMoved(work);
  if (figures.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
      {figures.map((figure) => (
        <li key={figure.key} data-figure={figure.key} className="flex items-baseline gap-1.5">
          {figure.sqm ? (
            <Sqm value={figure.value} />
          ) : (
            <span dir="ltr" className="num font-medium">
              {figure.value}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{t(figure.key)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The calls: how many fell due and how many of those customers were logged.
 *
 * It is a sentence and not two figures, because the only thing anybody wants
 * from it is the gap. Amber while the day is still open — the afternoon is not
 * a failure — and red only once the day is over and somebody was not called.
 */
export async function CallsLine({
  work,
  open,
  className,
}: {
  work: DayWork;
  open: boolean;
  className?: string;
}) {
  const t = await getTranslations("reports");
  if (work.kind !== "floor" || work.callsDue === 0) return null;

  const missed = work.callsMade < work.callsDue;
  const tone = !missed ? "good" : open ? "wait" : "bad";

  return (
    <p className={cn("text-sm", TONE_TEXT[tone], className)}>
      {t("callsLine", { made: work.callsMade, due: work.callsDue })}
    </p>
  );
}
