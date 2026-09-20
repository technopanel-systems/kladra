import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { MonthCard } from "@/components/team/month-card";
import { ChainCard } from "@/components/team/chain-card";
import { LossCard } from "@/components/team/loss-card";
import { RelianceCard } from "@/components/team/reliance-card";
import { MonthsCard } from "@/components/team/months-card";
import { RatiosCard } from "@/components/team/ratios-card";
import { RepPicker } from "@/components/team/rep-picker";
import { SegmentCard } from "@/components/team/segment-card";
import { StuckList } from "@/components/team/stuck-list";
import { WorkGrid, splitByLength } from "@/components/team/work-grid";
import {
  MetricsBodySkeleton,
  PeopleBodySkeleton,
  WorkBodySkeleton,
} from "@/components/team/work-skeleton";
import { Sqm } from "@/components/ui-ext/figures";
import { StandingStrip } from "@/components/ui-ext/standing-strip";
import { PageTabs } from "@/components/ui-ext/page-tabs";
import { RangeChips } from "@/components/ui-ext/range-chips";
import { TeamTable } from "@/components/team/team-table";
import { Empty } from "@/components/ui-ext/empty";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser, seesAll } from "@/lib/authz";
import {
  STUCK_FOLLOW_UP_WORKING_DAYS,
  STUCK_REQUEST_WORKING_DAYS,
  stuckByPerson,
  stuckList,
  teamMonth,
} from "@/lib/team";
import { NEVER_CONTACTED_DAYS } from "@/lib/followups";
import { BuilderCard } from "@/components/metrics/builder-card";
import { answer } from "@/lib/builder";
import { parseQuestion, questionQuery, type Question } from "@/lib/builder-choice";
import { chainCohort } from "@/lib/chain";
import { lossCohort } from "@/lib/losses";
import { chainRatios, metresBySegment } from "@/lib/metrics";
import { monthsBack } from "@/lib/months";
import { RANGES, RANGE_SCREEN, rangeFor, rangeStart, type Range } from "@/lib/ranges";
import { chosen, rememberedChoices } from "@/lib/screen-choice";
import { tabFor, type Tab } from "@/lib/tabs";
import type { SessionUser } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The manager's home (SPEC §3, D15): the company's month, everybody's month
 * under it, and what is stuck.
 *
 * In that order because that is the order the questions come in. How are we
 * doing; who is doing it; what has stopped moving. The company's month opens
 * the first tab since SPEC §3 P13 — "always visible, above the three sections
 * that exist now" — and left Metrics to do it. Nothing on this screen is
 * typed by anybody — every figure is derived from what reps and the coordinator
 * did in the course of their own work, which is the whole of S27: the history
 * of a company IS the manager's daily report, and there is no report to write.
 *
 * The admin sees the same screen (D15); his extra powers are the Admin menu.
 *
 * **The title and the tabs draw first** (S12.7), and each tab's body streams
 * under them, standing in with its own shape — the metrics tab's six columns,
 * chips and pies; the team tab's rows of people — keyed on the tab, as the day
 * is. A chip, the picker or a builder choice keeps the figures in place under
 * its own pending mark: it changes figures, not the tab's shape.
 */
const TABS: Tab[] = ["work", "metrics", "team"];

type Search = {
  tab?: string;
  range?: string;
  rep?: string;
  m?: string;
  by?: string;
  p?: string;
};

export default async function TeamPage({ searchParams }: { searchParams: Promise<Search> }) {
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
  const [t, remembered] = await Promise.all([getTranslations(), rememberedChoices(user.id)]);
  const storedTab = chosen(remembered, "tab", "team");
  const tab = tabFor(params.tab, storedTab, TABS);

  return (
    <div className="flex flex-col gap-6">
      <header className={cn("flex flex-col gap-3", tab === "metrics" && "print:hidden")}>
        <h1 className="text-xl font-semibold">{t("shell.team")}</h1>
        <PageTabs
          screen="team"
          tab={tab}
          remembered={storedTab}
          tabs={TABS.map((value) => ({ value, href: `/team?tab=${value}` }))}
        />
      </header>

      {/* No box of its own: the tab's cards are the page column's children, so
          the month card sits straight under the tabs (tests/work-tabs.spec.ts). */}
      <Suspense
        key={tab}
        fallback={
          tab === "work" ? (
            <WorkBodySkeleton strip />
          ) : tab === "metrics" ? (
            <MetricsBodySkeleton picker cards={5} builder />
          ) : (
            <PeopleBodySkeleton />
          )
        }
      >
        {tab === "work" ? (
          <TeamWork />
        ) : tab === "metrics" ? (
          <TeamMetrics
            user={user}
            params={params}
            storedRange={chosen(remembered, "range", RANGE_SCREEN)}
          />
        ) : (
          <TeamPeople />
        )}
      </Suspense>
    </div>
  );
}

