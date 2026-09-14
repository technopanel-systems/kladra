import { Cpu } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Sqm } from "@/components/ui-ext/figures";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { Link } from "@/i18n/navigation";
import type { Day } from "@/lib/dates";
import { narrowingQuery } from "@/lib/narrowing";
import { whatMoved, type Figure, type Recorded } from "@/lib/report-figures";
import { cn } from "@/lib/utils";

/**
 * What Kladra recorded on a person's day, in its own marked lane (SPEC §3 P13:
 * "the system's own events are shown alongside, clearly marked, never mixed in").
 *
 * Beside the reports and never among them. It is drawn as an inset strip — the
 * surface a panel WITHIN something takes, never a card at rest (DESIGN §1) —
 * with its own heading and a mark that is not a person's avatar, so nobody
 * reads a quotation raised as a thing somebody wrote. It is a complementary
 * region with its own name, so a screen reader moving by landmarks hears the
 * two halves as two.
 *
 * Only what moved: a lane of six figures where five are nought is a lane nobody
 * reads. A day with nothing on it says so in one line rather than drawing
 * nothing, because an absent lane beside one day and a present one beside the
 * next reads as a screen that failed to load.
 *
 * **Every figure is a door to the list that holds its records** (P13-G6, S12.8;
 * D117). "1 quotation request" named a paper and was plain text, so the reader
 * who wanted to see it went to the quotations list and hunted. Each line now
 * opens its list narrowed as far as that list's address can go, and says how
 * far that is, because the two lists can be asked different things:
 *
 * - a quotation request is a quotation RAISED that day and counted for this
 *   person, which is exactly the narrowing the quotations list reads from a
 *   metrics door (`from`, `to`, `credited`) — so it opens that day's list;
 * - a dispatch approved, and the metres it moved, are dispatches APPROVED that
 *   day and credited to him, which is the dispatches list's own narrowing — so
 *   those open that day's list too;
 * - a dispatch request (raised, not approved), a quotation sent back and a
 *   customer's answer are days the lists' addresses cannot name, so each opens
 *   its whole list — and the line says "the whole list" rather than letting a
 *   reader expect the day and find everything.
 *
 * A figure narrowed by the reports screen's company filter opens a list that
 * is not: neither list's address can name a customer.
 */
type Door = { href: string; scope: "day" | "whole" };

function doorOf(figure: Figure, personId: string, day: Day): Door {
  const thatDay = narrowingQuery({ from: day, to: day, credited: personId });
  switch (figure.key) {
    case "quotationRequests":
      return { href: `/quotations?${thatDay}`, scope: "day" };
    case "dispatchesApproved":
    case "moved":
      return { href: `/dispatches?${thatDay}`, scope: "day" };
    case "dispatchRequests":
      return { href: "/dispatches", scope: "whole" };
    default:
      // Sent back and answered: quotations, on days the list cannot name.
      return { href: "/quotations", scope: "whole" };
  }
}

export async function RecordedLane({
  recorded,
  personId,
  day,
  className,
}: {
  recorded: Recorded;
  /** Whose day it is: the doors count for him. */
  personId: string;
  day: Day;
  className?: string;
}) {
  const t = await getTranslations("reports");
  const figures = whatMoved(recorded);

  return (
    <aside
      aria-label={t("recorded")}
      data-slot="recorded-lane"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Cpu aria-hidden="true" className="size-3.5 shrink-0" />
        {t("recorded")}
      </p>
      {figures.length === 0 ? (
        <p className="text-xs text-faint">{t("recordedNothing")}</p>
      ) : (
        <ul className="flex flex-col text-sm">
          {figures.map((figure) => {
            const door = doorOf(figure, personId, day);
            return (
              <li key={figure.key} data-figure={figure.key} className="flex">
                <Link
                  href={door.href}
                  data-slot="recorded-door"
                  data-scope={door.scope}
                  className="hover-tint touch -mx-2 flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1"
                >
                  <span className="flex min-w-0 flex-col">
                    {/* Underlined because it is a door (D117): the figure and the
                        noun it counts, which is what was pressed. */}
                    <span className="underline decoration-line-strong underline-offset-4">
                      {figure.sqm ? (
                        // The m² figure prints bare here: its label carries the unit.
                        <Sqm value={figure.value} unit={false} />
                      ) : (
                        <span dir="ltr" className="num font-medium">
                          {figure.value}
                        </span>
                      )}{" "}
                      {/* A noun counted, not a heading: "1 quotation request". */}
                      <span className="text-xs text-muted-foreground">
                        {t(`${figure.key}Label`, { count: Number(figure.value) })}
                      </span>
                    </span>{" "}
                    {/* How far the door narrows, in words, before it is pressed —
                        on its own line under the figure, as a caption, so "2
                        dispatch requests" is never read as a count OF the whole
                        list. */}
                    <span className="text-xs text-faint">
                      {door.scope === "day" ? t("opensThatDay") : t("opensWholeList")}
                    </span>
                  </span>
                  <LinkPending />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
