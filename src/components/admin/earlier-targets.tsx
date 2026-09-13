import { getLocale, getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui-ext/avatar";
import { Empty } from "@/components/ui-ext/empty";
import { ListTail } from "@/components/ui-ext/list-tail";
import { StickyScroll } from "@/components/ui-ext/sticky-scroll";
import type { EarlierTargets } from "@/lib/admin";
import { formatMonth } from "@/lib/dates";
import { formatSqmWhole } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The months before this one, as they were left (SPEC §3 P13: "history
 * read-only").
 *
 * A table and nothing to press. Every figure here is somebody's finished month —
 * what a rep was measured against, what the six bars on the metrics tab drew a
 * line at — so there is no box, no button and no link into a month: reopening
 * one would rewrite the yardstick after the race. The boxes above are this
 * month's and the action refuses any other.
 *
 * A month down the side and a person across the top, because the question asked
 * of it is "what did we aim at in June", read along one row. Somebody who has
 * since left keeps his column for the months he had a figure (D68 names him in
 * the reader's script), and a month he had none is a dash, the same dash the
 * team screen draws for no target (S45) — never a zero, which would say "aim for
 * nothing".
 *
 * Wide once there are more than a few people, so it scrolls inside
 * `StickyScroll` with the month held at the inline start (DESIGN §1b).
 */
export async function EarlierTargetsTable({ earlier }: { earlier: EarlierTargets }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  if (earlier.months.length === 0) {
    return <Empty size="panel">{t("admin.earlierNone")}</Empty>;
  }

  const none = t("admin.noTarget");
  // The first column is held while the rest scroll under it, so it needs the
  // card's own ground behind it rather than the transparency a cell has.
  const held = "sticky start-0 z-1 bg-surface";

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t("admin.earlierHint")}</p>

      <StickyScroll label={t("admin.earlierMonths")} barClassName="top-14" className="card-face">
        <table data-slot="earlier-targets" className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className={cn(held, "px-3 py-2 text-start text-xs font-medium text-muted-foreground")}
              >
                {t("admin.month")}
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-end text-xs font-medium whitespace-nowrap text-muted-foreground"
              >
                {t("admin.companyTarget")}
              </th>
              {earlier.people.map((person) => (
                <th
                  key={person.userId}
                  scope="col"
                  className="px-3 py-2 text-end text-xs font-medium"
                >
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <Avatar id={person.userId} name={person.name} size="sm" />
                    <bdi>{person.name}</bdi>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {earlier.months.map((month) => (
              <tr
                key={month.month}
                data-earlier={month.month}
                className="border-b border-line last:border-0"
              >
                <th
                  scope="row"
                  className={cn(held, "px-3 py-2 text-start font-medium whitespace-nowrap")}
                >
                  {formatMonth(month.month, locale)}
                </th>
                <td className="px-3 py-2 text-end">
                  <Figure sqm={month.company} none={none} />
                </td>
                {earlier.people.map((person) => (
                  <td key={person.userId} className="px-3 py-2 text-end">
                    <Figure sqm={month.people[person.userId] ?? null} none={none} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </StickyScroll>

      <ListTail
        shown={earlier.months.length}
        total={earlier.total}
        hint={t("admin.earlierTail", { shown: earlier.months.length, total: earlier.total })}
      />
    </div>
  );
}

/** A month's figure in whole metres, or the dash for none — said in words to a reader. */
function Figure({ sqm, none }: { sqm: string | null; none: string }) {
  if (sqm === null) {
    return (
      <>
        <span aria-hidden="true" className="text-muted-foreground">
          —
        </span>
        <span className="sr-only">{none}</span>
      </>
    );
  }
  return (
    <span dir="ltr" className="num">
      {formatSqmWhole(sqm)}
    </span>
  );
}
