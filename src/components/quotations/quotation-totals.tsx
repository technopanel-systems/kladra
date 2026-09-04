"use client";

import { useTranslations } from "next-intl";
import { formatMoney, formatSqm } from "@/lib/money";

/**
 * What a quotation comes to: m² first, then the total before tax, VAT at 15%
 * and the grand total (SPEC §3, S31, and P8).
 *
 * The m² is the headline and the three money figures are the support. That is
 * Jerom's ruling and it matches what the numbers are for: a rep is measured in
 * square metres (S43), a month is counted in them (S41), and every SAR figure
 * here is a copy of something SMAC is the record for.
 *
 * One block, used twice on purpose — under the lines while a rep is still
 * typing, on figures nothing has saved, and in the drawer on the figures the
 * database computed. Two blocks would be two chances to lay the same four
 * numbers out differently, and the whole point of showing them live is that a
 * rep recognises them again afterwards.
 *
 * The figures themselves are computed in two places, which is not the same
 * thing: `src/lib/money.ts` in the browser on unsaved values, and SQL in
 * `src/lib/quotations.ts` on the stored rows. tests/quotations.spec.ts checks
 * they agree rather than trusting them to.
 *
 * Every number carries `dir="ltr"`: a run of digits, a comma and a full stop
 * has no strong character in it, so its direction is whatever the paragraph's
 * is unless it is said outright — that is exactly the case the direction rule
 * keeps `dir="ltr"` for (DESIGN §5).
 */
export function QuotationTotals({
  sqm,
  subtotal,
  vat,
  total,
}: {
  sqm: string | number;
  subtotal: string | number;
  vat: string | number;
  total: string | number;
}) {
  const t = useTranslations();

  return (
    <dl data-slot="totals" className="card-face flex flex-col gap-2 p-3 text-sm">
      <div className="flex items-baseline justify-between gap-4 pb-1">
        <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("common.sqm")}
        </dt>
        <dd data-slot="figure-sqm" className="text-2xl leading-none font-semibold">
          <span dir="ltr" className="num">
            {formatSqm(sqm)}
          </span>
        </dd>
      </div>

      <div className="border-t border-line pt-2" />

      <Row name="subtotal" label={t("common.totalExclVat")}>
        <span dir="ltr" className="num">
          {formatMoney(subtotal)}
        </span>{" "}
        {t("common.sar")}
      </Row>
      <Row name="vat" label={t("common.vatRate")}>
        <span dir="ltr" className="num">
          {formatMoney(vat)}
        </span>{" "}
        {t("common.sar")}
      </Row>
      <div className="border-t border-line pt-2">
        <Row name="total" label={t("common.grandTotal")} strong>
          <span dir="ltr" className="num">
            {formatMoney(total)}
          </span>{" "}
          {t("common.sar")}
        </Row>
      </div>
    </dl>
  );
}

/**
 * `data-slot` names the figure, not its label: the two copies of this block are
 * only worth having if a test can check that the one the browser adds up and
 * the one Postgres adds up are the same four numbers.
 */
function Row({
  name,
  label,
  children,
  strong,
}: {
  name: "sqm" | "subtotal" | "vat" | "total";
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "font-medium" : "text-muted-foreground"}>{label}</dt>
      <dd data-slot={`figure-${name}`} className={strong ? "font-semibold" : undefined}>
        {children}
      </dd>
    </div>
  );
}
