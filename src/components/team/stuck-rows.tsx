"use client";

import { useLocale } from "next-intl";
import { WORK_ROW, WORK_ROWS } from "@/components/team/work-grid";
import { Avatar } from "@/components/ui-ext/avatar";
import { DayText } from "@/components/ui-ext/day-text";
import { Ref } from "@/components/ui-ext/figures";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { Link } from "@/i18n/navigation";
import type { Day } from "@/lib/dates";
import { TONE_TEXT, type StateTone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

/**
 * The rows of one group of the stuck list, drawn on the client from plain
 * data (D82). Every row is a link with three spans inside it; rendered from a
 * server loop, each row's link was serialised into the page with its whole
 * card as props, and a hundred stuck rows cost the manager's screen twice its
 * markup again in a second copy of itself.
 */
export type StuckRowData = {
  key: string;
  href: string;
  /** A document number such as Q-12, drawn LTR as a figure. */
  label?: string;
  /** The customer's or the project's name. */
  name?: string;
  /** The customer, where the row is about something of his. */
  companyName?: string;
  /** The company the row is about, whose face leads it — and its dot, where it has a state. */
  face: { id: string; name: string; ring?: StateTone };
  /** Whose floor it is on, in words. */
  who: string;
  /** The people `who` names, in its order, each with a dot where one is on leave. */
  people: { id: string; name: string; ring?: StateTone }[];
  /** The date the row is late against, where there is one. */
  day?: Day;
  /** How late, in words. */
  note: string;
  /** The note's colour where it says somebody is late; none where it measures silence. */
  noteTone?: StateTone;
};

export function StuckRows({ rows }: { rows: StuckRowData[] }) {
  const locale = useLocale();

  /*
   * One row a thing, inside its group's card (P13-S8): the company's face, what
   * it is on the first line, whose it is and how late on the second — the
   * person's face beside his name (S12.7), so a manager scanning a card for
   * "whose" reads faces he already knows from the team tab. The card is half a
   * desk wide and the whole of a phone, so the row is laid out for the narrow
   * case at every width: a row whose customer's name is unreadable is a row
   * nobody can act on.
   *
   * The spans stay in this order, note last: specs read how late a row is from
   * its last span (tests/calendar.spec.ts).
   */
  return (
    <ul className={WORK_ROWS}>
      {rows.map((row) => (
        <li key={row.key}>
          <Link
            href={row.href}
            className={cn(
              WORK_ROW,
              "hover-tint flex items-start gap-3 outline-none focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring/50",
            )}
          >
            <Avatar id={row.face.id} name={row.face.name} kind="company" size="sm" ring={row.face.ring} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="min-w-0 text-sm font-medium">
                {row.label ? <Ref>{row.label}</Ref> : <bdi>{row.name}</bdi>}
                {/* Two values and a separator: each in its own run, so the dot
                    settles against the paragraph and not against a name
                    (rules/words.md). */}
                {row.companyName ? (
                  <>
                    <span aria-hidden="true" className="text-faint">
                      {" · "}
                    </span>
                    <bdi className="font-normal text-muted-foreground">{row.companyName}</bdi>
                  </>
                ) : null}
                <LinkPending className="ms-2 inline-flex align-middle" />
              </span>
              <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  {row.people.length > 0 ? (
                    <span className="flex shrink-0 items-center gap-1">
                      {row.people.map((person, index) => (
                        <Avatar
                          key={`${person.id}-${index}`}
                          id={person.id}
                          name={person.name}
                          size="sm"
                          ring={person.ring}
                        />
                      ))}
                    </span>
                  ) : null}
                  <span className="min-w-0">{row.who}</span>
                </span>
                <span className={row.noteTone ? TONE_TEXT[row.noteTone] : "text-muted-foreground"}>
                  {row.day ? (
                    <>
                      <DayText day={row.day} locale={locale} />
                      <span aria-hidden="true">{" · "}</span>
                    </>
                  ) : null}
                  {row.note}
                </span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
