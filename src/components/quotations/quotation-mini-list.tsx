import { getLocale, getTranslations } from "next-intl/server";
import { STATUS_KEYS } from "@/components/quotations/status-words";
import { Link } from "@/i18n/navigation";
import { DayText } from "@/components/ui-ext/day-text";
import { Money, Ref, Sqm } from "@/components/ui-ext/figures";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { StateBadge } from "@/components/ui-ext/state-badge";
import type { QuotationRow } from "@/lib/quotations";
import { quotationTone } from "@/lib/state-tone";

/**
 * The quotations on a company or a project, as its drawer lists them.
 *
 * A short row: the number, where it has got to, when, and what it comes to. The
 * whole thing lives on the quotations screen, and pressing a row goes there
 * rather than opening a second drawer on top of the first — a drawer over a
 * drawer is where a rep loses track of which list he came from.
 *
 * Drawn in the list's own words (P13-G6, S12.4): the number SMAC gave it leads
 * where there is one and Kladra's goes quietly after it (P12-11), the state is a
 * dot and its word rather than a grey pill, and the m² is the figure with the
 * money quiet under it (P8) — it showed the money alone, with no metres at all.
 *
 * Latest revisions only, from the same query the list screen uses: a project
 * quoted three times at 2,000 m² is 2,000, not 6,000 (S35).
 */
export async function QuotationMiniList({ rows }: { rows: QuotationRow[] }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/quotations?open=${row.id}`}
            className="card-face hover-tint flex items-center gap-3 p-3"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Ref className="text-sm font-medium">{row.smacNumber ?? row.label}</Ref>
                {row.smacNumber ? (
                  <Ref className="text-xs text-muted-foreground">{row.label}</Ref>
                ) : null}
                <StateBadge tone={quotationTone(row.status)}>{t(STATUS_KEYS[row.status])}</StateBadge>
                <LinkPending />
              </span>
              <DayText
                day={row.issuedOn ?? row.createdOn}
                locale={locale}
                className="text-xs text-muted-foreground"
              />
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1 text-sm">
              <Sqm value={row.totalSqm} />
              <Money value={row.total} className="text-xs" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
