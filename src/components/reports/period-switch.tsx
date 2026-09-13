"use client";

import { CalendarDays, CalendarRange } from "lucide-react";
import { useTranslations } from "next-intl";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { Button } from "@/components/ui/button";
import { useRemembered } from "@/hooks/use-remembered";
import { Link } from "@/i18n/navigation";
import { DEFAULT_PERIOD, parsePeriod, type Period } from "@/lib/report-view";
import { cn } from "@/lib/utils";

/**
 * The team by day or by week (SPEC §3 P13, 13.8), and the memory of which.
 *
 * The same pill the list-and-board switch wears, because it is the same kind of
 * control: it changes the SHAPE of what is under it, not what is in it (D145).
 * Two links rather than a toggle, because the choice is in the address; and the
 * memory is the person's, not the browser's (D164) — the manager who reads the
 * week at his desk gets the week on his phone.
 */
export function PeriodSwitch({
  period,
  remembered,
  dayHref,
  weekHref,
}: {
  period: Period;
  /** What was remembered when this page was drawn — nothing, on a first visit. */
  remembered?: string;
  dayHref: string;
  weekHref: string;
}) {
  const t = useTranslations("reports");

  useRemembered("view", "reports", period, parsePeriod(remembered) ?? DEFAULT_PERIOD);

  return (
    <div
      role="group"
      aria-label={t("period")}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 p-0.5"
    >
      {(
        [
          ["day", dayHref, t("byDay"), CalendarDays],
          ["week", weekHref, t("byWeek"), CalendarRange],
        ] as const
      ).map(([value, href, label, Icon]) => (
        <Button
          key={value}
          asChild
          size="sm"
          variant="ghost"
          className={cn(
            "h-7 gap-1.5 rounded-full px-2.5 text-xs",
            period === value && "bg-surface shadow-xs",
          )}
        >
          <Link href={href} aria-current={period === value ? "true" : undefined} scroll={false}>
            <Icon aria-hidden="true" className="size-3.5" />
            {label}
            <LinkPending />
          </Link>
        </Button>
      ))}
    </div>
  );
}
