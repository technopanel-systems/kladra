import { getLocale, getTranslations } from "next-intl/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { formatDay, type Day } from "@/lib/dates";
import { formatSqmWhole } from "@/lib/money";
import { paceTone, TONE_TEXT } from "@/lib/state-tone";
import type { TeamMember } from "@/lib/team";
import { cn } from "@/lib/utils";

/**
 * Everybody, with their month and their habits beside it (SPEC §3, D14).
 *
 * Six columns and no seventh that adds them up. Target, achieved and pace are
 * the month; open quotations, overdue follow-ups and never-contacted companies
 * are the habits — the founder asked for the last one by name, because adding
 * forty companies and working none is a real pattern he wanted visible (S51).
 * Nothing here ranks anybody and there is no score (S46).
 *
 * Pace is per person rather than per month because leave is: it is working days
 * elapsed over working days in the month, counted against that person's own
 * calendar, so a rep back from two weeks off does not read as behind (S48).
 *
 * A name opens that person's companies, read-only: the manager sees everyone's
 * floor and adds to nobody's (S8).
 *
 * At 375 the table becomes a card per person. Six columns across a phone is a
 * horizontal scroll, and this is a screen a manager checks on a phone.
 */
export async function TeamTable({ members }: { members: TeamMember[] }) {
  const t = await getTranslations();

  /**
   * How a rep is going against the calendar, as a colour on his achieved figure
   * (DESIGN §6, D48). It is the same rule the month card's bar uses, and it is
   * still not a score: the row shows target, achieved and pace side by side and
   * the colour only says which side of the pace line the achieved figure is on
   * (S46). In the first five working days it says nothing at all (S49).
   */
  const toneFor = (member: TeamMember) =>
    member.pace.justStarted || member.target === null
      ? null
      : paceTone(Number(member.achieved), Number(member.target), member.pace.ratio);

  return (
    <>
      <div className="flex flex-col gap-2 md:hidden">
        {members.map((member) => (
          <Link
            key={member.userId}
            href={`/companies?rep=${member.userId}`}
            className="card-face flex flex-col gap-2 p-3"
          >
            <span className="font-medium">{member.name}</span>
            {member.away ? <AwayLine backOn={member.away.backOn} /> : null}

            {/* Two figures joined by a slash and no word for either was the
                phone card until P9.4: a reader had to know which side was
                which (D59). The label is the sentence the slash was standing
                in for. */}
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-xs text-muted-foreground">
                {t("team.achievedOfTarget")}
              </span>
              <span className="text-sm">
                <span
                  dir="ltr"
                  className={cn("num", toneFor(member) && TONE_TEXT[toneFor(member)!])}
                >
                  {formatSqmWhole(member.achieved)}
                </span>
                {" / "}
                {member.target === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span dir="ltr" className="num">
                    {formatSqmWhole(member.target)}
                  </span>
                )}{" "}
                <span className="text-xs text-muted-foreground">{t("common.sqm")}</span>
              </span>
            </span>
            <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {t("team.pipeline")}{" "}
                <span dir="ltr" className="num text-foreground">
                  {formatSqmWhole(member.pipeline)}
                </span>
              </span>
              <span>
                {/* The desk table says "3 of 21 working days"; this said "3 / 21"
                    and dropped the unit, so the same figure read as two
                    different things on two widths. */}
                {t("team.pace")}{" "}
                <span className="text-foreground">
                  {t("team.paceLine", {
                    elapsed: member.pace.elapsed,
                    total: member.pace.total,
                  })}
                </span>
              </span>
              <Habit label={t("team.openQuotations")} value={member.openQuotations} />
              <Habit label={t("team.overdueFollowUps")} value={member.overdueFollowUps} />
              <Habit label={t("team.neverContacted")} value={member.neverContacted} />
            </span>
          </Link>
        ))}
      </div>

      <div className="card-face hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="p-3">{t("team.member")}</TableHead>
              <TableHead className="p-3 text-end">{t("team.pipeline")}</TableHead>
              <TableHead className="p-3 text-end">{t("team.target")}</TableHead>
              <TableHead className="p-3 text-end">{t("team.achieved")}</TableHead>
              <TableHead className="p-3 text-end">{t("team.pace")}</TableHead>
              <TableHead className="p-3 text-end">{t("team.openQuotations")}</TableHead>
              <TableHead className="p-3 text-end">{t("team.overdueFollowUps")}</TableHead>
              <TableHead className="p-3 text-end">{t("team.neverContacted")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.userId}>
                {/* The leave line sits beside the link and not inside it: the
                    link is named by the person and nothing else, so it stays
                    the same control to say out loud and to click on the day he
                    goes away (DESIGN §5). */}
                <TableCell className="p-3">
                  <Link href={`/companies?rep=${member.userId}`} className="font-medium">
                    {member.name}
                  </Link>
                  {member.away ? <AwayLine backOn={member.away.backOn} /> : null}
                </TableCell>
                <TableCell className="p-3 text-end">
                  {/* What is still out there to win (S45), beside what has
                      already gone out — the two questions a manager asks in
                      one row. */}
                  <span dir="ltr" className="num">
                    {formatSqmWhole(member.pipeline)}
                  </span>
                </TableCell>
                <TableCell className="p-3 text-end">
                  {/* A dash, and every other figure on the row still real (S45). */}
                  {member.target === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span dir="ltr" className="num">
                      {formatSqmWhole(member.target)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="p-3 text-end">
                  <span
                    dir="ltr"
                    className={cn("num", toneFor(member) && TONE_TEXT[toneFor(member)!])}
                  >
                    {formatSqmWhole(member.achieved)}
                  </span>
                </TableCell>
                <TableCell className="p-3 text-end whitespace-nowrap">
                  {/* His own working days, so leave shortens his month (S48).
                      `data-slot` names the figure so a spec reads it by name
                      rather than by column number — inserting Pipeline in front
                      of it broke three assertions that counted cells. */}
                  <span data-slot="figure-pace" dir="ltr" className="num">
                    {member.pace.elapsed} / {member.pace.total}
                  </span>
                </TableCell>
                <Count value={member.openQuotations} />
                <Count value={member.overdueFollowUps} />
                <Count value={member.neverContacted} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function Count({ value }: { value: number }) {
  return (
    <TableCell className="p-3 text-end">
      <span dir="ltr" className="num">
        {value}
      </span>
    </TableCell>
  );
}

/**
 * Not at work today, under his name (D75).
 *
 * Under the name and not in a column of its own: it is true of the person
 * rather than of his month, and every other cell on the row is a figure. It
 * says when he is back, which is the only part of it a manager acts on — the
 * work due on his floor while he is out is listed under What is stuck.
 */
async function AwayLine({ backOn }: { backOn: Day }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return (
    <span className={cn("block text-xs", TONE_TEXT.wait)}>
      {t("team.backOn", { day: formatDay(backOn, locale) })}
    </span>
  );
}

function Habit({ label, value }: { label: string; value: number }) {
  return (
    <span>
      {label}{" "}
      <span dir="ltr" className="num text-foreground">
        {value}
      </span>
    </span>
  );
}