/** What has stopped and needs him today. */
async function TeamWork() {
  const [t, month, stuck] = await Promise.all([getTranslations(), teamMonth(), stuckList()]);

  return (
    <>
      {/* The company's month, first and always (SPEC §3 P13): target,
          achieved, pace and the one bar, above everything that can be
          acted on today. It is the frame the day is worked against, which
          is why it moved here from Metrics rather than being copied. A
          month with no target says so and draws no bar (D41, S45). No month
          to move to: this month is the only one a target is for (D180). */}
      <MonthCard
        title={t("team.companyMonth")}
        target={month.company.target}
        achieved={month.company.achieved}
        pace={month.pace}
      />

      {/* What is still out there to move (S45), and what has stopped moving
          (D14) — one strip, one glance. The five stay together: the tabs were
          drawn to get a six-bar chart off the top of the working screen (D151),
          and splitting a strip that is one line tall would be obeying that
          rule past the point where it helps anybody.

          Each carries its threshold in words (D59), and the middle one is why:
          "Follow-ups overdue" here counted the ones more than three days past,
          while the column of nearly the same name in the table below counted
          every overdue one. The names differ now and the captions say which.

          **A figure is coloured only when it is late** (restyle, S12.7). The two
          figures past a line a PERSON crossed — a request on the desk, a call
          promised — are red when there is one. The pipeline, never contacted
          and gone quiet are information: a sum of estimates, and two measures
          of a customer's silence counted in calendar days, which carry no
          blame (D141). They were blue, a colour on a figure that was not late;
          their cards below carry that tone as a dot. A nought is never
          coloured: nothing is past anything. */}
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
            /* What is on her desk, and how much of it is late — the same
               sentence her own screen carries under the same figure (P14, 14B).
               The count is red only for the late part: the figure itself is
               this morning's work, and a red number on every morning with a
               request in it is a colour that has stopped meaning anything. */
            caption: t("team.stuckRequestsMeans", {
              days: STUCK_REQUEST_WORKING_DAYS,
              late: stuck.lateRequests,
            }),
            tone: stuck.lateRequests > 0 ? "bad" : null,
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
          },
          // The fourth figure, and on a real floor the largest (D63): the walk
          // at volume found 249 gone quiet against 38 requests waiting, listed
          // below with no figure above (P10d).
          {
            label: t("team.stuckQuiet"),
            value: (
              <span dir="ltr" className="num">
                {stuck.goneQuiet.total}
              </span>
            ),
            caption: t("common.quietMeans", { days: NEVER_CONTACTED_DAYS }),
          },
        ]}
      />

      <StuckList stuck={stuck} />
    </>
  );
}

