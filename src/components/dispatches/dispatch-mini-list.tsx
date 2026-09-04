import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { DayText } from "@/components/ui-ext/day-text";
import { formatSqm } from "@/lib/money";
import type { DispatchRow } from "@/lib/dispatches";

/**
 * The dispatches raised against one quotation, as its drawer lists them.
 *
 * A short row: the number, where it has got to, and how many square metres it
 * moves. Pressing it goes to the dispatches screen rather than opening a second
 * drawer on top of the first.
 *
 * This is the answer to the question a rep actually has on an issued
 * quotation — how much of it has gone — and it is why the tab exists (S37).
 */

const STATUS_KEYS: Record<string, string> = {
  submitted: "dispatches.statusSubmitted",
  approved: "dispatches.statusApproved",
  refused: "dispatches.statusRefused",
};

export async function DispatchMiniList({ rows }: { rows: DispatchRow[] }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/dispatches?open=${row.id}`}
            className="card-face flex items-center gap-3 p-3 transition-colors hover:bg-surface-2"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span dir="ltr" className="num font-medium">
                  {row.label}
                </span>
                <Badge variant="secondary">{t(STATUS_KEYS[row.status])}</Badge>
                {row.smacDispatchNumber ? (
                  <span dir="ltr" className="num text-xs text-muted-foreground">
                    {row.smacDispatchNumber}
                  </span>
                ) : null}
              </span>
              <DayText
                day={row.approvedOn ?? row.createdOn}
                locale={locale}
                className="text-xs text-muted-foreground"
              />
            </span>
            <span className="text-sm whitespace-nowrap">
              <span dir="ltr" className="num">
                {formatSqm(row.totalSqm)}
              </span>{" "}
              <span className="text-xs text-muted-foreground">{t("common.sqm")}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
