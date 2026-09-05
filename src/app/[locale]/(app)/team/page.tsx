import { getLocale, getTranslations } from "next-intl/server";
import { MonthCard } from "@/components/team/month-card";
import { ChainCard } from "@/components/team/chain-card";
import { MonthsCard } from "@/components/team/months-card";
import { StuckList } from "@/components/team/stuck-list";
import { Sqm } from "@/components/ui-ext/figures";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { TeamTable } from "@/components/team/team-table";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser, seesAll } from "@/lib/authz";
import {
  STUCK_FOLLOW_UP_DAYS,
  STUCK_REQUEST_WORKING_DAYS,
  stuckList,
  teamMonth,
} from "@/lib/team";
import { NEVER_CONTACTED_DAYS } from "@/lib/followups";
import { chainCohort } from "@/lib/chain";
import { monthsBack } from "@/lib/months";

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

  const [t, month, stuck, months, cohort] = await Promise.all([
    getTranslations(),
    teamMonth(),
    stuckList(),
    monthsBack(null),
    chainCohort(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("shell.team")}</h1>

      <MonthCard
        title={t("team.companyMonth")}
        target={month.company.target}
        achieved={month.company.achieved}
        pace={month.pace}
      />

      {/* And the months behind it. "3,524 against 4,500" is a fact with nothing
          to be measured against; the question a manager asks in the second week
          is whether the company is going up or down (D61). */}
      <MonthsCard months={months} />

      {/* What the month has already moved is above; this is what is still out
          there to move (S45), and how much of it has stopped (D14). Both are
          derived, like everything else on this screen — nobody types them.

          Each carries its threshold in words (D59), and the middle one is why:
          "Follow-ups overdue" here counted the ones more than three days past,
          while the column of nearly the same name in the table below counted
          every overdue one. Two numbers, side by side, a letter apart in the
          reading. The names differ now and the captions say which is which. */}
      <StandingStrip
        items={[
          {
            label: t("team.pipeline"),
            value: <Sqm value={month.pipeline} />,
            caption: t("team.pipelineMeans"),
          },
          {
            label: t("team.stuckRequests"),
            value: (
              <span dir="ltr" className="num">
                {stuck.requests.length}
              </span>
            ),
            caption: t("team.stuckRequestsMeans", { days: STUCK_REQUEST_WORKING_DAYS }),
            tone: stuck.requests.length > 0 ? "bad" : null,
          },
          {
            label: t("team.stuckFollowUps"),
            value: (
              <span dir="ltr" className="num">
                {stuck.followUps.length}
              </span>
            ),
            caption: t("team.stuckFollowUpsMeans", { days: STUCK_FOLLOW_UP_DAYS }),
            tone: stuck.followUps.length > 0 ? "bad" : null,
          },
          {
            label: t("team.stuckNever"),
            value: (
              <span dir="ltr" className="num">
                {stuck.neverContacted.length}
              </span>
            ),
            caption: t("team.stuckNeverMeans", { days: NEVER_CONTACTED_DAYS }),
            tone: stuck.neverContacted.length > 0 ? "open" : null,
          },
        ]}
      />

      {month.members.length === 0 ? (
        <p className="card-face px-6 py-10 text-center text-sm text-muted-foreground">
          {t("shell.emptyTeam")}
        </p>
      ) : (
        <TeamTable members={month.members} />
      )}

      {/* What is stuck is above, one row at a time; this is the same chain read
          as a population — of everything raised in a quarter, where did each one
          end up (D62). One is a list to work through today, the other is a
          number to think about. */}
      <ChainCard cohort={cohort} />

      <StuckList stuck={stuck} />
    </div>
  );
}
