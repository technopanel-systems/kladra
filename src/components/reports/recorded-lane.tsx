import { Cpu } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Sqm } from "@/components/ui-ext/figures";
import { whatMoved, type Recorded } from "@/lib/report-figures";
import { cn } from "@/lib/utils";

/**
 * What Kladra recorded on a person's day, in its own marked lane (SPEC §3 P13:
 * "the system's own events are shown alongside, clearly marked, never mixed in").
 *
 * Beside the reports and never among them. It is drawn as an inset strip — the
 * surface a panel WITHIN something takes, never a card at rest (DESIGN §1) —
 * with its own heading and a mark that is not a person's avatar, so nobody
 * reads a quotation raised as a thing somebody wrote. It is a complementary
 * region with its own name, so a screen reader moving by landmarks hears the
 * two halves as two.
 *
 * Only what moved: a lane of six figures where five are nought is a lane nobody
 * reads. A day with nothing on it says so in one line rather than drawing
 * nothing, because an absent lane beside one day and a present one beside the
 * next reads as a screen that failed to load.
 */
export async function RecordedLane({
  recorded,
  className,
}: {
  recorded: Recorded;
  className?: string;
}) {
  const t = await getTranslations("reports");
  const figures = whatMoved(recorded);

  return (
    <aside
      aria-label={t("recorded")}
      data-slot="recorded-lane"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Cpu aria-hidden="true" className="size-3.5 shrink-0" />
        {t("recorded")}
      </p>
      {figures.length === 0 ? (
        <p className="text-xs text-faint">{t("recordedNothing")}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {figures.map((figure) => (
            <li key={figure.key} data-figure={figure.key} className="flex items-baseline gap-1.5">
              {/* The m² figure prints bare here: its label carries the unit. */}
              {figure.sqm ? (
                <Sqm value={figure.value} unit={false} />
              ) : (
                <span dir="ltr" className="num font-medium">
                  {figure.value}
                </span>
              )}
              {/* A noun counted, not a heading: "1 quotation request". */}
              <span className="text-xs text-muted-foreground">
                {t(`${figure.key}Label`, { count: Number(figure.value) })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