/** What the month and the window measure, for the whole floor or one person. */
async function TeamMetrics({
  user,
  params,
  storedRange,
}: {
  user: SessionUser;
  params: Search;
  storedRange: string | undefined;
}) {
  const locale = await getLocale();

  /*
   * The window, and whose figures — both belong to the metrics tab and both
   * scope ALL of it (D152, D154). The window is remembered against that tab,
   * like the tab itself and for the same person; the rep in the picker is not,
   * because "whose floor am I reading" is a question asked once and answered by
   * going back, and a manager who opened his own screen to find last week's rep
   * still selected would be reading somebody else's month as if it were the
   * company's.
   */
  const range: Range = rangeFor(params.range, storedRange);
  const from = rangeStart(range);
  const repId = params.rep?.trim() || null;

  // The builder's question (SPEC §3 P13): what, by what, over when — and whose,
  // which is the picker above everything on the tab. Nothing chosen opens on
  // the metres by person over the window the chips already name.
  const question = parseQuestion(params, range);
  const asked = params.m !== undefined || params.by !== undefined || params.p !== undefined;

  const [t, month, months, cohort, losses, segments, ratios, answered] = await Promise.all([
    getTranslations(),
    // For the rep picker: everybody who carries a month.
    teamMonth(),
    monthsBack(repId),
    chainCohort(repId, from),
    lossCohort(repId, from),
    metresBySegment(from, repId),
    chainRatios(from, repId),
    answer(user, question, locale),
  ]);

  // The address of a metrics tab is the window, the person and the builder's
  // question together, so a chip keeps the rep and the question, and the picker
  // keeps the window: changing one choice must never quietly reset another.
  const metricsHref = (next: { range?: string; rep?: string | null }) => {
    const rep = next.rep === undefined ? repId : next.rep;
    const kept = asked ? `&${questionQuery({ ...question, repId: null })}` : "";
    return `/team?tab=metrics&range=${next.range ?? range}${rep ? `&rep=${rep}` : ""}${kept}`;
  };
  // A builder chip changes the question and keeps the rest, and lands back on
  // the builder rather than on the top of a long tab.
  const builderHref = (next: Question) =>
    `/team?tab=metrics&range=${range}&${questionQuery({ ...next, repId })}#builder`;

  // Each card with its height about as a desk draws it, in pixels: its head,
  // and its drawing or the rows its legend lists. A card that says it has
  // nothing is one sentence tall. The split between the stacks weighs these.
  const SENTENCE_CARD = 90;
  const PIE = 184;
  const cardsWithLength = [
    {
      length: segments.length === 0 ? SENTENCE_CARD : 120 + Math.max(PIE, Math.min(segments.length, 6) * 32),
      card: <SegmentCard key="segments" rows={segments} from={from} personId={repId} />,
    },
    // What is stuck is on the working tab, one row at a time; this is the same
    // chain read as a population — of everything raised in the window, where
    // did each one end up (D62).
    {
      length: cohort.raised === 0 ? SENTENCE_CARD : 130 + 6 * 36,
      card: <ChainCard key="chain" cohort={cohort} personId={repId} />,
    },
    {
      length: ratios.projects === 0 && ratios.quotations === 0 ? SENTENCE_CARD : 210,
      card: <RatiosCard key="ratios" ratios={ratios} from={from} personId={repId} />,
    },
    // The other half of the same question, over the same window: the chain says
    // what became of the paper, this says what became of the work (D140).
    {
      length: losses.projects === 0 ? SENTENCE_CARD : 90 + Math.max(PIE, losses.rows.length * 52),
      card: <LossCard key="losses" cohort={losses} />,
    },
    // Who leans on the coordinator, over the same window (SPEC §3 P13, D191). A
    // card about everybody, so it stands only while the tab reads everybody:
    // with one rep picked, every card is his (D154).
    ...(repId
      ? []
      : [
          {
            length: 120 + month.members.length * 44,
            card: <RelianceCard key="reliance" from={from} />,
          },
        ]),
  ];
  const metricsSplit = splitByLength(cardsWithLength.map((entry) => entry.length));
  const metricsCards = cardsWithLength.map((entry) => entry.card);

  return (
    <>
      {/* Printed, the tab is the builder's page and nothing else: the cards
          above it are for reading on the screen, and the builder's table is the
          thing a manager takes into a meeting (SPEC §3 P13). */}
      <div className="flex flex-col gap-6 print:hidden">
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

        {/* The six months behind this one, above the chips because the trend
            is the six months by definition and cannot be windowed (D61, D154).
            This month's own card is not here any more, the company's or a
            picked rep's: the company's opens the work tab (SPEC §3 P13), and
            one rep's is on his floor, one press from his team row, where
            `/companies?rep=` has carried it since P11. */}
        <MonthsCard months={months} personId={repId} />

        <RangeChips
          range={range}
          remembered={storedRange}
          chips={RANGES.map((value) => ({ value, href: metricsHref({ range: value }) }))}
        />

        {/* Everything below the chips is measured over the window they name,
            and every card says which window that was in its own words — a
            figure whose span a reader has to remember is a figure he will read
            wrong (D59).

            Two stacks, as the work tabs (S12.7): five cards in a grid of two
            left "Relying on the coordinator" alone on its row over half a desk
            of nothing, and the rings standing short beside the reasons. The
            cards keep their order — where the metres went and where the
            quotations went, then how much of it worked and what we lost, then
            who leans on the desk — and split where the stacks come out nearest
            in length. */}
        <WorkGrid start={metricsCards.slice(0, metricsSplit)} end={metricsCards.slice(metricsSplit)} />
      </div>

      {/* The manager's own question, last: the cards above answer the ones
          every month asks, and this answers the one this month asks. It
          carries its own window, because "this month against last" is not
          one of the chips' three, and it says which it is reading in words. */}
      <BuilderCard
        answer={answered}
        whose={
          repId
            ? (month.members.find((member) => member.userId === repId)?.name ?? t("team.everybody"))
            : t("team.everybody")
        }
        hrefFor={builderHref}
      />
    </>
  );
}

/** The people: the manager's own question, and nobody else's. */
async function TeamPeople() {
  const [t, month, stuckPeople] = await Promise.all([
    getTranslations(),
    teamMonth(),
    // The red dot on a team row counts the stuck list's own rows per person.
    stuckByPerson(),
  ]);

  if (month.members.length === 0) return <Empty>{t("shell.emptyTeam")}</Empty>;

  return (
    <section className="flex flex-col gap-3">
      {/* What the red word counts, once, above the rows that carry it: a
          figure says what it means in words (D59), and "stuck" is the one
          word on the row whose line is drawn on the other tab. */}
      <p className="text-xs text-muted-foreground">
        {t("team.stuckOnRowMeans", {
          work: t("common.tab.work"),
          requests: t("team.stuckRequests"),
          followUps: t("team.stuckFollowUps"),
          leads: t("team.stuckLeads"),
          days: STUCK_REQUEST_WORKING_DAYS,
        })}
      </p>
      <TeamTable members={month.members} stuck={stuckPeople} />
    </section>
  );
}
