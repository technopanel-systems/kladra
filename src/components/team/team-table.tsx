import { getLocale, getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui-ext/avatar";
import { LinkPending } from "@/components/ui-ext/link-pending";
import { StateBadge } from "@/components/ui-ext/state-badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { formatDay } from "@/lib/dates";
import { formatSqmWhole } from "@/lib/money";
import { paceTone, TONE_TEXT, type StateTone } from "@/lib/state-tone";
import type { TeamMember } from "@/lib/team";
import { cn } from "@/lib/utils";

/**
 * Everybody, one row a person, drawn in the one language (SPEC §3 P13, DESIGN
 * §1b, D14).
 *
 * Who, how the month is going, and the habits beside it — and nothing that adds
 * them up. The month is achieved of target with the pace under it; pipeline,
 * open quotations, overdue follow-ups, never-contacted and gone-quiet companies
 * are the habits, and the founder asked for never-contacted by name because
 * adding forty companies and working none is a real pattern (S51). Nothing here
 * ranks anybody and there is no score (S46).
 *
 * **The whole row opens the person** (P13-S8): his name is the row's door
 * (`row-door`, D161) to `/companies?rep=`, the manager's read-only drill into
 * that floor (S8). A count is a door of its own, lifted above the row's, into
 * the rows it counted on that floor — the same filter the pill there uses, so
 * the number pressed and the list that opens are one definition (D108). A nought
 * is plain text: a door onto an empty room is a dead end.
 *
 * **The avatar's ring says one thing** (DESIGN §1b), and never alone — the word
 * is on the row beside it. Amber: on leave today (D75), from the one reader of
 * leave. Red: something of theirs is stuck past its line, counted from the
 * stuck list's own rows (`stuckByPerson`). Both can be true and a ring carries
 * one colour, so leave wins it: nothing on the floor of somebody who is not at
 * work is his to clear today, and the stuck word stays on the row regardless.
 *
 * Pace is per person because leave is: working days elapsed over working days
 * in the month, on that person's own calendar, so a rep back from two weeks off
 * does not read as behind (S48).
 *
 * At 375 the same content is a card per person, in the same order. Seven
 * columns across a phone is a sideways scroll, and this is a screen a manager
 * checks on a phone.
 */
export async function TeamTable({
  members,
  stuck,
}: {
  members: TeamMember[];
  /** How many things are stuck on each person, by user id (`stuckByPerson`). */
  stuck: Map<string, number>;
}) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  const rows = members.map((member) => {
    const stuckCount = stuck.get(member.userId) ?? 0;
    return {
      member,
      stuck: stuckCount,
      ring: (member.away ? "over" : stuckCount > 0 ? "bad" : undefined) as StateTone | undefined,
      tone: toneFor(member),
      href: `/companies?rep=${member.userId}`,
    };
  });
  type Row = (typeof rows)[number];

  /** The words the ring stands for, so colour is never the only carrier. */
  const states = (row: Row) =>
    row.member.away || row.stuck > 0 ? (
      <span className="mt-1 flex flex-wrap items-center gap-1.5">
        {row.member.away ? (
          <StateBadge tone="over">
            {t("team.backOn", { day: formatDay(row.member.away.backOn, locale) })}
          </StateBadge>
        ) : null}
        {row.stuck > 0 ? (
          <StateBadge tone="bad">
            {t("team.stuckCount", { count: row.stuck })}
          </StateBadge>
        ) : null}
      </span>
    ) : null;

  const person = (row: Row) => (
    <span className="flex min-w-0 items-center gap-3">
      <span data-slot="member-avatar" data-ring={row.ring ?? "none"} className="flex">
        <Avatar id={row.member.userId} name={row.member.name} ring={row.ring} />
      </span>
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        {/* Named by the person and nothing else, so the door is the same
            control to say out loud and to press on the day he goes away. */}
        <Link data-door href={row.href} className="flex items-center gap-1.5 font-medium">
          <span className="min-w-0">{row.member.name}</span>
          <LinkPending />
        </Link>
        <span className="text-xs text-muted-foreground">{t(`common.${row.member.role}`)}</span>
        {states(row)}
      </span>
    </span>
  );

  const month = (row: Row) => (
    <>
      <span className="text-sm whitespace-nowrap">
        <span dir="ltr" data-slot="member-achieved" className={cn("num", row.tone && TONE_TEXT[row.tone])}>
          {formatSqmWhole(row.member.achieved)}
        </span>
        <span className="text-muted-foreground">{" / "}</span>
        {/* A dash, and every other figure on the row still real (S45, D41). */}
        {row.member.target === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span dir="ltr" data-slot="member-target" className="num">
            {formatSqmWhole(row.member.target)}
          </span>
        )}{" "}
        <span className="text-xs text-muted-foreground">{t("common.sqm")}</span>
      </span>
      {/* His own working days, in the words the month card uses: "4 / 22" was
          the one reading of the figure with no unit on it (D59, P11E).
          `data-slot` names it so a spec reads it by name, not by position. */}
      <span data-slot="figure-pace" className="text-xs text-muted-foreground whitespace-nowrap">
        {t("team.paceLine", { elapsed: row.member.pace.elapsed, total: row.member.pace.total })}
      </span>
    </>
  );

  /** The habits, each a door into what it counted on that floor. */
  const habits = (row: Row) => [
    { key: "openQuotations", label: t("team.openQuotations"), value: row.member.openQuotations, href: row.href },
    {
      key: "overdueFollowUps",
      label: t("team.overdueFollowUps"),
      value: row.member.overdueFollowUps,
      href: `${row.href}&filter=overdue`,
    },
    {
      key: "neverContacted",
      label: t("team.neverContacted"),
      value: row.member.neverContacted,
      href: `${row.href}&filter=never`,
    },
    { key: "goneQuiet", label: t("team.stuckQuiet"), value: row.member.goneQuiet, href: `${row.href}&filter=quiet` },
  ];

  return (
    <>
      <ul aria-label={t("shell.team")} className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.member.userId} className="card-face row-door flex flex-col gap-3 p-3">
            {person(row)}

            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-xs text-muted-foreground">{t("team.achievedOfTarget")}</span>
              <span className="flex flex-col items-end gap-0.5">{month(row)}</span>
            </span>

            {/* Two columns of label and figure, the figure at the end of each,
                so five numbers read as a table would rather than as a sentence. */}
            <span className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-baseline justify-between gap-2">
                {t("team.pipeline")}
                <span dir="ltr" className="num text-foreground">
                  {formatSqmWhole(row.member.pipeline)}
                </span>
              </span>
              {habits(row).map((habit) => (
                <span key={habit.key} className="flex items-baseline justify-between gap-2">
                  {habit.label} <CountFigure value={habit.value} href={habit.href} />
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>

      {/* `overflow-clip`, not the card's own `overflow-hidden`: a hidden overflow
          is a scroll container, and the table's scrollbar would stick to it
          rather than under the top bar (P13-S7). */}
      <div className="card-face hidden overflow-clip md:block">
        <Table label={t("shell.team")}>
          <TableCaption className="sr-only">{t("shell.team")}</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-3 py-2">{t("team.member")}</TableHead>
              <TableHead className="px-3 py-2 text-end">{t("team.achievedOfTarget")}</TableHead>
              {/* The figure headers wrap onto two lines rather than widen their
                  column past the number under it: in Arabic, one line each put
                  the last column off the card's edge at 1366. */}
              <TableHead className={FIGURE_HEAD}>{t("team.pipeline")}</TableHead>
              <TableHead className={FIGURE_HEAD}>{t("team.openQuotations")}</TableHead>
              <TableHead className={FIGURE_HEAD}>{t("team.overdueFollowUps")}</TableHead>
              <TableHead className={FIGURE_HEAD}>{t("team.neverContacted")}</TableHead>
              <TableHead className={FIGURE_HEAD}>{t("team.stuckQuiet")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.member.userId} className="row-door">
                <TableCell className="px-3 py-2 whitespace-normal">{person(row)}</TableCell>
                <TableCell className="px-3 py-2 text-end">
                  <span className="flex flex-col items-end gap-0.5">{month(row)}</span>
                </TableCell>
                <TableCell className="px-3 py-2 text-end">
                  {/* What is still out there to win (S45), beside what has
                      already gone out. Whole metres: a sum of estimates. */}
                  <span dir="ltr" className="num">
                    {formatSqmWhole(row.member.pipeline)}
                  </span>
                </TableCell>
                {habits(row).map((habit) => (
                  <TableCell key={habit.key} className="px-3 py-2 text-end">
                    <CountFigure value={habit.value} href={habit.href} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

const FIGURE_HEAD = "h-auto px-3 py-2 text-end align-bottom whitespace-normal";

/**
 * How a person is going against the calendar, as a colour on the achieved
 * figure (DESIGN §6, D48): the month card's bar rule, and still not a score —
 * target, achieved and pace sit side by side and the colour only says which side
 * of the pace line the figure is on (S46). Nothing in the first five working
 * days (S49), and nothing without a target to be on a side of.
 */
function toneFor(member: TeamMember): StateTone | null {
  return member.pace.justStarted || member.target === null
    ? null
    : paceTone(Number(member.achieved), Number(member.target), member.pace.ratio);
}

/**
 * A count that opens what it counted, or a plain nought (P11E). The underline
 * says a number is a door; `relative z-10` lifts it above the row's own door,
 * which is stretched over everything else on the row (globals.css `row-door`).
 */
const COUNT_LINK =
  "num relative z-10 underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-current";

function CountFigure({ value, href }: { value: number; href: string }) {
  if (value === 0) {
    return (
      <span dir="ltr" className="num text-muted-foreground">
        {value}
      </span>
    );
  }
  return (
    <Link href={href} dir="ltr" className={cn(COUNT_LINK, "text-foreground")}>
      {value}
    </Link>
  );
}
