import { getLocale, getTranslations } from "next-intl/server";
import { CallList } from "@/components/day/call-list";
import { CloseTheDay } from "@/components/reports/close-the-day";
import { MonthCard } from "@/components/team/month-card";
import { MonthsCard } from "@/components/team/months-card";
import { WaitingList } from "@/components/day/waiting-list";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser } from "@/lib/authz";
import { carriesMetres, ownsCompanies, sells } from "@/lib/floor";
import { listCompanies } from "@/lib/companies";
import { BAND_LIMIT } from "@/lib/list-size";
import { formatDay, todayRiyadh } from "@/lib/dates";
import { awayOn } from "@/lib/leave";
import { followUpCounts } from "@/lib/followups";
import { logTargetsFor } from "@/lib/log-targets";
import { waitingOnRep } from "@/lib/day";
import { monthsBack } from "@/lib/months";
import { repMonth } from "@/lib/team";

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
export default async function DayPage() {
  const [user, locale] = await Promise.all([requireUser(), getLocale()]);
  // The two roles that own companies. The coordinator has none and the manager
  // reads the team screen for the same question; either one following a link
  // here goes to their own home rather than to an empty screen (D15, S8).
  if (!ownsCompanies(user.role)) redirect({ href: homeFor(user.role), locale });

  // Marketing carries no target, so it gets no month card — an empty one would
  // be a figure that says the wrong thing every month (D44, P8.9). The same
  // sentence takes the waiting band off: everything that can wait on a person
  // here is a quotation or a dispatch, and marketing raises neither, so the
  // band would say "nothing waiting" every day for ever. Its day is the calls.
  const hasMonth = carriesMetres(user.role);
  const hasChain = sells(user.role);

  // Each band asks for what it will draw and the counts come from the one
  // follow-up definition, so a band that is longer than the screen says how
  // many there are rather than printing all of them (D80).
  const band = (filter: "overdue" | "today" | "never" | "quiet") =>
    listCompanies({ user, filter, locale, limit: BAND_LIMIT });

  const [t, month, months, waiting, overdue, today, never, quiet, counts, away] =
    await Promise.all([
      getTranslations(),
      hasMonth ? repMonth(user.id) : null,
      // Only where there is a target to read them against — marketing carries
      // none, so six bars with no line on any of them would say nothing (D44).
      hasMonth ? monthsBack(user.id) : null,
      hasChain ? waitingOnRep(user.id) : [],
      band("overdue"),
      band("today"),
      band("never"),
      band("quiet"),
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
      <h1 className="text-xl font-semibold">{t("day.title")}</h1>

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
          screen as the card on his own. */}
      {month ? (
        <MonthCard
          title={t("day.myMonth")}
          target={month.target}
          achieved={month.achieved}
          pace={month.pace}
        />
      ) : null}
      {months ? <MonthsCard months={months} /> : null}
      {hasChain ? <WaitingList rows={waiting} /> : null}
      <CallList
        overdue={overdue}
        today={today}
        never={never}
        quiet={quiet}
        totals={counts}
        targets={targets}
      />

      {/* Last, because it is the last thing done: the report is written when
          the day is finished, not while it is being worked (D55). */}
      <CloseTheDay userId={user.id} role={user.role} />
    </div>
  );
}
