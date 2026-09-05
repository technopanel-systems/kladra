import { ChevronLeft, ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { DayText } from "@/components/ui-ext/day-text";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Day } from "@/lib/dates";

/**
 * Which day is being read, and the two working days either side of it.
 *
 * Two arrows and a date. No calendar and no range: this screen answers "how did
 * yesterday go", and a date picker on it would be a picker for a question nobody
 * asks. The arrows skip the weekend (`reportNeighbours`), so stepping back from
 * Sunday lands on Thursday and not on two empty cards.
 *
 * The chevrons turn round in Arabic — back is the other way when the page runs
 * the other way — which is why they carry `rtl:rotate-180` rather than being
 * chosen by locale in the code.
 */
export async function DayNav({
  day,
  previous,
  next,
  today,
}: {
  day: Day;
  previous: Day;
  /** Null on the last day there is. */
  next: Day | null;
  today: Day;
}) {
  const [t, locale] = await Promise.all([getTranslations("reports"), getLocale()]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="icon" className="size-11 sm:size-8" aria-label={t("previousDay")}>
        <Link href={`/reports?day=${previous}`}>
          <ChevronLeft aria-hidden="true" className="rtl:rotate-180" />
        </Link>
      </Button>

      {next ? (
        <Button asChild variant="outline" size="icon" className="size-11 sm:size-8" aria-label={t("nextDay")}>
          <Link href={`/reports?day=${next}`}>
            <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="icon" disabled className="size-11 sm:size-8" aria-label={t("nextDay")}>
          <ChevronRight aria-hidden="true" className="rtl:rotate-180" />
        </Button>
      )}

      <p className="text-sm font-medium">
        {/* Never a forced `ltr` and never the figure face: a date carries a
            month NAME, and both of those reorder or disfigure it in Arabic
            (DESIGN §5). One component decides that, for every date. */}
        <DayText day={day} locale={locale} />
        {day === today ? (
          <span className="ms-2 text-xs font-normal text-muted-foreground">{t("today")}</span>
        ) : null}
      </p>

      {day === today ? null : (
        <Button asChild variant="ghost" size="sm" className="ms-auto">
          <Link href={`/reports?day=${today}`}>{t("today")}</Link>
        </Button>
      )}
    </div>
  );
}
