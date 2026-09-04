import { getTranslations } from "next-intl/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { formatSqmWhole } from "@/lib/money";
import type { TeamMember } from "@/lib/team";

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

  return (
    <>
      <div className="flex flex-col gap-2 md:hidden">
        {members.map((member) => (
          <Link
            key={member.userId}
            href={`/companies?rep=${member.userId}`}
            className="card-face flex flex-col gap-2 p-3"
          >
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{member.name}</span>
              <span className="text-sm">
                <span dir="ltr" className="num">
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
                {t("team.pace")}{" "}
                <span dir="ltr" className="num text-foreground">
                  {member.pace.elapsed} / {member.pace.total}
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
                <TableCell className="p-0">
                  <Link href={`/companies?rep=${member.userId}`} className="block p-3 font-medium">
                    {member.name}
                  </Link>
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
                  <span dir="ltr" className="num">
                    {formatSqmWhole(member.achieved)}
                  </span>
                </TableCell>
                <TableCell className="p-3 text-end whitespace-nowrap">
                  {/* His own working days, so leave shortens his month (S48). */}
                  <span dir="ltr" className="num">
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
