import { getLocale, getTranslations } from "next-intl/server";
import { MonthCard } from "@/components/team/month-card";
import { StuckList } from "@/components/team/stuck-list";
import { TeamTable } from "@/components/team/team-table";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser, seesAll } from "@/lib/authz";
import { stuckList, teamMonth } from "@/lib/team";

/**
 * The manager's home (SPEC §3, D15): the company's month, everybody's month
 * under it, and what is stuck.
 *
 * In that order because that is the order the questions come in. How are we
 * doing; who is doing it; what has stopped moving. Nothing on this screen is
 * typed by anybody — every figure is derived from what reps and the coordinator
 * did in the course of their own work, which is the whole of S27: the history
 * of a company IS the manager's daily report, and there is no report to write.
 *
 * The admin sees the same screen (D15); his extra powers are the Admin menu.
 */
export default async function TeamPage() {
  const [user, locale] = await Promise.all([requireUser(), getLocale()]);
  // Managers and admins only. A rep who follows a link here goes to his own
  // home rather than to an error page: it is not his screen, and there is
  // nothing here for him to be told off about (S8).
  if (!seesAll(user)) redirect({ href: homeFor(user.role), locale });

  const [t, month, stuck] = await Promise.all([getTranslations(), teamMonth(), stuckList()]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("shell.team")}</h1>

      <MonthCard
        title={t("team.companyMonth")}
        target={month.company.target}
        achieved={month.company.achieved}
        pace={month.pace}
      />

      {month.members.length === 0 ? (
        <p className="card-face px-6 py-10 text-center text-sm text-muted-foreground">
          {t("shell.emptyTeam")}
        </p>
      ) : (
        <TeamTable members={month.members} />
      )}

      <StuckList stuck={stuck} />
    </div>
  );
}
