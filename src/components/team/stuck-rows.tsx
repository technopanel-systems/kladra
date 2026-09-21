"use client";

import { useLocale } from "next-intl";
import { ArchiveAnswerButtons } from "@/components/archive/archive-request-notice";
import { WORK_ROW, WORK_ROWS, WORK_ROW_ACTIONS } from "@/components/team/work-grid";
import { Avatar } from "@/components/ui-ext/avatar";
import { DayText } from "@/components/ui-ext/day-text";
import { Ref } from "@/components/ui-ext/figures";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { Prose } from "@/components/ui-ext/prose";
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
  /**
   * Somebody's own words about this row, under it — typed, so in their
   * direction (rules/words.md). Only the archive band has any: the decision it
   * asks for is "archive X because Y", and Y was read and then not drawn.
   */
  reason?: string;
  /**
   * The request this row answers, where the reader answers it from here (M2).
   * Plain data and not a node, because these rows cross to the browser (D82);
   * the buttons are the drawer's own.
   */
  answer?: { requestId: string; name: string };
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
   *
   * The row is the door and the whole of it is pressable (`row-door`, D161), so
   * a row that also carries an answer can hold buttons beside the door rather
   * than inside it — an anchor with a button in it is not a link. The reason
   * and the buttons sit under the words at the card's one action inset, the
   * place the day screen already puts them (`WORK_ROW_ACTIONS`, S12.6).
   */
  return (
    <ul className={WORK_ROWS}>
      {rows.map((row) => (
        <li key={row.key} className={cn(WORK_ROW, "row-door flex flex-col gap-2")}>
          <Link data-door href={row.href} className="touch flex items-start gap-3">
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

          {/* Why somebody wants it gone, in the words they wrote — the half of
              the decision the row was carrying and not showing. A line rather
              than a paragraph, so it starts where its row starts and only the
              words take the writer's direction (rules/words.md). */}
          {row.reason ? (
            <Prose line text={row.reason} className="ps-9 text-xs text-muted-foreground" />
          ) : null}

          {/* Above the row's door, like the day's. The row is still a door to
              the record — where the rest of the customer is, and where he goes
              when the reason is not enough to decide on. */}
          {row.answer ? (
            <div className={WORK_ROW_ACTIONS}>
              <ArchiveAnswerButtons requestId={row.answer.requestId} name={row.answer.name} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
