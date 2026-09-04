import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { DayText } from "@/components/ui-ext/day-text";
import { formatMoney } from "@/lib/money";
import type { QuotationRow } from "@/lib/quotations";

/**
 * The quotations on a company or a project, as its drawer lists them.
 *
 * A short row: the number, where it has got to, and what it comes to. The whole
 * thing lives on the quotations screen, and pressing a row goes there rather
 * than opening a second drawer on top of the first — a drawer over a drawer is
 * where a rep loses track of which list he came from.
 *
 * Latest revisions only, from the same query the list screen uses: a project
 * quoted three times at 2,000 m² is 2,000, not 6,000 (S35).
 */

const STATUS_KEYS: Record<string, string> = {
  requested: "quotations.statusRequested",
  returned: "quotations.statusReturned",
  issued: "quotations.statusIssued",
  accepted: "quotations.statusAccepted",
  rejected: "quotations.statusRejected",
  cancelled: "quotations.statusCancelled",
};

export async function QuotationMiniList({ rows }: { rows: QuotationRow[] }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/quotations?open=${row.id}`}
            className="card-face flex items-center gap-3 p-3 transition-colors hover:bg-surface-2"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span dir="ltr" className="num font-medium">
                  {row.label}
                </span>
                <Badge variant="secondary">{t(STATUS_KEYS[row.status])}</Badge>
                {row.smacNumber ? (
                  <span dir="ltr" className="num text-xs text-muted-foreground">
                    {row.smacNumber}
                  </span>
                ) : null}
              </span>
              <DayText
                day={row.issuedOn ?? row.createdOn}
                locale={locale}
                className="text-xs text-muted-foreground"
              />
            </span>
            <span className="text-sm whitespace-nowrap">
              <span dir="ltr" className="num">
                {formatMoney(row.total)}
              </span>{" "}
              <span className="text-xs text-muted-foreground">{t("common.sar")}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
