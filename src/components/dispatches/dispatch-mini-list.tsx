import { STATUS_KEYS } from "@/components/dispatches/status-words";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { DayText } from "@/components/ui-ext/day-text";
import { Ref, Sqm } from "@/components/ui-ext/figures";
import { StateBadge } from "@/components/ui-ext/state-badge";
import type { DispatchRow } from "@/lib/dispatches";
import { dispatchTone } from "@/lib/state-tone";

/**
 * The dispatches raised against one quotation, as its drawer lists them.
 *
 * A short row: the number, where it has got to, and how many square metres it
 * moves. Pressing it goes to the dispatches screen rather than opening a second
 * drawer on top of the first.
 *
 * This is the answer to the question a rep actually has on an issued
 * quotation — how much of it has gone — and it is why the tab exists (S37).
 *
 * Its state is the dispatch list's own: a dot in the tone and the word (DESIGN
 * §1 Stone), where it was a grey pill that said every state the same way. And it
 * leads with SMAC's number where there is one, as every row that names a
 * dispatch does (P12-11), with Kladra's quietly beside it.
 */


export async function DispatchMiniList({ rows }: { rows: DispatchRow[] }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/dispatches?open=${row.id}`}
            className="card-face hover-tint flex items-center gap-3 p-3"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <Ref className="font-medium">{row.smacDispatchNumber ?? row.label}</Ref>
                {row.smacDispatchNumber ? (
                  <Ref className="text-xs text-muted-foreground">{row.label}</Ref>
                ) : null}
                <StateBadge tone={dispatchTone(row.status)}>{t(STATUS_KEYS[row.status])}</StateBadge>
              </span>
              <DayText
                day={row.approvedOn ?? row.createdOn}
                locale={locale}
                className="text-xs text-muted-foreground"
              />
            </span>
            <Sqm value={row.totalSqm} className="text-sm" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
