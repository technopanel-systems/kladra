"use client";

import { useTranslations } from "next-intl";
import { LineFigure } from "@/components/ui-ext/line-item";
import { formatMoney, formatSqm } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * What a quotation comes to: m² first, then the money — the panels and the
 * services each on their own line where there are services to speak of, the
 * total before tax, VAT at 15% and the grand total (SPEC §3, S31, P8, P13).
 *
 * The m² is the headline and the money figures are the support. That is
 * Jerom's ruling and it matches what the numbers are for: a rep is measured in
 * square metres (S43), a month is counted in them (S41), and every SAR figure
 * here is a copy of something SMAC is the record for. The m² is the PANELS':
 * a service's m² is the area it is done over, and it counts toward nothing
 * (D173) — services are money, and they are in the money.
 *
 * One block, used twice on purpose — under the lines while a rep is still
 * typing, on figures nothing has saved, and in the drawer on the figures the
 * database computed. Two blocks would be two chances to lay the same numbers
 * out differently, and the whole point of showing them live is that a rep
 * recognises them again afterwards.
 *
 * The figures themselves are computed in two places, which is not the same
 * thing: `src/lib/money.ts` in the browser on unsaved values, and SQL in
 * `src/lib/quotations.ts` on the stored rows. tests/quotations.spec.ts and
 * tests/services.spec.ts check they agree rather than trusting them to.
 *
 * Every number carries `dir="ltr"`: a run of digits, a comma and a full stop
 * has no strong character in it, so its direction is whatever the paragraph's
 * is unless it is said outright — that is exactly the case the direction rule
 * keeps `dir="ltr"` for (DESIGN §5).
 */
export function QuotationTotals({
  sqm,
  split,
  subtotal,
  vat,
  total,
}: {
  sqm: string | number;
  /**
   * The panels and the services apart (SPEC §3, P13). The form always passes it
   * — its services section is always there, and "services 0.00" is what says an
   * empty one adds nothing. The drawer passes it only when the quotation HAS
   * services, so the ordinary paper keeps its four figures.
   */
  split?: { panels: string | number; services: string | number };
  subtotal: string | number;
  vat: string | number;
  total: string | number;
}) {
  const t = useTranslations();

  // Every child of the list is one label and its figure, and nothing else: a
  // rule between figures is a border on one of the two pairs it separates (the
  // m²'s own bottom edge; the top edge of a sum's pair), never an element of
  // its own. A wrapper round a pair, or an empty element drawn as a line, is a
  // `<dl>` a screen reader cannot walk — axe's `definition-list` and `dlitem`,
  // found when the drawers were first read (P14.5). Each rule sits exactly
  // where its own element used to draw it.
  return (
    <dl data-slot="totals" className="card-face flex flex-col gap-2 p-3 text-sm">
      <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-line pb-3">
        {/* A word in a sentence's case, not an eyebrow (DESIGN §8): it was set
            in capitals and letter-spaced, the identity §8 refuses — and m² has
            no capital M. The `StandingStrip` label's shape since S12.K. */}
        <dt className="text-xs text-muted-foreground">{t("common.sqm")}</dt>
        <dd data-slot="figure-sqm" className="text-2xl leading-none font-semibold">
          <span dir="ltr" className="num">
            {formatSqm(sqm)}
          </span>
        </dd>
      </div>

      {split ? (
        <>
          <Row name="panels" label={t("quotations.panelsSubtotal")}>
            <span dir="ltr" className="num">
              {formatMoney(split.panels)}
            </span>{" "}
            {t("common.sar")}
          </Row>
          <Row name="services" label={t("quotations.servicesSubtotal")}>
            <span dir="ltr" className="num">
              {formatMoney(split.services)}
            </span>{" "}
            {t("common.sar")}
          </Row>
        </>
      ) : null}

      {/* Under the two it adds up, a rule between them says so. */}
      <Row
        name="subtotal"
        label={t("common.totalExclVat")}
        className={split ? "border-t border-line pt-2" : undefined}
      >
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
      <Row name="total" label={t("common.grandTotal")} strong className="border-t border-line pt-2">
        <span dir="ltr" className="num">
          {formatMoney(total)}
        </span>{" "}
        {t("common.sar")}
      </Row>
    </dl>
  );
}

/**
 * `data-slot` names the figure, not its label: the two copies of this block are
 * only worth having if a test can check that the one the browser adds up and
 * the one Postgres adds up are the same numbers.
 */
function Row({
  name,
  label,
  children,
  strong,
  className,
}: {
  name: "panels" | "services" | "subtotal" | "vat" | "total";
  label: string;
  children: React.ReactNode;
  strong?: boolean;
  /** The rule over a pair that closes a sum — on the pair itself, never round it. */
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <dt className={strong ? "font-medium" : "text-muted-foreground"}>{label}</dt>
      <dd data-slot={`figure-${name}`} className={strong ? "font-semibold" : undefined}>
        {children}
      </dd>
    </div>
  );
}

/**
 * The two figures a paper's form keeps over Save where its totals block has
 * scrolled out of sight — below `xl`, where the block follows the items instead
 * of standing beside them (`FormFooter`'s `summary`). The m² first and larger, the
 * total after it: the same order and weight the block gives them.
 */
export function PaperSummary({ sqm, total }: { sqm: string | number; total: string | number }) {
  const t = useTranslations();
  return (
    <>
      <LineFigure strong value={formatSqm(sqm)} unit={t("common.sqm")} />
      <span className="text-muted-foreground">
        {t("common.grandTotal")} <LineFigure value={formatMoney(total)} unit={t("common.sar")} />
      </span>
    </>
  );
}
