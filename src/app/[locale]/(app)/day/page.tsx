import { getLocale, getTranslations } from "next-intl/server";
import { CallList } from "@/components/day/call-list";
import { MonthCard } from "@/components/team/month-card";
import { MonthsCard } from "@/components/team/months-card";
import { RatiosCard } from "@/components/team/ratios-card";
import { SegmentCard } from "@/components/team/segment-card";
import { WaitingList } from "@/components/day/waiting-list";
import { WorkGrid } from "@/components/team/work-grid";
import { PageTabs } from "@/components/ui-ext/page-tabs";
import { RangeChips } from "@/components/ui-ext/range-chips";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser } from "@/lib/authz";
import { carriesMetres, ownsCompanies, sells } from "@/lib/floor";
import { listCompanies } from "@/lib/companies";
import { BAND_LIMIT } from "@/lib/list-size";
import { formatDay, todayRiyadh } from "@/lib/dates";
import { awayOn } from "@/lib/leave";
import { followUpCounts } from "@/lib/followups";
import { waitingCounts, waitingOnRep } from "@/lib/day";
import { chainRatios, metresBySegment } from "@/lib/metrics";
import { monthsBack } from "@/lib/months";
import { RANGES, RANGE_SCREEN, rangeFor, rangeStart } from "@/lib/ranges";
import { repMonth } from "@/lib/team";
import { chosen, rememberedChoices } from "@/lib/screen-choice";
import { tabFor, type Tab } from "@/lib/tabs";

/**
 * A rep's day — his home from P8 (SPEC §3, DESIGN §6).
 *
 * It answers one question, in the order the work should be done: how the month
 * is going, what has come back to him and is stopped, and who is owed a call.
 * The month comes first and across the page (SPEC §3 P13); what can be done
 * today follows as cards in the one grid a work tab uses (DESIGN §1b), so on a
 * desk the waiting work and the calls share rows and on a phone they stack in
 * that same order. Every card on it is something Faisal can act on before
 * lunch; anything he cannot act on today belongs on the metrics tab or the
 * manager's screen instead.
 *
 * Nothing here computes its own totals. The month is `repMonth`, the same one
 * the team table reads, and the three bands are `listCompanies` with the three
 * follow-up filters — so pressing "2 overdue" on any other screen cannot show a
 * different two (rules/data.md).
 */
