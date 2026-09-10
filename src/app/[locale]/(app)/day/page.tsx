import { getLocale, getTranslations } from "next-intl/server";
import { CallList } from "@/components/day/call-list";
import { CloseTheDay } from "@/components/reports/close-the-day";
import { MonthCard } from "@/components/team/month-card";
import { MonthsCard } from "@/components/team/months-card";
import { RatiosCard } from "@/components/team/ratios-card";
import { SegmentCard } from "@/components/team/segment-card";
import { WaitingList } from "@/components/day/waiting-list";
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
import { logTargetsFor } from "@/lib/log-targets";
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
 * It answers one question in one column, in the order the work should be done:
 * how the month is going, what has come back to him and is stopped, and who is
 * owed a call. It is deliberately not a grid of cards: every figure on it is
 * something Faisal can act on before lunch, and anything he cannot act on today
 * belongs on the manager's screen instead.
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

  // Marketing carries no target, so it gets no month card — an empty one would
  // be a figure that says the wrong thing every month (D44, P8.9). The same
  // sentence takes the waiting band off: everything that can wait on a person
  // here is a quotation or a dispatch, and marketing raises neither, so the
  // band would say "nothing waiting" every day for ever. Its day is the calls.
  const hasMonth = carriesMetres(user.role);
  const hasChain = sells(user.role);

  // Two tabs here: what he can do something about today, and what is measured
  // over a window (D151). Marketing carries no month and no chain, so it has
  // nothing to measure and gets no second tab rather than an empty one.
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
      // Only where there is a target to read them against — marketing carries
      // none, so six bars with no line on any of them would say nothing (D44).
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

  // One pair of queries for the whole screen, after the bands are known (D71).
  const targets = await logTargetsFor(
    [...overdue, ...today, ...never, ...quiet].map((row) => row.id),
  );

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
          {/* First, not last. It sat at the foot of the screen because a report
              is the last thing done, which is true and was still wrong: a rep
              who has finished his day should not scroll past three lists of
              unfinished work to write it (D151). It disappears once written. */}
          <CloseTheDay userId={user.id} role={user.role} />

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

          {/* The same card the manager reads, with this rep's own figures — one
              layout for one set of facts, so a rep recognises his row on the team
              screen as the card on his own. It stays on the working tab because
              it is the frame the day is worked against; the six months behind it
              are a measurement and moved (D151). */}
          {month ? (
            <MonthCard
              title={t("day.myMonth")}
              target={month.target}
              achieved={month.achieved}
              pace={month.pace}
            />
          ) : null}

          {/* Worst first and capped like the bands below it (D80, D83): sixty-four
              cards above the calls is the calls buried, not shown. */}
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
            targets={targets}
          />
        </>
      ) : (
        <>
          {/* The six months first: they are not windowed and cannot be — the
              trend IS the six months (D61) — so they sit above the chips, and
              what the chips govern is exactly what is under them (D154). */}
          {months ? <MonthsCard months={months} /> : null}

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
            {segments ? <SegmentCard rows={segments} /> : null}
            {ratios ? <RatiosCard ratios={ratios} /> : null}
          </div>
        </>
      )}
    </div>
  );
}
