"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { formatMoney, formatSqm, formatSqmWhole } from "@/lib/money";
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
  whole = false,
}: {
  /** `null` is not zero: a project with no estimate on it has no figure. */
  value: string | number | null;
  className?: string;
  /** Off inside a column whose heading already says m². */
  unit?: boolean;
  /**
   * Whole metres. A quotation's or a dispatch's m² is pieces × width × length
   * and its decimals are real; a pipeline is a sum of estimates somebody typed
   * as round numbers, and "1,280,171.00" on the team screen was the one m²
   * there with a fraction — of nothing (P11E, the same rule as a target box).
   */
  whole?: boolean;
}) {
  const t = useTranslations();
  if (value === null || value === "") return <span className="text-faint">—</span>;
  return (
    <span className={cn("whitespace-nowrap font-medium", className)}>
      <span dir="ltr" className="num">
        {whole ? formatSqmWhole(value) : formatSqm(value)}
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

/**
 * A reference number — one that NAMES something rather than measures it: the
 * paper's (Q-12, D-3, SMAC's own), the customer's, the telephone's. It sits
 * beside `Sqm` and `Money` because it is read in the same places and set in the
 * same face, and apart from them because two things are true of a name that are
 * not true of a quantity.
 *
 * It runs left to right whatever the page does, because a person says it in
 * that order in both languages. And it carries `translate="no"`: a browser
 * translator that helpfully rewrites the digits of Q-12 into Arabic-Indic ones
 * has renamed the paper the customer is holding, which is the one thing
 * rules/words.md says must never happen to a number here. That attribute was on
 * the phone chip and on one row of the manager's stuck list and nowhere else —
 * which is what a rule applied once, rather than written down, looks like
 * (P12-11). `one-look` keeps it here now.
 *
 * TWO elements, and the reason is the whole rule §5 #172 taught about `<bdi>`
 * one shape over: a box that carries `dir="ltr"` resolves `text-align: start`
 * against ITS OWN direction, so the moment such a box is block-level — a flex
 * item, a grid item, anything given `block` — it stops sitting where the page
 * puts things and goes to the left edge. On the rep's Arabic day card that put
 * Q-7, the quiet line meant to sit under SMAC's 4531 at the right, alone
 * against the far left of the card. So the OUTER element takes the layout and
 * the page's own direction, and only the inner run is turned around. Every
 * caller is then safe wherever it puts this, which is better than a rule each
 * caller has to remember.
 */
export function Ref({
  children,
  className,
  slot,
}: {
  children: ReactNode;
  className?: string;
  /** `data-slot`, for a test that names this number rather than reads it. */
  slot?: string;
}) {
  return (
    <span data-slot={slot} className={className}>
      <span dir="ltr" translate="no" className="num">
        {children}
      </span>
    </span>
  );
}
