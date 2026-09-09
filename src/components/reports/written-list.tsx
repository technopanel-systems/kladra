import { getTranslations } from "next-intl/server";
import { Prose } from "@/components/ui-ext/prose";
import { Link } from "@/i18n/navigation";
import type { WrittenEntry } from "@/lib/day-log";

/**
 * What the person wrote that day, under what the system recorded of him
 * (SPEC §3, P12).
 *
 * The founder's sentence is that the reports screen and the company log are one
 * thing with two halves. The figures above this are the half the system knows
 * by itself; these are the sentences only the person could write, and until now
 * they lived on the company drawer, one customer at a time — so a manager
 * reading somebody's Tuesday got the counts and none of the substance, and the
 * two halves of one day were on two screens.
 *
 * Each entry names the customer it is about and links to him, because the next
 * question after reading one is always "what else has happened there" (D121: a
 * line that names a record is a door to it). The job is named beside him when
 * the entry was filed against one.
 */
export async function WrittenList({ entries }: { entries: WrittenEntry[] }) {
  const t = await getTranslations();
  if (entries.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">
        {t("reports.written", { count: entries.length })}
      </h3>

      <ol className="flex flex-col gap-2.5">
        {entries.map((entry) => (
          <li key={entry.id} data-slot="written-entry" className="flex flex-col gap-1">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
              <Link
                href={`/companies?open=${entry.companyId}`}
                className="font-medium hover:underline"
              >
                <bdi>{entry.companyName}</bdi>
              </Link>
              {entry.projectName ? (
                <bdi className="text-muted-foreground">{entry.projectName}</bdi>
              ) : null}
              {/* The stored value is a code; this is the one reader for it (D139). */}
              <span className="text-faint">{t(`common.${entry.channel}`)}</span>
            </span>
            <Prose slot="written-text" text={entry.text} className="text-sm" />
          </li>
        ))}
      </ol>
    </section>
  );
}
