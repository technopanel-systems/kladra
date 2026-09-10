import { getLocale, getTranslations } from "next-intl/server";
import { MonthCard } from "@/components/team/month-card";
import { ChainCard } from "@/components/team/chain-card";
import { LossCard } from "@/components/team/loss-card";
import { MonthsCard } from "@/components/team/months-card";
import { RatiosCard } from "@/components/team/ratios-card";
import { RepPicker } from "@/components/team/rep-picker";
import { SegmentCard } from "@/components/team/segment-card";
import { StuckList } from "@/components/team/stuck-list";
import { Sqm } from "@/components/ui-ext/figures";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { PageTabs } from "@/components/ui-ext/page-tabs";
import { RangeChips } from "@/components/ui-ext/range-chips";
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
import { chainRatios, metresBySegment } from "@/lib/metrics";
import { monthsBack } from "@/lib/months";
import { RANGES, RANGE_SCREEN, rangeFor, rangeStart } from "@/lib/ranges";
import { chosen, rememberedChoices } from "@/lib/screen-choice";
import { tabFor, type Tab } from "@/lib/tabs";

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
  searchParams: Promise<{ tab?: string; range?: string; rep?: string }>;
}) {
  const [user, locale, params] = await Promise.all([requireUser(), getLocale(), searchParams]);
  // Managers and admins only. A rep who follows a link here goes to his own
  // home rather than to an error page: it is not his screen, and there is
  // nothing here for him to be told off about (S8).
  if (!seesAll(user)) redirect({ href: homeFor(user.role), locale });

  // Three questions, three tabs, and this screen is the only one with a third
  // (D151): what has stopped and needs him today; what the month and the
  // quarter measure; and the people, which is the manager's own question and
  // nobody else's. Each asks only for what it draws.
  // Both of his choices in one read, after the redirect above: a rep who is not
  // allowed on this screen is not asked what he last looked at (D164).
  const remembered = await rememberedChoices(user.id);
  const storedTab = chosen(remembered, "tab", "team");
  const tab = tabFor(params.tab, storedTab, TABS);

  /*
   * The window, and whose figures — both belong to the metrics tab and both
   * scope ALL of it (D152, D154). The window is remembered against that tab,
   * like the tab itself and for the same person; the rep in the picker is not,
   * because "whose floor am I reading" is a question asked once and answered by
   * going back, and a manager who opened his own screen to find last week's rep
   * still selected would be reading somebody else's month as if it were the
   * company's.
   */
  const storedRange = chosen(remembered, "range", RANGE_SCREEN);
  const range = rangeFor(params.range, storedRange);
  const from = rangeStart(range);
  const repId = params.rep?.trim() || null;

  const [t, month, stuck, months, cohort, losses, segments, ratios] = await Promise.all([
    getTranslations(),
    // Every tab needs it: the work tab for the pipeline figure at the head of
    // its strip, the metrics tab for the month, the team tab for the members.
    teamMonth(),
    tab === "work" ? stuckList() : null,
    tab === "metrics" ? monthsBack(repId) : null,
    tab === "metrics" ? chainCohort(repId, from) : null,
    tab === "metrics" ? lossCohort(repId, from) : null,
    tab === "metrics" ? metresBySegment(from, repId) : null,
    tab === "metrics" ? chainRatios(from, repId) : null,
  ]);

  // The address of a metrics tab is the window and the person together, so a
  // chip keeps the rep and the picker keeps the window: changing one of two
  // choices must never quietly reset the other.
  const metricsHref = (next: { range?: string; rep?: string | null }) => {
    const rep = next.rep === undefined ? repId : next.rep;
    return `/team?tab=metrics&range=${next.range ?? range}${rep ? `&rep=${rep}` : ""}`;
  };

  // Whose month is on the card: the company's, or the one rep being read.
  const viewed = repId ? (month.members.find((member) => member.userId === repId) ?? null) : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">{t("shell.team")}</h1>
        <PageTabs
          screen="team"
          tab={tab}
          remembered={storedTab}
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
          {/* Whose, first: the picker changes every figure under it, so it sits
              above them all rather than beside the one it looks like it belongs
              to. */}
          {month.members.length > 0 ? (
            <RepPicker
              value={repId ?? ""}
              options={[
                { value: "", label: t("team.everybody") },
                ...month.members.map((member) => ({ value: member.userId, label: member.name })),
              ]}
              hrefs={Object.fromEntries([
                ["", metricsHref({ rep: null })],
                ...month.members.map((member) => [member.userId, metricsHref({ rep: member.userId })]),
              ])}
            />
          ) : null}

          {/* The month against its target, and the six months behind it. Neither
              is windowed and neither can be: a target is set per month (S43) and
              the trend is the six months by definition (D61). They sit ABOVE the
              window chips so that what the chips govern is exactly what is under
              them (D154). */}
          <MonthCard
            title={viewed ? viewed.name : t("team.companyMonth")}
            target={viewed ? viewed.target : month.company.target}
            achieved={viewed ? viewed.achieved : month.company.achieved}
            // His own working month, not the office's: a rep back from two
            // weeks off has a shorter month and does not read as behind (S48).
            pace={viewed ? viewed.pace : month.pace}
          />

          {/* And the months behind it. "3,524 against 4,500" is a fact with nothing
              to be measured against; the question a manager asks in the second week
              is whether the company is going up or down (D61). */}
          {months ? <MonthsCard months={months} /> : null}

          <RangeChips
            range={range}
            remembered={storedRange}
            chips={RANGES.map((value) => ({ value, href: metricsHref({ range: value }) }))}
          />

          {/* Everything below the chips is measured over the window they name,
              and every card says which window that was in its own words — a
              figure whose span a reader has to remember is a figure he will read
              wrong (D59). */}
          {/* `items-start`: a card ends where its content ends. Stretched to the
              row's height, the short one — two rows of ratios beside a six-row
              funnel — drew a card with a block of nothing inside it, which reads
              as a card that failed to load rather than as a short answer. */}
          <div className="grid items-start gap-4 md:grid-cols-2">
            {/* Paired by length as well as by sense, and the two agree here.
                Where the metres went and where the quotations went are both
                "what happened to what we did", and both are long — nine
                segments beside six endings. How much converts and what we lost
                it to are both "how much of it worked", and both are short. The
                first arrangement put a two-row card beside a nine-row one and
                left three hundred pixels of nothing under it, which reads as a
                card that failed to load. */}
            {segments ? <SegmentCard rows={segments} /> : null}

            {/* What is stuck is on the working tab, one row at a time; this is the
                same chain read as a population — of everything raised in the
                window, where did each one end up (D62). One is a list to work
                through today, the other is a number to think about, and that is
                exactly the line the tabs are drawn on (D151). */}
            {cohort ? <ChainCard cohort={cohort} /> : null}

            {ratios ? <RatiosCard ratios={ratios} /> : null}

            {/* The other half of the same question, over the same window: the chain
                says what became of the paper, this says what became of the work
                (D140). */}
            {losses ? <LossCard cohort={losses} /> : null}
          </div>
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
