import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { MonthCard } from "@/components/team/month-card";
import { ChainCard } from "@/components/team/chain-card";
import { LossCard } from "@/components/team/loss-card";
import { MonthsCard } from "@/components/team/months-card";
import { StuckList } from "@/components/team/stuck-list";
import { Sqm } from "@/components/ui-ext/figures";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { PageTabs } from "@/components/ui-ext/page-tabs";
import { TeamTable } from "@/components/team/team-table";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser, seesAll } from "@/lib/authz";
import {
  STUCK_FOLLOW_UP_WORKING_DAYS,
  STUCK_REQUEST_WORKING_DAYS,
  stuckList,
  teamMonth,
} from "@/lib/team";
import { NEVER_CONTACTED_DAYS } from "@/lib/followups";
import { chainCohort } from "@/lib/chain";
import { lossCohort } from "@/lib/losses";
import { monthsBack } from "@/lib/months";
import { tabCookie, tabFor, type Tab } from "@/lib/tabs";

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
const TABS: Tab[] = ["work", "metrics", "team"];

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [user, locale, params, jar] = await Promise.all([
    requireUser(),
    getLocale(),
    searchParams,
    cookies(),
  ]);
  // Managers and admins only. A rep who follows a link here goes to his own
  // home rather than to an error page: it is not his screen, and there is
  // nothing here for him to be told off about (S8).
  if (!seesAll(user)) redirect({ href: homeFor(user.role), locale });

  // Three questions, three tabs, and this screen is the only one with a third
  // (D151): what has stopped and needs him today; what the month and the
  // quarter measure; and the people, which is the manager's own question and
  // nobody else's. Each asks only for what it draws.
  const tab = tabFor(params.tab, jar.get(tabCookie("team"))?.value, TABS);

  const [t, month, stuck, months, cohort, losses] = await Promise.all([
    getTranslations(),
    // Every tab needs it: the work tab for the pipeline figure at the head of
    // its strip, the metrics tab for the month, the team tab for the members.
    teamMonth(),
    tab === "work" ? stuckList() : null,
    tab === "metrics" ? monthsBack(null) : null,
    tab === "metrics" ? chainCohort(null) : null,
    tab === "metrics" ? lossCohort(null) : null,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">{t("shell.team")}</h1>
        <PageTabs
          screen="team"
          tab={tab}
          tabs={TABS.map((value) => ({ value, href: `/team?tab=${value}` }))}
        />
      </header>

      {tab === "work" && stuck && month ? (
        <>
          {/* What is still out there to move (S45), and what has stopped moving
              (D14) — one strip, one glance, every figure after the first a door
              into the list it counts (D117). The five stay together: the tabs
              were drawn to get a six-bar chart off the top of the working
              screen (D151), and splitting a strip that is one line tall would be
              obeying that rule past the point where it helps anybody.

              Each carries its threshold in words (D59), and the middle one is why:
              "Follow-ups overdue" here counted the ones more than three days past,
              while the column of nearly the same name in the table below counted
              every overdue one. Two numbers, side by side, a letter apart in the
              reading. The names differ now and the captions say which is which. */}
          <StandingStrip
            items={[
              {
                label: t("team.pipeline"),
                // Whole: a sum of estimates, beside a table of whole metres.
                value: <Sqm value={month.pipeline} whole />,
                caption: t("team.pipelineMeans"),
              },
              {
                label: t("team.stuckRequests"),
                value: (
                  <span dir="ltr" className="num">
                    {stuck.requests.total}
                  </span>
                ),
                caption: t("team.stuckRequestsMeans", { days: STUCK_REQUEST_WORKING_DAYS }),
                tone: stuck.requests.total > 0 ? "bad" : null,
              },
              {
                label: t("team.stuckFollowUps"),
                value: (
                  <span dir="ltr" className="num">
                    {stuck.followUps.total}
                  </span>
                ),
                caption: t("team.stuckFollowUpsMeans", { days: STUCK_FOLLOW_UP_WORKING_DAYS }),
                tone: stuck.followUps.total > 0 ? "bad" : null,
              },
              {
                label: t("team.stuckNever"),
                value: (
                  <span dir="ltr" className="num">
                    {stuck.neverContacted.total}
                  </span>
                ),
                caption: t("team.stuckNeverMeans", { days: NEVER_CONTACTED_DAYS }),
                tone: stuck.neverContacted.total > 0 ? "open" : null,
              },
              // The fourth figure, and on a real floor the largest (D63): the walk
              // at volume found 249 gone quiet against 38 requests waiting, listed
              // below with no figure above (P10d). Same tone as never contacted —
              // nobody is waiting on a call today, and it is how customers are lost.
              {
                label: t("team.stuckQuiet"),
                value: (
                  <span dir="ltr" className="num">
                    {stuck.goneQuiet.total}
                  </span>
                ),
                caption: t("common.quietMeans", { days: NEVER_CONTACTED_DAYS }),
                tone: stuck.goneQuiet.total > 0 ? "open" : null,
              },
            ]}
          />

          <StuckList stuck={stuck} />
        </>
      ) : null}

      {tab === "metrics" ? (
        <>
          <MonthCard
            title={t("team.companyMonth")}
            target={month.company.target}
            achieved={month.company.achieved}
            pace={month.pace}
          />

          {/* And the months behind it. "3,524 against 4,500" is a fact with nothing
              to be measured against; the question a manager asks in the second week
              is whether the company is going up or down (D61). */}
          {months ? <MonthsCard months={months} /> : null}

          {/* What is stuck is on the working tab, one row at a time; this is the
              same chain read as a population — of everything raised in a quarter,
              where did each one end up (D62). One is a list to work through today,
              the other is a number to think about, and that is exactly the line
              the tabs are drawn on (D151). */}
          {cohort ? <ChainCard cohort={cohort} /> : null}

          {/* The other half of the same question, over the same quarter: the chain
              says what became of the paper, this says what became of the work
              (D140). */}
          {losses ? <LossCard cohort={losses} /> : null}
        </>
      ) : null}

      {tab === "team" && month ? (
        month.members.length === 0 ? (
          <p className="card-face px-6 py-10 text-center text-sm text-muted-foreground">
            {t("shell.emptyTeam")}
          </p>
        ) : (
          <TeamTable members={month.members} />
        )
      ) : null}
    </div>
  );
}
