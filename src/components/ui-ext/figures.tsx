"use client";

import { useTranslations } from "next-intl";
import { formatMoney, formatSqm } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The two figures a quotation or a dispatch carries, and which one is louder.
 *
 * Jerom's P8 note: square metres are the number that matters, and price is the
 * quiet supporting one, because SMAC owns money. That is not only a preference
 * — a rep's target is in m² (S43), a dispatch counts m² toward it (S41), and
 * the SAR figure on a Kladra screen is a copy of something the finance system
 * is the record for. Two components rather than a rule people remember.
 *
 * Both carry `dir="ltr"`: a run of digits, a comma and a full stop has no
 * strong character in it, so its direction is the paragraph's unless it is
 * said outright (DESIGN §5).
 */

/** The headline. Square metres, in the weight of the thing being read. */
export function Sqm({
  value,
  className,
  unit = true,
}: {
  /** `null` is not zero: a project with no estimate on it has no figure. */
  value: string | number | null;
  className?: string;
  /** Off inside a column whose heading already says m². */
  unit?: boolean;
}) {
  const t = useTranslations();
  if (value === null || value === "") return <span className="text-faint">—</span>;
  return (
    <span className={cn("whitespace-nowrap font-medium", className)}>
      <span dir="ltr" className="num">
        {formatSqm(value)}
      </span>
      {unit ? (
        <span className="ms-1 text-xs font-normal text-muted-foreground">{t("common.sqm")}</span>
      ) : null}
    </span>
  );
}

/** The supporting figure. Never louder than the m² beside it. */
export function Money({
  value,
  className,
  currency = true,
}: {
  value: string | number;
  className?: string;
  currency?: boolean;
}) {
  const t = useTranslations();
  return (
    <span className={cn("whitespace-nowrap text-muted-foreground", className)}>
      <span dir="ltr" className="num">
        {formatMoney(value)}
      </span>
      {currency ? <span className="ms-1 text-xs">{t("common.sar")}</span> : null}
    </span>
  );
}
