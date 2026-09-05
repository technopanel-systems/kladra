import { getLocale, getTranslations } from "next-intl/server";
import { CallList } from "@/components/day/call-list";
import { CloseTheDay } from "@/components/reports/close-the-day";
import { MonthCard } from "@/components/team/month-card";
import { WaitingList } from "@/components/day/waiting-list";
import { redirect } from "@/i18n/navigation";
import { homeFor, requireUser } from "@/lib/authz";
import { carriesMetres, ownsCompanies, sells } from "@/lib/floor";
import { listCompanies } from "@/lib/companies";
import { waitingOnRep } from "@/lib/day";
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

  const [t, month, waiting, overdue, today, never] = await Promise.all([
    getTranslations(),
    hasMonth ? repMonth(user.id) : null,
    hasChain ? waitingOnRep(user) : [],
    listCompanies({ user, filter: "overdue", locale }),
    listCompanies({ user, filter: "today", locale }),
    listCompanies({ user, filter: "never", locale }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("day.title")}</h1>

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
      {hasChain ? <WaitingList rows={waiting} /> : null}
      <CallList overdue={overdue} today={today} never={never} />

      {/* Last, because it is the last thing done: the report is written when
          the day is finished, not while it is being worked (D55). */}
      <CloseTheDay userId={user.id} role={user.role} />
    </div>
  );
}