export default async function DayPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; range?: string }>;
}) {
  const [user, locale, params] = await Promise.all([requireUser(), getLocale(), searchParams]);
  // The roles that own companies — a rep, marketing, and the coordinator since
  // SPEC §3. The manager reads the team screen for the same question, so he
  // follows a link here to his own home rather than to an empty screen (S8).
  if (!ownsCompanies(user.role)) redirect({ href: homeFor(user.role), locale });

  // Whoever carries a target gets the month card, and whoever raises papers the
  // waiting band. Since SPEC §3 P13 marketing is a rep in everything (D168), so
  // every role that owns companies has both today; the two questions stay
  // separate because they are two sentences in floor.ts, and a role that one
  // day holds customers without a number must not be shown a figure that says
  // the wrong thing every month (D44).
  const hasMonth = carriesMetres(user.role);
  const hasChain = sells(user.role);

  // Two tabs here: what he can do something about today, and what is measured
  // over a window (D151). A role with no month would have nothing to measure,
  // and would get no second tab rather than an empty one.
  const TABS: Tab[] = hasMonth ? ["work", "metrics"] : ["work"];

  // Both of his choices in one read, after the redirect above: a rep who is not
  // allowed on this screen is not asked what he last looked at (D164).
  const remembered = await rememberedChoices(user.id);
  const storedTab = chosen(remembered, "tab", "day");
  const tab = tabFor(params.tab, storedTab, TABS);
  const working = tab === "work";

  // The window every figure on the metrics tab is measured over — the same
  // three the manager's screen offers, remembered against the same tab, because
  // it is the same question asked by two people (D152).
  const storedRange = chosen(remembered, "range", RANGE_SCREEN);
  const range = rangeFor(params.range, storedRange);
  const from = rangeStart(range);

  // Each band asks for what it will draw and the counts come from the one
  // follow-up definition, so a band that is longer than the screen says how
  // many there are rather than printing all of them (D80).
  const band = (filter: "overdue" | "today" | "never" | "quiet") =>
    listCompanies({ user, filter, locale, limit: BAND_LIMIT });

  // Each tab asks only for what it draws. The work tab was running the
  // six-month read and the metrics tab would run four band queries, and neither
  // of them puts a pixel on the screen it is not on.
  const none: Awaited<ReturnType<typeof band>> = [];
  const measuring = hasMonth && !working;
  const [t, month, months, segments, ratios, waiting, overdue, today, never, quiet, counts, away] =
    await Promise.all([
      getTranslations(),
      hasMonth && working ? repMonth(user.id) : null,
      // Only where there is a target to read them against: six bars with no
      // line on any of them would say nothing (D44).
      measuring ? monthsBack(user.id) : null,
      // His own metres and his own chain, over the window he picked. The same
      // two cards the manager reads about the whole floor: one set of facts,
      // one layout, so a rep recognises his own figures where he meets them
      // again (D152).
      measuring ? metresBySegment(from, user.id) : null,
      measuring ? chainRatios(from, user.id) : null,
      hasChain && working ? waitingOnRep(user.id) : [],
      working ? band("overdue") : none,
      working ? band("today") : none,
      working ? band("never") : none,
      working ? band("quiet") : none,
      followUpCounts(user),
      awayOn(todayRiyadh()),
    ]);

  const onLeave = away.get(user.id);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">{t("day.title")}</h1>
        <PageTabs
          screen="day"
          tab={tab}
          remembered={storedTab}
          tabs={TABS.map((value) => ({ value, href: `/day?tab=${value}` }))}
        />
      </header>

      {working ? (
        <>
          {/* The same card the manager reads, with this person's own figures —
              one layout for one set of facts, so a rep recognises his row on the
              team screen as the card on his own. First on the tab for everybody
              who carries a target (SPEC §3 P13: "at the top of the first tab,
              always visible"), because it is the frame the day is worked
              against; the six months behind it are a measurement and stay on
              Metrics (D151). This month only, with nothing to move to (D180). */}
          {month ? (
            <MonthCard
              title={t("day.myMonth")}
              target={month.target}
              achieved={month.achieved}
              pace={month.pace}
            />
          ) : null}

          {/* His own leave, said on his own screen (D75). The bands underneath are
              left exactly as they are: a customer who was promised a call on Tuesday
              is still waiting whether or not the rep was at work, and telling him
              otherwise would be a comfortable lie. What this says instead is who has
              it while he is out. */}
          {onLeave ? (
            <p className="card-face px-4 py-3 text-sm text-muted-foreground">
              {t("day.onLeave", { day: formatDay(onLeave.backOn, locale) })}
            </p>
          ) : null}

          {/* Today's cards, in the order they should be worked: what came back
              to him, then each band of calls as its own card (P13-S8). */}
          <WorkGrid>
            {/* Worst first and capped like the bands beside it (D80, D83):
                sixty-four rows before the calls is the calls buried, not shown. */}
            {hasChain ? (
              <WaitingList
                rows={waiting.slice(0, BAND_LIMIT)}
                total={waiting.length}
                counts={waitingCounts(waiting)}
              />
            ) : null}

            <CallList
              overdue={overdue}
              today={today}
              never={never}
              quiet={quiet}
              totals={counts}
            />
          </WorkGrid>
        </>
      ) : (
        <>
          {/* The six months first: they are not windowed and cannot be — the
              trend IS the six months (D61) — so they sit above the chips, and
              what the chips govern is exactly what is under them (D154). */}
          {months ? <MonthsCard months={months} personId={user.id} /> : null}

          <RangeChips
            range={range}
            remembered={storedRange}
            chips={RANGES.map((value) => ({ value, href: `/day?tab=metrics&range=${value}` }))}
          />

          {/* `items-start`: a card ends where its content ends. Stretched to the
              row's height, the short one — two rows of ratios beside a six-row
              funnel — drew a card with a block of nothing inside it, which reads
              as a card that failed to load rather than as a short answer. */}
          <div className="grid items-start gap-4 md:grid-cols-2">
            {segments ? <SegmentCard rows={segments} from={from} personId={user.id} /> : null}
            {ratios ? <RatiosCard ratios={ratios} from={from} personId={user.id} /> : null}
          </div>
        </>
      )}
    </div>
  );
}
